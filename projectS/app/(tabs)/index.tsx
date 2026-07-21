import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { useMonetizationStore } from '../../src/state/monetizationStore';
import { AdReward } from '../../src/monetization';
import { OBJECTIVE_KEYS, dailyBonusAmount } from '../../src/core/career';
import { computeTeamStrength } from '../../src/core/engine';
import { TrainingFocus } from '../../src/core/training';
import { money, wage } from '../../src/ui/format';
import { isInsolvent, suggestedWage, wageBudgetRemaining } from '../../src/core/economy';
import { useT, useTMsg } from '../../src/ui/i18n';
import { fitnessColor, reputationStars, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { PreMatchSheet, WeekReportModal } from '../../src/ui/dialogs';
import {
  Bar, Body, Button, CrestCircle, DashCard, FormDots, RowKV, Screen, Stars, StrengthTriplet,
} from '../components';
import { showInterstitial, showRewarded } from '../../src/native/ads';
import AdBanner from '../../src/native/AdBanner';
import Onboarding from '../onboarding';

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
  const lastSeason = useGameStore((s) => s.lastSeason);
  const claimDaily = useGameStore((s) => s.claimDaily);
  const dailyAvailable = useGameStore((s) => s.dailyAvailable);
  const blockedCounts = useGameStore((s) => s.blockedCounts);
  const preview = useGameStore((s) => s.preview);
  const rotate = useGameStore((s) => s.rotate);
  const pendingReport = useGameStore((s) => s.pendingReport);
  const clearReport = useGameStore((s) => s.clearReport);

  const inboxItems = useGameStore((s) => s.inboxItems);
  const acceptBid = useGameStore((s) => s.acceptBid);
  const rejectBid = useGameStore((s) => s.rejectBid);
  const resolveRenewal = useGameStore((s) => s.resolveRenewal);
  const resolveRequest = useGameStore((s) => s.resolveRequest);
  const dismissItem = useGameStore((s) => s.dismissItem);
  const acceptCounter = useGameStore((s) => s.acceptCounter);
  const withdrawOffer = useGameStore((s) => s.withdrawOffer);

  const onAdvanceAd = useMonetizationStore((s) => s.onAdvance);
  const rewardedAvailable = useMonetizationStore((s) => s.rewardedAvailable);
  const claimReward = useMonetizationStore((s) => s.claimReward);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRotate, setAskRotate] = useState(false);

  // O ecrã inicial fica montado por baixo de /match, e um Modal do RN aparece
  // por cima de TUDO — sem este guarda o balanço tapava o jogo ao vivo.
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
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
        bc.bids ? t('block.bids', { n: bc.bids }) : null,
        bc.reqs ? t('block.reqs', { n: bc.reqs }) : null,
        bc.counters ? t('block.counters', { n: bc.counters }) : null,
      ].filter(Boolean).join(t('common.and'))
    : '';
  const pre = preview();

  /** Avança a jornada e abre o jogo. Separado para o micro-stop poder reutilizá-lo. */
  const runMatch = async () => {
    const r = advance();
    if (onAdvanceAd()) await showInterstitial();
    if (next && r) router.push('/match');
  };

  const onPressPlay = async () => {
    if (pre && pre.warnings.length > 0) { setAskRotate(true); return; }
    await runMatch();
  };

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
  if (state.meta.managerName === '') return <Onboarding />;

  const finance = state.finances[club.id]!;
  const career = state.career;
  const schedule = state.schedules[managedLeague()];
  const nextOppId = next ? (next.homeClubId === club.id ? next.awayClubId : next.homeClubId) : null;
  const nextOpp = nextOppId ? state.clubs[nextOppId] : null;
  const isHome = next?.homeClubId === club.id;
  const fired = career.pendingOffers.length > 0;

  // Força por zona (escala ~0..100 para ler como nos jogos de referência).
  const strengthOf = (clubId: string) => {
    const t = state.tactics[clubId];
    if (!t) return null;
    const s = computeTeamStrength(t, state.players);
    return { def: Math.round(s.defence * 5), mid: Math.round(s.midfield * 5), att: Math.round(s.attack * 5) };
  };
  const myStrength = strengthOf(club.id);
  const oppStrength = nextOppId ? strengthOf(nextOppId) : null;

  const squad = club.squad.map((id) => state.players[id]).filter(Boolean);
  const avgFit = squad.length
    ? Math.round(squad.reduce((s, p) => s + p!.condition.fitness, 0) / squad.length)
    : 0;

  const myTactic = state.tactics[club.id];

  // Mini-classificação: 5 linhas à volta do clube.
  const miniStart = Math.max(0, Math.min(position - 3, table.length - 5));
  const mini = table.slice(miniStart, miniStart + 5);

  const inbox = inboxItems();

  return (
    <Screen>
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
            {msg ? <Text style={styles.toast}>{msg}</Text> : null}

            {/* CAIXA DE ENTRADA */}
            {inbox.length > 0 ? (
              <DashCard title={t('dash.inbox', { n: inbox.length })} accent={theme.colors.blue}>
                {inbox.map((item) => {
                  const p = state.players[item.playerId];
                  if (!p) return null;
                  const name = `${p.firstName} ${p.lastName}`;

                  if (item.kind === 'BID') {
                    const buyer = state.clubs[item.fromClubId];
                    if (!buyer) return null;
                    return (
                      <InboxRow key={item.id} accent={theme.colors.green} face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bidName}>{name}</Text>
                          <Text style={styles.sub}>{t('inbox.bidMeta', { buyer: buyer.shortName, fee: money(item.fee) })}</Text>
                        </View>
                        <MiniBtn label={t('btn.sell')} bg={theme.colors.green} onPress={() => {
                          const r = acceptBid(item.id);
                          if (r.ok) setMsg(t('toast.sold', { name, fee: money(r.fee ?? item.fee) }));
                        }} />
                        <MiniX onPress={() => rejectBid(item.id)} />
                      </InboxRow>
                    );
                  }

                  if (item.kind === 'RENEWAL') {
                    const asked = suggestedWage(p, state.meta.season);
                    return (
                      <InboxRow key={item.id} accent={theme.colors.yellow} face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bidName}>{name}</Text>
                          <Text style={styles.sub}>{t('inbox.renewalMeta', { wage: wage(asked) })}</Text>
                        </View>
                        <MiniBtn label={t('btn.renew3')} bg={theme.colors.blue} onPress={() => {
                          const r = resolveRenewal(item.id, 3);
                          setMsg(r.ok ? t('toast.renewed', { name, wage: wage(r.wage ?? asked) }) : r.error ?? null);
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
                      <InboxRow key={item.id} accent={border} face={<Face seed={p.id} size={30} shirt={state.clubs[item.toClubId]?.primaryColor} />}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bidName}>{name}</Text>
                          <Text style={styles.sub}>{item.status === 'PENDING'
                            ? t('inbox.offerPending', { fee: money(item.fee) })
                            : item.reasonKey ? tMsg({ key: item.reasonKey, params: item.reasonParams }) : ''}</Text>
                        </View>
                        {item.status === 'COUNTER' ? (
                          <MiniBtn label={t('btn.accept')} bg={theme.colors.yellow} ink="#20242A" onPress={() => {
                            const r = acceptCounter(item.id);
                            setMsg(r.ok ? t('toast.signed', { name }) : r.errorKey ? t(r.errorKey, r.errorParams) : null);
                          }} />
                        ) : null}
                        <MiniX onPress={() => withdrawOffer(item.id)} />
                      </InboxRow>
                    );
                  }

                  const label = t(item.request === 'WAGE_RISE' ? 'inbox.reqWage' : 'inbox.reqLeave');
                  return (
                    <InboxRow key={item.id} accent={theme.colors.red} face={<Face seed={p.id} size={30} shirt={club.primaryColor} />}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bidName}>{name}</Text>
                        <Text style={styles.sub}>{t('inbox.reqMeta', { label, morale: p.condition.morale })}</Text>
                      </View>
                      <MiniBtn label={t('btn.accept')} bg={theme.colors.green} onPress={() => { const m = resolveRequest(item.id, true); setMsg(m ? tMsg(m) : null); }} />
                      <MiniBtn label={t('btn.reject')} bg={theme.colors.surfaceAlt} onPress={() => { const m = resolveRequest(item.id, false); setMsg(m ? tMsg(m) : null); }} />
                    </InboxRow>
                  );
                })}
              </DashCard>
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

            {/* PRÓXIMO JOGO */}
            <View style={styles.matchCard}>
              <View style={styles.matchTop}>
                {nextOpp ? <CrestCircle club={nextOpp} size={54} /> : <View style={{ width: 54 }} />}
                <View style={{ flex: 1 }}>
                  {next && nextOpp ? (
                    <>
                      <Text style={styles.matchGame}>
                        {t('match.gameOf', {
                          n: next.round,
                          total: schedule?.totalRounds ?? '?',
                          venue: t(isHome ? 'common.home' : 'common.away'),
                        })}
                      </Text>
                      <Text style={styles.matchOpp} numberOfLines={1}>{nextOpp.name}</Text>
                      <View style={styles.matchMetaRow}>
                        <Stars value={reputationStars(nextOpp.reputation)} />
                        {pre?.opponent && pre.opponent.form.length > 0 ? (
                          <FormDots results={pre.opponent.form} />
                        ) : null}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.matchGame}>{t('match.seasonOver')}</Text>
                      <Text style={styles.matchOpp}>{t('match.newSeason')}</Text>
                    </>
                  )}
                </View>
              </View>

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
                      ? t('check.lineup.ready', { ovr: pre.lineupOverall })
                      : t('check.lineup.warn', {
                          name: pre.warnings[0]!.name,
                          state: pre.warnings[0]!.injured ? t('check.state.injured') : t('check.state.fit', { fit: pre.warnings[0]!.fitness }),
                          extra: pre.warnings.length > 1 ? ` +${pre.warnings.length - 1}` : '',
                        })}
                    action={pre.warnings.length > 0 ? {
                      text: t('action.rotate'),
                      onPress: () => {
                        const r = rotate();
                        setMsg(r.swapped > 0 ? r.changes.join(' · ') : t('toast.noBench'));
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

              <Button
                label={blocked ? t('btn.blocked') : next ? t('btn.play') : t('btn.newSeason')}
                disabled={!!blocked}
                onPress={onPressPlay}
              />
              {blocked ? <Text style={styles.blockedNote}>{t('blocked.note', { reason: blockedNote })}</Text> : null}
            </View>

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
                {lastResults.length > 0 ? (
                  <View style={styles.teamForm}>
                    <Text style={styles.sub}>{t('label.form')}</Text>
                    <FormDots results={lastResults} />
                  </View>
                ) : null}
              </DashCard>
            ) : null}

            {/* TREINO + FINANÇAS lado a lado */}
            <View style={styles.twoCol}>
              <DashCard title={t('card.training')} style={styles.colCard}>
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
                    <View key={f.id} style={styles.schedRow}>
                      <Text style={styles.schedRound}>J{f.round}</Text>
                      <CrestCircle club={opp} size={22} />
                      <Text style={styles.schedName} numberOfLines={1}>{opp.name}</Text>
                      <Text style={[styles.schedVenue, { color: home ? theme.colors.green : theme.colors.textDim }]}>
                        {t(home ? 'common.home' : 'common.away')}
                      </Text>
                    </View>
                  );
                })}
              </DashCard>
            ) : null}

            {/* CLASSIFICAÇÃO */}
            <DashCard title={t('card.standings')} onOpen={() => router.push('/league' as never)}>
              {mini.map((r) => {
                const pos = table.indexOf(r) + 1;
                const me = r.clubId === club.id;
                const c = state.clubs[r.clubId];
                return (
                  <View key={r.clubId} style={[styles.miniRow, me && styles.miniRowMe]}>
                    <Text style={[styles.miniPos, me && styles.bold]}>{pos}</Text>
                    {c ? <CrestCircle club={c} size={20} /> : null}
                    <Text style={[styles.body, { flex: 1 }, me && styles.bold]} numberOfLines={1}>
                      {c?.name ?? r.clubId}
                    </Text>
                    <Text style={[styles.miniPts, me && styles.bold]}>{r.points}</Text>
                  </View>
                );
              })}
            </DashCard>

            {/* FINANÇAS */}
            <DashCard title={t('card.finances')} onOpen={() => router.push('/club' as never)}>
              <RowKV k={t('fin.balance')} v={money(finance.balance)} vColor={finance.balance >= 0 ? theme.colors.green : theme.colors.red} />
              <RowKV k={t('fin.transferBudget')} v={money(finance.transferBudget)} />
              <RowKV k={t('fin.wages')} v={money(finance.expenses.wages)} vColor={theme.colors.red} />
              <RowKV k={t('fin.wageMargin')}
                v={t('fin.wageMarginVal', { remaining: money(wageBudgetRemaining(finance)), cap: money(finance.wageBudget) })}
                vColor={wageBudgetRemaining(finance) > 0 ? theme.colors.green : theme.colors.red} />
              {isInsolvent(finance) ? (
                <Body style={{ color: theme.colors.red, fontWeight: '700', marginTop: 4 }}>
                  {t('fin.insolvent')}
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
                    if (v > 0) setMsg(t('bonus.dailyToast', { v: money(v), streak: state.career.loginStreak }));
                  }}>
                    <Text style={styles.bonusText}>{t('bonus.daily', { d: state.career.loginStreak + 1 })}</Text>
                    <Text style={styles.bonusVal}>+{money(dailyBonusAmount(state.career.loginStreak + 1))}</Text>
                  </Pressable>
                ) : null}
                {rewardedAvailable() ? (
                  <>
                    <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                      setBusy(true);
                      if (await showRewarded()) { const m = claimReward(AdReward.SPONSOR_BONUS); if (m) setMsg(tMsg(m)); }
                      setBusy(false);
                    }}>
                      <Text style={styles.bonusText}>{t('bonus.sponsor')}</Text>
                      <Text style={styles.bonusVal}>+250k €</Text>
                    </Pressable>
                    <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                      setBusy(true);
                      if (await showRewarded()) { const m = claimReward(AdReward.FITNESS_BOOST); if (m) setMsg(tMsg(m)); }
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
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
      <AdBanner />

      <PreMatchSheet
        visible={askRotate}
        warnings={pre?.warnings ?? []}
        onRotate={async () => {
          const r = rotate();
          setAskRotate(false);
          setMsg(r.swapped > 0 ? r.changes.join(' · ') : 'Sem alternativas frescas no banco.');
          await runMatch();
        }}
        onPlayAnyway={async () => { setAskRotate(false); await runMatch(); }}
        onCancel={() => { setAskRotate(false); router.push('/tactics' as never); }}
      />

      <WeekReportModal
        report={focused ? pendingReport : null}
        clubName={club.shortName}
        onClose={clearReport}
      />
    </Screen>
  );
}

/** Uma linha da caixa de entrada, com fio de cor à esquerda. */
function InboxRow({ accent, face, children }: { accent: string; face: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[styles.inboxRow, { borderLeftColor: accent }]}>
      {face}
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

const styles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: theme.font.body },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  bold: { fontWeight: '700' },
  toast: {
    color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm,
    borderLeftWidth: 3, borderLeftColor: theme.colors.green,
    padding: theme.spacing(1), marginBottom: theme.spacing(1),
  },

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
  },
  bidName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
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
