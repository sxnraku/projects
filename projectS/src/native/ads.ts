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

/** Cap de segurança para um anúncio ABERTO cujo evento CLOSED nunca dispara. */
const AD_WATCH_CAP_MS = 180_000;

/**
 * Mostra um interstitial. Resolve quando fecha (ou no timeout). Nunca rejeita.
 * Se o anúncio não ABRIR dentro do timeout de carregamento, desiste depressa —
 * nunca deixa o jogo congelado à espera de um anúncio que não veio.
 */
export async function showInterstitial(): Promise<void> {
  const sdk = await loadSdk();
  if (!sdk) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let opened = false;
    let cleanup = () => {};
    const done = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
    try {
      const { InterstitialAd, AdEventType } = sdk;
      const ad = InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
      const subs = [
        ad.addAdEventListener(AdEventType.LOADED, () => ad.show()),
        ad.addAdEventListener(AdEventType.OPENED, () => { opened = true; }),
        ad.addAdEventListener(AdEventType.CLOSED, done),
        ad.addAdEventListener(AdEventType.ERROR, done),
      ];
      cleanup = () => subs.forEach((u) => u());
      ad.load();
      setTimeout(() => { if (!opened) done(); }, AD_LOAD_TIMEOUT_MS + 3000);
      setTimeout(done, AD_WATCH_CAP_MS);
    } catch { done(); }
  });
}

/**
 * Mostra um rewarded. Resolve true se o utilizador ganhou a recompensa.
 * Se não CARREGAR/ABRIR a tempo, devolve false depressa (sem congelar); depois de
 * aberto, aguarda o fecho com um cap de segurança.
 */
export async function showRewarded(): Promise<boolean> {
  const sdk = await loadSdk();
  if (!sdk) {
    // Fallback de desenvolvimento (Expo Go/sem SDK): simula anúncio visto.
    await new Promise((r) => setTimeout(r, 500));
    return true;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let opened = false;
    let earned = false;
    let cleanup = () => {};
    const done = (v: boolean) => { if (!settled) { settled = true; cleanup(); resolve(v); } };
    try {
      const { RewardedAd, AdEventType, RewardedAdEventType } = sdk;
      const ad = RewardedAd.createForAdRequest(AD_UNITS.rewarded);
      const subs = [
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show()),
        ad.addAdEventListener(AdEventType.OPENED, () => { opened = true; }),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
        ad.addAdEventListener(AdEventType.CLOSED, () => done(earned)),
        ad.addAdEventListener(AdEventType.ERROR, () => done(false)),
      ];
      cleanup = () => subs.forEach((u) => u());
      ad.load();
      // Não abriu a tempo → desiste (não dá o bónus, mas não congela).
      setTimeout(() => { if (!opened) done(false); }, AD_LOAD_TIMEOUT_MS + 3000);
      // Rede de segurança se CLOSED nunca disparar depois de aberto.
      setTimeout(() => done(earned), AD_WATCH_CAP_MS);
    } catch { done(false); }
  });
}
