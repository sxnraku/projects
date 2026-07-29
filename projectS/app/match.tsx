import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { GameState, Mentality, MatchEvent, MatchResult, POSITION_GROUP, shortName, Tempo } from '../src/core/models';
import { theme } from '../src/ui/theme';
import { useT } from '../src/ui/i18n';
import { Body, Button, Card, Crest, H1, Screen } from './components';
import { showRewarded } from '../src/native/ads';

const MENTALITIES: Mentality[] = ['DEFENSIVE', 'BALANCED', 'ATTACKING'];
const TEMPOS: Tempo[] = ['SLOW', 'NORMAL', 'FAST'];
const MAX_SUBS = 3;

const EVENT_ICON: Record<string, string> = {
  GOAL: '⚽', ASSIST: '🅰', SAVE: '🧤', CHANCE: '💨', YELLOW_CARD: '🟨', RED_CARD: '🟥',
  INJURY: '🚑', HALF_TIME: '⏸', FULL_TIME: '🏁', KICKOFF: '▶',
};

/** Duração de um minuto de jogo em ms, por velocidade. */
const SPEED_MS: Record<number, number> = { 1: 500, 2: 250, 4: 100 };
const FULL_TIME_MIN = 90;

export default function Match() {
  const router = useRouter();
  const t = useT();
  const lastWeek = useGameStore((s) => s.lastWeek);
  const state = useGameStore((s) => s.state);
  const managedId = state?.meta.managedClubId;

  const replayLastMatch = useGameStore((s) => s.replayLastMatch);
  const replayedFixtures = useGameStore((s) => s.replayedFixtures);
  const applyHalftime = useGameStore((s) => s.applyHalftime);
  const [busyAd, setBusyAd] = useState(false);
  const [halftimeDone, setHalftimeDone] = useState(false);
  const [showHT, setShowHT] = useState(false);

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

  // Novo jogo → relógio volta ao 0' e reinicia o estado do intervalo.
  useEffect(() => {
    setMinute(0);
    setPaused(false);
    setHalftimeDone(false);
    setShowHT(false);
  }, [result?.seed]);

  // Só há ajuste de intervalo em jogos de LIGA do clube gerido (Taça usa outra seed).
  const isLeagueMatch = !!fixture && !!state && !!managedId
    && fixture.leagueId === state.clubs[managedId]?.leagueId;

  // Ao chegar ao intervalo (45'), pausa e abre o painel de ajustes — uma vez.
  useEffect(() => {
    if (isLeagueMatch && !halftimeDone && !finished && minute >= 45) {
      setPaused(true);
      setShowHT(true);
    }
  }, [minute, halftimeDone, finished, isLeagueMatch]);

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
      <Screen edges={['left', 'right', 'bottom']}>
        <H1>{t('match.noRecent')}</H1>
        <Body dim>{t('match.advanceHint')}</Body>
        <View style={{ height: 16 }} />
        <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
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
    return p ? shortName(p) : '';
  };

  // O lance mais recente é um golo acabado de acontecer? → destaque.
  const lastEvent = live.timeline[0];
  const goalJustNow = !finished && lastEvent?.type === 'GOAL' && minute - lastEvent.minute <= 2;

  // Pós-jogo: notas, homem do jogo, marcadores e assistências.
  const ps = result.playerStats ?? {};
  const motmId = result.motm ?? null;
  const scorers = Object.keys(ps).filter((id) => ps[id]!.goals > 0).sort((a, b) => ps[b]!.goals - ps[a]!.goals);
  const assisters = Object.keys(ps).filter((id) => ps[id]!.assists > 0);
  const withCount = (id: string, n: number) => `${playerName(id)}${n > 1 ? ` (${n})` : ''}`;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
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
              {finished ? t('match.fullTime') : `${minute}'`}
            </Text>
            {!finished && minute >= 45 ? <Text style={styles.halfTag}>{t('match.secondHalf')}</Text> : null}
            {!finished && minute < 45 ? <Text style={styles.halfTag}>{t('match.firstHalf')}</Text> : null}
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
            <Text style={styles.goalFlash}>{t('match.goal', { name: playerName(lastEvent!.playerId) })}</Text>
          ) : null}

          {finished ? (
            <Text style={[styles.verdict, { color: won ? theme.colors.win : drew ? theme.colors.draw : theme.colors.loss }]}>
              {won ? t('match.win') : drew ? t('match.draw') : t('match.loss')}
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
            <ControlBtn label={t('match.speed.end')} onPress={() => setMinute(FULL_TIME_MIN)} />
          </View>
        ) : null}

        {/* ESTATÍSTICAS AO VIVO */}
        <Card>
          <StatCompare label={t('match.shots')} home={live.shotsHome} away={live.shotsAway} />
          <StatCompare label={t('match.onTarget')} home={live.onTargetHome} away={live.onTargetAway} />
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

        {/* PÓS-JOGO: homem do jogo, marcadores, assistências */}
        {finished && (motmId || scorers.length > 0) ? (
          <Card>
            {motmId ? (
              <View style={styles.motmRow}>
                <Text style={styles.motmLabel}>{t('match.motm')}</Text>
                <Text style={styles.motmName} numberOfLines={1}>{playerName(motmId)}</Text>
                <Text style={styles.motmRating}>{ps[motmId]!.rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {scorers.length > 0 ? (
              <View style={styles.psRow}>
                <Text style={styles.psLabel}>⚽ {t('match.scorers')}</Text>
                <Text style={styles.psVal}>{scorers.map((id) => withCount(id, ps[id]!.goals)).join(', ')}</Text>
              </View>
            ) : null}
            {assisters.length > 0 ? (
              <View style={styles.psRow}>
                <Text style={styles.psLabel}>🅰 {t('match.assists')}</Text>
                <Text style={styles.psVal}>{assisters.map((id) => withCount(id, ps[id]!.assists)).join(', ')}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

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
            <Text style={styles.replayText}>{t('match.replay')}</Text>
            <Text style={styles.replaySub}>{t('match.replaySub')}</Text>
          </Pressable>
        ) : null}

        {finished ? <Button label={t('match.continue')} onPress={() => router.replace('/')} /> : null}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* PAINEL DE INTERVALO — substituições + mentalidade/ritmo (re-simula a 2ª parte) */}
      {showHT && state && managedId ? (
        <HalftimeSheet
          state={state}
          managedId={managedId}
          onApply={(lineup, mentality, tempo) => {
            applyHalftime(lineup, mentality, tempo);
            setHalftimeDone(true);
            setShowHT(false);
            setPaused(false);
          }}
          onSkip={() => { setHalftimeDone(true); setShowHT(false); setPaused(false); }}
        />
      ) : null}
    </Screen>
  );
}

/** Painel de INTERVALO: muda mentalidade/ritmo e faz até 3 substituições. */
function HalftimeSheet({
  state, managedId, onApply, onSkip,
}: {
  state: GameState;
  managedId: string;
  onApply: (lineup: { position: any; playerId: string }[], mentality: Mentality, tempo: Tempo) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const tac = state.tactics[managedId]!;
  const [lineup, setLineup] = useState(tac.lineup.map((s) => ({ ...s })));
  const [mentality, setMentality] = useState<Mentality>(tac.mentality);
  const [tempo, setTempo] = useState<Tempo>(tac.tempo);
  const [subbing, setSubbing] = useState<number | null>(null);
  const [subs, setSubs] = useState(0);

  const inLineup = new Set(lineup.map((s) => s.playerId));
  const bench = (state.clubs[managedId]?.squad ?? [])
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p && !inLineup.has(p.id) && p.condition.status !== 'INJURED');

  const doSub = (benchId: string) => {
    if (subbing === null) return;
    setLineup((l) => l.map((s, i) => (i === subbing ? { ...s, playerId: benchId } : s)));
    setSubs((n) => n + 1);
    setSubbing(null);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.htBackdrop}>
        <View style={styles.htSheet}>
          <Text style={styles.htTitle}>{t('match.halftime')}</Text>

          <Text style={styles.htLabel}>{t('tac.mentality')}</Text>
          <Segment options={MENTALITIES.map((m) => ({ key: m, label: t(`mentality.${m}`), active: mentality === m, onPress: () => setMentality(m) }))} />
          <Text style={styles.htLabel}>{t('tac.tempo')}</Text>
          <Segment options={TEMPOS.map((tp) => ({ key: tp, label: t(`tempo.${tp}`), active: tempo === tp, onPress: () => setTempo(tp) }))} />

          <Text style={styles.htLabel}>{t('match.ht.subs', { n: subs })}</Text>
          {subbing === null ? (
            <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              {lineup.map((s, i) => {
                const p = state.players[s.playerId];
                return (
                  <View key={i} style={styles.htRow}>
                    <Text style={styles.htPos}>{s.position}</Text>
                    <Text style={styles.htName} numberOfLines={1}>{p ? shortName(p) : '—'}</Text>
                    <Text style={[styles.htFit, { color: p ? theme.colors.text : theme.colors.textDim }]}>
                      {p ? `${p.condition.fitness}%` : ''}
                    </Text>
                    <Pressable
                      disabled={subs >= MAX_SUBS}
                      onPress={() => setSubbing(i)}
                      style={[styles.htSwap, subs >= MAX_SUBS && { opacity: 0.35 }]}
                    >
                      <Text style={styles.htSwapText}>⇄</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View>
              <Text style={styles.htPick}>{t('match.ht.pickSub')}</Text>
              <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
                {bench.length === 0 ? (
                  <Text style={styles.htEmpty}>{t('match.ht.noBench')}</Text>
                ) : bench.map((p) => (
                  <Pressable key={p.id} style={styles.htRow} onPress={() => doSub(p.id)}>
                    <Text style={styles.htPos}>{p.positions[0]}</Text>
                    <Text style={styles.htName} numberOfLines={1}>{shortName(p)}</Text>
                    <Text style={styles.htFit}>{p.condition.fitness}%</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={() => setSubbing(null)} style={styles.htCancel}>
                <Text style={styles.htCancelText}>✕</Text>
              </Pressable>
            </View>
          )}

          <Pressable style={styles.htApply} onPress={() => onApply(lineup, mentality, tempo)}>
            <Text style={styles.htApplyText}>{t('match.ht.apply')}</Text>
          </Pressable>
          <Pressable style={styles.htSkip} onPress={onSkip}>
            <Text style={styles.htSkipText}>{t('match.ht.skip')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Seletor segmentado (mentalidade/ritmo) para o painel de intervalo. */
function Segment({ options }: { options: { key: string; label: string; active: boolean; onPress: () => void }[] }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={o.onPress} style={[styles.segItem, o.active && styles.segItemOn]}>
          <Text style={[styles.segText, o.active && styles.segTextOn]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
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
  const t = useT();
  return (
    <View style={styles.possWrap}>
      <View style={styles.possLabels}>
        <Text style={styles.possVal}>{home}%</Text>
        <Text style={styles.possLabel}>{t('match.possession')}</Text>
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

  // Pós-jogo: homem do jogo + marcadores/assistências
  motmRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingBottom: theme.spacing(1), marginBottom: theme.spacing(0.5),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  motmLabel: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  motmName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flex: 1 },
  motmRating: { color: theme.colors.accent, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  psRow: { flexDirection: 'row', gap: theme.spacing(1), paddingVertical: theme.spacing(0.6), alignItems: 'flex-start' },
  psLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', width: 100 },
  psVal: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },

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

  // Painel de intervalo
  htBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  htSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(2),
  },
  htTitle: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: theme.spacing(1) },
  htLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5, marginTop: theme.spacing(1), marginBottom: 4 },
  htRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.85), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  htPos: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800', width: 34 },
  htName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flex: 1 },
  htFit: { fontSize: theme.font.small, fontWeight: '700', width: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
  htSwap: { paddingHorizontal: theme.spacing(1), paddingVertical: 2 },
  htSwapText: { color: theme.colors.blue, fontSize: 18, fontWeight: '900' },
  htPick: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '800', marginBottom: 4 },
  htEmpty: { color: theme.colors.textDim, fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  htCancel: { alignSelf: 'center', paddingVertical: theme.spacing(0.75) },
  htCancelText: { color: theme.colors.textDim, fontSize: theme.font.h3, fontWeight: '800' },
  htApply: { backgroundColor: theme.colors.green, borderRadius: theme.radius.sm, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing(1.5) },
  htApplyText: { color: '#fff', fontSize: theme.font.h3, fontWeight: '800' },
  htSkip: { alignItems: 'center', paddingVertical: theme.spacing(1) },
  htSkipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

  segment: { flexDirection: 'row', backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: theme.spacing(0.9), alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  segItemOn: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  segTextOn: { color: '#20242A', fontWeight: '800' },
});
