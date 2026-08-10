/**
 * Error boundary — se um ecrã rebentar, mostra um aviso recuperável em vez de
 * ecrã branco (que na Play Store conta como crash). O save está em SQLite, por
 * isso "tentar de novo" recarrega o estado guardado.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../src/state/gameStore';
import { translate } from '../src/ui/i18n';
import { theme } from '../src/ui/theme';

/**
 * Traduz sem hooks (isto é um componente de classe) e sem rebentar: se a store
 * ainda não existir, cai no idioma do dicionário base. Um erro AQUI deixaria o
 * jogador com ecrã branco, que é exatamente o que este ecrã evita.
 */
function t(key: string): string {
  try {
    return translate(useGameStore.getState().lang, key);
  } catch {
    return translate('pt-PT', key);
  }
}

interface Props { children: React.ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Em produção poderia enviar para telemetria; por agora só regista.
    console.error('Erro na UI:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{t('error.title')}</Text>
        <Text style={styles.body}>{t('error.body')}</Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.btnText}>{t('error.retry')}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center',
    padding: theme.spacing(3), gap: theme.spacing(1.5),
  },
  title: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '800' },
  body: { color: theme.colors.textDim, fontSize: theme.font.body, textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: theme.spacing(1), backgroundColor: theme.colors.green,
    borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1.5),
  },
  btnText: { color: '#fff', fontSize: theme.font.h3, fontWeight: '700' },
});
