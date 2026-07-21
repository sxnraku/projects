import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import { FACILITY_MAX_LEVEL, weeklyNet } from '../../src/core/models';
import { FacilityType, facilityUpgradeCost } from '../../src/core/economy';
import { money } from '../../src/ui/format';
import { theme } from '../../src/ui/theme';
import { Face } from '../../src/ui/Face';
import { useT, useTMsg } from '../../src/ui/i18n';
import { LANGS, LANG_LABELS } from '../../src/core/i18n';
import { Body, RowKV, Screen, Section, Stars } from '../components';
import { reputationStars } from '../../src/ui/theme';
import { useMonetizationStore } from '../../src/state/monetizationStore';

const FACILITY_TYPES: FacilityType[] = ['stadium', 'training', 'academy', 'medical'];

export default function ClubScreen() {
  const t = useT();
  const tMsg = useTMsg();
  const state = useGameStore((s) => s.state);
  const club = useGameStore((s) => s.managedClub)();
  const upgrade = useGameStore((s) => s.upgrade);
  const newGame = useGameStore((s) => s.newGame);
  const lang = useGameStore((s) => s.lang);
  const setLang = useGameStore((s) => s.setLang);
  const premium = useMonetizationStore((s) => s.m.premium);
  const setPremium = useMonetizationStore((s) => s.setPremium);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!state || !club) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const fin = state.finances[club.id]!;
  const career = state.career;
  const net = weeklyNet(fin);
  const record = `${career.totalWins}V ${career.totalDraws}E ${career.totalLosses}D`;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* PERFIL */}
        <Section title={t('club.section.club')} />
        <RowKV k={t('club.nameLabel')} v={club.name} />
        <View style={styles.repRow}>
          <Text style={styles.repKey}>{t('club.reputation')}</Text>
          <Stars value={reputationStars(club.reputation)} />
        </View>
        <RowKV k={t('club.stadium')} v={`${club.stadiumName} (${club.stadiumCapacity.toLocaleString('pt-PT')})`} />
        <RowKV k={t('club.division')} v={state.leagues[club.leagueId]?.name ?? '—'} />

        {/* INSTALAÇÕES */}
        <Section title={t('club.section.facilities')} />
        {upgradeMsg ? <Text style={styles.upgradeMsg}>{upgradeMsg}</Text> : null}
        {FACILITY_TYPES.map((type) => {
          const level = club.facilities[type];
          const maxed = level >= FACILITY_MAX_LEVEL;
          const cost = maxed ? 0 : facilityUpgradeCost(type, level);
          const affordable = !maxed && fin.balance >= cost;
          return (
            <View key={type} style={styles.facRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.facName}>{t(`facility.${type}`)}</Text>
                <Text style={styles.facEffect}>{t(`facility.effect.${type}`)}</Text>
                <Text style={styles.facLevel}>
                  {'▰'.repeat(level)}{'▱'.repeat(FACILITY_MAX_LEVEL - level)}  {t('facility.level', { n: level })}
                </Text>
              </View>
              <Pressable
                disabled={!affordable}
                onPress={() => {
                  const r = upgrade(type);
                  setUpgradeMsg(r.ok
                    ? t('club.upgraded', { name: t(`facility.${type}`), level: r.newLevel ?? level + 1, cost: money(r.cost ?? 0) })
                    : r.error ?? null);
                }}
                style={[styles.facBtn, !affordable && styles.facBtnDisabled]}
              >
                <Text style={[styles.facBtnText, !affordable && { color: theme.colors.textDim }]}>
                  {maxed ? t('facility.max') : money(cost)}
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* FINANÇAS */}
        <Section title={t('club.section.income')} />
        <RowKV k={t('income.tickets')} v={money(fin.income.tickets)} vColor={theme.colors.green} />
        <RowKV k={t('income.sponsorship')} v={money(fin.income.sponsorship)} vColor={theme.colors.green} />
        <RowKV k={t('income.tv')} v={money(fin.income.tvRights)} vColor={theme.colors.green} />
        <RowKV k={t('income.merch')} v={money(fin.income.merchandising)} vColor={theme.colors.green} />

        <Section title={t('club.section.expenses')} />
        <RowKV k={t('expense.wages')} v={money(fin.expenses.wages)} vColor={theme.colors.red} />
        <RowKV k={t('expense.facilities')} v={money(fin.expenses.facilities)} vColor={theme.colors.red} />
        <RowKV k={t('expense.staff')} v={money(fin.expenses.staff)} vColor={theme.colors.red} />

        <Section title={t('club.section.balance')} />
        <RowKV k={t('fin.weeklyFlow')} v={`${net >= 0 ? '+' : ''}${money(net)}`}
          vColor={net >= 0 ? theme.colors.green : theme.colors.red} />
        <RowKV k={t('fin.balance')} v={money(fin.balance)}
          vColor={fin.balance >= 0 ? theme.colors.green : theme.colors.red} />
        <RowKV k={t('fin.transferBudget')} v={money(fin.transferBudget)} />

        {/* CARREIRA */}
        <Section title={t('club.section.career')} />
        <View style={styles.managerRow}>
          <Face seed={`mgr_${state.meta.managerName}`} size={44} staff />
          <View style={{ flex: 1 }}>
            <Text style={styles.managerName}>{state.meta.managerName}</Text>
            <Text style={styles.managerSub}>{t('club.managerSub', { club: club.name, season: state.meta.season })}</Text>
          </View>
        </View>
        <RowKV k={t('club.record')} v={record} />
        <RowKV k={t('club.timesFired')} v={String(career.timesFired)}
          vColor={career.timesFired > 0 ? theme.colors.red : undefined} />

        {/* TROFÉUS */}
        <Section title={t('club.section.trophies')} />
        {career.trophies.length === 0 ? (
          <Text style={styles.empty}>{t('club.noTrophies')}</Text>
        ) : (
          career.trophies.map((tr, i) => (
            <View key={i} style={styles.trophyRow}>
              <Text style={styles.trophyIcon}>🏆</Text>
              <Text style={styles.trophyText}>{tMsg(tr)}</Text>
              <Text style={styles.trophySeason}>{tr.season}</Text>
            </View>
          ))
        )}

        {/* HISTORIAL */}
        <Section title={t('club.historyFull')} />
        {career.seasons.length === 0 ? (
          <Text style={styles.empty}>{t('club.firstSeason')}</Text>
        ) : (
          <View>
            <View style={styles.histHead}>
              <Text style={[styles.hh, { width: 44 }]}>{t('hist.season')}</Text>
              <Text style={[styles.hh, { flex: 1 }]}>{t('hist.clubLeague')}</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'center' }]}>{t('hist.pos')}</Text>
              <Text style={[styles.hh, { width: 30, textAlign: 'right' }]}>{t('hist.pts')}</Text>
            </View>
            {[...career.seasons].reverse().map((s, i) => (
              <View key={i} style={styles.histRow}>
                <Text style={[styles.hc, { width: 44 }]}>{s.season}</Text>
                <Text style={[styles.hc, { flex: 1 }]} numberOfLines={1}>
                  {s.clubName} · {s.leagueName}
                  {s.champion ? <Text style={{ color: theme.colors.yellow }}> 🏆</Text> : null}
                  {s.promoted && !s.champion ? <Text style={{ color: theme.colors.green }}> ↑</Text> : null}
                  {s.relegated ? <Text style={{ color: theme.colors.red }}> ↓</Text> : null}
                </Text>
                <Text style={[styles.hc, { width: 30, textAlign: 'center' }]}>{s.position}º</Text>
                <Text style={[styles.hc, { width: 30, textAlign: 'right' }]}>{s.points}</Text>
              </View>
            ))}
          </View>
        )}
        {/* DEFINIÇÕES */}
        <Section title={t('club.section.settings')} />

        {/* Idioma — 3 botões */}
        <Text style={styles.langLabel}>{t('club.lang')}</Text>
        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnOn]}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextOn]}>{LANG_LABELS[l]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.premiumName')}</Text>
            <Text style={styles.settingSub}>{premium ? t('club.premiumActiveSub') : t('club.premiumSub')}</Text>
          </View>
          <Pressable
            disabled={premium}
            onPress={() => setPremium(true)} // TODO lançamento: fluxo real Google Play Billing
            style={[styles.settingBtn, premium && styles.settingBtnDone]}
          >
            <Text style={styles.settingBtnText}>{premium ? t('club.premiumOn') : t('club.premiumActivate')}</Text>
          </Pressable>
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingName}>{t('club.newCareer')}</Text>
            <Text style={styles.settingSub}>{confirmReset ? t('club.newCareerConfirmSub') : t('club.newCareerSub')}</Text>
          </View>
          <Pressable
            onPress={() => {
              if (!confirmReset) { setConfirmReset(true); return; }
              setConfirmReset(false);
              newGame({ managerName: '' }); // volta ao onboarding; auto-save trata do resto
            }}
            style={[styles.settingBtn, confirmReset && styles.settingBtnDanger]}
          >
            <Text style={[styles.settingBtnText, confirmReset && { color: '#fff' }]}>
              {confirmReset ? t('club.confirm') : t('club.restart')}
            </Text>
          </Pressable>
        </View>

        <RowKV k={t('club.version')} v="1.0.0" />
        <Text style={styles.legal}>{t('club.legal')}</Text>

        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  managerRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  managerName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  managerSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },

  upgradeMsg: { color: theme.colors.green, fontSize: theme.font.small, marginBottom: theme.spacing(0.5) },
  facRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  facName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  facEffect: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  facLevel: { color: theme.colors.blue, fontSize: theme.font.small, marginTop: 2, letterSpacing: 1 },
  facBtn: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.green,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1),
    minWidth: 76, alignItems: 'center',
  },
  facBtnDisabled: { borderColor: theme.colors.border },
  facBtnText: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  langLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(1), marginBottom: theme.spacing(0.5) },
  langRow: { flexDirection: 'row', gap: theme.spacing(0.75), marginBottom: theme.spacing(0.5) },
  langBtn: {
    flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  langBtnOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  langBtnText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  langBtnTextOn: { color: theme.colors.blue },
  settingName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  settingSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  settingBtn: {
    borderWidth: 1, borderColor: theme.colors.blue, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    minWidth: 88, alignItems: 'center',
  },
  settingBtnDone: { borderColor: theme.colors.green },
  settingBtnDanger: { backgroundColor: theme.colors.red, borderColor: theme.colors.red },
  settingBtnText: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },
  legal: { color: theme.colors.textDim, fontSize: 10, marginTop: theme.spacing(1.5), lineHeight: 14 },
  repRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.9),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  repKey: { color: theme.colors.textDim, fontSize: theme.font.body },
  empty: { color: theme.colors.textDim, fontSize: theme.font.body, paddingVertical: theme.spacing(0.5) },
  trophyRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  trophyIcon: { fontSize: 14 },
  trophyText: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  trophySeason: { color: theme.colors.textDim, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  histHead: { flexDirection: 'row', gap: 6, paddingVertical: theme.spacing(0.75) },
  hh: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  histRow: {
    flexDirection: 'row', gap: 6, paddingVertical: theme.spacing(0.75),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  hc: { color: theme.colors.text, fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
});
