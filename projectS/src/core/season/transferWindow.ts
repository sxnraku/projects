/**
 * Janelas de mercado.
 *
 * Com o mercado aberto o ano inteiro perde-se toda a urgência: uma má série
 * corrigia-se a meio da época com contratações. Assim há dois blocos —
 * pré-época e mercado de inverno — e fora deles só se pode observar.
 */

/** Jornadas (inclusive) em que o mercado está aberto. */
export const SUMMER_WINDOW = { from: 1, to: 5 };
export const WINTER_WINDOW_LENGTH = 3;

export interface WindowState {
  open: boolean;
  label: string;
  /** Jornada em que a próxima janela abre (null se já está aberta ou acabaram). */
  opensAtRound: number | null;
}

/**
 * Estado do mercado numa dada jornada.
 * A janela de inverno abre a meio da época e dura WINTER_WINDOW_LENGTH jornadas.
 */
export function transferWindow(round: number, totalRounds: number): WindowState {
  if (round >= SUMMER_WINDOW.from && round <= SUMMER_WINDOW.to) {
    return { open: true, label: 'Mercado de verão aberto', opensAtRound: null };
  }

  const winterFrom = Math.max(SUMMER_WINDOW.to + 1, Math.floor(totalRounds / 2));
  const winterTo = winterFrom + WINTER_WINDOW_LENGTH - 1;

  if (round >= winterFrom && round <= winterTo) {
    return { open: true, label: 'Mercado de inverno aberto', opensAtRound: null };
  }

  if (round < winterFrom) {
    return { open: false, label: 'Mercado fechado', opensAtRound: winterFrom };
  }

  return { open: false, label: 'Mercado fechado até à próxima época', opensAtRound: null };
}
