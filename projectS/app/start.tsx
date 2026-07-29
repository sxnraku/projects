/**
 * Tela inicial (menu principal). É o primeiro ecrã ao abrir a app.
 *  - "Continuar" só aparece se existir uma carreira concluída no save.
 *  - "Nova Carreira" gera um mundo fresco e leva ao onboarding.
 * As abas só ficam acessíveis DEPOIS de passar por aqui (ver guarda em (tabs)/_layout).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { useT } from '../src/ui/i18n';
import { LANGS, LANG_LABELS } from '../src/core/i18n';
import { NameStyle } from '../src/core/game';
import { theme } from '../src/ui/theme';
import { Button, Screen } from './components';

const NAME_STYLES: NameStyle[] = ['serious', 'meme', 'mixed'];

export default function Start() {
  const t = useT();
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const newGame = useGameStore((s) => s.newGame);
  const passMenu = useGameStore((s) => s.passMenu);
  const lang = useGameStore((s) => s.lang);
  const setLang = useGameStore((s) => s.setLang);

  const [confirmNew, setConfirmNew] = useState(false);
  const [nameStyle, setNameStyle] = useState<NameStyle>('serious');

  const career = state && state.meta.managerName !== '' ? state : null;
  const clubName = career ? career.clubs[career.meta.managedClubId]?.name ?? '' : '';

  const doContinue = () => { passMenu(); router.replace('/' as never); };
  const doNew = () => { newGame({ managerName: '', nameStyle }); passMenu(); router.replace('/onboarding' as never); };
  const onNewPressed = () => { if (career) setConfirmNew(true); else doNew(); };

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <View style={styles.crest}>
          <Text style={styles.crestText}>FL</Text>
        </View>
        <Text style={styles.title}>Football Legacy</Text>
        <Text style={styles.tagline}>{t('start.tagline')}</Text>
      </View>

      <View style={styles.actions}>
        {career ? (
          <View style={styles.continueWrap}>
            <Button label={t('start.continue')} onPress={doContinue} />
            <Text style={styles.continueSub}>{t('start.continueSub', { club: clubName })}</Text>
          </View>
        ) : null}

        {!confirmNew ? (
          <Button
            label={t('start.new')}
            variant={career ? 'ghost' : 'primary'}
            onPress={onNewPressed}
          />
        ) : (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>{t('common.confirmNewCareer')}</Text>
            <View style={styles.confirmRow}>
              <View style={{ flex: 1 }}>
                <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirmNew(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={t('start.new')} onPress={doNew} />
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.langBlock}>
        <Text style={styles.langLabel}>{t('nameStyle.label')}</Text>
        <View style={styles.langRow}>
          {NAME_STYLES.map((s) => (
            <Pressable key={s} onPress={() => setNameStyle(s)}
              style={[styles.langBtn, nameStyle === s && styles.langBtnOn]}>
              <Text style={[styles.langBtnText, nameStyle === s && styles.langBtnTextOn]}>{t(`nameStyle.${s}`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.langBlock}>
        <Text style={styles.langLabel}>{t('start.langLabel')}</Text>
        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <Pressable key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnOn]}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextOn]}>{LANG_LABELS[l]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.footer}>RakuLabs</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing(1) },
  crest: {
    width: 108, height: 122, borderRadius: 18, backgroundColor: theme.colors.green,
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing(1.5),
    borderWidth: 3, borderColor: theme.colors.yellow,
  },
  crestText: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: -1 },
  title: { color: theme.colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: theme.colors.textDim, fontSize: theme.font.body, textAlign: 'center' },

  actions: { gap: theme.spacing(1.25), paddingBottom: theme.spacing(2) },
  continueWrap: { gap: theme.spacing(0.5) },
  continueSub: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
  confirmBox: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.yellow,
    borderRadius: theme.radius.sm, padding: theme.spacing(1.25), gap: theme.spacing(1),
  },
  confirmText: { color: theme.colors.text, fontSize: theme.font.body, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: theme.spacing(1) },

  langBlock: { paddingBottom: theme.spacing(2) },
  langLabel: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: theme.spacing(0.75), textAlign: 'center',
  },
  langRow: { flexDirection: 'row', gap: theme.spacing(0.75) },
  langBtn: {
    flex: 1, paddingVertical: theme.spacing(1), borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface,
  },
  langBtnOn: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  langBtnText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  langBtnTextOn: { color: theme.colors.blue },

  footer: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', letterSpacing: 2, paddingBottom: theme.spacing(1) },
});
