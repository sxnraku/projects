import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from './theme';

/**
 * Retratos procedurais para jogadores e staff.
 *
 * Nada de imagens: cada cara é desenhada com Views a partir do id do jogador,
 * o que dá três coisas que um pacote de fotos não daria — 0 KB no APK, nenhum
 * problema de direitos de imagem, e uma cara estável para SEMPRE, porque o
 * mesmo id gera sempre o mesmo rosto (o mundo é gerado, não catalogado).
 *
 * O objetivo não é realismo, é RECONHECIMENTO: ao fim de meia época o
 * treinador identifica o avançado pelo cabelo antes de ler o nome.
 */

const SKIN = ['#F4D9BE', '#EDC49E', '#DCA871', '#C08A52', '#96603A', '#6E4326'] as const;
const HAIR = ['#15100C', '#2E2118', '#4A3323', '#7A4B22', '#A9762F', '#D8BC85', '#9A9A9A', '#E4E0D8'] as const;
const STYLES = ['buzz', 'short', 'long', 'afro', 'bald'] as const;
type HairStyle = (typeof STYLES)[number];

/** Hash determinístico (FNV-1a) — o mesmo id dá sempre a mesma cara. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

interface FaceTraits {
  skin: string;
  hair: string;
  style: HairStyle;
  beard: boolean;
  eyeGap: number; // 0..1, afasta ou aproxima os olhos
}

/** Deriva os traços do rosto a partir do id. `staff` envelhece a paleta. */
function traits(seed: string, staff: boolean): FaceTraits {
  const h = hash(seed);
  const pick = <T,>(arr: readonly T[], shift: number): T =>
    arr[(h >>> shift) % arr.length]!;

  // O staff é mais velho: mais grisalhos, mais carecas, mais barba.
  const hairIdx = staff
    ? Math.min(HAIR.length - 1, ((h >>> 8) % HAIR.length) + 2)
    : (h >>> 8) % HAIR.length;
  const style: HairStyle = staff && (h >>> 20) % 3 === 0 ? 'bald' : pick(STYLES, 14);

  return {
    skin: pick(SKIN, 3),
    hair: HAIR[hairIdx]!,
    style,
    beard: ((h >>> 24) % 10) < (staff ? 5 : 3),
    eyeGap: ((h >>> 17) % 3) / 3,
  };
}

export interface FaceProps {
  /** Identificador estável — normalmente o id do jogador. */
  seed: string;
  size?: number;
  /** Cor da camisola (clube). Ignorada em `staff`. */
  shirt?: string;
  staff?: boolean;
  /** Anel colorido à volta (ex.: vermelho para lesionado). */
  ring?: string;
}

export function Face({ seed, size = 32, shirt, staff = false, ring }: FaceProps) {
  const t = useMemo(() => traits(seed, staff), [seed, staff]);
  const s = size;
  const jersey = staff ? '#3A414B' : shirt ?? theme.colors.surfaceAlt;

  // Tom mais escuro do mesmo tom de pele, para o pescoço ficar em sombra.
  const neckShade = shade(t.skin, 0.82);
  const eyeY = s * 0.40;
  const eyeOffset = s * (0.09 + t.eyeGap * 0.03);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: theme.colors.bg,
          borderWidth: ring ? Math.max(1, s * 0.05) : StyleSheet.hairlineWidth,
          borderColor: ring ?? theme.colors.border,
        },
      ]}
    >
      {/* pescoço */}
      <View style={{
        position: 'absolute', top: s * 0.60, left: s * 0.39,
        width: s * 0.22, height: s * 0.20, backgroundColor: neckShade,
      }} />
      {/* ombros / camisola */}
      <View style={{
        position: 'absolute', top: s * 0.74, left: s * 0.04,
        width: s * 0.92, height: s * 0.40,
        borderRadius: s * 0.20, backgroundColor: jersey,
      }} />
      {/* cabeça */}
      <View style={{
        position: 'absolute', top: s * 0.15, left: s * 0.26,
        width: s * 0.48, height: s * 0.55,
        borderRadius: s * 0.24, backgroundColor: t.skin,
      }} />
      <Hair style={t.style} color={t.hair} s={s} />
      {/* olhos */}
      <View style={{
        position: 'absolute', top: eyeY, left: s * 0.5 - eyeOffset - s * 0.035,
        width: s * 0.07, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#2B211A',
      }} />
      <View style={{
        position: 'absolute', top: eyeY, left: s * 0.5 + eyeOffset - s * 0.035,
        width: s * 0.07, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#2B211A',
      }} />
      {/* barba */}
      {t.beard ? (
        <View style={{
          position: 'absolute', top: s * 0.53, left: s * 0.30,
          width: s * 0.40, height: s * 0.17,
          borderBottomLeftRadius: s * 0.20, borderBottomRightRadius: s * 0.20,
          backgroundColor: t.hair, opacity: 0.9,
        }} />
      ) : null}
    </View>
  );
}

function Hair({ style, color, s }: { style: HairStyle; color: string; s: number }) {
  if (style === 'bald') return null;

  if (style === 'afro') {
    return (
      <View style={{
        position: 'absolute', top: s * 0.07, left: s * 0.19,
        width: s * 0.62, height: s * 0.40, borderRadius: s * 0.31, backgroundColor: color,
      }} />
    );
  }

  const height = style === 'buzz' ? s * 0.13 : s * 0.19;
  return (
    <>
      <View style={{
        position: 'absolute', top: s * 0.12, left: s * 0.24,
        width: s * 0.52, height,
        borderTopLeftRadius: s * 0.26, borderTopRightRadius: s * 0.26,
        backgroundColor: color,
      }} />
      {style === 'long' ? (
        <>
          <View style={{
            position: 'absolute', top: s * 0.20, left: s * 0.24,
            width: s * 0.08, height: s * 0.38, borderRadius: s * 0.04, backgroundColor: color,
          }} />
          <View style={{
            position: 'absolute', top: s * 0.20, left: s * 0.68,
            width: s * 0.08, height: s * 0.38, borderRadius: s * 0.04, backgroundColor: color,
          }} />
        </>
      ) : null}
    </>
  );
}

/** Escurece uma cor hex por um fator (0..1). */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', position: 'relative' },
});
