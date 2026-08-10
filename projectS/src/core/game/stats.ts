/**
 * Estatísticas da LIGA — melhores marcadores, assistências e o "onze da época"
 * (por média de nota). Puro: lê os totalizadores de época dos jogadores.
 */
import { GameState, Player, POSITION_GROUP, PositionGroup } from '../models';

export interface StatEntry {
  playerId: string;
  clubId: string;
  value: number; // golos / assistências / nota média (×10 arredondada nas notas)
}

export interface TeamOfSeasonSlot {
  playerId: string;
  clubId: string;
  group: PositionGroup;
  rating: number; // média de nota (1 casa)
}

export interface LeagueStats {
  scorers: StatEntry[];
  assisters: StatEntry[];
  teamOfSeason: TeamOfSeasonSlot[];
}

/** Média de nota da época (–1 se ainda não tem jogos suficientes). */
function avgRating(p: Player, minApps: number): number {
  const apps = p.condition.seasonApps ?? 0;
  if (apps < minApps) return -1;
  return (p.condition.seasonRating ?? 0) / apps;
}

/**
 * Estatísticas de uma liga. `topN` = quantos marcadores/assistentes listar.
 * O onze da época segue um 4-3-3 (1 GR, 4 DEF, 3 MED, 3 ATA) pelas melhores
 * médias de nota, com um mínimo de jogos para contar.
 */
export function leagueStats(state: GameState, leagueId: string, topN = 10): LeagueStats {
  const league = state.leagues[leagueId];
  if (!league) return { scorers: [], assisters: [], teamOfSeason: [] };
  const clubIds = new Set(league.clubIds);
  const players = Object.values(state.players).filter((p): p is Player => !!p.clubId && clubIds.has(p.clubId));

  const scorers = players
    .filter((p) => (p.condition.seasonGoals ?? 0) > 0)
    .sort((a, b) => (b.condition.seasonGoals ?? 0) - (a.condition.seasonGoals ?? 0)
      || (b.condition.seasonAssists ?? 0) - (a.condition.seasonAssists ?? 0))
    .slice(0, topN)
    .map((p) => ({ playerId: p.id, clubId: p.clubId!, value: p.condition.seasonGoals ?? 0 }));

  const assisters = players
    .filter((p) => (p.condition.seasonAssists ?? 0) > 0)
    .sort((a, b) => (b.condition.seasonAssists ?? 0) - (a.condition.seasonAssists ?? 0))
    .slice(0, topN)
    .map((p) => ({ playerId: p.id, clubId: p.clubId!, value: p.condition.seasonAssists ?? 0 }));

  // Onze da época — mínimo de jogos = ~1/3 das jornadas já disputadas (mín. 3).
  const totalRounds = state.schedules[leagueId]?.totalRounds ?? 30;
  const minApps = Math.max(3, Math.floor(totalRounds / 4));
  const byGroup: Record<PositionGroup, { p: Player; r: number }[]> = {
    GOALKEEPER: [], DEFENCE: [], MIDFIELD: [], ATTACK: [],
  };
  for (const p of players) {
    const r = avgRating(p, minApps);
    if (r < 0) continue;
    byGroup[POSITION_GROUP[p.positions[0]!]].push({ p, r });
  }
  const shape: Record<PositionGroup, number> = { GOALKEEPER: 1, DEFENCE: 4, MIDFIELD: 3, ATTACK: 3 };
  const teamOfSeason: TeamOfSeasonSlot[] = [];
  (['GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'] as PositionGroup[]).forEach((g) => {
    byGroup[g].sort((a, b) => b.r - a.r);
    for (const { p, r } of byGroup[g].slice(0, shape[g])) {
      teamOfSeason.push({ playerId: p.id, clubId: p.clubId!, group: g, rating: Math.round(r * 10) / 10 });
    }
  });

  return { scorers, assisters, teamOfSeason };
}
