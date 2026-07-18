/**
 * Error boundary — se um ecrã rebentar, mostra um aviso recuperável em vez de
 * ecrã branco (que na Play Store conta como crash). O save está em SQLite, por
 * isso "tentar de novo" recarrega o estado guardado.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../src/ui/theme';

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
        <Text style={styles.title}>Algo correu mal</Text>
        <Text style={styles.body}>
          Ocorreu um erro inesperado. O teu progresso está guardado.
        </Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.btnText}>Tentar de novo</Text>
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
