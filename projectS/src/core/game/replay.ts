import { GameState, MatchResult, Side, Tactic } from '../models';
import { deriveSeed } from '../engine/rng';
import { simulateMatch } from '../engine';
import { revertResult, applyResult } from '../season';
import { managedLeagueId } from './advance';

/**
 * "Segunda hipótese" (slot de anúncio rewarded): re-simula um jogo já jogado
 * da liga do clube gerido com uma seed diferente, revertendo o resultado
 * antigo da tabela e aplicando o novo.
 *
 * O novo resultado pode ser melhor OU pior — é uma segunda hipótese, não uma
 * vitória garantida. Determinístico: mesma tentativa → mesmo resultado.
 *
 * @returns o novo resultado, ou null se o fixture não existir/não estiver jogado.
 */
export function replayFixture(state: GameState, fixtureId: string): MatchResult | null {
  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const table = state.standings[leagueId];
  if (!schedule || !table) return null;

  const fixture = schedule.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !fixture.result) return null;

  const homeTactic = state.tactics[fixture.homeClubId];
  const awayTactic = state.tactics[fixture.awayClubId];
  if (!homeTactic || !awayTactic) return null;

  // Reverte o resultado antigo da tabela.
  revertResult(table, fixture.result);

  // Re-simula com seed derivada diferente da original.
  const newResult = simulateMatch(
    fixture.homeClubId,
    fixture.awayClubId,
    homeTactic,
    awayTactic,
    state.players,
    deriveSeed(state.meta.rngSeed, 'replay', fixtureId, fixture.result.seed),
  );

  fixture.result = newResult;
  applyResult(table, newResult);
  return newResult;
}

/**
 * Ajuste ao INTERVALO: re-simula a 2ª parte do jogo do clube gerido com uma nova
 * tática (substituições + mentalidade/ritmo). A 1ª parte fica idêntica à que o
 * jogador viu (mesma seed da jornada), reverte-se o resultado antigo da tabela e
 * aplica-se o novo. Só jogos de LIGA (os de Taça usam outra seed — devolve null,
 * a UI segue sem alteração).
 *
 * @returns o novo resultado, ou null se não aplicável.
 */
export function applyHalftime(
  state: GameState,
  fixtureId: string,
  lineup: Tactic['lineup'],
  mentality: Tactic['mentality'],
  tempo: Tactic['tempo'],
): MatchResult | null {
  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const table = state.standings[leagueId];
  if (!schedule || !table) return null;

  const fixture = schedule.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !fixture.result) return null;

  const managedId = state.meta.managedClubId;
  const managedSide: Side | null = fixture.homeClubId === managedId ? 'HOME'
    : fixture.awayClubId === managedId ? 'AWAY' : null;
  if (!managedSide) return null;

  const homeTactic = state.tactics[fixture.homeClubId];
  const awayTactic = state.tactics[fixture.awayClubId];
  if (!homeTactic || !awayTactic) return null;

  // Tática da 2ª parte para o lado gerido (o outro lado mantém-se).
  const base = managedSide === 'HOME' ? homeTactic : awayTactic;
  const h2: Tactic = { ...base, lineup, mentality, tempo };

  revertResult(table, fixture.result);
  // MESMA seed da jornada (ver season.ts playRound: baseSeed ^ round*1000003) →
  // a 1ª parte reproduz-se igual; a 2ª diverge com a nova tática.
  const baseSeed = state.meta.rngSeed ^ (fixture.round * 1000003);
  const newResult = simulateMatch(
    fixture.homeClubId, fixture.awayClubId, homeTactic, awayTactic, state.players, baseSeed,
    { side: managedSide, tactic: h2 },
  );
  fixture.result = newResult;
  applyResult(table, newResult);
  return newResult;
}
