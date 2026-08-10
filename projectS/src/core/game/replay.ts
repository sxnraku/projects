import { GameState, MatchResult, Side, Tactic } from '../models';
import { deriveSeed } from '../engine/rng';
import { simulateMatch, TacticChange } from '../engine';
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

/** Um ajuste em jogo: onze/mentalidade/ritmo a entrar em vigor a partir de `minute`. */
export interface MatchAdjustment {
  minute: number; // 45 = intervalo; qualquer minuto durante a reprodução
  lineup: Tactic['lineup'];
  mentality: Tactic['mentality'];
  tempo: Tactic['tempo'];
}

/**
 * Ajustes EM JOGO (intervalo e substituições ao vivo): re-simula o jogo do clube
 * gerido aplicando, por ordem, cada mudança de tática no seu minuto. Os minutos já
 * vistos ficam idênticos (mesma seed da jornada); só o que vem depois de cada
 * mudança diverge. Reverte-se o resultado antigo da tabela e aplica-se o novo. Só
 * jogos de LIGA (os de Taça usam outra seed — devolve null, a UI segue sem mexer).
 *
 * As mudanças são CUMULATIVAS: cada `lineup` é o onze completo naquele momento, por
 * iso substituir ao 45' e depois ao 60' mantém as trocas anteriores.
 *
 * @returns o novo resultado, ou null se não aplicável.
 */
export function applyMatchChanges(
  state: GameState,
  fixtureId: string,
  adjustments: MatchAdjustment[],
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

  // Cada ajuste vira uma mudança de tática do lado gerido (o outro lado mantém-se).
  const base = managedSide === 'HOME' ? homeTactic : awayTactic;
  const changes: TacticChange[] = adjustments.map((a) => ({
    side: managedSide,
    tactic: { ...base, lineup: a.lineup, mentality: a.mentality, tempo: a.tempo },
    minute: a.minute,
  }));

  revertResult(table, fixture.result);
  // MESMA seed da jornada (ver season.ts playRound: baseSeed ^ round*1000003) →
  // os minutos antes de cada corte reproduzem-se iguais; o resto diverge.
  const baseSeed = state.meta.rngSeed ^ (fixture.round * 1000003);
  const newResult = simulateMatch(
    fixture.homeClubId, fixture.awayClubId, homeTactic, awayTactic, state.players, baseSeed,
    changes,
  );
  fixture.result = newResult;
  applyResult(table, newResult);
  return newResult;
}
