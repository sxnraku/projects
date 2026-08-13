/**
 * COMPRAS — versão WEB (stub).
 *
 * Não há Play Store no browser. Segue o padrão do `AdBanner.web.tsx` e do
 * `CloudBackup.web.tsx`: o Metro escolhe este ficheiro no web e o outro no
 * telemóvel, para os testes E2E correrem sem tocar em nada nativo.
 *
 * `purchasesAvailable()` devolve false, e é isso que faz a linha do Premium
 * simplesmente não aparecer nas Definições em vez de aparecer avariada.
 */
export const PREMIUM_SKU = 'premium_no_ads';

export type PurchaseOutcome =
  | { ok: true; restored: boolean }
  | { ok: false; reason: 'CANCELLED' | 'UNAVAILABLE' | 'ERROR'; message?: string };

export async function restore(): Promise<boolean> {
  return false;
}

export async function buyPremium(): Promise<PurchaseOutcome> {
  return { ok: false, reason: 'UNAVAILABLE' };
}

export async function premiumPrice(): Promise<string | null> {
  return null;
}

export async function purchasesAvailable(): Promise<boolean> {
  return false;
}
