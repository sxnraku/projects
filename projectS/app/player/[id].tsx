import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGameStore } from '../../src/state/gameStore';
import { bidForPlayer, isWonderkid } from '../../src/core/game';
import { suggestedWage } from '../../src/core/economy';
import { naturalOverall } from '../../src/core/models';
import { money, wage } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { Body, Button, PosText, RowKV, Screen, StatBar, Stepper } from '../components';

type Tab = 'OVERVIEW' | 'STATS' | 'CONTRACT' | 'SELL';
const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'OVERVIEW', labelKey: 'player.tab.overview' },
  { key: 'STATS', labelKey: 'player.tab.stats' },
  { key: 'CONTRACT', labelKey: 'player.tab.contract' },
  { key: 'SELL', labelKey: 'player.tab.sell' },
];

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const state = useGameStore((s) => s.state);
  const renewPlayer = useGameStore((s) => s.renewPlayer);
  const setListed = useGameStore((s) => s.setListed);
  const acceptBid = useGameStore((s) => s.acceptBid);

  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [years, setYears] = useState(3);
  const [renewMsg, setRenewMsg] = useState<string | null>(null);
  const [sellMsg, setSellMsg] = useState<string | null>(null);

  const player = state?.players[id ?? ''];
  if (!state || !player) return <Screen><Body>{t('player.notFound')}</Body></Screen>;

  const ovr = naturalOverall(player);
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const a = player.attributes;
  const askedWage = suggestedWage(player, state.meta.season);
  const isOurs = player.clubId === state.meta.managedClubId;
  const pendingBid = isOurs ? bidForPlayer(state, player.id) : null;

  return (
    <Screen>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <Face
          seed={player.id}
          size={54}
          shirt={club?.primaryColor}
          ring={player.condition.status === 'INJURED' ? theme.colors.red : undefined}
        />
        <View style={[styles.ovrBox, { backgroundColor: attrColor(ovr) }]}>
          <Text style={styles.ovrText}>{ovr}</Text>
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
        {TABS.filter((tb) => tb.key !== 'SELL' || isOurs).map((tb) => (
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
            <RowKV k={t('player.overall')} v={String(ovr)} vColor={attrColor(ovr)} />
            <RowKV k={t('player.potential')} v={String(player.potential)} vColor={attrColor(player.potential)} />
            <RowKV k={t('player.form')} v={String(player.condition.form)} />
            <RowKV k={t('player.morale')} v={String(player.condition.morale)} />
            <RowKV k={t('player.fitness')} v={`${player.condition.fitness}%`} vColor={fitnessColor(player.condition.fitness)} />
            <RowKV k={t('player.foot')} v={t(`foot.${player.foot}`)} />
            <RowKV k={t('mkt.marketValue')} v={money(player.marketValue)} />
            {player.condition.status === 'INJURED' ? (
              <RowKV k={t('player.statusLabel')} v={t('player.injuredDays', { days: player.condition.injuryDaysRemaining })} vColor={theme.colors.red} />
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

        {tab === 'CONTRACT' ? (
          <View>
            <RowKV k={t('player.wageCurrent')} v={wage(player.wage)} />
            <RowKV
              k={t('player.contractUntil')}
              v={player.contractUntil ? `${player.contractUntil}${player.contractUntil === state.meta.season ? t('player.lastYearInline') : ''}` : '—'}
              vColor={player.contractUntil === state.meta.season ? theme.colors.red : undefined}
            />
            <RowKV k={t('player.askedWageRenew')} v={wage(askedWage)} vColor={theme.colors.yellow} />

            {isOurs ? (
              <View style={styles.renewBox}>
                <View style={styles.renewRow}>
                  <Text style={styles.sub}>{t('mkt.duration')}</Text>
                  <Stepper value={years} onChange={setYears} step={1} min={1} max={5}
                    format={(v) => t('tac.years', { n: v })} />
                </View>
                {renewMsg ? <Text style={styles.renewMsg}>{renewMsg}</Text> : null}
                <Button label={t('player.renew')} onPress={() => {
                  const r = renewPlayer(player.id, years, askedWage);
                  setRenewMsg(r.ok ? t('player.renewToast', { until: state.meta.season + years, wage: wage(askedWage) }) : r.error ?? t('player.renewFailed'));
                }} />
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'SELL' && isOurs ? (
          <View>
            <RowKV k={t('mkt.marketValue')} v={money(player.marketValue)} />
            <RowKV k={t('player.listed')} v={player.transferListed ? t('common.yes') : t('common.no')}
              vColor={player.transferListed ? theme.colors.yellow : undefined} />

            {sellMsg ? <Text style={styles.renewMsg}>{sellMsg}</Text> : null}

            {/* Proposta pendente, se houver */}
            {pendingBid ? (
              <View style={styles.bidBox}>
                <Text style={styles.bidTitle}>{t('player.bidFrom', { club: state.clubs[pendingBid.fromClubId]?.name ?? '' })}</Text>
                <Text style={styles.bidFee}>{money(pendingBid.fee)}</Text>
                <Button label={t('player.acceptSell')} onPress={() => {
                  const r = acceptBid(pendingBid.id);
                  setSellMsg(r.ok ? t('player.sellToast', { fee: money(r.fee ?? pendingBid.fee) }) : r.error ?? t('player.sellFailed'));
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
                  setListed(player.id, !player.transferListed);
                  setSellMsg(player.transferListed ? t('player.removedFromList') : t('player.addedToList'));
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

  renewBox: { marginTop: theme.spacing(2), gap: theme.spacing(1.5) },
  renewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  renewMsg: { color: theme.colors.green, fontSize: theme.font.body, marginVertical: theme.spacing(0.5) },
  bidBox: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginTop: theme.spacing(1.5),
    gap: theme.spacing(1),
  },
  bidTitle: { color: theme.colors.textDim, fontSize: theme.font.small },
  bidFee: { color: theme.colors.green, fontSize: theme.font.h1, fontWeight: '800' },
});
