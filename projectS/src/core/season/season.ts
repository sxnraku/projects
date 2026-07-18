import {
  Fixture,
  fixturesOfRound,
  Player,
  Schedule,
  StandingRow,
  Tactic,
} from '../models';
import { simulateMatch } from '../engine';
import { applyResult } from './standings';

/** Dependências que o motor precisa para simular uma jornada. */
export interface SeasonContext {
  players: Record<string, Player>; // todos os jogadores relevantes
  tactics: Record<string, Tactic>; // tática por clubId
  baseSeed: number; // seed-mãe do GameState
}

/**
 * Simula todos os jogos por simular de uma jornada, aplicando os resultados
 * à tabela fornecida. Muta os Fixtures (result) e a tabela (linhas).
 * Devolve os jogos que foram simulados nesta chamada.
 *
 * Ignora jogos já simulados (result != null) — seguro chamar de novo.
 */
export function playRound(
  schedule: Schedule,
  round: number,
  table: Record<string, StandingRow>,
  ctx: SeasonContext,
): Fixture[] {
  const played: Fixture[] = [];

  for (const fx of fixturesOfRound(schedule, round)) {
    if (fx.result !== null) continue;

    const homeTactic = ctx.tactics[fx.homeClubId];
    const awayTactic = ctx.tactics[fx.awayClubId];
    if (!homeTactic || !awayTactic) {
      throw new Error(`Tática em falta para ${fx.homeClubId} ou ${fx.awayClubId}`);
    }

    const result = simulateMatch(
      fx.homeClubId,
      fx.awayClubId,
      homeTactic,
      awayTactic,
      ctx.players,
      // Deriva por jornada+jogo para que cada partida seja única e reproduzível.
      ctx.baseSeed ^ (round * 1000003),
    );

    fx.result = result;
    applyResult(table, result);
    played.push(fx);
  }

  return played;
}

/** Simula a época inteira jornada a jornada. Devolve o nº total de jogos simulados. */
export function playFullSeason(
  schedule: Schedule,
  table: Record<string, StandingRow>,
  ctx: SeasonContext,
): number {
  let count = 0;
  for (let round = 1; round <= schedule.totalRounds; round++) {
    count += playRound(schedule, round, table, ctx).length;
  }
  return count;
}
