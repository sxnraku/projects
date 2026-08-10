import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { GameState, Mentality, MatchEvent, MatchResult, shortName, Tactic, Tempo } from '../src/core/models';
import { theme } from '../src/ui/theme';
import { useT } from '../src/ui/i18n';
import { Body, Button, Card, Crest, H1, Screen } from './components';
import { GoalClip } from '../src/ui/goalClip/GoalClip';
import { haptic, playSound, startAmbience, stopAmbience } from '../src/ui/sound';
import { showRewarded } from '../src/native/ads';

const MENTALITIES: Mentality[] = ['DEFENSIVE', 'BALANCED', 'ATTACKING'];
const TEMPOS: Tempo[] = ['SLOW', 'NORMAL', 'FAST'];
const MAX_SUBS = 3;
const CLIP_W = Math.min(340, Dimensions.get('window').width - 24);

/** Um golo à espera de ser reproduzido em lance animado. */
interface ClipGoal { scorer: string; minute: number; side: 'HOME' | 'AWAY'; seed: number }

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
  const applyMatchChange = useGameStore((s) => s.applyMatchChange);
  const applyEuroMatchChange = useGameStore((s) => s.applyEuroMatchChange);
  const clearMatchAdjustments = useGameStore((s) => s.clearMatchAdjustments);
  const [busyAd, setBusyAd] = useState(false);
  // Fila de jogos jogáveis da semana (noite europeia primeiro, depois a liga).
  const [queueIdx, setQueueIdx] = useState(0);
  const [halftimeDone, setHalftimeDone] = useState(false); // o prompt de intervalo já apareceu?
  const [showSub, setShowSub] = useState(false);
  // Onze ao vivo (persiste entre janelas de substituição) + nº de subs já feitas.
  const [liveTactic, setLiveTactic] = useState<Pick<Tactic, 'lineup' | 'mentality' | 'tempo'> | null>(null);
  const [subsUsed, setSubsUsed] = useState(0);

  const queue = useMemo(() => {
    const mm = lastWeek?.managedMatches ?? [];
    if (mm.length > 0) return mm;
    // Fallback (saves antigos): só o jogo da liga do clube gerido.
    if (!lastWeek || !managedId) return [];
    const lg = lastWeek.fixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId);
    return lg ? [lg] : [];
  }, [lastWeek, managedId]);
  const fixture = queue[Math.min(queueIdx, Math.max(0, queue.length - 1))] ?? null;
  const result: MatchResult | null = fixture?.result ?? null;

  // Tipo do jogo atual: europeu? e, se sim, é fase de liga (permite substituições)?
  const isEuroMatch = !!fixture && fixture.leagueId.startsWith('euro_');
  const euroComp = isEuroMatch ? fixture!.leagueId.replace('euro_', '') : null;
  const isEuroLeaguePhase = isEuroMatch && fixture!.round >= 1; // KO/Supertaça (round 0) = watch-only
  const hasNext = queueIdx < queue.length - 1;

  // ---- Relógio da reprodução ao vivo ----
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const finished = minute >= FULL_TIME_MIN;

  // ---- Lance de golo animado (dispara quando o relógio chega ao minuto do golo) ----
  const [clipGoal, setClipGoal] = useState<ClipGoal | null>(null);
  const playedGoals = useRef<Set<number>>(new Set()); // índices de golos já reproduzidos
  const playedSfx = useRef<Set<number>>(new Set()); // índices de eventos já sonorizados
  const prevMinute = useRef(0);

  // Lado do clube gerido neste jogo — decide se um golo é festa ou desgosto.
  const ourSide: 'HOME' | 'AWAY' | null = !result || !managedId
    ? null
    : result.homeClubId === managedId ? 'HOME' : result.awayClubId === managedId ? 'AWAY' : null;

  /** Reação da bancada a um golo, do lado certo. */
  const roar = useCallback((side: 'HOME' | 'AWAY' | null) => {
    if (side && ourSide && side === ourSide) { playSound('goal'); haptic('success'); }
    else { playSound('goalAgainst'); haptic('warning'); }
  }, [ourSide]);

  // Sair do ecrã (voltar atrás, tocar num separador) fecha tudo o que estava
  // por cima: o lance de golo e o painel de substituições. Sem isto ficavam a
  // correr por baixo e reapareciam ao voltar — ou, com <Modal>, por cima de
  // outro separador.
  useFocusEffect(useCallback(() => () => {
    setClipGoal(null);
    setShowSub(false);
    setPaused(true);
  }, []));

  // AMBIENTE DE ESTÁDIO enquanto se vê o jogo. Sem esta cama sonora os efeitos
  // soltos ficavam pendurados no silêncio e o jogo soava mais vazio do que
  // antes de ter som ("não há mais som no resto do jogo, fica meio estranho").
  useEffect(() => {
    startAmbience();
    return () => stopAmbience();
  }, []);

  // Novo jogo (seed diferente) → relógio ao 0' e reinicia o estado das substituições/lances.
  useEffect(() => {
    setMinute(0);
    setPaused(false);
    setHalftimeDone(false);
    setShowSub(false);
    setSubsUsed(0);
    setClipGoal(null);
    playedGoals.current = new Set();
    playedSfx.current = new Set();
    prevMinute.current = 0;
    const tac = managedId ? state?.tactics[managedId] : null;
    setLiveTactic(tac ? { lineup: tac.lineup.map((s) => ({ ...s })), mentality: tac.mentality, tempo: tac.tempo } : null);
    // Apito inicial + bancada: o jogo começa a soar a jogo.
    if (result) { playSound('whistle'); haptic('light'); }
  }, [result?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao passar pelo minuto de um golo, dispara o lance animado (só no avanço natural;
  // num salto grande — botão "Fim" — marca-os como vistos sem interromper).
  useEffect(() => {
    if (!result) return;
    const jumped = minute - prevMinute.current > 1;
    prevMinute.current = minute;

    // SOM DOS LANCES. Num salto ("Fim") os eventos passam todos de uma vez —
    // aí marcam-se como ouvidos sem tocar, senão saía uma salva de apitos.
    result.events.forEach((e, ei) => {
      if (e.minute > minute || playedSfx.current.has(ei)) return;
      playedSfx.current.add(ei);
      if (jumped) return;
      if (e.type === 'GOAL') {
        // Se vai haver lance animado, o rugido espera pelo momento em que a
        // bola entra mesmo na rede (o clip avisa por `onNet`). Tocar já era
        // festejar o golo antes de o remate sequer acontecer.
        if (!clipGoal && e.side) return;
        roar(e.side);
      } else if (e.type === 'RED_CARD') {
        playSound('foul'); haptic('error');
      } else if (e.type === 'YELLOW_CARD') {
        // Amarelos são muitos por jogo — só vibração, sem apito. Com som
        // tornavam-se ruído de fundo e estragavam o efeito do vermelho.
        haptic('light');
      }
    });

    const goals = result.events.filter((e) => e.type === 'GOAL');
    for (let gi = 0; gi < goals.length; gi++) {
      const g = goals[gi]!;
      if (g.minute > minute || playedGoals.current.has(gi)) continue;
      playedGoals.current.add(gi);
      if (!jumped && !clipGoal && g.side) {
        const pid = g.playerId;
        const p = pid && state ? state.players[pid] : null;
        setClipGoal({
          scorer: p ? shortName(p) : t('clip.goal'),
          minute: g.minute,
          side: g.side,
          seed: result.seed ^ (g.minute * 2654435761),
        });
        break; // um lance de cada vez
      }
    }
  }, [minute, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Substituições: jogos de LIGA do clube gerido (doméstica) OU fase de liga europeia.
  // Taça e eliminatórias/Supertaça europeias são watch-only (o vencedor já resolveu).
  const isLeagueMatch = !!fixture && !!state && !!managedId
    && fixture.leagueId === state.clubs[managedId]?.leagueId;
  const canAdjust = isLeagueMatch || isEuroLeaguePhase;
  const canSub = canAdjust && !finished && subsUsed < MAX_SUBS;

  // Ao chegar ao intervalo (45'), pausa e abre o painel — uma vez.
  useEffect(() => {
    if (canAdjust && !halftimeDone && !finished && minute >= 45) {
      setPaused(true);
      setShowSub(true);
    }
  }, [minute, halftimeDone, finished, canAdjust]);

  // Tick do relógio (limpa e recria quando a velocidade/pausa muda).
  // Pausa também durante o lance de golo (clipGoal).
  useEffect(() => {
    if (!result || paused || finished || clipGoal) return;
    const t = setInterval(
      () => setMinute((m) => Math.min(FULL_TIME_MIN, m + 1)),
      SPEED_MS[speed] ?? 500,
    );
    return () => clearInterval(t);
  }, [result, paused, finished, speed, clipGoal]);

  // Apito final — uma vez por jogo, mesmo quando se salta para o fim.
  const endWhistled = useRef<number | null>(null);
  useEffect(() => {
    if (!result || !finished) return;
    if (endWhistled.current === result.seed) return;
    endWhistled.current = result.seed;
    playSound('whistleEnd');
    haptic('medium');
  }, [finished, result?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ESTADO VAZIO — chega-se aqui abrindo "Jornada" sem ter avançado a semana.
  // Antes era um título encostado ao canto superior esquerdo com uma linha
  // cinzenta por baixo, num ecrã inteiro preto: parecia um erro, não um estado.
  if (!state || !result || !live) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyIcon}>⚽</Text>
          </View>
          <Text style={styles.emptyTitle}>{t('match.noRecent')}</Text>
          <Text style={styles.emptyHint}>{t('match.advanceHint')}</Text>
          <View style={styles.emptyBtnWrap}>
            <Button label={t('match.goHome')} onPress={() => router.replace('/')} />
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.emptyBack}>{t('common.back')}</Text>
          </Pressable>
        </View>
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
        {isEuroMatch && euroComp ? (
          <View style={styles.euroBadge}>
            <Text style={styles.euroBadgeText}>🏆 {t('euro.night')} · {t(`euro.name.${euroComp}`)}</Text>
          </View>
        ) : null}
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
              <View style={styles.teamNameRow}>
                {home.id === managedId ? <Text style={styles.ourStar}>★</Text> : null}
                <Text
                  style={[styles.teamName, home.id === managedId && styles.ourTeamName]}
                  numberOfLines={1}
                >{home.shortName}</Text>
              </View>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.score}>{live.goalsHome}</Text>
              <Text style={styles.scoreSep}>–</Text>
              <Text style={styles.score}>{live.goalsAway}</Text>
            </View>
            <View style={styles.teamCol}>
              <Crest club={away} size={54} />
              <View style={styles.teamNameRow}>
                {away.id === managedId ? <Text style={styles.ourStar}>★</Text> : null}
                <Text
                  style={[styles.teamName, away.id === managedId && styles.ourTeamName]}
                  numberOfLines={1}
                >{away.shortName}</Text>
              </View>
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

        {/* CONTROLOS DE VELOCIDADE + SUBSTITUIÇÃO AO VIVO */}
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
        {canSub && minute >= 1 ? (
          <Pressable style={styles.subBtn} onPress={() => { setPaused(true); setShowSub(true); }}>
            <Text style={styles.subBtnText}>⇄ {t('match.sub.open', { n: MAX_SUBS - subsUsed })}</Text>
          </Pressable>
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
              <Text style={[styles.tlTeam, home.id === managedId && styles.ourTeamName]}>
                {home.id === managedId ? '★ ' : ''}{home.shortName}
              </Text>
              <Text style={styles.tlMinuteHead}>MIN</Text>
              <Text style={[styles.tlTeam, away.id === managedId && styles.ourTeamName]}>
                {away.id === managedId ? '★ ' : ''}{away.shortName}
              </Text>
            </View>
            {live.timeline.map((e, i) => (
              <TimelineRow key={`${e.minute}-${e.type}-${i}`} event={e} player={playerName(e.playerId)} highlight={i === 0 && !finished} />
            ))}
          </Card>
        ) : null}

        {/* SEGUNDA HIPÓTESE — só na LIGA doméstica, após derrota, 1× por jogo, por anúncio */}
        {finished && isLeagueMatch && !won && !drew && fixture && !replayedFixtures.includes(fixture.id) ? (
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

        {finished ? (
          <Button
            label={hasNext ? t('match.next') : t('match.continue')}
            onPress={() => {
              if (hasNext) { clearMatchAdjustments(); setQueueIdx((i) => i + 1); }
              else router.replace('/');
            }}
          />
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* PAINEL DE SUBSTITUIÇÕES — intervalo ou ao vivo (re-simula a partir do minuto) */}
      {showSub && state && managedId && liveTactic ? (
        <SubSheet
          state={state}
          managedId={managedId}
          tactic={liveTactic}
          subsAlready={subsUsed}
          minute={minute}
          onApply={(lineup, mentality, tempo) => {
            const at = Math.max(1, minute); // muda a partir deste minuto
            const prev = liveTactic.lineup;
            const changed = lineup.filter((s, i) => s.playerId !== prev[i]?.playerId).length;
            if (isEuroLeaguePhase && fixture) applyEuroMatchChange(fixture.id, at, lineup, mentality, tempo);
            else applyMatchChange(at, lineup, mentality, tempo);
            setLiveTactic({ lineup, mentality, tempo });
            setSubsUsed((n) => n + changed);
            setHalftimeDone(true);
            setShowSub(false);
            setPaused(false);
          }}
          onSkip={() => { setHalftimeDone(true); setShowSub(false); setPaused(false); }}
        />
      ) : null}

      {/* LANCE DE GOLO — clip animado curto (velocidade fixa, toque para saltar) */}
      {clipGoal ? (
        <View style={styles.overlayFill}>
          <View style={styles.clipBackdrop}>
            <GoalClip
              scorer={clipGoal.scorer}
              minute={clipGoal.minute}
              attackColor={(clipGoal.side === 'HOME' ? home.primaryColor : away.primaryColor)}
              defenceColor={(clipGoal.side === 'HOME' ? away.primaryColor : home.primaryColor)}
              seed={clipGoal.seed}
              width={CLIP_W}
              onDone={() => setClipGoal(null)}
              onNet={() => roar(clipGoal.side)}
              // De quem é o golo. O ecrã sempre soube; o clip é que não — e com
              // dois clubes de cores parecidas não havia como perceber.
              ours={(clipGoal.side === 'HOME' ? home.id : away.id) === managedId}
              clubName={clipGoal.side === 'HOME' ? home.shortName : away.shortName}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Painel de SUBSTITUIÇÕES: muda mentalidade/ritmo e faz até MAX_SUBS trocas no total
 * do jogo. Usado ao intervalo (45') e ao vivo (botão "Substituir"). Arranca do onze
 * atual (`tactic`) e respeita as substituições já feitas (`subsAlready`).
 */
function SubSheet({
  state, managedId, tactic, subsAlready, minute, onApply, onSkip,
}: {
  state: GameState;
  managedId: string;
  tactic: Pick<Tactic, 'lineup' | 'mentality' | 'tempo'>;
  subsAlready: number;
  minute: number;
  onApply: (lineup: { position: any; playerId: string }[], mentality: Mentality, tempo: Tempo) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const [lineup, setLineup] = useState(tactic.lineup.map((s) => ({ ...s })));
  const [mentality, setMentality] = useState<Mentality>(tactic.mentality);
  const [tempo, setTempo] = useState<Tempo>(tactic.tempo);
  const [subbing, setSubbing] = useState<number | null>(null);
  const [localSubs, setLocalSubs] = useState(0);
  const totalSubs = subsAlready + localSubs;
  const atHalftime = minute >= 45 && minute < 46;

  const inLineup = new Set(lineup.map((s) => s.playerId));
  const bench = (state.clubs[managedId]?.squad ?? [])
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p && !inLineup.has(p.id) && p.condition.status !== 'INJURED');

  const doSub = (benchId: string) => {
    if (subbing === null) return;
    setLineup((l) => l.map((s, i) => (i === subbing ? { ...s, playerId: benchId } : s)));
    setLocalSubs((n) => n + 1);
    setSubbing(null);
  };

  return (
    // OVERLAY em vez de <Modal>: um Modal nativo é uma janela do sistema e
    // sobrevive ao ecrã que o criou. Ao sair do jogo a meio (voltar atrás,
    // tocar num separador), o painel de substituições e o lance de golo
    // ficavam pendurados POR CIMA do Mercado — parecia que o jogo continuava a
    // acontecer fora do jogo. Dentro da árvore do ecrã, desaparecem com ele.
    <View style={styles.overlayFill} pointerEvents="box-none">
      <View style={styles.htBackdrop}>
        <View style={styles.htSheet}>
          <Text style={styles.htTitle}>{atHalftime ? t('match.halftime') : t('match.sub.title', { min: minute })}</Text>

          <Text style={styles.htLabel}>{t('tac.mentality')}</Text>
          <Segment options={MENTALITIES.map((m) => ({ key: m, label: t(`mentality.${m}`), active: mentality === m, onPress: () => setMentality(m) }))} />
          <Text style={styles.htLabel}>{t('tac.tempo')}</Text>
          <Segment options={TEMPOS.map((tp) => ({ key: tp, label: t(`tempo.${tp}`), active: tempo === tp, onPress: () => setTempo(tp) }))} />

          <Text style={styles.htLabel}>{t('match.ht.subs', { n: totalSubs })}</Text>
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
                      disabled={totalSubs >= MAX_SUBS}
                      onPress={() => setSubbing(i)}
                      style={[styles.htSwap, totalSubs >= MAX_SUBS && { opacity: 0.35 }]}
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
    </View>
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
  /* A NOSSA equipa marcada com estrela. Sem isto, num jogo fora contra um clube
     de cores parecidas, o utilizador olhava para o resultado e não sabia qual
     dos números era o dele. */
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ourStar: { color: theme.colors.accent, fontSize: 11, marginTop: 1 },
  ourTeamName: { color: theme.colors.accent, fontWeight: '800' },
  board: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1,
    borderColor: theme.colors.border, overflow: 'hidden', alignItems: 'center',
    paddingBottom: theme.spacing(2), marginTop: theme.spacing(2), marginBottom: theme.spacing(1),
  },
  boardStripes: { flexDirection: 'row', alignSelf: 'stretch', height: 6 },
  boardStripe: { flex: 1 },

  euroBadge: {
    alignSelf: 'center', marginTop: theme.spacing(1.5), marginBottom: -theme.spacing(0.5),
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(0.6),
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1, borderColor: theme.colors.accent,
  },
  euroBadgeText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5 },

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
  subBtn: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(0.85), borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt,
    marginBottom: theme.spacing(1),
  },
  subBtnText: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '800' },
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
  // Cobre o ecrã do jogo por dentro da árvore — ver o comentário no SubSheet.
  overlayFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 10, elevation: 10 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(3) },
  emptyBadge: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing(2),
  },
  emptyIcon: { fontSize: 38 },
  emptyTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', textAlign: 'center' },
  emptyHint: {
    color: theme.colors.textDim, fontSize: theme.font.body, textAlign: 'center',
    marginTop: theme.spacing(0.75), lineHeight: 20,
  },
  emptyBtnWrap: { alignSelf: 'stretch', marginTop: theme.spacing(2.5), marginBottom: theme.spacing(1) },
  emptyBack: { color: theme.colors.textDim, fontSize: theme.font.small, padding: theme.spacing(1) },
  clipBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center' },
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
