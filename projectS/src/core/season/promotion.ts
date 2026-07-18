import { GameState } from '../models';
import { sortStandings } from './standings';

export const PROMOTED_PER_TIER = 2; // sobem os 2 primeiros
export const RELEGATED_PER_TIER = 2; // descem os 2 últimos

/** Movimento de um clube entre divisões no fim da época. */
export interface TierMove {
  clubId: string;
  fromLeagueId: string;
  toLeagueId: string;
  direction: 'UP' | 'DOWN';
}

/**
 * Processa promoções e despromoções entre divisões consecutivas.
 * Os 2 últimos do tier N trocam com os 2 primeiros do tier N+1.
 * Muta League.clubIds e Club.leagueId. Devolve os movimentos efetuados.
 *
 * Chamar no rollover ANTES de regenerar calendários/tabelas.
 */
export function processPromotions(state: GameState): TierMove[] {
  const leagues = Object.values(state.leagues).sort((a, b) => a.tier - b.tier);
  const moves: TierMove[] = [];

  for (let i = 0; i < leagues.length - 1; i++) {
    const upper = leagues[i]!;
    const lower = leagues[i + 1]!;

    const upperTable = state.standings[upper.id];
    const lowerTable = state.standings[lower.id];
    if (!upperTable || !lowerTable) continue;

    const name = (id: string) => state.clubs[id]?.name ?? id;
    const upperSorted = sortStandings(upperTable, name);
    const lowerSorted = sortStandings(lowerTable, name);

    const relegated = upperSorted.slice(-RELEGATED_PER_TIER).map((r) => r.clubId);
    const promoted = lowerSorted.slice(0, PROMOTED_PER_TIER).map((r) => r.clubId);

    // Troca as filiações.
    for (const clubId of relegated) {
      upper.clubIds = upper.clubIds.filter((id) => id !== clubId);
      lower.clubIds.push(clubId);
      const club = state.clubs[clubId];
      if (club) club.leagueId = lower.id;
      moves.push({ clubId, fromLeagueId: upper.id, toLeagueId: lower.id, direction: 'DOWN' });
    }
    for (const clubId of promoted) {
      lower.clubIds = lower.clubIds.filter((id) => id !== clubId);
      upper.clubIds.push(clubId);
      const club = state.clubs[clubId];
      if (club) club.leagueId = upper.id;
      moves.push({ clubId, fromLeagueId: lower.id, toLeagueId: upper.id, direction: 'UP' });
    }
  }

  return moves;
}

/** Posição final de um clube na sua liga (1-indexada). 0 se não encontrado. */
export function finalPosition(state: GameState, leagueId: string, clubId: string): number {
  const table = state.standings[leagueId];
  if (!table) return 0;
  const sorted = sortStandings(table, (id) => state.clubs[id]?.name ?? id);
  return sorted.findIndex((r) => r.clubId === clubId) + 1;
}
