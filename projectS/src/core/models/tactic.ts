import { Position } from './enums';

/** Formações suportadas. A string codifica a distribuição defesa-meio-ataque. */
export const Formation = {
  F_4_4_2: '4-4-2',
  F_4_3_3: '4-3-3',
  F_4_2_3_1: '4-2-3-1',
  F_3_5_2: '3-5-2',
  F_5_3_2: '5-3-2',
  F_4_5_1: '4-5-1',
} as const;
export type Formation = (typeof Formation)[keyof typeof Formation];

/** Mentalidade da equipa — afeta pesos ataque/defesa no motor de partida. */
export const Mentality = {
  DEFENSIVE: 'DEFENSIVE',
  BALANCED: 'BALANCED',
  ATTACKING: 'ATTACKING',
} as const;
export type Mentality = (typeof Mentality)[keyof typeof Mentality];

/** Ritmo de jogo — afeta desgaste (fitness) e número de ações. */
export const Tempo = {
  SLOW: 'SLOW',
  NORMAL: 'NORMAL',
  FAST: 'FAST',
} as const;
export type Tempo = (typeof Tempo)[keyof typeof Tempo];

/** Um slot do onze inicial: posição no campo + jogador atribuído. */
export interface LineupSlot {
  position: Position;
  playerId: string;
}

/** Escala dos sliders táticos: 0..10, 5 = neutro. */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 10;
export const SLIDER_NEUTRAL = 5;

/**
 * Tática de um clube. Guardada por clube e editável antes de cada jornada.
 * O motor de partida (ETAPA 2) consome este objeto.
 *
 * Sliders (0..10, 5 = neutro) — todos lidos pelo motor:
 *  - pressing: mais pressão = mais lances criados e mais cartões/fadiga.
 *  - defensiveLine: linha alta = meio-campo mais forte, mas golos sofridos
 *    mais fáceis quando a defesa é batida.
 *  - creativity: mais criatividade = remates mais perigosos, mas mais perdas
 *    de bola (lances do adversário).
 */
export interface Tactic {
  clubId: string;
  formation: Formation;
  mentality: Mentality;
  tempo: Tempo;

  pressing: number; // 0..10
  defensiveLine: number; // 0..10
  creativity: number; // 0..10

  lineup: LineupSlot[]; // 11 slots
  bench: string[]; // ids dos suplentes
  captainId: string | null;
  penaltyTakerId: string | null;
}

/** Validação mínima — o onze deve ter exatamente 11 jogadores. */
export function isValidLineup(t: Tactic): boolean {
  const ids = t.lineup.map((s) => s.playerId);
  const unique = new Set(ids);
  return t.lineup.length === 11 && unique.size === 11;
}
