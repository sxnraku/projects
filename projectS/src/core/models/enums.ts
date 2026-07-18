// Enumerações e constantes partilhadas do modelo de dados.
// Mantidas como `const` + union types para serem leves e serializáveis (SQLite/JSON).

/** Posições no campo. Usadas para tática, cálculo de overall e IA de seleção. */
export const Position = {
  GK: 'GK', // Guarda-redes
  RB: 'RB', // Lateral direito
  CB: 'CB', // Defesa central
  LB: 'LB', // Lateral esquerdo
  DM: 'DM', // Médio defensivo
  CM: 'CM', // Médio centro
  AM: 'AM', // Médio ofensivo
  RW: 'RW', // Extremo direito
  LW: 'LW', // Extremo esquerdo
  ST: 'ST', // Ponta de lança
} as const;
export type Position = (typeof Position)[keyof typeof Position];

/** Grupos de posição — úteis para pesos de overall e lógica de mercado. */
export const PositionGroup = {
  GOALKEEPER: 'GOALKEEPER',
  DEFENCE: 'DEFENCE',
  MIDFIELD: 'MIDFIELD',
  ATTACK: 'ATTACK',
} as const;
export type PositionGroup = (typeof PositionGroup)[keyof typeof PositionGroup];

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'GOALKEEPER',
  RB: 'DEFENCE',
  CB: 'DEFENCE',
  LB: 'DEFENCE',
  DM: 'MIDFIELD',
  CM: 'MIDFIELD',
  AM: 'MIDFIELD',
  RW: 'ATTACK',
  LW: 'ATTACK',
  ST: 'ATTACK',
};

/** Pé preferido. */
export const Foot = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  BOTH: 'BOTH',
} as const;
export type Foot = (typeof Foot)[keyof typeof Foot];

/** Estado de disponibilidade do jogador. */
export const PlayerStatus = {
  AVAILABLE: 'AVAILABLE',
  INJURED: 'INJURED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus];

/** Limites dos atributos — escala 1..20 (estilo Football Manager simplificado). */
export const ATTR_MIN = 1;
export const ATTR_MAX = 20;

/** Limites de escala 1..100 usados para moral, forma e condição física. */
export const PCT_MIN = 0;
export const PCT_MAX = 100;
