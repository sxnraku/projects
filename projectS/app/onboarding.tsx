/**
 * Onboarding da primeira execução: nome do treinador + escolha do clube.
 * Renderizado pelo dashboard enquanto meta.managerName === ''.
 * Não é uma rota — é um componente de ecrã inteiro (evita truques de navegação).
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { money } from '../src/ui/format';
import { reputationStars, theme } from '../src/ui/theme';
import { Button, Crest, Screen, Stars } from './components';

export default function Onboarding() {
  const state = useGameStore((s) => s.state);
  const completeOnboarding = useGameStore((s) => s.completeOnboarding);

  const [name, setName] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);

  // Clubes da ÚLTIMA divisão — a carreira começa em baixo.
  const clubs = useMemo(() => {
    if (!state) return [];
    const bottomTier = Math.max(...Object.values(state.leagues).map((l) => l.tier));
    const league = Object.values(state.leagues).find((l) => l.tier === bottomTier);
    if (!league) return [];
    return league.clubIds
      .map((id) => state.clubs[id]!)
      .filter(Boolean)
      .sort((a, b) => b.reputation - a.reputation);
  }, [state]);

  if (!state) return null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Bem-vindo, mister.</Text>
        <Text style={styles.subtitle}>
          Começas na {Object.values(state.leagues).length > 1 ? `Liga ${Math.max(...Object.values(state.leagues).map((l) => l.tier))}` : 'liga'}.
          O objetivo é simples: subir até ao topo.
        </Text>
      </View>

      <Text style={styles.label}>O TEU NOME</Text>
      <TextInput
        style={styles.input}
        placeholder="Nome do treinador"
        placeholderTextColor={theme.colors.textDim}
        value={name}
        onChangeText={setName}
        maxLength={24}
      />

      <Text style={styles.label}>ESCOLHE O TEU CLUBE</Text>
      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => {
          const fin = state.finances[item.id];
          const selected = clubId === item.id;
          return (
            <Pressable
              onPress={() => setClubId(item.id)}
              style={[styles.clubRow, selected && styles.clubRowSelected]}
            >
              <Crest club={item} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.clubName, selected && { color: theme.colors.blue }]}>{item.name}</Text>
                <Stars value={reputationStars(item.reputation)} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.clubBudget}>{money(fin?.transferBudget ?? 0)}</Text>
                <Text style={styles.clubBudgetLabel}>transferências</Text>
              </View>
              <Text style={[styles.radio, selected && { color: theme.colors.blue }]}>
                {selected ? '●' : '○'}
              </Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <View style={{ paddingVertical: theme.spacing(1.5) }}>
        <Button
          label="COMEÇAR CARREIRA ▶"
          disabled={!clubId}
          onPress={() => clubId && completeOnboarding(name, clubId)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing(4), paddingBottom: theme.spacing(2) },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: theme.colors.textDim, fontSize: theme.font.body, marginTop: theme.spacing(1), lineHeight: 19 },
  label: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700',
    letterSpacing: 1.2, marginTop: theme.spacing(2), marginBottom: theme.spacing(0.75),
  },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, color: theme.colors.text, fontSize: theme.font.h3,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1.25),
  },
  clubRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25), paddingHorizontal: theme.spacing(1),
    borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'transparent',
  },
  clubRowSelected: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.blue },
  clubName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  clubBudget: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700' },
  clubBudgetLabel: { color: theme.colors.textDim, fontSize: 9 },
  radio: { color: theme.colors.textDim, fontSize: 16, width: 20, textAlign: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
});
