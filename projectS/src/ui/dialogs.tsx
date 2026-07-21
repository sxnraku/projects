import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineupWarning, WeekReport } from '../core/game';
import { money } from './format';
import { useT, useTMsg } from './i18n';
import { fitnessColor, theme } from './theme';

/**
 * Os dois momentos em que o jogo TEM de parar o jogador.
 *
 * 1. Antes do jogo, se o onze estiver estoirado — para ele não descobrir só
 *    depois de perder que jogou com dois exaustos.
 * 2. Depois do jogo, com o balanço da semana — para ligar o resultado
 *    desportivo ao dinheiro no exato segundo em que a jornada fecha, em vez de
 *    o saldo mudar em silêncio na barra de topo.
 */

// ---------------------------------------------------------------------------
// Pré-jogo: confirmação quando há titulares exaustos
// ---------------------------------------------------------------------------

export function PreMatchSheet({
  visible, warnings, onRotate, onPlayAnyway, onCancel,
}: {
  visible: boolean;
  warnings: LineupWarning[];
  onRotate: () => void;
  onPlayAnyway: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const injured = warnings.filter((w) => w.injured).length;
  const tired = warnings.length - injured;
  const parts = [
    injured > 0 ? t('dlg.pre.injured', { n: injured, plural: injured > 1 ? t('squad.plural') : '' }) : null,
    tired > 0 ? t('dlg.pre.tired', { n: tired }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>
            {injured > 0 ? t('dlg.pre.titleInjured') : t('dlg.pre.titleTired')}
          </Text>
          <Text style={styles.sheetSub}>{t('dlg.pre.sub', { parts })}</Text>

          <View style={styles.warnList}>
            {warnings.slice(0, 6).map((w) => (
              <View key={w.playerId} style={styles.warnRow}>
                <Text style={styles.warnPos}>{w.position}</Text>
                <Text style={styles.warnName} numberOfLines={1}>{w.name}</Text>
                {w.injured ? (
                  <Text style={styles.warnInjured}>{t('dlg.pre.injuredTag')}</Text>
                ) : (
                  <Text style={[styles.warnFit, { color: fitnessColor(w.fitness) }]}>{w.fitness}%</Text>
                )}
              </View>
            ))}
          </View>

          <Pressable style={styles.primaryBtn} onPress={onRotate}>
            <Text style={styles.primaryText}>{t('dlg.pre.rotate')}</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={onPlayAnyway}>
            <Text style={styles.ghostText}>{t('dlg.pre.playAnyway')}</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={onCancel}>
            <Text style={styles.linkText}>{t('dlg.pre.goTactics')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pós-jogo: balanço da jornada
// ---------------------------------------------------------------------------

export function WeekReportModal({
  report, clubName, onClose,
}: {
  report: WeekReport | null;
  clubName: string;
  onClose: () => void;
}) {
  const t = useT();
  const tMsg = useTMsg();
  if (!report) return null;

  const won = report.goalsFor > report.goalsAgainst;
  const drew = report.goalsFor === report.goalsAgainst;
  const scoreColor = !report.played ? theme.colors.textDim
    : won ? theme.colors.green : drew ? theme.colors.textDim : theme.colors.red;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>{t('dlg.week.kicker', { round: report.round })}</Text>

          {report.played ? (
            <Text style={[styles.score, { color: scoreColor }]}>
              {report.isHome ? clubName : report.opponentName}
              {'  '}{report.isHome ? report.goalsFor : report.goalsAgainst}
              <Text style={styles.dash}> – </Text>
              {report.isHome ? report.goalsAgainst : report.goalsFor}
              {'  '}{report.isHome ? report.opponentName : clubName}
            </Text>
          ) : (
            <Text style={styles.noMatch}>{t('dlg.week.noMatch')}</Text>
          )}

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>{t('dlg.week.financial')}</Text>
            {report.gate > 0 ? (
              <Line
                k={t('dlg.week.gate', { att: report.attendance.toLocaleString('pt-PT') })}
                v={report.gate}
                color={theme.colors.green}
              />
            ) : (
              <Line k={t('dlg.week.gateAway')} v={0} color={theme.colors.textDim} />
            )}
            <Line k={t('dlg.week.otherIncome')} v={report.otherIncome} color={theme.colors.green} />
            <Line k={t('dlg.week.facilities')} v={-report.facilities} color={theme.colors.textDim} />
            <Line k={t('dlg.week.staff')} v={-report.staff} color={theme.colors.textDim} />
            <Line k={t('dlg.week.wages')} v={-report.wages} color={theme.colors.red} />

            <View style={styles.divider} />
            <Line
              k={t('dlg.week.net')}
              v={report.net}
              color={report.net >= 0 ? theme.colors.green : theme.colors.red}
              bold
            />
            <Line k={t('dlg.week.balance')} v={report.balanceAfter} color={theme.colors.textDim} />

            {report.notes.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: theme.spacing(2) }]}>
                  {t('dlg.week.notes')}
                </Text>
                {report.notes.map((n, i) => (
                  <View key={i} style={styles.noteRow}>
                    <Text style={[styles.noteMark, { color: noteColor(n.kind) }]}>
                      {n.kind === 'INJURY' ? '+' : n.kind === 'GROWTH' ? '★' : n.kind === 'TRANSFER' ? '⇄' : '·'}
                    </Text>
                    <Text style={[styles.noteText, { color: noteColor(n.kind) }]}>{tMsg(n)}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>

          <Pressable style={styles.primaryBtn} onPress={onClose}>
            <Text style={styles.primaryText}>{t('dlg.week.continue')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function noteColor(kind: WeekReport['notes'][number]['kind']): string {
  return kind === 'INJURY' ? theme.colors.red
    : kind === 'GROWTH' ? theme.colors.yellow
    : kind === 'TRANSFER' ? theme.colors.blue
    : theme.colors.textDim;
}

function Line({ k, v, color, bold }: { k: string; v: number; color: string; bold?: boolean }) {
  const sign = v > 0 ? '+' : '';
  return (
    <View style={styles.line}>
      <Text style={[styles.lineKey, bold && styles.bold]} numberOfLines={1}>{k}</Text>
      <Text style={[styles.lineVal, { color }, bold && styles.bold]}>
        {sign}{money(v)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', padding: theme.spacing(2),
  },

  // --- pré-jogo (sobe de baixo) ---
  sheet: {
    marginTop: 'auto', backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(2), gap: theme.spacing(1),
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: theme.colors.border,
    alignSelf: 'center', marginBottom: theme.spacing(1),
  },
  sheetTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  sheetSub: { color: theme.colors.textDim, fontSize: theme.font.body, lineHeight: 18 },
  warnList: {
    backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.25), marginVertical: theme.spacing(0.5),
  },
  warnRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingVertical: theme.spacing(0.9),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  warnPos: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800', width: 28 },
  warnName: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  warnFit: { fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  warnInjured: { color: theme.colors.red, fontSize: theme.font.small, fontWeight: '700' },

  // --- pós-jogo (centrado) ---
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(2),
  },
  kicker: {
    color: theme.colors.textDim, fontSize: theme.font.small,
    fontWeight: '800', letterSpacing: 1.2,
  },
  score: {
    fontSize: theme.font.h2, fontWeight: '800', marginTop: theme.spacing(0.75),
    marginBottom: theme.spacing(1.5), fontVariant: ['tabular-nums'],
  },
  dash: { color: theme.colors.textDim },
  noMatch: {
    color: theme.colors.textDim, fontSize: theme.font.body,
    marginTop: theme.spacing(0.75), marginBottom: theme.spacing(1.5),
  },
  sectionLabel: {
    color: theme.colors.textDim, fontSize: theme.font.small,
    fontWeight: '700', letterSpacing: 1.1, marginBottom: theme.spacing(0.5),
  },
  line: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.7), gap: theme.spacing(1),
  },
  lineKey: { color: theme.colors.textDim, fontSize: theme.font.body, flex: 1 },
  lineVal: { fontSize: theme.font.body, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '800', color: theme.colors.text },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border,
    marginVertical: theme.spacing(0.75),
  },
  noteRow: { flexDirection: 'row', gap: theme.spacing(1), paddingVertical: theme.spacing(0.5) },
  noteMark: { fontSize: theme.font.body, fontWeight: '800', width: 14, textAlign: 'center' },
  noteText: { fontSize: theme.font.body, flex: 1 },

  // --- botões ---
  primaryBtn: {
    backgroundColor: theme.colors.green, borderRadius: theme.radius.sm,
    height: 42, alignItems: 'center', justifyContent: 'center',
    marginTop: theme.spacing(1.5),
  },
  primaryText: { color: '#fff', fontSize: theme.font.h3, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: theme.radius.sm,
    height: 42, alignItems: 'center', justifyContent: 'center',
  },
  ghostText: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: theme.spacing(1) },
  linkText: { color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700' },
});
