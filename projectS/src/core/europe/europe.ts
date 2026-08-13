/**
 * PROVAS EUROPEIAS — construção e simulação (fase de liga; eliminatórias em
 * knockout.ts). Reutiliza o motor pesado ([engine](../engine)) para os jogos do
 * clube gerido (jogáveis, com adversários de plantel real materializados sob
 * demanda) e um placar barato tipo `bgScore` para os outros 34 jogos de cada
 * jornada. Determinístico via `deriveSeed`.
 */
import { GameState, hasPlan, MatchResult, Player, Tactic, Club, Side, defaultFacilities } from '../models';
import { Rng, deriveSeed } from '../engine/rng';
import { simulateMatch, TacticChange } from '../engine';
import { WORLD_TEAMS } from '../data/world/worldTeams';
import { loadCountryPlayers } from '../data/world/playerIndex';
import { makePlayerFromBase, decodeTuple } from '../game/newGame';
import { autoPickLineup } from '../game/lineup';
import {
  EuroComp, EURO_COMPS, EuroCompetitionState, EuroFixture, EuroRow, EuropeState, EURO_PRIZES,
  emptyEuroRow, isActiveClubId, leaguePhaseRounds, teamIdOf, worldTeamOfClub,
} from './types';
import { QualifyResult } from './qualify';
import { drawLeaguePhase } from './draw';
import { baseCoefficients } from './coefficient';
import { moveMoney } from '../economy';

const forcaOfClub = (clubId: string): number => worldTeamOfClub(clubId)?.forca ?? 60;

/**
 * Paga um prémio europeu a um clube — SÓ se tiver finanças no estado (clube gerido
 * ou clubes do país ativo). Clubes de fundo não têm finanças → saltados. Metade
 * também reforça o orçamento de transferências (padrão da Taça).
 */
export function awardEuroPrize(state: GameState, clubId: string, amount: number): void {
  const fin = state.finances[clubId];
  if (!fin || amount <= 0) return;
  moveMoney(fin, amount);
}

// ---------- Construção da campanha ----------

/**
 * Constrói o estado europeu de uma época a partir da qualificação. Sorteia a fase
 * de liga das 3 provas e materializa os adversários do clube gerido na SUA prova
 * (para os jogos serem a motor completo). `cadence` = jornadas de liga entre
 * jornadas europeias.
 */
export function buildEuropeCampaign(
  state: GameState, q: QualifyResult, season: number, cadence: number,
  coefficients?: Record<string, number>,
): EuropeState {
  const competitions = {} as Record<EuroComp, EuroCompetitionState>;
  for (const comp of EURO_COMPS) {
    const entries = q.byComp[comp];
    const rounds = leaguePhaseRounds(comp);
    const rng = new Rng(deriveSeed(state.meta.rngSeed, 'euro', 'draw', comp, season));
    const fixtures = drawLeaguePhase(entries, comp, rounds, rng);
    competitions[comp] = {
      comp, entries, rounds,
      table: entries.map((e) => emptyEuroRow(e.clubId)),
      fixtures, matchday: 0, stage: 'LEAGUE', ties: [], winnerClubId: null,
    };
  }

  const europe: EuropeState = {
    season, managedComp: q.managedComp, competitions,
    superCup: null, cadence, euroRound: 0,
    coefficients: coefficients ?? baseCoefficients(),
  };

  // Prémio de ENTRADA (aos clubes com finanças: gerido + país ativo).
  for (const comp of EURO_COMPS) {
    for (const e of competitions[comp].entries) awardEuroPrize(state, e.clubId, EURO_PRIZES[comp].entry);
  }

  // Materializa os adversários (de fundo) do clube gerido na fase de liga.
  if (q.managedComp) {
    const managedId = state.meta.managedClubId;
    const cs = competitions[q.managedComp];
    for (const f of cs.fixtures) {
      const opp = f.homeId === managedId ? f.awayId : f.awayId === managedId ? f.homeId : null;
      if (opp) ensureMaterialized(state, opp, season);
    }
  }
  return europe;
}

/**
 * Garante que um clube estrangeiro (`eu_<teamId>`) existe no estado com plantel +
 * tática reais, para o motor o poder simular. Clubes do país ativo (`club_…`) já
 * existem. Idempotente.
 */
export function ensureMaterialized(state: GameState, clubId: string, season: number): void {
  if (isActiveClubId(clubId) || state.clubs[clubId]) return;
  const teamId = teamIdOf(clubId);
  const wt = WORLD_TEAMS.find((t) => t.id === teamId);
  if (!wt) return;

  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'eumat', teamId, season));
  const squadIds: string[] = [];
  loadCountryPlayers(wt.slug)
    .filter((tp) => tp[0] === teamId)
    .forEach((tp, i) => {
      const p: Player = makePlayerFromBase(`${clubId}_p${i}`, clubId, decodeTuple(tp), season, rng);
      state.players[p.id] = p;
      squadIds.push(p.id);
    });

  const club: Club = {
    id: clubId, name: wt.name, shortName: wt.sigla, country: wt.slug, leagueId: `eu_${wt.slug}`,
    primaryColor: wt.color, secondaryColor: '#ffffff',
    stadiumName: `Estádio ${wt.name.split(' ')[0] ?? wt.name}`,
    stadiumCapacity: 30000, reputation: Math.round(wt.forca), facilities: defaultFacilities(),
    squad: squadIds, european: true,
  };
  state.clubs[clubId] = club;
  const tactic: Tactic = autoPickLineup(clubId, squadIds, state.players);
  state.tactics[clubId] = tactic;
}

/**
 * Recalcula a prova do clube gerido após uma MUDANÇA de clube (despedimento ou
 * oferta de mérito). Se o novo clube estiver numa prova, materializa os seus
 * adversários da fase de liga (para os jogos serem jogáveis).
 */
export function retargetManagedEurope(state: GameState): void {
  const eu = state.europe;
  if (!eu) return;
  const id = state.meta.managedClubId;
  eu.managedComp = EURO_COMPS.find((c) => eu.competitions[c].entries.some((e) => e.clubId === id)) ?? null;
  if (!eu.managedComp) return;
  const cs = eu.competitions[eu.managedComp];
  for (const f of cs.fixtures) {
    const opp = f.homeId === id ? f.awayId : f.awayId === id ? f.homeId : null;
    if (opp) ensureMaterialized(state, opp, eu.season);
  }
}

/**
 * Re-materializa os adversários do clube gerido a partir de `state.europe` — usado
 * ao CARREGAR um save (os clubes europeus temporários não são gravados; são
 * deriváveis por serem deterministas). Restaura os plantéis dos adversários da
 * fase de liga, das eliminatórias da ronda corrente e da Supertaça, com IDs iguais
 * aos que os resultados guardados referenciam.
 */
export function rematerializeEurope(state: GameState): void {
  const eu = state.europe;
  if (!eu) return;
  const managedId = state.meta.managedClubId;
  const opp = (homeId: string, awayId: string) =>
    homeId === managedId ? awayId : awayId === managedId ? homeId : null;
  const mat = (homeId: string, awayId: string) => {
    const o = opp(homeId, awayId);
    if (o) ensureMaterialized(state, o, eu.season);
  };
  if (eu.managedComp) {
    const cs = eu.competitions[eu.managedComp];
    for (const f of cs.fixtures) mat(f.homeId, f.awayId);
    for (const t of cs.ties) for (const l of t.legs) mat(l.homeId, l.awayId);
  }
  if (eu.superCup) mat(eu.superCup.fixture.homeId, eu.superCup.fixture.awayId);
}

/** Remove do estado todos os clubes/jogadores/táticas europeus temporários. */
export function dematerializeEurope(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    if (!club.european) continue;
    for (const pid of club.squad) delete state.players[pid];
    delete state.clubs[club.id];
    delete state.tactics[club.id];
  }
}

// ---------- Simulação de um jogo ----------

/** MatchResult mínimo para os jogos NÃO jogáveis (só placar; sem eventos). */
function cheapResult(homeId: string, awayId: string, gh: number, ga: number, seed: number): MatchResult {
  const zero = () => ({ goals: 0, shots: 0, shotsOnTarget: 0, possession: 50, xg: 0 });
  const home = { ...zero(), goals: gh };
  const away = { ...zero(), goals: ga };
  return { homeClubId: homeId, awayClubId: awayId, home, away, events: [], seed };
}

/** Placar barato a partir das forças (Poisson; vantagem de casa) — igual ao fundo. */
function quickScore(fH: number, fA: number, rng: Rng): [number, number] {
  const diff = fH + 4 - fA;
  const lamH = Math.max(0.2, Math.min(4.5, 1.35 + diff * 0.03));
  const lamA = Math.max(0.2, Math.min(4.5, 1.35 - diff * 0.03));
  return [poisson(lamH, rng), poisson(lamA, rng)];
}
function poisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

/**
 * Simula um jogo europeu. Se o clube gerido joga (e tem táticas de ambos os
 * lados no estado) → motor completo (jogável/golos animados). Senão → placar
 * barato. Muta `f.result`.
 */
export function playEuroFixture(state: GameState, f: EuroFixture): void {
  const managedId = state.meta.managedClubId;
  const seed = deriveSeed(state.meta.rngSeed, 'euromatch', f.comp, f.id);
  const involvesManaged = f.homeId === managedId || f.awayId === managedId;
  const hT = state.tactics[f.homeId];
  const aT = state.tactics[f.awayId];
  if (involvesManaged && hT && aT) {
    const plan = hasPlan(state.career.gamePlan) ? state.career.gamePlan : undefined;
    f.result = simulateMatch(f.homeId, f.awayId, hT, aT, state.players, seed, undefined, {
      homePlan: f.homeId === managedId ? plan : undefined,
      awayPlan: f.awayId === managedId ? plan : undefined,
    });
    return;
  }
  const rng = new Rng(seed);
  const [gh, ga] = quickScore(forcaOfClub(f.homeId), forcaOfClub(f.awayId), rng);
  f.result = cheapResult(f.homeId, f.awayId, gh, ga, seed);
}

/** Aplica (sinal +1) ou reverte (-1) o resultado de um jogo da fase de liga à tabela. */
function tableApply(cs: EuroCompetitionState, f: EuroFixture, sign: 1 | -1): void {
  if (!f.result) return;
  const byId = new Map(cs.table.map((r) => [r.clubId, r]));
  const rh = byId.get(f.homeId), ra = byId.get(f.awayId);
  if (!rh || !ra) return;
  const gh = f.result.home.goals, ga = f.result.away.goals;
  rh.P += sign; ra.P += sign; rh.GF += sign * gh; rh.GA += sign * ga; ra.GF += sign * ga; ra.GA += sign * gh;
  if (gh > ga) { rh.W += sign; rh.Pts += sign * 3; ra.L += sign; }
  else if (gh < ga) { ra.W += sign; ra.Pts += sign * 3; rh.L += sign; }
  else { rh.D += sign; ra.D += sign; rh.Pts += sign; ra.Pts += sign; }
}
const applyToTable = (cs: EuroCompetitionState, f: EuroFixture) => tableApply(cs, f, 1);

/** Um ajuste em jogo europeu (onze/mentalidade/ritmo a partir de `minute`). */
export interface EuroMatchAdjustment {
  minute: number; lineup: Tactic['lineup']; mentality: Tactic['mentality']; tempo: Tactic['tempo'];
}

/**
 * Substituições ao vivo num jogo da FASE DE LIGA do clube gerido: re-simula com a
 * seed europeia + as mudanças de tática, revertendo/reaplicando à tabela. Só fase
 * de liga (as eliminatórias já resolveram o vencedor — watch-only, como a Taça).
 */
export function applyEuroMatchChanges(
  state: GameState, fixtureId: string, adjustments: EuroMatchAdjustment[],
): MatchResult | null {
  const eu = state.europe;
  if (!eu || !eu.managedComp) return null;
  const cs = eu.competitions[eu.managedComp];
  const f = cs.fixtures.find((x) => x.id === fixtureId);
  if (!f || !f.result) return null;
  const managedId = state.meta.managedClubId;
  const managedSide: Side | null = f.homeId === managedId ? 'HOME' : f.awayId === managedId ? 'AWAY' : null;
  if (!managedSide) return null;
  const hT = state.tactics[f.homeId], aT = state.tactics[f.awayId];
  if (!hT || !aT) return null;

  const base = managedSide === 'HOME' ? hT : aT;
  const changes: TacticChange[] = adjustments.map((a) => ({
    side: managedSide, minute: a.minute,
    tactic: { ...base, lineup: a.lineup, mentality: a.mentality, tempo: a.tempo },
  }));

  tableApply(cs, f, -1); // reverte o resultado antigo
  const seed = deriveSeed(state.meta.rngSeed, 'euromatch', f.comp, f.id);
  const nr = simulateMatch(f.homeId, f.awayId, hT, aT, state.players, seed, changes);
  f.result = nr;
  tableApply(cs, f, 1);
  return nr;
}

// ---------- Tabela / desempates / corte ----------

/**
 * Classificação ordenada (subconjunto do art. 18: pontos, diferença de golos,
 * golos marcados, vitórias, menos sofridos; força como último desempate).
 */
export function euroTableSorted(cs: EuroCompetitionState): EuroRow[] {
  return [...cs.table].sort((a, b) =>
    b.Pts - a.Pts ||
    (b.GF - b.GA) - (a.GF - a.GA) ||
    b.GF - a.GF ||
    b.W - a.W ||
    a.GA - b.GA ||
    forcaOfClub(b.clubId) - forcaOfClub(a.clubId) ||
    (a.clubId < b.clubId ? -1 : 1),
  );
}

/** Corte da fase de liga: 1–8 diretos aos oitavos, 9–24 play-off, 25–36 fora. */
export interface EuroCut { direct: string[]; playoff: string[]; out: string[] }
export function euroCut(cs: EuroCompetitionState): EuroCut {
  const sorted = euroTableSorted(cs).map((r) => r.clubId);
  return { direct: sorted.slice(0, 8), playoff: sorted.slice(8, 24), out: sorted.slice(24) };
}

// ---------- Jornada da fase de liga ----------

/**
 * Joga a próxima jornada da fase de liga em TODAS as provas ainda em fase de liga.
 * Devolve os jogos do clube gerido nessa jornada (para a UI os poder jogar ao
 * vivo). A transição para as eliminatórias é feita por knockout.ts.
 */
export function playLeagueMatchday(state: GameState): EuroFixture[] {
  const eu = state.europe;
  if (!eu) return [];
  const managedId = state.meta.managedClubId;
  const managed: EuroFixture[] = [];

  for (const comp of EURO_COMPS) {
    const cs = eu.competitions[comp];
    if (cs.stage !== 'LEAGUE') continue;
    const md = cs.matchday + 1;
    if (md > cs.rounds) continue;
    const P = EURO_PRIZES[comp];
    for (const f of cs.fixtures.filter((x) => x.matchday === md)) {
      playEuroFixture(state, f);
      applyToTable(cs, f);
      const gh = f.result!.home.goals, ga = f.result!.away.goals;
      if (gh > ga) awardEuroPrize(state, f.homeId, P.win);
      else if (ga > gh) awardEuroPrize(state, f.awayId, P.win);
      else { awardEuroPrize(state, f.homeId, P.draw); awardEuroPrize(state, f.awayId, P.draw); }
      if (f.homeId === managedId || f.awayId === managedId) managed.push(f);
    }
    cs.matchday = md;
  }
  return managed;
}

/** True se todas as provas já saíram da fase de liga (para o motor de KO assumir). */
export function leaguePhaseComplete(eu: EuropeState): boolean {
  return EURO_COMPS.every((c) => eu.competitions[c].matchday >= eu.competitions[c].rounds);
}
