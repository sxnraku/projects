import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useGameStore } from '../state/gameStore';
import { ANDROID_CLIENT_ID, WEB_CLIENT_ID, DRIVE_SCOPE, cloudConfigured } from '../native/cloudConfig';
import { downloadSave, uploadSave } from '../native/cloudSave';
import { useT } from './i18n';
import { theme } from './theme';
import { Toast } from './Toast';

// Fecha a sessão de auth se a app voltar do browser (necessário 1×).
WebBrowser.maybeCompleteAuthSession();

type Feedback = { kind: 'ok' | 'error' | 'info'; text: string } | null;

/**
 * Cópia do jogo na NUVEM (Google Drive appDataFolder). Liga a conta Google e
 * permite guardar/restaurar o save entre dispositivos. Fica desativado enquanto
 * os client IDs não estiverem preenchidos (ver src/native/cloudConfig.ts).
 */
export function CloudBackup() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const loadState = useGameStore((s) => s.loadState);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID || undefined,
    webClientId: WEB_CLIENT_ID || undefined,
    scopes: [DRIVE_SCOPE],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const at = response.authentication?.accessToken ?? null;
      setToken(at);
      if (at) setFeedback({ kind: 'ok', text: t('cloud.connected') });
    } else if (response?.type === 'error') {
      setFeedback({ kind: 'error', text: t('cloud.error') });
    }
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cloudConfigured) {
    return (
      <View style={styles.box}>
        <Text style={styles.note}>{t('cloud.notConfigured')}</Text>
      </View>
    );
  }

  const doUpload = async () => {
    if (!token || !state) return;
    setBusy(true);
    try {
      await uploadSave(token, JSON.stringify(state));
      setFeedback({ kind: 'ok', text: t('cloud.saved') });
    } catch (e) {
      setFeedback({ kind: 'error', text: t('cloud.error') + ' (' + ((e as Error).message ?? '') + ')' });
    }
    setBusy(false);
  };

  const doRestore = async () => {
    if (!token) return;
    setConfirmRestore(false);
    setBusy(true);
    try {
      const json = await downloadSave(token);
      if (!json) { setFeedback({ kind: 'info', text: t('cloud.noSave') }); setBusy(false); return; }
      loadState(JSON.parse(json)); // substitui o jogo atual; o auto-save persiste-o localmente
      setFeedback({ kind: 'ok', text: t('cloud.restored') });
    } catch (e) {
      setFeedback({ kind: 'error', text: t('cloud.error') + ' (' + ((e as Error).message ?? '') + ')' });
    }
    setBusy(false);
  };

  return (
    <View style={styles.box}>
      <Toast text={feedback?.text ?? null} kind={feedback?.kind ?? 'ok'} onHide={() => setFeedback(null)} />
      {busy ? <ActivityIndicator color={theme.colors.green} /> : null}
      {!token ? (
        <Pressable disabled={!request || busy} style={[styles.btn, (!request || busy) && styles.btnOff]} onPress={() => promptAsync()}>
          <Text style={styles.btnText}>{t('cloud.connect')}</Text>
        </Pressable>
      ) : (
        <>
          <Pressable disabled={busy} style={[styles.btn, busy && styles.btnOff]} onPress={doUpload}>
            <Text style={styles.btnText}>{t('cloud.save')}</Text>
          </Pressable>
          {confirmRestore ? (
            <Pressable disabled={busy} style={[styles.btn, styles.btnWarn]} onPress={doRestore}>
              <Text style={styles.btnText}>{t('cloud.restoreConfirm')}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={busy} style={[styles.btn, styles.btnGhost]} onPress={() => setConfirmRestore(true)}>
              <Text style={[styles.btnText, { color: theme.colors.text }]}>{t('cloud.restore')}</Text>
            </Pressable>
          )}
          <Text style={styles.note}>{t('cloud.hint')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.spacing(0.75), marginTop: theme.spacing(0.5) },
  btn: { backgroundColor: theme.colors.blue, borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1.1), alignItems: 'center' },
  btnGhost: { backgroundColor: theme.colors.surfaceAlt },
  btnWarn: { backgroundColor: theme.colors.yellow },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: theme.font.body, fontWeight: '800' },
  note: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
});
