import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_VERSION_CODE, fetchMinVersionCode, forcedUpdateSupported, openStore } from '../native/appUpdate';
import { useT } from './i18n';
import { theme } from './theme';

/**
 * Overlay BLOQUEANTE de atualização obrigatória. Monta-se no topo da app e fica
 * invisível até confirmar (via JSON remoto) que a versão instalada ficou abaixo
 * da mínima. Falha em aberto — nunca bloqueia sem confirmação (ver appUpdate.ts).
 * Sem botão de fechar e sem "mais tarde": só sai pela Play Store.
 */
export function ForcedUpdateGate() {
  const t = useT();
  const [mustUpdate, setMustUpdate] = useState(false);

  useEffect(() => {
    if (!forcedUpdateSupported) return;
    let alive = true;
    (async () => {
      const min = await fetchMinVersionCode();
      if (alive && min != null && APP_VERSION_CODE < min) setMustUpdate(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!mustUpdate) return null;

  return (
    // onRequestClose vazio: o botão "voltar" do Android não fecha o ecrã.
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>⬆</Text>
          <Text style={styles.title}>{t('update.title')}</Text>
          <Text style={styles.body}>{t('update.body')}</Text>
          <Pressable style={styles.btn} onPress={openStore}>
            <Text style={styles.btnText}>{t('update.button')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center', padding: theme.spacing(3),
  },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(3), alignItems: 'center', alignSelf: 'stretch',
  },
  icon: { fontSize: 44, marginBottom: theme.spacing(1) },
  title: {
    color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800',
    textAlign: 'center', marginBottom: theme.spacing(1),
  },
  body: {
    color: theme.colors.textDim, fontSize: theme.font.body, lineHeight: 20,
    textAlign: 'center', marginBottom: theme.spacing(2.5),
  },
  btn: {
    backgroundColor: theme.colors.green, borderRadius: theme.radius.sm,
    height: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: theme.font.h3, fontWeight: '800' },
});
