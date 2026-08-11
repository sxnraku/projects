import {
  CornerFocus,
  effectiveOverall,
  effectiveRole,
  Mentality,
  Player,
  POSITION_GROUP,
  PlayerAttributes,
  roleFit,
  ROLE_SPECS,
  SLIDER_MAX,
  SLIDER_MIN,
  Tactic,
  Tempo,
} from '../models';

/** Quem bate cada bola parada e o que a equipa vale nelas. */
export interface SetPieceStrength {
  /** Qualidade do marcador de livres (1..20). */
  freeKick: number;
  /** Qualidade do cruzamento nos cantos (1..20). */
  corner: number;
  /** Perigo aéreo da equipa a atacar (1..20). */
  aerialAttack: number;
  /** Capacidade de defender o ar (1..20). */
  aerialDefence: number;
  focus: CornerFocus;
  freeKickTakerId: string | null;
  cornerTakerId: string | null;
}

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
  /** Bolas paradas — o matchEngine resolve livres e cantos a partir daqui. */
  setPiece: SetPieceStrength;
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

const clampSlider = (v: number): number => Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, v));

/** Combinação ponderada de atributos, com pesos que somam 1. */
function blend(a: PlayerAttributes, parts: [keyof PlayerAttributes, number][]): number {
  let out = 0;
  for (const [k, w] of parts) out += a[k] * w;
  return out;
}

const freeKickValue = (p: Player) =>
  blend(p.attributes, [['finishing', 0.45], ['composure', 0.25], ['vision', 0.3]]);
const cornerValue = (p: Player) =>
  blend(p.attributes, [['passing', 0.55], ['vision', 0.3], ['composure', 0.15]]);
const aerialValue = (p: Player) =>
  blend(p.attributes, [['heading', 0.65], ['strength', 0.2], ['positioning', 0.15]]);

/**
 * Qualidade da equipa nas bolas paradas.
 *
 * O marcador ESCOLHIDO só entra se estiver no onze — pôr o melhor batedor no
 * banco não vale de nada. Sem escolha, entra o melhor do onze, que é o que as
 * equipas da IA fazem sempre.
 */
function computeSetPiece(tactic: Tactic, players: Record<string, Player>): SetPieceStrength {
  let fkTaker: Player | null = null;
  let ckTaker: Player | null = null;
  const aerials: number[] = [];
  let defAerial = 0, defAerialN = 0;

  const wanted = (id: string | null | undefined) => (id ? id : null);
  const chosenFk = wanted(tactic.freeKickTakerId);
  const chosenCk = wanted(tactic.cornerTakerId);

  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    const group = POSITION_GROUP[slot.position];

    if (chosenFk === p.id) fkTaker = p;
    else if (!chosenFk && (!fkTaker || freeKickValue(p) > freeKickValue(fkTaker))) fkTaker = p;

    if (chosenCk === p.id) ckTaker = p;
    else if (!chosenCk && (!ckTaker || cornerValue(p) > cornerValue(ckTaker))) ckTaker = p;

    if (group !== 'GOALKEEPER') {
      // Papéis com vocação aérea (ponta-de-lança de referência, marcador) pesam mais.
      const spec = ROLE_SPECS[effectiveRole(slot.role, slot.position)];
      aerials.push(aerialValue(p) * (1 + (spec?.aerial ?? 0)));
    }
    if (group === 'DEFENCE' || group === 'GOALKEEPER') { defAerial += aerialValue(p); defAerialN++; }
  }

  // Se o marcador escolhido ficou de fora do onze, cai para o melhor disponível.
  if (chosenFk && !fkTaker) {
    for (const slot of tactic.lineup) {
      const p = players[slot.playerId];
      if (p && (!fkTaker || freeKickValue(p) > freeKickValue(fkTaker))) fkTaker = p;
    }
  }
  if (chosenCk && !ckTaker) {
    for (const slot of tactic.lineup) {
      const p = players[slot.playerId];
      if (p && (!ckTaker || cornerValue(p) > cornerValue(ckTaker))) ckTaker = p;
    }
  }

  // Perigo aéreo: só contam os 4 melhores — quem sobe à área nos cantos.
  aerials.sort((a, b) => b - a);
  const top = aerials.slice(0, 4);
  const aerialAttack = top.length > 0 ? top.reduce((s, v) => s + v, 0) / top.length : 8;

  return {
    freeKick: fkTaker ? freeKickValue(fkTaker) : 8,
    corner: ckTaker ? cornerValue(ckTaker) : 8,
    aerialAttack,
    aerialDefence: defAerialN > 0 ? defAerial / defAerialN : 8,
    focus: tactic.cornerFocus ?? 'MIXED',
    freeKickTakerId: fkTaker?.id ?? null,
    cornerTakerId: ckTaker?.id ?? null,
  };
}

/**
 * Calcula a força da equipa a partir do onze titular e da tática.
 *
 * Cada jogador contribui com o overall calculado NA SUA POSIÇÃO (um extremo a
 * jogar a lateral rende menos), ponderado pela condição e pelo quanto o PAPEL
 * lhe assenta. O papel decide ainda como esse valor se reparte pelas três
 * zonas: um lateral ofensivo empresta parte de si ao meio-campo, um trinco
 * empresta parte à defesa.
 *
 * @param tactic  tática do clube (formação, mentalidade, ritmo, onze, papéis)
 * @param players mapa id→Player com, pelo menos, todos os titulares
 */
export function computeTeamStrength(
  tactic: Tactic,
  players: Record<string, Player>,
): TeamStrength {
  let atk = 0, atkN = 0;
  let mid = 0, midN = 0;
  let def = 0, defN = 0;
  const teamMod = { pressing: 0, defensiveLine: 0, creativity: 0 };

  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue; // titular em falta: zona fica mais fraca (penalização natural)

    const role = effectiveRole(slot.role, slot.position);
    const spec = ROLE_SPECS[role];
    // effectiveOverall inclui a penalização por jogar fora da posição natural.
    const rating = effectiveOverall(p, slot.position)
      * conditionMultiplier(p)
      * roleFit(role, p.attributes, p.foot, slot.position);
    const group = POSITION_GROUP[slot.position];

    // O guarda-redes conta sempre inteiro para a defesa (o papel dele quase não
    // reparte); os de campo repartem-se pelos pesos do papel.
    if (group === 'GOALKEEPER') {
      def += rating; defN++;
    } else {
      const w = spec.weights;
      if (w.attack > 0) { atk += rating * w.attack; atkN += w.attack; }
      if (w.midfield > 0) { mid += rating * w.midfield; midN += w.midfield; }
      if (w.defence > 0) { def += rating * w.defence; defN += w.defence; }
    }

    if (spec.team) {
      teamMod.pressing += spec.team.pressing ?? 0;
      teamMod.defensiveLine += spec.team.defensiveLine ?? 0;
      teamMod.creativity += spec.team.creativity ?? 0;
    }
  }

  const mod = MENTALITY_MOD[tactic.mentality];

  // Média ponderada por zona; sem jogadores, base baixa (5).
  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 5);

  // Os papéis empurram os sliders, mas nunca fora da escala 0..10: os papéis
  // afinam a tática do treinador, não a substituem.
  const pressing = clampSlider(tactic.pressing + teamMod.pressing);
  const defensiveLine = clampSlider(tactic.defensiveLine + teamMod.defensiveLine);
  const creativity = clampSlider(tactic.creativity + teamMod.creativity);

  // Linha defensiva alta empurra a equipa para a frente: meio-campo ganha,
  // (a vulnerabilidade defensiva é aplicada no matchEngine, lance a lance).
  const lineMidBoost = 1 + (defensiveLine - 5) * 0.015;

  return {
    attack: avg(atk, atkN) * mod.attack,
    midfield: avg(mid, midN) * lineMidBoost,
    defence: avg(def, defN) * mod.defence,
    tempoFactor: TEMPO_FACTOR[tactic.tempo],
    pressing,
    defensiveLine,
    creativity,
    setPiece: computeSetPiece(tactic, players),
  };
}
