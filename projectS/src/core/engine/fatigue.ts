import { Tactic, Tempo } from '../models';

/** FIT recuperado por semana de treino normal (espelha `FITNESS_RECOVERY.NORMAL`). */
export const WEEKLY_RECOVERY = 12;

/**
 * Custo físico de uma tática.
 *
 * O desgaste tem de ser VISÍVEL antes do jogo, não uma surpresa na semana
 * seguinte: pressão alta + ritmo rápido ganham jogos isolados mas estoiram o
 * plantel a médio prazo. Esta função é a fonte única de verdade — o motor de
 * simulação (advanceWeek) e o ecrã de Tática leem exatamente o mesmo número.
 */

/** Fitness perdido por um titular num jogo com tática neutra. */
export const BASE_MATCH_FATIGUE = 18;

const TEMPO_FATIGUE: Record<Tempo, number> = { SLOW: -2, NORMAL: 0, FAST: 3 };

type LoadInput = Pick<Tactic, 'pressing' | 'tempo'>;

/** Fitness que um titular perde por jogo, dada a tática escolhida. */
export function matchFatigue(tactic: LoadInput): number {
  return Math.max(
    6,
    Math.round(BASE_MATCH_FATIGUE + (tactic.pressing - 5) * 1.2 + TEMPO_FATIGUE[tactic.tempo]),
  );
}

export const PhysicalLoad = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  VERY_HIGH: 'VERY_HIGH',
} as const;
export type PhysicalLoad = (typeof PhysicalLoad)[keyof typeof PhysicalLoad];

export interface LoadReport {
  level: PhysicalLoad;
  /** Fitness perdido por jogo com esta tática. */
  fatigue: number;
  /** Variação face à tática neutra, em % (ex.: +25). */
  deltaPct: number;
  /** FIT recuperado numa semana de treino normal (o outro lado da conta). */
  recovery: number;
  /**
   * Saldo REAL por jornada: desgaste do jogo menos a recuperação da semana.
   *
   * A UI mostrava "+33% por jogo" num sítio e "−24 FIT" noutro, e o jogador via
   * o plantel perder ~10% — três números diferentes para a mesma coisa. Este é
   * o único que o utilizador sente.
   */
  net: number;
  label: string;
}

/** Traduz a tática num aviso de carga física para a UI. */
export function physicalLoad(tactic: LoadInput): LoadReport {
  const fatigue = matchFatigue(tactic);
  const deltaPct = Math.round((fatigue / BASE_MATCH_FATIGUE - 1) * 100);

  const level: PhysicalLoad =
    deltaPct >= 20 ? 'VERY_HIGH'
      : deltaPct >= 8 ? 'HIGH'
      : deltaPct <= -8 ? 'LOW'
      : 'NORMAL';

  const label = {
    LOW: 'Baixo',
    NORMAL: 'Normal',
    HIGH: 'Alto',
    VERY_HIGH: 'Muito alto',
  }[level];

  const recovery = WEEKLY_RECOVERY;
  return { level, fatigue, deltaPct, recovery, net: fatigue - recovery, label };
}
