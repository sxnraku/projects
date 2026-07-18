import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import { Club, cupRoundName, goalDifference, StandingRow } from '../../src/core/models';
import { theme, zoneColor } from '../../src/ui/theme';
import { Body, Screen, Section } from '../components';

export default function League() {
  const standings = useGameStore((s) => s.standings);
  const managedLeague = useGameStore((s) => s.managedLeague);
  const state = useGameStore((s) => s.state);
  const managedId = state?.meta.managedClubId;

  const leagues = Object.values(state?.leagues ?? {}).sort((a, b) => a.tier - b.tier);
  const [selected, setSelected] = useState<string | null>(null);
  const activeLeague = selected ?? managedLeague();
  const isCup = activeLeague === 'taca';
  const rows = isCup ? [] : standings(activeLeague);

  if (isCup && state) {
    return (
      <Screen>
        <Tabs leagues={leagues} active={activeLeague} onSelect={setSelected} />
        <CupView state={state} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Tabs leagues={leagues} active={activeLeague} onSelect={setSelected} />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.clubId}
        renderItem={({ item, index }) => (
          <TableRow row={item} pos={index + 1} total={rows.length}
            club={state?.clubs[item.clubId]} highlight={item.clubId === managedId} />
        )}
        ListHeaderComponent={
          <View style={[styles.row, styles.head]}>
            <View style={styles.zone} />
            <Text style={[styles.h, styles.pos]}>#</Text>
            <Text style={[styles.h, { flex: 1, textAlign: 'left' }]}>Clube</Text>
            <Text style={[styles.h, styles.num]}>J</Text>
            <Text style={[styles.h, styles.num]}>V</Text>
            <Text style={[styles.h, styles.num]}>E</Text>
            <Text style={[styles.h, styles.num]}>D</Text>
            <Text style={[styles.h, styles.num]}>DG</Text>
            <Text style={[styles.h, styles.pts]}>Pts</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.legend}>
            <LegendDot color={theme.colors.green} label="Título / Subida" />
            <LegendDot color={theme.colors.red} label="Despromoção" />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </Screen>
  );
}

/** Tabs de divisões + Taça. */
function Tabs({
  leagues, active, onSelect,
}: {
  leagues: { id: string; name: string; tier: number }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.tabs}>
      {leagues.map((l) => (
        <Pressable key={l.id} onPress={() => onSelect(l.id)}
          style={[styles.tab, active === l.id && styles.tabActive]}>
          <Text style={[styles.tabText, active === l.id && styles.tabTextActive]}>
            {`Liga ${l.tier}`}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onSelect('taca')}
        style={[styles.tab, active === 'taca' && styles.tabActive]}>
        <Text style={[styles.tabText, active === 'taca' && styles.tabTextActive]}>Taça</Text>
      </Pressable>
    </View>
  );
}

/** Vista da Taça: estado atual + resultados por eliminatória (mais recente primeiro). */
function CupView({ state }: { state: NonNullable<ReturnType<typeof useGameStore.getState>['state']> }) {
  const cup = state.cup;
  const managedId = state.meta.managedClubId;
  const name = (id: string) => state.clubs[id]?.name ?? id;
  const stillIn = cup.alive.includes(managedId) && !cup.winnerClubId;

  const rounds = [...new Set(cup.fixtures.map((f) => f.round))].sort((a, b) => b - a);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title="Estado" />
      {cup.winnerClubId ? (
        <Body style={{ color: theme.colors.yellow, fontWeight: '700' }}>
          🏆 Vencedor: {name(cup.winnerClubId)}
        </Body>
      ) : (
        <Body dim>
          {cup.alive.length} clubes em prova · próxima: {cupRoundName(cup, cup.currentRound)}
          {stillIn ? ' · ainda estás na Taça' : cup.fixtures.length > 0 ? ' · já foste eliminado' : ''}
        </Body>
      )}

      {rounds.map((round) => (
        <View key={round}>
          <Section title={cupRoundName(cup, round)} />
          {cup.fixtures.filter((f) => f.round === round).map((f) => {
            const r = f.result!;
            const mine = f.homeClubId === managedId || f.awayClubId === managedId;
            return (
              <View key={f.id} style={[styles.cupRow, mine && styles.highlight]}>
                <Text style={[styles.cupTeam, { textAlign: 'right' }, mine && styles.bold]} numberOfLines={1}>
                  {name(f.homeClubId)}
                </Text>
                <Text style={styles.cupScore}>{r.home.goals}-{r.away.goals}</Text>
                <Text style={[styles.cupTeam, mine && styles.bold]} numberOfLines={1}>
                  {name(f.awayClubId)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      {cup.fixtures.length === 0 ? <Body dim>O sorteio está feito — a 1ª eliminatória joga-se em breve.</Body> : null}
      <View style={{ height: theme.spacing(3) }} />
    </ScrollView>
  );
}

function TableRow({
  row, pos, total, club, highlight,
}: { row: StandingRow; pos: number; total: number; club?: Club; highlight: boolean }) {
  const gd = goalDifference(row);
  const zone = zoneColor(pos, total);
  return (
    <View style={[styles.row, highlight && styles.highlight]}>
      <View style={[styles.zone, zone ? { backgroundColor: zone } : null]} />
      <Text style={[styles.cell, styles.pos, styles.dim]}>{pos}</Text>
      <Text style={[styles.cell, { flex: 1, textAlign: 'left' }, highlight && styles.bold]} numberOfLines={1}>
        {club?.name ?? row.clubId}
      </Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.played}</Text>
      <Text style={[styles.cell, styles.num]}>{row.won}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.drawn}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.lost}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{gd > 0 ? `+${gd}` : gd}</Text>
      <Text style={[styles.cell, styles.pts, styles.bold]}>{row.points}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: theme.spacing(0.5), marginTop: theme.spacing(1.5), marginBottom: theme.spacing(0.5) },
  tab: {
    flex: 1, paddingVertical: theme.spacing(0.9), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  tabActive: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  tabText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  tabTextActive: { color: theme.colors.blue },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), gap: 4 },
  head: { paddingVertical: theme.spacing(0.75) },
  highlight: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm },
  zone: { width: 3, alignSelf: 'stretch', borderRadius: 1.5, marginRight: 2 },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  cell: { color: theme.colors.text, fontSize: theme.font.body, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pos: { width: 22 },
  num: { width: 25 },
  pts: { width: 32 },
  dim: { color: theme.colors.textDim },
  bold: { fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  cupRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.9), paddingHorizontal: theme.spacing(0.5),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  cupTeam: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  cupScore: {
    color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700',
    width: 40, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  legend: { flexDirection: 'row', gap: theme.spacing(2), justifyContent: 'center', paddingVertical: theme.spacing(2) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: theme.colors.textDim, fontSize: theme.font.small },
});
