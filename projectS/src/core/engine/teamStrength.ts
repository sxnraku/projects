import {
  effectiveOverall,
  Mentality,
  Player,
  POSITION_GROUP,
  Tactic,
  Tempo,
} from '../models';

/** Força de uma equipa nas três zonas, já ajustada. Escala aproximada 1..20. */
export interface TeamStrength {
  attack: number;
  midfield: number;
  defence: number;
  /** Multiplicador de ritmo — afeta o número de lances gerados na partida. */
  tempoFactor: number;
  /** Sliders táticos (0..10, 5 = neutro) — o matchEngine aplica os efeitos. */
  pressing: number;
  defensiveLine: number;
  creativity: number;
}

/** Multiplicadores de mentalidade aplicados a ataque/defesa. */
const MENTALITY_MOD: Record<Mentality, { attack: number; defence: number }> = {
  DEFENSIVE: { attack: 0.9, defence: 1.12 },
  BALANCED: { attack: 1.0, defence: 1.0 },
  ATTACKING: { attack: 1.12, defence: 0.9 },
};

/** Ritmo → factor sobre o número de lances (mais ritmo, mais lances e mais desgaste). */
const TEMPO_FACTOR: Record<Tempo, number> = {
  SLOW: 0.85,
  NORMAL: 1.0,
  FAST: 1.18,
};

/**
 * Ajuste individual pela condição do jogador.
 * Forma e moral empurram ±, a fadiga só penaliza. Resultado ~0.8..1.1.
 */
function conditionMultiplier(p: Player): number {
  const form = 0.9 + (p.condition.form / 100) * 0.2; // 0.9..1.1
  const morale = 0.95 + (p.condition.morale / 100) * 0.1; // 0.95..1.05
  const fitness = 0.8 + (p.condition.fitness / 100) * 0.2; // 0.8..1.0
  return form * morale * fitness;
}

/**
 * Calcula a força da equipa a partir do onze titular e da tática.
 *
 * Cada jogador contribui para a zona da sua posição com o overall calculado
 * NESSA posição (um extremo a jogar a lateral rende menos), ponderado pela
 * sua condição. Depois aplica mentalidade e devolve também o factor de ritmo.
 *
 * @param tactic  tática do clube (formação, mentalidade, ritmo, onze)
 * @param players mapa id→Player com, pelo menos, todos os titulares
 */
export function computeTeamStrength(
  tactic: Tactic,
  players: Record<string, Player>,
): TeamStrength {
  let atk = 0, atkN = 0;
  let mid = 0, midN = 0;
  let def = 0, defN = 0;

  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue; // titular em falta: zona fica mais fraca (penalização natural)

    // effectiveOverall inclui a penalização por jogar fora da posição natural.
    const rating = effectiveOverall(p, slot.position) * conditionMultiplier(p);
    const group = POSITION_GROUP[slot.position];

    if (group === 'ATTACK') { atk += rating; atkN++; }
    else if (group === 'MIDFIELD') { mid += rating; midN++; }
    else if (group === 'DEFENCE' || group === 'GOALKEEPER') { def += rating; defN++; }
  }

  const mod = MENTALITY_MOD[tactic.mentality];

  // Média por zona; se uma zona não tiver jogadores, fica com base baixa (5).
  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 5);

  // Linha defensiva alta empurra a equipa para a frente: meio-campo ganha,
  // (a vulnerabilidade defensiva é aplicada no matchEngine, lance a lance).
  const lineMidBoost = 1 + (tactic.defensiveLine - 5) * 0.015;

  return {
    attack: avg(atk, atkN) * mod.attack,
    midfield: avg(mid, midN) * lineMidBoost,
    defence: avg(def, defN) * mod.defence,
    tempoFactor: TEMPO_FACTOR[tactic.tempo],
    pressing: tactic.pressing,
    defensiveLine: tactic.defensiveLine,
    creativity: tactic.creativity,
  };
}
