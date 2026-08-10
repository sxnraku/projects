import { ContractClauses, Player } from '../models';
import { computeMarketValue, suggestedWage } from './marketValue';

/**
 * CLÁUSULAS DE CONTRATO.
 *
 * Até aqui um contrato era só duração + salário, e o mercado resumia-se a
 * "proponho X, aceitas ou não". As cláusulas dão ao contrato eixos onde há
 * mesmo uma escolha, com custo dos dois lados:
 *
 *  - RESCISÃO: baixa → o jogador aceita menos ordenado, mas qualquer clube com
 *    dinheiro to leva sem pedir licença. Alta → sai caro na folha salarial.
 *  - % DE FUTURA VENDA: abdicas de parte do passe hoje para receberes uma fatia
 *    da próxima venda. Bom para vender jovens; mau se ele encalhar.
 *  - PRÉMIOS (por golo / por jogo): trocas salário fixo por salário variável.
 *    Sai barato se ele for suplente, caro se for decisivo.
 *
 * Funções puras. As regras de quem paga o quê vivem em `transfers.ts`,
 * `contracts.ts` e no `advanceWeek`.
 */

// --------------------------------------------------------------- rescisão

/** A cláusula nunca pode ser inferior a isto (senão era uma venda disfarçada). */
export const MIN_RELEASE_MULTIPLE = 1.2;
/** Até este múltiplo do valor de mercado a cláusula conta como "barata". */
export const CHEAP_RELEASE_MULTIPLE = 1.6;
/** A partir deste múltiplo é uma cláusula "blindada". */
export const RICH_RELEASE_MULTIPLE = 3;
/** Desconto salarial máximo por dar uma saída fácil ao jogador. */
export const CHEAP_RELEASE_DISCOUNT = 0.12;
/** Agravamento salarial máximo por o prender com uma cláusula alta. */
export const RICH_RELEASE_PREMIUM = 0.1;
/** Sem cláusula nenhuma o jogador sente-se preso e pede um pouco mais. */
export const NO_RELEASE_PREMIUM = 0.05;

/** Mínimo legal para a cláusula de rescisão deste jogador. */
export function minReleaseClause(player: Player, season: number): number {
  const value = Math.max(computeMarketValue(player, season), 100_000);
  return Math.round((value * MIN_RELEASE_MULTIPLE) / 10_000) * 10_000;
}

/** Sugestão razoável: o dobro do valor de mercado. */
export function defaultReleaseClause(player: Player, season: number): number {
  const value = Math.max(computeMarketValue(player, season), 100_000);
  return Math.round((value * 2) / 10_000) * 10_000;
}

/**
 * Multiplicador aplicado ao salário exigido por causa da cláusula de rescisão.
 * Interpola entre o desconto (cláusula barata) e o prémio (cláusula blindada).
 */
export function releaseWageFactor(clauses: ContractClauses | undefined, value: number): number {
  const clause = clauses?.releaseClause;
  if (!clause || clause <= 0 || value <= 0) return 1 + NO_RELEASE_PREMIUM;
  const ratio = clause / value;
  if (ratio <= CHEAP_RELEASE_MULTIPLE) return 1 - CHEAP_RELEASE_DISCOUNT;
  if (ratio >= RICH_RELEASE_MULTIPLE) return 1 + RICH_RELEASE_PREMIUM;
  const k = (ratio - CHEAP_RELEASE_MULTIPLE) / (RICH_RELEASE_MULTIPLE - CHEAP_RELEASE_MULTIPLE);
  return (1 - CHEAP_RELEASE_DISCOUNT) + k * (CHEAP_RELEASE_DISCOUNT + RICH_RELEASE_PREMIUM);
}

// ----------------------------------------------------------------- prémios

/**
 * Quanto de salário SEMANAL os prémios substituem aos olhos do jogador.
 *
 * Um jogador joga ~0.8 jogos por semana e marca bem menos do que isso; os
 * fatores refletem essa frequência já descontada do risco de não jogar. Não é
 * física, é a heurística com que ele negoceia.
 */
export const APPEARANCE_WAGE_FACTOR = 0.55;
export const GOAL_WAGE_FACTOR = 0.18;
/** Nunca aceita trocar mais do que isto do fixo por variável. */
export const MAX_BONUS_WAGE_SHARE = 0.3;

export function bonusWageOffset(clauses: ContractClauses | undefined, baseWage: number): number {
  if (!clauses) return 0;
  const raw = (clauses.appearanceBonus ?? 0) * APPEARANCE_WAGE_FACTOR
    + (clauses.goalBonus ?? 0) * GOAL_WAGE_FACTOR;
  return Math.min(raw, baseWage * MAX_BONUS_WAGE_SHARE);
}

/** Prémios devidos por uma jornada (golos marcados + jogo disputado). */
export function bonusesDue(clauses: ContractClauses | undefined, goals: number, played: boolean): number {
  if (!clauses) return 0;
  const goalPart = goals > 0 ? goals * (clauses.goalBonus ?? 0) : 0;
  const appPart = played ? (clauses.appearanceBonus ?? 0) : 0;
  return Math.max(0, Math.round(goalPart + appPart));
}

// ----------------------------------------------------------- futura venda

/** Percentagens de futura venda oferecidas na UI. */
export const SELL_ON_STEPS = [0, 0.1, 0.2, 0.3] as const;
export const MAX_SELL_ON = 0.3;
/**
 * Quanto o comprador desconta no passe por cada ponto de futura venda.
 * 0.5 → 20% de futura venda custa 10% do passe hoje. Trocar tudo por já-já
 * nunca compensa; a aposta é o jogador valorizar.
 */
export const SELL_ON_FEE_TRADE = 0.5;

/** Fator a aplicar ao passe quando se exige `sellOn` de futura venda. */
export function sellOnFeeFactor(sellOn: number): number {
  const pct = Math.max(0, Math.min(MAX_SELL_ON, sellOn));
  return 1 - pct * SELL_ON_FEE_TRADE;
}

/** Fatia da venda que pertence a um terceiro clube (ou null). */
export function sellOnCut(
  fee: number,
  clauses: ContractClauses | undefined,
): { clubId: string; amount: number } | null {
  const pct = clauses?.sellOn ?? 0;
  const clubId = clauses?.sellOnClubId;
  if (!clubId || pct <= 0 || fee <= 0) return null;
  return { clubId, amount: Math.round(fee * Math.min(pct, MAX_SELL_ON)) };
}

// ------------------------------------------------------------- salário

/**
 * Desconto/agravamento máximo no salário por causa da relação com o treinador.
 * Quem confia assina por menos; quem foi enganado cobra a fatura.
 */
export const TRUST_WAGE_SWING = 0.08;

export function trustWageFactor(player: Player): number {
  const trust = player.condition.relation?.trust ?? 0;
  return 1 - (Math.max(-100, Math.min(100, trust)) / 100) * TRUST_WAGE_SWING;
}

/**
 * Salário semanal que o jogador exige TENDO EM CONTA as cláusulas propostas
 * e a relação com o treinador. É este número que `transfers.ts` e
 * `contracts.ts` usam — `suggestedWage` continua a ser a base "em bruto".
 */
export function requiredWageWith(
  player: Player,
  season: number,
  clauses?: ContractClauses,
): number {
  const base = suggestedWage(player, season);
  const value = computeMarketValue(player, season);
  const withRelease = base * releaseWageFactor(clauses, value) * trustWageFactor(player);
  const net = withRelease - bonusWageOffset(clauses, withRelease);
  return Math.max(300, Math.round(net / 100) * 100);
}

/**
 * Corrige cláusulas vindas da UI: limpa negativos, força o mínimo da rescisão e
 * limita a percentagem de futura venda. Devolve `undefined` se ficar vazio
 * (evita encher os saves de objetos sem conteúdo).
 */
export function normalizeClauses(
  clauses: ContractClauses | undefined,
  player: Player,
  season: number,
): ContractClauses | undefined {
  if (!clauses) return undefined;
  const out: ContractClauses = {};
  if (clauses.releaseClause && clauses.releaseClause > 0) {
    out.releaseClause = Math.max(minReleaseClause(player, season), Math.round(clauses.releaseClause));
  }
  if (clauses.sellOn && clauses.sellOn > 0 && clauses.sellOnClubId) {
    out.sellOn = Math.min(MAX_SELL_ON, clauses.sellOn);
    out.sellOnClubId = clauses.sellOnClubId;
  }
  if (clauses.goalBonus && clauses.goalBonus > 0) out.goalBonus = Math.round(clauses.goalBonus);
  if (clauses.appearanceBonus && clauses.appearanceBonus > 0) {
    out.appearanceBonus = Math.round(clauses.appearanceBonus);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Já se pode pagar a cláusula deste jogador (existe e o valor chega)? */
export function canTriggerRelease(player: Player, fee: number): boolean {
  const clause = player.clauses?.releaseClause;
  return !!clause && clause > 0 && fee >= clause;
}
