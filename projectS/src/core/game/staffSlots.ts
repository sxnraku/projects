/**
 * Vagas de treino individual — a ponte entre o adjunto e o plantel.
 *
 * Ficheiro à parte (e não dentro de `staffOps`) para o `training` poder pedir o
 * limite sem arrastar o módulo de contratações atrás, e para não haver ciclo de
 * imports entre treino e staff.
 */
import { GameState } from '../models';
import { individualSlots } from '../staff';
import { setIndividualFocus, TrainingFocus } from '../training';

export { clearIndividualFocus, individualFocus, usedSlots } from '../training';

/** Quantos planos individuais o clube gerido aguenta agora. */
export function individualSlotsFor(state: GameState): number {
  return individualSlots(state.career.staff ?? []);
}

/**
 * Define o plano individual de um jogador do clube gerido.
 * `focus = null` devolve-o ao plano da equipa.
 */
export function setPlayerTraining(
  state: GameState,
  playerId: string,
  focus: TrainingFocus | null,
) {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'training.individual.invalid' };
  const club = state.clubs[state.meta.managedClubId];
  if (!club || player.clubId !== club.id) {
    return { ok: false, errorKey: 'training.individual.notOurs' };
  }
  const squad = club.squad.map((id) => state.players[id]);
  return setIndividualFocus(player, focus, squad, individualSlotsFor(state));
}
