import {
  computeOverall,
  Formation,
  LineupSlot,
  Player,
  Position,
  Tactic,
} from '../models';

/** Distribuição de posições por formação. A ordem define os slots do onze. */
export const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'AM', 'RW', 'LW', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'DM', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'ST', 'ST'],
  '4-5-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'CM', 'LW', 'ST'],
};

/**
 * Escolhe automaticamente o melhor onze para uma formação, a partir do plantel.
 *
 * Guloso: para cada slot (na ordem da formação), escolhe o jogador disponível
 * com maior overall NESSA posição que ainda não foi usado. Simples, rápido e
 * suficiente para IA de clubes e para um onze inicial por defeito.
 */
export function autoPickLineup(
  clubId: string,
  squadIds: string[],
  players: Record<string, Player>,
  formation: Formation = Formation.F_4_3_3,
): Tactic {
  const positions = FORMATION_POSITIONS[formation];
  const used = new Set<string>();
  const lineup: LineupSlot[] = [];

  for (const position of positions) {
    let bestId: string | null = null;
    let bestRating = -1;
    for (const id of squadIds) {
      if (used.has(id)) continue;
      const p = players[id];
      if (!p || p.condition.status !== 'AVAILABLE') continue;
      const rating = computeOverall(p.attributes, position);
      if (rating > bestRating) { bestRating = rating; bestId = id; }
    }
    if (bestId) { used.add(bestId); lineup.push({ position, playerId: bestId }); }
  }

  const bench = squadIds.filter((id) => !used.has(id)).slice(0, 7);
  const captainId = lineup.length > 0
    ? [...lineup].sort((a, b) => overallOf(b, players) - overallOf(a, players))[0]!.playerId
    : null;

  return {
    clubId,
    formation,
    mentality: 'BALANCED',
    tempo: 'NORMAL',
    pressing: 5,
    defensiveLine: 5,
    creativity: 5,
    lineup,
    bench,
    captainId,
    penaltyTakerId: bestPenaltyTaker(lineup, players),
  };
}

/**
 * Garante que o onze de um clube só contém jogadores do seu plantel atual.
 * Se algum slot referenciar um jogador que já saiu (vendido/livre), volta a
 * escolher o melhor onze na formação atual. Muta o estado (a tática do clube).
 */
export function ensureValidLineup(
  clubId: string,
  squadIds: string[],
  players: Record<string, Player>,
  tactics: Record<string, import('../models').Tactic>,
): void {
  const tactic = tactics[clubId];
  if (!tactic) return;
  const squad = new Set(squadIds);
  const broken = tactic.lineup.some((s) => !squad.has(s.playerId));
  if (!broken) return;
  const fresh = autoPickLineup(clubId, squadIds, players, tactic.formation);
  // Preserva as instruções escolhidas pelo utilizador; só o onze é recalculado.
  tactic.lineup = fresh.lineup;
  tactic.bench = fresh.bench;
  tactic.captainId = fresh.captainId;
  tactic.penaltyTakerId = fresh.penaltyTakerId;
}

function overallOf(slot: LineupSlot, players: Record<string, Player>): number {
  const p = players[slot.playerId];
  return p ? computeOverall(p.attributes, slot.position) : 0;
}

/** Melhor marcador de penáltis = maior finalização no onze. */
function bestPenaltyTaker(lineup: LineupSlot[], players: Record<string, Player>): string | null {
  let bestId: string | null = null;
  let best = -1;
  for (const slot of lineup) {
    const p = players[slot.playerId];
    if (p && p.attributes.finishing > best) { best = p.attributes.finishing; bestId = p.id; }
  }
  return bestId;
}
