import {
  Club,
  defaultFacilities,
  emptyGameState,
  Finance,
  GameMeta,
  GameState,
  League,
  Player,
  PlayerAttributes,
  Position,
  SCHEMA_VERSION,
} from '../models';
import { assignObjective } from '../career';
import { generateCup } from '../cup';
import { computeMarketValue, recalcUpkeep, suggestedWage } from '../economy';
import { emptyStandings, generateSchedule } from '../season';
import { Rng } from '../engine/rng';
import { autoPickLineup } from './lineup';
import { CITIES, CLUB_SUFFIXES, FIRST_NAMES, LAST_NAMES, NATIONALITIES } from './names';

export interface NewGameOptions {
  managerName: string;
  numClubs?: number; // clubes POR DIVISÃO, default 14
  squadSize?: number; // jogadores por clube, default 20
  divisions?: number; // nº de divisões, default 3
  season?: number; // default 2026
  seed?: number; // default aleatório
}

/** Nome e banda de reputação/nível por tier. */
const TIER_CONFIG = [
  { name: 'Liga Principal', repMin: 62, repMax: 95, lvlMin: 12, lvlMax: 17 },
  { name: 'Liga 2', repMin: 50, repMax: 72, lvlMin: 10, lvlMax: 14 },
  { name: 'Liga 3', repMin: 38, repMax: 58, lvlMin: 8, lvlMax: 12 },
  { name: 'Liga 4', repMin: 30, repMax: 48, lvlMin: 6, lvlMax: 10 },
];

/** Composição típica de um plantel por posição (soma = squadSize aproximado). */
const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'RB', 'RB', 'CB', 'CB', 'CB', 'LB', 'LB',
  'DM', 'CM', 'CM', 'AM', 'RW', 'LW',
  'ST', 'ST',
];

/**
 * Gera um jogo novo e completo: pirâmide de divisões com promoção/despromoção,
 * plantéis procedurais, finanças, táticas e calendários.
 *
 * O treinador começa num clube médio da ÚLTIMA divisão — a jornada é subir.
 * Totalmente determinístico a partir da seed.
 */
export function createNewGame(opts: NewGameOptions): GameState {
  const numClubs = opts.numClubs ?? 14;
  const squadSize = opts.squadSize ?? 20;
  const divisions = Math.min(opts.divisions ?? 3, TIER_CONFIG.length);
  const season = opts.season ?? 2026;
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = new Rng(seed);

  const meta: GameMeta = {
    saveId: `save_${seed}`,
    managerName: opts.managerName,
    managedClubId: '', // definido abaixo
    season,
    currentDate: `${season}-08-01`,
    rngSeed: seed,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
  const state = emptyGameState(meta);

  const usedClubNames = new Set<string>();

  for (let tier = 1; tier <= divisions; tier++) {
    const cfg = TIER_CONFIG[tier - 1]!;
    const leagueId = `liga_${tier}`;
    const league: League = { id: leagueId, name: cfg.name, country: 'PRT', tier, clubIds: [] };
    state.leagues[leagueId] = league;

    for (let c = 0; c < numClubs; c++) {
      const clubId = `club_t${tier}_${c}`;
      const t = rng.next(); // 0..1 dentro da banda do tier
      const clubLevel = cfg.lvlMin + Math.round(t * (cfg.lvlMax - cfg.lvlMin));
      const reputation = cfg.repMin + Math.round(t * (cfg.repMax - cfg.repMin));

      const club = makeClub(clubId, leagueId, reputation, usedClubNames, rng);
      league.clubIds.push(clubId);

      const squadIds: string[] = [];
      for (let i = 0; i < squadSize; i++) {
        const position = SQUAD_TEMPLATE[i % SQUAD_TEMPLATE.length]!;
        const player = makePlayer(`${clubId}_p${i}`, clubId, position, clubLevel, season, rng);
        player.marketValue = computeMarketValue(player, season);
        state.players[player.id] = player;
        squadIds.push(player.id);
      }
      club.squad = squadIds;
      state.clubs[clubId] = club;
      const fin = makeFinance(clubId, reputation, state.players, squadIds, season);
      recalcUpkeep(club, fin); // manutenção a partir das instalações/estádio
      state.finances[clubId] = fin;
      state.tactics[clubId] = autoPickLineup(clubId, squadIds, state.players);
    }

    state.schedules[leagueId] = generateSchedule(leagueId, league.clubIds, seed + tier);
    state.standings[leagueId] = emptyStandings(league.clubIds);
  }

  // Clube gerido: reputação média da ÚLTIMA divisão — começa-se em baixo.
  const bottomLeague = state.leagues[`liga_${divisions}`]!;
  const sortedByRep = [...bottomLeague.clubIds].sort(
    (a, b) => state.clubs[a]!.reputation - state.clubs[b]!.reputation,
  );
  meta.managedClubId = sortedByRep[Math.floor(sortedByRep.length / 2)]!;

  // Objetivo inicial da direção.
  setManagedObjective(state);

  // Sorteio da Taça da primeira época.
  state.cup = generateCup(state);

  return state;
}

/**
 * (Re)atribui o objetivo da direção para o clube gerido, com base no ranking
 * de reputação dentro da liga atual. Usado no arranque, no rollover e ao
 * aceitar uma oferta de emprego.
 */
export function setManagedObjective(state: GameState): void {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return;
  const league = state.leagues[club.leagueId];
  if (!league) return;
  const ranked = [...league.clubIds].sort(
    (a, b) => (state.clubs[b]?.reputation ?? 0) - (state.clubs[a]?.reputation ?? 0),
  );
  const expectedRank = ranked.indexOf(club.id) + 1;
  state.career.objective = assignObjective(expectedRank, league.clubIds.length);
}

function makeClub(
  id: string,
  leagueId: string,
  reputation: number,
  used: Set<string>,
  rng: Rng,
): Club {
  let name = '';
  do {
    name = `${rng.pick(CLUB_SUFFIXES)} ${rng.pick(CITIES)}`;
  } while (used.has(name));
  used.add(name);

  const short = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3);
  const capacity = 8000 + Math.round((reputation / 100) * 55000); // 8k..63k

  return {
    id, name, shortName: short, country: 'PRT', leagueId,
    primaryColor: rng.pick(['#c8102e', '#004170', '#008000', '#000000', '#ffb300', '#5c2d91']),
    secondaryColor: '#ffffff',
    stadiumName: `Estádio ${name.split(' ').slice(1).join(' ')}`,
    stadiumCapacity: capacity,
    reputation,
    facilities: defaultFacilities(),
    squad: [],
  };
}

/** Gera um jogador procedural. Usado no arranque e pela academia (youth.ts). */
export function makePlayer(
  id: string,
  clubId: string,
  position: Position,
  clubLevel: number,
  season: number,
  rng: Rng,
): Player {
  const age = rng.int(17, 34);
  // Atributos: base do clube ±3, com variação por atributo.
  const base = clamp(clubLevel + rng.int(-3, 3), 3, 19);
  const attributes = makeAttributes(position, base, rng);

  // Potencial: overall de base + margem se jovem.
  const youthBonus = age <= 21 ? rng.int(1, 4) : age <= 24 ? rng.int(0, 2) : 0;
  const potential = clamp(base + youthBonus, base, 20);

  const player: Player = {
    id, clubId,
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age,
    nationality: rng.next() < 0.7 ? 'PRT' : rng.pick(NATIONALITIES),
    foot: rng.next() < 0.75 ? 'RIGHT' : rng.next() < 0.9 ? 'LEFT' : 'BOTH',
    positions: [position],
    attributes,
    potential,
    condition: { form: rng.int(55, 80), morale: rng.int(60, 85), fitness: 100, status: 'AVAILABLE', injuryDaysRemaining: 0 },
    contractUntil: season + rng.int(1, 5),
    wage: 0,
    marketValue: 0,
    transferListed: false,
  };
  player.wage = suggestedWage(player, season);
  return player;
}

/** Gera atributos com viés para a posição (ex: ST com finalização mais alta). */
function makeAttributes(position: Position, base: number, rng: Rng): PlayerAttributes {
  const a = (bonus = 0) => clamp(base + bonus + rng.int(-2, 2), 1, 20);
  const isGK = position === 'GK';
  return {
    pace: a(isGK ? -4 : 0), stamina: a(), strength: a(), agility: a(isGK ? 2 : 0),
    finishing: a(['ST', 'RW', 'LW', 'AM'].includes(position) ? 2 : -2),
    passing: a(['CM', 'AM', 'DM'].includes(position) ? 2 : 0),
    dribbling: a(['RW', 'LW', 'AM', 'ST'].includes(position) ? 2 : -1),
    tackling: a(['CB', 'DM', 'RB', 'LB'].includes(position) ? 2 : -2),
    heading: a(['CB', 'ST'].includes(position) ? 2 : 0),
    goalkeeping: isGK ? clamp(base + rng.int(-1, 2), 1, 20) : rng.int(1, 4),
    positioning: a(), composure: a(), teamwork: a(), vision: a(['CM', 'AM'].includes(position) ? 2 : 0),
  };
}

function makeFinance(
  clubId: string,
  reputation: number,
  players: Record<string, Player>,
  squadIds: string[],
  _season: number,
): Finance {
  const scale = reputation / 100;
  const wages = squadIds.reduce((s, id) => s + (players[id]?.wage ?? 0), 0);
  // Saldo cresce ao QUADRADO da reputação: os grandes têm muito mais margem
  // que os pequenos. Sem isto, um clube da 3ª divisão começava com dinheiro
  // suficiente para comprar craques logo na 1ª época.
  const balance = Math.round(500_000 + scale * scale * 45_000_000);
  return {
    clubId,
    balance,
    transferBudget: Math.round(balance * 0.4),
    wageBudget: Math.round(wages * 1.3),
    // Receitas escalam ao QUADRADO da reputação: um clube da 1ª divisão tem
    // muito mais do que um da 3ª. Antes eram quase iguais, o que dava dinheiro
    // a mais aos pequenos.
    income: {
      tickets: 0,
      sponsorship: Math.round(8_000 + scale * scale * 320_000),
      tvRights: Math.round(12_000 + scale * scale * 480_000),
      merchandising: Math.round(4_000 + scale * scale * 120_000),
    },
    expenses: {
      wages,
      facilities: 0, // calculado a partir das instalações (recalcUpkeep)
      staff: Math.round(8_000 + scale * scale * 140_000),
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
