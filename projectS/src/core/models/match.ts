/**
 * Modelo de uma partida e do seu resultado.
 * O motor de simulação (core/engine) produz um MatchResult a partir de duas táticas.
 */

/** Tipos de evento que o motor regista, minuto a minuto. */
export const MatchEventType = {
  KICKOFF: 'KICKOFF',
  GOAL: 'GOAL',
  CHANCE: 'CHANCE', // oportunidade falhada
  SAVE: 'SAVE', // defesa do guarda-redes
  YELLOW_CARD: 'YELLOW_CARD',
  RED_CARD: 'RED_CARD',
  INJURY: 'INJURY',
  HALF_TIME: 'HALF_TIME',
  FULL_TIME: 'FULL_TIME',
} as const;
export type MatchEventType = (typeof MatchEventType)[keyof typeof MatchEventType];

/** Qual das equipas — mando de campo. */
export const Side = {
  HOME: 'HOME',
  AWAY: 'AWAY',
} as const;
export type Side = (typeof Side)[keyof typeof Side];

/** Um acontecimento na partida, com minuto e (quando aplica) jogador envolvido. */
export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: Side | null; // null para eventos neutros (HALF_TIME, FULL_TIME)
  playerId: string | null;
  text: string; // descrição em texto para a UI/log
}

/** Agregados por equipa no fim da partida. */
export interface MatchTeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  possession: number; // percentagem 0..100
  xg: number; // golos esperados (soma da qualidade dos lances), 2 casas decimais
}

/** Resultado completo de uma partida simulada. */
export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  home: MatchTeamStats;
  away: MatchTeamStats;
  events: MatchEvent[];
  seed: number; // seed usada — permite reproduzir a mesma partida
}

/** Vencedor, ou null em empate. */
export function winnerSide(r: MatchResult): Side | null {
  if (r.home.goals > r.away.goals) return 'HOME';
  if (r.away.goals > r.home.goals) return 'AWAY';
  return null;
}
