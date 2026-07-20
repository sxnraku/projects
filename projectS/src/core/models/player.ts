import { Foot, PlayerStatus, Position, POSITION_GROUP } from './enums';

/**
 * Atributos base do jogador — escala 1..20.
 * Fixos por época (só mudam via treino/idade). O motor de partida lê estes valores.
 * ~18 atributos: leve para processar centenas em batch num telemóvel.
 */
export interface PlayerAttributes {
  // Físicos
  pace: number; // velocidade
  stamina: number; // resistência
  strength: number; // força
  agility: number; // agilidade

  // Técnicos
  finishing: number; // finalização
  passing: number; // passe
  dribbling: number; // drible
  tackling: number; // desarme/defesa
  heading: number; // cabeceamento
  goalkeeping: number; // guarda-redes (relevante só p/ GK)

  // Mentais
  positioning: number; // posicionamento
  composure: number; // compostura sob pressão
  teamwork: number; // disciplina tática / trabalho de equipa
  vision: number; // visão / decisão
}

/**
 * Estado dinâmico — muda ao longo da época (jogos, treino, eventos).
 * Guardado à parte dos atributos base para saves incrementais mais baratos.
 */
export interface PlayerCondition {
  form: number; // forma recente 0..100
  morale: number; // moral 0..100
  fitness: number; // condição física / frescura 0..100 (100 = descansado)
  status: PlayerStatus;
  injuryDaysRemaining: number; // 0 se apto
}

/** Jogador completo — entidade central do modelo de dados. */
export interface Player {
  id: string;
  clubId: string | null; // null = livre / mercado

  // Identidade
  firstName: string;
  lastName: string;
  age: number;
  nationality: string; // ISO-3166 alpha-3, ex: "PRT"
  foot: Foot;

  // Posições — a primeira é a natural; as restantes são secundárias.
  positions: Position[];

  // Capacidade
  attributes: PlayerAttributes;
  potential: number; // teto de overall que pode atingir (1..20 na mesma escala do overall)

  // Estado
  condition: PlayerCondition;

  // Contrato (detalhe expandido na ETAPA 4)
  contractUntil: number | null; // época em que expira (ex: 2027). null = sem contrato
  wage: number; // salário semanal
  marketValue: number; // valor estimado

  // Mercado: se true, o jogador está na lista de transferências — a IA faz
  // ofertas mais depressa e a um preço mais próximo do valor de mercado.
  transferListed: boolean;
}

/**
 * Pesos de overall por grupo de posição.
 * Cada grupo valoriza atributos diferentes — um ST vale por finalização,
 * um CB por desarme. Soma dos pesos ≈ 1 dentro de cada grupo.
 */
const OVERALL_WEIGHTS: Record<
  ReturnType<typeof positionGroupOf>,
  Partial<Record<keyof PlayerAttributes, number>>
> = {
  GOALKEEPER: {
    goalkeeping: 0.5,
    positioning: 0.2,
    composure: 0.15,
    agility: 0.15,
  },
  DEFENCE: {
    tackling: 0.28,
    strength: 0.16,
    positioning: 0.18,
    heading: 0.12,
    pace: 0.12,
    passing: 0.08,
    teamwork: 0.06,
  },
  MIDFIELD: {
    passing: 0.24,
    vision: 0.18,
    dribbling: 0.14,
    stamina: 0.12,
    tackling: 0.1,
    composure: 0.12,
    teamwork: 0.1,
  },
  ATTACK: {
    finishing: 0.3,
    dribbling: 0.18,
    pace: 0.18,
    composure: 0.12,
    positioning: 0.12,
    heading: 0.1,
  },
};

function positionGroupOf(pos: Position) {
  return POSITION_GROUP[pos];
}

/**
 * Overall derivado — nunca guardado bruto, sempre calculado a partir dos atributos
 * e da posição avaliada. Retorna valor 1..20 arredondado.
 */
export function computeOverall(
  attributes: PlayerAttributes,
  position: Position,
): number {
  const weights = OVERALL_WEIGHTS[positionGroupOf(position)];
  let sum = 0;
  let totalWeight = 0;
  for (const key in weights) {
    const k = key as keyof PlayerAttributes;
    const w = weights[k]!;
    sum += attributes[k] * w;
    totalWeight += w;
  }
  return Math.round(sum / totalWeight);
}

/** Overall na posição natural (primeira da lista). */
export function naturalOverall(player: Player): number {
  return computeOverall(player.attributes, player.positions[0]);
}

/** Penalização por jogar fora da posição natural (em pontos de overall). */
export const OUT_OF_POSITION_PENALTY = { sameGroup: 2, otherGroup: 5 } as const;

/** True se o jogador atua naturalmente nesta posição. */
export function isNaturalPosition(player: Player, position: Position): boolean {
  return player.positions.includes(position);
}

/**
 * Overall REAL do jogador numa dada posição do onze.
 *
 * Combina duas coisas:
 *  1. Os atributos avaliados com os pesos DESSA posição (um central avaliado a
 *     ponta-de-lança já pontua menos, porque não tem finalização).
 *  2. Uma penalização de familiaridade por jogar fora da posição natural:
 *     -2 dentro do mesmo setor (ex.: central a lateral), -5 fora dele
 *     (ex.: médio a guarda-redes).
 *
 * É esta função que o motor de partida e a UI usam — pôr alguém fora de posição
 * enfraquece mesmo a equipa, não é só cosmético.
 */
export function effectiveOverall(player: Player, position: Position): number {
  const base = computeOverall(player.attributes, position);
  if (isNaturalPosition(player, position)) return base;
  const natural = player.positions[0];
  const penalty = POSITION_GROUP[natural] === POSITION_GROUP[position]
    ? OUT_OF_POSITION_PENALTY.sameGroup
    : OUT_OF_POSITION_PENALTY.otherGroup;
  return Math.max(1, base - penalty);
}

export function fullName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}
