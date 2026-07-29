/**
 * Configuração do save na nuvem (Google Drive appDataFolder).
 *
 * Fluxo NATIVO por scheme (reversed-client-id) — só precisa do cliente OAuth do
 * tipo "Android" (package com.rakulabs.footballlegacy + SHA-1 da chave de
 * assinatura). Não é preciso cliente Web.
 *
 * IMPORTANTE: o login Google real só funciona no AAB assinado/instalado (o SHA-1
 * tem de bater certo). Em Expo Go não testa.
 */
export const ANDROID_CLIENT_ID = '663429666674-p9u7ihpbjlbv5dh12tlbs55v1lerebl7.apps.googleusercontent.com';
export const WEB_CLIENT_ID = ''; // não usado no fluxo nativo

/**
 * Reversed client id — é o scheme de redirect que o intent-filter do
 * AndroidManifest tem de declarar. Derivado do ANDROID_CLIENT_ID.
 */
export const REVERSED_CLIENT_ID = (() => {
  const prefix = ANDROID_CLIENT_ID.replace('.apps.googleusercontent.com', '');
  return prefix ? `com.googleusercontent.apps.${prefix}` : '';
})();

/** Scope mínimo: pasta escondida da app no Drive do jogador (o "Saved Games"). */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Nome do ficheiro do save na nuvem. */
export const CLOUD_SAVE_NAME = 'football-legacy-save.json';

/** True se o ID foi preenchido (nuvem disponível). Fluxo nativo → só Android. */
export const cloudConfigured = ANDROID_CLIENT_ID.length > 0;
