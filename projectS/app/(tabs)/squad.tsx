import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { MaybeSpot, Spot } from '../../src/ui/tutorial/Spot';
import { TutorialTargets } from '../../src/ui/tutorial/registry';
import { isWonderkid, lineupWarnings, ROTATION_ALERT_FITNESS } from '../../src/core/game';
import { individualFocus } from '../../src/core/training';
import { isAtRisk } from '../../src/core/game';
import { fullName, naturalOverall, naturalOverallFine, Player, POSITION_GROUP, PositionGroup } from '../../src/core/models';
import { money, to100, wage } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Toast } from '../../src/ui/Toast';
import { PosText, Screen } from '../components';

type Filter = 'ALL' | PositionGroup | 'YOUTH';
type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'morale' | 'fitness' | 'value' | 'wage';
const FILTER_KEYS: Filter[] = ['ALL', 'GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK', 'YOUTH'];

// Largura visível de uma linha (ecrã menos o padding do Screen) e do painel de
// salário que se revela ao arrastar a linha para a esquerda.
const ROW_W = Dimensions.get('window').width - 2 * 12;
const WAGE_PANEL_W = 128;

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
  const SORTS: { k: SortKey; label: string }[] = [
    { k: 'pos', label: t('squad.col.pos') },
    { k: 'ovr', label: 'OVR' },
    { k: 'age', label: t('squad.col.id') },
    { k: 'fitness', label: t('squad.sort.fit') },
    { k: 'morale', label: t('squad.sort.mor') },
    { k: 'value', label: t('squad.col.value') },
    { k: 'wage', label: t('squad.col.wage') },
    { k: 'name', label: t('squad.col.name') },
  ];

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
        case 'wage': return p.wage;
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
      <Spot id={TutorialTargets.squadFilters} style={styles.filters}>
        {FILTER_KEYS.map((key) => (
          <Pressable key={key} onPress={() => setFilter(key)}
            style={[styles.filterBtn, filter === key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{t(`squad.filter.${key}`)}</Text>
          </Pressable>
        ))}
      </Spot>
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

      {/* Barra de ordenação (chips). Toca para ordenar; toca de novo p/ inverter. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.sortScroll} contentContainerStyle={styles.sortBar}>
        {SORTS.map(({ k, label }) => (
          <Pressable key={k} onPress={() => toggleSort(k)}
            style={[styles.sortChip, sortKey === k && styles.sortChipOn]}>
            <Text style={[styles.sortChipText, sortKey === k && styles.sortChipTextOn]}>
              {label}{arrow(k)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        extraData={state}
        renderItem={({ item, index }) => (
          <MaybeSpot on={index === 0} id={TutorialTargets.squadRow}>
          <PlayerRow
            player={item}
            clubColor={clubColor}
            starter={inLineup.has(item.id)}
            expiring={!!state && item.contractUntil === state.meta.season}
            onPress={() => router.push(`/player/${item.id}` as never)}
          />
          </MaybeSpot>
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
  // Plano de treino individual — só se via na ficha do jogador; agora lê-se na lista.
  const focus = individualFocus(player);
  const retrain = player.condition.retraining;
  const yellows = player.condition.seasonYellows ?? 0;
  const atRisk = isAtRisk(yellows);
  // Quem não pode jogar não deve exigir leitura: a linha inteira apaga-se.
  const unavailable = injured || player.condition.fitness < 45;

  const starterRing = injured ? theme.colors.red : starter ? theme.colors.blue : undefined;
  return (
    // Arrastar a linha para a ESQUERDA revela o painel do salário à direita.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToOffsets={[0, WAGE_PANEL_W]}
      snapToEnd={false}
      decelerationRate="fast"
      style={styles.swipe}
      contentContainerStyle={{ width: ROW_W + WAGE_PANEL_W }}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [
        styles.row,
        { width: ROW_W },
        starter && styles.rowStarter,
        pressed && styles.rowPressed,
        unavailable && styles.rowUnavailable,
      ]}>
        <Face seed={player.id} size={40} shirt={clubColor} ring={starterRing} />

        {/* Nome (linha inteira) + linha de detalhe por baixo */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {fullName(player)}
            {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
            {player.transferListed ? <Text style={{ color: theme.colors.blue }}> €</Text> : null}
            {expiring ? <Text style={{ color: theme.colors.yellow }}> ⌛</Text> : null}
            {injured ? <Text style={{ color: theme.colors.red }}> 🚑</Text> : null}
            {player.condition.suspended ? <Text> 🟥</Text> : null}
            {/* A UM AMARELO DO CASTIGO. É o aviso que faltava: sem ele, um
                titular desaparecia do onze na jornada seguinte sem que nada,
                em lado nenhum, tivesse dado sinal. */}
            {!player.condition.suspended && atRisk ? <Text style={{ color: theme.colors.yellow }}> 🟨</Text> : null}
            {player.condition.loanOwnerId ? <Text style={{ color: theme.colors.blue }}> {t('loan.badge')}</Text> : null}
            {focus ? <Text style={{ color: theme.colors.green }}> 🎯</Text> : null}
            {retrain ? <Text style={{ color: theme.colors.blue }}> ⇄</Text> : null}
          </Text>
          <View style={styles.subLine}>
            <PosText position={player.positions[0]!} />
            <Text style={styles.subDim}>· {player.age}</Text>
            <Text style={styles.subDim}>· {t('squad.sort.mor')} {player.condition.morale}</Text>
            <Text style={[styles.subStat, { color: fitnessColor(player.condition.fitness) }]}>
              · {t('squad.sort.fit')} {player.condition.fitness}
            </Text>
            {yellows > 0 ? (
              <Text style={[styles.subStat, { color: atRisk ? theme.colors.yellow : theme.colors.textDim }]}>
                · 🟨 {yellows}
              </Text>
            ) : null}
          </View>
          {/* Segunda linha só para quem tem trabalho à parte — o plantel normal
              não ganha ruído por causa de dois ou três jogadores. */}
          {focus || retrain ? (
            <View style={styles.workLine}>
              {focus ? (
                <Text style={[styles.workChip, styles.workFocus]} numberOfLines={1}>
                  🎯 {t(`focus.${focus}`)}
                </Text>
              ) : null}
              {retrain ? (
                <Text style={[styles.workChip, styles.workRetrain]} numberOfLines={1}>
                  ⇄ {t('retrain.busy', { pos: retrain.position, weeks: retrain.weeksLeft })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* OVR grande + valor de mercado à direita + pega de arrasto */}
        <View style={styles.rightCol}>
          <Text style={[styles.ovr, { color: attrColor(ovr) }]}>{to100(naturalOverallFine(player))}</Text>
          <Text style={styles.valSmall}>{money(player.marketValue)}</Text>
        </View>
        <Text style={styles.grip}>‹</Text>
      </Pressable>

      {/* Painel de salário revelado ao arrastar */}
      <Pressable onPress={onPress} style={[styles.wagePanel, { width: WAGE_PANEL_W }]}>
        <Text style={styles.wageLbl}>{t('squad.col.wage')}</Text>
        <Text style={styles.wageVal}>{wage(player.wage)}</Text>
        <Text style={styles.wagePer}>{t('squad.perWeek')}</Text>
      </Pressable>
    </ScrollView>
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

  // Barra de ordenação (chips)
  sortScroll: { flexGrow: 0, flexShrink: 0, marginTop: theme.spacing(0.5), marginBottom: theme.spacing(0.25) },
  sortBar: { gap: 6, paddingVertical: theme.spacing(0.5), alignItems: 'center' },
  sortChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  sortChipOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  sortChipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  sortChipTextOn: { color: theme.colors.blue },

  // Linha de jogador (duas linhas: nome inteiro + detalhe)
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25),
    paddingVertical: theme.spacing(1.1), paddingHorizontal: theme.spacing(0.5),
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  rowStarter: { borderLeftColor: theme.colors.blue, backgroundColor: theme.colors.surface },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  rowUnavailable: { opacity: 0.5 },
  info: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'nowrap' },
  subDim: { color: theme.colors.textDim, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  subStat: { fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // Trabalho à parte (plano individual / reconversão)
  workLine: { flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  workChip: {
    fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 100, borderWidth: 1, overflow: 'hidden',
  },
  workFocus: { color: theme.colors.green, borderColor: theme.colors.green },
  workRetrain: { color: theme.colors.blue, borderColor: theme.colors.blue },

  rightCol: { alignItems: 'flex-end', minWidth: 60 },
  ovr: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  valSmall: { color: theme.colors.textDim, fontSize: theme.font.small, fontVariant: ['tabular-nums'], marginTop: 1 },
  grip: { color: theme.colors.border, fontSize: 20, fontWeight: '900', marginLeft: 2, marginRight: -4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  // Arrastar linha → painel de salário
  swipe: { flexGrow: 0 },
  wagePanel: {
    backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 3, borderLeftColor: theme.colors.green,
  },
  wageLbl: { color: theme.colors.textDim, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  wageVal: { color: theme.colors.green, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  wagePer: { color: theme.colors.textDim, fontSize: 10, marginTop: 1 },

  trialMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  trialBtn: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), alignItems: 'center',
    marginVertical: theme.spacing(1.5),
  },
  trialText: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
});
