import { GameState, MatchResult } from '../models';
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
