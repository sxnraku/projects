/**
 * CÓPIA NA NUVEM — versão WEB (stub).
 *
 * A versão nativa liga-se ao Google Drive com `expo-auth-session`, que exige um
 * `webClientId` para correr no browser. O projeto só tem o client id de
 * Android (é uma app de Android), e por isso o `useAuthRequest` ATIRA no web —
 * um erro em pleno render, que o ErrorBoundary apanhava e transformava no ecrã
 * "Algo correu mal": o separador Clube inteiro deixava de abrir no browser.
 *
 * Segue o mesmo padrão dos anúncios (`AdBanner.web.tsx`): o Metro escolhe este
 * ficheiro no web e o outro no telemóvel. O jogo em Android fica exatamente
 * como estava; no browser, a secção diz apenas que não está disponível.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from './i18n';
import { theme } from './theme';

export function CloudBackup() {
  const t = useT();
  return (
    <View style={styles.box}>
      <Text style={styles.note}>{t('cloud.notConfigured')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.spacing(0.75), marginTop: theme.spacing(0.5) },
  note: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
});
