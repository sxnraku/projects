/**
 * Modelo de uma partida e do seu resultado.
 * O motor de simulação (core/engine) produz um MatchResult a partir de duas táticas.
 */

/** Tipos de evento que o motor regista, minuto a minuto. */
export const MatchEventType = {
  KICKOFF: 'KICKOFF',
  GOAL: 'GOAL',
  ASSIST: 'ASSIST', // passe para golo (mesmo minuto do golo)
  CHANCE: 'CHANCE', // oportunidade falhada
  SAVE: 'SAVE', // defesa do guarda-redes
  YELLOW_CARD: 'YELLOW_CARD',
  RED_CARD: 'RED_CARD', // gerado ao 2º amarelo do mesmo jogador
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

/**
 * Origem do lance. Opcional de propósito: um evento sem `detail` é jogada
 * corrida, que é como todos os eventos gravados antes das bolas paradas se
 * comportam. A UI usa isto para o ícone e para o texto do lance.
 */
export const MatchEventDetail = {
  FREE_KICK: 'FREE_KICK',
  CORNER: 'CORNER',
  HEADER: 'HEADER',
} as const;
export type MatchEventDetail = (typeof MatchEventDetail)[keyof typeof MatchEventDetail];

/** Um acontecimento na partida, com minuto e (quando aplica) jogador envolvido. */
export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: Side | null; // null para eventos neutros (HALF_TIME, FULL_TIME)
  playerId: string | null;
  text: string; // descrição em texto para a UI/log
  detail?: MatchEventDetail;
}

/** Agregados por equipa no fim da partida. */
export interface MatchTeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  possession: number; // percentagem 0..100
  xg: number; // golos esperados (soma da qualidade dos lances), 2 casas decimais
}

/** Estatística individual de um jogador NESTA partida. */
export interface PlayerMatchStat {
  goals: number;
  assists: number;
  yellow: number; // nº de amarelos (2 → expulso)
  red: boolean; // expulso?
  rating: number; // nota 0–10 (1 casa decimal)
}

/** Resultado completo de uma partida simulada. */
export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  home: MatchTeamStats;
  away: MatchTeamStats;
  events: MatchEvent[];
  seed: number; // seed usada — permite reproduzir a mesma partida
  /** Estatística por jogador (id → stat). Opcional: saves antigos não a têm. */
  playerStats?: Record<string, PlayerMatchStat>;
  /** Homem do jogo (playerId da melhor nota). Opcional em saves antigos. */
  motm?: string | null;
  /**
   * CONTEXTO com que este jogo foi simulado (dérbi, apoio da bancada).
   *
   * Guarda-se porque as re-simulações — a "segunda hipótese" e cada
   * substituição ao vivo — têm de reproduzir os minutos JÁ VISTOS exatamente
   * como foram. O apoio dos adeptos muda no fecho da semana; se o replay o
   * fosse buscar ao estado ATUAL, o primeiro tempo que o utilizador acabou de
   * ver mudava por baixo dele. Opcional: saves antigos entram sem contexto e
   * comportam-se como sempre se comportaram.
   */
  ctx?: {
    derby?: boolean;
    homeSupport?: number;
    homePlan?: import('./tactic').OppositionPlan;
    awayPlan?: import('./tactic').OppositionPlan;
  };
}

/** Vencedor, ou null em empate. */
export function winnerSide(r: MatchResult): Side | null {
  if (r.home.goals > r.away.goals) return 'HOME';
  if (r.away.goals > r.home.goals) return 'AWAY';
  return null;
}
