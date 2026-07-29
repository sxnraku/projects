/**
 * Tutorial de abas — mostrado uma vez por carreira, logo após entrar no jogo.
 * Passa por cada aba a explicar para que serve. Overlay sobre o dashboard.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../src/ui/i18n';
import { theme } from '../src/ui/theme';
import { Button } from './components';

type Step = { glyph: string; titleKey: string; descKey: string };

const STEPS: Step[] = [
  { glyph: '▣', titleKey: 'tab.home', descKey: 'tutorial.home.d' },
  { glyph: '☰', titleKey: 'tab.squad', descKey: 'tutorial.squad.d' },
  { glyph: '◫', titleKey: 'tab.tactics', descKey: 'tutorial.tactics.d' },
  { glyph: '⇄', titleKey: 'tab.market', descKey: 'tutorial.market.d' },
  { glyph: '#', titleKey: 'tab.league', descKey: 'tutorial.league.d' },
  { glyph: '⌂', titleKey: 'tab.club', descKey: 'tutorial.club.d' },
];

export default function Tutorial({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.kicker}>{t('tutorial.title')}</Text>
            <Pressable onPress={onDone} hitSlop={10}>
              <Text style={styles.skip}>{t('tutorial.skip')}</Text>
            </Pressable>
          </View>

          <View style={styles.glyphWrap}>
            <Text style={styles.glyph}>{step.glyph}</Text>
          </View>

          <Text style={styles.title}>{t(step.titleKey)}</Text>
          <Text style={styles.desc}>{t(step.descKey)}</Text>

          {/* progresso em pontos */}
          <View style={styles.dots}>
            {STEPS.map((_, idx) => (
              <View key={idx} style={[styles.dot, idx === i && styles.dotOn]} />
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.counter}>{t('tutorial.step', { n: i + 1, total: STEPS.length })}</Text>
            <View style={{ flex: 1 }}>
              <Button
                label={last ? t('tutorial.done') : t('tutorial.next')}
                onPress={() => (last ? onDone() : setI(i + 1))}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', padding: theme.spacing(2),
  },
  card: {
    width: '100%', maxWidth: 400, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: theme.colors.green, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  skip: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  glyphWrap: {
    alignSelf: 'center', width: 72, height: 72, borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    marginTop: theme.spacing(2), marginBottom: theme.spacing(1.5),
    borderWidth: 1, borderColor: theme.colors.border,
  },
  glyph: { color: theme.colors.green, fontSize: 34, fontWeight: '700' },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', textAlign: 'center' },
  desc: {
    color: theme.colors.textDim, fontSize: theme.font.body, textAlign: 'center',
    marginTop: theme.spacing(1), lineHeight: 21, minHeight: 60,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: theme.spacing(1.5) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.border },
  dotOn: { backgroundColor: theme.colors.green, width: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), marginTop: theme.spacing(2) },
  counter: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
});
