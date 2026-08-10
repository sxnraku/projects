import {
  Club,
  computeOverall,
  computeOverallFine,
  defaultFacilities,
  emptyGameState,
  Finance,
  Foot,
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
import {
  computeMarketValue, countryPrestige, recalcIncome, recalcUpkeep, suggestedWage, syncBudgets,
} from '../economy';
import { emptyStandings, generateSchedule } from '../season';
import { Rng } from '../engine/rng';
import { autoPickLineup } from './lineup';
import { CITIES, CLUB_SUFFIXES, FIRST_NAMES, LAST_NAMES, NATIONALITIES } from './names';
import { WORLD_TEAMS, WorldTeam, PlayerTuple } from '../data/world/worldTeams';
import { loadCountryPlayers } from '../data/world/playerIndex';
import { buildBackgroundWorld } from './background';

/** Jogador da base, descodificado de um PlayerTuple do mundo. */
export interface BasePlayerData { teamId: number; name: string; pos: Position; nat: string; age: number; foot: Foot; ovr: number; pot: number; }
/**
 * Limpa o sufixo numérico dos nomes da base ("Rayan Petit 24" → "Rayan Petit").
 *
 * O importador do Excel desambiguou nomes repetidos acrescentando um número, e
 * isso ia parar ao ecrã: 720 dos 1276 jogadores franceses (e 671 dos brasileiros)
 * apareciam no mercado com um número colado ao apelido. Portugal saiu limpo, por
 * isso só se notava no mercado internacional.
 */
const stripNameIndex = (name: string): string => name.replace(/\s+\d+$/, '');

export const decodeTuple = (t: PlayerTuple): BasePlayerData =>
  ({ teamId: t[0], name: stripNameIndex(t[1]), pos: t[2], nat: t[3], age: t[4], foot: t[5], ovr: t[6], pot: t[7] });
/** País ativo por omissão (o antigo mundo Portugal). */
export const DEFAULT_COUNTRY = 'portugal';

export interface NewGameOptions {
  managerName: string;
  numClubs?: number; // clubes POR DIVISÃO, default 14
  squadSize?: number; // jogadores por clube, default = plantel completo (23)
  divisions?: number; // nº de divisões, default 3
  season?: number; // default 2026
  seed?: number; // default aleatório
  country?: string; // país ativo (slug de WORLD_TEAMS); default 'portugal'. Só com useBase.
  // Usa a base FIXA de equipas/jogadores (docs/excel_todos_os_clubes_overalls_ajustados.xlsx)
  // em vez da geração aleatória. Ativado no jogo real; os testes usam procedural.
  useBase?: boolean;
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
  const suffixes = CLUB_SUFFIXES;
  // País ativo (só com useBase): valida contra o mundo, senão cai no default.
  const country = opts.useBase && WORLD_TEAMS.some((t) => t.slug === opts.country)
    ? opts.country! : DEFAULT_COUNTRY;

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

  // O mundo de fundo existe SEMPRE — mesmo com o mundo gerado. É dele que saem
  // a qualificação europeia e o mercado internacional; sem ele um jogo gerado
  // ficava sem Europa nenhuma.
  state.background = buildBackgroundWorld(country, seed); // resto do mundo, simulado barato

  if (opts.useBase) {
    buildBaseWorld(state, season, seed, rng, country);
  } else {
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
      const fin = makeFinance(club, tier, state.players, squadIds);
      recalcUpkeep(club, fin); // manutenção a partir das instalações/estádio
      state.finances[clubId] = fin;
      state.tactics[clubId] = autoPickLineup(clubId, squadIds, state.players);
    }

    state.schedules[leagueId] = generateSchedule(leagueId, league.clubIds, seed + tier);
    state.standings[leagueId] = emptyStandings(league.clubIds);
  }
  } // fim do ramo procedural

  // Clube gerido: reputação média da ÚLTIMA divisão do país — começa-se em baixo.
  const lastTier = opts.useBase
    ? Math.max(...WORLD_TEAMS.filter((t) => t.slug === country).map((t) => t.tier))
    : divisions;
  const bottomLeague = state.leagues[`liga_${lastTier}`]!;
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

/** Média de overall (0-100) de um plantel — para ranquear economia dentro da divisão. */
function avgOvrOf(players: BasePlayerData[]): number {
  return players.length ? players.reduce((s, p) => s + p.ovr, 0) / players.length : 60;
}

/**
 * Constrói o mundo ATIVO a partir da pirâmide do PAÍS escolhido (WORLD_TEAMS +
 * plantéis carregados sob demanda). Cada divisão usa o nome REAL da liga e é
 * ordenada por força (média de overall) → mais forte = mais reputação/dinheiro/
 * estádio. Reutiliza a mesma economia/plumbing do ramo procedural.
 */
function buildBaseWorld(state: GameState, season: number, seed: number, rng: Rng, country: string): void {
  const countryTeams = WORLD_TEAMS.filter((wt) => wt.slug === country);

  // Plantéis do país (tuplos → objetos), agrupados por equipa.
  const byTeam = new Map<number, BasePlayerData[]>();
  for (const tp of loadCountryPlayers(country)) {
    const d = decodeTuple(tp);
    if (!byTeam.has(d.teamId)) byTeam.set(d.teamId, []);
    byTeam.get(d.teamId)!.push(d);
  }

  const byTier = new Map<number, WorldTeam[]>();
  for (const wt of countryTeams) {
    if (!byTier.has(wt.tier)) byTier.set(wt.tier, []);
    byTier.get(wt.tier)!.push(wt);
  }

  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const leagueId = `liga_${tier}`;
    const tierTeams = byTier.get(tier)!;
    const league: League = { id: leagueId, name: tierTeams[0]!.league, country, tier, clubIds: [] };
    state.leagues[leagueId] = league;

    const teams = tierTeams
      .map((wt) => ({ wt, avg: avgOvrOf(byTeam.get(wt.id) ?? []) }))
      .sort((a, b) => a.avg - b.avg); // fraco → forte

    teams.forEach(({ wt }) => {
      const clubId = `club_${wt.id}`;
      // Reputação da FORÇA real (dataset) + estatura do país — não do escalão.
      const reputation = baseReputation(wt.forca, wt.slug);
      const club = makeClubFromBase(wt, clubId, leagueId, reputation);
      league.clubIds.push(clubId);

      const squadIds: string[] = [];
      (byTeam.get(wt.id) ?? []).forEach((bp, i) => {
        const player = makePlayerFromBase(`${clubId}_p${i}`, clubId, bp, season, rng);
        player.marketValue = computeMarketValue(player, season);
        state.players[player.id] = player;
        squadIds.push(player.id);
      });
      club.squad = squadIds;
      state.clubs[clubId] = club;
      const fin = makeFinance(club, tier, state.players, squadIds);
      recalcUpkeep(club, fin);
      state.finances[clubId] = fin;
      state.tactics[clubId] = autoPickLineup(clubId, squadIds, state.players);
    });

    state.schedules[leagueId] = generateSchedule(leagueId, league.clubIds, seed + tier);
    state.standings[leagueId] = emptyStandings(league.clubIds);
  }
}

/** Clube a partir de uma equipa da base (nome/sigla/cor fixos; economia pela reputação). */
function makeClubFromBase(
  bt: WorldTeam, clubId: string, leagueId: string, reputation: number,
): Club {
  // Estádio proporcional à reputação (força+país), não ao escalão — Andorra tem
  // estádios pequenos mesmo sendo "1ª divisão".
  const capacity = Math.round((1_500 + Math.pow(reputation / 95, 2) * 58_000) / 500) * 500;
  const cityName = bt.name.split(' ')[0] ?? bt.name;
  return {
    id: clubId, name: bt.name, shortName: bt.sigla, country: bt.slug, leagueId,
    primaryColor: bt.color, secondaryColor: '#ffffff',
    stadiumName: `Estádio ${cityName}`,
    stadiumCapacity: capacity, reputation, facilities: defaultFacilities(), squad: [],
  };
}

/**
 * Jogador a partir da base: nome/posição/nacionalidade/idade/pé fixos, e atributos
 * DERIVADOS do overall — gera um perfil de posição e ESCALA-o para que o overall
 * fino bata exatamente o valor da base (justo). Potencial = pot/5 (≥ overall).
 */
export function makePlayerFromBase(id: string, clubId: string, bp: BasePlayerData, season: number, rng: Rng): Player {
  const position = bp.pos;
  const targetFine = clamp(bp.ovr / 5, 1, 20); // escala interna 1-20
  const attrs = makeAttributes(position, Math.round(targetFine), rng);
  const fine = computeOverallFine(attrs, position) || targetFine;
  const k = targetFine / fine; // computeOverallFine é linear → escala certa
  for (const key in attrs) {
    const kk = key as keyof PlayerAttributes;
    attrs[kk] = clamp(attrs[kk] * k, 1, 20);
  }
  // Potencial: parte do valor da base, mas os JOVENS ganham alguma margem para
  // haver evolução visível ao treinar (a base traz margens muito apertadas).
  // Moderado — nem todos os jovens são craques garantidos.
  const youthCeiling = bp.age <= 18 ? rng.int(2, 4)
    : bp.age <= 20 ? rng.int(1, 3)
    : bp.age <= 22 ? rng.int(0, 2) : 0;
  const potential = clamp(Math.max(bp.pot / 5, targetFine + youthCeiling), targetFine, 20);
  const parts = bp.name.split(' ');
  const firstName = parts[0] ?? bp.name;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;

  const player: Player = {
    id, clubId,
    firstName, lastName,
    age: bp.age, nationality: bp.nat, foot: bp.foot,
    positions: [position], attributes: attrs, potential,
    condition: { form: rng.int(55, 80), morale: rng.int(60, 85), fitness: 100, status: 'AVAILABLE', injuryDaysRemaining: 0 },
    contractUntil: season + rng.int(1, 5), wage: 0, marketValue: 0, transferListed: false,
  };
  player.wage = suggestedWage(player, season);
  return player;
}

/**
 * (Re)atribui o objetivo da direção para o clube gerido, com base no ranking
 * de reputação dentro da liga atual. Usado no arranque, no rollover e ao
 * aceitar uma oferta de emprego.
 *
 * PISO por resultado imediato: se a época que acabou (a mais recente em
 * `career.seasons`, se for a DESTE clube) terminou em título ou subida, o
 * objetivo nunca cai para "evitar despromoção" — a reputação do clube só sobe
 * gradualmente (ver `seasonReputationDelta`), e sem este piso um clube que
 * tinha acabado de ser campeão continuava, na prática, com o MESMO objetivo de
 * sempre, só porque o ranking de reputação ainda não tinha apanhado o sucesso.
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
  let objective = assignObjective(expectedRank, league.clubIds.length);

  // A DIREÇÃO TEM MEMÓRIA. O objetivo saía só do ranking de reputação, por isso
  // um clube que acabara de ser campeão podia receber "primeira metade da
  // tabela" — absurdo, e foi exatamente a queixa do playtest ("ganhei cinco
  // campeonatos e continuam a pedir-me a metade de cima").
  const lastSeason = state.career.seasons[state.career.seasons.length - 1];
  if (lastSeason && lastSeason.clubId === club.id) {
    if (lastSeason.champion && !lastSeason.promoted) {
      // Campeão em título na MESMA divisão: revalidar é o mínimo exigível.
      objective = 'TITLE';
    } else if ((lastSeason.champion || lastSeason.promoted) && objective === 'AVOID_RELEGATION') {
      // Subiu de escalão: dão-lhe crédito, mas não lhe exigem o título logo.
      objective = 'TOP_HALF';
    }
  }
  state.career.objective = objective;
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

/**
 * Reputação (5..95) de um clube: qualidade do plantel (FORÇA global do dataset,
 * mediana ~68.5) + estatura da LIGA (prestígio do país). Sem o termo do país, a
 * 1ª divisão de Andorra ganhava a mesma reputação que a de Inglaterra → 5 estrelas
 * num clube andorrano. Agora Andorra fica com poucas estrelas, Inglaterra com
 * muitas — coerente com os dados.
 */
export function baseReputation(forca: number, slug: string): number {
  const quality = 50 + (forca - 68.5) * 2.3; // força global → reputação
  const stature = (countryPrestige(slug) - 1) * 18; // liga forte soma, fraca corta
  return clamp(Math.round(quality + stature), 5, 95);
}

/**
 * Saldo em caixa inicial a partir da REPUTAÇÃO (cresce exponencialmente). Desliga
 * a confusão "escalão = dinheiro": a 1ª divisão de Andorra não é a de Inglaterra,
 * por isso não parte com dezenas de milhões só por ser "tier 1".
 */
export function balanceFromReputation(rep: number): number {
  return Math.round(40_000 * Math.exp(0.075 * rep) / 10_000) * 10_000;
}

function makeFinance(
  club: Club,
  tier: number,
  players: Record<string, Player>,
  squadIds: string[],
): Finance {
  const wages = squadIds.reduce((s, id) => s + (players[id]?.wage ?? 0), 0);
  const balance = balanceFromReputation(club.reputation);

  const fin: Finance = {
    clubId: club.id,
    balance,
    // Fatias derivadas do saldo — `syncBudgets` preenche-as em baixo, depois de
    // as despesas correntes estarem calculadas (a reserva salarial depende delas).
    transferBudget: 0,
    wageBudget: Math.round(wages * 1.3),
    income: { tickets: 0, sponsorship: 0, tvRights: 0, merchandising: 0 },
    expenses: { wages, facilities: 0, staff: 0 },
  };
  // Receitas/staff a partir da reputação E do escalão — a MESMA fórmula do
  // rollover (recalcIncome), para o arranque e as épocas seguintes baterem certo.
  recalcIncome(club, tier, fin);
  syncBudgets(fin);
  return fin;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
