import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import {
  EURO_COMPS, EuroComp, EuroCompetitionState, euroTableSorted, worldTeamOfClub,
} from '../src/core/europe';
import { GameState } from '../src/core/models';
import { theme } from '../src/ui/theme';
import { useT } from '../src/ui/i18n';
import { Screen, H1, Body } from './components';

/** Nome + cor de um clube europeu (ativo→estado; fundo→WORLD_TEAMS). */
function metaOf(state: GameState, clubId: string): { name: string; color: string } {
  const c = state.clubs[clubId];
  if (c) return { name: c.name, color: c.primaryColor };
  const wt = worldTeamOfClub(clubId);
  return { name: wt?.name ?? '—', color: wt?.color ?? '#888' };
}

export default function Europe() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const [tab, setTab] = useState<'mine' | 'comps' | 'super'>('mine');

  if (!state || !state.europe) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <H1>{t('euro.title')}</H1>
        <Body dim>{t('euro.notQualified')}</Body>
      </Screen>
    );
  }
  const eu = state.europe;
  const managedId = state.meta.managedClubId;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.seg}>
        {(['mine', 'comps', 'super'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
            <Text style={[styles.segText, tab === k && styles.segTextOn]}>{t(`euro.tab.${k}`)}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'mine' ? (
        eu.managedComp
          ? <MineView state={state} cs={eu.competitions[eu.managedComp]} managedId={managedId} />
          : <Body dim>{t('euro.notQualified')}</Body>
      ) : null}

      {tab === 'comps' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {EURO_COMPS.map((c) => <CompCard key={c} state={state} cs={eu.competitions[c]} managedId={managedId} />)}
          <View style={{ height: 24 }} />
        </ScrollView>
      ) : null}

      {tab === 'super' ? <SuperView state={state} managedId={managedId} /> : null}
    </Screen>
  );
}

// ---------- A minha prova ----------
function MineView({ state, cs, managedId }: { state: GameState; cs: EuroCompetitionState; managedId: string }) {
  const t = useT();
  const sorted = euroTableSorted(cs);
  const myFixtures = cs.fixtures
    .filter((f) => f.homeId === managedId || f.awayId === managedId)
    .sort((a, b) => a.matchday - b.matchday);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.compTitle}>{t(`euro.name.${cs.comp}`)} · {t(`euro.stage.${cs.stage}`)}</Text>

      {/* Tabela única de 36 com zonas de corte */}
      <View style={styles.card}>
        <Text style={styles.blockLabel}>{t('euro.leaguePhase')}</Text>
        <View style={styles.tHead}>
          <Text style={[styles.tPos, styles.tHeadText]}>#</Text>
          <Text style={[styles.tTeam, styles.tHeadText]}>{t('euro.table.team')}</Text>
          <Text style={[styles.tNum, styles.tHeadText]}>J</Text>
          <Text style={[styles.tNum, styles.tHeadText]}>DG</Text>
          <Text style={[styles.tPts, styles.tHeadText]}>P</Text>
        </View>
        {sorted.map((r, i) => {
          const m = metaOf(state, r.clubId);
          const zone = i < 8 ? theme.colors.green : i < 24 ? theme.colors.accent : theme.colors.textDim;
          const mine = r.clubId === managedId;
          return (
            <View key={r.clubId} style={[styles.tRow, mine && styles.tRowMine]}>
              <View style={[styles.zoneBar, { backgroundColor: zone }]} />
              <Text style={styles.tPos}>{i + 1}</Text>
              <Text style={[styles.tTeam, mine && styles.mineText]} numberOfLines={1}>{m.name}</Text>
              <Text style={styles.tNum}>{r.P}</Text>
              <Text style={styles.tNum}>{r.GF - r.GA > 0 ? '+' : ''}{r.GF - r.GA}</Text>
              <Text style={styles.tPts}>{r.Pts}</Text>
            </View>
          );
        })}
        <View style={styles.legend}>
          <Legend color={theme.colors.green} label={t('euro.cut.direct')} />
          <Legend color={theme.colors.accent} label={t('euro.cut.playoff')} />
          <Legend color={theme.colors.textDim} label={t('euro.cut.out')} />
        </View>
      </View>

      {/* Os meus jogos */}
      <View style={styles.card}>
        <Text style={styles.blockLabel}>{t('euro.myFixtures')}</Text>
        {myFixtures.map((f) => {
          const isHome = f.homeId === managedId;
          const oppId = isHome ? f.awayId : f.homeId;
          const opp = metaOf(state, oppId);
          const r = f.result;
          const mine = r ? (isHome ? r.home.goals : r.away.goals) : null;
          const theirs = r ? (isHome ? r.away.goals : r.home.goals) : null;
          const win = mine != null && theirs != null && mine > theirs;
          const draw = mine != null && mine === theirs;
          return (
            <View key={f.id} style={styles.fxRow}>
              <Text style={styles.fxTag}>{isHome ? 'C' : 'F'}</Text>
              <Text style={styles.fxOpp} numberOfLines={1}>{opp.name}</Text>
              <Text style={[styles.fxScore, { color: r ? (win ? theme.colors.win : draw ? theme.colors.draw : theme.colors.loss) : theme.colors.textDim }]}>
                {r ? `${mine}–${theirs}` : '–'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Fase a eliminar (ronda atual) */}
      {cs.ties.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.blockLabel}>{t('euro.bracket')} · {t(`euro.stage.${cs.stage}`)}</Text>
          {cs.ties.map((tie) => {
            const a = metaOf(state, tie.homeSeedId), b = metaOf(state, tie.awaySeedId);
            const mine = tie.homeSeedId === managedId || tie.awaySeedId === managedId;
            const wName = tie.winnerId ? metaOf(state, tie.winnerId).name : null;
            return (
              <View key={tie.tieId} style={[styles.tieRow, mine && styles.tRowMine]}>
                <Text style={[styles.tieTeam, mine && styles.mineText]} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.tieVs}>{t('euro.vs')}</Text>
                <Text style={[styles.tieTeam, { textAlign: 'right' }, mine && styles.mineText]} numberOfLines={1}>{b.name}</Text>
                {wName ? <Text style={styles.tieWin} numberOfLines={1}>✓ {wName}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {cs.winnerClubId ? (
        <Text style={styles.champLine}>🏆 {t('euro.champion')}: {metaOf(state, cs.winnerClubId).name}</Text>
      ) : null}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ---------- Cartão compacto de uma prova ----------
function CompCard({ state, cs, managedId }: { state: GameState; cs: EuroCompetitionState; managedId: string }) {
  const t = useT();
  const sorted = euroTableSorted(cs);
  return (
    <View style={styles.card}>
      <View style={styles.compHead}>
        <Text style={styles.compName}>{t(`euro.name.${cs.comp}`)}</Text>
        <Text style={styles.compStage}>{t(`euro.stage.${cs.stage}`)}</Text>
      </View>
      {cs.winnerClubId ? (
        <Text style={styles.champLine}>🏆 {metaOf(state, cs.winnerClubId).name}</Text>
      ) : null}
      {sorted.slice(0, 8).map((r, i) => {
        const m = metaOf(state, r.clubId);
        const mine = r.clubId === managedId;
        return (
          <View key={r.clubId} style={[styles.tRow, mine && styles.tRowMine]}>
            <Text style={styles.tPos}>{i + 1}</Text>
            <Text style={[styles.tTeam, mine && styles.mineText]} numberOfLines={1}>{m.name}</Text>
            <Text style={styles.tNum}>{r.P}</Text>
            <Text style={styles.tPts}>{r.Pts}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------- Supertaça ----------
function SuperView({ state, managedId }: { state: GameState; managedId: string }) {
  const t = useT();
  const sc = state.europe?.superCup;
  if (!sc) return <Body dim>{t('euro.superCup.none')}</Body>;
  const home = metaOf(state, sc.fixture.homeId);
  const away = metaOf(state, sc.fixture.awayId);
  const r = sc.fixture.result;
  const winName = sc.winnerId ? metaOf(state, sc.winnerId).name : null;
  const mine = sc.fixture.homeId === managedId || sc.fixture.awayId === managedId;
  return (
    <View style={styles.card}>
      <Text style={styles.compTitle}>{t('euro.superCup.title')}</Text>
      <View style={styles.superRow}>
        <View style={[styles.superDot, { backgroundColor: home.color }]} />
        <Text style={[styles.superName, mine && styles.mineText]} numberOfLines={1}>{home.name}</Text>
        <Text style={styles.superScore}>{r ? `${r.home.goals}–${r.away.goals}` : t('euro.vs')}</Text>
        <Text style={[styles.superName, { textAlign: 'right' }, mine && styles.mineText]} numberOfLines={1}>{away.name}</Text>
        <View style={[styles.superDot, { backgroundColor: away.color }]} />
      </View>
      <Text style={styles.superStatus}>{winName ? `🏆 ${winName}` : t('euro.superCup.pending')}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: theme.spacing(0.75), marginBottom: theme.spacing(1) },
  segBtn: { flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  segOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surfaceAlt },
  segText: { color: theme.colors.textDim, fontWeight: '700', fontSize: theme.font.small },
  segTextOn: { color: theme.colors.accent },

  compTitle: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '900', marginBottom: theme.spacing(1) },
  card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing(1.25), marginBottom: theme.spacing(1) },
  blockLabel: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: theme.spacing(0.75) },

  tHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tHeadText: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  tRowMine: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm },
  zoneBar: { width: 3, height: 16, borderRadius: 2, marginRight: 4 },
  tPos: { width: 22, color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  tTeam: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  mineText: { color: theme.colors.accent, fontWeight: '800' },
  tNum: { width: 30, textAlign: 'center', color: theme.colors.textDim, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  tPts: { width: 26, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'] },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.25), marginTop: theme.spacing(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: theme.colors.textDim, fontSize: 10, fontWeight: '700' },

  fxRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.6), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  fxTag: { width: 18, color: theme.colors.textDim, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  fxOpp: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  fxScore: { width: 48, textAlign: 'right', fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'] },

  tieRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(0.75), paddingVertical: theme.spacing(0.6), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, flexWrap: 'wrap' },
  tieTeam: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  tieVs: { color: theme.colors.textDim, fontSize: 10, fontWeight: '700' },
  tieWin: { width: '100%', color: theme.colors.green, fontSize: 10, fontWeight: '800' },

  champLine: { color: theme.colors.accent, fontSize: theme.font.body, fontWeight: '900', marginVertical: theme.spacing(0.5) },

  compHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing(0.5) },
  compName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  compStage: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

  superRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(0.75), marginVertical: theme.spacing(1) },
  superDot: { width: 12, height: 12, borderRadius: 6 },
  superName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  superScore: { color: theme.colors.accent, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  superStatus: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
});
