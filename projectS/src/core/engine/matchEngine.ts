import {
  MatchEvent,
  MatchResult,
  Player,
  PlayerMatchStat,
  POSITION_GROUP,
  Side,
  Tactic,
} from '../models';
import { deriveSeed, Rng } from './rng';
import { computeTeamStrength, TeamStrength } from './teamStrength';

/** Parâmetros afináveis do motor. Isolados para tuning fácil. */
const CFG = {
  matchMinutes: 90,
  homeAdvantage: 1.08,
  baseShotsPer90: 11,
  onTargetBase: 0.34,
  onTargetSwing: 0.22,
  goalBase: 0.32,
  goalSwing: 0.3,
  yellowPer90: 3.2,
  injuryPerMatch: 0.12,
  assistChance: 0.7,
  redWeaken: 0.9,
};

interface SideCtx {
  clubId: string;
  side: Side;
  strength: TeamStrength;
  scorers: { id: string; weight: number }[];
  assisters: { id: string; weight: number }[];
  outfield: string[];
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  reds: number;
}

/** Estado interno completo de uma simulação (permite pausar/retomar ao intervalo). */
interface Sim {
  rng: Rng;
  home: SideCtx;
  away: SideCtx;
  events: MatchEvent[];
  stat: Record<string, PlayerMatchStat>;
  statSide: Record<string, Side>;
  statGroup: Record<string, string>;
  yellowCount: Record<string, number>;
  orderedIds: string[];
  homePossession: number;
  homeRate: number;
  awayRate: number;
}

/** Segunda parte com tática alterada (substituições + mentalidade/ritmo) para um lado. */
export interface HalftimeChange {
  side: Side;
  tactic: Tactic;
}

function buildSide(
  clubId: string, side: Side, strength: TeamStrength, tactic: Tactic, players: Record<string, Player>,
): SideCtx {
  const scorers: { id: string; weight: number }[] = [];
  const assisters: { id: string; weight: number }[] = [];
  const outfield: string[] = [];
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    const group = POSITION_GROUP[slot.position];
    if (group !== 'GOALKEEPER') {
      outfield.push(p.id);
      assisters.push({ id: p.id, weight: p.attributes.passing + p.attributes.vision });
    }
    const posW = group === 'ATTACK' ? 1.0 : group === 'MIDFIELD' ? 0.45 : group === 'DEFENCE' ? 0.12 : 0;
    if (posW > 0) scorers.push({ id: p.id, weight: p.attributes.finishing * posW });
  }
  return { clubId, side, strength, scorers, assisters, outfield, goals: 0, shots: 0, onTarget: 0, xg: 0, reds: 0 };
}

const shotRatePerMin = (atk: SideCtx, def: SideCtx) => {
  const ratio = atk.strength.attack / def.strength.defence;
  const tempoAvg = (atk.strength.tempoFactor + def.strength.tempoFactor) / 2;
  const pressBoost = 1 + (atk.strength.pressing - 5) * 0.03;
  const turnoverBoost = 1 + (def.strength.creativity - 5) * 0.012;
  const expected = CFG.baseShotsPer90 * ratio * tempoAvg * pressBoost * turnoverBoost;
  return Math.min(0.9, expected / CFG.matchMinutes);
};

function recomputeRates(sim: Sim): void {
  sim.homeRate = shotRatePerMin(sim.home, sim.away);
  sim.awayRate = shotRatePerMin(sim.away, sim.home);
}

function pickWeighted(rng: Rng, pool: { id: string; weight: number }[]): string | null {
  if (pool.length === 0) return null;
  return pool[rng.weightedIndex(pool.map((x) => x.weight))]!.id;
}

/**
 * Substitui a tática de um lado ao intervalo: recalcula força e conjuntos a
 * partir do novo onze (substituições + mentalidade/ritmo), MANTENDO golos/remates/
 * cartões acumulados. Jogadores expulsos ficam de fora; os que entram ganham
 * ficha de estatística. Não consome RNG → a 1ª parte permanece idêntica.
 */
function applyHalftime(sim: Sim, side: SideCtx, tactic: Tactic, players: Record<string, Player>): void {
  const fresh = buildSide(side.clubId, side.side, computeTeamStrength(tactic, players), tactic, players);
  // Aplica vantagem de casa (a força é recalculada de raiz).
  if (side.side === 'HOME') { fresh.strength.attack *= CFG.homeAdvantage; fresh.strength.defence *= CFG.homeAdvantage; }
  // Enfraquece pelo nº de expulsos já sofridos.
  for (let r = 0; r < side.reds; r++) { fresh.strength.attack *= CFG.redWeaken; fresh.strength.defence *= CFG.redWeaken; }
  // Retira dos conjuntos quem foi expulso (não pode voltar).
  const isOff = (id: string) => sim.stat[id]?.red === true;
  side.strength = fresh.strength;
  side.scorers = fresh.scorers.filter((x) => !isOff(x.id));
  side.assisters = fresh.assisters.filter((x) => !isOff(x.id));
  side.outfield = fresh.outfield.filter((id) => !isOff(id));
  // Fichas para jogadores NOVOS (que entraram).
  for (const slot of tactic.lineup) {
    const id = slot.playerId;
    if (!players[id] || sim.stat[id]) continue;
    sim.stat[id] = { goals: 0, assists: 0, yellow: 0, red: false, rating: 6 };
    sim.statSide[id] = side.side;
    sim.statGroup[id] = POSITION_GROUP[slot.position];
    sim.yellowCount[id] = 0;
    sim.orderedIds.push(id);
  }
}

function resolveShot(sim: Sim, atk: SideCtx, def: SideCtx, minute: number): void {
  const { rng, events, stat } = sim;
  atk.shots++;
  const ratio = atk.strength.attack / (atk.strength.attack + def.strength.defence);
  const onTargetP = CFG.onTargetBase + (ratio - 0.5) * CFG.onTargetSwing + (atk.strength.creativity - 5) * 0.01;
  const goalPForXg = Math.max(0.02, Math.min(0.95,
    CFG.goalBase + (ratio - 0.5) * CFG.goalSwing + (def.strength.defensiveLine - 5) * 0.012));
  atk.xg += Math.max(0.01, Math.min(0.95, onTargetP)) * goalPForXg;
  if (!rng.chance(onTargetP)) {
    events.push({ minute, type: 'CHANCE', side: atk.side, playerId: pickWeighted(rng, atk.scorers), text: 'Remate perto do poste, mas por fora.' });
    return;
  }
  atk.onTarget++;
  const goalP = CFG.goalBase + (ratio - 0.5) * CFG.goalSwing + (def.strength.defensiveLine - 5) * 0.012;
  if (rng.chance(goalP)) {
    atk.goals++;
    const scorer = pickWeighted(rng, atk.scorers);
    if (scorer) stat[scorer]!.goals++;
    events.push({ minute, type: 'GOAL', side: atk.side, playerId: scorer, text: 'GOLO!' });
    if (rng.chance(CFG.assistChance)) {
      const assister = pickWeighted(rng, atk.assisters.filter((a) => a.id !== scorer));
      if (assister) { stat[assister]!.assists++; events.push({ minute, type: 'ASSIST', side: atk.side, playerId: assister, text: 'Assistência.' }); }
    }
  } else {
    events.push({ minute, type: 'SAVE', side: atk.side, playerId: pickWeighted(rng, atk.scorers), text: 'Grande defesa do guarda-redes!' });
  }
}

function bookPlayer(sim: Sim, side: SideCtx, minute: number): void {
  if (side.outfield.length === 0) return;
  const id = sim.rng.pick(side.outfield);
  sim.stat[id]!.yellow++;
  sim.yellowCount[id]!++;
  sim.events.push({ minute, type: 'YELLOW_CARD', side: side.side, playerId: id, text: 'Cartão amarelo.' });
  if (sim.yellowCount[id]! >= 2) {
    sim.stat[id]!.red = true;
    sim.events.push({ minute, type: 'RED_CARD', side: side.side, playerId: id, text: 'Expulso! Segundo amarelo.' });
    side.scorers = side.scorers.filter((x) => x.id !== id);
    side.assisters = side.assisters.filter((x) => x.id !== id);
    side.outfield = side.outfield.filter((x) => x !== id);
    side.reds++;
    side.strength.attack *= CFG.redWeaken;
    side.strength.defence *= CFG.redWeaken;
    recomputeRates(sim);
  }
}

/** Simula um intervalo de minutos [from, to] no contexto atual. */
function simulateMinutes(sim: Sim, from: number, to: number): void {
  const yellowPerMin = CFG.yellowPer90 / CFG.matchMinutes;
  for (let minute = from; minute <= to; minute++) {
    if (minute === 45) {
      sim.events.push({ minute, type: 'HALF_TIME', side: null, playerId: null, text: `Intervalo: ${sim.home.goals}-${sim.away.goals}` });
    }
    if (sim.rng.chance(sim.homeRate)) resolveShot(sim, sim.home, sim.away, minute);
    if (sim.rng.chance(sim.awayRate)) resolveShot(sim, sim.away, sim.home, minute);
    if (sim.rng.chance(yellowPerMin)) {
      const idx = sim.rng.weightedIndex([5 + sim.home.strength.pressing, 5 + sim.away.strength.pressing]);
      bookPlayer(sim, idx === 0 ? sim.home : sim.away, minute);
    }
  }
}

function buildSim(
  homeClubId: string, awayClubId: string, homeTactic: Tactic, awayTactic: Tactic,
  players: Record<string, Player>, seed: number,
): Sim {
  const rng = new Rng(seed);
  const homeStr = computeTeamStrength(homeTactic, players);
  const awayStr = computeTeamStrength(awayTactic, players);
  homeStr.attack *= CFG.homeAdvantage;
  homeStr.defence *= CFG.homeAdvantage;
  const home = buildSide(homeClubId, 'HOME', homeStr, homeTactic, players);
  const away = buildSide(awayClubId, 'AWAY', awayStr, awayTactic, players);

  const stat: Record<string, PlayerMatchStat> = {};
  const statSide: Record<string, Side> = {};
  const statGroup: Record<string, string> = {};
  const yellowCount: Record<string, number> = {};
  const orderedIds: string[] = [];
  for (const [ctx, tactic] of [[home, homeTactic], [away, awayTactic]] as const) {
    for (const slot of tactic.lineup) {
      const p = players[slot.playerId];
      if (!p) continue;
      stat[p.id] = { goals: 0, assists: 0, yellow: 0, red: false, rating: 6 };
      statSide[p.id] = ctx.side;
      statGroup[p.id] = POSITION_GROUP[slot.position];
      yellowCount[p.id] = 0;
      orderedIds.push(p.id);
    }
  }
  const midTotal = homeStr.midfield + awayStr.midfield;
  const homePossession = Math.round((homeStr.midfield / midTotal) * 100);
  const sim: Sim = { rng, home, away, events: [], stat, statSide, statGroup, yellowCount, orderedIds, homePossession, homeRate: 0, awayRate: 0 };
  recomputeRates(sim);
  sim.events.push({ minute: 0, type: 'KICKOFF', side: null, playerId: null, text: 'Arranque da partida.' });
  return sim;
}

function finalize(homeClubId: string, awayClubId: string, seed: number, sim: Sim): MatchResult {
  sim.events.push({ minute: 90, type: 'FULL_TIME', side: null, playerId: null, text: `Fim: ${sim.home.goals}-${sim.away.goals}` });
  // Lesões — uma vez por equipa (mesmo comportamento de antes).
  for (const s of [sim.home, sim.away]) {
    if (s.outfield.length > 0 && sim.rng.chance(CFG.injuryPerMatch)) {
      sim.events.push({ minute: sim.rng.int(10, 85), type: 'INJURY', side: s.side, playerId: sim.rng.pick(s.outfield), text: 'Jogador sai lesionado.' });
    }
  }
  sim.events.sort((a, b) => a.minute - b.minute);

  const won = (side: Side) => (side === 'HOME' ? sim.home.goals > sim.away.goals : sim.away.goals > sim.home.goals);
  const drew = sim.home.goals === sim.away.goals;
  const concededBy = (side: Side) => (side === 'HOME' ? sim.away.goals : sim.home.goals);
  let motm: string | null = null, best = -1;
  for (const id of sim.orderedIds) {
    const st = sim.stat[id]!; const side = sim.statSide[id]!; const group = sim.statGroup[id]!;
    let r = 6.2 + (sim.rng.next() * 0.6 - 0.3);
    r += st.goals * 1.1 + st.assists * 0.7;
    r += won(side) ? 0.4 : drew ? 0 : -0.3;
    r -= st.yellow * 0.3;
    if (st.red) r -= 1.8;
    if ((group === 'GOALKEEPER' || group === 'DEFENCE') && concededBy(side) === 0) r += 0.6;
    st.rating = Math.max(3, Math.min(10, Math.round(r * 10) / 10));
    if (st.rating > best) { best = st.rating; motm = id; }
  }

  return {
    homeClubId, awayClubId, seed,
    home: { goals: sim.home.goals, shots: sim.home.shots, shotsOnTarget: sim.home.onTarget, possession: sim.homePossession, xg: Math.round(sim.home.xg * 100) / 100 },
    away: { goals: sim.away.goals, shots: sim.away.shots, shotsOnTarget: sim.away.onTarget, possession: 100 - sim.homePossession, xg: Math.round(sim.away.xg * 100) / 100 },
    events: sim.events,
    playerStats: sim.stat,
    motm,
  };
}

/**
 * Simula uma partida completa de forma determinística.
 *
 * Se `halftime` for dado, a 2ª parte (46-90) desse lado usa a nova tática
 * (substituições + mentalidade/ritmo). A 1ª parte (1-45) é SEMPRE idêntica à
 * simulação sem `halftime` — a mesma seed e a mesma tática até ao 45' garantem-no.
 */
export function simulateMatch(
  homeClubId: string, awayClubId: string, homeTactic: Tactic, awayTactic: Tactic,
  players: Record<string, Player>, baseSeed: number, halftime?: HalftimeChange,
): MatchResult {
  const seed = deriveSeed(baseSeed, homeClubId, awayClubId);
  const sim = buildSim(homeClubId, awayClubId, homeTactic, awayTactic, players, seed);
  simulateMinutes(sim, 1, 45);
  if (halftime) {
    applyHalftime(sim, halftime.side === 'HOME' ? sim.home : sim.away, halftime.tactic, players);
    recomputeRates(sim);
  }
  simulateMinutes(sim, 46, 90);
  return finalize(homeClubId, awayClubId, seed, sim);
}
