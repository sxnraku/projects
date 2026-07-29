/**
 * Porta de atualização forçada — versão JS pura (funciona no build LOCAL Windows).
 *
 * Ao abrir, a app lê um JSON remoto com a versão mínima suportada:
 *     { "minVersionCode": 13 }
 * Se a versão INSTALADA (APP_VERSION_CODE) for inferior, mostra um ecrã
 * bloqueante (ver src/ui/ForcedUpdateGate.tsx) que manda o jogador à Play Store.
 *
 * FALHA SEMPRE EM ABERTO: se o fetch falhar (sem rede, URL vazio, JSON inválido),
 * NÃO bloqueia — nunca tranca um jogador offline fora do jogo.
 *
 * Nota: a lib nativa `sp-react-native-in-app-updates` (update "inline" da Play)
 * continua fora — estoura o limite de 260 chars do Windows no codegen New-Arch.
 * Esta porta substitui-a sem qualquer módulo nativo.
 *
 * CHECKLIST DE RELEASE:
 *   1. Bumpa APP_VERSION_CODE aqui + versionCode em android/app/build.gradle (iguais).
 *   2. Para FORÇAR: publica o novo .aab e põe "minVersionCode" no ficheiro remoto
 *      igual ao código novo — quem estiver abaixo fica bloqueado até atualizar.
 */
import { Linking, Platform } from 'react-native';

/** Código da versão DESTE build. Manter igual ao versionCode do build.gradle. */
export const APP_VERSION_CODE = 20;

const ANDROID_PACKAGE = 'com.rakulabs.footballlegacy';

/**
 * URL do JSON com { "minVersionCode": N }. Ex.: um raw do GitHub.
 * Vazio ('') = porta DESLIGADA (nunca bloqueia) — seguro para lançar antes de
 * ter o ficheiro remoto pronto. Basta colar o URL aqui e recompilar.
 */
export const VERSION_GATE_URL = 'https://sxnraku.github.io/min-version.json';

/** Lê a versão mínima remota. Devolve null em QUALQUER falha (falha em aberto). */
export async function fetchMinVersionCode(): Promise<number | null> {
  if (!VERSION_GATE_URL) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(VERSION_GATE_URL, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const min = Number(json?.minVersionCode);
    return Number.isFinite(min) ? min : null;
  } catch {
    return null;
  }
}

/** Abre a página da app na Play Store (app nativa → fallback web). */
export async function openStore(): Promise<void> {
  const market = `market://details?id=${ANDROID_PACKAGE}`;
  const web = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  try {
    if (await Linking.canOpenURL(market)) {
      await Linking.openURL(market);
      return;
    }
  } catch {
    /* cai no fallback web */
  }
  try {
    await Linking.openURL(web);
  } catch {
    /* sem browser disponível — nada a fazer */
  }
}

/** A porta só faz sentido no Android (é a Play Store). */
export const forcedUpdateSupported = Platform.OS === 'android';
