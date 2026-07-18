import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { MatchEvent, MatchResult } from '../src/core/models';
import { theme } from '../src/ui/theme';
import { Body, Button, Card, Crest, H1, Screen } from './components';
import { showRewarded } from '../src/native/ads';

const EVENT_ICON: Record<string, string> = {
  GOAL: '⚽', SAVE: '🧤', CHANCE: '💨', YELLOW_CARD: '🟨', RED_CARD: '🟥',
  INJURY: '🚑', HALF_TIME: '⏸', FULL_TIME: '🏁', KICKOFF: '▶',
};

/** Duração de um minuto de jogo em ms, por velocidade. */
const SPEED_MS: Record<number, number> = { 1: 500, 2: 250, 4: 100 };
const FULL_TIME_MIN = 90;

export default function Match() {
  const router = useRouter();
  const lastWeek = useGameStore((s) => s.lastWeek);
  const state = useGameStore((s) => s.state);
  const managedId = state?.meta.managedClubId;

  const replayLastMatch = useGameStore((s) => s.replayLastMatch);
  const replayedFixtures = useGameStore((s) => s.replayedFixtures);
  const [busyAd, setBusyAd] = useState(false);

  const fixture = useMemo(() => {
    if (!lastWeek || !managedId) return null;
    return lastWeek.fixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId) ?? null;
  }, [lastWeek, managedId]);
  const result: MatchResult | null = fixture?.result ?? null;

  // ---- Relógio da reprodução ao vivo ----
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const finished = minute >= FULL_TIME_MIN;

  // Novo jogo → relógio volta ao 0'.
  useEffect(() => {
    setMinute(0);
    setPaused(false);
  }, [result?.seed]);

  // Tick do relógio (limpa e recria quando a velocidade/pausa muda).
  useEffect(() => {
    if (!result || paused || finished) return;
    const t = setInterval(
      () => setMinute((m) => Math.min(FULL_TIME_MIN, m + 1)),
      SPEED_MS[speed] ?? 500,
    );
    return () => clearInterval(t);
  }, [result, paused, finished, speed]);

  // ---- Estado do jogo até ao minuto atual ----
  const live = useMemo(() => {
    if (!result) return null;
    const upTo = (e: MatchEvent) => e.minute <= minute;
    const goalsHome = result.events.filter((e) => e.type === 'GOAL' && e.side === 'HOME' && upTo(e)).length;
    const goalsAway = result.events.filter((e) => e.type === 'GOAL' && e.side === 'AWAY' && upTo(e)).length;
    const shotTypes = ['GOAL', 'SAVE', 'CHANCE'];
    const shots = (side: 'HOME' | 'AWAY') =>
      result.events.filter((e) => shotTypes.includes(e.type) && e.side === side && upTo(e)).length;
    const onTarget = (side: 'HOME' | 'AWAY') =>
      result.events.filter((e) => ['GOAL', 'SAVE'].includes(e.type) && e.side === side && upTo(e)).length;
    const timeline = result.events
      .filter((e) => ['GOAL', 'SAVE', 'YELLOW_CARD', 'RED_CARD', 'INJURY', 'HALF_TIME'].includes(e.type) && upTo(e))
      .reverse(); // mais recente primeiro
    return {
      goalsHome, goalsAway,
      shotsHome: shots('HOME'), shotsAway: shots('AWAY'),
      onTargetHome: onTarget('HOME'), onTargetAway: onTarget('AWAY'),
      timeline,
    };
  }, [result, minute]);

  if (!state || !result || !live) {
    return (
      <Screen>
        <H1>Sem jogo recente</H1>
        <Body dim>Avança uma jornada no ecrã principal.</Body>
        <View style={{ height: 16 }} />
        <Button label="Voltar" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const home = state.clubs[result.homeClubId]!;
  const away = state.clubs[result.awayClubId]!;
  const won =
    (result.homeClubId === managedId && live.goalsHome > live.goalsAway) ||
    (result.awayClubId === managedId && live.goalsAway > live.goalsHome);
  const drew = live.goalsHome === live.goalsAway;

  const playerName = (id: string | null) => {
    const p = id ? state.players[id] : null;
    return p ? p.lastName : '';
  };

  // O lance mais recente é um golo acabado de acontecer? → destaque.
  const lastEvent = live.timeline[0];
  const goalJustNow = !finished && lastEvent?.type === 'GOAL' && minute - lastEvent.minute <= 2;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* SCOREBOARD AO VIVO */}
        <View style={styles.board}>
          <View style={styles.boardStripes}>
            <View style={[styles.boardStripe, { backgroundColor: home.primaryColor }]} />
            <View style={[styles.boardStripe, { backgroundColor: away.primaryColor }]} />
          </View>

          {/* Relógio */}
          <View style={styles.clockRow}>
            <Text style={[styles.clock, finished && { color: theme.colors.accent }]}>
              {finished ? 'FINAL' : `${minute}'`}
            </Text>
            {!finished && minute >= 45 ? <Text style={styles.halfTag}>2ª PARTE</Text> : null}
            {!finished && minute < 45 ? <Text style={styles.halfTag}>1ª PARTE</Text> : null}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(minute / FULL_TIME_MIN) * 100}%` }]} />
          </View>

          <View style={styles.scoreRow}>
            <View style={styles.teamCol}>
              <Crest club={home} size={54} />
              <Text style={styles.teamName} numberOfLines={1}>{home.shortName}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.score}>{live.goalsHome}</Text>
              <Text style={styles.scoreSep}>–</Text>
              <Text style={styles.score}>{live.goalsAway}</Text>
            </View>
            <View style={styles.teamCol}>
              <Crest club={away} size={54} />
              <Text style={styles.teamName} numberOfLines={1}>{away.shortName}</Text>
            </View>
          </View>

          {goalJustNow ? (
            <Text style={styles.goalFlash}>⚽ GOOOOLO! {playerName(lastEvent!.playerId)}</Text>
          ) : null}

          {finished ? (
            <Text style={[styles.verdict, { color: won ? theme.colors.win : drew ? theme.colors.draw : theme.colors.loss }]}>
              {won ? '🎉 VITÓRIA' : drew ? '🤝 EMPATE' : '😞 DERROTA'}
            </Text>
          ) : null}
        </View>

        {/* CONTROLOS DE VELOCIDADE */}
        {!finished ? (
          <View style={styles.controls}>
            <ControlBtn label={paused ? '▶' : '⏸'} active={paused} onPress={() => setPaused((p) => !p)} />
            {[1, 2, 4].map((s) => (
              <ControlBtn key={s} label={`${s}x`} active={speed === s && !paused}
                onPress={() => { setSpeed(s); setPaused(false); }} />
            ))}
            <ControlBtn label="⏩ Fim" onPress={() => setMinute(FULL_TIME_MIN)} />
          </View>
        ) : null}

        {/* ESTATÍSTICAS AO VIVO */}
        <Card>
          <StatCompare label="Remates" home={live.shotsHome} away={live.shotsAway} />
          <StatCompare label="À baliza" home={live.onTargetHome} away={live.onTargetAway} />
          {finished ? (
            <View style={styles.xgRow}>
              <Text style={styles.xgVal}>{result.home.xg.toFixed(2)}</Text>
              <Text style={styles.xgLabel}>xG</Text>
              <Text style={styles.xgVal}>{result.away.xg.toFixed(2)}</Text>
            </View>
          ) : null}
          {finished ? (
            <PossessionBar
              home={result.home.possession}
              away={result.away.possession}
              homeColor={home.primaryColor}
              awayColor={away.primaryColor}
            />
          ) : null}
        </Card>

        {/* TIMELINE AO VIVO — mais recente no topo */}
        {live.timeline.length > 0 ? (
          <Card>
            <View style={styles.tlHeader}>
              <Text style={styles.tlTeam}>{home.shortName}</Text>
              <Text style={styles.tlMinuteHead}>MIN</Text>
              <Text style={styles.tlTeam}>{away.shortName}</Text>
            </View>
            {live.timeline.map((e, i) => (
              <TimelineRow key={`${e.minute}-${e.type}-${i}`} event={e} player={playerName(e.playerId)} highlight={i === 0 && !finished} />
            ))}
          </Card>
        ) : null}

        {/* SEGUNDA HIPÓTESE — só após derrota, 1× por jogo, em troca de anúncio */}
        {finished && !won && !drew && fixture && !replayedFixtures.includes(fixture.id) ? (
          <Pressable
            disabled={busyAd}
            onPress={async () => {
              setBusyAd(true);
              const earned = await showRewarded();
              if (earned) {
                const newResult = replayLastMatch(fixture.id);
                if (newResult) {
                  setMinute(0); // volta a reproduzir o novo jogo ao vivo
                  setPaused(false);
                }
              }
              setBusyAd(false);
            }}
            style={[styles.replayBtn, busyAd && { opacity: 0.5 }]}
          >
            <Text style={styles.replayText}>
              🔁 SEGUNDA HIPÓTESE — vê um anúncio e joga outra vez
            </Text>
            <Text style={styles.replaySub}>O novo resultado pode ser melhor... ou pior.</Text>
          </Pressable>
        ) : null}

        {finished ? <Button label="CONTINUAR  ▶" onPress={() => router.replace('/')} /> : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function ControlBtn({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.ctrl, active && styles.ctrlActive]}>
      <Text style={[styles.ctrlText, active && styles.ctrlTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PossessionBar({
  home, away, homeColor, awayColor,
}: { home: number; away: number; homeColor: string; awayColor: string }) {
  return (
    <View style={styles.possWrap}>
      <View style={styles.possLabels}>
        <Text style={styles.possVal}>{home}%</Text>
        <Text style={styles.possLabel}>POSSE DE BOLA</Text>
        <Text style={styles.possVal}>{away}%</Text>
      </View>
      <View style={styles.possBar}>
        <View style={{ flex: home, backgroundColor: homeColor }} />
        <View style={{ width: 2, backgroundColor: theme.colors.bg }} />
        <View style={{ flex: away, backgroundColor: awayColor }} />
      </View>
    </View>
  );
}

function StatCompare({ label, home, away }: { label: string; home: number; away: number }) {
  const homeWins = home > away;
  const awayWins = away > home;
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statVal, homeWins && styles.statBest]}>{home}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, awayWins && styles.statBest]}>{away}</Text>
    </View>
  );
}

function TimelineRow({ event, player, highlight }: { event: MatchEvent; player: string; highlight?: boolean }) {
  const icon = EVENT_ICON[event.type] ?? '•';
  const isGoal = event.type === 'GOAL';
  const neutral = event.side === null;
  const content = (
    <Text style={[styles.tlText, isGoal && styles.tlGoal]} numberOfLines={1}>
      {icon} {player || event.text}
    </Text>
  );

  if (neutral) {
    return (
      <View style={[styles.tlRow, highlight && styles.tlHighlight]}>
        <View style={styles.tlSide} />
        <Text style={styles.tlMinute}>{event.minute}'</Text>
        <View style={styles.tlSide}>
          <Text style={styles.tlNeutral}>{icon} {event.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tlRow, highlight && styles.tlHighlight]}>
      <View style={[styles.tlSide, { alignItems: 'flex-end' }]}>
        {event.side === 'HOME' ? content : null}
      </View>
      <Text style={styles.tlMinute}>{event.minute}'</Text>
      <View style={styles.tlSide}>{event.side === 'AWAY' ? content : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1,
    borderColor: theme.colors.border, overflow: 'hidden', alignItems: 'center',
    paddingBottom: theme.spacing(2), marginTop: theme.spacing(2), marginBottom: theme.spacing(1),
  },
  boardStripes: { flexDirection: 'row', alignSelf: 'stretch', height: 6 },
  boardStripe: { flex: 1 },

  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: theme.spacing(1.5) },
  clock: { color: theme.colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  halfTag: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  progressTrack: {
    alignSelf: 'stretch', height: 3, backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing(3), marginTop: 6, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary },

  scoreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch', paddingHorizontal: theme.spacing(3), marginTop: theme.spacing(1.5),
  },
  teamCol: { alignItems: 'center', gap: 6, width: 90 },
  teamName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  score: { color: theme.colors.text, fontSize: theme.font.score, fontWeight: '900' },
  scoreSep: { color: theme.colors.textDim, fontSize: 28, fontWeight: '300' },
  goalFlash: {
    color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900',
    letterSpacing: 1, marginTop: theme.spacing(1.5),
  },
  verdict: { fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1, marginTop: theme.spacing(1.5) },

  controls: {
    flexDirection: 'row', gap: theme.spacing(1), justifyContent: 'center',
    marginVertical: theme.spacing(0.5),
  },
  ctrl: {
    minWidth: 52, paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface, alignItems: 'center',
  },
  ctrlActive: { backgroundColor: theme.colors.primaryDim, borderColor: theme.colors.primary },
  ctrlText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '800' },
  ctrlTextActive: { color: '#fff' },

  possWrap: { marginTop: theme.spacing(1.5) },
  possLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  possVal: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.h3 },
  possLabel: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  possBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },

  xgRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing(0.75) },
  xgVal: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700', width: 60, textAlign: 'center', fontVariant: ['tabular-nums'] },
  xgLabel: { color: theme.colors.textDim, fontSize: theme.font.small, flex: 1, textAlign: 'center', fontWeight: '700' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing(0.75) },
  statVal: { color: theme.colors.textDim, fontSize: theme.font.h3, fontWeight: '700', width: 60, textAlign: 'center' },
  statBest: { color: theme.colors.text, fontWeight: '900' },
  statLabel: { color: theme.colors.textDim, fontSize: theme.font.small, flex: 1, textAlign: 'center' },

  tlHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  tlTeam: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800', width: 100, textAlign: 'center' },
  tlMinuteHead: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  tlRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.6), borderRadius: theme.radius.sm },
  tlHighlight: { backgroundColor: theme.colors.surfaceAlt },
  tlSide: { flex: 1 },
  tlMinute: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800',
    width: 40, textAlign: 'center',
  },
  tlText: { color: theme.colors.text, fontSize: theme.font.body },
  tlGoal: { fontWeight: '900', color: theme.colors.primary },
  tlNeutral: { color: theme.colors.textDim, fontSize: theme.font.small, fontStyle: 'italic' },

  replayBtn: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.accent,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginBottom: theme.spacing(1),
    alignItems: 'center',
  },
  replayText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  replaySub: { color: theme.colors.textDim, fontSize: 10, marginTop: 2 },
});
