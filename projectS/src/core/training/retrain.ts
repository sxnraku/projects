import { GameState, isNaturalPosition, POSITION_GROUP, Position } from '../models';

/**
 * RECONVERSÃO DE POSIÇÃO — treinar um jogador para passar a atuar noutra
 * posição (como o modo carreira do FIFA).
 *
 * Sem isto, a única forma de tapar um buraco no onze era escalar alguém fora da
 * posição e comer a penalização para sempre. Agora há uma decisão de médio
 * prazo: investir semanas de treino para o jogador ficar mesmo NATURAL ali —
 * e, em troca, a penalização por jogar fora de posição pode ser mais dura.
 *
 * Uma reconversão de cada vez por jogador; ao terminar, a nova posição entra em
 * `player.positions` (fica natural) e a original mantém-se.
 */

/** Semanas base de uma reconversão dentro do mesmo setor (ex.: CB → LB). */
export const RETRAIN_WEEKS_SAME_GROUP = 8;
/** Mudar de setor (ex.: médio → avançado) é bastante mais demorado. */
export const RETRAIN_WEEKS_OTHER_GROUP = 14;
/** Desconto para jovens — ainda estão a formar-se. */
export const RETRAIN_YOUTH_DISCOUNT = 3;
export const RETRAIN_YOUTH_MAX_AGE = 23;

export interface RetrainResult {
  ok: boolean;
  weeks?: number;
  errorKey?: string;
}

/** Semanas que a reconversão deste jogador para esta posição vai demorar. */
export function retrainWeeks(age: number, from: Position, to: Position): number {
  const base = POSITION_GROUP[from] === POSITION_GROUP[to]
    ? RETRAIN_WEEKS_SAME_GROUP
    : RETRAIN_WEEKS_OTHER_GROUP;
  const discount = age <= RETRAIN_YOUTH_MAX_AGE ? RETRAIN_YOUTH_DISCOUNT : 0;
  return Math.max(4, base - discount);
}

/** Começa a reconversão de um jogador do clube gerido. Muta o estado. */
export function startRetraining(state: GameState, playerId: string, position: Position): RetrainResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'retrain.err.invalid' };
  if (player.clubId !== state.meta.managedClubId) return { ok: false, errorKey: 'retrain.err.notYours' };
  if (player.condition.loanOwnerId) return { ok: false, errorKey: 'retrain.err.loan' };
  if (isNaturalPosition(player, position)) return { ok: false, errorKey: 'retrain.err.already' };
  if (player.condition.retraining) return { ok: false, errorKey: 'retrain.err.busy' };

  const weeks = retrainWeeks(player.age, player.positions[0]!, position);
  player.condition.retraining = { position, weeksLeft: weeks };
  return { ok: true, weeks };
}

/** Cancela a reconversão em curso (perde o progresso). */
export function cancelRetraining(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (player) player.condition.retraining = undefined;
}

/** Uma reconversão que acabou esta semana (para notícia/nota do plantel). */
export interface RetrainDone { playerId: string; playerName: string; position: Position }

/**
 * Avança uma semana em todas as reconversões em curso. Chamar uma vez por
 * `advanceWeek`. Devolve as que ficaram concluídas.
 */
export function tickRetraining(state: GameState): RetrainDone[] {
  const done: RetrainDone[] = [];
  for (const player of Object.values(state.players)) {
    const r = player.condition.retraining;
    if (!r) continue;
    r.weeksLeft -= 1;
    if (r.weeksLeft > 0) continue;
    player.condition.retraining = undefined;
    if (!player.positions.includes(r.position)) player.positions.push(r.position);
    done.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      position: r.position,
    });
  }
  return done;
}
