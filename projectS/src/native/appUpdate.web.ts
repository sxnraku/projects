/**
 * Web não tem Play Store — sem atualização in-app.
 *
 * Espelha a superfície de appUpdate.ts: quem importa daqui (ForcedUpdateGate,
 * CloudBackup) recebe valores reais em vez de `undefined`. Sem isto, o
 * versionCode escrito no envelope da nuvem saía vazio no bundle web.
 */
import Constants from 'expo-constants';

const FALLBACK_VERSION_CODE = 39;

export const APP_VERSION_CODE =
  Number(Constants.expoConfig?.android?.versionCode) || FALLBACK_VERSION_CODE;

export const VERSION_GATE_URL = '';

/** A porta não corre em web. */
export const forcedUpdateSupported = false;

export async function fetchMinVersionCode(): Promise<number | null> {
  return null; // falha em aberto: nunca bloqueia
}

export async function openStore(): Promise<void> {
  // sem loja em web
}

export async function checkForForcedUpdate(): Promise<void> {
  // no-op em web
}
