import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameState } from '../src/core/models';
import { useGameStore } from '../src/state/gameStore';
import { useMonetizationStore } from '../src/state/monetizationStore';
import { loadPrefs, persist, restore, savePrefs } from './db';
import { restore as restorePurchases } from '../src/native/purchases';
import { initAds } from '../src/native/ads';
import { detectDeviceLang } from '../src/ui/deviceLang';
import { ForcedUpdateGate } from '../src/ui/ForcedUpdateGate';
import { setAudioSettings } from '../src/ui/sound';
import { theme } from '../src/ui/theme';
import ErrorBoundary from './ErrorBoundary';
import Tutorial from './tutorial';

/**
 * Decide se o tutorial guiado aparece: uma vez por carreira, e só depois de a
 * carreira existir (com clube escolhido). Fica à parte do `RootLayout` para
 * que subscrever o estado do jogo não force o layout inteiro a redesenhar.
 */
function TutorialGate() {
  const state = useGameStore((s) => s.state);
  const markTutorialSeen = useGameStore((s) => s.markTutorialSeen);
  const menuPassed = useGameStore((s) => s.menuPassed);
  if (!state || !menuPassed || state.meta.managerName === '' || state.career.tutorialSeen) return null;
  return <Tutorial onDone={markTutorialSeen} />;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Bootstrap: carrega save + prefs; sem save → mundo novo com onboarding
  // por concluir (managerName === '' fá-lo aparecer no ecrã inicial).
  useEffect(() => {
    (async () => {
      try {
        const [saved, prefs] = await Promise.all([restore(), loadPrefs()]);
        // O que está gravado no dispositivo é só CACHE, para o jogo abrir
        // depressa sem esperar pela loja.
        useMonetizationStore.getState().setPremium(prefs.premium);
        if (saved) {
          useGameStore.getState().loadState(saved);
        } else {
          // 1º arranque: começa no idioma do sistema (o jogador pode mudar depois).
          useGameStore.getState().setLang(detectDeviceLang());
          useGameStore.getState().newGame({ managerName: '', useBase: true });
        }
      } catch {
        useGameStore.getState().newGame({ managerName: '', useBase: true });
      } finally {
        setReady(true);
      }
    })();
    // Inicializa anúncios + pede consentimento GDPR (não bloqueia o arranque).
    initAds().catch(() => {});
    // A porta de atualização obrigatória corre dentro de <ForcedUpdateGate/>.
  }, []);

  // PREMIUM: pergunta à LOJA se já foi comprado, sempre, em cada arranque.
  //
  // É isto que faz quem pagou e reinstalou recuperar o Premium sem pagar outra
  // vez — a queixa nº1 deste tipo de produto e motivo de reembolso automático.
  // Corre em segundo plano: se a Play Store demorar ou não responder, o jogo já
  // abriu há muito e fica apenas com o que estava em cache.
  useEffect(() => {
    let alive = true;
    restorePurchases()
      .then((owned) => {
        if (!alive || !owned) return;
        useMonetizationStore.getState().setPremium(true);
      })
      .catch(() => { /* a loja é opcional; o jogo nunca depende dela */ });
    return () => { alive = false; };
  }, []);

  // Auto-save com THROTTLE: gravar o estado inteiro (900+ jogadores) a cada
  // alteração era pesado e deixava o jogo lento. Agora grava no máximo a cada 2s
  // (o último estado) e imediatamente ao ir para segundo plano — nada se perde.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: GameState | null = null;
    const flush = () => {
      timer = null;
      if (latest) { persist(latest).catch(() => {}); latest = null; }
    };
    const unsubGame = useGameStore.subscribe((s) => {
      if (!s.state) return;
      latest = s.state;
      // 4s, não 2s: gravar custa serializar ~2,4 MB e escrever tudo, e a cada
      // toque na interface a store faz `bump()`. A 2s isso dava uma pausa a
      // cada dois segundos enquanto se navega. Nada se perde por esperar mais:
      // o flush ao minimizar continua imediato.
      if (!timer) timer = setTimeout(flush, 4000);
    });
    const unsubMon = useMonetizationStore.subscribe((s) => {
      savePrefs({ premium: s.m.premium }).catch(() => {});
    });
    // Grava já ao minimizar/fechar a app (não esperar pelo timer).
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { if (timer) clearTimeout(timer); flush(); }
    });
    return () => { if (timer) clearTimeout(timer); flush(); unsubGame(); unsubMon(); sub.remove(); };
  }, []);

  // Som/vibração: a store é pura (é importada pelos smoke tests em Node), por
  // isso é aqui — na fronteira nativa — que as preferências chegam ao leitor de
  // áudio. Aplica o valor atual e depois cada alteração.
  useEffect(() => {
    setAudioSettings(useGameStore.getState().audio);
    return useGameStore.subscribe((s) => setAudioSettings(s.audio));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.green} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { fontWeight: '700', fontSize: theme.font.h3 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.bg },
            animation: 'fade', // transições rápidas e discretas
          }}
        >
          <Stack.Screen name="start" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="match" options={{ title: 'Jornada' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Jogador' }} />
          <Stack.Screen name="club/[id]" options={{ title: 'Equipa' }} />
          <Stack.Screen name="academy" options={{ title: 'Academia' }} />
          <Stack.Screen name="training" options={{ title: 'Treino' }} />
          <Stack.Screen name="world" options={{ title: 'Mundo' }} />
          <Stack.Screen name="europe" options={{ title: 'Europa' }} />
          <Stack.Screen name="history" options={{ title: 'Histórico' }} />
          <Stack.Screen name="manual" options={{ title: 'Manual' }} />
        </Stack>
        {/* TUTORIAL GUIADO — vive na RAIZ, não dentro do separador Início.
            Ele navega entre abas para mostrar cada coisa no sítio; montado
            dentro de uma aba, mudar de aba podia congelar ou desmontar o ecrã
            que o segura e o tutorial desaparecia a meio. Aqui fica por cima de
            toda a navegação, como o gate de update. */}
        <TutorialGate />
        {/* Overlay bloqueante — fica por cima de tudo se houver update obrigatório. */}
        <ForcedUpdateGate />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
