/**
 * Liga / competição. O calendário e a tabela classificativa detalham-se na ETAPA 3;
 * aqui fica só a estrutura de dados persistida.
 */
export interface League {
  id: string;
  name: string;
  country: string; // ISO-3166 alpha-3
  tier: number; // 1 = primeiro escalão
  clubIds: string[];
}

/** Uma linha da tabela classificativa. Derivada dos resultados, mas persistida em cache. */
export interface StandingRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export function goalDifference(row: StandingRow): number {
  return row.goalsFor - row.goalsAgainst;
}
