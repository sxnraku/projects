/**
 * Versão WEB do adaptador de anúncios (Metro escolhe *.web.ts em builds web).
 *
 * O SDK react-native-google-mobile-ads importa módulos só-nativos e nem sequer
 * pode ser resolvido num bundle web — por isso esta versão nunca o referencia.
 * Simula os anúncios para o fluxo de jogo continuar testável no browser.
 * A API é idêntica à de app/ads.ts (nativo).
 */

export async function initAds(): Promise<void> {
  // Sem SDK em web — nada a inicializar.
}

/** Interstitial simulado: resolve imediatamente, sem bloquear o jogo. */
export async function showInterstitial(): Promise<void> {
  return;
}

/** Rewarded simulado: pequena espera e recompensa concedida (só em dev/web). */
export async function showRewarded(): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 600));
  return true;
}
