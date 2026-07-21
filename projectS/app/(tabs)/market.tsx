import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import { suggestedWage } from '../../src/core/economy';
import { activeOffers, Reachability } from '../../src/core/game';
import { naturalOverall, Player } from '../../src/core/models';
import { money, wage } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Body, Button, PosText, RowKV, Screen, Section, Stepper } from '../components';

type Feedback = { kind: 'ok' | 'counter' | 'error'; text: string } | null;

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

  // Negociação inline: jogador selecionado + termos atuais.
  const [openId, setOpenId] = useState<string | null>(null);
  const [fee, setFee] = useState(0);
  const [wageOffer, setWageOffer] = useState(0);
  const [years, setYears] = useState(3);
  const [bonus, setBonus] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const targets = useMemo(() => {
    if (!state) return [];
    return Object.values(state.players)
      .filter((p) => p.clubId && p.clubId !== managedId)
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 100);
  }, [state, managedId]);

  const pending = state ? activeOffers(state) : [];

  if (!state || !managedId) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const openNegotiation = (p: Player, reach: Reachability) => {
    setOpenId(p.id);
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
      setOpenId(null);
    } else {
      setFeedback({ kind: 'error', text: res.errorKey ? t(res.errorKey, res.errorParams) : t('mkt.rejected') });
    }
  };

  return (
    <Screen>
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

      {feedback ? (
        <Text style={[styles.feedback, {
          color: feedback.kind === 'ok' ? theme.colors.green
            : feedback.kind === 'counter' ? theme.colors.yellow : theme.colors.red,
        }]}>
          {feedback.text}
        </Text>
      ) : null}

      <FlatList
        data={targets}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View>
            {/* Propostas à espera de resposta — o suspense fica visível. */}
            {pending.length > 0 ? (
              <View style={{ marginBottom: theme.spacing(1) }}>
                <Section title={t('mkt.pending', { n: pending.length })} />
                {pending.map((o) => {
                  const p = state.players[o.playerId];
                  if (!p) return null;
                  const counter = o.status === 'COUNTER';
                  return (
                    <View key={o.id} style={[styles.pendingRow, counter && styles.pendingCounter]}>
                      <Face seed={p.id} size={26} shirt={state.clubs[o.toClubId]?.primaryColor} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pendingName}>{p.lastName}</Text>
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

            <View style={styles.headRow}>
              <Text style={[styles.h, styles.cOvr]}>OVR</Text>
              <Text style={[styles.h, styles.cName]}>{t('mkt.col.name')}</Text>
              <Text style={[styles.h, styles.cNum]}>{t('mkt.col.id')}</Text>
              <Text style={[styles.h, styles.cVal]}>{t('mkt.col.value')}</Text>
              <Text style={[styles.h, styles.cVal]}>{t('mkt.col.wage')}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const reach = reachOf(item.id);
          const locked = reach?.status === 'LOCKED';
          const hasOffer = pending.some((o) => o.playerId === item.id);
          return (
            <View>
              <TargetRow
                player={item}
                clubName={state.clubs[item.clubId!]?.shortName ?? ''}
                clubColor={state.clubs[item.clubId!]?.primaryColor}
                open={openId === item.id}
                locked={!!locked}
                needsBonus={reach?.status === 'BONUS'}
                pending={hasOffer}
                onPress={() => {
                  if (locked || hasOffer || !reach) return;
                  if (openId === item.id) setOpenId(null);
                  else openNegotiation(item, reach);
                }}
              />
              {openId === item.id && reach ? (
                <View style={styles.negBox}>
                  <RowKV k={t('mkt.marketValue')} v={money(item.marketValue)} />
                  {reach.status === 'BONUS' ? (
                    <Text style={styles.bonusNote}>{t(reach.reasonKey, reach.reasonParams)}</Text>
                  ) : null}
                  <View style={styles.negRow}>
                    <Text style={styles.negLabel}>{t('mkt.yourOffer')}</Text>
                    <Stepper
                      value={fee}
                      onChange={setFee}
                      step={Math.max(50_000, Math.round(item.marketValue * 0.05 / 1000) * 1000)}
                      min={0}
                      format={money}
                    />
                  </View>
                  <View style={styles.negRow}>
                    <Text style={styles.negLabel}>{t('mkt.wage')}</Text>
                    <Stepper
                      value={wageOffer}
                      onChange={setWageOffer}
                      step={Math.max(100, Math.round(wageOffer * 0.1 / 100) * 100)}
                      min={100}
                      format={(v) => wage(v)}
                    />
                  </View>
                  {reach.status === 'BONUS' ? (
                    <View style={styles.negRow}>
                      <Text style={styles.negLabel}>{t('mkt.signingBonus')}</Text>
                      <Stepper
                        value={bonus}
                        onChange={setBonus}
                        step={Math.max(10_000, Math.round(reach.requiredSigningBonus * 0.1 / 10_000) * 10_000)}
                        min={0}
                        format={money}
                      />
                    </View>
                  ) : null}
                  <View style={styles.negRow}>
                    <Text style={styles.negLabel}>{t('mkt.duration')}</Text>
                    <Stepper value={years} onChange={setYears} step={1} min={1} max={5} format={(v) => t('tac.years', { n: v })} />
                  </View>
                  <View style={{ marginTop: theme.spacing(1) }}>
                    <Button
                      label={
                        !win.open ? t('mkt.closedBtn')
                          : fee + bonus > budget ? t('mkt.budgetShort')
                          : t('mkt.send')
                      }
                      disabled={!win.open || fee + bonus > budget}
                      onPress={() => send(item)}
                    />
                    <Text style={styles.delayNote}>{t('mkt.delayNote')}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: theme.spacing(3) }}
      />
    </Screen>
  );
}

function TargetRow({
  player, clubName, clubColor, open, locked, needsBonus, pending, onPress,
}: {
  player: Player; clubName: string; clubColor?: string;
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
      <Text style={[styles.cell, styles.cOvr, { color: locked ? theme.colors.textDim : attrColor(ovr), fontWeight: '700' }]}>
        {ovr}
      </Text>
      <Face seed={player.id} size={26} shirt={clubColor} />
      <View style={styles.cName}>
        <Text style={[styles.cell, locked && styles.dim]} numberOfLines={1}>{player.lastName}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <PosText position={player.positions[0]!} style={{ fontSize: 9 }} />
          <Text style={styles.sub}>{clubName}</Text>
          {needsBonus ? <Text style={styles.bonusTag}>{t('mkt.bonusTag')}</Text> : null}
        </View>
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

const styles = StyleSheet.create({
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

  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.75), gap: 4 },
  h: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(0.9), gap: 6 },
  rowOpen: { backgroundColor: theme.colors.surfaceAlt },
  rowLocked: { opacity: 0.45 },
  cell: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  dim: { color: theme.colors.textDim },
  cOvr: { width: 26, textAlign: 'center' },
  cName: { flex: 1 },
  cNum: { width: 24, textAlign: 'center' },
  cVal: { width: 62, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  lockedTag: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  pendingTag: { color: theme.colors.yellow, fontSize: theme.font.small, fontWeight: '700' },
  bonusTag: { color: theme.colors.yellow, fontSize: 9, fontWeight: '700' },

  negBox: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(1.5), marginVertical: theme.spacing(1),
  },
  negRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.75),
  },
  negLabel: { color: theme.colors.textDim, fontSize: theme.font.body },
  bonusNote: { color: theme.colors.yellow, fontSize: theme.font.small, paddingVertical: theme.spacing(0.75) },
  delayNote: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 6 },
});
