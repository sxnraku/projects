/**
 * Configuração central de anúncios — o ÚNICO sítio a editar para o lançamento.
 *
 * ⚠️ SEGURANÇA: usamos anúncios de TESTE em desenvolvimento e anúncios REAIS
 * apenas no build de produção (via __DEV__). NUNCA cliques nos teus anúncios
 * reais a testar — a Google bane a conta AdMob por isso. Em dev vês sempre
 * anúncios de teste; o build EAS de produção usa os teus IDs reais.
 */

// Anúncios REAIS em produção, de TESTE em desenvolvimento.
// __DEV__ é false no build EAS de produção (→ IDs reais, receita normal) e
// true em `expo start` (→ IDs de teste). Nunca pôr `false` fixo: clicar nos
// próprios anúncios reais a testar leva a Google a banir a conta AdMob.
export const USE_TEST_ADS = __DEV__;

// IDs de teste oficiais da Google (não editar).
const TEST = {
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  banner: 'ca-app-pub-3940256099942544/9214589741',
};

// IDs reais da tua conta AdMob (app "Football Legacy").
const PROD = {
  interstitial: 'ca-app-pub-7583056430043166/7131247068',
  rewarded: 'ca-app-pub-7583056430043166/5686871674',
  banner: 'ca-app-pub-7583056430043166/5220087950',
};

const ids = USE_TEST_ADS ? TEST : PROD;

export const AD_UNITS = {
  interstitial: ids.interstitial,
  rewarded: ids.rewarded,
  banner: ids.banner,
} as const;

/** True se o bloco existe (não vazio) — evita tentar mostrar anúncios sem ID. */
export function hasUnit(unit: keyof typeof AD_UNITS): boolean {
  return AD_UNITS[unit].length > 0;
}

/** Um anúncio nunca pode bloquear o jogo — timeout de carregamento. */
export const AD_LOAD_TIMEOUT_MS = 6000;
