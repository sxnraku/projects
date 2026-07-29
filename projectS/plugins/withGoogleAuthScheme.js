/**
 * Config plugin: regista o scheme "reversed client id" do Google OAuth no
 * AndroidManifest, para o login nativo (expo-auth-session) conseguir voltar à
 * app depois do consentimento no browser.
 *
 * O scheme é o ANDROID_CLIENT_ID ao contrário:
 *   663429666674-xxxx.apps.googleusercontent.com
 *     → com.googleusercontent.apps.663429666674-xxxx
 *
 * Mantém-se em sincronia com src/native/cloudConfig.ts (REVERSED_CLIENT_ID).
 * Se mudares o client id, muda aqui também.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const REVERSED_CLIENT_ID =
  'com.googleusercontent.apps.663429666674-p9u7ihpbjlbv5dh12tlbs55v1lerebl7';

module.exports = function withGoogleAuthScheme(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;
    const mainActivity = (app.activity ?? []).find(
      (a) => a.$?.['android:name'] === '.MainActivity',
    );
    if (!mainActivity) return cfg;

    mainActivity['intent-filter'] = mainActivity['intent-filter'] ?? [];
    const already = mainActivity['intent-filter'].some((f) =>
      (f.data ?? []).some((d) => d.$?.['android:scheme'] === REVERSED_CLIENT_ID),
    );
    if (already) return cfg;

    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [{ $: { 'android:scheme': REVERSED_CLIENT_ID } }],
    });
    return cfg;
  });
};
