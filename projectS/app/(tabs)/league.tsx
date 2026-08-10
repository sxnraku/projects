import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { Club, cupRoundMsg, goalDifference, shortName, StandingRow } from '../../src/core/models';
import { leagueStats } from '../../src/core/game';
import { theme, zoneColor } from '../../src/ui/theme';
import { useT, useTMsg } from '../../src/ui/i18n';
import { CompBadge } from '../../src/ui/Flag';
import { Face } from '../../src/ui/Face';
import { Body, CrestCircle, PosText, Screen, Section } from '../components';

export default function League() {
  const t = useT();
  const router = useRouter();
  const tMsg = useTMsg();
  const standings = useGameStore((s) => s.standings);
  const managedLeague = useGameStore((s) => s.managedLeague);
  const state = useGameStore((s) => s.state);
  const managedId = state?.meta.managedClubId;

  const leagues = Object.values(state?.leagues ?? {}).sort((a, b) => a.tier - b.tier);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'stats'>('table');
  const activeLeague = selected ?? managedLeague();
  const isCup = activeLeague === 'taca';
  const rows = isCup ? [] : standings(activeLeague);

  const leagueObj = state?.leagues[activeLeague];
  const nation = state?.clubs[state.meta.managedClubId]?.country ?? 'PRT';

  if (isCup && state) {
    return (
      <Screen>
        <CompBadge country={nation} title={t('cup.name')}
          subtitle={t('cup.resultsSub', { stage: tMsg(cupRoundMsg(state.cup, state.cup.currentRound)) })} />
        <Tabs leagues={leagues} active={activeLeague} onSelect={setSelected} />
        <CupView state={state} />
      </Screen>
    );
  }

  return (
    <Screen>
      <CompBadge
        country={leagueObj?.country ?? nation}
        title={leagueObj?.name ?? t('tab.league')}
        subtitle={leagueObj ? t('league.metaSub', { n: leagueObj.clubIds.length, tier: leagueObj.tier }) : undefined}
      />
      <Tabs leagues={leagues} active={activeLeague} onSelect={(id) => { setSelected(id); }} />

      <View style={styles.viewSeg}>
        {(['table', 'stats'] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.viewBtn, view === v && styles.viewOn]}>
            <Text style={[styles.viewText, view === v && styles.viewTextOn]}>
              {v === 'table' ? t('league.view.table') : t('league.view.stats')}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push('/world' as never)} style={[styles.viewBtn, styles.worldBtn]}>
          <Text style={[styles.viewText, styles.worldText]}>🌍 {t('world.title')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/europe' as never)} style={[styles.viewBtn, styles.euroBtn]}>
          <Text style={[styles.viewText, styles.euroText]}>🏆 {t('euro.title')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/history' as never)} style={[styles.viewBtn, styles.histBtn]}>
          <Text style={[styles.viewText, styles.histText]}>📜 {t('history.title')}</Text>
        </Pressable>
      </View>

      {view === 'stats' && state ? <StatsView state={state} leagueId={activeLeague} /> : (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.clubId}
        renderItem={({ item, index }) => (
          <TableRow row={item} pos={index + 1} total={rows.length}
            club={state?.clubs[item.clubId]} highlight={item.clubId === managedId}
            onOpen={() => router.push(`/club/${item.clubId}` as never)} />
        )}
        ListHeaderComponent={
          <View style={[styles.row, styles.head]}>
            <View style={styles.zone} />
            <Text style={[styles.h, styles.pos]}>#</Text>
            <Text style={[styles.h, { flex: 1, textAlign: 'left' }]}>{t('league.col.club')}</Text>
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
            <LegendDot color={theme.colors.green} label={t('league.legend.promo')} />
            <LegendDot color={theme.colors.red} label={t('league.legend.releg')} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
      )}
    </Screen>
  );
}

/** Estatísticas da liga: melhores marcadores, assistências e onze da época. */
function StatsView({
  state, leagueId,
}: { state: NonNullable<ReturnType<typeof useGameStore.getState>['state']>; leagueId: string }) {
  const t = useT();
  const stats = leagueStats(state, leagueId, 8);
  const nameOf = (id: string) => { const p = state.players[id]; return p ? shortName(p) : id; };
  const club = (id: string) => state.clubs[id];
  const empty = stats.scorers.length === 0 && stats.teamOfSeason.length === 0;

  if (empty) {
    return <View style={{ paddingTop: theme.spacing(2) }}><Body dim>{t('league.stats.empty')}</Body></View>;
  }

  const ranked = (rows: { playerId: string; clubId: string; value: number }[], unit: string) =>
    rows.map((r, i) => {
      const p = state.players[r.playerId];
      return (
        <View key={r.playerId} style={styles.stRow}>
          <Text style={styles.stRank}>{i + 1}</Text>
          {p ? <Face seed={p.id} size={26} shirt={club(r.clubId)?.primaryColor} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.stName} numberOfLines={1}>{nameOf(r.playerId)}</Text>
            <Text style={styles.stSub} numberOfLines={1}>{club(r.clubId)?.name ?? ''}</Text>
          </View>
          <Text style={styles.stVal}>{r.value}<Text style={styles.stUnit}> {unit}</Text></Text>
        </View>
      );
    });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
      <Section title={t('league.stats.scorers')} />
      {stats.scorers.length ? ranked(stats.scorers, t('league.stats.goals')) : <Body dim>{t('league.stats.none')}</Body>}

      <Section title={t('league.stats.assisters')} />
      {stats.assisters.length ? ranked(stats.assisters, t('league.stats.assists')) : <Body dim>{t('league.stats.none')}</Body>}

      <Section title={t('league.stats.tots')} />
      {stats.teamOfSeason.length === 0 ? <Body dim>{t('league.stats.none')}</Body> : stats.teamOfSeason.map((s) => {
        const p = state.players[s.playerId];
        return (
          <View key={s.playerId} style={styles.stRow}>
            {p ? <PosText position={p.positions[0]!} style={{ fontSize: 10, width: 30 }} /> : null}
            {p ? <Face seed={p.id} size={26} shirt={club(s.clubId)?.primaryColor} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.stName} numberOfLines={1}>{nameOf(s.playerId)}</Text>
              <Text style={styles.stSub} numberOfLines={1}>{club(s.clubId)?.name ?? ''}</Text>
            </View>
            <Text style={[styles.stVal, { color: theme.colors.yellow }]}>{s.rating.toFixed(1)}</Text>
          </View>
        );
      })}
    </ScrollView>
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
  const t = useT();
  return (
    <View style={styles.tabs}>
      {leagues.map((l) => (
        <Pressable key={l.id} onPress={() => onSelect(l.id)}
          style={[styles.tab, active === l.id && styles.tabActive]}>
          <Text style={[styles.tabText, active === l.id && styles.tabTextActive]}>
            {t('league.tabTier', { tier: l.tier })}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onSelect('taca')}
        style={[styles.tab, active === 'taca' && styles.tabActive]}>
        <Text style={[styles.tabText, active === 'taca' && styles.tabTextActive]}>{t('league.tabCup')}</Text>
      </Pressable>
    </View>
  );
}

/** Vista da Taça: estado atual + resultados por eliminatória (mais recente primeiro). */
function CupView({ state }: { state: NonNullable<ReturnType<typeof useGameStore.getState>['state']> }) {
  const t = useT();
  const tMsg = useTMsg();
  const cup = state.cup;
  const managedId = state.meta.managedClubId;
  const name = (id: string) => state.clubs[id]?.name ?? id;
  const stillIn = cup.alive.includes(managedId) && !cup.winnerClubId;

  const rounds = [...new Set(cup.fixtures.map((f) => f.round))].sort((a, b) => b - a);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title={t('cup.state')} />
      {cup.winnerClubId ? (
        <Body style={{ color: theme.colors.yellow, fontWeight: '700' }}>
          {t('cup.winner', { club: name(cup.winnerClubId) })}
        </Body>
      ) : (
        <Body dim>
          {t('cup.inProgress', { n: cup.alive.length, stage: tMsg(cupRoundMsg(cup, cup.currentRound)) })}
          {stillIn ? t('cup.stillIn') : cup.fixtures.length > 0 ? t('cup.out') : ''}
        </Body>
      )}

      {rounds.map((round) => (
        <View key={round}>
          <Section title={tMsg(cupRoundMsg(cup, round))} />
          {cup.fixtures.filter((f) => f.round === round).map((f) => {
            const r = f.result!;
            const mine = f.homeClubId === managedId || f.awayClubId === managedId;
            const homeClub = state.clubs[f.homeClubId];
            const awayClub = state.clubs[f.awayClubId];
            const homeWon = r.home.goals > r.away.goals;
            return (
              <View key={f.id} style={[styles.cupRow, mine && styles.highlight]}>
                <Text style={[styles.cupTeam, { textAlign: 'right' }, mine && styles.bold, !homeWon && styles.dim]} numberOfLines={1}>
                  {name(f.homeClubId)}
                </Text>
                {homeClub ? <CrestCircle club={homeClub} size={22} /> : null}
                <Text style={styles.cupScore}>{r.home.goals}-{r.away.goals}</Text>
                {awayClub ? <CrestCircle club={awayClub} size={22} /> : null}
                <Text style={[styles.cupTeam, mine && styles.bold, homeWon && styles.dim]} numberOfLines={1}>
                  {name(f.awayClubId)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      {cup.fixtures.length === 0 ? <Body dim>{t('cup.drawDone')}</Body> : null}
      <View style={{ height: theme.spacing(3) }} />
    </ScrollView>
  );
}

function TableRow({
  row, pos, total, club, highlight, onOpen,
}: { row: StandingRow; pos: number; total: number; club?: Club; highlight: boolean; onOpen?: () => void }) {
  const gd = goalDifference(row);
  const zone = zoneColor(pos, total);
  return (
    <Pressable style={[styles.row, highlight && styles.highlight]} onPress={onOpen} disabled={!onOpen}>
      <View style={[styles.zone, zone ? { backgroundColor: zone } : null]} />
      <Text style={[styles.cell, styles.pos, styles.dim]}>{pos}</Text>
      {club ? <CrestCircle club={club} size={20} /> : <View style={{ width: 20 }} />}
      <Text style={[styles.cell, { flex: 1, textAlign: 'left', marginLeft: 4 }, highlight && styles.bold]} numberOfLines={1}>
        {club?.name ?? row.clubId}
      </Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.played}</Text>
      <Text style={[styles.cell, styles.num]}>{row.won}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.drawn}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.lost}</Text>
      <Text style={[styles.cell, styles.num, styles.dim]}>{gd > 0 ? `+${gd}` : gd}</Text>
      <Text style={[styles.cell, styles.pts, styles.bold]}>{row.points}</Text>
    </Pressable>
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
  histBtn: { borderColor: theme.colors.textDim },
  histText: { color: theme.colors.textDim },
  viewSeg: { flexDirection: 'row', gap: theme.spacing(0.75), marginBottom: theme.spacing(0.5) },
  viewBtn: { flex: 1, paddingVertical: theme.spacing(0.75), borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  viewOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  viewText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  viewTextOn: { color: theme.colors.blue },
  worldBtn: { borderColor: theme.colors.green, backgroundColor: theme.colors.surfaceAlt },
  worldText: { color: theme.colors.green },
  euroBtn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surfaceAlt },
  euroText: { color: theme.colors.accent },
  stRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.9), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  stRank: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  stSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  stVal: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stUnit: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

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
