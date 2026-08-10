/**
 * FASE A ELIMINAR europeia + Supertaça + driver unificado de jornada europeia.
 *
 * Corte da fase de liga: 1–8 diretos aos oitavos, 9–24 play-off, 25–36 fora. As
 * eliminatórias jogam-se a DUAS mãos (cabeça de série joga a 2ª em casa; empate
 * no total → prolongamento + penáltis pela seed, sem golos fora); a final é a UM
 * jogo. Quadro semeado pela classificação da fase de liga. Prémios por fase e
 * troféus/notícias para o clube gerido.
 */
import { GameState } from '../models';
import { Rng, deriveSeed } from '../engine/rng';
import { addNews } from '../news';
import { WORLD_TEAMS } from '../data/world/worldTeams';
import {
  EURO_COMPS, EURO_PRIZES, EuroCompetitionState, EuroFixture, EuroStage, EuroSuperCup,
  EuropeState, EuroTie, SUPERCUP_PRIZE, isActiveClubId, teamIdOf,
} from './types';
import {
  awardEuroPrize, ensureMaterialized, euroTableSorted, euroCut, playEuroFixture, playLeagueMatchday,
} from './europe';

const isKoStage = (s: EuroStage) => s !== 'LEAGUE' && s !== 'DONE';

/** Chaves i18n do nome da prova e da fase (params aninhados "@chave"). */
const compParam = (comp: string) => `@euro.name.${comp}`;
const stageParam = (stage: EuroStage) => `@euro.stage.${stage}`;

// ---------- Driver: uma jornada europeia ----------

/**
 * Avança UMA jornada europeia: joga a Supertaça (se pendente, sozinha), a próxima
 * jornada da fase de liga das provas ainda em liga, e a próxima mão de KO das que
 * já lá estão. Devolve os jogos do clube gerido (para a UI os jogar ao vivo).
 */
export function advanceEuropeMatchday(state: GameState): EuroFixture[] {
  const eu = state.europe;
  if (!eu) return [];

  // Supertaça primeiro — ocupa a sua própria jornada.
  if (eu.superCup && !eu.superCup.fixture.result) {
    const mf = playSuperCup(state, eu.superCup);
    eu.euroRound++;
    return mf ? [mf] : [];
  }

  const koBefore = EURO_COMPS.filter((c) => isKoStage(eu.competitions[c].stage));
  const managed: EuroFixture[] = [...playLeagueMatchday(state)];

  // Provas que ACABARAM a fase de liga nesta jornada → montam o play-off.
  for (const c of EURO_COMPS) {
    const cs = eu.competitions[c];
    if (cs.stage === 'LEAGUE' && cs.matchday >= cs.rounds) enterPlayoff(cs);
  }
  // Provas que JÁ estavam em KO antes desta jornada → jogam a próxima mão.
  for (const c of koBefore) managed.push(...stepKnockout(state, eu.competitions[c]));

  eu.euroRound++;
  return managed;
}

/** O que o clube gerido tem pela frente na próxima jornada europeia. */
export interface NextEuroMatch {
  comp: EuroCompetitionState['comp'];
  stage: EuroStage;
  /** Jornada da fase de liga (0 nas eliminatórias e na Supertaça). */
  matchday: number;
  opponentId: string;
  isHome: boolean;
  superCup: boolean;
}

/**
 * Prevê o PRÓXIMO jogo europeu do clube gerido — sem mutar nada. Espelha a
 * ordem de `advanceEuropeMatchday` (Supertaça → fase de liga → eliminatórias).
 *
 * Existe porque o ecrã inicial anunciava "Noite Europeia — esta semana joga-se
 * a Europa" e logo por baixo mostrava o próximo jogo do CAMPEONATO. Quem não
 * estava sequer numa prova europeia lia aquilo como "vou jogar a Europa contra
 * este". Null = há jornada europeia, mas o teu clube não joga nela.
 */
export function nextManagedEuroMatch(state: GameState): NextEuroMatch | null {
  const eu = state.europe;
  if (!eu) return null;
  const me = state.meta.managedClubId;
  const side = (f: EuroFixture): NextEuroMatch | null => {
    if (f.homeId !== me && f.awayId !== me) return null;
    const cs = eu.competitions[f.comp];
    return {
      comp: f.comp,
      stage: eu.superCup?.fixture.id === f.id ? 'FINAL' : cs.stage,
      matchday: f.matchday,
      opponentId: f.homeId === me ? f.awayId : f.homeId,
      isHome: f.homeId === me,
      superCup: eu.superCup?.fixture.id === f.id,
    };
  };

  // A Supertaça ocupa a sua própria jornada — vem sempre primeiro.
  if (eu.superCup && !eu.superCup.fixture.result) {
    const sc = side(eu.superCup.fixture);
    return sc ? { ...sc, superCup: true, stage: 'FINAL' } : null;
  }
  if (!eu.managedComp) return null;

  const cs = eu.competitions[eu.managedComp];
  if (cs.stage === 'LEAGUE') {
    const md = cs.matchday + 1;
    if (md > cs.rounds) return null;
    for (const f of cs.fixtures) if (f.matchday === md) { const r = side(f); if (r) return r; }
    return null;
  }
  if (cs.stage === 'DONE') return null;

  // Fase a eliminar: a próxima mão por jogar da eliminatória em curso.
  const legNo: 0 | 1 = cs.ties.some((t) => t.legs[0] && !t.legs[0]!.result) ? 0 : 1;
  for (const t of cs.ties) {
    const f = t.legs[legNo];
    if (!f || f.result) continue;
    const r = side(f);
    if (r) return r;
  }
  return null;
}

/** True se ainda há jogos europeus por disputar (fase de liga ou KO). */
export function europeInProgress(eu: EuropeState): boolean {
  if (eu.superCup && !eu.superCup.fixture.result) return true;
  return EURO_COMPS.some((c) => eu.competitions[c].stage !== 'DONE');
}

// ---------- Supertaça ----------

export function playSuperCup(state: GameState, sc: EuroSuperCup): EuroFixture | null {
  const managedId = state.meta.managedClubId;
  const f = sc.fixture;
  if (f.homeId === managedId || f.awayId === managedId) {
    ensureManagedOpp(state, f);
  }
  playEuroFixture(state, f);
  const r = f.result!;
  let winner: string;
  if (r.home.goals > r.away.goals) winner = f.homeId;
  else if (r.away.goals > r.home.goals) winner = f.awayId;
  else winner = new Rng(deriveSeed(state.meta.rngSeed, 'supens', f.id)).chance(0.5) ? f.homeId : f.awayId;
  sc.winnerId = winner;
  awardEuroPrize(state, winner, SUPERCUP_PRIZE);
  if (winner === managedId) {
    state.career.trophies.push({ season: state.europe!.season, key: 'trophy.superCup' });
    addNews(state, 'EURO', 'euro.news.superCupWin');
  } else if (f.homeId === managedId || f.awayId === managedId) {
    addNews(state, 'EURO', 'euro.news.superCupLoss');
  }
  return (f.homeId === managedId || f.awayId === managedId) ? f : null;
}

/** Prepara a Supertaça da PRÓXIMA época: campeão CL vs campeão EL da que acaba. */
export function setupSuperCup(state: GameState, prevEurope: EuropeState, season: number): EuroSuperCup | null {
  const cl = prevEurope.competitions.UCL.winnerClubId;
  const el = prevEurope.competitions.UEL.winnerClubId;
  if (!cl || !el) return null;
  return {
    fixture: { id: `SUPERCUP_${season}`, comp: 'UCL', matchday: 0, homeId: cl, awayId: el, result: null },
    winnerId: null,
  };
}

// ---------- Máquina de eliminatórias ----------

const SEED_ORDER_16 = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15]; // quadro semeado

/** Transição fase de liga → play-off (semeia e monta as 8 eliminatórias 9–24). */
function enterPlayoff(cs: EuroCompetitionState): void {
  cs.seedOrder = euroTableSorted(cs).map((r) => r.clubId);
  const cut = euroCut(cs);
  const seeds = cs.seedOrder;
  const seedRank = (id: string) => seeds.indexOf(id);
  // Emparelhamentos limitados pela classificação (cabeças 9–16 vs 17–24).
  const pairs: [number, number][] = [[9, 24], [10, 23], [11, 22], [12, 21], [13, 20], [14, 19], [15, 18], [16, 17]];
  cs.ties = pairs.map(([hi, lo], i) =>
    makeTie(cs.comp, 'PLAYOFF', seeds[hi - 1]!, seeds[lo - 1]!, seedRank, i, 2),
  );
  cs.stage = 'PLAYOFF';
  void cut; // (direto 1–8 esperam pelos oitavos)
}

/** Joga a próxima mão da fase de KO corrente; resolve e transita quando completa. */
function stepKnockout(state: GameState, cs: EuroCompetitionState): EuroFixture[] {
  if (cs.stage === 'DONE' || cs.ties.length === 0) return [];
  const managedId = state.meta.managedClubId;
  const legNo: 1 | 2 = cs.ties.some((t) => t.legs[0] && !t.legs[0]!.result) ? 1 : 2;
  const managed: EuroFixture[] = [];
  for (const t of cs.ties) {
    const f = t.legs[legNo - 1];
    if (!f || f.result) continue;
    ensureManagedOpp(state, f);
    playEuroFixture(state, f);
    if (f.homeId === managedId || f.awayId === managedId) managed.push(f);
  }
  const stageComplete = cs.ties.every((t) => t.legs.every((l) => l.result));
  if (stageComplete) resolveStage(state, cs);
  return managed;
}

/** Resolve todas as eliminatórias da fase e avança para a fase seguinte. */
function resolveStage(state: GameState, cs: EuroCompetitionState): void {
  const managedId = state.meta.managedClubId;
  for (const t of cs.ties) resolveTie(state, t);

  // Notícia de eliminação do clube gerido (perdeu uma eliminatória).
  const myTie = cs.ties.find((t) => t.homeSeedId === managedId || t.awaySeedId === managedId);
  if (myTie && myTie.winnerId !== managedId) {
    const oppId = myTie.homeSeedId === managedId ? myTie.awaySeedId : myTie.homeSeedId;
    addNews(state, 'EURO', 'euro.news.out', {
      comp: compParam(cs.comp), stage: stageParam(cs.stage), opp: nameOf(state, oppId),
    });
  }

  const winners = cs.ties.map((t) => t.winnerId!).filter(Boolean);
  const seeds = cs.seedOrder!;
  const seedRank = (id: string) => seeds.indexOf(id);

  if (cs.stage === 'PLAYOFF') {
    const direct = seeds.slice(0, 8);
    const sixteen = [...direct, ...winners].sort((a, b) => seedRank(a) - seedRank(b));
    for (const id of sixteen) awardEuroPrize(state, id, EURO_PRIZES[cs.comp].r16);
    cs.bracket = SEED_ORDER_16.map((s) => sixteen[s - 1]!);
    buildBracketTies(cs, 'R16', seedRank);
    cs.stage = 'R16';
  } else if (cs.stage === 'R16') {
    cs.bracket = winners;
    for (const id of winners) awardEuroPrize(state, id, EURO_PRIZES[cs.comp].qf);
    buildBracketTies(cs, 'QF', seedRank);
    cs.stage = 'QF';
  } else if (cs.stage === 'QF') {
    cs.bracket = winners;
    for (const id of winners) awardEuroPrize(state, id, EURO_PRIZES[cs.comp].sf);
    buildBracketTies(cs, 'SF', seedRank);
    cs.stage = 'SF';
  } else if (cs.stage === 'SF') {
    cs.bracket = winners;
    for (const id of winners) awardEuroPrize(state, id, EURO_PRIZES[cs.comp].finalist);
    // Final: jogo único (a "2ª mão" fica vazia).
    const [a, b] = [winners[0]!, winners[1]!];
    const hi = seedRank(a) <= seedRank(b) ? a : b;
    const lo = hi === a ? b : a;
    cs.ties = [makeTie(cs.comp, 'FINAL', hi, lo, seedRank, 0, 1)];
    cs.stage = 'FINAL';
  } else if (cs.stage === 'FINAL') {
    const champ = cs.ties[0]!.winnerId!;
    cs.winnerClubId = champ;
    awardEuroPrize(state, champ, EURO_PRIZES[cs.comp].champion);
    if (champ === managedId) {
      state.career.trophies.push({ season: state.europe!.season, key: `trophy.${cs.comp.toLowerCase()}` });
      addNews(state, 'EURO', 'euro.news.champion', { comp: compParam(cs.comp) });
    } else {
      addNews(state, 'EURO', 'euro.news.winner', { comp: compParam(cs.comp), club: nameOf(state, champ) });
    }
    cs.stage = 'DONE';
  }
}

/** Monta as eliminatórias de uma ronda a partir de cs.bracket (pares adjacentes). */
function buildBracketTies(
  cs: EuroCompetitionState, stage: EuroStage, seedRank: (id: string) => number,
): void {
  const b = cs.bracket!;
  const ties: EuroTie[] = [];
  for (let i = 0; i < b.length; i += 2) {
    const a = b[i]!, c = b[i + 1]!;
    const hi = seedRank(a) <= seedRank(c) ? a : c;
    const lo = hi === a ? c : a;
    ties.push(makeTie(cs.comp, stage, hi, lo, seedRank, i / 2, 2));
  }
  cs.ties = ties;
}

/** Cria uma eliminatória (cabeça de série = hi, joga a última mão em casa). */
function makeTie(
  comp: EuroCompetitionState['comp'], stage: EuroStage, hiId: string, loId: string,
  _seedRank: (id: string) => number, idx: number, legs: 1 | 2,
): EuroTie {
  const tieId = `${comp}_${stage}_${idx}`;
  const fixtures: EuroFixture[] = [];
  if (legs === 1) {
    fixtures.push({ id: `${tieId}_L1`, comp, matchday: 0, homeId: hiId, awayId: loId, result: null, tieId, leg: 1 });
  } else {
    // 1ª mão em casa do MENOS forte; 2ª mão em casa do cabeça de série.
    fixtures.push({ id: `${tieId}_L1`, comp, matchday: 0, homeId: loId, awayId: hiId, result: null, tieId, leg: 1 });
    fixtures.push({ id: `${tieId}_L2`, comp, matchday: 0, homeId: hiId, awayId: loId, result: null, tieId, leg: 2 });
  }
  return { tieId, comp, stage, homeSeedId: hiId, awaySeedId: loId, legs: fixtures, winnerId: null };
}

/** Resolve o vencedor de uma eliminatória (agregado; empate → prolong.+pens pela seed). */
function resolveTie(state: GameState, tie: EuroTie): void {
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'euroko', tie.tieId));
  if (tie.legs.length === 1) {
    const r = tie.legs[0]!.result!;
    tie.winnerId = r.home.goals > r.away.goals ? tie.homeSeedId
      : r.away.goals > r.home.goals ? tie.awaySeedId
      : rng.chance(0.55) ? tie.homeSeedId : tie.awaySeedId; // pens (leve favor ao cabeça)
    return;
  }
  const l1 = tie.legs[0]!.result!; // casa = awaySeed (lo)
  const l2 = tie.legs[1]!.result!; // casa = homeSeed (hi)
  const hiAgg = l1.away.goals + l2.home.goals;
  const loAgg = l1.home.goals + l2.away.goals;
  tie.winnerId = hiAgg > loAgg ? tie.homeSeedId
    : loAgg > hiAgg ? tie.awaySeedId
    : rng.chance(0.55) ? tie.homeSeedId : tie.awaySeedId; // prolong.+pens (leve favor ao cabeça)
}

// ---------- Auxiliares ----------

/** Materializa o adversário do clube gerido num jogo (se for de fundo). */
function ensureManagedOpp(state: GameState, f: EuroFixture): void {
  const managedId = state.meta.managedClubId;
  const season = state.europe?.season ?? state.meta.season;
  if (f.homeId === managedId && !isActiveClubId(f.awayId)) ensureMaterialized(state, f.awayId, season);
  if (f.awayId === managedId && !isActiveClubId(f.homeId)) ensureMaterialized(state, f.homeId, season);
}

const _names = new Map<number, string>();
for (const t of WORLD_TEAMS) _names.set(t.id, t.name);
const nameOf = (state: GameState, clubId: string): string =>
  state.clubs[clubId]?.name ?? _names.get(teamIdOf(clubId)) ?? '—';
