/**
 * TREINO INDIVIDUAL — trabalhar um jogador à parte do plano da equipa.
 *
 * O plano de equipa é um foco só para 25 pessoas: serve o plantel médio e não
 * serve ninguém em particular. Um miúdo de 17 anos que precisa de físico não
 * devia obrigar o plantel inteiro a levantar pesos. Aqui cada jogador pode ter
 * o seu plano, com duas consequências reais:
 *
 *  - **Ganha atenção**: `INDIVIDUAL_GROWTH_BONUS` a mais na hipótese de evoluir.
 *  - **Perde variedade**: passa a crescer SÓ na área escolhida. Pôr um extremo
 *    técnico a fazer musculação faz mesmo mal ao overall dele.
 *
 * O número de planos ao mesmo tempo é limitado pela EQUIPA TÉCNICA — um
 * treinador sozinho não acompanha vinte planos. É o que liga esta funcionalidade
 * ao backroom (`core/staff`).
 */
import { Player } from '../models';
import { TrainingFocus } from './training';

/** Empurrão na hipótese de evoluir por ter plano próprio. */
export const INDIVIDUAL_GROWTH_BONUS = 0.04;

/** Planos individuais sem equipa técnica nenhuma. */
export const BASE_INDIVIDUAL_SLOTS = 2;

/** True se a string guardada é um foco de treino válido. */
export function isTrainingFocus(value: unknown): value is TrainingFocus {
  return value === 'PHYSICAL' || value === 'TECHNICAL' || value === 'TACTICAL' || value === 'RECOVERY';
}

/** O plano individual deste jogador, ou null se segue a equipa. */
export function individualFocus(player: Player): TrainingFocus | null {
  const f = player.condition.trainingFocus;
  return isTrainingFocus(f) ? f : null;
}

/** Quantos jogadores do plantel têm plano próprio. */
export function usedSlots(players: (Player | undefined)[]): number {
  let n = 0;
  for (const p of players) if (p && individualFocus(p)) n++;
  return n;
}

export interface FocusResult {
  ok: boolean;
  /** Chave i18n do erro (a UI traduz). */
  errorKey?: string;
  params?: import('../i18n').MsgParams;
}

/**
 * Define (ou limpa, com `null`) o plano individual de um jogador.
 * `slots` = quantos planos o clube aguenta ao mesmo tempo (ver `core/staff`).
 */
export function setIndividualFocus(
  player: Player,
  focus: TrainingFocus | null,
  squad: (Player | undefined)[],
  slots: number,
): FocusResult {
  if (focus === null) {
    delete player.condition.trainingFocus;
    return { ok: true };
  }
  if (!isTrainingFocus(focus)) return { ok: false, errorKey: 'training.individual.invalid' };

  // Trocar o foco de quem já tem plano não ocupa uma vaga nova.
  if (!individualFocus(player) && usedSlots(squad) >= slots) {
    return {
      ok: false,
      errorKey: 'training.individual.noSlots',
      params: { slots: String(slots) },
    };
  }
  player.condition.trainingFocus = focus;
  return { ok: true };
}

/** Tira o plano a quem já não pertence ao plantel do clube gerido. */
export function clearIndividualFocus(player: Player): void {
  delete player.condition.trainingFocus;
}
