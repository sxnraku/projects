import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { Spot } from '../../src/ui/tutorial/Spot';
import { TutorialTargets } from '../../src/ui/tutorial/registry';
import { useMonetizationStore } from '../../src/state/monetizationStore';
import { AdReward } from '../../src/monetization';
import { OBJECTIVE_KEYS, dailyBonusAmount } from '../../src/core/career';
import { computeTeamStrength } from '../../src/core/engine';
import { TrainingFocus } from '../../src/core/training';
import { Club, GameState, goalDifference, naturalOverallFine, Player } from '../../src/core/models';
import { PRESS_OPTIONS, answerKey, questionKey, type ReturnedLoan } from '../../src/core/game';
import { money, to100, wage } from '../../src/ui/format';
import { cashWarning, isInsolvent, RUNWAY_WARNING_WEEKS, suggestedWage } from '../../src/core/economy';
import { useT, useTMsg } from '../../src/ui/i18n';
import { fitnessColor, reputationStars, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { PreMatchSheet, WeekReportModal } from '../../src/ui/dialogs';
import { Toast } from '../../src/ui/Toast';
import { haptic, playSound } from '../../src/ui/sound';
import {
  Bar, Body, contrastOn, CrestCircle, darken, DashCard, FormDots, RowKV, Screen, Stars, StrengthTriplet,
  BalanceSplit,
} from '../components';
import { showInterstitial, showRewarded } from '../../src/native/ads';
import AdBanner from '../../src/native/AdBanner';

const FOCUSES: TrainingFocus[] = ['PHYSICAL', 'TECHNICAL', 'TACTICAL', 'RECOVERY'] as TrainingFocus[];

export default function Dashboard() {
  const router = useRouter();
  const t = useT();
  const tMsg = useTMsg();
  const state = useGameStore((s) => s.state);
  const focus = useGameStore((s) => s.trainingFocus);
  const advance = useGameStore((s) => s.advance);
  const setFocus = useGameStore((s) => s.setTrainingFocus);
  const managedClub = useGameStore((s) => s.managedClub);
  const standings = useGameStore((s) => s.standings);
  const upcoming = useGameStore((s) => s.upcomingFixtures);
  const managedLeague = useGameStore((s) => s.managedLeague);
  const acceptOffer = useGameStore((s) => s.acceptOffer);
  const meritOffers = useGameStore((s) => s.meritOffers);
  const acceptMerit = useGameStore((s) => s.acceptMerit);
  const declineMerit = useGameStore((s) => s.declineMerit);
  const lastSeason = useGameStore((s) => s.lastSeason);
  const nextIsEuropean = useGameStore((s) => s.nextIsEuropean);
  const nextEuroMatch = useGameStore((s) => s.nextEuroMatch);
  const resolveCrisis = useGameStore((s) => s.resolveCrisis);
  const answerPress = useGameStore((s) => s.answerPress);
  const fans = useGameStore((s) => s.fans);
  const claimDaily = useGameStore((s) => s.claimDaily);
  const dailyAvailable = useGameStore((s) => s.dailyAvailable);
  const blockedCounts = useGameStore((s) => s.blockedCounts);
  const preview = useGameStore((s) => s.preview);
  const rotate = useGameStore((s) => s.rotate);
  const pendingReport = useGameStore((s) => s.pendingReport);
  const clearReport = useGameStore((s) => s.clearReport);
  const expiringDecisions = useGameStore((s) => s.expiringDecisions);
  const retiringSoon = useGameStore((s) => s.retiringSoon);
  const renewExpiring = useGameStore((s) => s.renewExpiring);
  const releaseExpiring = useGameStore((s) => s.releaseExpiring);
  const returnedLoansPending = useGameStore((s) => s.returnedLoansPending);
  const buyReturnedLoan = useGameStore((s) => s.buyReturnedLoan);
  const dismissReturnedLoan = useGameStore((s) => s.dismissReturnedLoan);

  const inboxItems = useGameStore((s) => s.inboxItems);
  const acceptBid = useGameStore((s) => s.acceptBid);
  const counterBid = useGameStore((s) => s.counterBid);
  const rejectBid = useGameStore((s) => s.rejectBid);
  const resolveRenewal = useGameStore((s) => s.resolveRenewal);
  const resolveRequest = useGameStore((s) => s.resolveRequest);
  const dismissItem = useGameStore((s) => s.dismissItem);
  const acceptCounter = useGameStore((s) => s.acceptCounter);
  const withdrawOffer = useGameStore((s) => s.withdrawOffer);

  const onAdvanceAd = useMonetizationStore((s) => s.onAdvance);
  const rewardedAvailable = useMonetizationStore((s) => s.rewardedAvailable);
  const claimReward = useMonetizationStore((s) => s.claimReward);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRotate, setAskRotate] = useState(false);
  // Dispensa dos popups de reforma, por época (para não reaparecerem).
  const [ackRetiring, setAckRetiring] = useState(-1);
  const [ackRetired, setAckRetired] = useState(-1);

  // O ecrã inicial fica montado por baixo de /match, e um Modal do RN aparece
  // por cima de TUDO — sem este guarda o balanço tapava o jogo ao vivo.
  const [focused, setFocused] = useState(true);
  // Enquanto arranca o jogo, o balanço da semana (pendingReport) já está posto
  // mas ainda estamos focados por 1+ frame → sem este flag, o modal pisca antes
  // de /match tomar o ecrã. Limpa-se ao voltar ao painel.
  const [launching, setLaunching] = useState(false);
  /** Classificação "antes da jornada", mostrada enquanto o jogo não é visto. */
  const [frozen, setFrozen] = useState<{
    table: ReturnType<typeof standings>;
    position: number;
    myRow: ReturnType<typeof standings>[number] | null;
    lastResults: ('W' | 'D' | 'L')[];
  } | null>(null);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    setLaunching(false);
    setFrozen(null); // de volta ao painel: já viste o jogo, mostra os números reais
    return () => setFocused(false);
  }, []));

  const club = managedClub();
  const table = standings();
  const next = upcoming(1)[0];
  const schedule5 = upcoming(6);
  const bc = blockedCounts();
  const blocked = !!bc;
  // Nota do bloqueio, composta e traduzida a partir das contagens do core.
  const blockedNote = bc
    ? [
        // A crise entrava nas contagens mas não na nota: quando era a ÚNICA
        // coisa a bloquear, o aviso ficava "Bloqueado:" sem dizer porquê.
        bc.crisis ? t('block.crisis') : null,
        bc.bids ? t('block.bids', { n: bc.bids }) : null,
        bc.reqs ? t('block.reqs', { n: bc.reqs }) : null,
        bc.counters ? t('block.counters', { n: bc.counters }) : null,
      ].filter(Boolean).join(t('common.and'))
    : '';
  const pre = preview();

  /** Avança a jornada e abre o jogo. Guarda contra multi-toque (evitava avançar
   *  várias jornadas de uma vez) e deixa a UI pintar o "a processar" antes da
   *  simulação síncrona (que bloqueia o thread por uns instantes). */
  const runMatch = async () => {
    if (busy) return;
    setBusy(true);
    // CONGELA a classificação com os números de ANTES da jornada. `advance()`
    // simula o jogo já, por isso sem isto os pontos e a diferença de golos
    // mudavam à frente do utilizador antes de ele sequer ver o jogo — spoiler
    // do resultado e, pior, dava a sensação de que as trocas ao vivo (tática,
    // pressão, mentalidade) não contavam para nada.
    setFrozen({ table, position, myRow, lastResults });
    setLaunching(true); // esconde o balanço enquanto o jogo arranca (evita o flash)
    await new Promise((r) => setTimeout(r, 16)); // deixa pintar o estado ocupado
    try {
      const r = advance();
      if (onAdvanceAd()) await showInterstitial();
      if (next && r) {
        router.push('/match'); // launching fica true; limpa ao voltar (useFocusEffect)
      } else {
        setLaunching(false); // não foi para o jogo → mostra já o balanço, se houver
      }
    } finally {
      setBusy(false);
    }
  };

  const onPressPlay = async () => {
    if (busy) return;
    if (pre && pre.warnings.length > 0) { setAskRotate(true); return; }
    await runMatch();
  };

  // Fanfarra ao fechar uma época com título ou subida — uma vez por época.
  const celebrated = useRef<number | null>(null);
  useEffect(() => {
    const rec = lastSeason?.record;
    if (!rec || celebrated.current === rec.season) return;
    celebrated.current = rec.season;
    if (rec.champion || rec.promoted) { playSound('trophy'); haptic('success'); }
  }, [lastSeason]);

  const position = useMemo(
    () => table.findIndex((r) => r.clubId === club?.id) + 1,
    [table, club],
  );

  // Últimos 5 resultados do clube gerido.
  const lastResults = useMemo(() => {
    if (!state || !club) return [];
    const schedule = state.schedules[managedLeague()];
    if (!schedule) return [];
    return schedule.fixtures
      .filter((f) => f.result && (f.homeClubId === club.id || f.awayClubId === club.id))
      .slice(-5)
      .map((f) => {
        const r = f.result!;
        const isHome = f.homeClubId === club.id;
        const mine = isHome ? r.home.goals : r.away.goals;
        const theirs = isHome ? r.away.goals : r.home.goals;
        return (mine > theirs ? 'W' : mine === theirs ? 'D' : 'L') as 'W' | 'D' | 'L';
      });
  }, [state, club, managedLeague]);

  if (!state || !club) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const finance = state.finances[club.id]!;
  const career = state.career;
  // Fator do escalão (bónus escalam com a divisão, como as receitas).
  const divFactor = Math.pow(0.5, (state.leagues[club.leagueId]?.tier ?? 1) - 1);
  const scaled = (v: number) => Math.round(v * divFactor / 10_000) * 10_000;
  const schedule = state.schedules[managedLeague()];
  const euroNight = nextIsEuropean();
  // Numa noite europeia o clube pode NÃO estar em prova: aí só há pausa.
  const euroMatch = euroNight ? nextEuroMatch() : null;
  const euroOpp = euroMatch ? state.clubs[euroMatch.opponentId] : null;
  const nextOppId = next ? (next.homeClubId === club.id ? next.awayClubId : next.homeClubId) : null;
  const nextOpp = nextOppId ? state.clubs[nextOppId] : null;
  const isHome = next?.homeClubId === club.id;
  const fired = career.pendingOffers.length > 0;

  // Força por zona (escala ~0..100 para ler como nos jogos de referência).
  const strengthOf = (clubId: string) => {
    const t = state.tactics[clubId];
    if (!t) return null;
    const s = computeTeamStrength(t, state.players);
    // Teto de 100: mentalidade + linha alta multiplicam a força e um plantel de
    // topo chegava a mostrar "MED 101", o que lê como bug na escala 0-100.
    const cap = (v: number) => Math.min(100, Math.round(v * 5));
    return { def: cap(s.defence), mid: cap(s.midfield), att: cap(s.attack) };
  };
  const myStrength = strengthOf(club.id);
  const oppStrength = nextOppId ? strengthOf(nextOppId) : null;

  const squad = club.squad.map((id) => state.players[id]).filter(Boolean);
  const avgFit = squad.length
    ? Math.round(squad.reduce((s, p) => s + p!.condition.fitness, 0) / squad.length)
    : 0;

  const myTactic = state.tactics[club.id];

  // Linha da tabela do clube gerido (para o cabeçalho: pontos, diferença de golos).
  const myRow = table.find((r) => r.clubId === club.id) ?? null;

  // Valores MOSTRADOS: enquanto o jogo da jornada não for visto, usa-se o
  // retrato de antes de avançar (ver `frozen` em `runMatch`).
  const shownTable = frozen?.table ?? table;
  const shownPosition = frozen?.position ?? position;
  const shownMyRow = frozen ? frozen.myRow : myRow;
  const shownResults = frozen?.lastResults ?? lastResults;

  // Mini-classificação: 5 linhas à volta do clube.
  const miniStart = Math.max(0, Math.min(shownPosition - 3, shownTable.length - 5));
  const mini = shownTable.slice(miniStart, miniStart + 5);

  const inbox = inboxItems();

  // Adeptos: a cor segue a faixa, não o número — é o que se lê de relance.
  const fanState = fans();
  const fansColor = fanState.band === 'RIOT' || fanState.band === 'ANGRY'
    ? theme.colors.red
    : fanState.band === 'CALM' ? theme.colors.yellow : theme.colors.green;

  return (
    <Screen>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind ?? 'ok'} onHide={() => setFeedback(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: theme.spacing(1.25) }}>
        {fired ? (
          <DashCard title={t('fired.title')} accent={theme.colors.red}>
            {career.pendingOffers.map((clubId) => {
              const c = state.clubs[clubId];
              if (!c) return null;
              const l = state.leagues[c.leagueId];
              return (
                <Pressable key={clubId} style={styles.offerRow} onPress={() => acceptOffer(clubId)}>
                  <CrestCircle club={c} size={34} />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '700' }}>{c.name}</Body>
                    <Text style={styles.sub}>{t('fired.clubMeta', { league: l?.name ?? '', rep: c.reputation })}</Text>
                  </View>
                  <Text style={styles.offerAccept}>{t('fired.accept')}</Text>
                </Pressable>
              );
            })}
          </DashCard>
        ) : (
          <View>
            {/* CABEÇALHO DO CLUBE — cor do clube, posição, forma, objetivo */}
            <ClubHero
              club={club}
              leagueName={state.leagues[club.leagueId]?.name ?? ''}
              position={shownPosition}
              objective={t(OBJECTIVE_KEYS[career.objective])}
              form={shownResults}
              points={shownMyRow?.points ?? 0}
              gd={shownMyRow ? goalDifference(shownMyRow) : 0}
              t={t}
            />

            {/* CAIXA DE ENTRADA */}
            {inbox.length > 0 ? (
              <Spot id={TutorialTargets.inbox}>
              <DashCard title={t('dash.inbox', { n: inbox.length })} accent={theme.colors.blue}>
                {inbox.map((item) => {
                  // CONFERÊNCIA DE IMPRENSA — uma pergunta, três saídas. Não
                  // bloqueia o avanço (é oportunidade, não imposto), mas deixar
                  // caducar custa aos adeptos: o silêncio também é resposta.
                  if (item.kind === 'PRESS') {
                    return (
                      <View key={item.id} style={styles.pressBox}>
                        <Text style={styles.pressTitle}>🎙 {t('press.title')}</Text>
                        <Text style={styles.pressQuestion}>
                          {t(questionKey(item.topic), {
                            opp: item.opponentName ?? '',
                            player: item.playerName ?? '',
                          })}
                        </Text>
                        {PRESS_OPTIONS[item.topic].map((opt) => (
                          <Pressable
                            key={opt.tone}
                            style={styles.pressAnswer}
                            onPress={() => {
                              const r = answerPress(item.id, opt.tone);
                              setFeedback(r.messageKey
                                ? { kind: r.ok ? 'ok' : 'error', text: tMsg({ key: r.messageKey, params: r.messageParams }) }
                                : null);
                            }}
                          >
                            <Text style={styles.pressTone}>{t(`press.tone.${opt.tone}`)}</Text>
                            <Text style={styles.pressLine}>
                              {t(answerKey(item.topic, opt.tone), {
                                opp: item.opponentName ?? '',
                                player: item.playerName ?? '',
                              })}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    );
                  }

                  // CRISE FINANCEIRA — o dilema. Não fala de um jogador só: a
                  // direção põe candidatos em cima da mesa e QUEM decide é o
                  // treinador. Antes, a venda acontecia sozinha e levava o
                  // melhor do plantel sem uma palavra.
                  if (item.kind === 'CRISIS') {
                    return (
                      <View key={item.id} style={styles.crisisBox}>
                        <Text style={styles.crisisTitle}>⚠ {t('crisis.title')}</Text>
                        <Text style={styles.crisisMeta}>
                          {t('crisis.meta', { debt: money(item.debt) })}
                        </Text>
                        {item.candidates.map((cid) => {
                          const c = state.players[cid];
                          if (!c) return null;
                          const price = Math.round(c.marketValue * 0.7);
                          return (
                            <View key={cid} style={styles.crisisRow}>
                              <Face seed={c.id} size={30} shirt={club.primaryColor} />
                              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${c.id}`)}>
                                <Text style={styles.bidName} numberOfLines={1}>
                                  {c.firstName} {c.lastName} ›
                                </Text>
                                <Text style={styles.sub}>
                                  {c.positions[0]} · {c.age} · OVR {to100(naturalOverallFine(c))}
                                </Text>
                              </Pressable>
                              <MiniBtn
                                label={t('crisis.sellFor', { v: money(price) })}
                                bg={theme.colors.red}
                                onPress={() => {
                                  const r = resolveCrisis(item.id, cid);
                                  setFeedback(r.ok
                                    ? { kind: 'ok', text: t('crisis.toast', { name: r.playerName ?? '', v: money(r.amount) }) }
                                    : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                                }}
                              />
                            </View>
                          );
                        })}
                      </View>
                    );
                  }

                  const p = state.players[item.playerId];
                  if (!p) return null;
                  const name = `${p.firstName} ${p.lastName}`;

                  if (item.kind === 'BID') {
                    const buyer = state.clubs[item.fromClubId];
                    if (!buyer) return null;
                    return (
                      <InboxRow key={item.id} accent={theme.colors.green}
                        face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}
                        name={name} meta={t('inbox.bidMeta', { buyer: buyer.shortName, fee: money(item.fee) })}
                        onOpen={() => router.push(`/player/${p.id}`)}>
                        <MiniBtn label={t('btn.sell')} bg={theme.colors.green} onPress={() => {
                          const r = acceptBid(item.id);
                          // O ramo de ERRO faltava: quando a venda falhava (por
                          // exemplo, o comprador sem verba) não aparecia nada e o
                          // botão parecia estar avariado.
                          setFeedback(r.ok
                            ? { kind: 'ok', text: t('toast.sold', { name, fee: money(r.fee ?? item.fee) }) }
                            : { kind: 'error', text: r.error ?? t('player.sellFailed') });
                        }} />
                        {/* Pedir mais: os clubes atiravam propostas baixas e só dava
                            para aceitar ou recusar. Pede-se +30%; se for demais, desistem. */}
                        <MiniBtn label={t('bid.counter.button')} bg={theme.colors.yellow} ink="#20242A" onPress={() => {
                          const r = counterBid(item.id, Math.round(item.fee * 1.3));
                          setFeedback({ kind: r.ok ? 'ok' : 'info', text: tMsg({ key: r.messageKey, params: { ...r.messageParams, club: buyer.shortName } }) });
                        }} />
                        <MiniX onPress={() => rejectBid(item.id)} />
                      </InboxRow>
                    );
                  }

                  if (item.kind === 'RENEWAL') {
                    const asked = suggestedWage(p, state.meta.season);
                    return (
                      <InboxRow key={item.id} accent={theme.colors.yellow}
                        face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}
                        name={name} meta={t('inbox.renewalMeta', { wage: wage(asked) })}
                        onOpen={() => router.push(`/player/${p.id}`)}>
                        <MiniBtn label={t('btn.renew3')} bg={theme.colors.blue} onPress={() => {
                          const r = resolveRenewal(item.id, 3);
                          setFeedback(r.ok
                            ? { kind: 'ok', text: t('toast.renewed', { name, wage: wage(r.wage ?? asked) }) }
                            : r.error ? { kind: 'error', text: r.error } : null);
                        }} />
                        <MiniX onPress={() => dismissItem(item.id)} />
                      </InboxRow>
                    );
                  }

                  if (item.kind === 'OFFER') {
                    const border = item.status === 'COUNTER' ? theme.colors.yellow
                      : item.status === 'ACCEPTED' ? theme.colors.green
                      : item.status === 'REJECTED' ? theme.colors.red
                      : theme.colors.border;
                    return (
                      <InboxRow key={item.id} accent={border}
                        face={<Face seed={p.id} size={30} shirt={state.clubs[item.toClubId]?.primaryColor} />}
                        name={name}
                        meta={item.status === 'PENDING'
                          ? t('inbox.offerPending', { fee: money(item.fee) })
                          : item.reasonKey ? tMsg({ key: item.reasonKey, params: item.reasonParams }) : ''}
                        onOpen={() => router.push(`/player/${p.id}`)}>
                        {item.status === 'COUNTER' ? (
                          <MiniBtn label={t('btn.accept')} bg={theme.colors.yellow} ink="#20242A" onPress={() => {
                            const r = acceptCounter(item.id);
                            setFeedback(r.ok
                              ? { kind: 'ok', text: t('toast.signed', { name }) }
                              : r.errorKey ? { kind: 'error', text: t(r.errorKey, r.errorParams) } : null);
                          }} />
                        ) : null}
                        <MiniX onPress={() => withdrawOffer(item.id)} />
                      </InboxRow>
                    );
                  }

                  const label = t(item.request === 'WAGE_RISE' ? 'inbox.reqWage' : 'inbox.reqLeave');
                  return (
                    <InboxRow key={item.id} accent={theme.colors.red}
                      face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}
                      name={name} meta={t('inbox.reqMeta', { label, morale: p.condition.morale })}
                      onOpen={() => router.push(`/player/${p.id}`)}>
                      <MiniBtn label={t('btn.accept')} bg={theme.colors.green} onPress={() => { const m = resolveRequest(item.id, true); setFeedback(m ? { kind: 'info', text: tMsg(m) } : null); }} />
                      <MiniBtn label={t('btn.reject')} bg={theme.colors.surfaceAlt} onPress={() => { const m = resolveRequest(item.id, false); setFeedback(m ? { kind: 'info', text: tMsg(m) } : null); }} />
                    </InboxRow>
                  );
                })}
              </DashCard>
              </Spot>
            ) : null}

            {/* RESUMO DO FIM DE ÉPOCA */}
            {lastSeason ? (
              <DashCard title={t('season.card')} accent={theme.colors.yellow}>
                <Body style={{ fontWeight: '700' }}>
                  {t('season.summary', {
                    pos: `${lastSeason.record.position}º`,
                    league: lastSeason.record.leagueName,
                    msg: t(lastSeason.boardMessageKey),
                  })}
                </Body>
                {lastSeason.record.champion ? <Body style={{ color: theme.colors.yellow, marginTop: 2 }}>{t('season.champion')}</Body> : null}
                {lastSeason.youth.joinedManagedClub.length > 0 ? (
                  <Text style={styles.sub}>{t('season.youthUp', { n: lastSeason.youth.joinedManagedClub.length })}</Text>
                ) : null}
              </DashCard>
            ) : null}

            {/* ADEPTOS — a segunda avaliação do treinador. A direção olha para
                a tabela; a bancada olha para o que viu no sábado, e o que ela
                sente enche o estádio, pesa no jogo em casa e chega ao balneário. */}
            <DashCard title={t('fans.title')} accent={fansColor}>
              <View style={styles.fansRow}>
                <View style={{ flex: 1 }}>
                  <Bar value={fanState.mood} color={fansColor} height={8} />
                  <Text style={styles.fansBand}>{t(`fans.band.${fanState.band}`)}</Text>
                </View>
                <Text style={[styles.fansMood, { color: fansColor }]}>{fanState.mood}</Text>
              </View>
              {fanState.reasons.length > 0 ? (
                <>
                  <Text style={styles.sub}>{t('fans.why')}</Text>
                  {fanState.reasons.slice(0, 3).map((r, i) => (
                    <View key={`${r.key}_${i}`} style={styles.fansReason}>
                      <Text style={styles.fansReasonText} numberOfLines={1}>{tMsg({ key: r.key, params: r.params })}</Text>
                      <Text style={[styles.fansDelta, { color: r.delta > 0 ? theme.colors.green : theme.colors.red }]}>
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.sub}>{t('fans.none')}</Text>
              )}
              <Text style={styles.sub}>{t('fans.hint')}</Text>
            </DashCard>

            {/* PRÓXIMO JOGO — cartão-herói com os dois escudos */}
            <Spot id={TutorialTargets.nextMatch} style={styles.matchCard}>
              {/* NOITE EUROPEIA: nas semanas de Europa não se joga a liga, e o
                  cartão mostrava na mesma o próximo jogo do campeonato. O
                  utilizador preparava a equipa para a liga (rodava, aliviava a
                  pressão) e levava com um jogo europeu — "de repente puf,
                  afinal era Europa". */}
              {/* Três casos distintos, e antes eram todos o mesmo cartão:
                  1) noite europeia EM QUE JOGAS   → adversário europeu;
                  2) noite europeia sem ti         → pausa, e o cartão passa a
                     mostrar claramente o PRÓXIMO jogo do campeonato;
                  3) semana normal                 → jogo da liga. */}
              {euroNight ? (
                <View style={styles.euroBanner}>
                  <Text style={styles.euroBannerText}>
                    🏆 {euroMatch ? `${t('euro.night')} · ${t(`euro.name.${euroMatch.comp}`)}` : t('euro.pause')}
                  </Text>
                  <Text style={styles.euroBannerSub}>
                    {euroMatch ? t('euro.nightHint') : t('euro.pauseHint')}
                  </Text>
                </View>
              ) : null}
              {euroNight && euroMatch && euroOpp ? (
                <>
                  <Text style={styles.matchEyebrow}>
                    {euroMatch.superCup
                      ? t('euro.superCup.title')
                      : euroMatch.stage === 'LEAGUE'
                        ? `${t('euro.leaguePhase')} · ${t('euro.matchday', { n: euroMatch.matchday })}`
                        : t(`euro.stage.${euroMatch.stage}`)}
                    {` · ${t(euroMatch.isHome ? 'common.home' : 'common.away')}`}
                  </Text>
                  <View style={styles.versus}>
                    <View style={styles.vTeam}>
                      <CrestCircle club={euroMatch.isHome ? club : euroOpp} size={48} />
                      <Text style={styles.vName} numberOfLines={1}>{(euroMatch.isHome ? club : euroOpp).shortName}</Text>
                    </View>
                    <Text style={styles.vVs}>VS</Text>
                    <View style={styles.vTeam}>
                      <CrestCircle club={euroMatch.isHome ? euroOpp : club} size={48} />
                      <Text style={styles.vName} numberOfLines={1}>{(euroMatch.isHome ? euroOpp : club).shortName}</Text>
                    </View>
                  </View>
                  <View style={[styles.matchMetaRow, { justifyContent: 'center' }]}>
                    <Stars value={reputationStars(euroOpp.reputation)} />
                  </View>
                  <Pressable onPress={() => router.push(`/club/${euroOpp.id}` as never)} style={{ alignSelf: 'center' }}>
                    <Text style={styles.oppLink}>{t('match.scoutOpponent', { club: euroOpp.shortName })}</Text>
                  </Pressable>
                </>
              ) : next && nextOpp ? (
                <>
                  <Text style={styles.matchEyebrow}>
                    {euroNight ? t('euro.leagueNext') : t('match.gameOf', {
                      n: next.round,
                      total: schedule?.totalRounds ?? '?',
                      venue: t(isHome ? 'common.home' : 'common.away'),
                    })}
                  </Text>
                  {/* DÉRBI — a semana não é igual às outras, e vê-se logo aqui. */}
                  {pre?.derby && !euroNight ? (
                    <View style={styles.derbyTag}>
                      <Text style={styles.derbyText}>🔥 {t('derby.tag')}</Text>
                    </View>
                  ) : null}
                  <View style={styles.versus}>
                    <View style={styles.vTeam}>
                      <CrestCircle club={isHome ? club : nextOpp} size={48} />
                      <Text style={styles.vName} numberOfLines={1}>{(isHome ? club : nextOpp).shortName}</Text>
                    </View>
                    <Text style={styles.vVs}>VS</Text>
                    <View style={styles.vTeam}>
                      <CrestCircle club={isHome ? nextOpp : club} size={48} />
                      <Text style={styles.vName} numberOfLines={1}>{(isHome ? nextOpp : club).shortName}</Text>
                    </View>
                  </View>
                  <View style={[styles.matchMetaRow, { justifyContent: 'center' }]}>
                    <Stars value={reputationStars(nextOpp.reputation)} />
                    {pre?.opponent && pre.opponent.form.length > 0 ? (
                      <FormDots results={pre.opponent.form} />
                    ) : null}
                  </View>
                  {/* Espreitar o plantel do adversário antes de decidir a tática. */}
                  <Pressable onPress={() => router.push(`/club/${nextOpp.id}` as never)} style={{ alignSelf: 'center' }}>
                    <Text style={styles.oppLink}>{t('match.scoutOpponent', { club: nextOpp.shortName })}</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.matchTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchGame}>{t('match.seasonOver')}</Text>
                    <Text style={styles.matchOpp}>{t('match.newSeason')}</Text>
                  </View>
                </View>
              )}

              {oppStrength ? (
                <View style={{ marginTop: theme.spacing(1) }}>
                  <StrengthTriplet def={oppStrength.def} mid={oppStrength.mid} att={oppStrength.att} />
                </View>
              ) : null}

              {/* 3 luzes de verificação */}
              {pre && next ? (
                <View style={styles.checks}>
                  <Check
                    tone={pre.warnings.length > 0 ? 'warn' : 'ok'}
                    label={t('check.lineup')}
                    value={pre.warnings.length === 0
                      ? t('check.lineup.ready', { ovr: to100(pre.lineupOverall) })
                      : t('check.lineup.warn', {
                          name: pre.warnings[0]!.name,
                          state: pre.warnings[0]!.injured ? t('check.state.injured') : t('check.state.fit', { fit: pre.warnings[0]!.fitness }),
                          extra: pre.warnings.length > 1 ? ` +${pre.warnings.length - 1}` : '',
                        })}
                    action={pre.warnings.length > 0 ? {
                      text: t('action.rotate'),
                      onPress: () => {
                        const r = rotate();
                        setFeedback(r.swapped > 0
                          ? { kind: 'ok', text: r.changes.join(' · ') }
                          : { kind: 'info', text: t('toast.noBench') });
                      },
                    } : undefined}
                  />
                  <Check
                    tone={pre.projectedGate >= pre.projectedCosts ? 'ok' : 'info'}
                    label={t('check.week')}
                    value={pre.isHome
                      ? t('check.week.home', { gate: money(pre.projectedGate), costs: money(-pre.projectedCosts) })
                      : t('check.week.away', { costs: money(-pre.projectedCosts) })}
                  />
                  {/* 4ª luz (Bosman): só nas últimas jornadas, prioridade baixa. */}
                  {pre.expiringStarters.length > 0 ? (
                    <Check
                      tone="warn"
                      label={t('check.contracts')}
                      value={t('check.contracts.val', { n: pre.expiringStarters.length, names: pre.expiringStarters.map((e) => e.name).join(', ') })}
                      action={{ text: t('action.renew'), onPress: () => router.push('/squad' as never) }}
                    />
                  ) : null}
                </View>
              ) : null}

              <Spot id={TutorialTargets.advance}>
                <PlayButton
                  label={busy ? t('btn.processing') : blocked ? t('btn.blocked') : next ? t('btn.play') : t('btn.newSeason')}
                  icon={!busy && !blocked && !!next}
                  disabled={!!blocked || busy}
                  onPress={onPressPlay}
                />
              </Spot>
              {blocked ? <Text style={styles.blockedNote}>{t('blocked.note', { reason: blockedNote })}</Text> : null}
            </Spot>

            {/* A MINHA EQUIPA */}
            {myStrength && myTactic ? (
              <DashCard title={t('card.myTeam')} onOpen={() => router.push('/tactics' as never)}
                right={<Text style={styles.formTiny}>{myTactic.formation}</Text>}>
                <View style={styles.energyRow}>
                  <Text style={styles.energyLabel}>{t('label.energyAvg')}</Text>
                  <View style={{ flex: 1 }}><Bar value={avgFit} color={fitnessColor(avgFit)} height={6} /></View>
                  <Text style={[styles.energyVal, { color: fitnessColor(avgFit) }]}>{avgFit}%</Text>
                </View>
                <StrengthTriplet def={myStrength.def} mid={myStrength.mid} att={myStrength.att} />
                {shownResults.length > 0 ? (
                  <View style={styles.teamForm}>
                    <Text style={styles.sub}>{t('label.form')}</Text>
                    <FormDots results={shownResults} />
                  </View>
                ) : null}
              </DashCard>
            ) : null}

            {/* TREINO + FINANÇAS lado a lado */}
            <View style={styles.twoCol}>
              <DashCard title={t('card.training')} style={styles.colCard} onOpen={() => router.push('/training' as never)}>
                <Stars value={club.facilities.training} />
                <Text style={styles.trainSub}>{t('training.level', { n: club.facilities.training })}</Text>
                <View style={styles.focusWrap}>
                  {FOCUSES.map((f) => (
                    <Pressable key={f} onPress={() => setFocus(f)} style={[styles.chip, focus === f && styles.chipActive]}>
                      <Text style={[styles.chipText, focus === f && styles.chipTextActive]}>{t(`focus.${f}`)}</Text>
                    </Pressable>
                  ))}
                </View>
              </DashCard>

              <DashCard title={t('card.board')} style={styles.colCard} onOpen={() => router.push('/club' as never)}>
                <Text style={styles.objective} numberOfLines={2}>{t(OBJECTIVE_KEYS[career.objective])}</Text>
                <Text style={styles.sub}>{t('label.confidence')}</Text>
                <Bar value={career.confidence}
                  color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red}
                  height={8} />
                <Text style={[styles.confBig, {
                  color: career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red,
                }]}>{career.confidence}%</Text>
              </DashCard>
            </View>

            {/* CALENDÁRIO */}
            {schedule5.length > 0 ? (
              <DashCard title={t('card.calendar')} onOpen={() => router.push('/league' as never)}>
                {schedule5.slice(0, 5).map((f) => {
                  const home = f.homeClubId === club.id;
                  const oppId = home ? f.awayClubId : f.homeClubId;
                  const opp = state.clubs[oppId];
                  if (!opp) return null;
                  return (
                    <Pressable key={f.id} style={styles.schedRow} onPress={() => router.push(`/club/${opp.id}` as never)}>
                      <Text style={styles.schedRound}>J{f.round}</Text>
                      <CrestCircle club={opp} size={22} />
                      <Text style={styles.schedName} numberOfLines={1}>{opp.name}</Text>
                      <Text style={[styles.schedVenue, { color: home ? theme.colors.green : theme.colors.textDim }]}>
                        {t(home ? 'common.home' : 'common.away')}
                      </Text>
                    </Pressable>
                  );
                })}
              </DashCard>
            ) : null}

            {/* CLASSIFICAÇÃO */}
            <DashCard title={t('card.standings')} onOpen={() => router.push('/league' as never)}>
              {mini.map((r) => {
                const pos = shownTable.indexOf(r) + 1;
                const me = r.clubId === club.id;
                const c = state.clubs[r.clubId];
                return (
                  <Pressable key={r.clubId} style={[styles.miniRow, me && styles.miniRowMe]}
                    onPress={() => router.push(`/club/${r.clubId}` as never)}>
                    <Text style={[styles.miniPos, me && styles.bold]}>{pos}</Text>
                    {c ? <CrestCircle club={c} size={20} /> : null}
                    <Text style={[styles.body, { flex: 1 }, me && styles.bold]} numberOfLines={1}>
                      {c?.name ?? r.clubId}
                    </Text>
                    <Text style={[styles.miniPts, me && styles.bold]}>{r.points}</Text>
                  </Pressable>
                );
              })}
            </DashCard>

            {/* FINANÇAS */}
            {/* UM saldo só, repartido em três destinos. Antes mostravam-se dois
                montes de dinheiro independentes (saldo e verba) sem relação
                visível — e eles chegavam mesmo a divergir. */}
            <DashCard title={t('card.finances')} onOpen={() => router.push('/club' as never)}>
              <RowKV k={t('fin.balance')} v={money(finance.balance)} vColor={finance.balance > 0 ? theme.colors.green : theme.colors.red} />
              <BalanceSplit fin={finance} />
              <RowKV k={t('fin.wages')} v={money(finance.expenses.wages)} vColor={theme.colors.red} />
              {isInsolvent(finance) ? (
                <Body style={{ color: theme.colors.red, fontWeight: '700', marginTop: 4 }}>
                  {t('fin.insolvent')}
                </Body>
              ) : cashWarning(finance) ? (
                <Body style={{ color: theme.colors.yellow, fontWeight: '700', marginTop: 4 }}>
                  {t('fin.runway.short', { n: RUNWAY_WARNING_WEEKS })}
                </Body>
              ) : null}
            </DashCard>

            {/* NOTÍCIAS */}
            {state.news.length > 0 ? (
              <DashCard title={t('card.news')}>
                {state.news.slice(0, 6).map((n) => (
                  <View key={n.id} style={styles.newsRow}>
                    <Text style={styles.newsDate}>{n.date.slice(5)}</Text>
                    <Text style={styles.newsTitle} numberOfLines={2}>{tMsg(n)}</Text>
                  </View>
                ))}
              </DashCard>
            ) : null}

            {/* BÓNUS */}
            {(dailyAvailable() || rewardedAvailable()) ? (
              <DashCard title={t('card.bonus')}>
                {dailyAvailable() ? (
                  <Pressable style={styles.bonusRow} onPress={() => {
                    const v = claimDaily();
                    if (v > 0) setFeedback({ kind: 'ok', text: t('bonus.dailyToast', { v: money(v), streak: state.career.loginStreak }) });
                  }}>
                    <Text style={styles.bonusText}>{t('bonus.daily', { d: state.career.loginStreak + 1 })}</Text>
                    <Text style={styles.bonusVal}>+{money(scaled(dailyBonusAmount(state.career.loginStreak + 1)))}</Text>
                  </Pressable>
                ) : null}
                {rewardedAvailable() ? (
                  <>
                    <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                      setBusy(true);
                      if (await showRewarded()) { const m = claimReward(AdReward.SPONSOR_BONUS); if (m) setFeedback({ kind: 'ok', text: tMsg(m) }); }
                      setBusy(false);
                    }}>
                      <Text style={styles.bonusText}>{t('bonus.sponsor')}</Text>
                      <Text style={styles.bonusVal}>+{money(scaled(250_000))}</Text>
                    </Pressable>
                    <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                      setBusy(true);
                      if (await showRewarded()) { const m = claimReward(AdReward.FITNESS_BOOST); if (m) setFeedback({ kind: 'ok', text: tMsg(m) }); }
                      setBusy(false);
                    }}>
                      <Text style={styles.bonusText}>{t('bonus.fitness')}</Text>
                      <Text style={styles.bonusVal}>+20 fit</Text>
                    </Pressable>
                  </>
                ) : null}
              </DashCard>
            ) : null}
          </View>
        )}
        <AdBanner />
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>

      <PreMatchSheet
        visible={askRotate}
        warnings={pre?.warnings ?? []}
        onRotate={async () => {
          const r = rotate();
          setAskRotate(false);
          setFeedback(r.swapped > 0
            ? { kind: 'ok', text: r.changes.join(' · ') }
            : { kind: 'info', text: t('toast.noBench') });
          await runMatch();
        }}
        onPlayAnyway={async () => { setAskRotate(false); await runMatch(); }}
        onCancel={() => { setAskRotate(false); router.push('/tactics' as never); }}
      />

      <WeekReportModal
        report={focused && !launching ? pendingReport : null}
        clubName={club.shortName}
        onClose={clearReport}
      />

      {/* DECISÕES DE FIM DE CONTRATO — renovar ou libertar (bloqueia até decidir) */}
      <ContractDecisionsModal
        players={focused ? expiringDecisions() : []}
        season={state.meta.season}
        onRenew={renewExpiring}
        onRelease={releaseExpiring}
      />

      {/* VÃO REFORMAR-SE — aviso no fim de época (informativo) */}
      <RetiringModal
        players={focused && ackRetiring !== state.meta.season ? retiringSoon() : []}
        onClose={() => setAckRetiring(state.meta.season)}
      />

      {/* REFORMARAM-SE — no arranque da nova época */}
      <RetiredModal
        names={focused && lastSeason && ackRetired !== lastSeason.record.season
          ? lastSeason.youth.retiredManaged : []}
        onClose={() => lastSeason && setAckRetired(lastSeason.record.season)}
      />

      {/* FIM DE EMPRÉSTIMO — comprar o passe do jogador que regressou ao dono */}
      <ReturnedLoansModal
        loans={focused ? returnedLoansPending() : []}
        onBuy={(id, price, name) => {
          const r = buyReturnedLoan(id, price);
          setFeedback(r.ok
            ? { kind: 'ok', text: t('loan.buy.toast', { name }) }
            : { kind: 'error', text: r.errorKey ? t(r.errorKey) : t('loan.buy.err', { name }) });
        }}
        onSkip={dismissReturnedLoan}
      />

      {/* OFERTA POR MÉRITO — clube maior quer o treinador (opcional) */}
      <MeritOfferModal
        offers={focused && !fired ? meritOffers() : []}
        clubs={state.clubs}
        leagues={state.leagues}
        onAccept={(id) => { acceptMerit(id); router.replace('/' as never); }}
        onDecline={declineMerit}
      />
    </Screen>
  );
}

/** Uma linha da caixa de entrada, com fio de cor à esquerda. */
/**
 * Linha da caixa de entrada. A zona do retrato + nome abre a FICHA do jogador
 * (`onOpen`) — sem isso, decidir sobre uma proposta obrigava a ir procurar o
 * jogador ao plantel para ver quem era.
 */
function InboxRow({ accent, face, name, meta, onOpen, children }: {
  accent: string; face: React.ReactNode; name: string; meta: string;
  onOpen?: () => void; children: React.ReactNode;
}) {
  const body = (
    <>
      {face}
      <View style={{ flex: 1 }}>
        <Text style={styles.bidName} numberOfLines={1}>{name}{onOpen ? ' ›' : ''}</Text>
        <Text style={styles.sub} numberOfLines={2}>{meta}</Text>
      </View>
    </>
  );
  return (
    <View style={[styles.inboxRow, { borderLeftColor: accent }]}>
      {onOpen
        ? <Pressable style={styles.inboxTap} onPress={onOpen}>{body}</Pressable>
        : <View style={styles.inboxTap}>{body}</View>}
      {children}
    </View>
  );
}

function MiniBtn({ label, bg, ink = '#fff', onPress }: { label: string; bg: string; ink?: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.miniBtn, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={[styles.miniBtnText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

function MiniX({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.miniX} onPress={onPress} hitSlop={6}>
      <Text style={styles.miniXText}>✕</Text>
    </Pressable>
  );
}

/** Luz de verificação do cartão de jogo. */
function Check({
  tone, label, value, action,
}: {
  tone: 'ok' | 'warn' | 'info';
  label: string;
  value: string;
  action?: { text: string; onPress: () => void };
}) {
  const color = tone === 'ok' ? theme.colors.green : tone === 'warn' ? theme.colors.yellow : theme.colors.blue;
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, { backgroundColor: color }]} />
      <Text style={styles.checkLabel}>{label}</Text>
      <Text style={styles.checkValue} numberOfLines={1}>{value}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.checkAction}>{action.text}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Cabeçalho do painel — faixa com a COR DO CLUBE (degradé simulado), escudo,
 * nome, divisão + objetivo, medalha da posição, pills de forma e 3 tiles de
 * estatística (classificação, pontos, diferença de golos). É a "cara" de cada
 * carreira: a cor muda com o clube gerido.
 */
function ClubHero({
  club, leagueName, position, objective, form, points, gd, t,
}: {
  club: Club; leagueName: string; position: number; objective: string;
  form: ('W' | 'D' | 'L')[]; points: number; gd: number;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const base = club.primaryColor;
  const ink = contrastOn(base);
  const onDim = ink === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(20,23,28,0.72)';
  const badgeBg = ink === '#FFFFFF' ? 'rgba(0,0,0,0.26)' : 'rgba(255,255,255,0.30)';
  const gdText = gd > 0 ? `+${gd}` : `${gd}`;
  return (
    <View style={styles.heroWrap}>
      <View style={[styles.hero, { backgroundColor: base }]}>
        {/* degradé simulado: faixa escurecida em baixo + brilho em cima */}
        <View style={[styles.heroShade, { backgroundColor: darken(base, 0.55) }]} />
        <View style={styles.heroGlow} />
        <View style={styles.heroRow}>
          <CrestCircle club={club} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: ink }]} numberOfLines={1}>{club.name}</Text>
            <Text style={[styles.heroSub, { color: onDim }]} numberOfLines={1}>
              {leagueName}{objective ? ` · ${objective}` : ''}
            </Text>
          </View>
          <View style={[styles.posBadge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.posNum, { color: ink }]}>{position || '—'}º</Text>
            <Text style={[styles.posLbl, { color: onDim }]}>{t('dash.pos.label')}</Text>
          </View>
        </View>
        {form.length > 0 ? (
          <View style={styles.formRowHero}>
            <Text style={[styles.formLbl, { color: onDim }]}>{t('label.form')}</Text>
            {form.map((r, i) => (
              <View key={i} style={[
                styles.fpill,
                r === 'W' ? styles.fpillW : r === 'L' ? styles.fpillL : styles.fpillD,
              ]}>
                <Text style={[
                  styles.fpillTx,
                  { color: r === 'W' ? '#5FE08A' : r === 'L' ? '#FF8F88' : '#EEF1F4' },
                ]}>{t(`form.${r}`)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {/* tiles de estatística (encaixam por baixo do herói) */}
      <View style={styles.tiles}>
        <StatTile v={position ? `${position}º` : '—'} k={t('dash.tile.pos')} color={theme.colors.green} />
        <StatTile v={String(points)} k={t('dash.tile.pts')} />
        <StatTile v={gdText} k={t('dash.tile.gd')} color={gd >= 0 ? theme.colors.green : theme.colors.red} />
      </View>
    </View>
  );
}

function StatTile({ v, k, color }: { v: string; k: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileV, color ? { color } : null]}>{v}</Text>
      <Text style={styles.tileK}>{k}</Text>
    </View>
  );
}

/** Botão de ação principal do painel: verde vivo com sombra e ícone ▶. */
function PlayButton({
  label, icon, disabled, onPress,
}: { label: string; icon: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.playBtn, disabled && styles.playBtnOff, pressed && styles.playBtnPressed]}
    >
      <Text style={[styles.playBtnText, disabled && styles.playBtnTextOff]}>{icon ? '▶  ' : ''}{label}</Text>
    </Pressable>
  );
}

/** Modal bloqueante de fim de época: renovar ou libertar cada jogador em fim de contrato. */
function ContractDecisionsModal({
  players, onRenew, onRelease,
}: { players: Player[]; season: number; onRenew: (id: string) => void; onRelease: (id: string) => void }) {
  const t = useT();
  if (players.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.cdBackdrop}>
        <View style={styles.cdCard}>
          <Text style={styles.cdTitle}>{t('contracts.title')}</Text>
          <Text style={styles.cdSub}>{t('contracts.sub')}</Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {players.map((p) => (
              <View key={p.id} style={styles.cdRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cdName} numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                  <Text style={styles.sub}>{p.positions[0]} · OVR {to100(naturalOverallFine(p))} · {p.age}</Text>
                </View>
                <MiniBtn label={t('contracts.renew')} bg={theme.colors.green} onPress={() => onRenew(p.id)} />
                <MiniBtn label={t('contracts.release')} bg={theme.colors.surfaceAlt} onPress={() => onRelease(p.id)} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Modal de fim de empréstimo: para cada jogador que regressou, comprar ou deixar ir. */
function ReturnedLoansModal({
  loans, onBuy, onSkip,
}: {
  loans: ReturnedLoan[];
  onBuy: (id: string, price: number, name: string) => void;
  onSkip: (id: string) => void;
}) {
  const t = useT();
  if (loans.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.cdBackdrop}>
        <View style={styles.cdCard}>
          <Text style={styles.cdTitle}>{t('loan.buy.title')}</Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {loans.map((l) => (
              <View key={l.playerId} style={styles.cdRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cdName} numberOfLines={2}>
                    {t('loan.buy.body', { name: l.playerName, club: l.ownerName, price: money(l.price) })}
                  </Text>
                </View>
                <MiniBtn label={t('loan.buy.button', { price: money(l.price) })} bg={theme.colors.green}
                  onPress={() => onBuy(l.playerId, l.price, l.playerName)} />
                <MiniBtn label={t('loan.buy.skip')} bg={theme.colors.surfaceAlt}
                  onPress={() => onSkip(l.playerId)} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Oferta por MÉRITO: um clube maior quer o treinador. Aceitar muda de clube. */
function MeritOfferModal({
  offers, clubs, leagues, onAccept, onDecline,
}: {
  offers: string[];
  clubs: GameState['clubs'];
  leagues: GameState['leagues'];
  onAccept: (id: string) => void;
  onDecline: () => void;
}) {
  const t = useT();
  if (offers.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.cdBackdrop}>
        <View style={[styles.cdCard, { borderColor: theme.colors.blue }]}>
          <Text style={[styles.cdTitle, { color: theme.colors.blue }]}>📈 {t('merit.title')}</Text>
          <Text style={styles.cdSub}>{t('merit.sub')}</Text>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {offers.map((id) => {
              const c = clubs[id];
              if (!c) return null;
              const lg = leagues[c.leagueId];
              return (
                <View key={id} style={styles.cdRow}>
                  <CrestCircle club={c} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cdName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.sub}>{t('merit.clubMeta', { league: lg?.name ?? '', rep: c.reputation })}</Text>
                  </View>
                  <MiniBtn label={t('merit.accept')} bg={theme.colors.green} onPress={() => onAccept(id)} />
                </View>
              );
            })}
          </ScrollView>
          <Pressable style={styles.meritStay} onPress={onDecline}>
            <Text style={styles.meritStayText}>{t('merit.stay')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Popup FIM DE ÉPOCA: jogadores que se vão reformar (informativo). */
function RetiringModal({ players, onClose }: { players: Player[]; onClose: () => void }) {
  const t = useT();
  if (players.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.cdBackdrop}>
        <View style={[styles.cdCard, { borderColor: theme.colors.blue }]}>
          <Text style={[styles.cdTitle, { color: theme.colors.blue }]}>👋 {t('retire.soon.title')}</Text>
          <Text style={styles.cdSub}>{t('retire.soon.sub')}</Text>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {players.map((p) => (
              <View key={p.id} style={styles.cdRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cdName} numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                  <Text style={styles.sub}>{p.positions[0]} · {t('retire.age', { age: p.age })} · OVR {to100(naturalOverallFine(p))}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={[styles.dlgBtn, { backgroundColor: theme.colors.blue }]} onPress={onClose}>
            <Text style={styles.dlgBtnText}>{t('common.ok')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Popup ARRANQUE DA ÉPOCA: jogadores que se reformaram na época anterior. */
function RetiredModal({ names, onClose }: { names: string[]; onClose: () => void }) {
  const t = useT();
  if (names.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.cdBackdrop}>
        <View style={styles.cdCard}>
          <Text style={styles.cdTitle}>🎖️ {t('retire.done.title')}</Text>
          <Text style={styles.cdSub}>{t('retire.done.sub')}</Text>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {names.map((n, i) => (
              <View key={i} style={styles.cdRow}>
                <Text style={styles.cdName} numberOfLines={1}>🎖️  {n}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable style={[styles.dlgBtn, { backgroundColor: theme.colors.yellow }]} onPress={onClose}>
            <Text style={[styles.dlgBtnText, { color: '#20242A' }]}>{t('common.ok')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: theme.font.body },
  dlgBtn: { marginTop: theme.spacing(1.25), paddingVertical: theme.spacing(1.2), borderRadius: theme.radius.sm, alignItems: 'center' },
  meritStay: { marginTop: theme.spacing(1), paddingVertical: theme.spacing(1), alignItems: 'center' },
  meritStayText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '700' },
  dlgBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },

  // ---- Cabeçalho do clube (hero) ----
  heroWrap: { marginBottom: theme.spacing(1.25) },
  hero: {
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), overflow: 'hidden',
    // levanta os tiles: cantos de baixo retos para encaixarem por baixo
    borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  heroShade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', opacity: 0.5,
  },
  heroGlow: {
    position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25) },
  heroName: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  posBadge: { alignItems: 'center', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 11, minWidth: 46 },
  posNum: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 22 },
  posLbl: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 },
  formRowHero: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing(1.25) },
  formLbl: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginRight: 2 },
  fpill: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  fpillW: { backgroundColor: 'rgba(18,53,31,0.85)', borderWidth: 1.5, borderColor: '#37C25A' },
  fpillD: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  fpillL: { backgroundColor: 'rgba(58,21,18,0.85)', borderWidth: 1.5, borderColor: '#F85149' },
  fpillTx: { fontSize: 11, fontWeight: '900' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tile: {
    flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, paddingVertical: 9, alignItems: 'center',
  },
  tileV: { color: theme.colors.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileK: { color: theme.colors.textDim, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },

  // ---- Cartão-herói do próximo jogo ----
  crisisBox: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    borderLeftWidth: 3, borderLeftColor: theme.colors.red,
    padding: theme.spacing(1), marginBottom: theme.spacing(0.75), gap: theme.spacing(0.75),
  },
  crisisTitle: { color: theme.colors.red, fontSize: theme.font.body, fontWeight: '900' },
  crisisMeta: { color: theme.colors.textDim, fontSize: theme.font.small },
  crisisRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap',
  },

  // ---- Conferência de imprensa ----
  pressBox: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    borderLeftWidth: 3, borderLeftColor: theme.colors.accent,
    padding: theme.spacing(1), marginBottom: theme.spacing(0.75), gap: theme.spacing(0.75),
  },
  pressTitle: {
    color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '900',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  pressQuestion: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  pressAnswer: {
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(0.85), paddingHorizontal: theme.spacing(1), gap: 2,
  },
  pressTone: {
    color: theme.colors.blue, fontSize: 10, fontWeight: '900',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  pressLine: { color: theme.colors.text, fontSize: theme.font.small },

  // ---- Barra dos adeptos ----
  fansRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  fansMood: {
    color: theme.colors.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'],
    minWidth: 42, textAlign: 'right',
  },
  fansBand: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800' },
  fansReason: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(0.75) },
  fansReasonText: { color: theme.colors.textDim, fontSize: theme.font.small, flex: 1 },
  fansDelta: { fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'] },

  euroBanner: {
    alignSelf: 'stretch', alignItems: 'center', gap: 2,
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.accent,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
  },
  euroBannerText: { color: theme.colors.accent, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  euroBannerSub: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },

  matchEyebrow: {
    color: theme.colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', textAlign: 'center', marginBottom: theme.spacing(1),
  },
  derbyTag: {
    alignSelf: 'center', borderWidth: 1, borderColor: theme.colors.red,
    backgroundColor: 'rgba(220,60,60,0.12)', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: theme.spacing(1),
  },
  derbyText: { color: theme.colors.red, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },

  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(1.5), marginBottom: theme.spacing(0.75) },
  vTeam: { flex: 1, alignItems: 'center', gap: 6 },
  vName: { color: theme.colors.text, fontSize: 12, fontWeight: '700', maxWidth: 110, textAlign: 'center' },
  vVs: { color: theme.colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  playBtn: {
    marginTop: theme.spacing(1.25), paddingVertical: theme.spacing(1.4), borderRadius: 12,
    backgroundColor: theme.colors.green, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.green, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  playBtnOff: { backgroundColor: theme.colors.surfaceAlt, shadowOpacity: 0, elevation: 0 },
  playBtnPressed: { opacity: 0.85 },
  playBtnText: { color: '#04170c', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  playBtnTextOff: { color: theme.colors.textDim },
  cdBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: theme.spacing(2) },
  cdCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.yellow, padding: theme.spacing(1.75) },
  cdTitle: { color: theme.colors.yellow, fontSize: theme.font.h2, fontWeight: '900' },
  cdSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2, marginBottom: theme.spacing(1) },
  cdRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(0.75), paddingVertical: theme.spacing(0.9), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  cdName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  diag: {
    color: theme.colors.yellow, fontSize: 10, fontWeight: '700', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', paddingVertical: 2, marginBottom: 4, borderRadius: 4,
  },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  bold: { fontWeight: '700' },

  // Cartão de próximo jogo (destaque, cor primária no fio)
  matchCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1.25), gap: theme.spacing(1.25),
  },
  matchTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  matchGame: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  matchOpp: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '800', marginTop: 1 },
  matchMetaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), marginTop: 4 },

  checks: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.25),
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.85) },
  checkDot: { width: 7, height: 7, borderRadius: 4 },
  checkLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', width: 46 },
  checkValue: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  checkAction: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },
  blockedNote: { color: theme.colors.yellow, fontSize: theme.font.small, textAlign: 'center' },

  // Caixa de entrada
  inboxRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    borderLeftWidth: 3, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(1),
    marginBottom: theme.spacing(0.75),
    // Em ecrãs estreitos os botões ("Vender" + "Pedir mais" + ✕) não cabiam na
    // mesma linha do nome e saíam fora do cartão — ficava só o ✕ acessível.
    // Com wrap descem para uma segunda linha em vez de desaparecerem.
    flexWrap: 'wrap',
  },
  bidName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  inboxTap: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  oppLink: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(0.5) },
  miniBtn: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(0.85) },
  miniBtnText: { fontSize: theme.font.small, fontWeight: '700' },
  miniX: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1), paddingVertical: theme.spacing(0.85) },
  miniXText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

  // A minha equipa
  formTiny: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  energyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginBottom: theme.spacing(1) },
  energyLabel: { color: theme.colors.textDim, fontSize: theme.font.small, width: 84 },
  energyVal: { fontSize: theme.font.small, fontWeight: '800', width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  teamForm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(1) },

  // Duas colunas
  twoCol: { flexDirection: 'row', gap: theme.spacing(1.25) },
  colCard: { flex: 1 },
  trainSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 4, marginBottom: theme.spacing(1) },
  focusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  objective: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginBottom: theme.spacing(1), minHeight: 30 },
  confBig: { fontSize: theme.font.h2, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },

  chip: {
    paddingHorizontal: theme.spacing(1), paddingVertical: theme.spacing(0.6), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg,
  },
  chipActive: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  chipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  chipTextActive: { color: theme.colors.blue },

  // Calendário
  schedRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  schedRound: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', width: 26 },
  schedName: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  schedVenue: { fontSize: theme.font.small, fontWeight: '700' },

  // Classificação mini
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.6), paddingHorizontal: theme.spacing(0.5) },
  miniRowMe: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm },
  miniPos: { color: theme.colors.textDim, fontSize: theme.font.body, width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  miniPts: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },

  // Notícias
  newsRow: {
    flexDirection: 'row', gap: theme.spacing(1), alignItems: 'flex-start',
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  newsDate: { color: theme.colors.textDim, fontSize: theme.font.small, width: 38, fontVariant: ['tabular-nums'] },
  newsTitle: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },

  // Bónus
  bonusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    padding: theme.spacing(1.1), marginBottom: theme.spacing(0.75),
  },
  bonusText: { color: theme.colors.text, fontSize: theme.font.body },
  bonusVal: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '700' },

  // Ofertas de emprego
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25), paddingVertical: theme.spacing(1) },
  offerAccept: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '700' },
});
