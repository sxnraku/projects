/**
 * Ecrã de TREINO — foco da semana, centro de treino, promessas e o
 * desenvolvimento do plantel (barra Overall → Potencial por jogador). Torna a
 * evolução visível: quem sobe (↗), quem está no auge, quem declina (↘), e as
 * subidas ganhas esta época.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { RETRAIN_YOUTH_MAX_AGE, retrainWeeks } from '../src/core/training';
import { POSITION_GROUP, Position } from '../src/core/models';
import { GROWTH_LIMIT_AGE, TrainingFocus } from '../src/core/training';
import { facilityUpgradeCost } from '../src/core/economy';
import { FACILITY_MAX_LEVEL, naturalOverall, naturalOverallFine, Player } from '../src/core/models';
import { money, to100 } from '../src/ui/format';
import { useT } from '../src/ui/i18n';
import { attrColor, theme } from '../src/ui/theme';
import { Face } from '../src/ui/Face';
import { Toast } from '../src/ui/Toast';
import { Bar, Body, PosText, Screen, Section, Stars } from './components';

const FOCUSES: TrainingFocus[] = ['PHYSICAL', 'TECHNICAL', 'TACTICAL', 'RECOVERY'] as TrainingFocus[];
const DECLINE_AGE = 31;

/**
 * Estado de desenvolvimento de um jogador (para ordenar e mostrar).
 *
 * O limite de idade vem do CORE (`GROWTH_LIMIT_AGE`), não de uma cópia local:
 * o ecrã dizia "no auge" aos 25 anos enquanto a ficha continuava a prometer
 * potencial 100, e o jogador nunca mais mexia. Agora as duas coisas concordam.
 */
function devOf(p: Player) {
  const ovr = to100(naturalOverallFine(p));
  const pot = Math.round(p.potential * 5);
  const growing = p.age <= GROWTH_LIMIT_AGE && naturalOverallFine(p) < p.potential;
  const declining = p.age >= DECLINE_AGE && !growing;
  return { ovr, pot: Math.max(pot, ovr), growing, declining };
}

export default function Training() {
  const t = useT();
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const squad = useGameStore((s) => s.squad);
  const focus = useGameStore((s) => s.trainingFocus);
  const setFocus = useGameStore((s) => s.setTrainingFocus);
  const upgrade = useGameStore((s) => s.upgrade);
  const cancelRetrain = useGameStore((s) => s.cancelRetrain);
  const startRetrain = useGameStore((s) => s.startRetrain);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  /** Jogador escolhido para reconversão (mostra as posições possíveis). */
  const [pickFor, setPickFor] = useState<string | null>(null);

  const players = squad();
  const club = state ? state.clubs[state.meta.managedClubId] : null;

  const rows = useMemo(() => {
    return [...players].sort((a, b) => {
      const da = devOf(a), db = devOf(b);
      const rank = (d: typeof da) => (d.growing ? 0 : d.declining ? 2 : 1);
      if (rank(da) !== rank(db)) return rank(da) - rank(db);
      return db.pot - da.pot;
    });
  }, [players]);

  const prospects = useMemo(
    () => [...players].filter((p) => p.age <= 21).sort((a, b) => b.potential - a.potential).slice(0, 8),
    [players],
  );
  /** Quem está a mudar de posição agora — com quantas semanas faltam. */
  const retraining = useMemo(
    () => players.filter((p) => !!p.condition.retraining),
    [players],
  );
  /** Candidatos naturais a reconversão: jovens, sem plano em curso. */
  const retrainCandidates = useMemo(
    () => players
      .filter((p) => !p.condition.retraining && !p.condition.loanOwnerId && p.age <= RETRAIN_YOUTH_MAX_AGE)
      .sort((a, b) => b.potential - a.potential)
      .slice(0, 6),
    [players],
  );
  const pickTarget = pickFor ? players.find((p) => p.id === pickFor) ?? null : null;

  const gains = useMemo(
    () => players.filter((p) => (p.condition.devSeason ?? 0) > 0)
      .sort((a, b) => (b.condition.devSeason ?? 0) - (a.condition.devSeason ?? 0)).slice(0, 8),
    [players],
  );

  if (!state || !club) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  const trLevel = club.facilities.training;
  const trMaxed = trLevel >= FACILITY_MAX_LEVEL;
  const trCost = trMaxed ? 0 : facilityUpgradeCost('training', trLevel, tier);
  const fin = state.finances[club.id]!;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind ?? 'ok'} onHide={() => setFeedback(null)} />
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹ {t('common.back')}</Text></Pressable>
        <Text style={styles.title}>{t('train.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
        {/* FOCO DA SEMANA */}
        <Section title={t('train.focusTitle')} />
        <View style={styles.focusGrid}>
          {FOCUSES.map((f) => (
            <Pressable key={f} onPress={() => setFocus(f)} style={[styles.focus, focus === f && styles.focusOn]}>
              <Text style={[styles.focusName, focus === f && styles.focusNameOn]}>{t(`focus.${f}`)}</Text>
              <Text style={styles.focusEffect}>{t(`train.effect.${f}`)}</Text>
              {focus === f ? <View style={styles.focusMark} /> : null}
            </Pressable>
          ))}
        </View>

        {/* CENTRO DE TREINO */}
        <View style={styles.center}>
          <View style={{ flex: 1 }}>
            <Text style={styles.centerName}>{t('train.center')}</Text>
            <View style={styles.centerStars}>
              <Stars value={trLevel} />
              <Text style={styles.centerEffect}>
                {t('train.centerEffect', { pct: (trLevel - 1) * 3, n: trLevel })}
              </Text>
            </View>
          </View>
          <Pressable
            disabled={trMaxed || fin.balance < trCost}
            onPress={() => {
              const r = upgrade('training');
              setFeedback(r.ok
                ? { kind: 'ok', text: t('club.upgraded', { name: t('facility.training'), level: r.newLevel ?? trLevel + 1, cost: money(r.cost ?? 0) }) }
                : r.error ? { kind: 'error', text: r.error } : null);
            }}
            style={[styles.upg, (trMaxed || fin.balance < trCost) && styles.upgOff]}
          >
            <Text style={[styles.upgText, (trMaxed || fin.balance < trCost) && { color: theme.colors.textDim }]}>
              {trMaxed ? t('train.centerMax') : t('train.upgrade', { cost: money(trCost) })}
            </Text>
          </Pressable>
        </View>


        {/* RECONVERSÃO DE POSIÇÃO — trabalho de meses, não de uma semana. */}
        <Section title={t('retrain.title')} />
        {retraining.length === 0 ? (
          <Text style={styles.retrainHint}>{t('retrain.none')}</Text>
        ) : retraining.map((p) => {
          const r = p.condition.retraining!;
          const total = retrainWeeks(p.age, p.positions[0]!, r.position);
          const done = Math.max(0, total - r.weeksLeft);
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/player/${p.id}` as never)}
              style={styles.retrainCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.retrainName} numberOfLines={1}>
                  {p.firstName} {p.lastName}
                </Text>
                <Text style={styles.retrainWhat}>
                  {p.positions[0]} → <Text style={styles.retrainTarget}>{r.position}</Text>
                  {'  ·  '}{t('retrain.busy', { pos: r.position, weeks: r.weeksLeft })}
                </Text>
                <View style={styles.retrainBarWrap}>
                  <Bar value={(done / Math.max(1, total)) * 100} color={theme.colors.blue} height={6} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.retrainWeeks}>{t('retrain.progress', { done, total })}</Text>
                <Pressable
                  onPress={() => {
                    cancelRetrain(p.id);
                    setFeedback({ kind: 'ok', text: t('retrain.cancel') });
                  }}
                  style={styles.retrainCancel}>
                  <Text style={styles.retrainCancelText}>✕</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}

        {/* Atalho: os jovens de maior potencial, que é onde a reconversão compensa. */}
        {retrainCandidates.length > 0 ? (
          <View>
            <Text style={styles.retrainPick}>{t('retrain.pick')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.retrainRow}>
              {retrainCandidates.map((p) => {
                const open = pickFor === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPickFor(open ? null : p.id)}
                    style={[styles.retrainChip, open && styles.retrainChipOn]}>
                    <Text style={styles.retrainChipPos}>{p.positions[0]}</Text>
                    <Text style={styles.retrainChipName} numberOfLines={1}>{p.lastName}</Text>
                    <Text style={styles.retrainChipAge}>{p.age}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Escolhido um jogador, as posições abrem AQUI: começa-se a
                reconversão sem sair do ecrã de treino. */}
            {pickTarget ? (
              <View style={styles.targetBox}>
                <Text style={styles.targetWho}>
                  {pickTarget.firstName} {pickTarget.lastName} · {pickTarget.positions[0]} · {pickTarget.age}
                </Text>
                <View style={styles.targetGrid}>
                  {RETRAIN_TARGETS
                    .filter((pos) => !pickTarget.positions.includes(pos))
                    .map((pos) => {
                      const weeks = retrainWeeks(pickTarget.age, pickTarget.positions[0]!, pos);
                      const same = POSITION_GROUP[pickTarget.positions[0]!] === POSITION_GROUP[pos];
                      return (
                        <Pressable
                          key={pos}
                          onPress={() => {
                            const r = startRetrain(pickTarget.id, pos);
                            if (r.ok) {
                              setPickFor(null);
                              setFeedback({
                                kind: 'ok',
                                text: t('retrain.busy', { pos, weeks: r.weeks ?? weeks }),
                              });
                            } else {
                              setFeedback({ kind: 'error', text: t(r.errorKey ?? '') });
                            }
                          }}
                          style={styles.targetChip}>
                          <Text style={styles.targetPos}>{pos}</Text>
                          <Text style={styles.targetWeeks}>{weeks}s</Text>
                          <Text style={styles.targetKind}>
                            {t(same ? 'retrain.sameGroup' : 'retrain.otherGroup')}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
                <Text style={styles.retrainHint}>{t('retrain.hint')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* PROMESSAS */}
        {prospects.length > 0 ? (
          <>
            <Section title={t('train.prospects')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prospectRow}>
              {prospects.map((p) => (
                <View key={p.id} style={styles.prospect}>
                  <Face seed={p.id} size={30} shirt={club.primaryColor} />
                  <Text style={styles.prospectName} numberOfLines={1}>{p.lastName}</Text>
                  <Text style={styles.prospectMeta}>{p.age} · {p.positions[0]}</Text>
                  <Text style={styles.prospectPot}>{t('train.potShort', { v: Math.round(p.potential * 5) })}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* DESENVOLVIMENTO */}
        <Section title={t('train.development')} />
        {rows.map((p) => {
          const d = devOf(p);
          return (
            <View key={p.id} style={styles.row}>
              <Face seed={p.id} size={36} shirt={club.primaryColor} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <PosText position={p.positions[0]!} style={{ fontSize: 10 }} />
                  <Text style={styles.rowName} numberOfLines={1}>{p.lastName}</Text>
                  <Text style={styles.rowAge}>{p.age}</Text>
                </View>
                <DevBar ovr={d.ovr} pot={d.pot} />
              </View>
              <View style={styles.rowNums}>
                <Text style={[styles.rowOvr, { color: attrColor(naturalOverall(p)) }]}>{d.ovr}</Text>
                <Text style={styles.rowPot}>
                  {d.growing ? t('train.toPot', { v: d.pot }) : d.declining ? t('train.ceiling', { v: d.pot }) : t('train.peak')}
                  {'  '}
                  <Text style={d.growing ? styles.up : d.declining ? styles.down : styles.flat}>
                    {d.growing ? '↗' : d.declining ? '↘' : '✓'}
                  </Text>
                </Text>
              </View>
            </View>
          );
        })}

        {/* SUBIDAS ESTA ÉPOCA */}
        <Section title={t('train.gains')} />
        {gains.length === 0 ? (
          <Text style={styles.empty}>{t('train.noGains')}</Text>
        ) : gains.map((p) => (
          <View key={p.id} style={styles.gainRow}>
            <Text style={styles.gainUp}>▲</Text>
            <Text style={styles.gainName}>{p.lastName}</Text>
            <Text style={styles.gainSub}>{t('train.gainSub', { n: p.condition.devSeason ?? 0 })}</Text>
            <Text style={styles.gainCount}>+{p.condition.devSeason ?? 0}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

/** Barra Overall → Potencial: preenchido = agora; faixa clara + entalhe = teto. */
function DevBar({ ovr, pot }: { ovr: number; pot: number }) {
  const potPct = Math.max(0, Math.min(100, pot));
  const ovrPct = Math.max(0, Math.min(100, ovr));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barGhost, { width: `${potPct}%` }]} />
      <View style={[styles.barFill, { width: `${ovrPct}%` }]} />
      {pot > ovr ? <View style={[styles.barNotch, { left: `${potPct}%` }]} /> : null}
    </View>
  );
}

/** Posições oferecidas para reconversão (as do onze; o GR é um mundo à parte). */
const RETRAIN_TARGETS: Position[] = ['RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

const styles = StyleSheet.create({
  retrainChipOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '22' },
  targetBox: {
    marginTop: 10, padding: 12, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.accent + '55',
  },
  targetWho: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  targetChip: {
    alignItems: 'center', minWidth: 62, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 9,
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
  },
  targetPos: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
  targetWeeks: { color: theme.colors.text, fontSize: 11, fontWeight: '700', marginTop: 1 },
  targetKind: { color: theme.colors.textDim, fontSize: 9, marginTop: 1 },
  retrainHint: { color: theme.colors.textDim, fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
  retrainCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  retrainName: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  retrainWhat: { color: theme.colors.textDim, fontSize: 11, marginTop: 2 },
  retrainTarget: { color: theme.colors.accent, fontWeight: '700' },
  retrainBarWrap: { marginTop: 6 },
  retrainWeeks: { color: theme.colors.textDim, fontSize: 11, fontWeight: '700' },
  retrainCancel: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  retrainCancelText: { color: theme.colors.textDim, fontSize: 12, fontWeight: '700' },
  retrainPick: { color: theme.colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 4, marginBottom: 6 },
  retrainRow: { gap: 8, paddingRight: 8 },
  retrainChip: {
    alignItems: 'center', minWidth: 68, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  retrainChipPos: { color: theme.colors.accent, fontSize: 10, fontWeight: '800' },
  retrainChipName: { color: theme.colors.text, fontSize: 12, fontWeight: '600', marginTop: 2 },
  retrainChipAge: { color: theme.colors.textDim, fontSize: 10, marginTop: 1 },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing(1) },
  back: { color: theme.colors.blue, fontSize: theme.font.body, fontWeight: '700' },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },

  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(0.75) },
  focus: {
    width: '48.5%', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(1.25),
  },
  focusOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  focusName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  focusNameOn: { color: theme.colors.blue },
  focusEffect: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 3, lineHeight: 15 },
  focusMark: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.blue },

  center: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), marginTop: theme.spacing(1),
  },
  centerName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  centerStars: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), marginTop: 4 },
  centerEffect: { color: theme.colors.textDim, fontSize: theme.font.small },
  upg: { backgroundColor: theme.colors.green, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1) },
  upgOff: { backgroundColor: theme.colors.surfaceAlt },
  upgText: { color: '#04170c', fontSize: theme.font.small, fontWeight: '800' },

  prospectRow: { gap: theme.spacing(0.75), paddingVertical: 2 },
  prospect: {
    width: 96, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.sm, padding: theme.spacing(1),
  },
  prospectName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', marginTop: 6 },
  prospectMeta: { color: theme.colors.textDim, fontSize: 10, marginTop: 2, fontVariant: ['tabular-nums'] },
  prospectPot: { color: theme.colors.yellow, fontSize: 11, fontWeight: '800', marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.1), paddingVertical: theme.spacing(1) },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', flexShrink: 1 },
  rowAge: { color: theme.colors.textDim, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  rowNums: { alignItems: 'flex-end', minWidth: 66 },
  rowOvr: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 20 },
  rowPot: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2, fontVariant: ['tabular-nums'] },
  up: { color: theme.colors.green, fontWeight: '900' },
  down: { color: theme.colors.red, fontWeight: '900' },
  flat: { color: theme.colors.textDim, fontWeight: '900' },

  barTrack: { position: 'relative', height: 7, borderRadius: 100, backgroundColor: theme.colors.surfaceAlt, marginTop: 7, overflow: 'hidden' },
  barGhost: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 100, backgroundColor: 'rgba(55,194,90,0.26)' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 100, backgroundColor: theme.colors.green },
  barNotch: { position: 'absolute', top: -1, bottom: -1, width: 2, backgroundColor: theme.colors.green, opacity: 0.9 },

  empty: { color: theme.colors.textDim, fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(0.85), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  gainUp: { color: theme.colors.green, fontSize: 12, fontWeight: '900' },
  gainName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  gainSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginLeft: 'auto' },
  gainCount: { color: theme.colors.green, fontSize: theme.font.body, fontWeight: '800', minWidth: 28, textAlign: 'right' },
});
