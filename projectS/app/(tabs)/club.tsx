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
import { OBJECTIVE_KEYS } from '../../src/core/career';
import { CloudBackup } from '../../src/ui/CloudBackup';
import { Bar, Body, contrastOn, CrestCircle, darken, RowKV, Screen, Section, Stars } from '../components';
import { reputationStars } from '../../src/ui/theme';
import { Toast } from '../../src/ui/Toast';
import { useMonetizationStore } from '../../src/state/monetizationStore';

const FACILITY_TYPES: FacilityType[] = ['stadium', 'training', 'academy', 'medical', 'scouting'];

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
  const requestBudget = useGameStore((s) => s.requestBudget);
  const budgetRequestUsed = useGameStore((s) => s.budgetRequestUsed);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!state || !club) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const fin = state.finances[club.id]!;
  const career = state.career;
  const net = weeklyNet(fin);
  const record = `${career.totalWins}V ${career.totalDraws}E ${career.totalLosses}D`;

  return (
    <Screen>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind === 'error' ? 'error' : 'ok'} onHide={() => setFeedback(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: theme.spacing(1.25) }}>
        {/* HERO DO CLUBE — cor, escudo, nome, divisão, estádio, reputação */}
        {(() => {
          const base = club.primaryColor;
          const ink = contrastOn(base);
          const onDim = ink === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(20,23,28,0.72)';
          return (
            <View style={[styles.hero, { backgroundColor: base }]}>
              <View style={[styles.heroShade, { backgroundColor: darken(base, 0.55) }]} />
              <View style={styles.heroGlow} />
              <View style={styles.heroRow}>
                <CrestCircle club={club} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroName, { color: ink }]} numberOfLines={1}>{club.name}</Text>
                  <Text style={[styles.heroSub, { color: onDim }]} numberOfLines={1}>
                    {state.leagues[club.leagueId]?.name ?? '—'} · {club.stadiumName}
                  </Text>
                  <View style={styles.heroStars}>
                    <Stars value={reputationStars(club.reputation)} />
                    <Text style={[styles.heroCap, { color: onDim }]}>{club.stadiumCapacity.toLocaleString('pt-PT')}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

        {/* TREINADOR + números de carreira */}
        <View style={styles.card}>
          <View style={styles.managerRow}>
            <Face seed={`mgr_${state.meta.managerName}`} size={46} staff />
            <View style={{ flex: 1 }}>
              <Text style={styles.managerName}>{state.meta.managerName}</Text>
              <Text style={styles.managerSub}>{t('club.managerSub', { club: club.name, season: state.meta.season })}</Text>
            </View>
          </View>
          <View style={styles.tiles}>
            <Tile v={record} k={t('club.record')} />
            <Tile v={`${career.confidence}%`} k={t('label.confidence')}
              color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red} />
            <Tile v={String(career.timesFired)} k={t('club.timesFired')}
              color={career.timesFired > 0 ? theme.colors.red : undefined} />
          </View>
        </View>

        {/* FINANÇAS — cartão com saldo grande + fluxo semanal */}
        <Section title={t('club.section.balance')} />
        <View style={styles.card}>
          <View style={styles.finTop}>
            <View>
              <Text style={styles.finLabel}>{t('fin.balance')}</Text>
              <Text style={[styles.finBig, { color: fin.balance >= 0 ? theme.colors.green : theme.colors.red }]}>{money(fin.balance)}</Text>
            </View>
            <View style={[styles.netChip, { borderColor: net >= 0 ? theme.colors.green : theme.colors.red }]}>
              <Text style={[styles.netVal, { color: net >= 0 ? theme.colors.green : theme.colors.red }]}>
                {net >= 0 ? '+' : ''}{money(net)}
              </Text>
              <Text style={styles.netLbl}>{t('fin.weeklyFlow')}</Text>
            </View>
          </View>
          <RowKV k={t('fin.transferBudget')} v={money(fin.transferBudget)} />
          <View style={styles.finSplit}>
            <View style={styles.finCol}>
              <Text style={styles.finColHead}>{t('club.section.income')}</Text>
              <FinLine k={t('income.tickets')} v={fin.income.tickets} up />
              <FinLine k={t('income.sponsorship')} v={fin.income.sponsorship} up />
              <FinLine k={t('income.tv')} v={fin.income.tvRights} up />
              <FinLine k={t('income.merch')} v={fin.income.merchandising} up />
            </View>
            <View style={styles.finCol}>
              <Text style={styles.finColHead}>{t('club.section.expenses')}</Text>
              <FinLine k={t('expense.wages')} v={fin.expenses.wages} />
              <FinLine k={t('expense.facilities')} v={fin.expenses.facilities} />
              <FinLine k={t('expense.staff')} v={fin.expenses.staff} />
            </View>
          </View>
        </View>

        {/* INSTALAÇÕES — cartões com barra de nível */}
        <Section title={t('club.section.facilities')} />
        {FACILITY_TYPES.map((type) => {
          const level = club.facilities[type];
          const maxed = level >= FACILITY_MAX_LEVEL;
          const cost = maxed ? 0 : facilityUpgradeCost(type, level);
          const affordable = !maxed && fin.balance >= cost;
          return (
            <View key={type} style={styles.facCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.facHead}>
                  <Text style={styles.facName}>{t(`facility.${type}`)}</Text>
                  <Text style={styles.facLvlTag}>{t('facility.level', { n: level })}</Text>
                </View>
                <Text style={styles.facEffect}>{t(`facility.effect.${type}`)}</Text>
                <View style={styles.facBarWrap}>
                  <Bar value={(level / FACILITY_MAX_LEVEL) * 100} color={theme.colors.blue} height={7} />
                </View>
              </View>
              <Pressable
                disabled={!affordable}
                onPress={() => {
                  const r = upgrade(type);
                  setFeedback(r.ok
                    ? { kind: 'ok', text: t('club.upgraded', { name: t(`facility.${type}`), level: r.newLevel ?? level + 1, cost: money(r.cost ?? 0) }) }
                    : r.error ? { kind: 'error', text: r.error } : null);
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

        {/* DIREÇÃO — objetivo, confiança e pedido de orçamento */}
        <Section title={t('club.section.board')} />
        <View style={styles.card}>
          <View style={styles.confHead}>
            <Text style={styles.confTitle}>{t('label.confidence')}</Text>
            <Text style={[styles.confPct, {
              color: career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red,
            }]}>{career.confidence}%</Text>
          </View>
          <Bar value={career.confidence} height={8}
            color={career.confidence >= 50 ? theme.colors.green : career.confidence >= 25 ? theme.colors.yellow : theme.colors.red} />
          <Text style={styles.boardObjective}>{t(OBJECTIVE_KEYS[career.objective])}</Text>
          <Pressable
            disabled={budgetRequestUsed()}
            onPress={() => {
              const r = requestBudget();
              setFeedback({ kind: r.granted > 0 ? 'ok' : 'error', text: tMsg({ key: r.messageKey, params: r.messageParams }) });
            }}
            style={[styles.boardBtn, budgetRequestUsed() && styles.boardBtnOff]}
          >
            <Text style={styles.boardBtnText}>{t('club.board.requestBudget')}</Text>
          </Pressable>
          <Text style={styles.boardHint}>{t('club.board.requestHint')}</Text>
        </View>

        {/* CÓPIA NA NUVEM (Google Drive) */}
        <Section title={t('cloud.section')} />
        <CloudBackup />

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

/** Tile de estatística (3 por linha) no cartão do treinador. */
function Tile({ v, k, color }: { v: string; k: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileV, color ? { color } : null]} numberOfLines={1}>{v}</Text>
      <Text style={styles.tileK} numberOfLines={1}>{k}</Text>
    </View>
  );
}

/** Linha compacta de receita/despesa (verde para cima, vermelho para baixo). */
function FinLine({ k, v, up }: { k: string; v: number; up?: boolean }) {
  return (
    <View style={styles.finLine}>
      <Text style={styles.finLineK} numberOfLines={1}>{k}</Text>
      <Text style={[styles.finLineV, { color: up ? theme.colors.green : theme.colors.red }]}>{money(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- Hero / cartões ----
  hero: {
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), overflow: 'hidden',
    marginBottom: theme.spacing(1.25),
  },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', opacity: 0.5 },
  heroGlow: { position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  heroName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  heroStars: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: 6 },
  heroCap: { fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing(1.5), marginBottom: theme.spacing(0.5),
  },
  tiles: { flexDirection: 'row', gap: 8, marginTop: theme.spacing(1.25) },
  tile: {
    flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.sm,
    paddingVertical: 10, alignItems: 'center',
  },
  tileV: { color: theme.colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileK: { color: theme.colors.textDim, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 3 },

  // ---- Finanças ----
  finTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing(1) },
  finLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  finBig: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  netChip: { borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1), paddingVertical: 6, alignItems: 'flex-end' },
  netVal: { fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  netLbl: { color: theme.colors.textDim, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginTop: 1 },
  finSplit: { flexDirection: 'row', gap: theme.spacing(1.5), marginTop: theme.spacing(1), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: theme.spacing(1) },
  finCol: { flex: 1 },
  finColHead: { color: theme.colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  finLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, gap: 6 },
  finLineK: { color: theme.colors.textDim, fontSize: theme.font.small, flex: 1 },
  finLineV: { fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // ---- Instalações ----
  facCard: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginBottom: theme.spacing(0.75),
  },
  facHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  facLvlTag: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '800' },
  facBarWrap: { marginTop: 8 },

  // ---- Direção ----
  confHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  confTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  confPct: { fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },

  managerRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  managerName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  managerSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  boardObjective: { color: theme.colors.text, fontSize: theme.font.small, marginTop: 4, marginBottom: theme.spacing(1) },
  boardBtn: {
    backgroundColor: theme.colors.blue, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(1.1), alignItems: 'center', marginTop: theme.spacing(0.5),
  },
  boardBtnOff: { backgroundColor: theme.colors.surfaceAlt },
  boardBtnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  boardHint: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 4 },

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
