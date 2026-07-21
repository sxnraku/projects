import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { TopBar } from '../components';
import { theme } from '../../src/ui/theme';
import { useT } from '../../src/ui/i18n';

/**
 * Barra inferior fixa — 1-2 toques para chegar a qualquer funcionalidade.
 * Sem menus escondidos. TopBar partilhada (clube, dinheiro, reputação, data).
 */
export default function TabsLayout() {
  const t = useT();
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
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('▣') }} />
      <Tabs.Screen name="squad" options={{ title: t('tab.squad'), tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="tactics" options={{ title: t('tab.tactics'), tabBarIcon: icon('◫') }} />
      <Tabs.Screen name="market" options={{ title: t('tab.market'), tabBarIcon: icon('⇄') }} />
      <Tabs.Screen name="league" options={{ title: t('tab.league'), tabBarIcon: icon('#') }} />
      <Tabs.Screen name="club" options={{ title: t('tab.club'), tabBarIcon: icon('⌂') }} />
    </Tabs>
  );
}

function icon(glyph: string) {
  return ({ color }: { color: string }) => (
    <Text style={{ color, fontSize: 15, fontWeight: '700' }}>{glyph}</Text>
  );
}
