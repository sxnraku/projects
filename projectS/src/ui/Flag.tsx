import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';
import { CountryFlag } from './CountryFlag';

/**
 * Bandeira nacional REAL (imagem). Fina camada sobre CountryFlag para manter a
 * API antiga `country` (slug do país; aceita também o legado 'PRT'). Ver
 * CountryFlag.tsx para a fonte das imagens.
 */
interface FlagProps {
  country: string;
  size?: number;
  circle?: boolean;
}

export function Flag({ country, size = 24, circle = false }: FlagProps) {
  return <CountryFlag slug={country} size={circle ? size : Math.round(size * 0.67)} circle={circle} />;
}

/**
 * Badge de competição no estilo dos ecrãs de referência: bandeira circular +
 * nome da prova por cima de uma fase/subtítulo.
 */
export function CompBadge({
  country, title, subtitle, size = 34,
}: { country: string; title: string; subtitle?: string; size?: number }) {
  return (
    <View style={styles.comp}>
      <Flag country={country} size={size} circle />
      <View style={{ flex: 1 }}>
        <Text style={styles.compTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.compSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  comp: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  compTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  compSub: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '600', marginTop: 1 },
});
