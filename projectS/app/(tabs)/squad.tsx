import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { isWonderkid } from '../../src/core/game';
import { naturalOverall, Player, POSITION_GROUP, PositionGroup } from '../../src/core/models';
import { money } from '../../src/ui/format';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { PosText, Screen } from '../components';
import { showRewarded } from '../../src/native/ads';

type Filter = 'ALL' | PositionGroup | 'YOUTH';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'GOALKEEPER', label: 'GR' },
  { key: 'DEFENCE', label: 'DEF' },
  { key: 'MIDFIELD', label: 'MED' },
  { key: 'ATTACK', label: 'ATA' },
  { key: 'YOUTH', label: 'Sub-19' },
];

export default function Squad() {
  const router = useRouter();
  const squad = useGameStore((s) => s.squad);
  const runYouthTrial = useGameStore((s) => s.runYouthTrial);
  const players = squad();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [trialMsg, setTrialMsg] = useState<string | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    let list = players;
    if (filter === 'YOUTH') list = list.filter((p) => p.age <= 19);
    else if (filter !== 'ALL') list = list.filter((p) => POSITION_GROUP[p.positions[0]!] === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
    }
    // Ordena por setor (GR→ATA) e overall dentro do setor.
    const order: PositionGroup[] = ['GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'];
    return [...list].sort((a, b) => {
      const ga = order.indexOf(POSITION_GROUP[a.positions[0]!]);
      const gb = order.indexOf(POSITION_GROUP[b.positions[0]!]);
      if (ga !== gb) return ga - gb;
      return naturalOverall(b) - naturalOverall(a);
    });
  }, [players, filter, query]);

  return (
    <Screen>
      {/* Filtros + pesquisa */}
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)}
            style={[styles.filterBtn, filter === f.key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.search}
        placeholder="Pesquisar jogador…"
        placeholderTextColor={theme.colors.textDim}
        value={query}
        onChangeText={setQuery}
      />

      {trialMsg ? <Text style={styles.trialMsg}>{trialMsg}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={styles.headRow}>
            <Text style={[styles.h, styles.cPos]}>Pos</Text>
            <Text style={[styles.h, styles.cName]}>Nome</Text>
            <Text style={[styles.h, styles.cNum]}>Id</Text>
            <Text style={[styles.h, styles.cNum]}>OVR</Text>
            <Text style={[styles.h, styles.cNum]}>MOR</Text>
            <Text style={[styles.h, styles.cNum]}>FIT</Text>
            <Text style={[styles.h, styles.cVal]}>Valor</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PlayerRow player={item} onPress={() => router.push(`/player/${item.id}` as never)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListFooterComponent={
          !trialUsed ? (
            <Pressable
              disabled={busy}
              style={[styles.trialBtn, busy && { opacity: 0.5 }]}
              onPress={async () => {
                setBusy(true);
                if (await showRewarded()) {
                  const y = runYouthTrial();
                  if (y) {
                    setTrialMsg(`${y.firstName} ${y.lastName} (${y.age}, ${y.positions[0]}, pot. ${y.potential}) juntou-se à academia.`);
                    setTrialUsed(true);
                  }
                }
                setBusy(false);
              }}
            >
              <Text style={styles.trialText}>▶ Anúncio: trazer jovem à experiência</Text>
            </Pressable>
          ) : <View style={{ height: theme.spacing(2) }} />
        }
      />
    </Screen>
  );
}

function PlayerRow({ player, onPress }: { player: Player; onPress: () => void }) {
  const ovr = naturalOverall(player);
  const injured = player.condition.status === 'INJURED';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.cPos}><PosText position={player.positions[0]!} /></View>
      <Text style={[styles.cell, styles.cName]} numberOfLines={1}>
        {player.lastName}
        {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
        {player.transferListed ? <Text style={{ color: theme.colors.blue }}> €</Text> : null}
        {injured ? <Text style={{ color: theme.colors.red }}> +</Text> : null}
      </Text>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.age}</Text>
      <Text style={[styles.cell, styles.cNum, { color: attrColor(ovr), fontWeight: '700' }]}>{ovr}</Text>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.condition.morale}</Text>
      <Text style={[styles.cell, styles.cNum, { color: fitnessColor(player.condition.fitness) }]}>
        {player.condition.fitness}
      </Text>
      <Text style={[styles.cell, styles.cVal]}>{money(player.marketValue)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: theme.spacing(0.5), marginTop: theme.spacing(1.5) },
  filterBtn: {
    flex: 1, paddingVertical: theme.spacing(0.75), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  filterActive: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  filterText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  filterTextActive: { color: theme.colors.blue },
  search: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, color: theme.colors.text, fontSize: theme.font.body,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    marginTop: theme.spacing(1), marginBottom: theme.spacing(0.5),
  },

  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), gap: 4 },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1.1), gap: 4 },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  dim: { color: theme.colors.textDim },
  cPos: { width: 30 },
  cName: { flex: 1 },
  cNum: { width: 30, textAlign: 'center' },
  cVal: { width: 62, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  trialMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  trialBtn: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), alignItems: 'center',
    marginVertical: theme.spacing(1.5),
  },
  trialText: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
});
