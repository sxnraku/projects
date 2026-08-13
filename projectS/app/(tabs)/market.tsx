import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { Spot } from '../../src/ui/tutorial/Spot';
import { TutorialTargets } from '../../src/ui/tutorial/registry';
import {
  checkInterest, defaultReleaseClause, minReleaseClause, requiredWageWith, suggestedWage,
} from '../../src/core/economy';
import {
  activeOffers, BOSMAN_WINDOW_ROUNDS, loanOptionFee, loanOptionPrice, marketShortlist,
  MAX_LOANS_IN, MAX_PRE_CONTRACTS, Reachability,
} from '../../src/core/game';
import { naturalOverall, naturalOverallFine, Player, POSITION_GROUP, PositionGroup, shortName } from '../../src/core/models';
import { money, to100, wage } from '../../src/ui/format';
import { useT, useTMsg } from '../../src/ui/i18n';
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

/**
 * Degraus de preço para os filtros do mercado.
 *
 * Escala por saltos e não linear: entre 0 e 20M uma escala linear obrigaria a
 * dezenas de toques. Assim chega-se a qualquer ordem de grandeza em poucos.
 */
const PRICE_STEPS = [
  0, 100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
  3_000_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000,
  30_000_000, 50_000_000, 75_000_000, 100_000_000,
];

function stepPrice(current: number, dir: 1 | -1): number {
  const i = PRICE_STEPS.indexOf(current);
  const from = i >= 0 ? i : PRICE_STEPS.findIndex((v) => v > current);
  const next = Math.max(0, Math.min(PRICE_STEPS.length - 1, (from < 0 ? 0 : from) + dir));
  return PRICE_STEPS[next]!;
}

export default function Market() {
  const t = useT();
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const submitOffer = useGameStore((s) => s.submitOffer);
  const withdraw = useGameStore((s) => s.withdrawOffer);
  const marketWindow = useGameStore((s) => s.marketWindow);
  const freeBudget = useGameStore((s) => s.freeBudget);
  const committed = useGameStore((s) => s.committedBudget);
  const reachOf = useGameStore((s) => s.reachOf);
  const potentialRangeOf = useGameStore((s) => s.potentialRangeOf);
  const win = marketWindow();

  const managedId = state?.meta.managedClubId;
  const budget = freeBudget();
  const reserved = committed();

  const [view, setView] = useState<'market' | 'free' | 'scouts' | 'loans'>('market');
  // Negociação em modal — pode abrir do Mercado OU dos Olheiros.
  const [nego, setNego] = useState<{ player: Player; reach: Reachability } | null>(null);
  const [fee, setFee] = useState(0);
  const [wageOffer, setWageOffer] = useState(0);
  const [years, setYears] = useState(3);
  const [bonus, setBonus] = useState(0);
  const [clause, setClause] = useState(0); // cláusula de rescisão do contrato proposto
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
  // Intervalo de PREÇO, em euros. Independente do saldo: quem tem 20M e quer
  // gastar 5M precisa de cortar a lista, e o "só acessíveis" não faz isso.
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0); // 0 = sem teto

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
    if (priceMin > 0) list = list.filter((e) => e.player.marketValue >= priceMin);
    if (priceMax > 0) list = list.filter((e) => e.player.marketValue <= priceMax);
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
  }, [baseTargets, posFilter, minOvr, affordOnly, priceMin, priceMax, sortKey, sortDir]);

  const pending = state ? activeOffers(state) : [];

  if (!state || !managedId) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const openNegotiation = (p: Player, reach: Reachability | null) => {
    if (!reach || reach.status === 'LOCKED') {
      setFeedback({ kind: 'error', text: t('mkt.noInterest') });
      return;
    }
    setNego({ player: p, reach });
    // Cláusula de rescisão: arranca na sugestão (2× o valor), que é também o
    // que o jogador espera. Baixá-la desconta no ordenado e expõe-nos a perdê-lo.
    const suggested = defaultReleaseClause(p, state.meta.season);
    setClause(suggested);
    setFee(Math.round(p.marketValue / 1000) * 1000);
    setWageOffer(requiredWageWith(p, state.meta.season, { releaseClause: suggested }));
    setYears(3);
    setBonus(reach.status === 'BONUS' ? reach.requiredSigningBonus : 0);
    setFeedback(null);
  };

  const send = (p: Player) => {
    const res = submitOffer({
      playerId: p.id, fromClubId: managedId, fee, wageOffer, contractYears: years,
      signingBonus: bonus,
      clauses: { releaseClause: clause },
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
        <Pressable style={[styles.segBtn, view === 'free' && styles.segOn]} onPress={() => setView('free')}>
          <Text style={[styles.segText, view === 'free' && styles.segTextOn]}>{t('free.title')}</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, view === 'scouts' && styles.segOn]} onPress={() => setView('scouts')}>
          <Text style={[styles.segText, view === 'scouts' && styles.segTextOn]}>{t('mkt.tab.scouts')}</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, view === 'loans' && styles.segOn]} onPress={() => setView('loans')}>
          <Text style={[styles.segText, view === 'loans' && styles.segTextOn]}>{t('mkt.tab.loans')}</Text>
        </Pressable>
      </View>

      {view === 'loans' ? <LoansPanel /> : view === 'free' ? <FreeAgentsPanel /> : view === 'scouts' ? <ScoutsPanel onSign={signFromScouts} /> : (
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
      <Spot id={TutorialTargets.marketList}>
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
        {/* INTERVALO DE PREÇO. Os degraus são os que se usam a pensar em
            reforços (250k, 500k, 1M, 2M, 5M…), e não uma escala linear que
            obrigaria a vinte toques para sair de 0. */}
        <View style={styles.minOvrGroup}>
          <Text style={styles.fChipText}>{t('mkt.priceFrom')}</Text>
          <Pressable onPress={() => setPriceMin((v) => stepPrice(v, -1))} hitSlop={6}><Text style={styles.stepBtn}>−</Text></Pressable>
          <Text style={styles.priceVal}>{priceMin > 0 ? money(priceMin) : '—'}</Text>
          <Pressable onPress={() => setPriceMin((v) => stepPrice(v, 1))} hitSlop={6}><Text style={styles.stepBtn}>+</Text></Pressable>
        </View>
        <View style={styles.minOvrGroup}>
          <Text style={styles.fChipText}>{t('mkt.priceTo')}</Text>
          <Pressable onPress={() => setPriceMax((v) => stepPrice(v, -1))} hitSlop={6}><Text style={styles.stepBtn}>−</Text></Pressable>
          <Text style={styles.priceVal}>{priceMax > 0 ? money(priceMax) : t('mkt.noCap')}</Text>
          <Pressable onPress={() => setPriceMax((v) => stepPrice(v, 1))} hitSlop={6}><Text style={styles.stepBtn}>+</Text></Pressable>
        </View>
        {priceMin > 0 || priceMax > 0 ? (
          <Pressable onPress={() => { setPriceMin(0); setPriceMax(0); }} style={styles.fChip}>
            <Text style={styles.fChipText}>{t('mkt.clearPrice')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      </Spot>

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
        {/* Espaçador do avatar: sem ele o cabeçalho começava 39px à esquerda do
            conteúdo e cada título ficava por cima da coluna errada. */}
        <View style={styles.avatarGap} />
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
          const pot = potentialRangeOf(player.id);
          return (
            <TargetRow
              player={player}
              pot={pot ? potText(pot.min, pot.max, pot.exact) : '?'}
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
                <RowKV k={t('mkt.potential')} v={(() => {
                  const r = potentialRangeOf(nego.player.id);
                  return r ? potText(r.min, r.max, r.exact) : '?';
                })()} />
                <Pressable onPress={() => { const id = nego.player.id; setNego(null); router.push(`/player/${id}`); }}>
                  <Text style={styles.negLink}>{t('mkt.openSheet')}</Text>
                </Pressable>
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
                {/* CLÁUSULA DE RESCISÃO — baixa = ordenado mais barato agora e
                    risco de o perderem por uma pechincha; alta = folha pesada. */}
                <View style={styles.negRow}>
                  <Text style={styles.negLabel}>{t('clause.release')}</Text>
                  <Stepper value={clause} onChange={setClause}
                    step={Math.max(50_000, Math.round(nego.player.marketValue * 0.2 / 50_000) * 50_000)}
                    min={minReleaseClause(nego.player, state.meta.season)}
                    format={money} />
                </View>
                <Text style={styles.delayNote}>
                  {t('clause.asksNow')}: {wage(requiredWageWith(nego.player, state.meta.season, { releaseClause: clause }))}
                </Text>
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
  player, pot, clubName, divLabel, clubColor, open, locked, needsBonus, pending, onPress,
}: {
  player: Player; pot: string; clubName: string; divLabel: string; clubColor?: string;
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
      {/* Coluna do NOME. `minWidth: 0` + `overflow: hidden` são o que impede a
          linha de detalhe (posição · POT · clube) de crescer para lá da coluna
          e desenhar por cima do valor e do salário — era esse o texto
          sobreposto que se via nas linhas do mercado. */}
      <View style={styles.cName}>
        <Text style={[styles.cell, locked && styles.dim]} numberOfLines={1}>{shortName(player)}</Text>
        <View style={styles.metaRow}>
          <PosText position={player.positions[0]!} style={{ fontSize: 9 }} />
          <Text style={styles.potTag}>{t('mkt.potShort', { pot })}</Text>
          <Text style={[styles.sub, styles.clubName]} numberOfLines={1}>{clubName}</Text>
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
          <Text style={[styles.cell, styles.cNum, styles.dim]} numberOfLines={1}>{player.age}</Text>
          <Text style={[styles.cell, styles.cVal]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {money(player.marketValue)}
          </Text>
          <Text style={[styles.cell, styles.cVal, styles.dim]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {wage(player.wage)}
          </Text>
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
  // Negociar opção de compra em TODOS os empréstimos que se receberem a seguir.
  const [withOption, setWithOption] = useState(false);
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
    const r = doLoanIn(p.id, withOption);
    setFeedback(r.ok
      ? {
        kind: 'ok',
        text: withOption
          ? t('loan.in.toastOption', { name: p.lastName, price: money(loanOptionPrice(p)) })
          : t('loan.in.toast', { name: p.lastName }),
      }
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
        <Text style={styles.emptyNote}>
          {t('loan.in.count', { n: active.length, max: MAX_LOANS_IN })} {t('loan.in.adHint')}
        </Text>

        {/* OPÇÃO DE COMPRA — paga-se já uma taxa e o preço fica travado no valor
            de hoje. Se o miúdo crescer durante o empréstimo, fica-se com ele
            barato; se não crescer, perdeu-se a taxa. */}
        <Pressable style={[styles.optionToggle, withOption && styles.optionToggleOn]}
          onPress={() => setWithOption((v) => !v)}>
          <Text style={[styles.optionToggleText, withOption && styles.optionToggleTextOn]}>
            {withOption ? '☑' : '☐'} {t('loan.option.toggle')}
          </Text>
        </Pressable>
        <Text style={styles.emptyNote}>{t('loan.option.hint')}</Text>

        {inList.length === 0 ? <Text style={styles.emptyNote}>{t('loan.in.empty')}</Text> : inList.map((p) =>
          row(
            p,
            withOption
              ? `${p.positions[0]} · ${p.age} · OVR ${to100(naturalOverallFine(p))} · ${t('loan.option.price', { fee: money(loanOptionFee(p)), price: money(loanOptionPrice(p)) })}`
              : `${p.positions[0]} · ${p.age} · OVR ${to100(naturalOverallFine(p))} · ${t('loan.wageLabel', { v: wage(p.wage) })}`,
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
  freeName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  freeSub: { color: theme.colors.textDim, fontSize: 11, marginBottom: 8, lineHeight: 15 },
  freeEmpty: { color: theme.colors.textDim, fontSize: 12, fontStyle: 'italic', marginVertical: 8 },
  freeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border + '55',
  },
  freeWho: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  freeBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: theme.colors.green,
  },
  freeBtnOff: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  freeBtnText: { color: '#04240f', fontSize: 12, fontWeight: '800' },
  freeYears: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, paddingVertical: 6,
  },
  freeYearsLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  freeYearsBtns: { flexDirection: 'row', gap: 5 },
  freeYearBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  freeYearOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '22' },
  freeYearText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '700' },
  freeYearTextOn: { color: theme.colors.accent },
  dealBox: {
    backgroundColor: theme.colors.surface, borderRadius: 12, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: theme.colors.accent + '55',
  },
  dealTitle: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  dealCancel: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  dealCancelText: { color: theme.colors.textDim, fontSize: 11, fontWeight: '700' },

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
  priceVal: {
    color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700',
    minWidth: 58, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  stepBtn: { color: theme.colors.blue, fontSize: 18, fontWeight: '800', width: 20, textAlign: 'center' },
  minOvrVal: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },

  scoutHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing(1.25) },
  scoutTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  scoutHint: { color: theme.colors.textDim, fontSize: theme.font.small, maxWidth: 130, textAlign: 'right' },
  emptyNote: { color: theme.colors.textDim, fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  optionToggle: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(0.85), marginTop: theme.spacing(0.5),
  },
  optionToggleOn: { borderColor: theme.colors.green, backgroundColor: theme.colors.surfaceAlt },
  optionToggleText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800' },
  optionToggleTextOn: { color: theme.colors.green },
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
    flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.75), gap: 7,
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
  avatarGap: { width: 32 },
  // `minWidth: 0` deixa a coluna encolher abaixo do conteúdo (sem isto o flex
  // respeita a largura natural do texto e a linha transborda); `overflow`
  // garante que nada é desenhado fora dela.
  cName: { flex: 1, minWidth: 0, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', gap: 6, alignItems: 'center', minWidth: 0 },
  clubName: { flexShrink: 1 },
  cNum: { width: 22, textAlign: 'center' },
  cVal: { width: 68, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  lockedTag: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  pendingTag: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
  bonusTag: { color: theme.colors.yellow, fontSize: 9, fontWeight: '700' },
  potTag: { color: theme.colors.blue, fontSize: 9, fontWeight: '700' },
  negLink: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(0.5) },

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


/**
 * LIVRES E PRÉ-CONTRATOS.
 *
 * Duas listas no mesmo sítio porque são a mesma decisão vista de dois lados:
 * quem já está sem clube (assina hoje, sem passe) e quem vai ficar sem clube no
 * verão (prende-se agora, chega depois). A janela de transferências não trava
 * nem uma nem outra — é assim no futebol a sério.
 */
function FreeAgentsPanel() {
  const t = useT();
  const tMsg = useTMsg();
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const freeAgents = useGameStore((s) => s.freeAgents);
  const askingWage = useGameStore((s) => s.askingWage);
  const signFree = useGameStore((s) => s.signFree);
  const preWindowOpen = useGameStore((s) => s.preWindowOpen);
  const preTargets = useGameStore((s) => s.preTargets);
  const preDeals = useGameStore((s) => s.preDeals);
  const agreePre = useGameStore((s) => s.agreePre);
  const cancelPre = useGameStore((s) => s.cancelPre);

  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [years, setYears] = useState(2);

  const club = state ? state.clubs[state.meta.managedClubId] : null;
  const tier = state && club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;

  // Só mostramos quem o clube consegue mesmo convencer: uma lista cheia de
  // nomes que recusam todos é ruído, não é mercado.
  const reachable = useMemo(() => {
    if (!state || !club) return [];
    return freeAgents().filter((p) => checkInterest(p, club, tier).interested).slice(0, 40);
  }, [state, club, tier, freeAgents]);

  const targets = useMemo(() => {
    if (!state || !club) return [];
    return preTargets().filter((p) => checkInterest(p, club, tier).interested).slice(0, 25);
  }, [state, club, tier, preTargets]);

  if (!state || !club) return <Body>{t('common.loading')}</Body>;

  const deals = preDeals();
  const windowOpen = preWindowOpen();

  return (
    <>
      <Toast text={note?.text ?? null} kind={note?.kind ?? 'ok'} onHide={() => setNote(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Duração do contrato — vale para as duas listas. */}
        <View style={styles.freeYears}>
          <Text style={styles.freeYearsLabel}>{t('free.years', { n: years })}</Text>
          <View style={styles.freeYearsBtns}>
            {[1, 2, 3, 4, 5].map((y) => (
              <Pressable key={y} onPress={() => setYears(y)} style={[styles.freeYearBtn, years === y && styles.freeYearOn]}>
                <Text style={[styles.freeYearText, years === y && styles.freeYearTextOn]}>{y}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ---------------- LIVRES ---------------- */}
        <Section title={t('free.title')} />
        <Text style={styles.freeSub}>{t('free.subtitle')}</Text>
        {reachable.length === 0 ? (
          <Text style={styles.freeEmpty}>{t('free.none')}</Text>
        ) : reachable.map((p) => {
          const wage = askingWage(p.id);
          return (
            <View key={p.id} style={styles.freeRow}>
              <Pressable style={styles.freeWho} onPress={() => router.push(`/player/${p.id}` as never)}>
                <Face seed={p.id} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.freeName} numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {p.positions[0]} · {p.age} · OVR {to100(naturalOverallFine(p))} · {t('free.asks', { wage: money(wage) })}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  const r = signFree(p.id, wage, years);
                  setNote(r.ok
                    ? { kind: 'ok', text: t('free.signed', { player: p.lastName }) }
                    : { kind: 'error', text: tMsg({ key: r.errorKey ?? '', params: r.params }) });
                }}
                style={styles.freeBtn}>
                <Text style={styles.freeBtnText}>{t('free.sign')}</Text>
              </Pressable>
            </View>
          );
        })}

        {/* ---------------- PRÉ-CONTRATOS ---------------- */}
        <Section title={t('pre.title')} />
        <Text style={styles.freeSub}>{t('pre.subtitle')}</Text>

        {deals.length > 0 ? (
          <View style={styles.dealBox}>
            <Text style={styles.dealTitle}>{t('pre.list', { n: deals.length, max: MAX_PRE_CONTRACTS })}</Text>
            {deals.map((d) => (
              <View key={d.playerId} style={styles.dealRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.freeName} numberOfLines={1}>{d.playerName}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {t('pre.from', { club: d.fromClubName })} · {money(d.wage)}/sem · {t('free.years', { n: d.years })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    cancelPre(d.playerId);
                    setNote({ kind: 'ok', text: t('pre.cancelled', { player: d.playerName }) });
                  }}
                  style={styles.dealCancel}>
                  <Text style={styles.dealCancelText}>{t('pre.cancel')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {!windowOpen ? (
          <Text style={styles.freeEmpty}>{t('pre.closed', { rounds: BOSMAN_WINDOW_ROUNDS })}</Text>
        ) : targets.length === 0 ? (
          <Text style={styles.freeEmpty}>{t('pre.none', { n: 0 })}</Text>
        ) : targets.map((p) => {
          // Um pré-contrato custa mais em ordenado: ele sabe que não há passe.
          const wage = Math.round(askingWage(p.id) * 1.15);
          const already = deals.some((d) => d.playerId === p.id);
          return (
            <View key={p.id} style={styles.freeRow}>
              <Pressable style={styles.freeWho} onPress={() => router.push(`/player/${p.id}` as never)}>
                <Face seed={p.id} size={30} shirt={state.clubs[p.clubId ?? '']?.primaryColor} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.freeName} numberOfLines={1}>{p.firstName} {p.lastName}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {p.positions[0]} · {p.age} · OVR {to100(naturalOverallFine(p))} · {state.clubs[p.clubId ?? '']?.name ?? ''}
                  </Text>
                  <Text style={styles.sub}>{t('free.asks', { wage: money(wage) })}</Text>
                </View>
              </Pressable>
              <Pressable
                disabled={already}
                onPress={() => {
                  const r = agreePre(p.id, wage, years);
                  setNote(r.ok
                    ? { kind: 'ok', text: t('pre.agreed', { player: p.lastName }) }
                    : { kind: 'error', text: tMsg({ key: r.errorKey ?? '', params: r.params }) });
                }}
                style={[styles.freeBtn, already && styles.freeBtnOff]}>
                <Text style={[styles.freeBtnText, already && { color: theme.colors.textDim }]}>
                  {already ? '✓' : t('free.sign')}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}
