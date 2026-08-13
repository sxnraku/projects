import { POSITION_GROUP, Position } from './enums';
import { effectiveOverallFine } from './player';
import { PlayerRole } from './roles';

/**
 * Formações suportadas. A string codifica a distribuição defesa-meio-ataque.
 *
 * REGRA: duas formações nunca podem ter o MESMO conjunto de posições. O motor de
 * partida só vê as posições dos onze slots — desenhar os jogadores mais acima ou
 * mais abaixo no ecrã não muda nada. Era esse o problema do antigo 4-5-1, que
 * tinha exatamente as mesmas posições do 4-3-3 e por isso jogava igual
 * ("o 451 é igual ao 433"). Foi substituído pelo 4-4-1-1, que traz um AM.
 *
 * O teste `smoke:contracts` verifica esta regra e falha se alguém acrescentar
 * uma formação repetida.
 */
export const Formation = {
  // Linha de 4
  F_4_4_2: '4-4-2',
  F_4_4_2_D: '4-4-2 losango', // DM + AM no meio, sem alas
  F_4_4_1_1: '4-4-1-1',       // segundo avançado a cair para AM
  F_4_3_3: '4-3-3',
  F_4_3_3_D: '4-3-3 recuado', // trinco a segurar o meio
  F_4_3_1_2: '4-3-1-2',       // AM a servir dois pontas
  F_4_2_3_1: '4-2-3-1',
  F_4_1_3_2: '4-1-3-2',       // trinco atrás de três médios e dois pontas
  // Linha de 3
  F_3_5_2: '3-5-2',
  F_3_4_3: '3-4-3',
  // Linha de 5
  F_5_3_2: '5-3-2',
  F_5_4_1: '5-4-1',
} as const;
export type Formation = (typeof Formation)[keyof typeof Formation];

/** Famílias para a UI agrupar (uma gaveta por linha defensiva). */
export const FORMATION_FAMILIES: { key: string; formations: Formation[] }[] = [
  { key: 'back4', formations: ['4-4-2', '4-4-2 losango', '4-4-1-1', '4-3-3', '4-3-3 recuado', '4-3-1-2', '4-2-3-1', '4-1-3-2'] },
  { key: 'back3', formations: ['3-5-2', '3-4-3'] },
  { key: 'back5', formations: ['5-3-2', '5-4-1'] },
];

/** Mentalidade da equipa — afeta pesos ataque/defesa no motor de partida. */
export const Mentality = {
  DEFENSIVE: 'DEFENSIVE',
  BALANCED: 'BALANCED',
  ATTACKING: 'ATTACKING',
} as const;
export type Mentality = (typeof Mentality)[keyof typeof Mentality];

/** Ritmo de jogo — afeta desgaste (fitness) e número de ações. */
export const Tempo = {
  SLOW: 'SLOW',
  NORMAL: 'NORMAL',
  FAST: 'FAST',
} as const;
export type Tempo = (typeof Tempo)[keyof typeof Tempo];

/** Um slot do onze inicial: posição no campo + jogador atribuído. */
export interface LineupSlot {
  position: Position;
  playerId: string;
  /**
   * Papel táctico. Ausente = papel neutro da posição, exatamente o
   * comportamento anterior aos papéis (ver `models/roles.ts`). Viaja dentro do
   * blob JSON `lineup`, por isso não precisa de migração do save.
   */
  role?: PlayerRole;
}

/**
 * Instrução de canto — para onde vai a bola.
 *
 * NEAR/FAR pedem gente alta e trocam o cruzamento por cabeceamento; SHORT tira
 * a bola do ar e joga-a no chão, com menos golo direto mas menos risco de
 * contra-ataque. MIXED é o meio-termo.
 */
export const CornerFocus = {
  MIXED: 'MIXED',
  NEAR: 'NEAR',
  FAR: 'FAR',
  SHORT: 'SHORT',
} as const;
export type CornerFocus = (typeof CornerFocus)[keyof typeof CornerFocus];

/** Escala dos sliders táticos: 0..10, 5 = neutro. */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 10;
export const SLIDER_NEUTRAL = 5;

/**
 * Tática de um clube. Guardada por clube e editável antes de cada jornada.
 * O motor de partida (ETAPA 2) consome este objeto.
 *
 * Sliders (0..10, 5 = neutro) — todos lidos pelo motor:
 *  - pressing: mais pressão = mais lances criados e mais cartões/fadiga.
 *  - defensiveLine: linha alta = meio-campo mais forte, mas golos sofridos
 *    mais fáceis quando a defesa é batida.
 *  - creativity: mais criatividade = remates mais perigosos, mas mais perdas
 *    de bola (lances do adversário).
 */
export interface Tactic {
  clubId: string;
  formation: Formation;
  mentality: Mentality;
  tempo: Tempo;

  pressing: number; // 0..10
  defensiveLine: number; // 0..10
  creativity: number; // 0..10

  lineup: LineupSlot[]; // 11 slots
  bench: string[]; // ids dos suplentes
  captainId: string | null;
  penaltyTakerId: string | null;

  /**
   * BOLAS PARADAS. Opcionais: quando não estão definidos (saves antigos, e
   * todas as equipas da IA), o motor escolhe sozinho o melhor do onze. Definir
   * um marcador só interessa se ele for melhor do que a escolha automática —
   * é uma decisão, não um formulário obrigatório.
   */
  freeKickTakerId?: string | null;
  cornerTakerId?: string | null;
  cornerFocus?: CornerFocus;
}

/** Validação mínima — o onze deve ter exatamente 11 jogadores. */
export function isValidLineup(t: Tactic): boolean {
  const ids = t.lineup.map((s) => s.playerId);
  const unique = new Set(ids);
  return t.lineup.length === 11 && unique.size === 11;
}

/**
 * INSTRUÇÕES CONTRA O ADVERSÁRIO.
 *
 * Vivem aqui, na camada de modelos, e não em `core/game`, por uma razão
 * concreta: o MOTOR precisa delas para simular, e o motor não pode importar de
 * `core/game` (que já importa do motor) sem criar um ciclo. O relatório de
 * olheiro e a interface de escolha ficam em `core/game/opponent.ts`.
 *
 * Cada instrução tem um custo próprio — sem isso seriam dois botões de "ganhar
 * mais", e não uma decisão.
 */
export interface OppositionPlan {
  /**
   * Marcação individual ao MELHOR jogador deles. Guarda a INTENÇÃO, não um id:
   * continua a valer na semana seguinte, contra outro clube e outro craque.
   */
  markStar?: boolean;
  /** Fechar as alas: menos cantos e menos jogo aéreo deles. */
  blockWings?: boolean;
}

/** Quanto a marcação individual apaga o melhor deles. */
export const MARK_STAR_CUT = 0.45;
/** …e o que custa ao nosso meio-campo (um homem ocupado a marcar). */
export const MARK_STAR_COST = 0.97;
/** Quanto fechar as alas corta nos cantos deles. */
export const BLOCK_WINGS_CORNERS = 0.7;
/** …e no perigo aéreo deles. */
export const BLOCK_WINGS_AERIAL = 0.82;
/**
 * …e no ataque deles, que perde a largura por onde entrava.
 *
 * Medido: sem esta parte, fechar as alas cortava 32% dos cantos do adversário
 * mas custava-nos mais golos do que os que evitava — era uma opção que NUNCA
 * compensava, e uma opção que nunca compensa não é uma decisão, é uma armadilha.
 */
export const BLOCK_WINGS_FOE_ATTACK = 0.965;
/** …e o que custa ao nosso ataque (também perdemos largura). */
export const BLOCK_WINGS_COST = 0.98;

export function hasPlan(plan: OppositionPlan | undefined): boolean {
  return !!plan && (plan.markStar === true || plan.blockWings === true);
}

/**
 * O melhor jogador de campo de um onze. É este que a marcação individual
 * apaga; o motor precisa de o encontrar sem conhecer o relatório de olheiro.
 */
export function bestOf(
  tactic: Tactic, players: Record<string, import('./player').Player>,
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p || POSITION_GROUP[slot.position] === 'GOALKEEPER') continue;
    const score = effectiveOverallFine(p, slot.position);
    if (score > bestScore) { bestScore = score; best = p.id; }
  }
  return best;
}

/**
 * FORÇA POR SETOR, na mesma régua que o campo mostra por jogador (0-100).
 *
 * Existe porque o cartão "A minha equipa" mostrava `computeTeamStrength × 5`,
 * que é OUTRA coisa: essa inclui os multiplicadores da tática (mentalidade,
 * linha, ritmo), a forma, a moral e a frescura, e distribui cada jogador por
 * várias zonas conforme o papel. O resultado era um meio-campo a "77" num onze
 * onde o melhor médio tinha 68 — números que não batiam com nada do que o
 * utilizador via no plantel.
 *
 * Isto é a média simples do overall EFETIVO dos jogadores de cada zona, que é
 * exatamente o número desenhado em cima de cada camisola. O guarda-redes conta
 * para a defesa, como conta na leitura de qualquer adepto.
 */
export function sectorRatings(
  tactic: Tactic, players: Record<string, import('./player').Player>,
): { def: number; mid: number; att: number } {
  const sum = { DEFENCE: 0, MIDFIELD: 0, ATTACK: 0 };
  const n = { DEFENCE: 0, MIDFIELD: 0, ATTACK: 0 };
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    const group = POSITION_GROUP[slot.position];
    // O guarda-redes soma à defesa: é lá que ele defende.
    const zone = group === 'GOALKEEPER' ? 'DEFENCE' : group;
    sum[zone] += effectiveOverallFine(p, slot.position);
    n[zone] += 1;
  }
  const avg = (z: 'DEFENCE' | 'MIDFIELD' | 'ATTACK') =>
    (n[z] > 0 ? Math.round((sum[z] / n[z]) * 5) : 0);
  return { def: avg('DEFENCE'), mid: avg('MIDFIELD'), att: avg('ATTACK') };
}
