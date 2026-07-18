import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGameStore } from '../src/state/gameStore';
import { useMonetizationStore } from '../src/state/monetizationStore';
import { loadPrefs, persist, restore, savePrefs } from './db';
import { initAds } from '../src/native/ads';
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
  }, []);

  // Auto-save: sempre que o estado muda, persiste. Premium também.
  useEffect(() => {
    const unsubGame = useGameStore.subscribe((s) => {
      if (s.state) persist(s.state).catch(() => {});
    });
    const unsubMon = useMonetizationStore.subscribe((s) => {
      savePrefs({ premium: s.m.premium }).catch(() => {});
    });
    return () => { unsubGame(); unsubMon(); };
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="match" options={{ title: 'Jornada' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Jogador' }} />
        </Stack>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
