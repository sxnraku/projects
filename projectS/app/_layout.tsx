import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameState } from '../src/core/models';
import { useGameStore } from '../src/state/gameStore';
import { useMonetizationStore } from '../src/state/monetizationStore';
import { loadPrefs, persist, restore, savePrefs } from './db';
import { initAds } from '../src/native/ads';
import { detectDeviceLang } from '../src/ui/deviceLang';
import { ForcedUpdateGate } from '../src/ui/ForcedUpdateGate';
import { theme } from '../src/ui/theme';
import ErrorBoundary from './ErrorBoundary';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Bootstrap: carrega save + prefs; sem save → mundo novo com onboarding
  // por concluir (managerName === '' fá-lo aparecer no ecrã inicial).
  useEffect(() => {
    (async () => {
      try {
        const [saved, prefs] = await Promise.all([restore(), loadPrefs()]);
        useMonetizationStore.getState().setPremium(prefs.premium);
        if (saved) {
          useGameStore.getState().loadState(saved);
        } else {
          // 1º arranque: começa no idioma do sistema (o jogador pode mudar depois).
          useGameStore.getState().setLang(detectDeviceLang());
          useGameStore.getState().newGame({ managerName: '' });
        }
      } catch {
        useGameStore.getState().newGame({ managerName: '' });
      } finally {
        setReady(true);
      }
    })();
    // Inicializa anúncios + pede consentimento GDPR (não bloqueia o arranque).
    initAds().catch(() => {});
    // A porta de atualização obrigatória corre dentro de <ForcedUpdateGate/>.
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
      if (!timer) timer = setTimeout(flush, 2000); // primeira alteração agenda; as seguintes só atualizam `latest`
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
          <Stack.Screen name="academy" options={{ title: 'Academia' }} />
        </Stack>
        {/* Overlay bloqueante — fica por cima de tudo se houver update obrigatório. */}
        <ForcedUpdateGate />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
