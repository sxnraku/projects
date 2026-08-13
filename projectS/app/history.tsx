/**
 * HISTÓRICO — a memória do mundo.
 *
 * Três vistas sobre o mesmo arquivo (`state.history`, ver `core/models/history.ts`):
 *   Épocas   — o que aconteceu em cada ano, do mais recente para trás
 *   Palmarés — quem ganhou mais vezes cada liga
 *   Recordes — as melhores épocas de marcador de sempre
 *
 * Tudo é lido do arquivo já resolvido em texto, por isso um campeão de 2029
 * continua legível depois de o clube mudar de divisão ou desaparecer.
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { useT } from '../src/ui/i18n';
import { theme } from '../src/ui/theme';
import { Body, Screen, Section } from './components';
import {
  emptyHistory,
  scoringRecords,
  SeasonHistoryEntry,
  titleTable,
} from '../src/core/models';

type HistView = 'seasons' | 'titles' | 'records';

export default function HistoryScreen() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const [view, setView] = useState<HistView>('seasons');

  const history = state?.history ?? emptyHistory();
  // Do ano mais recente para o mais antigo — é como se lê um palmarés.
  const seasons = useMemo(
    () => [...history.seasons].sort((a, b) => b.season - a.season),
    [history],
  );

  /** Ligas do país ativo, da principal para baixo — dá a ordem do palmarés. */
  const leagues = useMemo(() => {
    if (!state) return [];
    return Object.values(state.leagues).sort((a, b) => a.tier - b.tier);
  }, [state]);

  if (!state) return <Screen edges={['left', 'right', 'bottom']}><Body>—</Body></Screen>;

  if (seasons.length === 0) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyText}>{t('history.empty')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.seg}>
        {(['seasons', 'titles', 'records'] as HistView[]).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} style={[styles.segBtn, view === v && styles.segOn]}>
            <Text style={[styles.segText, view === v && styles.segTextOn]}>{t(`history.tab.${v}`)}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'seasons' ? (
        <FlatList
          data={seasons}
          keyExtractor={(s) => String(s.season)}
          renderItem={({ item }) => <SeasonCard entry={item} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : null}

      {view === 'titles' ? (
        <FlatList
          data={leagues}
          keyExtractor={(l) => l.id}
          renderItem={({ item: league }) => {
            const rows = titleTable(history, league.id);
            if (rows.length === 0) return null;
            return (
              <View>
                <Section title={league.name} />
                {rows.map((r, i) => (
                  <View key={r.clubId} style={styles.row}>
                    <Text style={styles.pos}>{i + 1}</Text>
                    <Text style={styles.club} numberOfLines={1}>{r.clubName}</Text>
                    <Text style={styles.titles}>
                      {r.titles === 1 ? t('history.title1') : t('history.titles', { n: r.titles })}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : null}

      {view === 'records' ? (
        <FlatList
          data={scoringRecords(history, 15)}
          keyExtractor={(r) => r.playerId}
          ListHeaderComponent={<Section title={t('history.topScorer')} />}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Text style={styles.pos}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.club} numberOfLines={1}>{item.playerName}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.clubName} · {item.leagueName}</Text>
              </View>
              <Text style={styles.titles}>
                {t('history.goalsIn', { goals: item.goals, season: item.season })}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : null}
    </Screen>
  );
}

/** Uma época: campeões de cada liga, melhor marcador da principal e as taças. */
function SeasonCard({ entry }: { entry: SeasonHistoryEntry }) {
  const t = useT();
  const champions = [...entry.champions].sort((a, b) => a.tier - b.tier);
  const main = champions[0];
  const topScorer = main ? entry.topScorers.find((s) => s.leagueId === main.leagueId) : undefined;
  // Prémios da divisão mais alta que teve campeão (o `main`).
  const mainAwards = main ? (entry.awards ?? []).filter((a) => a.leagueId === main.leagueId) : [];

  return (
    <View style={styles.card}>
      <Text style={styles.season}>{t('history.season', { season: entry.season })}</Text>

      {champions.map((c) => (
        <View key={c.leagueId} style={styles.champRow}>
          <Text style={styles.champLeague} numberOfLines={1}>{c.leagueName}</Text>
          <Text style={styles.champClub} numberOfLines={1}>🏅 {c.clubName}</Text>
          <Text style={styles.champPts}>{c.points}</Text>
        </View>
      ))}

      {topScorer ? (
        <Text style={styles.detail}>
          ⚽ {t('history.topScorer')}: <Text style={styles.detailStrong}>{topScorer.playerName}</Text> ({topScorer.goals})
        </Text>
      ) : null}

      {/* PRÉMIOS INDIVIDUAIS da divisão principal — o palmarés deixou de ser só
          de equipas. Só se mostram os da 1.ª divisão para o cartão não crescer
          com quatro prémios × cinco escalões. */}
      {mainAwards.length > 0 ? (
        <View style={styles.awards}>
          {mainAwards.map((a) => (
            <Text key={a.kind} style={styles.detail} numberOfLines={1}>
              🏆 {t(`award.${a.kind}`)}: <Text style={styles.detailStrong}>{a.playerName}</Text>
              {a.kind === 'TOP_SCORER' ? ` (${t('award.goals', { value: a.value })})`
                : a.kind === 'BEST_MANAGER' ? ''
                : ` (${t('award.rating', { value: (a.value / 10).toFixed(1) })})`}
            </Text>
          ))}
        </View>
      ) : null}

      {entry.cups.length > 0 ? (
        <View style={styles.cups}>
          {entry.cups.map((c) => (
            <View key={c.key} style={styles.cupChip}>
              <Text style={styles.cupText} numberOfLines={1}>
                {t(c.key, { league: '' }).replace(/ —.*$/, '')} · {c.clubName}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  segBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  segOn: { backgroundColor: theme.colors.accent + '22', borderColor: theme.colors.accent },
  segText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '700' },
  segTextOn: { color: theme.colors.accent },

  card: {
    backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  season: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  champRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  champLeague: { color: theme.colors.textDim, fontSize: 11, width: 92 },
  champClub: { color: theme.colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  champPts: { color: theme.colors.textDim, fontSize: 11 },
  detail: { color: theme.colors.textDim, fontSize: 12, marginTop: 8 },
  detailStrong: { color: theme.colors.text, fontWeight: '700' },
  cups: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  awards: { marginTop: 6, gap: 2 },
  cupChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
    maxWidth: '100%',
  },
  cupText: { color: theme.colors.textDim, fontSize: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border + '55',
  },
  pos: { color: theme.colors.textDim, fontSize: 12, width: 22 },
  club: { color: theme.colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  sub: { color: theme.colors.textDim, fontSize: 11, marginTop: 1 },
  titles: { color: theme.colors.accent, fontSize: 12, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: theme.colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
