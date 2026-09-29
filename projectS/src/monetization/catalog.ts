/**
 * CATÁLOGO DA LOJA — os IDs têm de ser EXATAMENTE os da Play Console e, uma vez
 * publicados, nunca mudam. Puro (sem RN): usado pela camada nativa, pelo stub web,
 * pela UI e pelos smoke tests.
 *
 * Produtos únicos:
 *  - `premium_no_ads` — não consumível, remove anúncios para sempre.
 *  - `cash_*`         — consumíveis, injetam dinheiro na caixa do clube.
 * Subscrição `vip` (planos base `monthly` / `yearly`) — sem anúncios + extras.
 */
export const PREMIUM_SKU = 'premium_no_ads';

export interface CashPack {
  sku: string;
  /** Dinheiro creditado ao clube, em euros. */
  amount: number;
}

export const CASH_PACKS: readonly CashPack[] = [
  { sku: 'cash_small', amount: 1_000_000 },
  { sku: 'cash_medium', amount: 4_000_000 },
  { sku: 'cash_large', amount: 10_000_000 },
];

/** Subscrição VIP: um produto de subscrição com dois planos de faturação. */
export const VIP_SKU = 'vip';
export const VIP_PLANS = ['monthly', 'yearly'] as const;
export type VipPlan = (typeof VIP_PLANS)[number];

/** Multiplicador do bónus diário para VIP. */
export const VIP_DAILY_MULTIPLIER = 2;

export function cashPackBySku(sku: string): CashPack | undefined {
  return CASH_PACKS.find((p) => p.sku === sku);
}
