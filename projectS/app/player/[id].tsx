import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { careerTotals } from '../../src/core/game';
import { TrainingFocus } from '../../src/core/training';
import {
  bidForPlayer, canTalk, deservesCriticism, deservesPraise, isAtRisk, isWonderkid,
  potentialRange, seasonRating, trustOf, yellowsToBan,
} from '../../src/core/game';
import {
  defaultReleaseClause, minReleaseClause, SELL_ON_STEPS, suggestedWage,
} from '../../src/core/economy';
import { ContractClauses, naturalOverall, naturalOverallFine, Position } from '../../src/core/models';
import { money, to100, wage } from '../../src/ui/format';
import { useT, useTMsg } from '../../src/ui/i18n';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Toast } from '../../src/ui/Toast';
import { Body, Button, PosText, RowKV, Screen, StatBar, Stepper } from '../components';

/** Posições oferecidas para reconversão (as do onze; o GR é um mundo à parte). */
const RETRAIN_TARGETS: Position[] = ['RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

type Tab = 'OVERVIEW' | 'STATS' | 'CAREER' | 'CONTRACT' | 'TALK' | 'SELL';
const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'OVERVIEW', labelKey: 'player.tab.overview' },
  { key: 'STATS', labelKey: 'player.tab.stats' },
  { key: 'CAREER', labelKey: 'player.career' },
  { key: 'CONTRACT', labelKey: 'player.tab.contract' },
  { key: 'TALK', labelKey: 'player.tab.talk' },
  { key: 'SELL', labelKey: 'player.tab.sell' },
];
/** Opções do plano individual — `null` devolve o jogador ao plano da equipa. */
const INDIVIDUAL_FOCUS: (TrainingFocus | null)[] = [null, 'PHYSICAL', 'TECHNICAL', 'TACTICAL', 'RECOVERY'];

/** Separadores que só fazem sentido nos jogadores do nosso plantel. */
const OURS_ONLY: Tab[] = ['TALK', 'SELL'];

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const tMsg = useTMsg();
  const state = useGameStore((s) => s.state);
  const renewPlayer = useGameStore((s) => s.renewPlayer);
  const setListed = useGameStore((s) => s.setListed);
  const doTerminateLoan = useGameStore((s) => s.doTerminateLoan);
  const acceptBid = useGameStore((s) => s.acceptBid);
  const startRetrain = useGameStore((s) => s.startRetrain);
  const cancelRetrain = useGameStore((s) => s.cancelRetrain);
  const wageWithClauses = useGameStore((s) => s.wageWithClauses);
  const talkToPlayer = useGameStore((s) => s.talkToPlayer);
  const promisePlayer = useGameStore((s) => s.promisePlayer);
  const setPlayerFocus = useGameStore((s) => s.setPlayerFocus);
  const trainingSlots = useGameStore((s) => s.trainingSlots);

  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [years, setYears] = useState(3);
  // Cláusulas em negociação (null = ainda não foram tocadas nesta visita).
  const [clause, setClause] = useState<number | null>(null);
  const [goalBonus, setGoalBonus] = useState(0);
  const [appBonus, setAppBonus] = useState(0);
  const [sellOn, setSellOn] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const player = state?.players[id ?? ''];
  if (!state || !player) return <Screen edges={['left', 'right', 'bottom']}><Body>{t('player.notFound')}</Body></Screen>;

  // Carreira: linhas arquivadas + totais (inclui a época a decorrer).
  const history = player.condition.history ?? [];
  const totals = careerTotals(player);
  const slots = trainingSlots();

  const ovr = naturalOverall(player);
  const potR = potentialRange(state, player); // intervalo (ou exato) do potencial
  const potText = potR.exact ? String(potR.min) : `${potR.min}-${potR.max}`;
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const a = player.attributes;
  const yellows = player.condition.seasonYellows ?? 0;
  const atRisk = isAtRisk(yellows);
  const askedWage = suggestedWage(player, state.meta.season);
  const isOurs = player.clubId === state.meta.managedClubId;
  const pendingBid = isOurs ? bidForPlayer(state, player.id) : null;

  // Cláusulas: o mínimo legal, a sugestão e o que está a ser negociado agora.
  const minClause = minReleaseClause(player, state.meta.season);
  const suggestedClause = defaultReleaseClause(player, state.meta.season);
  const proposedClause = clause ?? player.clauses?.releaseClause ?? suggestedClause;
  const proposed: ContractClauses = {
    releaseClause: proposedClause,
    goalBonus: goalBonus || undefined,
    appearanceBonus: appBonus || undefined,
  };
  // Preço do pacote: é isto que dá peso à decisão — cada cláusula move o número.
  const negotiatedWage = wageWithClauses(player.id, proposed);
  const clauseStep = Math.max(50_000, Math.round(suggestedClause / 10 / 50_000) * 50_000);
  const trust = trustOf(player);
  const promise = player.condition.relation?.promise ?? null;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind ?? 'ok'} onHide={() => setFeedback(null)} />
      {/* Cabeçalho */}
      <View style={styles.header}>
        <Face
          seed={player.id}
          size={54}
          shirt={club?.primaryColor}
          ring={player.condition.status === 'INJURED' ? theme.colors.red : undefined}
        />
        <View style={[styles.ovrBox, { backgroundColor: attrColor(ovr) }]}>
          <Text style={styles.ovrText}>{to100(naturalOverallFine(player))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {player.firstName} {player.lastName}
            {isWonderkid(player) ? <Text style={{ color: theme.colors.yellow }}> ★</Text> : null}
          </Text>
          <View style={styles.metaRow}>
            <PosText position={player.positions[0]!} />
            <Text style={styles.sub}>{t('player.age', { age: player.age, nat: player.nationality, club: club?.name ?? t('player.free') })}</Text>
          </View>
        </View>
      </View>

      {/* Separadores (o "Vender" só aparece para jogadores nossos) */}
      <View style={styles.tabs}>
        {TABS.filter((tb) => isOurs || !OURS_ONLY.includes(tb.key)).map((tb) => (
          <Pressable key={tb.key} onPress={() => setTab(tb.key)}
            style={[styles.tab, tab === tb.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === tb.key && styles.tabTextActive]}>
              {t(tb.labelKey)}{tb.key === 'SELL' && pendingBid ? ' •' : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'OVERVIEW' ? (
          <View>
            <RowKV k={t('player.overall')} v={String(to100(naturalOverallFine(player)))} vColor={attrColor(ovr)} />
            <RowKV k={t('player.potential')} v={potText} vColor={attrColor(player.potential)} />
            <RowKV k={t('player.form')} v={String(player.condition.form)} />
            <RowKV k={t('player.morale')} v={String(player.condition.morale)} />
            <RowKV k={t('player.fitness')} v={`${player.condition.fitness}%`} vColor={fitnessColor(player.condition.fitness)} />
            <RowKV k={t('player.foot')} v={t(`foot.${player.foot}`)} />
            <RowKV k={t('mkt.marketValue')} v={money(player.marketValue)} />
            {player.condition.status === 'INJURED' ? (
              <RowKV k={t('player.statusLabel')} v={t('player.injuredDays', { days: player.condition.injuryDaysRemaining })} vColor={theme.colors.red} />
            ) : null}
            {/* DISCIPLINA — os amarelos deixaram de morrer no apito final: aos 5
                custam um jogo, e o aviso tem de estar onde se olha para ele. */}
            <RowKV
              k={t('disc.yellows')}
              v={yellows > 0
                ? (atRisk ? `${yellows} · ${t('disc.atRisk')}` : `${yellows} · ${t('disc.toBan', { n: yellowsToBan(yellows) })}`)
                : '0'}
              vColor={atRisk ? theme.colors.yellow : undefined}
            />
            {player.condition.suspended ? (
              <RowKV
                k={t('player.statusLabel')}
                v={t('disc.suspendedGames', { n: player.condition.suspended })}
                vColor={theme.colors.red}
              />
            ) : null}
          </View>
        ) : null}

        {tab === 'STATS' ? (
          <View>
            <Text style={styles.group}>{t('grp.PHYSICAL')}</Text>
            <StatBar label={t('attr.pace')} value={a.pace} />
            <StatBar label={t('attr.stamina')} value={a.stamina} />
            <StatBar label={t('attr.strength')} value={a.strength} />
            <StatBar label={t('attr.agility')} value={a.agility} />
            <Text style={styles.group}>{t('grp.TECHNICAL')}</Text>
            <StatBar label={t('attr.finishing')} value={a.finishing} />
            <StatBar label={t('attr.passing')} value={a.passing} />
            <StatBar label={t('attr.dribbling')} value={a.dribbling} />
            <StatBar label={t('attr.tackling')} value={a.tackling} />
            <StatBar label={t('attr.heading')} value={a.heading} />
            {player.positions[0] === 'GK' ? <StatBar label={t('attr.goalkeeping')} value={a.goalkeeping} /> : null}
            <Text style={styles.group}>{t('grp.MENTAL')}</Text>
            <StatBar label={t('attr.positioning')} value={a.positioning} />
            <StatBar label={t('attr.composure')} value={a.composure} />
            <StatBar label={t('attr.teamwork')} value={a.teamwork} />
            <StatBar label={t('attr.vision')} value={a.vision} />
          </View>
        ) : null}


        {tab === 'CAREER' ? (
          <View>
            {/* PLANO INDIVIDUAL — só nos nossos, e só se ele estiver cá dentro. */}
            {isOurs ? (
              <View style={styles.planBox}>
                <View style={styles.planHead}>
                  <Text style={styles.group}>{t('training.individual.title')}</Text>
                  <Text style={styles.planSlots}>
                    {tMsg({ key: 'training.individual.slots', params: { used: slots.used, total: slots.total } })}
                  </Text>
                </View>
                <View style={styles.planRow}>
                  {INDIVIDUAL_FOCUS.map((f) => {
                    const active = (player.condition.trainingFocus ?? null) === f;
                    return (
                      <Pressable
                        key={f ?? 'NONE'}
                        onPress={() => {
                          const res = setPlayerFocus(player.id, f);
                          if (!res.ok) {
                            setFeedback({ kind: 'error', text: tMsg({ key: res.errorKey ?? '', params: res.params }) });
                          } else {
                            setFeedback({
                              kind: 'ok',
                              text: f
                                ? tMsg({ key: 'training.individual.set', params: { player: player.lastName, focus: t('focus.' + f) } })
                                : tMsg({ key: 'training.individual.cleared', params: { player: player.lastName } }),
                            });
                          }
                        }}
                        style={[styles.planChip, active && styles.planChipOn]}>
                        <Text style={[styles.planChipText, active && styles.planChipTextOn]}>
                          {f ? t('focus.' + f) : t('training.individual.none')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.planHint}>{t('training.individual.hint')}</Text>
              </View>
            ) : null}

            {/* CARREIRA — uma linha por época jogada. */}
            <Text style={styles.group}>{t('player.career')}</Text>
            {history.length === 0 ? (
              <Text style={styles.planHint}>{t('player.career.empty')}</Text>
            ) : (
              <View>
                <Text style={styles.careerTotals}>
                  {tMsg({ key: 'player.career.totals', params: {
                    seasons: totals.seasons, apps: totals.apps,
                    goals: totals.goals, assists: totals.assists,
                  } })}
                </Text>
                <View style={styles.careerHead}>
                  <Text style={[styles.careerCell, styles.careerSeason, styles.careerHeadText]}>
                    {t('player.career.season')}
                  </Text>
                  <Text style={[styles.careerCell, styles.careerClub, styles.careerHeadText]}>
                    {t('club.title')}
                  </Text>
                  <Text style={[styles.careerCell, styles.careerNum, styles.careerHeadText]}>{t('player.career.apps')}</Text>
                  <Text style={[styles.careerCell, styles.careerNum, styles.careerHeadText]}>{t('player.career.goals')}</Text>
                  <Text style={[styles.careerCell, styles.careerNum, styles.careerHeadText]}>{t('player.career.assists')}</Text>
                  <Text style={[styles.careerCell, styles.careerNum, styles.careerHeadText]}>OVR</Text>
                </View>
                {[...history].reverse().map((l) => (
                  <View key={l.season} style={styles.careerRow}>
                    <Text style={[styles.careerCell, styles.careerSeason]}>{l.season}</Text>
                    <Text style={[styles.careerCell, styles.careerClub]} numberOfLines={1}>{l.clubName}</Text>
                    <Text style={[styles.careerCell, styles.careerNum]}>{l.apps}</Text>
                    <Text style={[styles.careerCell, styles.careerNum, styles.careerGoals]}>{l.goals}</Text>
                    <Text style={[styles.careerCell, styles.careerNum]}>{l.assists}</Text>
                    <Text style={[styles.careerCell, styles.careerNum]}>{l.overall}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {tab === 'CONTRACT' ? (
          <View>
            <RowKV k={t('player.wageCurrent')} v={wage(player.wage)} />
            <RowKV
              k={t('player.contractUntil')}
              v={player.contractUntil ? `${player.contractUntil}${player.contractUntil === state.meta.season ? t('player.lastYearInline') : ''}` : '—'}
              vColor={player.contractUntil === state.meta.season ? theme.colors.red : undefined}
            />
            <RowKV k={t('player.askedWageRenew')} v={wage(askedWage)} vColor={theme.colors.yellow} />

            {/* CLÁUSULAS EM VIGOR — o que já está assinado. */}
            {player.clauses?.releaseClause ? (
              <RowKV k={t('clause.release')} v={money(player.clauses.releaseClause)}
                vColor={player.clauses.releaseClause < player.marketValue * 1.5 ? theme.colors.red : theme.colors.text} />
            ) : null}
            {player.clauses?.sellOn ? (
              <RowKV k={t('clause.sellOn')}
                v={t('clause.sellOnValue', {
                  pct: Math.round(player.clauses.sellOn * 100),
                  club: state.clubs[player.clauses.sellOnClubId ?? '']?.shortName ?? '—',
                })} />
            ) : null}
            {player.clauses?.goalBonus ? (
              <RowKV k={t('clause.goalBonus')} v={money(player.clauses.goalBonus)} />
            ) : null}
            {player.clauses?.appearanceBonus ? (
              <RowKV k={t('clause.appBonus')} v={money(player.clauses.appearanceBonus)} />
            ) : null}
            {player.condition.loanBuyOption ? (
              <RowKV k={t('clause.buyOption')} v={money(player.condition.loanBuyOption)} vColor={theme.colors.green} />
            ) : null}

            {isOurs && !player.condition.loanOwnerId ? (
              <View style={styles.renewBox}>
                <View style={styles.renewRow}>
                  <Text style={styles.sub}>{t('mkt.duration')}</Text>
                  <Stepper value={years} onChange={setYears} step={1} min={1} max={5}
                    format={(v) => t('tac.years', { n: v })} />
                </View>

                {/* NEGOCIAÇÃO DE CLÁUSULAS. Cada linha mexe no ordenado exigido,
                    mostrado ao vivo em baixo — é aí que a escolha ganha peso. */}
                <Text style={styles.clauseTitle}>{t('clause.section')}</Text>
                <View style={styles.renewRow}>
                  <Text style={styles.sub}>{t('clause.release')}</Text>
                  <Stepper value={proposedClause} onChange={setClause} step={clauseStep}
                    min={minClause} max={suggestedClause * 5} format={money} />
                </View>
                <Text style={styles.clauseHint}>{t('clause.releaseHint')}</Text>

                <View style={styles.renewRow}>
                  <Text style={styles.sub}>{t('clause.goalBonus')}</Text>
                  <Stepper value={goalBonus} onChange={setGoalBonus} step={5_000}
                    min={0} max={200_000} format={money} />
                </View>
                <View style={styles.renewRow}>
                  <Text style={styles.sub}>{t('clause.appBonus')}</Text>
                  <Stepper value={appBonus} onChange={setAppBonus} step={1_000}
                    min={0} max={50_000} format={money} />
                </View>

                <RowKV k={t('clause.asksNow')} v={wage(negotiatedWage)}
                  vColor={negotiatedWage <= askedWage ? theme.colors.green : theme.colors.yellow} />

                <Button label={t('player.renew')} onPress={() => {
                  const r = renewPlayer(player.id, years, negotiatedWage, proposed);
                  setFeedback(r.ok
                    ? { kind: 'ok', text: t('player.renewToast', { until: state.meta.season + years, wage: wage(negotiatedWage) }) }
                    : { kind: 'error', text: r.error ?? t('player.renewFailed') });
                }} />
              </View>
            ) : null}

            {/* RECONVERSÃO DE POSIÇÃO — pedido do playtest ("tipo modo carreira
                do FIFA"): em vez de comer a penalização de jogar fora de posição
                para sempre, investem-se semanas de treino e o jogador fica mesmo
                natural na posição nova. */}
            {isOurs && !player.condition.loanOwnerId ? (
              <View style={styles.renewBox}>
                <Text style={styles.retrainTitle}>{t('retrain.title')}</Text>
                {player.condition.retraining ? (
                  <>
                    <Text style={styles.sub}>
                      {t('retrain.busy', {
                        pos: player.condition.retraining.position,
                        weeks: player.condition.retraining.weeksLeft,
                      })}
                    </Text>
                    <View style={{ marginTop: theme.spacing(1) }}>
                      <Button
                        label={t('retrain.cancel')}
                        variant="ghost"
                        onPress={() => {
                          cancelRetrain(player.id);
                          setFeedback({ kind: 'info', text: t('retrain.cancel') });
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.sub}>{t('retrain.hint')}</Text>
                    <View style={styles.retrainRow}>
                      {RETRAIN_TARGETS.filter((pos) => !player.positions.includes(pos)).map((pos) => (
                        <Pressable
                          key={pos}
                          style={styles.retrainChip}
                          onPress={() => {
                            const r = startRetrain(player.id, pos);
                            setFeedback(r.ok
                              ? { kind: 'ok', text: t('retrain.start', { pos, weeks: r.weeks ?? 0 }) }
                              : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                          }}
                        >
                          <Text style={styles.retrainChipText}>{pos}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* CONVERSA — a parte humana da gestão. Elogiar quem está bem e criticar
            quem está mal funciona; ao contrário sai caro. As promessas dão moral
            já e cobram-na no prazo (ver core/game/relations.ts). */}
        {tab === 'TALK' && isOurs ? (
          <View>
            <RowKV k={t('talk.trust')} v={String(trust)}
              vColor={trust >= 30 ? theme.colors.green : trust <= -30 ? theme.colors.red : theme.colors.text} />
            <RowKV k={t('player.morale')} v={String(player.condition.morale)} />
            <RowKV k={t('talk.form')} v={String(player.condition.form)} />
            <RowKV k={t('talk.avgRating')}
              v={seasonRating(player) > 0 ? seasonRating(player).toFixed(1) : '—'} />

            {promise ? (
              <View style={styles.talkBox}>
                <Text style={styles.clauseTitle}>{t('talk.promise.open')}</Text>
                <Text style={styles.sub}>
                  {t(promise.kind === 'PLAYING_TIME' ? 'talk.promise.minutesOpen' : 'talk.promise.signingOpen',
                    { date: promise.deadline })}
                </Text>
              </View>
            ) : null}

            {!canTalk(state, player) ? (
              <Text style={[styles.sub, { marginTop: theme.spacing(2) }]}>{t('talk.cooldown')}</Text>
            ) : (
              <View style={styles.talkBox}>
                <Text style={styles.clauseHint}>
                  {deservesPraise(player) ? t('talk.hint.good')
                    : deservesCriticism(player) ? t('talk.hint.bad')
                    : t('talk.hint.neutral')}
                </Text>
                <Button label={t('talk.praise')} onPress={() => {
                  const r = talkToPlayer(player.id, 'PRAISE');
                  setFeedback(r.message
                    ? { kind: r.wellReceived ? 'ok' : 'error', text: tMsg(r.message) }
                    : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                }} />
                <Button label={t('talk.criticise')} variant="ghost" onPress={() => {
                  const r = talkToPlayer(player.id, 'CRITICISE');
                  setFeedback(r.message
                    ? { kind: r.wellReceived ? 'ok' : 'error', text: tMsg(r.message) }
                    : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                }} />
                {!promise ? (
                  <>
                    <Text style={styles.clauseHint}>{t('talk.promiseHint')}</Text>
                    <Button label={t('talk.promiseMinutes')} variant="ghost" onPress={() => {
                      const r = promisePlayer(player.id, 'PLAYING_TIME');
                      setFeedback(r.message
                        ? { kind: 'ok', text: tMsg(r.message) }
                        : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                    }} />
                    <Button label={t('talk.promiseSigning')} variant="ghost" onPress={() => {
                      const r = promisePlayer(player.id, 'SIGNING');
                      setFeedback(r.message
                        ? { kind: 'ok', text: tMsg(r.message) }
                        : { kind: 'error', text: r.errorKey ? t(r.errorKey) : '' });
                    }} />
                  </>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        {tab === 'SELL' && isOurs && player.condition.loanOwnerId ? (
          <View>
            <Text style={styles.sub}>
              {t('loan.from', { club: state.clubs[player.condition.loanOwnerId]?.name ?? '' })} · {t('loan.wageLabel', { v: wage(player.wage) })}
            </Text>
            <View style={{ marginTop: theme.spacing(2) }}>
              <Button
                label={t('loan.dispense.button')}
                variant="ghost"
                onPress={() => {
                  const r = doTerminateLoan(player.id);
                  setFeedback(r.ok
                    ? { kind: 'ok', text: t('loan.dispense.toast', { name: player.lastName }) }
                    : { kind: 'error', text: r.errorKey ? t(r.errorKey) : t('loan.err.invalid') });
                }}
              />
            </View>
          </View>
        ) : tab === 'SELL' && isOurs ? (
          <View>
            <RowKV k={t('mkt.marketValue')} v={money(player.marketValue)} />
            <RowKV k={t('player.listed')} v={player.transferListed ? t('common.yes') : t('common.no')}
              vColor={player.transferListed ? theme.colors.yellow : undefined} />

            {/* Proposta pendente, se houver */}
            {pendingBid ? (
              <View style={styles.bidBox}>
                <Text style={styles.bidTitle}>{t('player.bidFrom', { club: state.clubs[pendingBid.fromClubId]?.name ?? '' })}</Text>
                <Text style={styles.bidFee}>{money(Math.round(pendingBid.fee * (1 - sellOn * 0.5)))}</Text>

                {/* % DE FUTURA VENDA: abdica-se de parte do passe hoje para
                    apanhar uma fatia da próxima venda. A aposta certa num jovem
                    que vai crescer; dinheiro deitado fora num que não cresce. */}
                <Text style={styles.clauseHint}>{t('clause.sellOnHint')}</Text>
                <View style={styles.sellOnRow}>
                  {SELL_ON_STEPS.map((pct) => (
                    <Pressable key={pct} onPress={() => setSellOn(pct)}
                      style={[styles.sellOnChip, sellOn === pct && styles.sellOnChipOn]}>
                      <Text style={[styles.sellOnText, sellOn === pct && styles.sellOnTextOn]}>
                        {pct === 0 ? t('clause.sellOnNone') : `${Math.round(pct * 100)}%`}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Button label={t('player.acceptSell')} onPress={() => {
                  const r = acceptBid(pendingBid.id, sellOn);
                  setFeedback(r.ok
                    ? { kind: 'ok', text: t('player.sellToast', { fee: money(r.fee ?? pendingBid.fee) }) }
                    : { kind: 'error', text: r.error ?? t('player.sellFailed') });
                }} />
              </View>
            ) : (
              <Text style={styles.sub}>{t('player.noBids')}</Text>
            )}

            <View style={{ marginTop: theme.spacing(2) }}>
              <Button
                label={player.transferListed ? t('player.listToggleOn') : t('player.listToggleOff')}
                variant={player.transferListed ? 'ghost' : 'primary'}
                onPress={() => {
                  // Captura a intenção ANTES de chamar: o core muta o jogador no
                  // sítio, e ler `player.transferListed` a seguir dava a mensagem
                  // ao contrário ("Retirado da lista" ao PÔR na lista).
                  const willList = !player.transferListed;
                  setListed(player.id, willList);
                  setFeedback({ kind: 'info', text: willList ? t('player.addedToList') : t('player.removedFromList') });
                }}
              />
            </View>
          </View>
        ) : null}
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  planBox: { marginBottom: 18 },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planSlots: { color: theme.colors.textDim, fontSize: 12 },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  planChip: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  planChipOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '22' },
  planChipText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '600' },
  planChipTextOn: { color: theme.colors.accent },
  planHint: { color: theme.colors.textDim, fontSize: 11, marginTop: 6, lineHeight: 15 },
  careerTotals: { color: theme.colors.text, fontSize: 12, marginBottom: 8 },
  careerHead: {
    flexDirection: 'row', paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  careerHeadText: { color: theme.colors.textDim, fontSize: 10, fontWeight: '700' },
  careerRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border + '55',
  },
  careerCell: { color: theme.colors.text, fontSize: 12 },
  careerSeason: { width: 44 },
  careerClub: { flex: 1, paddingRight: 6 },
  careerNum: { width: 30, textAlign: 'right' },
  careerGoals: { fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.5),
  },
  ovrBox: { width: 46, height: 46, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  ovrText: { color: '#141414', fontSize: 20, fontWeight: '800' },
  name: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: 2 },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing(1),
  },
  tab: { flex: 1, paddingVertical: theme.spacing(1), alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: theme.colors.blue },
  tabText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '600' },
  tabTextActive: { color: theme.colors.blue },

  group: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700',
    letterSpacing: 1.2, marginTop: theme.spacing(2), marginBottom: theme.spacing(0.5),
  },

  clauseTitle: {
    color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800',
    marginTop: theme.spacing(1), marginBottom: 2,
  },
  clauseHint: { color: theme.colors.textDim, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  talkBox: { marginTop: theme.spacing(2), gap: theme.spacing(1.25) },
  sellOnRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  sellOnChip: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  sellOnChipOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  sellOnText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800' },
  sellOnTextOn: { color: theme.colors.blue },

  retrainTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', marginBottom: 4 },
  retrainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.spacing(1) },
  retrainChip: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  retrainChipText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  renewBox: { marginTop: theme.spacing(2), gap: theme.spacing(1.5) },
  renewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bidBox: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginTop: theme.spacing(1.5),
    gap: theme.spacing(1),
  },
  bidTitle: { color: theme.colors.textDim, fontSize: theme.font.small },
  bidFee: { color: theme.colors.green, fontSize: theme.font.h1, fontWeight: '800' },
});
