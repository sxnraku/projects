import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { isWonderkid, lineupWarnings, ROTATION_ALERT_FITNESS } from '../../src/core/game';
import { naturalOverall, Player, POSITION_GROUP, PositionGroup } from '../../src/core/models';
import { money } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { PosText, Screen } from '../components';
import { showRewarded } from '../../src/native/ads';

type Filter = 'ALL' | PositionGroup | 'YOUTH';
const FILTER_KEYS: Filter[] = ['ALL', 'GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK', 'YOUTH'];

export default function Squad() {
  const router = useRouter();
  const t = useT();
  // IMPORTANTE: subscrever `state`. Os seletores (`squad`) são referências
  // estáveis — sozinhos nunca disparam re-render, e a tabela ficava congelada
  // (era por isso que o bónus de recuperação parecia não fazer nada).
  const state = useGameStore((s) => s.state);
  const squad = useGameStore((s) => s.squad);
  const runYouthTrial = useGameStore((s) => s.runYouthTrial);
  const rotate = useGameStore((s) => s.rotate);
  const players = squad();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [trialMsg, setTrialMsg] = useState<string | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotMsg, setRotMsg] = useState<string | null>(null);

  const clubColor = state ? state.clubs[state.meta.managedClubId]?.primaryColor : undefined;

  // Titulares em risco — o aviso vive no topo, onde é impossível não ver.
  const tired = useMemo(
    () => (state ? lineupWarnings(state, state.meta.managedClubId, ROTATION_ALERT_FITNESS) : []),
    [state],
  );

  const inLineup = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(
      (state.tactics[state.meta.managedClubId]?.lineup ?? []).map((s) => s.playerId),
    );
  }, [state]);

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
        {FILTER_KEYS.map((key) => (
          <Pressable key={key} onPress={() => setFilter(key)}
            style={[styles.filterBtn, filter === key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{t(`squad.filter.${key}`)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.search}
        placeholder={t('squad.search')}
        placeholderTextColor={theme.colors.textDim}
        value={query}
        onChangeText={setQuery}
      />

      {/* AVISO DE ROTAÇÃO — resolve-se num toque, sem sair do ecrã. */}
      {tired.length > 0 ? (
        <View style={styles.rotBar}>
          <Text style={styles.rotText}>
            {t('squad.rotWarn', { n: tired.length, plural: tired.length > 1 ? t('squad.plural') : '', th: ROTATION_ALERT_FITNESS })}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              const r = rotate();
              setRotMsg(r.swapped > 0 ? r.changes.join(' · ') : t('toast.noBench'));
            }}
          >
            <Text style={styles.rotAction}>{t('squad.autoRotate')}</Text>
          </Pressable>
        </View>
      ) : null}
      {rotMsg ? <Text style={styles.rotMsg}>{rotMsg}</Text> : null}
      {trialMsg ? <Text style={styles.trialMsg}>{trialMsg}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        extraData={state}
        ListHeaderComponent={
          <View style={styles.headRow}>
            <Text style={[styles.h, styles.cPos]}>{t('squad.col.pos')}</Text>
            <View style={{ width: 26 }} />
            <Text style={[styles.h, styles.cName]}>{t('squad.col.name')}</Text>
            <Text style={[styles.h, styles.cNum]}>{t('squad.col.id')}</Text>
            <Text style={[styles.h, styles.cNum]}>OVR</Text>
            <Text style={[styles.h, styles.cNum]}>MOR</Text>
            <Text style={[styles.h, styles.cNum]}>FIT</Text>
            <Text style={[styles.h, styles.cVal]}>{t('squad.col.value')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PlayerRow
            player={item}
            clubColor={clubColor}
            starter={inLineup.has(item.id)}
            expiring={!!state && item.contractUntil === state.meta.season}
            onPress={() => router.push(`/player/${item.id}` as never)}
          />
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
                    setTrialMsg(t('squad.trialJoined', {
                      name: `${y.firstName} ${y.lastName}`, age: y.age, pos: y.positions[0]!, pot: y.potential,
                    }));
                    setTrialUsed(true);
                  }
                }
                setBusy(false);
              }}
            >
              <Text style={styles.trialText}>{t('squad.trial')}</Text>
            </Pressable>
          ) : <View style={{ height: theme.spacing(2) }} />
        }
      />
    </Screen>
  );
}

function PlayerRow({
  player, clubColor, starter, expiring, onPress,
}: { player: Player; clubColor?: string; starter: boolean; expiring: boolean; onPress: () => void }) {
  const ovr = naturalOverall(player);
  const injured = player.condition.status === 'INJURED';
  // Quem não pode jogar não deve exigir leitura: a linha inteira apaga-se.
  const unavailable = injured || player.condition.fitness < 45;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.row,
      pressed && styles.rowPressed,
      unavailable && styles.rowUnavailable,
    ]}>
      <View style={styles.cPos}><PosText position={player.positions[0]!} /></View>
      <Face
        seed={player.id}
        size={26}
        shirt={clubColor}
        ring={injured ? theme.colors.red : starter ? theme.colors.blue : undefined}
      />
      <Text style={[styles.cell, styles.cName]} numberOfLines={1}>
        {player.lastName}
        {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
        {player.transferListed ? <Text style={{ color: theme.colors.blue }}> €</Text> : null}
        {expiring ? <Text style={{ color: theme.colors.yellow }}> ⌛</Text> : null}
        {injured ? <Text style={{ color: theme.colors.red }}> +</Text> : null}
      </Text>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.age}</Text>
      <Text style={[styles.cell, styles.cNum, { color: attrColor(ovr), fontWeight: '700' }]}>{ovr}</Text>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.condition.morale}</Text>
      <Text style={[styles.cell, styles.cNum, { color: fitnessColor(player.condition.fitness), fontWeight: '700' }]}>
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

  rotBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.yellow,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25),
    paddingVertical: theme.spacing(0.9), marginBottom: theme.spacing(0.5),
  },
  rotText: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
  rotAction: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },
  rotMsg: { color: theme.colors.textDim, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },

  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), gap: 4 },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.9), gap: 4 },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  rowUnavailable: { opacity: 0.5 },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  dim: { color: theme.colors.textDim },
  cPos: { width: 28 },
  cName: { flex: 1 },
  cNum: { width: 28, textAlign: 'center' },
  cVal: { width: 58, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  trialMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  trialBtn: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), alignItems: 'center',
    marginVertical: theme.spacing(1.5),
  },
  trialText: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
});
