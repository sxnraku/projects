import {
  MatchEvent,
  MatchResult,
  Player,
  POSITION_GROUP,
  Side,
  Tactic,
} from '../models';
import { deriveSeed, Rng } from './rng';
import { computeTeamStrength, TeamStrength } from './teamStrength';

/** Parâmetros afináveis do motor. Isolados para tuning fácil. */
const CFG = {
  matchMinutes: 90,
  homeAdvantage: 1.08, // multiplicador sobre ataque+defesa da equipa da casa
  baseShotsPer90: 11, // lances esperados de referência quando ataque≈defesa
  onTargetBase: 0.34, // prob. base de um lance ir à baliza
  onTargetSwing: 0.22, // quanto o rácio ataque/defesa move o onTarget
  goalBase: 0.32, // prob. base de um remate enquadrado ser golo
  goalSwing: 0.3, // idem para golo
  yellowPer90: 3.2, // cartões amarelos esperados por partida (ambas equipas)
  injuryPerMatch: 0.12, // prob. de lesão por partida por equipa
};

interface SideCtx {
  clubId: string;
  side: Side;
  strength: TeamStrength;
  /** Jogadores que rematam, com peso = finalização. */
  scorers: { id: string; weight: number }[];
  outfield: string[]; // ids para cartões/lesões
  goals: number;
  shots: number;
  onTarget: number;
  xg: number; // golos esperados acumulados
}

function buildScorers(
  tactic: Tactic,
  players: Record<string, Player>,
): { scorers: { id: string; weight: number }[]; outfield: string[] } {
  const scorers: { id: string; weight: number }[] = [];
  const outfield: string[] = [];
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    const group = POSITION_GROUP[slot.position];
    if (group !== 'GOALKEEPER') outfield.push(p.id);
    // Avançados marcam mais; médios algum; defesas raramente.
    const posW = group === 'ATTACK' ? 1.0 : group === 'MIDFIELD' ? 0.45 : group === 'DEFENCE' ? 0.12 : 0;
    if (posW > 0) scorers.push({ id: p.id, weight: p.attributes.finishing * posW });
  }
  return { scorers, outfield };
}

function pickScorer(rng: Rng, s: SideCtx): string | null {
  if (s.scorers.length === 0) return null;
  const idx = rng.weightedIndex(s.scorers.map((x) => x.weight));
  return s.scorers[idx]!.id;
}

/**
 * Simula uma partida completa de forma determinística.
 *
 * @param homeClubId / awayClubId  clubes
 * @param homeTactic / awayTactic  táticas (onze + mentalidade + ritmo)
 * @param players                  mapa id→Player com todos os titulares de ambas as equipas
 * @param baseSeed                 seed-mãe (do GameState); a seed da partida deriva desta
 */
export function simulateMatch(
  homeClubId: string,
  awayClubId: string,
  homeTactic: Tactic,
  awayTactic: Tactic,
  players: Record<string, Player>,
  baseSeed: number,
): MatchResult {
  const seed = deriveSeed(baseSeed, homeClubId, awayClubId);
  const rng = new Rng(seed);

  const homeStr = computeTeamStrength(homeTactic, players);
  const awayStr = computeTeamStrength(awayTactic, players);
  // Vantagem de casa: reforça ataque e defesa dos anfitriões.
  homeStr.attack *= CFG.homeAdvantage;
  homeStr.defence *= CFG.homeAdvantage;

  const home: SideCtx = {
    clubId: homeClubId, side: 'HOME', strength: homeStr,
    ...buildScorers(homeTactic, players), goals: 0, shots: 0, onTarget: 0, xg: 0,
  };
  const away: SideCtx = {
    clubId: awayClubId, side: 'AWAY', strength: awayStr,
    ...buildScorers(awayTactic, players), goals: 0, shots: 0, onTarget: 0, xg: 0,
  };

  // Posse de bola decidida pelo domínio no meio-campo.
  const midTotal = homeStr.midfield + awayStr.midfield;
  const homePossession = Math.round((homeStr.midfield / midTotal) * 100);

  const events: MatchEvent[] = [];
  events.push({ minute: 0, type: 'KICKOFF', side: null, playerId: null, text: 'Arranque da partida.' });

  // Prob. de lance por minuto para cada equipa.
  // Pressing próprio cria mais lances; criatividade do ADVERSÁRIO também
  // (perdas de bola em zonas perigosas).
  const shotRatePerMin = (atk: SideCtx, def: SideCtx) => {
    const ratio = atk.strength.attack / def.strength.defence; // >1 = ataque superior
    const tempoAvg = (atk.strength.tempoFactor + def.strength.tempoFactor) / 2;
    const pressBoost = 1 + (atk.strength.pressing - 5) * 0.03;
    const turnoverBoost = 1 + (def.strength.creativity - 5) * 0.012;
    const expected = CFG.baseShotsPer90 * ratio * tempoAvg * pressBoost * turnoverBoost;
    return Math.min(0.9, expected / CFG.matchMinutes);
  };
  const homeRate = shotRatePerMin(home, away);
  const awayRate = shotRatePerMin(away, home);

  const resolveShot = (rng: Rng, atk: SideCtx, def: SideCtx, minute: number) => {
    atk.shots++;
    const ratio = atk.strength.attack / (atk.strength.attack + def.strength.defence); // 0..1
    // Criatividade própria melhora a qualidade do remate; linha alta do
    // adversário facilita o golo quando a defesa é batida (aplicado no goalP).
    const onTargetP = CFG.onTargetBase + (ratio - 0.5) * CFG.onTargetSwing
      + (atk.strength.creativity - 5) * 0.01;
    // xG do lance = probabilidade de golo ANTES de resolver (enquadrar × converter).
    const goalPForXg = Math.max(0.02, Math.min(0.95,
      CFG.goalBase + (ratio - 0.5) * CFG.goalSwing + (def.strength.defensiveLine - 5) * 0.012));
    atk.xg += Math.max(0.01, Math.min(0.95, onTargetP)) * goalPForXg;
    if (!rng.chance(onTargetP)) {
      events.push({ minute, type: 'CHANCE', side: atk.side, playerId: pickScorer(rng, atk),
        text: 'Remate perto do poste, mas por fora.' });
      return;
    }
    atk.onTarget++;
    const goalP = CFG.goalBase + (ratio - 0.5) * CFG.goalSwing
      + (def.strength.defensiveLine - 5) * 0.012;
    if (rng.chance(goalP)) {
      atk.goals++;
      const scorer = pickScorer(rng, atk);
      events.push({ minute, type: 'GOAL', side: atk.side, playerId: scorer, text: 'GOLO!' });
    } else {
      events.push({ minute, type: 'SAVE', side: atk.side, playerId: pickScorer(rng, atk),
        text: 'Grande defesa do guarda-redes!' });
    }
  };

  const yellowPerMin = CFG.yellowPer90 / CFG.matchMinutes;

  for (let minute = 1; minute <= CFG.matchMinutes; minute++) {
    if (minute === 45) {
      events.push({ minute, type: 'HALF_TIME', side: null, playerId: null,
        text: `Intervalo: ${home.goals}-${away.goals}` });
    }
    if (rng.chance(homeRate)) resolveShot(rng, home, away, minute);
    if (rng.chance(awayRate)) resolveShot(rng, away, home, minute);

    // Cartão amarelo ocasional — equipas com mais pressing cometem mais faltas.
    if (rng.chance(yellowPerMin)) {
      const sideIdx = rng.weightedIndex([5 + home.strength.pressing, 5 + away.strength.pressing]);
      const side = sideIdx === 0 ? home : away;
      if (side.outfield.length > 0) {
        events.push({ minute, type: 'YELLOW_CARD', side: side.side, playerId: rng.pick(side.outfield),
          text: 'Cartão amarelo.' });
      }
    }
  }

  // Lesões — resolvidas uma vez por equipa no fim (afetam ETAPA 4/treino).
  for (const s of [home, away]) {
    if (s.outfield.length > 0 && rng.chance(CFG.injuryPerMatch)) {
      events.push({ minute: rng.int(10, 85), type: 'INJURY', side: s.side, playerId: rng.pick(s.outfield),
        text: 'Jogador sai lesionado.' });
    }
  }

  events.push({ minute: 90, type: 'FULL_TIME', side: null, playerId: null,
    text: `Fim: ${home.goals}-${away.goals}` });

  // Ordena eventos por minuto (lesões foram inseridas fora de ordem).
  events.sort((a, b) => a.minute - b.minute);

  return {
    homeClubId, awayClubId, seed,
    home: {
      goals: home.goals, shots: home.shots, shotsOnTarget: home.onTarget,
      possession: homePossession, xg: Math.round(home.xg * 100) / 100,
    },
    away: {
      goals: away.goals, shots: away.shots, shotsOnTarget: away.onTarget,
      possession: 100 - homePossession, xg: Math.round(away.xg * 100) / 100,
    },
    events,
  };
}
