/**
 * Adaptador de anúncios (AdMob via react-native-google-mobile-ads) — NATIVO.
 * Em web o Metro usa ads.web.ts. Regras:
 *  - IDs e flag test/prod vêm de adConfig.ts (único sítio a editar).
 *  - Consentimento GDPR (UMP) é pedido uma vez no arranque — obrigatório na UE.
 *  - Todos os anúncios têm timeout: rede má nunca pode travar o jogo.
 *  - Falhas são silenciosas (Expo Go sem módulo nativo, sem rede, etc.).
 */
import { AD_LOAD_TIMEOUT_MS, AD_UNITS } from './adConfig';
import { isExpoGo } from './runtime';

type AdsModule = typeof import('react-native-google-mobile-ads');

let adsModule: AdsModule | null = null;
let unavailable = isExpoGo; // Expo Go não tem o módulo nativo
let initialized = false;

async function loadSdk(): Promise<AdsModule | null> {
  if (unavailable) return null;
  if (!adsModule) {
    try {
      adsModule = await import('react-native-google-mobile-ads');
    } catch {
      unavailable = true;
      return null;
    }
  }
  return adsModule;
}

/**
 * Inicializa o SDK e pede consentimento (UMP) uma vez, no arranque da app.
 * Seguro chamar sempre; não rejeita.
 */
export async function initAds(): Promise<void> {
  const sdk = await loadSdk();
  if (!sdk || initialized) return;
  try {
    // Consentimento de privacidade (GDPR/UE). Sem isto, a Play Store rejeita.
    const ump = (sdk as unknown as {
      AdsConsent?: {
        requestInfoUpdate: () => Promise<unknown>;
        loadAndShowConsentFormIfRequired: () => Promise<unknown>;
      };
    }).AdsConsent;
    if (ump) {
      await ump.requestInfoUpdate();
      await ump.loadAndShowConsentFormIfRequired().catch(() => {});
    }
    await sdk.default().initialize();
    initialized = true;
  } catch {
    // Sem consentimento/SDK → o jogo corre à mesma, apenas sem anúncios.
    initialized = true;
  }
}

/** Promessa que resolve com `fallback` se `p` demorar mais de `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    p.then((v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } })
      .catch(() => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } });
  });
}

/**
 * Mostra um interstitial. Resolve quando fecha (ou no timeout). Nunca rejeita.
 */
export async function showInterstitial(): Promise<void> {
  const sdk = await loadSdk();
  if (!sdk) return;
  const show = new Promise<void>((resolve) => {
    try {
      const { InterstitialAd, AdEventType } = sdk;
      const ad = InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
      const done = () => { unsubL(); unsubC(); unsubE(); resolve(); };
      const unsubL = ad.addAdEventListener(AdEventType.LOADED, () => ad.show());
      const unsubC = ad.addAdEventListener(AdEventType.CLOSED, done);
      const unsubE = ad.addAdEventListener(AdEventType.ERROR, done);
      ad.load();
    } catch {
      resolve();
    }
  });
  await withTimeout(show, AD_LOAD_TIMEOUT_MS + 4000, undefined);
}

/**
 * Mostra um rewarded. Resolve true se o utilizador ganhou a recompensa.
 * Timeout no CARREGAMENTO devolve false (não dá o bónus sem ver o anúncio).
 */
export async function showRewarded(): Promise<boolean> {
  const sdk = await loadSdk();
  if (!sdk) {
    // Fallback de desenvolvimento (Expo Go/sem SDK): simula anúncio visto.
    await new Promise((r) => setTimeout(r, 500));
    return true;
  }
  const show = new Promise<boolean>((resolve) => {
    try {
      const { RewardedAd, AdEventType, RewardedAdEventType } = sdk;
      const ad = RewardedAd.createForAdRequest(AD_UNITS.rewarded);
      let earned = false;
      const done = () => { unsubL(); unsubR(); unsubC(); unsubE(); resolve(earned); };
      const unsubL = ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show());
      const unsubR = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
      const unsubC = ad.addAdEventListener(AdEventType.CLOSED, done);
      const unsubE = ad.addAdEventListener(AdEventType.ERROR, done);
      ad.load();
    } catch {
      resolve(false);
    }
  });
  return withTimeout(show, AD_LOAD_TIMEOUT_MS + 60000, false);
}
