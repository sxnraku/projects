/**
 * COMPRAS — versão WEB (stub).
 *
 * Não há Play Store no browser. Segue o padrão do `AdBanner.web.tsx` e do
 * `CloudBackup.web.tsx`: o Metro escolhe este ficheiro no web e o outro no
 * telemóvel, para os testes E2E correrem sem tocar em nada nativo.
 *
 * `purchasesAvailable()` devolve false, e é isso que faz a loja e a linha do
 * Premium simplesmente não aparecerem em vez de aparecerem avariadas.
 */
import type { VipPlan } from '../monetization/catalog';
export { PREMIUM_SKU } from '../monetization/catalog';

export type PurchaseOutcome =
  | { ok: true; restored: boolean }
  | { ok: false; reason: 'CANCELLED' | 'UNAVAILABLE' | 'ERROR'; message?: string };

const UNAVAILABLE: PurchaseOutcome = { ok: false, reason: 'UNAVAILABLE' };

export async function restore(): Promise<boolean> {
  return false;
}

export async function buyPremium(): Promise<PurchaseOutcome> {
  return UNAVAILABLE;
}

export async function premiumPrice(): Promise<string | null> {
  return null;
}

export async function purchasesAvailable(): Promise<boolean> {
  return false;
}

export async function cashPrices(): Promise<Record<string, string>> {
  return {};
}

export async function buyCashPack(_sku: string, _onGrant: (amount: number) => void): Promise<PurchaseOutcome> {
  return UNAVAILABLE;
}

export async function claimPendingCash(_onGrant: (amount: number) => void): Promise<number> {
  return 0;
}

/** null = a loja não respondeu (não revogar nada). */
export async function restoreVip(): Promise<boolean | null> {
  return null;
}

export async function vipPrices(): Promise<Partial<Record<VipPlan, string>>> {
  return {};
}

export async function buyVip(_plan: VipPlan): Promise<PurchaseOutcome> {
  return UNAVAILABLE;
}
