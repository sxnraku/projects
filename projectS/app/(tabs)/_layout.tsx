import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { TopBar } from '../components';
import { theme } from '../../src/ui/theme';

/**
 * Barra inferior fixa — 1-2 toques para chegar a qualquer funcionalidade.
 * Sem menus escondidos. TopBar partilhada (clube, dinheiro, reputação, data).
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <TopBar />,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 54,
          paddingBottom: 4,
          paddingTop: 4,
        },
        tabBarActiveTintColor: theme.colors.blue, // azul = navegação/seleção
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('▣') }} />
      <Tabs.Screen name="squad" options={{ title: 'Plantel', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="tactics" options={{ title: 'Tática', tabBarIcon: icon('◫') }} />
      <Tabs.Screen name="market" options={{ title: 'Mercado', tabBarIcon: icon('⇄') }} />
      <Tabs.Screen name="league" options={{ title: 'Liga', tabBarIcon: icon('#') }} />
      <Tabs.Screen name="club" options={{ title: 'Clube', tabBarIcon: icon('⌂') }} />
    </Tabs>
  );
}

function icon(glyph: string) {
  return ({ color }: { color: string }) => (
    <Text style={{ color, fontSize: 15, fontWeight: '700' }}>{glyph}</Text>
  );
}
