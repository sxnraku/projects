import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { AudioSettings } from '../core/career';

/**
 * EFEITOS SONOROS E VIBRAÇÃO.
 *
 * Camada de UI (o core continua puro e sem IO). Os ficheiros são gerados por
 * `scripts/gen-sounds.js` — sintetizados, sem licenças e com poucos KB.
 *
 * Regras:
 *  - Tudo é "fire and forget": nenhuma chamada devolve promessa nem bloqueia a UI.
 *  - Tudo está protegido por try/catch. Um telemóvel sem áudio, um emulador sem
 *    saída de som ou o módulo nativo em falta NUNCA podem partir o jogo.
 *  - Os leitores são criados à primeira utilização (arranque da app fica leve) e
 *    reaproveitados, com `seekTo(0)` para poderem repetir.
 */

export type SoundName =
  | 'whistle'      // apito de início
  | 'whistleEnd'   // apito final
  | 'foul'         // apito curto (falta / cartão)
  | 'goal'         // golo nosso
  | 'goalAgainst'  // golo sofrido
  | 'crowd'        // reação da bancada
  | 'ambience'     // murmúrio de estádio (em ciclo, durante a partida)
  | 'pass'         // toque na bola
  | 'shot'         // remate
  | 'net'          // bola a entrar na rede
  | 'click'        // toque de interface
  | 'trophy';      // troféu / conquista

// Os `require` têm de ser estáticos para o Metro empacotar os assets.
const SOURCES: Record<SoundName, number> = {
  // Gravações REAIS (mp3/wav) nos cinco momentos que se ouvem de verdade;
  // o resto continua sintetizado, que para um clique ou um passe chega e sobra.
  whistle: require('../../assets/sounds/whistle.mp3'),
  whistleEnd: require('../../assets/sounds/whistle_end.mp3'),
  foul: require('../../assets/sounds/foul.wav'),
  goal: require('../../assets/sounds/celebration.wav'),
  goalAgainst: require('../../assets/sounds/goal_against.wav'),
  crowd: require('../../assets/sounds/crowd.wav'),
  ambience: require('../../assets/sounds/stadium.mp3'),
  pass: require('../../assets/sounds/pass.wav'),
  shot: require('../../assets/sounds/shot.wav'),
  net: require('../../assets/sounds/net.mp3'),
  click: require('../../assets/sounds/click.wav'),
  trophy: require('../../assets/sounds/trophy.wav'),
};

/**
 * Volume relativo de cada som.
 *
 * A regra é: o golo é o único momento que pode "encher"; tudo o resto fica
 * discreto. Um apito, mesmo já abafado na síntese, cai numa banda a que o
 * ouvido é muito sensível — à mesma amplitude do ruído de multidão parecia o
 * dobro do volume. O clique de interface é o som mais repetido da sessão, por
 * isso é o mais baixo de todos: nota-se se estiver lá, não incomoda.
 */
const GAIN: Record<SoundName, number> = {
  // Os cinco valores das gravações REAIS foram medidos, não estimados: o RMS de
  // cada ficheiro comparado com o do som sintetizado que substituiu. Sem isso
  // ficavam todos errados no mesmo dia — o estádio, por exemplo, tem um RMS de
  // 0.037 contra os 0.159 do antigo, e ao ganho de 0.16 dava um pico efetivo de
  // 0.05: uma cama que não se ouvia.
  whistle: 0.26,
  whistleEnd: 0.2,
  foul: 0.26,
  // A celebração é o único som que pode encher — mas soa POR CIMA do estádio e
  // da rede, por isso fica a 0.8 e não a 1: é a folga que evita saturar quando
  // os três se sobrepõem no golo.
  goal: 0.8,
  goalAgainst: 0.6,
  crowd: 0.35,
  // O ambiente é uma CAMA: tem de se sentir sem nunca competir com o resto.
  ambience: 0.65,
  pass: 0.22,
  shot: 0.34,
  net: 0.45,
  click: 0.12,
  trophy: 0.75,
};

let settings: AudioSettings = { sound: true, volume: 0.7, haptics: true };
const players: Partial<Record<SoundName, AudioPlayer>> = {};
let modeReady = false;

/** Liga o áudio à sessão do sistema (não interrompe música de fundo). */
function ensureMode(): void {
  if (modeReady) return;
  modeReady = true;
  try {
    void setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
    });
  } catch {
    /* sem sessão de áudio: os sons simplesmente não tocam */
  }
}

/**
 * Aplica as definições atuais aos leitores já criados.
 *
 * A store notifica a cada `bump()` (ou seja, muitas vezes por jornada) mas o
 * objeto `audio` só troca de identidade quando o utilizador mexe nas definições
 * — daí a saída rápida.
 */
export function setAudioSettings(next: AudioSettings): void {
  if (next === settings) return;
  settings = next;
  for (const [name, player] of Object.entries(players)) {
    try {
      if (player) player.volume = settings.volume * GAIN[name as SoundName];
    } catch { /* leitor já libertado */ }
  }
  // Desligar o som a meio de um jogo tem de calar também a cama de ambiente,
  // que anda em ciclo e não voltaria a passar por `playSound`.
  if (!settings.sound || settings.volume <= 0) stopAmbience();
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

function playerFor(name: SoundName): AudioPlayer | null {
  const existing = players[name];
  if (existing) return existing;
  try {
    ensureMode();
    const player = createAudioPlayer(SOURCES[name]);
    player.volume = settings.volume * GAIN[name];
    players[name] = player;
    return player;
  } catch {
    return null;
  }
}

/** Toca um efeito. Silencioso se o som estiver desligado ou o volume a zero. */
export function playSound(name: SoundName): void {
  if (!settings.sound || settings.volume <= 0) return;
  const player = playerFor(name);
  if (!player) return;
  try {
    player.volume = settings.volume * GAIN[name];
    // Repetir o mesmo som exige rebobinar — senão fica parado no fim.
    if (player.currentTime > 0) void player.seekTo(0);
    player.play();
  } catch {
    /* ignora: som é acessório, nunca pode partir o ecrã */
  }
}

/**
 * Quantas vezes SEGUIDAS cada som toca. Só a celebração precisa disto: a
 * gravação tem 0.71s, que soa a fim-de-lance e não a golo. Duas cópias coladas
 * dão ~1.4s, que é a duração a que o ouvido reconhece uma bancada a festejar.
 */
const REPEATS: Partial<Record<SoundName, number>> = { goal: 2 };

/**
 * Toca um som as vezes que ele pede, encadeadas.
 *
 * O `expo-audio` não tem agendamento com precisão de amostra, por isso a
 * repetição é feita com um temporizador armado para a duração do próprio
 * ficheiro. Não fica colado ao milissegundo como ficaria no browser, mas para
 * um efeito de multidão a diferença não se ouve — e não vale a pena um segundo
 * leitor só para isso.
 */
export function playCue(name: SoundName): void {
  const times = REPEATS[name] ?? 1;
  playSound(name);
  if (times <= 1) return;
  const seconds = players[name]?.duration;
  // Sem duração conhecida (o leitor ainda não carregou) toca só uma vez: mais
  // vale um golo com uma celebração curta do que dois sons sobrepostos.
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return;
  for (let i = 1; i < times; i++) {
    setTimeout(() => playSound(name), Math.round(seconds * 1000 * i));
  }
}

/** Intensidades de vibração usadas pelo jogo. */
export type HapticKind = 'tap' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/** Vibra o telemóvel. No-op na web e quando a vibração está desligada. */
export function haptic(kind: HapticKind = 'light'): void {
  if (!settings.haptics || Platform.OS === 'web') return;
  try {
    switch (kind) {
      case 'tap': void Haptics.selectionAsync(); break;
      case 'light': void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
      case 'medium': void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
      case 'heavy': void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
      case 'success': void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
      case 'warning': void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
      case 'error': void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
    }
  } catch {
    /* dispositivo sem motor de vibração */
  }
}

/**
 * AMBIENTE DE ESTÁDIO em ciclo — liga ao entrar na partida, desliga ao sair.
 *
 * Sem uma cama sonora, os efeitos soltos (apito, golo) ficam pendurados no
 * silêncio e o jogo soa mais vazio do que antes de ter som. É de propósito que
 * fica muito baixo: nota-se a ausência, não a presença.
 */
export function startAmbience(): void {
  if (!settings.sound || settings.volume <= 0) return;
  const player = playerFor('ambience');
  if (!player) return;
  try {
    player.loop = true;
    if (player.currentTime > 0) void player.seekTo(0);
    player.play();
  } catch { /* sem áudio: segue em silêncio */ }
}

export function stopAmbience(): void {
  const player = players.ambience;
  if (!player) return;
  try { player.pause(); } catch { /* já libertado */ }
}

/** Atalho para o par som+vibração dos momentos altos (golo, troféu). */
export function celebrate(name: SoundName, kind: HapticKind = 'success'): void {
  playSound(name);
  haptic(kind);
}

/** Liberta os leitores (chamar ao sair do jogo, não é obrigatório). */
export function releaseSounds(): void {
  for (const key of Object.keys(players) as SoundName[]) {
    try { players[key]?.remove(); } catch { /* já libertado */ }
    delete players[key];
  }
}
