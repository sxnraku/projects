import {
  Club,
  computeOverall,
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
import { CITIES, FIRST_NAMES, LAST_NAMES, NameStyle, NATIONALITIES, suffixesFor } from './names';

export interface NewGameOptions {
  managerName: string;
  numClubs?: number; // clubes POR DIVISÃO, default 14
  squadSize?: number; // jogadores por clube, default = plantel completo (23)
  divisions?: number; // nº de divisões, default 3
  season?: number; // default 2026
  seed?: number; // default aleatório
  nameStyle?: NameStyle; // estilo dos nomes de clube, default 'serious'
}

/** Nome e banda de reputação/nível por tier. */
const TIER_CONFIG = [
  { name: 'Liga Principal', repMin: 62, repMax: 95, lvlMin: 12, lvlMax: 17 },
  { name: 'Liga 2', repMin: 50, repMax: 72, lvlMin: 10, lvlMax: 14 },
  { name: 'Liga 3', repMin: 38, repMax: 58, lvlMin: 8, lvlMax: 12 },
  { name: 'Liga 4', repMin: 30, repMax: 48, lvlMin: 6, lvlMax: 10 },
];

/**
 * Economia REALISTA ancorada à DIVISÃO (valores em €). O dinheiro e a dimensão
 * (saldo, receitas semanais, capacidade do estádio) passam a depender do escalão
 * — não da reputação. Antes tudo derivava da reputação (0-100) e a banda da 3ª
 * divisão (38-58) era alta demais: dava clubes da 3ª com €13M em caixa e estádios
 * de 37 mil lugares. A reputação fica só para atratividade/mercado e bilheteira.
 * `t` (0..1) é a posição do clube DENTRO da sua divisão (0 = fundo, 1 = topo).
 */
const TIER_ECON = [
  // 1ª divisão
  { balMin: 9_000_000, balMax: 60_000_000, incMin: 70_000, incMax: 650_000, stadMin: 20_000, stadMax: 65_000 },
  // 2ª divisão
  { balMin: 1_500_000, balMax: 13_000_000, incMin: 16_000, incMax: 140_000, stadMin: 7_000, stadMax: 28_000 },
  // 3ª divisão
  { balMin: 150_000, balMax: 2_000_000, incMin: 3_500, incMax: 28_000, stadMin: 2_000, stadMax: 9_000 },
  // 4ª divisão
  { balMin: 40_000, balMax: 500_000, incMin: 1_000, incMax: 8_000, stadMin: 600, stadMax: 3_500 },
] as const;

function econOf(tier: number) {
  return TIER_ECON[Math.max(0, Math.min(TIER_ECON.length - 1, tier - 1))]!;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Composição de um plantel COMPLETO por posição.
 * ORDENADO de propósito: os primeiros 11 formam um 4-3-3 jogável; os restantes
 * são suplentes com pelo menos 1 backup por posição. Assim, mesmo com plantéis
 * mais pequenos (ex.: testes com squadSize 18), há sempre jogadores para todas
 * as posições — o Diogo tinha razão: "podem ser fracos, mas não podem faltar".
 */
const SQUAD_TEMPLATE: Position[] = [
  // Onze base (4-3-3)
  'GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'RW', 'ST', 'LW',
  // Suplentes (cobrem todas as posições)
  'GK', 'RB', 'CB', 'LB', 'DM', 'AM', 'CM', 'RW', 'LW', 'ST', 'AM', 'ST',
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
  const squadSize = opts.squadSize ?? SQUAD_TEMPLATE.length; // plantel completo (23)
  const divisions = Math.min(opts.divisions ?? 3, TIER_CONFIG.length);
  const season = opts.season ?? 2026;
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = new Rng(seed);
  const suffixes = suffixesFor(opts.nameStyle ?? 'serious');

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
  const usedShorts = new Set<string>();

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

      const club = makeClub(clubId, leagueId, reputation, tier, t, suffixes, usedClubNames, usedShorts, rng);
      league.clubIds.push(clubId);

      const squadIds: string[] = [];
      for (let i = 0; i < squadSize; i++) {
        const position = SQUAD_TEMPLATE[i % SQUAD_TEMPLATE.length]!;
        // Os primeiros 11 são o onze titular (nível do clube); os restantes são
        // suplentes/profundidade, gerados mais fracos → mais baratos (mantém as
        // contas viáveis) e realistas (o banco é pior que os titulares).
        const slotLevel = i < 11 ? clubLevel : Math.max(3, clubLevel - 2);
        const player = makePlayer(`${clubId}_p${i}`, clubId, position, slotLevel, season, rng);
        player.marketValue = computeMarketValue(player, season);
        state.players[player.id] = player;
        squadIds.push(player.id);
      }
      club.squad = squadIds;
      state.clubs[clubId] = club;
      const fin = makeFinance(clubId, tier, t, state.players, squadIds);
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

/**
 * Sigla de 3 letras a partir do nome, ÚNICA na liga. Antes, "Tung Tung Tung X"
 * dava sempre "TTT" em vários clubes; agora ignora conectores ("de/da/do") e,
 * se colidir, cai para letras da cidade e por fim um dígito — nunca repete.
 */
function makeShortName(name: string, usedShorts: Set<string>): string {
  const words = name.split(' ').filter((w) => !['de', 'da', 'do', 'dos', 'das'].includes(w.toLowerCase()));
  const initials = words.map((w) => w[0]!.toUpperCase()).join('');
  const city = words[words.length - 1] ?? name; // última palavra ~ cidade
  const candidates = [
    initials.slice(0, 3),
    (initials[0] ?? '') + city.slice(0, 2).toUpperCase(),
    city.slice(0, 3).toUpperCase(),
  ];
  for (const c of candidates) {
    if (c.length >= 2 && !usedShorts.has(c)) { usedShorts.add(c); return c; }
  }
  // Último recurso: base + dígito.
  const base = (candidates[0] || 'CLB').slice(0, 2);
  for (let n = 2; ; n++) {
    const s = base + n;
    if (!usedShorts.has(s)) { usedShorts.add(s); return s; }
  }
}

function makeClub(
  id: string,
  leagueId: string,
  reputation: number,
  tier: number,
  t: number,
  suffixes: string[],
  used: Set<string>,
  usedShorts: Set<string>,
  rng: Rng,
): Club {
  let name = '';
  do {
    name = `${rng.pick(suffixes)} ${rng.pick(CITIES)}`;
  } while (used.has(name));
  used.add(name);

  const short = makeShortName(name, usedShorts);
  // Capacidade do estádio ancorada ao ESCALÃO (não à reputação).
  const econ = econOf(tier);
  const capacity = Math.round(lerp(econ.stadMin, econ.stadMax, t) / 500) * 500;

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
  // Nível-alvo do jogador (leve viés para baixo; teto controlado pelo chamador
  // via `clubLevel`, que já vem limitado à banda do escalão).
  const base = clamp(clubLevel + rng.int(-2, 1), 3, 19);
  const attributes = makeAttributes(position, base, rng);

  // ALINHA o overall ao nível-alvo: o overall pondera exatamente os atributos que
  // recebem bónus de posição, por isso sem este ajuste um clube "nível 12" gerava
  // avançados "nível 16" (75-80). Desloca todos os atributos para que o overall
  // NATURAL fique ≈ base — mantém o perfil da posição mas ancora o nível.
  const rawOverall = computeOverall(attributes, position);
  const shift = base - rawOverall;
  if (shift !== 0) {
    for (const k in attributes) {
      const key = k as keyof PlayerAttributes;
      attributes[key] = clamp(attributes[key] + shift, 1, 20);
    }
  }

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
  tier: number,
  t: number,
  players: Record<string, Player>,
  squadIds: string[],
): Finance {
  const econ = econOf(tier);
  const wages = squadIds.reduce((s, id) => s + (players[id]?.wage ?? 0), 0);

  // Saldo em caixa e receitas semanais ancorados ao ESCALÃO (valores realistas).
  // Um clube da 3ª divisão fica com centenas de milhares — não com milhões.
  const balance = Math.round(lerp(econ.balMin, econ.balMax, t) / 10_000) * 10_000;
  const weeklyIncome = lerp(econ.incMin, econ.incMax, t);

  return {
    clubId,
    balance,
    transferBudget: Math.round(balance * 0.35),
    wageBudget: Math.round(wages * 1.3),
    income: {
      tickets: 0,
      sponsorship: Math.round(weeklyIncome * 0.40),
      tvRights: Math.round(weeklyIncome * 0.45),
      merchandising: Math.round(weeklyIncome * 0.15),
    },
    expenses: {
      wages,
      facilities: 0, // calculado a partir das instalações (recalcUpkeep)
      staff: Math.round(weeklyIncome * 0.30),
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
