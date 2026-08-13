/**
 * COMPRAS NA APP — o Premium (jogar sem anúncios).
 *
 * Camada nativa, como os anúncios e o áudio: o core continua puro e sem IO.
 *
 * Três regras que decidem se isto é aceitável ou uma fonte de reembolsos:
 *
 *  1. **Restaurar é obrigatório.** Quem paga, desinstala e volta a instalar TEM
 *     de recuperar o Premium sem pagar outra vez. É a queixa nº1 deste tipo de
 *     produto e é motivo de reembolso automático. Por isso `restore()` corre
 *     sozinho no arranque, sempre, sem o utilizador ter de pedir.
 *  2. **Nunca bloquear o jogo.** Se a Play Store não responder, se o telemóvel
 *     estiver offline, se o módulo nativo faltar — o jogo abre na mesma, apenas
 *     sem Premium. Tudo aqui é `try/catch` e nada rejeita.
 *  3. **A loja é a fonte da verdade.** O estado guardado localmente é só uma
 *     cache para o jogo abrir depressa; quem manda é o que a Play Store diz ter
 *     sido comprado.
 *
 * O produto tem de existir e estar ATIVO na Play Console antes de isto
 * funcionar — ver `docs/PREMIUM.md`.
 */
import type { Purchase } from 'expo-iap';

/**
 * ID do produto na Play Console. Tem de ser exatamente igual ao que lá está
 * criado — e, uma vez publicado, NUNCA pode mudar.
 */
export const PREMIUM_SKU = 'premium_no_ads';

/** Estado de uma tentativa de compra, para a UI dizer o que aconteceu. */
export type PurchaseOutcome =
  | { ok: true; restored: boolean }
  | { ok: false; reason: 'CANCELLED' | 'UNAVAILABLE' | 'ERROR'; message?: string };

type Iap = typeof import('expo-iap');

let iap: Iap | null | undefined;
let connected = false;

/**
 * Carrega o módulo à primeira utilização. `require` preguiçoso de propósito: em
 * web, em Expo Go ou num build sem o módulo nativo, isto falha — e falhar aqui
 * tem de custar zero ao resto do jogo.
 */
function loadIap(): Iap | null {
  if (iap !== undefined) return iap;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iap = require('expo-iap') as Iap;
  } catch {
    iap = null;
  }
  return iap;
}

/** Liga à loja. Idempotente e silencioso. */
async function connect(): Promise<Iap | null> {
  const sdk = loadIap();
  if (!sdk) return null;
  if (connected) return sdk;
  try {
    await sdk.initConnection();
    connected = true;
    return sdk;
  } catch {
    return null;
  }
}

/** Uma compra do nosso produto que esteja de facto paga. */
function isOurs(p: Purchase): boolean {
  const anyP = p as unknown as { productId?: string; ids?: string[] };
  return anyP.productId === PREMIUM_SKU || anyP.ids?.includes(PREMIUM_SKU) === true;
}

/**
 * O Premium está comprado, segundo a LOJA?
 *
 * Corre no arranque. Devolve `false` em qualquer situação de dúvida — nunca dá
 * Premium por engano, e nunca atira.
 */
export async function restore(): Promise<boolean> {
  const sdk = await connect();
  if (!sdk) return false;
  try {
    const purchases = await sdk.getAvailablePurchases();
    const mine = purchases.filter(isOurs);
    // Um produto não consumível fica "por terminar" até ser reconhecido. Se não
    // o fizermos em 3 dias, a Google reembolsa e revoga a compra.
    for (const p of mine) {
      try { await sdk.finishTransaction({ purchase: p, isConsumable: false }); } catch { /* já reconhecida */ }
    }
    return mine.length > 0;
  } catch {
    return false;
  }
}

/**
 * Abre o fluxo de compra da Play Store e espera pelo desfecho.
 *
 * O `requestPurchase` é por EVENTOS (não devolve a compra), por isso escuta-se
 * `purchaseUpdated` e `purchaseError` e resolve-se no primeiro que chegar. O
 * timeout existe para o botão nunca ficar preso: se a folha de pagamento não
 * responder, devolve-se o controlo ao utilizador.
 */
export async function buyPremium(timeoutMs = 180_000): Promise<PurchaseOutcome> {
  const sdk = await connect();
  if (!sdk) return { ok: false, reason: 'UNAVAILABLE' };

  // Se já estiver comprado (reinstalação), não se cobra outra vez.
  if (await restore()) return { ok: true, restored: true };

  try {
    const products = await sdk.fetchProducts({ skus: [PREMIUM_SKU], type: 'in-app' });
    if (!products || products.length === 0) return { ok: false, reason: 'UNAVAILABLE' };
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  return new Promise<PurchaseOutcome>((resolve) => {
    let settled = false;
    const done = (out: PurchaseOutcome) => {
      if (settled) return;
      settled = true;
      try { subOk.remove(); } catch { /* ignora */ }
      try { subErr.remove(); } catch { /* ignora */ }
      clearTimeout(timer);
      resolve(out);
    };

    const subOk = sdk.purchaseUpdatedListener((p) => {
      if (!isOurs(p)) return;
      // Reconhecer é obrigatório: sem isto a Google reembolsa em 3 dias.
      void sdk.finishTransaction({ purchase: p, isConsumable: false })
        .catch(() => { /* já reconhecida */ })
        .finally(() => done({ ok: true, restored: false }));
    });

    const subErr = sdk.purchaseErrorListener((e) => {
      const code = String((e as unknown as { code?: string }).code ?? '');
      // Desistir não é um erro a comunicar como falha.
      const cancelled = /cancel/i.test(code) || /cancel/i.test(e?.message ?? '');
      done(cancelled
        ? { ok: false, reason: 'CANCELLED' }
        : { ok: false, reason: 'ERROR', message: e?.message });
    });

    const timer = setTimeout(() => done({ ok: false, reason: 'ERROR' }), timeoutMs);

    try {
      // As chaves são por SDK (`google`/`apple`), não por sistema operativo.
      void sdk.requestPurchase({
        request: { google: { skus: [PREMIUM_SKU] }, apple: { sku: PREMIUM_SKU } },
        type: 'in-app',
      });
    } catch (e) {
      done({ ok: false, reason: 'ERROR', message: (e as Error)?.message });
    }
  });
}

/** Preço formatado pela loja (ex.: "2,99 €"), ou null se não der para saber. */
export async function premiumPrice(): Promise<string | null> {
  const sdk = await connect();
  if (!sdk) return null;
  try {
    const products = await sdk.fetchProducts({ skus: [PREMIUM_SKU], type: 'in-app' });
    const p = products?.[0] as unknown as { displayPrice?: string; price?: string } | undefined;
    return p?.displayPrice ?? p?.price ?? null;
  } catch {
    return null;
  }
}

/** A loja está disponível neste dispositivo? (a UI esconde o botão se não). */
export async function purchasesAvailable(): Promise<boolean> {
  return (await connect()) !== null;
}
