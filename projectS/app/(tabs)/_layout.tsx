import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '../components';
import { theme } from '../../src/ui/theme';
import { NavIcon, NavIconName } from '../../src/ui/NavIcon';
import { useT } from '../../src/ui/i18n';
import { useGameStore } from '../../src/state/gameStore';

/**
 * Barra inferior fixa — 1-2 toques para chegar a qualquer funcionalidade.
 * Sem menus escondidos. TopBar partilhada (clube, dinheiro, reputação, data).
 * Leva em conta a barra/botões de navegação do sistema Android/iOS via bottom inset.
 */
export default function TabsLayout() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const menuPassed = useGameStore((s) => s.menuPassed);
  const insets = useSafeAreaInsets();

  // As abas só existem depois de passar pelo menu inicial E com carreira criada.
  const careerActive = !!state && state.meta.managerName !== '';
  if (!menuPassed || !careerActive) return <Redirect href={'/start' as never} />;

  const bottomInset = Math.max(insets.bottom, 6);

  return (
    <Tabs
      screenOptions={{
        header: () => <TopBar />,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 50 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 4,
        },
        tabBarActiveTintColor: theme.colors.blue, // azul = navegação/seleção
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="squad" options={{ title: t('tab.squad'), tabBarIcon: icon('squad') }} />
      <Tabs.Screen name="tactics" options={{ title: t('tab.tactics'), tabBarIcon: icon('tactics') }} />
      <Tabs.Screen name="market" options={{ title: t('tab.market'), tabBarIcon: icon('market') }} />
      <Tabs.Screen name="league" options={{ title: t('tab.league'), tabBarIcon: icon('league') }} />
      <Tabs.Screen name="club" options={{ title: t('tab.club'), tabBarIcon: icon('club') }} />
    </Tabs>
  );
}

function icon(name: NavIconName) {
  return ({ color }: { color: string }) => <NavIcon name={name} color={color} size={22} />;
}
