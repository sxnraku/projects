/**
 * PAPÉIS TÁCTICOS — o que cada jogador FAZ dentro da posição.
 *
 * Até aqui a tática eram onze posições, uma mentalidade, um ritmo e três
 * sliders. Isso decide como a equipa joga, mas não decide nada sobre as
 * PESSOAS: escolher o onze era escolher os onze overalls mais altos. Um papel
 * muda duas coisas de cada jogador:
 *
 *  1. **Onde pesa** — um lateral ofensivo deixa de contar só para a defesa e
 *     empresta parte do seu valor ao meio-campo. Um trinco puxa o contrário.
 *  2. **Se lhe assenta** — cada papel olha para 3 atributos. Um central que
 *     joga a "defesa construtor" sem passe rende MENOS do que jogaria como
 *     marcador. É aqui que o overall deixa de mandar sozinho.
 *
 * O extremo invertido leva ainda a regra do pé: à esquerda quer pé direito e
 * vice-versa. Um canhoto na esquerda como invertido é um erro de casting, e o
 * jogo passa a dizê-lo.
 *
 * COMPATIBILIDADE: um slot sem papel usa o papel NEUTRO da posição, que pesa
 * 100% na sua zona e tem `fit` exatamente 1. Saves antigos e as equipas da IA
 * jogam exatamente como jogavam antes desta funcionalidade existir.
 */
import { PlayerAttributes } from './player';
import { Foot, Position, POSITION_GROUP, PositionGroup } from './enums';

export const PlayerRole = {
  /** Guarda-redes clássico (neutro). */
  GK_CLASSIC: 'GK_CLASSIC',
  /** Guarda-redes avançado: joga fora da área e sai nas costas da defesa. */
  GK_SWEEPER: 'GK_SWEEPER',

  /** Defesa neutro. */
  DEF_NORMAL: 'DEF_NORMAL',
  /** Marcador: agarra o avançado, nada de floreados. */
  DEF_STOPPER: 'DEF_STOPPER',
  /** Defesa construtor: sai a jogar de trás. */
  DEF_BALL_PLAYING: 'DEF_BALL_PLAYING',
  /** Lateral defensivo: fica em casa. */
  DEF_FULLBACK: 'DEF_FULLBACK',
  /** Lateral ofensivo: sobe a ala e é meio-campo com a bola. */
  DEF_WINGBACK: 'DEF_WINGBACK',

  /** Médio neutro. */
  MID_NORMAL: 'MID_NORMAL',
  /** Trinco/destruidor: corta linhas de passe à frente da defesa. */
  MID_ANCHOR: 'MID_ANCHOR',
  /** Box-to-box: faz o campo todo. */
  MID_BOX_TO_BOX: 'MID_BOX_TO_BOX',
  /** Maestro: a equipa joga por ele. */
  MID_PLAYMAKER: 'MID_PLAYMAKER',

  /** Atacante neutro. */
  ATT_NORMAL: 'ATT_NORMAL',
  /** Extremo clássico: vai à linha e cruza. */
  ATT_WINGER: 'ATT_WINGER',
  /** Extremo invertido: corta para dentro e remata — pede o pé contrário. */
  ATT_INVERTED: 'ATT_INVERTED',
  /** Finalizador de área: vive dos últimos cinco metros. */
  ATT_POACHER: 'ATT_POACHER',
  /** Ponta-de-lança de referência: segura a bola e ganha tudo por alto. */
  ATT_TARGET: 'ATT_TARGET',
  /** Falso 9: cai para o meio e cria. */
  ATT_FALSE_NINE: 'ATT_FALSE_NINE',
} as const;
export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

/** Como o papel distribui o valor do jogador pelas três zonas (soma 1). */
export interface RoleWeights { attack: number; midfield: number; defence: number; }

export interface RoleSpec {
  /** Setor onde o papel pode ser usado. */
  group: PositionGroup;
  /** Restrição fina: se existir, só estas posições aceitam o papel. */
  positions?: Position[];
  weights: RoleWeights;
  /** Os 3 atributos que decidem se o papel assenta ao jogador. */
  key: (keyof PlayerAttributes)[];
  /** True no papel por omissão de cada setor — `fit` é sempre 1. */
  neutral?: boolean;
  /** Pede o pé contrário à ala (extremo invertido). */
  invertedFoot?: boolean;
  /** Ajustes de equipa somados aos sliders (limitados depois). */
  team?: { pressing?: number; defensiveLine?: number; creativity?: number };
  /** Peso extra nos lances de bola parada ofensiva (cabeceamento). */
  aerial?: number;
}

const W = (attack: number, midfield: number, defence: number): RoleWeights => ({ attack, midfield, defence });

export const ROLE_SPECS: Record<PlayerRole, RoleSpec> = {
  GK_CLASSIC: { group: 'GOALKEEPER', weights: W(0, 0, 1), key: ['goalkeeping', 'positioning', 'composure'], neutral: true },
  GK_SWEEPER: {
    group: 'GOALKEEPER', weights: W(0, 0.1, 0.9), key: ['goalkeeping', 'pace', 'composure'],
    team: { defensiveLine: 0.8 },
  },

  DEF_NORMAL: { group: 'DEFENCE', weights: W(0, 0, 1), key: ['tackling', 'positioning', 'strength'], neutral: true },
  DEF_STOPPER: {
    group: 'DEFENCE', positions: ['CB'], weights: W(0, 0, 1), key: ['tackling', 'strength', 'heading'],
    team: { pressing: 0.4 }, aerial: 0.25,
  },
  DEF_BALL_PLAYING: {
    group: 'DEFENCE', positions: ['CB'], weights: W(0, 0.2, 0.8), key: ['passing', 'vision', 'composure'],
    team: { creativity: 0.5 },
  },
  DEF_FULLBACK: {
    group: 'DEFENCE', positions: ['RB', 'LB'], weights: W(0, 0, 1), key: ['tackling', 'positioning', 'stamina'],
    team: { defensiveLine: -0.4 },
  },
  DEF_WINGBACK: {
    group: 'DEFENCE', positions: ['RB', 'LB'], weights: W(0.08, 0.3, 0.62), key: ['pace', 'stamina', 'passing'],
    team: { pressing: 0.3, defensiveLine: 0.4 },
  },

  MID_NORMAL: { group: 'MIDFIELD', weights: W(0, 1, 0), key: ['passing', 'teamwork', 'vision'], neutral: true },
  MID_ANCHOR: {
    group: 'MIDFIELD', positions: ['DM', 'CM'], weights: W(0, 0.65, 0.35), key: ['tackling', 'positioning', 'teamwork'],
    team: { defensiveLine: -0.5, pressing: 0.3 },
  },
  MID_BOX_TO_BOX: {
    group: 'MIDFIELD', positions: ['CM', 'DM', 'AM'], weights: W(0.18, 0.68, 0.14), key: ['stamina', 'passing', 'tackling'],
    team: { pressing: 0.4 },
  },
  MID_PLAYMAKER: {
    group: 'MIDFIELD', positions: ['CM', 'AM', 'DM'], weights: W(0.22, 0.78, 0), key: ['vision', 'passing', 'composure'],
    team: { creativity: 0.8 },
  },

  ATT_NORMAL: { group: 'ATTACK', weights: W(1, 0, 0), key: ['finishing', 'positioning', 'pace'], neutral: true },
  ATT_WINGER: {
    group: 'ATTACK', positions: ['RW', 'LW'], weights: W(0.82, 0.18, 0), key: ['pace', 'dribbling', 'passing'],
    team: { creativity: 0.4 },
  },
  ATT_INVERTED: {
    group: 'ATTACK', positions: ['RW', 'LW'], weights: W(0.9, 0.1, 0), key: ['finishing', 'dribbling', 'composure'],
    invertedFoot: true,
  },
  ATT_POACHER: {
    group: 'ATTACK', positions: ['ST'], weights: W(1, 0, 0), key: ['finishing', 'positioning', 'agility'],
  },
  ATT_TARGET: {
    group: 'ATTACK', positions: ['ST'], weights: W(1, 0, 0), key: ['heading', 'strength', 'finishing'],
    aerial: 0.6,
  },
  ATT_FALSE_NINE: {
    group: 'ATTACK', positions: ['ST', 'AM'], weights: W(0.6, 0.4, 0), key: ['vision', 'passing', 'dribbling'],
    team: { creativity: 0.6 },
  },
};

/** Papel por omissão de cada setor — o comportamento anterior aos papéis. */
export const NEUTRAL_ROLE: Record<PositionGroup, PlayerRole> = {
  GOALKEEPER: 'GK_CLASSIC',
  DEFENCE: 'DEF_NORMAL',
  MIDFIELD: 'MID_NORMAL',
  ATTACK: 'ATT_NORMAL',
};

/** Papéis oferecidos numa posição, com o neutro sempre em primeiro. */
export function rolesFor(position: Position): PlayerRole[] {
  const group = POSITION_GROUP[position];
  const out: PlayerRole[] = [NEUTRAL_ROLE[group]];
  for (const [role, spec] of Object.entries(ROLE_SPECS) as [PlayerRole, RoleSpec][]) {
    if (spec.neutral || spec.group !== group) continue;
    if (spec.positions && !spec.positions.includes(position)) continue;
    out.push(role);
  }
  return out;
}

/** True se o papel pode ser usado nesta posição. */
export function roleAllowed(role: PlayerRole, position: Position): boolean {
  return rolesFor(position).includes(role);
}

/** Papel efetivo de um slot: o escolhido, se válido; senão o neutro. */
export function effectiveRole(role: PlayerRole | undefined, position: Position): PlayerRole {
  if (role && roleAllowed(role, position)) return role;
  return NEUTRAL_ROLE[POSITION_GROUP[position]];
}

/** Ala da posição — o extremo invertido pede o pé contrário a esta. */
function flankOf(position: Position): 'LEFT' | 'RIGHT' | null {
  if (position === 'LW' || position === 'LB') return 'LEFT';
  if (position === 'RW' || position === 'RB') return 'RIGHT';
  return null;
}

export const FIT_MIN = 0.86;
export const FIT_MAX = 1.14;

/**
 * Quanto o papel assenta ao jogador (multiplicador do seu valor).
 *
 * O neutro devolve sempre 1 — sem escolha de papel, nada muda. Um papel
 * escolhido lê os seus 3 atributos: média 10 é neutra, 20 dá +14%, 1 tira 14%.
 * O invertido soma o teste do pé por cima.
 */
export function roleFit(
  role: PlayerRole,
  attributes: PlayerAttributes,
  foot: Foot,
  position: Position,
): number {
  const spec = ROLE_SPECS[role];
  if (!spec || spec.neutral) return 1;

  let sum = 0;
  for (const k of spec.key) sum += attributes[k];
  const avg = sum / spec.key.length;
  // 10 → 1.0 · 20 → +14% · 1 → −12.6%
  let fit = 1 + (avg - 10) * 0.014;

  if (spec.invertedFoot) {
    const flank = flankOf(position);
    if (flank) {
      const wanted: Foot = flank === 'LEFT' ? 'RIGHT' : 'LEFT';
      if (foot === wanted) fit += 0.06;
      else if (foot === 'BOTH') fit += 0.02;
      else fit -= 0.09; // canhoto na esquerda a cortar para dentro: erro de casting
    }
  }
  return Math.max(FIT_MIN, Math.min(FIT_MAX, fit));
}
