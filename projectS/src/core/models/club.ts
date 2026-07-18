/** Níveis das instalações do clube (1..5). Cada uma tem efeito real no jogo. */
export interface Facilities {
  stadium: number; // upgrades aumentam a capacidade (receita de bilheteira)
  training: number; // acelera a evolução dos jogadores no treino
  academy: number; // melhora a qualidade da fornada anual de jovens
  medical: number; // encurta o tempo de recuperação de lesões
}

export const FACILITY_MAX_LEVEL = 5;

export function defaultFacilities(): Facilities {
  return { stadium: 1, training: 1, academy: 1, medical: 1 };
}

/**
 * Clube. Os jogadores referenciam o clube por id (relação plana, lookup O(1)).
 * Finanças e tática vivem em entidades separadas ligadas por clubId,
 * para saves incrementais e queries SQLite mais simples.
 */
export interface Club {
  id: string;
  name: string;
  shortName: string; // ex: "SLB"
  country: string; // ISO-3166 alpha-3
  leagueId: string;

  // Identidade visual (para a UI da ETAPA 5)
  primaryColor: string; // hex
  secondaryColor: string; // hex

  // Infraestrutura — influencia receitas e treino (ETAPA 4)
  stadiumName: string;
  stadiumCapacity: number;
  reputation: number; // 1..100, afeta mercado e patrocínios
  facilities: Facilities;

  // Plantel: ids dos jogadores. A fonte de verdade é Player.clubId;
  // esta lista é um índice derivado para acesso rápido ao plantel.
  squad: string[];
}
