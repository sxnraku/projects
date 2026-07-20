import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { useMonetizationStore } from '../../src/state/monetizationStore';
import { AdReward } from '../../src/monetization';
import { OBJECTIVE_LABELS, dailyBonusAmount } from '../../src/core/career';
import { TrainingFocus } from '../../src/core/training';
import { money, wage } from '../../src/ui/format';
import { isInsolvent, suggestedWage, wageBudgetRemaining } from '../../src/core/economy';
import { theme } from '../../src/ui/theme';
import { Bar, Body, Button, FormDots, RowKV, Screen, Section } from '../components';
import { showInterstitial, showRewarded } from '../../src/native/ads';
import AdBanner from '../../src/native/AdBanner';
import Onboarding from '../onboarding';

const FOCUS_LABELS: Record<TrainingFocus, string> = {
  PHYSICAL: 'Físico', TECHNICAL: 'Técnico', TACTICAL: 'Tático', RECOVERY: 'Recup.',
};

export default function Dashboard() {
  const router = useRouter();
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

  const inboxItems = useGameStore((s) => s.inboxItems);
  const acceptBid = useGameStore((s) => s.acceptBid);
  const rejectBid = useGameStore((s) => s.rejectBid);
  const resolveRenewal = useGameStore((s) => s.resolveRenewal);
  const resolveRequest = useGameStore((s) => s.resolveRequest);
  const dismissItem = useGameStore((s) => s.dismissItem);

  const onAdvanceAd = useMonetizationStore((s) => s.onAdvance);
  const rewardedAvailable = useMonetizationStore((s) => s.rewardedAvailable);
  const claimReward = useMonetizationStore((s) => s.claimReward);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const club = managedClub();
  const table = standings();
  const next = upcoming(1)[0];

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
        const oppId = isHome ? f.awayClubId : f.homeClubId;
        return {
          outcome: (mine > theirs ? 'W' : mine === theirs ? 'D' : 'L') as 'W' | 'D' | 'L',
          score: `${mine}-${theirs}`,
          opp: state.clubs[oppId]?.shortName ?? '',
          venue: isHome ? 'C' : 'F',
        };
      })
      .reverse();
  }, [state, club, managedLeague]);

  if (!state || !club) return <Screen><Body>A carregar…</Body></Screen>;

  // Primeira execução: escolher nome e clube antes de tudo.
  if (state.meta.managerName === '') return <Onboarding />;

  const finance = state.finances[club.id]!;
  const career = state.career;
  const leagueSize = state.leagues[managedLeague()]?.clubIds.length ?? 0;
  const nextOppId = next ? (next.homeClubId === club.id ? next.awayClubId : next.homeClubId) : null;
  const nextOpp = nextOppId ? state.clubs[nextOppId] : null;
  const isHome = next?.homeClubId === club.id;
  const fired = career.pendingOffers.length > 0;

  // Mini-classificação: 5 linhas à volta do clube.
  const miniStart = Math.max(0, Math.min(position - 3, table.length - 5));
  const mini = table.slice(miniStart, miniStart + 5);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* DESPEDIDO → ofertas de emprego bloqueiam tudo */}
        {fired ? (
          <View>
            <Section title="Foste despedido — escolhe o próximo clube" />
            {career.pendingOffers.map((clubId) => {
              const c = state.clubs[clubId];
              if (!c) return null;
              const l = state.leagues[c.leagueId];
              return (
                <Pressable key={clubId} style={styles.offerRow} onPress={() => acceptOffer(clubId)}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '700' }}>{c.name}</Body>
                    <Text style={styles.sub}>{l?.name} · Reputação {c.reputation}</Text>
                  </View>
                  <Text style={styles.offerAccept}>Aceitar ›</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View>
            {/* CAIXA DE ENTRADA — propostas, renovações e pedidos */}
            {inboxItems().length > 0 ? (
              <View>
                <Section title={`Caixa de entrada · ${inboxItems().length}`} />
                {inboxItems().map((item) => {
                  const p = state.players[item.playerId];
                  if (!p) return null;
                  const name = `${p.firstName} ${p.lastName}`;

                  if (item.kind === 'BID') {
                    const buyer = state.clubs[item.fromClubId];
                    if (!buyer) return null;
                    return (
                      <View key={item.id} style={[styles.bidRow, { borderColor: theme.colors.green }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bidName}>{name}</Text>
                          <Text style={styles.sub}>{buyer.name} oferece <Text style={{ color: theme.colors.green, fontWeight: '700' }}>{money(item.fee)}</Text></Text>
                        </View>
                        <Pressable style={styles.bidAccept} onPress={() => {
                          const r = acceptBid(item.id);
                          if (r.ok) setMsg(`${name} vendido por ${money(r.fee ?? item.fee)}.`);
                        }}>
                          <Text style={styles.bidAcceptText}>Vender</Text>
                        </Pressable>
                        <Pressable style={styles.bidReject} onPress={() => rejectBid(item.id)}>
                          <Text style={styles.bidRejectText}>✕</Text>
                        </Pressable>
                      </View>
                    );
                  }

                  if (item.kind === 'RENEWAL') {
                    const asked = suggestedWage(p, state.meta.season);
                    return (
                      <View key={item.id} style={[styles.bidRow, { borderColor: theme.colors.yellow }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bidName}>{name}</Text>
                          <Text style={styles.sub}>Contrato expira este ano · pede <Text style={{ color: theme.colors.yellow, fontWeight: '700' }}>{wage(asked)}</Text></Text>
                        </View>
                        <Pressable style={[styles.bidAccept, { backgroundColor: theme.colors.blue }]} onPress={() => {
                          const r = resolveRenewal(item.id, 3);
                          setMsg(r.ok ? `${name} renovou por 3 anos (${wage(r.wage ?? asked)}).` : r.error ?? null);
                        }}>
                          <Text style={styles.bidAcceptText}>Renovar 3a</Text>
                        </Pressable>
                        <Pressable style={styles.bidReject} onPress={() => dismissItem(item.id)}>
                          <Text style={styles.bidRejectText}>✕</Text>
                        </Pressable>
                      </View>
                    );
                  }

                  // REQUEST
                  const label = item.request === 'WAGE_RISE' ? 'pede aumento salarial' : 'quer ser vendido';
                  return (
                    <View key={item.id} style={[styles.bidRow, { borderColor: theme.colors.red }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bidName}>{name}</Text>
                        <Text style={styles.sub}>{label} · moral {p.condition.morale}</Text>
                      </View>
                      <Pressable style={styles.bidAccept} onPress={() => setMsg(resolveRequest(item.id, true))}>
                        <Text style={styles.bidAcceptText}>Aceitar</Text>
                      </Pressable>
                      <Pressable style={styles.bidReject} onPress={() => setMsg(resolveRequest(item.id, false))}>
                        <Text style={styles.bidRejectText}>Recusar</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* RESUMO DO FIM DE ÉPOCA */}
            {lastSeason ? (
              <View style={styles.seasonBanner}>
                <Body style={{ fontWeight: '700' }}>
                  Época {lastSeason.record.season}: {lastSeason.record.position}º — {lastSeason.boardMessage}
                </Body>
                {lastSeason.record.champion ? <Body style={{ color: theme.colors.yellow }}>🏆 Campeão da {lastSeason.record.leagueName}!</Body> : null}
                {lastSeason.youth.joinedManagedClub.length > 0 ? (
                  <Text style={styles.sub}>{lastSeason.youth.joinedManagedClub.length} jovens subiram da academia.</Text>
                ) : null}
              </View>
            ) : null}

            {/* PRÓXIMO JOGO */}
            <Section title="Próximo jogo" />
            <View style={styles.nextMatch}>
              {next && nextOpp ? (
                <View style={styles.nextMatchInfo}>
                  <Text style={styles.nextMatchTeams}>
                    {isHome ? `${club.shortName} vs ${nextOpp.shortName}` : `${nextOpp.shortName} vs ${club.shortName}`}
                  </Text>
                  <Text style={styles.sub}>
                    {state.leagues[managedLeague()]?.name} · Jornada {next.round} · {isHome ? 'Casa' : 'Fora'}
                  </Text>
                </View>
              ) : (
                <View style={styles.nextMatchInfo}>
                  <Text style={styles.nextMatchTeams}>Época terminada</Text>
                  <Text style={styles.sub}>Avança para iniciar a nova época</Text>
                </View>
              )}
              <Button
                label={next ? 'Jogar ▶' : 'Nova época ▶'}
                onPress={async () => {
                  advance();
                  if (onAdvanceAd()) await showInterstitial();
                  if (next) router.push('/match');
                }}
              />
            </View>

            {/* ÚLTIMOS RESULTADOS */}
            {lastResults.length > 0 ? (
              <View>
                <Section title="Últimos resultados" right={<FormDots results={[...lastResults.map((r) => r.outcome)].reverse()} />} />
                {lastResults.map((r, i) => (
                  <View key={i} style={styles.resultRow}>
                    <Text style={[styles.resultMark, {
                      color: r.outcome === 'W' ? theme.colors.green : r.outcome === 'D' ? theme.colors.textDim : theme.colors.red,
                    }]}>
                      {r.outcome === 'W' ? '✓' : r.outcome === 'D' ? '=' : '✗'}
                    </Text>
                    <Text style={styles.resultScore}>{r.score}</Text>
                    <Text style={[styles.body, { flex: 1 }]}>{r.venue === 'C' ? 'vs' : '@'} {r.opp}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* NOTÍCIAS */}
            {state.news.length > 0 ? (
              <View>
                <Section title="Notícias" />
                {state.news.slice(0, 6).map((n) => (
                  <View key={n.id} style={styles.newsRow}>
                    <Text style={styles.newsDate}>{n.date.slice(5)}</Text>
                    <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* OBJETIVO DA DIREÇÃO */}
            <Section title="Direção" />
            <RowKV k="Objetivo" v={OBJECTIVE_LABELS[career.objective]} />
            <View style={styles.confRow}>
              <Text style={styles.rowKey}>Confiança</Text>
              <View style={{ flex: 1, marginHorizontal: theme.spacing(1) }}>
                <Bar
                  value={career.confidence}
                  color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red}
                  height={6}
                />
              </View>
              <Text style={styles.confVal}>{career.confidence}%</Text>
            </View>

            {/* CLASSIFICAÇÃO (mini) */}
            <Section title="Classificação" right={
              <Pressable onPress={() => router.push('/league' as never)}><Text style={styles.link}>Ver tudo ›</Text></Pressable>
            } />
            {mini.map((r) => {
              const pos = table.indexOf(r) + 1;
              const me = r.clubId === club.id;
              return (
                <View key={r.clubId} style={[styles.miniRow, me && styles.miniRowMe]}>
                  <Text style={[styles.miniPos, me && styles.bold]}>{pos}</Text>
                  <Text style={[styles.body, { flex: 1 }, me && styles.bold]} numberOfLines={1}>
                    {state.clubs[r.clubId]?.name ?? r.clubId}
                  </Text>
                  <Text style={[styles.miniPts, me && styles.bold]}>{r.points}</Text>
                </View>
              );
            })}

            {/* FINANÇAS */}
            <Section title="Finanças" />
            <RowKV k="Saldo" v={money(finance.balance)} vColor={finance.balance >= 0 ? theme.colors.green : theme.colors.red} />
            <RowKV k="Orçamento de transferências" v={money(finance.transferBudget)} />
            <RowKV k="Salários semanais" v={money(finance.expenses.wages)} vColor={theme.colors.red} />
            <RowKV
              k="Margem salarial"
              v={`${money(wageBudgetRemaining(finance))} de ${money(finance.wageBudget)}`}
              vColor={wageBudgetRemaining(finance) > 0 ? theme.colors.green : theme.colors.red}
            />
            {isInsolvent(finance) ? (
              <Body style={{ color: theme.colors.red, fontWeight: '700', marginTop: 4 }}>
                ⚠ Clube insolvente — contratações bloqueadas
              </Body>
            ) : null}

            {/* TREINO */}
            <Section title="Foco de treino" />
            <View style={styles.focusRow}>
              {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map((f) => (
                <Pressable key={f} onPress={() => setFocus(f)} style={[styles.chip, focus === f && styles.chipActive]}>
                  <Text style={[styles.chipText, focus === f && styles.chipTextActive]}>{FOCUS_LABELS[f]}</Text>
                </Pressable>
              ))}
            </View>

            {/* BÓNUS */}
            <Section title="Bónus" />
            {msg ? <Body style={{ color: theme.colors.green, marginBottom: 4 }}>{msg}</Body> : null}
            {dailyAvailable() ? (
              <Pressable style={styles.bonusRow} onPress={() => {
                const v = claimDaily();
                if (v > 0) setMsg(`Bónus diário: +${money(v)} (streak ${state.career.loginStreak})`);
              }}>
                <Text style={styles.bonusText}>📅 Bónus diário — dia {state.career.loginStreak + 1}</Text>
                <Text style={styles.bonusVal}>+{money(dailyBonusAmount(state.career.loginStreak + 1))}</Text>
              </Pressable>
            ) : null}
            {rewardedAvailable() ? (
              <View>
                <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                  setBusy(true);
                  if (await showRewarded()) setMsg(claimReward(AdReward.SPONSOR_BONUS));
                  setBusy(false);
                }}>
                  <Text style={styles.bonusText}>▶ Anúncio: patrocínio</Text>
                  <Text style={styles.bonusVal}>+250k €</Text>
                </Pressable>
                <Pressable disabled={busy} style={[styles.bonusRow, busy && { opacity: 0.5 }]} onPress={async () => {
                  setBusy(true);
                  if (await showRewarded()) setMsg(claimReward(AdReward.FITNESS_BOOST));
                  setBusy(false);
                }}>
                  <Text style={styles.bonusText}>▶ Anúncio: recuperação do plantel</Text>
                  <Text style={styles.bonusVal}>+20 fit</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.sub}>Bónus de anúncio esgotados por esta semana.</Text>
            )}
          </View>
        )}
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
      <AdBanner />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: theme.font.body },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  bold: { fontWeight: '700' },
  link: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },

  seasonBanner: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(1.5), marginTop: theme.spacing(1.5), gap: 2,
  },

  nextMatch: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(1.5), gap: theme.spacing(1.5),
  },
  nextMatchInfo: { gap: 2 },
  nextMatchTeams: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  resultMark: { fontSize: theme.font.body, fontWeight: '800', width: 16, textAlign: 'center' },
  resultScore: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', width: 34, fontVariant: ['tabular-nums'] },

  bidRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginBottom: theme.spacing(0.75),
  },
  bidName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  bidAccept: {
    backgroundColor: theme.colors.green, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(0.9),
  },
  bidAcceptText: { color: '#fff', fontSize: theme.font.small, fontWeight: '700' },
  bidReject: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(0.9),
  },
  bidRejectText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },

  newsRow: {
    flexDirection: 'row', gap: theme.spacing(1), alignItems: 'flex-start',
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  newsDate: { color: theme.colors.textDim, fontSize: theme.font.small, width: 38, fontVariant: ['tabular-nums'] },
  newsTitle: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },

  confRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  rowKey: { color: theme.colors.textDim, fontSize: theme.font.body },
  confVal: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 36, textAlign: 'right' },

  miniRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.6), paddingHorizontal: theme.spacing(0.5),
  },
  miniRowMe: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm },
  miniPos: { color: theme.colors.textDim, fontSize: theme.font.body, width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  miniPts: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },

  focusRow: { flexDirection: 'row', gap: theme.spacing(0.75) },
  chip: {
    flex: 1, paddingVertical: theme.spacing(0.75), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  chipActive: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  chipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '600' },
  chipTextActive: { color: theme.colors.blue },

  bonusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(1.25), marginBottom: theme.spacing(0.75),
  },
  bonusText: { color: theme.colors.text, fontSize: theme.font.body },
  bonusVal: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '700' },

  offerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(1.5), marginBottom: theme.spacing(1),
  },
  offerAccept: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '700' },
});
