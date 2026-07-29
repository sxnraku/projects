import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { isWonderkid, lineupWarnings, ROTATION_ALERT_FITNESS } from '../../src/core/game';
import { naturalOverall, naturalOverallFine, Player, POSITION_GROUP, PositionGroup, shortName } from '../../src/core/models';
import { money, to100 } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Toast } from '../../src/ui/Toast';
import { PosText, Screen } from '../components';

type Filter = 'ALL' | PositionGroup | 'YOUTH';
type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'morale' | 'fitness' | 'value';
const FILTER_KEYS: Filter[] = ['ALL', 'GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK', 'YOUTH'];

export default function Squad() {
  const router = useRouter();
  const t = useT();
  // IMPORTANTE: subscrever `state`. Os seletores (`squad`) são referências
  // estáveis — sozinhos nunca disparam re-render, e a tabela ficava congelada
  // (era por isso que o bónus de recuperação parecia não fazer nada).
  const state = useGameStore((s) => s.state);
  const squad = useGameStore((s) => s.squad);
  const rotate = useGameStore((s) => s.rotate);
  const players = squad();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'info'; text: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('pos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' || k === 'pos' ? 'asc' : 'desc'); }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

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
    // Ordenação por coluna (toque no cabeçalho). 'pos' = setor GR→ATA + overall.
    const order: PositionGroup[] = ['GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'];
    const posMetric = (p: Player) => order.indexOf(POSITION_GROUP[p.positions[0]!]) * 100 - naturalOverall(p);
    const metric = (p: Player): number | string => {
      switch (sortKey) {
        case 'name': return p.lastName.toLowerCase();
        case 'ovr': return naturalOverall(p);
        case 'morale': return p.condition.morale;
        case 'fitness': return p.condition.fitness;
        case 'value': return p.marketValue;
        case 'age': return p.age;
        default: return posMetric(p);
      }
    };
    const sorted = [...list].sort((a, b) => {
      const ma = metric(a), mb = metric(b);
      const d = typeof ma === 'string' ? ma.localeCompare(mb as string) : (ma as number) - (mb as number);
      return sortDir === 'asc' ? d : -d;
    });
    return sorted;
  }, [players, filter, query, sortKey, sortDir]);

  return (
    <Screen>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind ?? 'ok'} onHide={() => setFeedback(null)} />
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
              setFeedback(r.swapped > 0
                ? { kind: 'ok', text: r.changes.join(' · ') }
                : { kind: 'info', text: t('toast.noBench') });
            }}
          >
            <Text style={styles.rotAction}>{t('squad.autoRotate')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Cabeçalho FIXO e ordenável (toca numa coluna para ordenar). */}
      <View style={styles.headRow}>
        <Pressable style={styles.cPos} onPress={() => toggleSort('pos')}>
          <Text style={[styles.h, sortKey === 'pos' && styles.hOn]}>{t('squad.col.pos')}{arrow('pos')}</Text>
        </Pressable>
        <View style={{ width: 34 }} />
        <Pressable style={styles.cName} onPress={() => toggleSort('name')}>
          <Text style={[styles.h, sortKey === 'name' && styles.hOn]}>{t('squad.col.name')}{arrow('name')}</Text>
        </Pressable>
        <Pressable style={styles.cNum} onPress={() => toggleSort('age')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'age' && styles.hOn]}>{t('squad.col.id')}{arrow('age')}</Text>
        </Pressable>
        <Pressable style={styles.cNum} onPress={() => toggleSort('ovr')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'ovr' && styles.hOn]}>OVR{arrow('ovr')}</Text>
        </Pressable>
        <Pressable style={styles.cNum} onPress={() => toggleSort('morale')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'morale' && styles.hOn]}>MOR{arrow('morale')}</Text>
        </Pressable>
        <Pressable style={styles.cNum} onPress={() => toggleSort('fitness')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'fitness' && styles.hOn]}>FIT{arrow('fitness')}</Text>
        </Pressable>
        <Pressable style={styles.cVal} onPress={() => toggleSort('value')}>
          <Text style={[styles.h, styles.hRight, sortKey === 'value' && styles.hOn]}>{t('squad.col.value')}{arrow('value')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        extraData={state}
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
          <Pressable style={styles.trialBtn} onPress={() => router.push('/academy' as never)}>
            <Text style={styles.trialText}>{t('squad.academy')}</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

function PlayerRow({
  player, clubColor, starter, expiring, onPress,
}: { player: Player; clubColor?: string; starter: boolean; expiring: boolean; onPress: () => void }) {
  const t = useT();
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
        size={34}
        shirt={clubColor}
        ring={injured ? theme.colors.red : starter ? theme.colors.blue : undefined}
      />
      <Text style={[styles.name, styles.cName]} numberOfLines={1}>
        {shortName(player)}
        {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
        {player.transferListed ? <Text style={{ color: theme.colors.blue }}> €</Text> : null}
        {expiring ? <Text style={{ color: theme.colors.yellow }}> ⌛</Text> : null}
        {injured ? <Text style={{ color: theme.colors.red }}> 🚑</Text> : null}
        {player.condition.suspended ? <Text> 🟥</Text> : null}
        {player.condition.loanOwnerId ? <Text style={{ color: theme.colors.blue }}> {t('loan.badge')}</Text> : null}
      </Text>
      <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.age}</Text>
      <Text style={[styles.ovr, styles.cNum, { color: attrColor(ovr) }]}>{to100(naturalOverallFine(player))}</Text>
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

  headRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), gap: 4,
    backgroundColor: theme.colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  hOn: { color: theme.colors.blue },
  hCenter: { textAlign: 'center' },
  hRight: { textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1.2), gap: 5 },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  rowUnavailable: { opacity: 0.5 },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  name: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  ovr: { fontSize: 16, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  dim: { color: theme.colors.textDim },
  cPos: { width: 28 },
  cName: { flex: 1 },
  cNum: { width: 34, textAlign: 'center' },
  cVal: { width: 64, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  trialMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  trialBtn: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), alignItems: 'center',
    marginVertical: theme.spacing(1.5),
  },
  trialText: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
});
