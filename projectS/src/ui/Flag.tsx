import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

/**
 * Bandeiras nacionais desenhadas com Views — sem imagens, à semelhança das
 * caras. Recebe o código ISO alpha-3 do país (Club.country / League.country).
 *
 * A Portugal é desenhada com algum detalhe (é o país do jogo); os restantes
 * caem num padrão de faixas derivado do código, para que qualquer nação futura
 * mostre algo plausível e estável sem precisar de assets.
 */

interface FlagProps {
  country: string;
  size?: number; // largura; a altura é 2/3 (proporção de bandeira)
  circle?: boolean; // recorta em círculo (estilo "badge" dos ecrãs de referência)
}

export function Flag({ country, size = 24, circle = false }: FlagProps) {
  const w = size;
  const h = circle ? size : Math.round(size * 0.67);
  const radius = circle ? size / 2 : 3;

  return (
    <View style={[
      styles.frame,
      { width: w, height: h, borderRadius: radius, borderColor: 'rgba(0,0,0,0.25)' },
    ]}>
      {country === 'PRT' ? <Portugal w={w} h={h} /> : <Generic country={country} w={w} h={h} />}
    </View>
  );
}

/** Verde à esquerda, vermelho à direita, esfera armilar amarela na divisória. */
function Portugal({ w, h }: { w: number; h: number }) {
  const sphere = h * 0.42;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w * 0.42, backgroundColor: '#006600' }} />
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: w * 0.58, backgroundColor: '#D52B1E' }} />
      <View style={{
        position: 'absolute',
        left: w * 0.42 - sphere / 2,
        top: h / 2 - sphere / 2,
        width: sphere, height: sphere, borderRadius: sphere / 2,
        borderWidth: Math.max(1, sphere * 0.14), borderColor: '#FFD700',
        backgroundColor: 'rgba(255,255,255,0.12)',
      }} />
    </View>
  );
}

/** Hash FNV-1a — mesmo código, mesmas cores. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const FLAG_PALETTE = ['#C8102E', '#003580', '#FFD100', '#009A44', '#FFFFFF', '#000000', '#FF6900'];

/** Três faixas verticais escolhidas pelo código do país. */
function Generic({ country, w }: { country: string; w: number; h?: number }) {
  const n = FLAG_PALETTE.length;
  const seed = hash(country || 'XXX');
  const a = FLAG_PALETTE[seed % n]!;
  const b = FLAG_PALETTE[(seed >> 8) % n]!;
  const c = FLAG_PALETTE[(seed >> 16) % n]!;
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
      <View style={{ width: w / 3, backgroundColor: a }} />
      <View style={{ width: w / 3, backgroundColor: b }} />
      <View style={{ flex: 1, backgroundColor: c }} />
    </View>
  );
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
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  comp: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  compTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  compSub: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '600', marginTop: 1 },
});
