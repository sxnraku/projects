/**
 * Academia de jovens — recrutamento com ESCOLHA.
 * Mostra um grupo de candidatos (idade, OVR atual, intervalo de potencial).
 * Recrutar = ver um anúncio + pagar uma taxa baixa. "Novo grupo" = anúncio.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { academyLevel, academyFee, candidatePotentialRange } from '../src/core/game';
import { naturalOverall, naturalOverallFine } from '../src/core/models';
import { money, to100 } from '../src/ui/format';
import { useT } from '../src/ui/i18n';
import { attrColor, theme } from '../src/ui/theme';
import { Face } from '../src/ui/Face';
import { showRewarded } from '../src/native/ads';
import { Toast } from '../src/ui/Toast';
import { Body, Button, PosText, Screen, Section } from './components';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export default function Academy() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const academyCandidates = useGameStore((s) => s.academyCandidates);
  const recruitYouth = useGameStore((s) => s.recruitYouth);
  const refreshAcademy = useGameStore((s) => s.refreshAcademy);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  if (!state) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const club = state.clubs[state.meta.managedClubId]!;
  const balance = state.finances[club.id]?.balance ?? 0;
  const candidates = academyCandidates();

  const doRecruit = async (id: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    if (await showRewarded()) {
      const res = recruitYouth(id);
      setFeedback(res.ok
        ? { kind: 'ok', text: t('academy.recruited', { name }) }
        : { kind: 'error', text: res.errorKey ? t(res.errorKey) : t('academy.failed') });
    }
    setBusy(false);
  };

  const doRefresh = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    if (await showRewarded()) refreshAcademy();
    setBusy(false);
  };

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind === 'error' ? 'error' : 'ok'} onHide={() => setFeedback(null)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing(3) }}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('academy.title')}</Text>
            <Text style={styles.sub}>{t('academy.levelInfo', { level: academyLevel(state) })}</Text>
          </View>
          <Text style={styles.balance}>{money(balance)}</Text>
        </View>

        <Text style={styles.intro}>{t('academy.intro')}</Text>

        <Section title={t('academy.candidates', { n: candidates.length })} />

        {candidates.length === 0 ? (
          <Text style={styles.empty}>{t('academy.empty')}</Text>
        ) : candidates.map((c) => {
          const ovr = naturalOverall(c);
          const range = candidatePotentialRange(state, c);
          const fee = academyFee(state, c);
          const canAfford = balance >= fee;
          return (
            <View key={c.id} style={styles.card}>
              <Face seed={c.id} size={46} shirt={club.primaryColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{c.firstName} {c.lastName}</Text>
                <View style={styles.metaRow}>
                  <PosText position={c.positions[0]!} style={{ fontSize: 10 }} />
                  <Text style={styles.sub}>{t('academy.age', { n: c.age })}</Text>
                </View>
                <View style={styles.statsRow}>
                  <Text style={styles.statLabel}>{t('academy.ovr')} <Text style={[styles.statVal, { color: attrColor(ovr) }]}>{to100(naturalOverallFine(c))}</Text></Text>
                  <Text style={styles.statLabel}>{t('academy.pot')} <Text style={[styles.statVal, { color: theme.colors.green }]}>{range.min}-{range.max}</Text></Text>
                </View>
              </View>
              <View style={styles.actionCol}>
                <Text style={styles.fee}>{money(fee)}</Text>
                <Button
                  label={t('academy.recruit')}
                  disabled={busy || !canAfford}
                  onPress={() => doRecruit(c.id, c.lastName)}
                />
              </View>
            </View>
          );
        })}

        <View style={{ marginTop: theme.spacing(2) }}>
          <Button label={t('academy.newBatch')} variant="ghost" disabled={busy} onPress={doRefresh} />
          <Text style={styles.adNote}>{t('academy.adNote')}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingTop: theme.spacing(1.5), paddingBottom: theme.spacing(1) },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  balance: { color: theme.colors.green, fontSize: theme.font.h3, fontWeight: '700', fontVariant: ['tabular-nums'] },
  intro: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 18, marginBottom: theme.spacing(1) },
  feedback: { fontSize: theme.font.body, fontWeight: '600', marginVertical: theme.spacing(0.5) },
  empty: { color: theme.colors.textDim, fontSize: theme.font.small, paddingVertical: theme.spacing(1.5) },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing(1.25), marginBottom: theme.spacing(1),
  },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: theme.spacing(1.5), marginTop: 5 },
  statLabel: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '600' },
  statVal: { fontWeight: '800', fontSize: theme.font.body },
  actionCol: { alignItems: 'flex-end', gap: 6, minWidth: 96 },
  fee: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  adNote: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 6 },
});
