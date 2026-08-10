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
  // Totalizadores da ÉPOCA (reiniciam no rollover). Opcionais: saves antigos = 0.
  seasonGoals?: number;
  seasonAssists?: number;
  seasonRating?: number; // soma das notas dos jogos (para média)
  seasonApps?: number;   // nº de jogos com nota (para média e onze da época)
  /** Subidas de atributo GANHAS no treino esta época (para o ecrã de Treino). */
  devSeason?: number;
  // Empréstimo: se definido, o jogador está emprestado. `clubId` é o clube onde
  // joga; `loanOwnerId` é o dono a quem regressa em `loanUntil` (época).
  loanOwnerId?: string;
  loanUntil?: number;
  /**
   * OPÇÃO DE COMPRA acordada no início do empréstimo: preço FIXO a que o clube
   * de acolhimento pode ficar com o jogador quando o empréstimo termina.
   * Como fica travado no dia do acordo, um jovem que exploda sai a preço de
   * saldo — é isso que faz valer a pena pedi-la (e custa mais no ordenado).
   */
  loanBuyOption?: number;
  // Suspensão: nº de jogos que ainda tem de falhar (vermelho → 1). 0/undefined = apto.
  suspended?: number;
  /**
   * Data (ISO) até à qual o jogador NÃO faz pedidos ao treinador (aumento/saída).
   * Arranca ao assinar e depois de cada pedido resolvido — sem isto o mesmo
   * jogador insatisfeito pedia de duas em duas semanas, e um reforço que
   * acabara de assinar contrato exigia aumento no dia seguinte.
   */
  requestCooldownUntil?: string;
  /** Reconversão de posição em curso (ver `core/training/retrain.ts`). */
  retraining?: { position: Position; weeksLeft: number };
  /** Relação com o treinador: confiança, conversas e promessas em aberto. */
  relation?: PlayerRelation;
  /**
   * Foco de treino INDIVIDUAL. Sobrepõe-se ao foco da equipa só para este
   * jogador — é como se trabalha um miúdo de 17 anos sem mudar o plano de toda
   * a gente. Ausente = segue a equipa.
   */
  trainingFocus?: string;
  /**
   * CARREIRA — uma linha por época jogada, arquivada no rollover antes de os
   * totalizadores serem limpos. Vive aqui (e não numa tabela nova) porque
   * `condition` já é um blob JSON: saves antigos carregam sem migração e a
   * história viaja com o jogador quando ele muda de clube.
   */
  history?: PlayerSeasonLine[];
}

/**
 * Uma época na carreira de um jogador. Campos curtos porque isto é gravado
 * para os ~1200 jogadores do mundo — ver `MAX_HISTORY_SEASONS`.
 */
export interface PlayerSeasonLine {
  season: number;
  /** Clube onde jogou a época (id). O nome guarda-se à parte, ver `clubName`. */
  clubId: string;
  /** Nome do clube NA ALTURA — o clube pode desaparecer ou mudar de nome. */
  clubName: string;
  /** Escalão em que jogou, para a ficha mostrar "1ª Divisão". */
  tier: number;
  apps: number;
  goals: number;
  assists: number;
  /** Média de nota ×10 (inteiro, para o JSON ser curto). 0 = sem notas. */
  rating10: number;
  /** Overall (0-100) no fim da época — desenha a curva de carreira. */
  overall: number;
}

/** Quantas épocas de carreira se guardam por jogador (as mais recentes). */
export const MAX_HISTORY_SEASONS = 20;

/** O que se pode prometer a um jogador (ver `core/game/relations.ts`). */
export const PromiseKind = {
  /** Mais minutos: espera jogar nas próximas jornadas. */
  PLAYING_TIME: 'PLAYING_TIME',
  /** Um reforço à altura dele antes do prazo. */
  SIGNING: 'SIGNING',
} as const;
export type PromiseKind = (typeof PromiseKind)[keyof typeof PromiseKind];

/** Promessa feita a um jogador, com prazo e a fotografia do que era na altura. */
export interface PlayerPromise {
  kind: PromiseKind;
  /** Data (ISO) até à qual tem de estar cumprida. */
  deadline: string;
  /** Jogos da época que ele já tinha quando a promessa foi feita. */
  baselineApps?: number;
  /** Nº de reforços já feitos na carreira à data da promessa (contador monotónico). */
  baselineSignings?: number;
  /** Overall mínimo que o reforço prometido tem de ter. */
  requiredOverall?: number;
}

/**
 * Como o jogador vê o treinador. `trust` vai de -100 a 100 e é a memória das
 * conversas: alimenta os pedidos de aumento e o salário que ele exige.
 */
export interface PlayerRelation {
  trust: number;
  /** Data (ISO) até à qual não vale a pena voltar a falar. */
  talkCooldownUntil?: string;
  promise?: PlayerPromise;
}

/** Dias de silêncio depois de assinar por um clube (aumento/saída). */
export const SIGNING_QUIET_DAYS = 120;

/**
 * Cala os pedidos deste jogador durante `days` dias a partir de `fromISO`.
 * Só ESTENDE o silêncio — nunca o encurta.
 */
export function silenceRequests(condition: PlayerCondition, fromISO: string, days: number): void {
  const d = new Date(fromISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  const until = d.toISOString().slice(0, 10);
  if (!condition.requestCooldownUntil || condition.requestCooldownUntil < until) {
    condition.requestCooldownUntil = until;
  }
}

/**
 * CLÁUSULAS DO CONTRATO — a camada que transforma o mercado de "propor valor e
 * esperar sim/não" numa negociação com decisões.
 *
 * Regras em `core/economy/clauses.ts`; aqui fica só a forma dos dados. Tudo é
 * opcional para os saves antigos continuarem a carregar sem migração.
 */
export interface ContractClauses {
  /**
   * Cláusula de rescisão: quem pagar isto leva o jogador SEM negociar com o
   * clube. Pô-la baixa faz o jogador aceitar menos ordenado — e expõe-te a
   * perdê-lo por uma pechincha.
   */
  releaseClause?: number;
  /** Percentagem (0..0.3) de uma FUTURA venda que fica para o clube vendedor. */
  sellOn?: number;
  /** Clube com direito à percentagem acima (normalmente quem o vendeu). */
  sellOnClubId?: string;
  /** Prémio por golo marcado (€, pago pelo clube do jogador). */
  goalBonus?: number;
  /** Prémio por jogo disputado (€). */
  appearanceBonus?: number;
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

  /** Cláusulas negociadas (rescisão, % de futura venda, prémios). */
  clauses?: ContractClauses;
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
 * Pesos de cada atributo no overall DESTA posição (só os que contam; os restantes
 * têm peso 0). Usado pelo treino para fazer crescer os atributos que REALMENTE
 * sobem o overall do jogador na sua posição.
 */
export function positionAttrWeights(position: Position): Partial<Record<keyof PlayerAttributes, number>> {
  return OVERALL_WEIGHTS[positionGroupOf(position)];
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

/**
 * Overall FINO (sem arredondar) — só para DISPLAY. Dá números finos na escala
 * 0-100 (ex.: 14.4 → 72), em vez de múltiplos de 5. A lógica do jogo continua
 * a usar `naturalOverall` (inteiro); isto é apenas cosmético.
 */
export function computeOverallFine(attributes: PlayerAttributes, position: Position): number {
  const weights = OVERALL_WEIGHTS[positionGroupOf(position)];
  let sum = 0, totalWeight = 0;
  for (const key in weights) {
    const k = key as keyof PlayerAttributes;
    sum += attributes[k] * weights[k]!;
    totalWeight += weights[k]!;
  }
  return sum / totalWeight;
}
export function naturalOverallFine(player: Player): number {
  return computeOverallFine(player.attributes, player.positions[0]);
}

/**
 * Overall na ESCALA DO ECRÃ (0-100) — exatamente o número que a ficha do
 * jogador mostra. O core usa-o nas notícias e notas para nunca anunciar um
 * valor diferente do que o utilizador vai ver (arredondar o inteiro interno e
 * só depois multiplicar por 5 chegava a anunciar 100 num jogador de 98).
 */
export function displayOverall(player: Player): number {
  return Math.round(Math.max(0, Math.min(20, naturalOverallFine(player))) * 5);
}

/**
 * Penalização por jogar fora da posição natural (escala interna 0-20).
 *
 * Subiu de 0.4/1.4 para 0.8/2.4 — ou seja, de 2/7 pontos para 4/12 na escala do
 * ecrã. Com a penalização antiga escalar um extremo a lateral quase não custava
 * e o onze "certo" deixava de importar. Quem quiser mudar mesmo de posição tem
 * agora a reconversão por treino (`core/training/retrain.ts`).
 */
export const OUT_OF_POSITION_PENALTY = { sameGroup: 0.8, otherGroup: 2.4 } as const;

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

/**
 * Overall efetivo FINO (sem arredondar) numa posição — para DISPLAY. Como
 * `effectiveOverall` mas com a escala fina, para a tática mostrar 74 e não 70.
 */
export function effectiveOverallFine(player: Player, position: Position): number {
  const base = computeOverallFine(player.attributes, position);
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

/**
 * Nome curto: inicial do primeiro nome + apelido (ex.: "P. Diddy"). Usado nas
 * listas densas (plantel, tática, mercado, partida) para diferenciar homónimos
 * sem ocupar o espaço do nome completo.
 */
export function shortName(player: Player): string {
  const initial = player.firstName ? `${player.firstName[0]}. ` : '';
  return `${initial}${player.lastName}`;
}
