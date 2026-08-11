import {
  CornerFocus,
  MatchEvent,
  MatchResult,
  Player,
  PlayerMatchStat,
  POSITION_GROUP,
  ROLE_SPECS,
  effectiveRole,
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
  /** Num dérbi, a vantagem de casa sobe disto (1.08 → 1.13). */
  derbyHomeExtra: 0.05,
  /** …e sai mais cartão. */
  derbyCardFactor: 1.3,
  /** Livres em zona de remate por jogo (por equipa). */
  freeKicksPer90: 0.95,
  /** Cantos por jogo (por equipa) — escalados pela pressão ofensiva. */
  cornersPer90: 4.8,
};

/**
 * Instrução de canto → o que muda no lance.
 *
 * `direct` mexe na probabilidade de golo direto do canto; `aerial` diz quanto
 * do lance se decide no ar (e portanto quanto pesa o cabeceamento das duas
 * equipas). O canto curto tira a bola do ar: converte menos, mas também não
 * depende de ter gente alta.
 */
const CORNER_MOD: Record<CornerFocus, { direct: number; aerial: number }> = {
  MIXED: { direct: 0, aerial: 1 },
  NEAR: { direct: 0.006, aerial: 1.25 },
  FAR: { direct: 0.004, aerial: 1.15 },
  SHORT: { direct: -0.007, aerial: 0.45 },
};

interface SideCtx {
  clubId: string;
  side: Side;
  strength: TeamStrength;
  scorers: { id: string; weight: number }[];
  assisters: { id: string; weight: number }[];
  /** Quem sobe à área nos cantos — inclui centrais, que é como se marca de canto. */
  headers: { id: string; weight: number }[];
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
  homeSetPieceRate: SetPieceRate;
  awaySetPieceRate: SetPieceRate;
  derby: boolean;
}

/** Probabilidade POR MINUTO de haver um livre perigoso / um canto. */
interface SetPieceRate { fk: number; corner: number; }

/**
 * Mudança de tática (substituições + mentalidade/ritmo) para um lado, a entrar
 * em vigor A PARTIR do minuto seguinte a `minute` (45 = intervalo). Podem
 * empilhar-se várias ao longo do jogo (subs ao 45', depois ao 60', …).
 */
export interface TacticChange {
  side: Side;
  tactic: Tactic;
  minute: number;
}

/** Contexto do jogo que não vem da tática de nenhuma das equipas. */
export interface MatchContext {
  /**
   * Dérbi. A casa vale mais (o estádio está cheio e é dele) e joga-se mais
   * áspero — a diferença é pequena por lance, mas decide dérbis.
   */
  derby?: boolean;
}

function buildSide(
  clubId: string, side: Side, strength: TeamStrength, tactic: Tactic, players: Record<string, Player>,
): SideCtx {
  const scorers: { id: string; weight: number }[] = [];
  const assisters: { id: string; weight: number }[] = [];
  const headers: { id: string; weight: number }[] = [];
  const outfield: string[] = [];
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    const group = POSITION_GROUP[slot.position];
    if (group !== 'GOALKEEPER') {
      outfield.push(p.id);
      assisters.push({ id: p.id, weight: p.attributes.passing + p.attributes.vision });
      // Nos cantos sobem avançados e centrais; os laterais ficam a cobrir.
      const upW = group === 'ATTACK' ? 1 : group === 'MIDFIELD' ? 0.5
        : slot.position === 'CB' ? 0.9 : 0.2;
      const aerialRole = 1 + (ROLE_SPECS[effectiveRole(slot.role, slot.position)]?.aerial ?? 0);
      headers.push({ id: p.id, weight: (p.attributes.heading * 0.75 + p.attributes.strength * 0.25) * upW * aerialRole });
    }
    const posW = group === 'ATTACK' ? 1.0 : group === 'MIDFIELD' ? 0.45 : group === 'DEFENCE' ? 0.12 : 0;
    if (posW > 0) scorers.push({ id: p.id, weight: p.attributes.finishing * posW });
  }
  return { clubId, side, strength, scorers, assisters, headers, outfield, goals: 0, shots: 0, onTarget: 0, xg: 0, reds: 0 };
}

const shotRatePerMin = (atk: SideCtx, def: SideCtx) => {
  const ratio = atk.strength.attack / def.strength.defence;
  const tempoAvg = (atk.strength.tempoFactor + def.strength.tempoFactor) / 2;
  const pressBoost = 1 + (atk.strength.pressing - 5) * 0.03;
  const turnoverBoost = 1 + (def.strength.creativity - 5) * 0.012;
  const expected = CFG.baseShotsPer90 * ratio * tempoAvg * pressBoost * turnoverBoost;
  return Math.min(0.9, expected / CFG.matchMinutes);
};

/**
 * Frequência de bolas paradas. Cantos acompanham a pressão ofensiva (quem
 * ataca mais ganha mais cantos); livres perigosos acompanham a pressão de quem
 * DEFENDE, que é quem faz as faltas.
 */
const setPieceRatePerMin = (atk: SideCtx, def: SideCtx): SetPieceRate => {
  const pressure = Math.max(0.4, Math.min(2.2, atk.strength.attack / def.strength.defence));
  const fouls = 1 + (def.strength.pressing - 5) * 0.05;
  return {
    fk: (CFG.freeKicksPer90 * pressure * fouls) / CFG.matchMinutes,
    corner: (CFG.cornersPer90 * pressure) / CFG.matchMinutes,
  };
};

function recomputeRates(sim: Sim): void {
  sim.homeRate = shotRatePerMin(sim.home, sim.away);
  sim.awayRate = shotRatePerMin(sim.away, sim.home);
  sim.homeSetPieceRate = setPieceRatePerMin(sim.home, sim.away);
  sim.awaySetPieceRate = setPieceRatePerMin(sim.away, sim.home);
}

function pickWeighted(rng: Rng, pool: { id: string; weight: number }[]): string | null {
  if (pool.length === 0) return null;
  return pool[rng.weightedIndex(pool.map((x) => x.weight))]!.id;
}

/**
 * Substitui a tática de um lado num dado momento: recalcula força e conjuntos a
 * partir do novo onze (substituições + mentalidade/ritmo), MANTENDO golos/remates/
 * cartões acumulados. Jogadores expulsos ficam de fora; os que entram ganham
 * ficha de estatística. Não consome RNG → os minutos já jogados permanecem iguais.
 */
function applyTacticChange(sim: Sim, side: SideCtx, tactic: Tactic, players: Record<string, Player>): void {
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
  side.headers = fresh.headers.filter((x) => !isOff(x.id));
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

/**
 * LIVRE EM ZONA DE REMATE.
 *
 * Bate-o o marcador designado (ou o melhor do onze). Converte entre ~2% e ~14%
 * conforme a qualidade dele — é pouco por lance, mas ao longo de uma época um
 * especialista faz a diferença entre 6 e 12 golos de bola parada na equipa.
 */
function resolveFreeKick(sim: Sim, atk: SideCtx, def: SideCtx, minute: number): void {
  const { rng, events, stat } = sim;
  const sp = atk.strength.setPiece;
  const taker = sp.freeKickTakerId && stat[sp.freeKickTakerId] && !stat[sp.freeKickTakerId]!.red
    ? sp.freeKickTakerId
    : pickWeighted(rng, atk.scorers);
  if (!taker) return;

  atk.shots++;
  // A barreira e o guarda-redes contam: uma defesa forte tapa mais ângulo.
  const goalP = Math.max(0.015, Math.min(0.16,
    0.048 + (sp.freeKick - 10) * 0.0075 - (def.strength.defence - 12) * 0.002));
  atk.xg += goalP;
  if (rng.chance(goalP)) {
    atk.goals++;
    stat[taker]!.goals++;
    events.push({ minute, type: 'GOAL', side: atk.side, playerId: taker, text: 'GOLO de livre direto!', detail: 'FREE_KICK' });
    atk.onTarget++;
    return;
  }
  // Falhado: metade vai à baliza (defesa), metade sai ao lado.
  if (rng.chance(0.45)) {
    atk.onTarget++;
    events.push({ minute, type: 'SAVE', side: atk.side, playerId: taker, text: 'Livre à figura do guarda-redes.', detail: 'FREE_KICK' });
  } else {
    events.push({ minute, type: 'CHANCE', side: atk.side, playerId: taker, text: 'Livre por cima da barra.', detail: 'FREE_KICK' });
  }
}

/**
 * CANTO.
 *
 * O lance decide-se em duas partes: a qualidade do cruzamento (o marcador) e
 * quem ganha o ar (os quatro melhores cabeceadores contra a defesa adversária).
 * A instrução de canto pesa nas duas — o canto curto tira o lance do ar e passa
 * a valer menos golo direto, mas não pede gente alta.
 */
function resolveCorner(sim: Sim, atk: SideCtx, def: SideCtx, minute: number): void {
  const { rng, events, stat } = sim;
  const sp = atk.strength.setPiece;
  const mod = CORNER_MOD[sp.focus] ?? CORNER_MOD.MIXED;

  atk.shots++;
  const delivery = (sp.corner - 10) * 0.0016;
  const air = (sp.aerialAttack - def.strength.setPiece.aerialDefence) * 0.0035 * mod.aerial;
  const goalP = Math.max(0.004, Math.min(0.09, 0.018 + delivery + air + mod.direct));
  atk.xg += goalP;

  if (rng.chance(goalP)) {
    // Quem remata no canto é quem sobe: com foco curto, quem remata é de fora.
    const pool = sp.focus === 'SHORT' ? atk.scorers : atk.headers;
    const scorer = pickWeighted(rng, pool.filter((x) => !stat[x.id]?.red)) ?? pickWeighted(rng, atk.scorers);
    if (!scorer) return;
    atk.goals++;
    atk.onTarget++;
    stat[scorer]!.goals++;
    const header = sp.focus !== 'SHORT';
    events.push({
      minute, type: 'GOAL', side: atk.side, playerId: scorer,
      text: header ? 'GOLO de cabeça, no canto!' : 'GOLO na sequência de um canto!',
      detail: header ? 'HEADER' : 'CORNER',
    });
    // O canto conta como assistência para quem o bateu (se não foi ele a marcar).
    const taker = sp.cornerTakerId;
    if (taker && taker !== scorer && stat[taker]) {
      stat[taker]!.assists++;
      events.push({ minute, type: 'ASSIST', side: atk.side, playerId: taker, text: 'Canto batido.', detail: 'CORNER' });
    }
    return;
  }
  // Sem golo, o canto ainda pode obrigar a uma defesa.
  if (rng.chance(0.22)) {
    atk.onTarget++;
    const who = pickWeighted(rng, atk.headers.length > 0 ? atk.headers : atk.scorers);
    events.push({ minute, type: 'SAVE', side: atk.side, playerId: who, text: 'Cabeceamento defendido no canto.', detail: 'CORNER' });
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
  const yellowPerMin = (CFG.yellowPer90 * (sim.derby ? CFG.derbyCardFactor : 1)) / CFG.matchMinutes;
  for (let minute = from; minute <= to; minute++) {
    if (minute === 45) {
      sim.events.push({ minute, type: 'HALF_TIME', side: null, playerId: null, text: `Intervalo: ${sim.home.goals}-${sim.away.goals}` });
    }
    if (sim.rng.chance(sim.homeRate)) resolveShot(sim, sim.home, sim.away, minute);
    if (sim.rng.chance(sim.awayRate)) resolveShot(sim, sim.away, sim.home, minute);
    // Bolas paradas — sorteadas à parte das jogadas corridas, para que uma
    // equipa possa ser perigosa nelas sem o ser no jogo aberto.
    if (sim.rng.chance(sim.homeSetPieceRate.fk)) resolveFreeKick(sim, sim.home, sim.away, minute);
    if (sim.rng.chance(sim.awaySetPieceRate.fk)) resolveFreeKick(sim, sim.away, sim.home, minute);
    if (sim.rng.chance(sim.homeSetPieceRate.corner)) resolveCorner(sim, sim.home, sim.away, minute);
    if (sim.rng.chance(sim.awaySetPieceRate.corner)) resolveCorner(sim, sim.away, sim.home, minute);
    if (sim.rng.chance(yellowPerMin)) {
      const idx = sim.rng.weightedIndex([5 + sim.home.strength.pressing, 5 + sim.away.strength.pressing]);
      bookPlayer(sim, idx === 0 ? sim.home : sim.away, minute);
    }
  }
}

function buildSim(
  homeClubId: string, awayClubId: string, homeTactic: Tactic, awayTactic: Tactic,
  players: Record<string, Player>, seed: number, derby: boolean,
): Sim {
  const rng = new Rng(seed);
  const homeStr = computeTeamStrength(homeTactic, players);
  const awayStr = computeTeamStrength(awayTactic, players);
  const homeAdv = CFG.homeAdvantage + (derby ? CFG.derbyHomeExtra : 0);
  homeStr.attack *= homeAdv;
  homeStr.defence *= homeAdv;
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
  const sim: Sim = {
    rng, home, away, events: [], stat, statSide, statGroup, yellowCount, orderedIds, homePossession,
    homeRate: 0, awayRate: 0,
    homeSetPieceRate: { fk: 0, corner: 0 }, awaySetPieceRate: { fk: 0, corner: 0 },
    derby,
  };
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
 * Cada mudança em `changes` (ordenada por minuto) troca a tática de um lado a
 * partir do minuto seguinte. Os minutos ANTES de uma mudança reproduzem-se
 * SEMPRE iguais à simulação sem essa mudança — a mesma seed e a mesma tática até
 * ao ponto de corte garantem-no (aplicar a mudança não consome RNG). Assim, um
 * treinador pode substituir ao 45', depois ao 60', mantendo o que já viu.
 */
export function simulateMatch(
  homeClubId: string, awayClubId: string, homeTactic: Tactic, awayTactic: Tactic,
  players: Record<string, Player>, baseSeed: number, changes?: TacticChange[],
  context?: MatchContext,
): MatchResult {
  const seed = deriveSeed(baseSeed, homeClubId, awayClubId);
  const sim = buildSim(homeClubId, awayClubId, homeTactic, awayTactic, players, seed, context?.derby === true);
  const ordered = (changes ?? [])
    .filter((c) => c.minute >= 1 && c.minute < CFG.matchMinutes)
    .sort((a, b) => a.minute - b.minute);
  let cursor = 0;
  for (const ch of ordered) {
    simulateMinutes(sim, cursor + 1, ch.minute); // [cursor+1, minute] — no-op se já passámos
    applyTacticChange(sim, ch.side === 'HOME' ? sim.home : sim.away, ch.tactic, players);
    recomputeRates(sim);
    cursor = Math.max(cursor, ch.minute);
  }
  simulateMinutes(sim, cursor + 1, CFG.matchMinutes);
  return finalize(homeClubId, awayClubId, seed, sim);
}
