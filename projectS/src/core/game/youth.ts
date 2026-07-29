import { Club, GameState, naturalOverall, Player, Position, POSITION_GROUP, PositionGroup } from '../models';
import { Rng } from '../engine/rng';
import { computeMarketValue, recalcWages, suggestedWage } from '../economy';
import { makePlayer } from './newGame';

/**
 * Academia de jovens e reformas — mantém o mundo vivo entre épocas.
 * Sem isto os plantéis envelhecem até ao colapso; com isto há renovação e a
 * dopamina de descobrir um wonderkid na fornada anual.
 */

export const YOUTH_PER_CLUB = 2; // jovens que entram por época em cada clube
export const RETIRE_AGE_SOFT = 34; // a partir daqui, risco de reforma
export const RETIRE_AGE_HARD = 37; // reforma garantida

/** Mínimo de jogadores por setor — o plantel nunca fica sem uma posição coberta. */
export const SQUAD_MINIMUMS: Record<PositionGroup, number> = {
  GOALKEEPER: 2,
  DEFENCE: 6,
  MIDFIELD: 6,
  ATTACK: 5,
};

/** Posições usadas para preencher cada setor em falta (com peso na mais comum). */
const FILL_POSITIONS: Record<PositionGroup, Position[]> = {
  GOALKEEPER: ['GK'],
  DEFENCE: ['CB', 'RB', 'LB', 'CB'],
  MIDFIELD: ['CM', 'DM', 'AM', 'CM'],
  ATTACK: ['ST', 'RW', 'LW', 'ST'],
};

const YOUTH_POSITIONS: Position[] = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

/** É wonderkid? Jovem com teto de topo. */
export function isWonderkid(p: Player): boolean {
  return p.age <= 18 && p.potential >= 17;
}

export interface YouthIntakeResult {
  joinedManagedClub: string[]; // ids dos jovens que entraram no clube gerido
  totalJoined: number;
  totalRetired: number;
}

/**
 * Fornada anual: reforma veteranos e injeta jovens em todos os clubes.
 * Chamar no rollover, depois do envelhecimento (+1 ano) e antes dos orçamentos.
 * Determinístico via seed derivada da época.
 */
export function processYouthAndRetirements(state: GameState, rng: Rng): YouthIntakeResult {
  let totalRetired = 0;
  let totalJoined = 0;
  const joinedManagedClub: string[] = [];

  // --- Reformas ---
  for (const player of Object.values(state.players)) {
    const retires =
      player.age >= RETIRE_AGE_HARD ||
      (player.age >= RETIRE_AGE_SOFT && rng.chance(0.35 + (player.age - RETIRE_AGE_SOFT) * 0.2));
    const purgedFreeAgent = player.clubId === null && player.age >= 31;

    if (retires || purgedFreeAgent) {
      if (player.clubId) {
        const club = state.clubs[player.clubId];
        if (club) club.squad = club.squad.filter((id) => id !== player.id);
      }
      delete state.players[player.id];
      totalRetired++;
    }
  }

  // --- Fornada de jovens (todos os clubes) ---
  for (const club of Object.values(state.clubs)) {
    // Nível da academia: reputação + nível da instalação de academia.
    const academyLevel = Math.max(3,
      7 + Math.round(((club.reputation - 40) / 55) * 8) + (club.facilities.academy - 1));

    for (let i = 0; i < YOUTH_PER_CLUB; i++) {
      const id = `yth_${state.meta.season}_${club.id}_${i}`;
      const position = rng.pick(YOUTH_POSITIONS);
      const youth = makePlayer(id, club.id, position, academyLevel, state.meta.season, rng);

      // Força juventude: 15-18 anos, contrato de formação, potencial com upside.
      youth.age = rng.int(15, 18);
      const overall = naturalOverall(youth);
      // Upside da academia: às vezes sai um wonderkid (potencial até +7).
      const upside = rng.chance(0.12) ? rng.int(5, 7) : rng.int(1, 4);
      youth.potential = Math.min(20, Math.max(overall + 1, overall + upside));
      youth.contractUntil = state.meta.season + rng.int(2, 4);
      youth.wage = Math.max(300, Math.round(suggestedWage(youth, state.meta.season) * 0.4));
      youth.marketValue = computeMarketValue(youth, state.meta.season);

      state.players[id] = youth;
      club.squad.push(id);
      totalJoined++;
      if (club.id === state.meta.managedClubId) joinedManagedClub.push(id);
    }

    // Salários do clube mudaram (reformas + entradas).
    const fin = state.finances[club.id];
    if (fin) recalcWages(club, fin, state.players);
  }

  return { joinedManagedClub, totalJoined, totalRetired };
}

/**
 * Garante um mínimo de jogadores por setor. Se um setor estiver abaixo do
 * mínimo (por contratos a expirar, reformas ou vendas), preenche com jovens de
 * base — assim o plantel nunca fica desfalcado numa posição. Devolve nº criados.
 */
export function ensureMinimumSquad(state: GameState, club: Club, rng: Rng): number {
  const counts: Record<PositionGroup, number> = { GOALKEEPER: 0, DEFENCE: 0, MIDFIELD: 0, ATTACK: 0 };
  for (const id of club.squad) {
    const p = state.players[id];
    if (p) counts[POSITION_GROUP[p.positions[0]!]]++;
  }
  const base = Math.max(4, 6 + Math.round(((club.reputation - 40) / 55) * 6) + (club.facilities.academy - 1));
  const groups: PositionGroup[] = ['GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'];
  let added = 0;
  for (const g of groups) {
    let i = 0;
    while (counts[g] < SQUAD_MINIMUMS[g]) {
      const pos = FILL_POSITIONS[g][i % FILL_POSITIONS[g].length]!;
      const id = `fill_${state.meta.season}_${club.id}_${g}_${i}`;
      const filler = makePlayer(id, club.id, pos, Math.max(3, base - 3), state.meta.season, rng);
      filler.age = rng.int(16, 20);
      filler.contractUntil = state.meta.season + rng.int(2, 4);
      filler.wage = Math.max(300, Math.round(suggestedWage(filler, state.meta.season) * 0.4));
      filler.marketValue = computeMarketValue(filler, state.meta.season);
      state.players[id] = filler;
      club.squad.push(id);
      counts[g]++;
      added++;
      i++;
    }
  }
  if (added > 0) {
    const fin = state.finances[club.id];
    if (fin) recalcWages(club, fin, state.players);
  }
  return added;
}

/**
 * Jovem à experiência (slot de anúncio rewarded): gera 1 prospeto extra para o
 * clube gerido, com upside acima da média da fornada normal.
 */
export function youthTrial(state: GameState, rng: Rng): Player {
  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId]!;
  const academyLevel = Math.max(4, 8 + Math.round(((club.reputation - 40) / 55) * 8));

  const id = `trial_${state.meta.season}_${Object.keys(state.players).length}`;
  const youth = makePlayer(id, clubId, rng.pick(YOUTH_POSITIONS), academyLevel, state.meta.season, rng);
  youth.age = rng.int(16, 18);
  const overall = naturalOverall(youth);
  youth.potential = Math.min(20, overall + rng.int(3, 7)); // sempre upside interessante
  youth.contractUntil = state.meta.season + 3;
  youth.wage = Math.max(300, Math.round(suggestedWage(youth, state.meta.season) * 0.4));
  youth.marketValue = computeMarketValue(youth, state.meta.season);

  state.players[id] = youth;
  club.squad.push(id);
  const fin = state.finances[clubId];
  if (fin) recalcWages(club, fin, state.players);
  return youth;
}
