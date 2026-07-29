import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useGameStore } from '../../src/state/gameStore';
import { suggestedWage } from '../../src/core/economy';
import { activeOffers, marketShortlist, Reachability } from '../../src/core/game';
import { naturalOverall, naturalOverallFine, Player, POSITION_GROUP, PositionGroup, shortName } from '../../src/core/models';
import { money, to100, wage } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Toast } from '../../src/ui/Toast';
import { Body, Button, PosText, RowKV, Screen, Section, Stepper } from '../components';
import { showRewarded } from '../../src/native/ads';

type Feedback = { kind: 'ok' | 'counter' | 'error'; text: string } | null;

/** Intervalo de potencial em texto 0-100: exato → "88"; estimado → "78-90". */
function potText(min: number, max: number, exact: boolean): string {
  return exact ? String(min) : `${min}-${max}`;
}

export default function Market() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const submitOffer = useGameStore((s) => s.submitOffer);
  const withdraw = useGameStore((s) => s.withdrawOffer);
  const marketWindow = useGameStore((s) => s.marketWindow);
  const freeBudget = useGameStore((s) => s.freeBudget);
  const committed = useGameStore((s) => s.committedBudget);
  const reachOf = useGameStore((s) => s.reachOf);
  const win = marketWindow();

  const managedId = state?.meta.managedClubId;
  const budget = freeBudget();
  const reserved = committed();

  const [view, setView] = useState<'market' | 'scouts' | 'loans'>('market');
  // Negociação em modal — pode abrir do Mercado OU dos Olheiros.
  const [nego, setNego] = useState<{ player: Player; reach: Reachability } | null>(null);
  const [fee, setFee] = useState(0);
  const [wageOffer, setWageOffer] = useState(0);
  const [years, setYears] = useState(3);
  const [bonus, setBonus] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Ordenação por coluna (toque no cabeçalho). 'default' = a curadoria do core.
  const [sortKey, setSortKey] = useState<'default' | 'ovr' | 'age' | 'value' | 'wage' | 'name'>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };
  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  // Filtros do mercado.
  const [posFilter, setPosFilter] = useState<PositionGroup | 'ALL'>('ALL');
  const [minOvr, setMinOvr] = useState(0); // escala 0-100
  const [affordOnly, setAffordOnly] = useState(false);

  // PERF: a shortlist percorre ~800 jogadores. Só a calculamos quando a aba do
  // Mercado está FOCADA — senão recalculava em cada ação (aceitar proposta,
  // avançar jornada…), travando o jogo mesmo estando noutro ecrã.
  const isFocused = useIsFocused();
  const baseTargets = useMemo(
    () => (state && isFocused ? marketShortlist(state) : []),
    [state, isFocused],
  );
  const targets = useMemo(() => {
    let list = baseTargets;
    if (posFilter !== 'ALL') list = list.filter((e) => POSITION_GROUP[e.player.positions[0]!] === posFilter);
    if (minOvr > 0) list = list.filter((e) => to100(naturalOverall(e.player)) >= minOvr);
    if (affordOnly) list = list.filter((e) => e.affordable);
    if (sortKey === 'default') return list;
    const metric = (e: typeof baseTargets[number]): number | string => {
      const p = e.player;
      switch (sortKey) {
        case 'name': return p.lastName.toLowerCase();
        case 'age': return p.age;
        case 'value': return p.marketValue;
        case 'wage': return p.wage;
        default: return naturalOverall(p);
      }
    };
    return [...list].sort((a, b) => {
      const ma = metric(a), mb = metric(b);
      const d = typeof ma === 'string' ? ma.localeCompare(mb as string) : (ma as number) - (mb as number);
      return sortDir === 'asc' ? d : -d;
    });
  }, [baseTargets, posFilter, minOvr, affordOnly, sortKey, sortDir]);

  const pending = state ? activeOffers(state) : [];

  if (!state || !managedId) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const openNegotiation = (p: Player, reach: Reachability | null) => {
    if (!reach || reach.status === 'LOCKED') {
      setFeedback({ kind: 'error', text: t('mkt.noInterest') });
      return;
    }
    setNego({ player: p, reach });
    setFee(Math.round(p.marketValue / 1000) * 1000);
    setWageOffer(suggestedWage(p, state.meta.season));
    setYears(3);
    setBonus(reach.status === 'BONUS' ? reach.requiredSigningBonus : 0);
    setFeedback(null);
  };

  const send = (p: Player) => {
    const res = submitOffer({
      playerId: p.id, fromClubId: managedId, fee, wageOffer, contractYears: years,
      signingBonus: bonus,
    });
    if (res.ok) {
      setFeedback({ kind: 'ok', text: t('mkt.sentToast', { name: p.lastName }) });
      setNego(null);
    } else {
      setFeedback({ kind: 'error', text: res.errorKey ? t(res.errorKey, res.errorParams) : t('mkt.rejected') });
    }
  };

  /** Abrir negociação a partir dos Olheiros (calcula o alcance). */
  const signFromScouts = (p: Player) => {
    setView('market');
    openNegotiation(p, reachOf(p.id));
  };

  return (
    <Screen>
      <Toast
        text={feedback?.text ?? null}
        kind={feedback?.kind === 'error' ? 'error' : feedback?.kind === 'counter' ? 'info' : 'ok'}
        onHide={() => setFeedback(null)}
      />
      <View style={styles.segRow}>
        <Pressable style={[styles.segBtn, view === 'market' && styles.segOn]} onPress={() => setView('market')}>
          <Text style={[styles.segText, view === 'market' && styles.segTextOn]}>{t('mkt.tab.market')}</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, view === 'scouts' && styles.segOn]} onPress={() => setView('scouts')}>
          <Text style={[styles.segText, view === 'scouts' && styles.segTextOn]}>{t('mkt.tab.scouts')}</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, view === 'loans' && styles.segOn]} onPress={() => setView('loans')}>
          <Text style={[styles.segText, view === 'loans' && styles.segTextOn]}>{t('mkt.tab.loans')}</Text>
        </Pressable>
      </View>

      {view === 'loans' ? <LoansPanel /> : view === 'scouts' ? <ScoutsPanel onSign={signFromScouts} /> : (
      <>
      {!win.open ? (
        <View style={styles.windowClosed}>
          <Text style={styles.windowClosedText}>
            {t('mkt.windowClosed', {
              label: t(win.labelKey),
              reopen: win.opensAtRound ? t('mkt.reopen', { round: win.opensAtRound }) : '',
            })}
          </Text>
          <Text style={styles.windowSub}>{t('mkt.windowClosedSub')}</Text>
        </View>
      ) : (
        <Text style={styles.windowOpen}>{t('mkt.windowOpen', { label: t(win.labelKey) })}</Text>
      )}

      <View style={styles.budgetRow}>
        <View>
          <Text style={styles.budgetLabel}>{t('mkt.budgetFree')}</Text>
          {reserved > 0 ? (
            <Text style={styles.reserved}>{t('mkt.committed', { v: money(reserved) })}</Text>
          ) : null}
        </View>
        <Text style={styles.budgetVal}>{money(budget)}</Text>
      </View>

      {/* Filtros: posição, só acessíveis, OVR mínimo.
          `style` com altura fixa + flexGrow:0: sem isto, um ScrollView horizontal
          dentro do Screen (flex-column) colapsa a altura e corta os chips. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterBar}>
        {(['ALL', 'GOALKEEPER', 'DEFENCE', 'MIDFIELD', 'ATTACK'] as const).map((g) => (
          <Pressable key={g} onPress={() => setPosFilter(g)} style={[styles.fChip, posFilter === g && styles.fChipOn]}>
            <Text style={[styles.fChipText, posFilter === g && styles.fChipTextOn]}>{t(`squad.filter.${g}`)}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setAffordOnly((v) => !v)} style={[styles.fChip, affordOnly && styles.fChipOn]}>
          <Text style={[styles.fChipText, affordOnly && styles.fChipTextOn]}>€ {t('mkt.affordOnly')}</Text>
        </Pressable>
        <View style={styles.minOvrGroup}>
          <Text style={styles.fChipText}>{t('mkt.minOvr')}</Text>
          <Pressable onPress={() => setMinOvr((v) => Math.max(0, v - 5))} hitSlop={6}><Text style={styles.stepBtn}>−</Text></Pressable>
          <Text style={styles.minOvrVal}>{minOvr || '—'}</Text>
          <Pressable onPress={() => setMinOvr((v) => Math.min(99, v + 5))} hitSlop={6}><Text style={styles.stepBtn}>+</Text></Pressable>
        </View>
      </ScrollView>

      {/* Propostas à espera de resposta — o suspense fica visível (fora da lista). */}
      {pending.length > 0 ? (
        <View style={{ marginBottom: theme.spacing(0.5) }}>
          <Section title={t('mkt.pending', { n: pending.length })} />
          {pending.map((o) => {
            const p = state.players[o.playerId];
            if (!p) return null;
            const counter = o.status === 'COUNTER';
            return (
              <View key={o.id} style={[styles.pendingRow, counter && styles.pendingCounter]}>
                <Face seed={p.id} size={30} shirt={state.clubs[o.toClubId]?.primaryColor} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingName}>{shortName(p)}</Text>
                  <Text style={styles.sub}>
                    {counter ? (o.reasonKey ? t(o.reasonKey, o.reasonParams) : '') : t('mkt.pendingSub', { fee: money(o.fee) })}
                  </Text>
                </View>
                <Pressable onPress={() => withdraw(o.id)} hitSlop={8}>
                  <Text style={styles.withdraw}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Cabeçalho FIXO e ordenável. */}
      <View style={styles.headRow}>
        <Pressable style={styles.cOvr} onPress={() => toggleSort('ovr')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'ovr' && styles.hOn]}>OVR{arrow('ovr')}</Text>
        </Pressable>
        <Pressable style={styles.cName} onPress={() => toggleSort('name')}>
          <Text style={[styles.h, sortKey === 'name' && styles.hOn]}>{t('mkt.col.name')}{arrow('name')}</Text>
        </Pressable>
        <Pressable style={styles.cNum} onPress={() => toggleSort('age')}>
          <Text style={[styles.h, styles.hCenter, sortKey === 'age' && styles.hOn]}>{t('mkt.col.id')}{arrow('age')}</Text>
        </Pressable>
        <Pressable style={styles.cVal} onPress={() => toggleSort('value')}>
          <Text style={[styles.h, styles.hRight, sortKey === 'value' && styles.hOn]}>{t('mkt.col.value')}{arrow('value')}</Text>
        </Pressable>
        <Pressable style={styles.cVal} onPress={() => toggleSort('wage')}>
          <Text style={[styles.h, styles.hRight, sortKey === 'wage' && styles.hOn]}>{t('mkt.col.wage')}{arrow('wage')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={targets}
        keyExtractor={(e) => e.player.id}
        renderItem={({ item }) => {
          const player = item.player;
          const reach = item.reach;
          const locked = reach.status === 'LOCKED';
          const hasOffer = pending.some((o) => o.playerId === player.id);
          return (
            <TargetRow
              player={player}
              clubName={state.clubs[player.clubId!]?.name ?? ''}
              divLabel={state.leagues[state.clubs[player.clubId!]?.leagueId ?? '']?.name ?? ''}
              clubColor={state.clubs[player.clubId!]?.primaryColor}
              open={nego?.player.id === player.id}
              locked={locked}
              needsBonus={reach.status === 'BONUS'}
              pending={hasOffer}
              onPress={() => {
                if (locked || hasOffer) return;
                openNegotiation(player, reach);
              }}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: theme.spacing(3) }}
      />
      </>
      )}

      {/* Modal de negociação — abre do Mercado ou dos Olheiros. */}
      <Modal transparent animationType="fade" visible={!!nego} onRequestClose={() => setNego(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNego(null)}>
          <Pressable style={styles.negBox} onPress={() => {}}>
            {nego ? (
              <>
                <View style={styles.negHead}>
                  <Text style={styles.negTitle}>{nego.player.firstName} {nego.player.lastName}</Text>
                  <Pressable onPress={() => setNego(null)} hitSlop={10}><Text style={styles.withdraw}>✕</Text></Pressable>
                </View>
                <RowKV k={t('mkt.marketValue')} v={money(nego.player.marketValue)} />
                {nego.reach.status === 'BONUS' ? (
                  <Text style={styles.bonusNote}>{t(nego.reach.reasonKey, nego.reach.reasonParams)}</Text>
                ) : null}
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>{t('mkt.yourOffer')}</Text>
                  <Stepper value={fee} onChange={setFee}
                    step={Math.max(50_000, Math.round(nego.player.marketValue * 0.05 / 1000) * 1000)} min={0} format={money} />
                </View>
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>{t('mkt.wage')}</Text>
                  <Stepper value={wageOffer} onChange={setWageOffer}
                    step={Math.max(100, Math.round(wageOffer * 0.1 / 100) * 100)} min={100} format={(v) => wage(v)} />
                </View>
                {nego.reach.status === 'BONUS' ? (
                  <View style={styles.negRow}>
                    <Text style={styles.negLabel}>{t('mkt.signingBonus')}</Text>
                    <Stepper value={bonus} onChange={setBonus}
                      step={Math.max(10_000, Math.round(nego.reach.requiredSigningBonus * 0.1 / 10_000) * 10_000)} min={0} format={money} />
                  </View>
                ) : null}
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>{t('mkt.duration')}</Text>
                  <Stepper value={years} onChange={setYears} step={1} min={1} max={5} format={(v) => t('tac.years', { n: v })} />
                </View>
                {feedback ? (
                  <Text style={[styles.feedback, { color: feedback.kind === 'ok' ? theme.colors.green : feedback.kind === 'counter' ? theme.colors.yellow : theme.colors.red }]}>
                    {feedback.text}
                  </Text>
                ) : null}
                <View style={{ marginTop: theme.spacing(1) }}>
                  <Button
                    label={!win.open ? t('mkt.closedBtn') : fee + bonus > budget ? t('mkt.budgetShort') : t('mkt.send')}
                    disabled={!win.open || fee + bonus > budget}
                    onPress={() => send(nego.player)}
                  />
                  <Text style={styles.delayNote}>{t('mkt.delayNote')}</Text>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function TargetRow({
  player, clubName, divLabel, clubColor, open, locked, needsBonus, pending, onPress,
}: {
  player: Player; clubName: string; divLabel: string; clubColor?: string;
  open: boolean; locked: boolean; needsBonus: boolean; pending: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const ovr = naturalOverall(player);
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [styles.row, (pressed || open) && styles.rowOpen, locked && styles.rowLocked]}
    >
      <Text style={[styles.ovrBig, styles.cOvr, { color: locked ? theme.colors.textDim : attrColor(ovr) }]}>
        {to100(naturalOverallFine(player))}
      </Text>
      <Face seed={player.id} size={32} shirt={clubColor} />
      <View style={styles.cName}>
        <Text style={[styles.cell, locked && styles.dim]} numberOfLines={1}>{shortName(player)}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <PosText position={player.positions[0]!} style={{ fontSize: 9 }} />
          <Text style={styles.sub} numberOfLines={1}>{clubName}</Text>
          {needsBonus ? <Text style={styles.bonusTag}>{t('mkt.bonusTag')}</Text> : null}
        </View>
        {divLabel ? <Text style={styles.divLabel} numberOfLines={1}>{divLabel}</Text> : null}
      </View>
      {locked ? (
        <Text style={styles.lockedTag}>{t('mkt.noInterest')}</Text>
      ) : pending ? (
        <Text style={styles.pendingTag}>{t('mkt.sent')}</Text>
      ) : (
        <>
          <Text style={[styles.cell, styles.cNum, styles.dim]}>{player.age}</Text>
          <Text style={[styles.cell, styles.cVal]}>{money(player.marketValue)}</Text>
          <Text style={[styles.cell, styles.cVal, styles.dim]}>{wage(player.wage)}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Separador OLHEIROS: rede, missões, sondáveis, promessas descobertas e ligas. */
function ScoutsPanel({ onSign }: { onSign: (p: Player) => void }) {
  const t = useT();
  const state = useGameStore((s) => s.state); // subscrição p/ re-render
  const scoutInfo = useGameStore((s) => s.scoutInfo);
  const scoutMissions = useGameStore((s) => s.scoutMissions);
  const scoutProspects = useGameStore((s) => s.scoutProspects);
  const scoutableLeagues = useGameStore((s) => s.scoutableLeagues);
  const scoutableList = useGameStore((s) => s.scoutableList);
  const potentialRangeOf = useGameStore((s) => s.potentialRangeOf);
  const scoutPlayer = useGameStore((s) => s.scoutPlayer);
  const canScoutP = useGameStore((s) => s.canScoutP);
  const scoutLeague = useGameStore((s) => s.scoutLeague);
  const cancelScout = useGameStore((s) => s.cancelScout);
  const canScoutL = useGameStore((s) => s.canScoutL);

  const isFocused = useIsFocused();
  const info = scoutInfo();
  if (!state || !info) return null;
  const missions = scoutMissions();
  const prospects = scoutProspects();
  // PERF: as listas percorrem ~800 jogadores — só quando a aba está focada.
  const sondaveis = isFocused ? scoutableList() : [];
  const leagues = isFocused ? scoutableLeagues() : [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
      <View style={styles.scoutHead}>
        <View>
          <Text style={styles.scoutTitle}>{t('scout.network')}</Text>
          <Text style={styles.sub}>{t('scout.levelSlots', { level: info.level, free: info.freeSlots, total: info.totalSlots })}</Text>
        </View>
        <Text style={styles.scoutHint}>{t('scout.upgradeHint')}</Text>
      </View>

      <Section title={t('scout.missions', { n: missions.length })} />
      {missions.length === 0 ? (
        <Text style={styles.emptyNote}>{t('scout.noMissions')}</Text>
      ) : missions.map((m) => {
        const label = m.kind === 'PLAYER'
          ? (state.players[m.targetId]?.lastName ?? '?')
          : (state.leagues[m.targetId]?.name ?? '?');
        const pct = Math.max(0, Math.min(1, 1 - m.roundsLeft / m.total));
        return (
          <View key={m.id} style={styles.missionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.missionName}>{m.kind === 'PLAYER' ? '🔍 ' : '🌍 '}{label}</Text>
              <Text style={styles.sub}>{t('scout.roundsLeft', { n: m.roundsLeft })}</Text>
              <View style={styles.progTrack}><View style={[styles.progFill, { width: `${pct * 100}%` }]} /></View>
            </View>
            <Pressable onPress={() => cancelScout(m.id)} hitSlop={8}><Text style={styles.withdraw}>✕</Text></Pressable>
          </View>
        );
      })}

      {/* SONDÁVEIS: promessas jovens ao alcance cujo potencial ainda é incerto. */}
      <Section title={t('scout.sondaveis', { n: sondaveis.length })} />
      {sondaveis.length === 0 ? (
        <Text style={styles.emptyNote}>{t('scout.noSondaveis')}</Text>
      ) : sondaveis.slice(0, 15).map((p) => {
        const r = potentialRangeOf(p.id);
        const can = canScoutP(p.id);
        return (
          <View key={p.id} style={styles.missionRow}>
            <Face seed={p.id} size={30} shirt={state.clubs[p.clubId ?? '']?.primaryColor} />
            <View style={{ flex: 1 }}>
              <Text style={styles.missionName}>{shortName(p)}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {p.positions[0]} · {p.age} · OVR {to100(naturalOverallFine(p))} · {state.clubs[p.clubId ?? '']?.name ?? ''}
              </Text>
              <Text style={styles.prospectPot}>{t('scout.pot', { v: r ? potText(r.min, r.max, r.exact) : '?' })}</Text>
            </View>
            <Pressable disabled={!can} onPress={() => scoutPlayer(p.id)} style={[styles.leagueBtn, !can && { opacity: 0.4 }]}>
              <Text style={styles.leagueBtnText}>{t('scout.sondar')}</Text>
            </Pressable>
          </View>
        );
      })}

      {prospects.length > 0 ? (
        <>
          <Section title={t('scout.prospects', { n: prospects.length })} />
          {prospects.map((p) => (
            <View key={p.id} style={styles.missionRow}>
              <Face seed={p.id} size={30} shirt={state.clubs[p.clubId ?? '']?.primaryColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.missionName}>{shortName(p)}</Text>
                <Text style={styles.sub} numberOfLines={1}>{p.positions[0]} · {p.age} · OVR {to100(naturalOverallFine(p))} · {state.clubs[p.clubId ?? '']?.name ?? ''}</Text>
                <Text style={styles.prospectPot}>{t('scout.pot', { v: to100(p.potential) })}</Text>
              </View>
              <Pressable onPress={() => onSign(p)} style={styles.signBtn}>
                <Text style={styles.leagueBtnText}>{t('scout.sign')}</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}

      <Section title={t('scout.leagues')} />
      {leagues.map((l) => {
        const can = canScoutL(l.id);
        return (
          <View key={l.id} style={styles.leagueRow}>
            <Text style={styles.missionName}>{l.name}</Text>
            <Pressable disabled={!can} onPress={() => scoutLeague(l.id)} style={[styles.leagueBtn, !can && { opacity: 0.4 }]}>
              <Text style={styles.leagueBtnText}>{t('scout.scoutLeague')}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Aba EMPRÉSTIMOS: receber jovens (ver anúncio), emprestar os nossos, gerir os ativos. */
function LoansPanel() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const loanInList = useGameStore((s) => s.loanInList);
  const loanOutList = useGameStore((s) => s.loanOutList);
  const doLoanIn = useGameStore((s) => s.doLoanIn);
  const doLoanOut = useGameStore((s) => s.doLoanOut);
  const doTerminateLoan = useGameStore((s) => s.doTerminateLoan);
  const isFocused = useIsFocused();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [adBusy, setAdBusy] = useState(false);
  if (!state) return null;
  const managedId = state.meta.managedClubId;
  // PERF: as listas percorrem ~800 jogadores — só com a aba focada.
  const inList = isFocused ? loanInList().slice(0, 20) : [];
  const outList = isFocused ? loanOutList() : [];
  // Emprestados que já temos no plantel (recebidos) — para dispensar.
  const active = (state.clubs[managedId]?.squad ?? [])
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p && !!p.condition.loanOwnerId);

  // Receber por empréstimo: ver anúncio primeiro; só com a recompensa é que assina.
  const loanInWithAd = async (p: Player) => {
    if (adBusy) return;
    setAdBusy(true);
    const watched = await showRewarded();
    setAdBusy(false);
    if (!watched) { setFeedback({ kind: 'error', text: t('loan.in.adFailed') }); return; }
    const r = doLoanIn(p.id);
    setFeedback(r.ok
      ? { kind: 'ok', text: t('loan.in.toast', { name: p.lastName }) }
      : { kind: 'error', text: r.errorKey ? t(r.errorKey) : t('loan.err.invalid') });
  };

  const row = (p: Player, sub: string, action: React.ReactNode) => (
    <View key={p.id} style={styles.missionRow}>
      <Face seed={p.id} size={30} shirt={state.clubs[p.clubId ?? '']?.primaryColor} />
      <View style={{ flex: 1 }}>
        <Text style={styles.missionName}>{shortName(p)}</Text>
        <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
      </View>
      {action}
    </View>
  );

  return (
    <>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind === 'error' ? 'error' : 'ok'} onHide={() => setFeedback(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
        {/* Empréstimos ATIVOS (recebidos) — mostra salário que pagamos e permite dispensar. */}
        {active.length > 0 ? (
          <>
            <Section title={t('loan.active.title')} />
            {active.map((p) => row(
              p,
              `${p.positions[0]} · ${p.age} · ${t('loan.wageLabel', { v: wage(p.wage) })} · ${t('loan.from', { club: state.clubs[p.condition.loanOwnerId ?? '']?.name ?? '' })}`,
              (
                <Pressable style={styles.dispenseBtn} onPress={() => {
                  const r = doTerminateLoan(p.id);
                  setFeedback(r.ok
                    ? { kind: 'ok', text: t('loan.dispense.toast', { name: p.lastName }) }
                    : { kind: 'error', text: r.errorKey ? t(r.errorKey) : t('loan.err.invalid') });
                }}>
                  <Text style={styles.leagueBtnText}>{t('loan.dispense.button')}</Text>
                </Pressable>
              ),
            ))}
          </>
        ) : null}

        <Section title={t('loan.in.title')} />
        <Text style={styles.emptyNote}>{t('loan.in.adHint')}</Text>
        {inList.length === 0 ? <Text style={styles.emptyNote}>{t('loan.in.empty')}</Text> : inList.map((p) =>
          row(
            p,
            `${p.positions[0]} · ${p.age} · OVR ${to100(naturalOverallFine(p))} · ${t('loan.wageLabel', { v: wage(p.wage) })}`,
            (
              <Pressable style={[styles.leagueBtn, adBusy && { opacity: 0.4 }]} disabled={adBusy}
                onPress={() => loanInWithAd(p)}>
                <Text style={styles.leagueBtnText}>{adBusy ? t('loan.in.watching') : `▶ ${t('loan.in.button')}`}</Text>
              </Pressable>
            ),
          ),
        )}

        <Section title={t('loan.out.title')} />
        {outList.length === 0 ? <Text style={styles.emptyNote}>{t('loan.out.empty')}</Text> : outList.map((p) =>
          row(
            p,
            `${p.positions[0]} · ${p.age} · OVR ${to100(naturalOverallFine(p))} · ${state.clubs[p.clubId ?? '']?.name ?? ''}`,
            (
              <Pressable style={styles.signBtn} onPress={() => {
                const r = doLoanOut(p.id);
                setFeedback(r.ok
                  ? { kind: 'ok', text: t('loan.out.toast', { name: p.lastName, club: r.clubName ?? '' }) }
                  : { kind: 'error', text: r.errorKey ? t(r.errorKey) : t('loan.err.invalid') });
              }}>
                <Text style={styles.leagueBtnText}>{t('loan.out.button')}</Text>
              </Pressable>
            ),
          ),
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  segRow: { flexDirection: 'row', gap: theme.spacing(0.75), marginTop: theme.spacing(1) },
  segBtn: { flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  segOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  segText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  segTextOn: { color: theme.colors.blue },

  filterScroll: { flexGrow: 0, flexShrink: 0, height: 46, marginBottom: theme.spacing(0.5) },
  filterBar: { gap: 6, alignItems: 'center', paddingVertical: theme.spacing(0.5) },
  fChip: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 100, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  fChipOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  fChipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  fChipTextOn: { color: theme.colors.blue },
  minOvrGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  stepBtn: { color: theme.colors.blue, fontSize: 18, fontWeight: '800', width: 20, textAlign: 'center' },
  minOvrVal: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },

  scoutHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing(1.25) },
  scoutTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  scoutHint: { color: theme.colors.textDim, fontSize: theme.font.small, maxWidth: 130, textAlign: 'right' },
  emptyNote: { color: theme.colors.textDim, fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(1) },
  missionName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  progTrack: { height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginTop: 4, overflow: 'hidden' },
  progFill: { height: 4, borderRadius: 2, backgroundColor: theme.colors.green },
  prospectPot: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '800' },
  leagueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing(0.9) },
  leagueBtn: { backgroundColor: theme.colors.blue, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(0.75), paddingHorizontal: theme.spacing(1.5) },
  signBtn: { backgroundColor: theme.colors.green, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(0.75), paddingHorizontal: theme.spacing(1.5) },
  dispenseBtn: { backgroundColor: theme.colors.red, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(0.75), paddingHorizontal: theme.spacing(1.5) },
  leagueBtnText: { color: '#fff', fontSize: theme.font.small, fontWeight: '700' },
  scoutTag: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '800' },

  windowClosed: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.yellow, borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginTop: theme.spacing(1) },
  windowClosedText: { color: theme.colors.yellow, fontSize: theme.font.body, fontWeight: '700' },
  windowSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  windowOpen: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(1) },
  budgetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(1.25),
  },
  budgetLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 1.2 },
  reserved: { color: theme.colors.yellow, fontSize: theme.font.small, marginTop: 2 },
  budgetVal: { color: theme.colors.green, fontSize: theme.font.h2, fontWeight: '700', fontVariant: ['tabular-nums'] },
  feedback: { fontSize: theme.font.body, fontWeight: '600', marginBottom: theme.spacing(1) },

  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1), marginBottom: theme.spacing(0.5),
  },
  pendingCounter: { borderColor: theme.colors.yellow },
  pendingName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  withdraw: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '700', paddingHorizontal: 4 },

  headRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.75), gap: 4,
    backgroundColor: theme.colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  hOn: { color: theme.colors.blue },
  hCenter: { textAlign: 'center' },
  hRight: { textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1.15), gap: 7 },
  rowOpen: { backgroundColor: theme.colors.surfaceAlt },
  rowLocked: { opacity: 0.45 },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  ovrBig: { fontSize: 16, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  divLabel: { color: theme.colors.blue, fontSize: 10, fontWeight: '700', marginTop: 1 },
  dim: { color: theme.colors.textDim },
  cOvr: { width: 34, textAlign: 'center' },
  cName: { flex: 1 },
  cNum: { width: 24, textAlign: 'center' },
  cVal: { width: 62, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  lockedTag: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  pendingTag: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
  bonusTag: { color: theme.colors.yellow, fontSize: 9, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: theme.spacing(2) },
  negBox: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(1.5),
  },
  negHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing(0.5) },
  negTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  negRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.75),
  },
  negLabel: { color: theme.colors.textDim, fontSize: theme.font.body },
  bonusNote: { color: theme.colors.yellow, fontSize: theme.font.small, paddingVertical: theme.spacing(0.75) },
  delayNote: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 6 },
});
