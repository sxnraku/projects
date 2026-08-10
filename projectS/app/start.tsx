/**
 * Tela inicial (menu principal). É o primeiro ecrã ao abrir a app.
 *  - "Continuar" só aparece se existir uma carreira concluída no save.
 *  - "Nova Carreira" gera um mundo fresco e leva ao onboarding.
 * As abas só ficam acessíveis DEPOIS de passar por aqui (ver guarda em (tabs)/_layout).
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/state/gameStore';
import { useT } from '../src/ui/i18n';
import { LANGS, LANG_LABELS } from '../src/core/i18n';
import { COUNTRIES } from '../src/core/data/world/playerIndex';
import { CountryFlag } from '../src/ui/CountryFlag';
import { theme } from '../src/ui/theme';
import { Button, Screen } from './components';

// Portugal primeiro (default cómodo), depois alfabético (COUNTRIES já vem ordenado).
const COUNTRY_LIST = [...COUNTRIES].sort((a, b) =>
  a.slug === 'portugal' ? -1 : b.slug === 'portugal' ? 1 : 0);

export default function Start() {
  const t = useT();
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const newGame = useGameStore((s) => s.newGame);
  const passMenu = useGameStore((s) => s.passMenu);
  const lang = useGameStore((s) => s.lang);
  const setLang = useGameStore((s) => s.setLang);

  const [confirmNew, setConfirmNew] = useState(false);
  const [pickCountry, setPickCountry] = useState(false);
  const [query, setQuery] = useState('');

  const career = state && state.meta.managerName !== '' ? state : null;
  const clubName = career ? career.clubs[career.meta.managedClubId]?.name ?? '' : '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRY_LIST.filter((c) => c.country.toLowerCase().includes(q)) : COUNTRY_LIST;
  }, [query]);

  const doContinue = () => { passMenu(); router.replace('/' as never); };
  const doNew = (country: string) => {
    newGame({ managerName: '', useBase: true, country });
    passMenu();
    router.replace('/onboarding' as never);
  };
  const onNewPressed = () => { if (career) setConfirmNew(true); else openPicker(); };
  const openPicker = () => { setConfirmNew(false); setQuery(''); setPickCountry(true); };

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
                <Button label={t('start.new')} onPress={openPicker} />
              </View>
            </View>
          </View>
        )}
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

      {/* SELETOR DE PAÍS — escolhe onde começar a carreira (começas na divisão mais baixa) */}
      <Modal visible={pickCountry} transparent animationType="slide" onRequestClose={() => setPickCountry(false)}>
        <View style={styles.pickBackdrop}>
          <View style={styles.pickSheet}>
            <Text style={styles.pickTitle}>{t('start.chooseCountry')}</Text>
            <TextInput
              style={styles.search}
              placeholder={t('start.searchCountry')}
              placeholderTextColor={theme.colors.textDim}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filtered.map((c) => (
                <Pressable key={c.slug} style={styles.cRow} onPress={() => { setPickCountry(false); doNew(c.slug); }}>
                  <CountryFlag slug={c.slug} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cName} numberOfLines={1}>{c.country}</Text>
                    <Text style={styles.cSub}>{t('start.countryMeta', { div: c.tiers, teams: c.teams })}</Text>
                  </View>
                  <Text style={styles.cGo}>›</Text>
                </Pressable>
              ))}
              {filtered.length === 0 ? <Text style={styles.cEmpty}>{t('start.noCountry')}</Text> : null}
            </ScrollView>
            <Pressable style={styles.pickCancel} onPress={() => setPickCountry(false)}>
              <Text style={styles.pickCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  // Seletor de país
  pickBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  pickSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(2), paddingBottom: theme.spacing(3),
  },
  pickTitle: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '900', textAlign: 'center', marginBottom: theme.spacing(1) },
  search: {
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(1), color: theme.colors.text,
    fontSize: theme.font.body, marginBottom: theme.spacing(1),
  },
  cRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25),
    paddingVertical: theme.spacing(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  cName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  cSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 1 },
  cGo: { color: theme.colors.textDim, fontSize: 22, fontWeight: '800' },
  cEmpty: { color: theme.colors.textDim, textAlign: 'center', paddingVertical: theme.spacing(2) },
  pickCancel: { alignItems: 'center', paddingTop: theme.spacing(1.5) },
  pickCancelText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '700' },
});
