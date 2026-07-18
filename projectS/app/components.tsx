/**
 * Componentes de UI reutilizáveis — estilo Football Manager clássico.
 * Densidade de informação, cores só para estado, grelha de 8px.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Club, POSITION_GROUP, Position } from '../src/core/models';
import { useGameStore } from '../src/state/gameStore';
import { money, shortDate } from '../src/ui/format';
import { POS_COLORS, reputationStars, theme } from '../src/ui/theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>{children}</SafeAreaView>;
}

/**
 * Barra superior fixa: clube, estrelas de reputação, dinheiro, data.
 * Nunca esconder dinheiro nem reputação.
 */
export function TopBar() {
  const router = useRouter();
  const state = useGameStore((s) => s.state);
  const club = useGameStore((s) => s.managedClub)();
  // Sem estado ou durante o onboarding: barra vazia (sem dados falsos).
  if (!state || !club || state.meta.managerName === '') {
    return <SafeAreaView edges={['top']} style={styles.topbarWrap} />;
  }
  const balance = state.finances[club.id]?.balance ?? 0;

  return (
    <SafeAreaView edges={['top']} style={styles.topbarWrap}>
      <View style={styles.topbar}>
        <View style={[styles.topbarBadge, { backgroundColor: club.primaryColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.topbarClub} numberOfLines={1}>{club.name}</Text>
          <Stars value={reputationStars(club.reputation)} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.topbarMoney, { color: balance >= 0 ? theme.colors.green : theme.colors.red }]}>
            {money(balance)}
          </Text>
          <Text style={styles.topbarDate}>{shortDate(state.meta.currentDate)}</Text>
        </View>
        <Pressable onPress={() => router.push('/club' as never)} hitSlop={8}>
          <Text style={styles.topbarGear}>⚙</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Estrelas de reputação (0..5, meias incluídas). */
export function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  let s = '★'.repeat(full) + (half ? '½' : '');
  s = s + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
  return <Text style={styles.stars}>{s}</Text>;
}

/** Título de secção compacto em maiúsculas — organiza listas sem cartões. */
export function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionText}>{title}</Text>
      {right}
    </View>
  );
}

/** Painel discreto (usado com moderação — o conteúdo manda). */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}
export function Body({ children, dim, style }: { children: React.ReactNode; dim?: boolean; style?: object }) {
  return <Text style={[styles.body, dim && styles.dim, style]}>{children}</Text>;
}

/** Linha chave→valor para tabelas de informação. */
export function RowKV({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <View style={styles.rowKV}>
      <Text style={styles.rowKVKey}>{k}</Text>
      <Text style={[styles.rowKVVal, vColor ? { color: vColor } : null]}>{v}</Text>
    </View>
  );
}

/** Barra horizontal de atributo: rótulo, barra, valor. Nada de radar charts. */
export function StatBar({ label, value, max = 20 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={styles.statBarRow}>
      <Text style={styles.statBarLabel}>{label}</Text>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.statBarVal}>{value}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        (disabled || loading) && styles.btnDisabled,
        pressed && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text style={[styles.btnText, variant === 'ghost' && styles.btnGhostText]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Stepper [-] valor [+] para negociações e definições. */
export function Stepper({
  value, onChange, step, min = 0, max = Number.MAX_SAFE_INTEGER, format,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))} hitSlop={6}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepVal}>{format ? format(value) : String(value)}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))} hitSlop={6}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

/** Escudo do clube — pequeno, informativo. */
export function Crest({ club, size = 24 }: { club: Club; size?: number }) {
  return (
    <View
      style={[
        styles.crest,
        {
          width: size,
          height: size * 1.1,
          backgroundColor: club.primaryColor,
          borderColor: club.secondaryColor,
          borderTopLeftRadius: size * 0.16,
          borderTopRightRadius: size * 0.16,
          borderBottomLeftRadius: size * 0.5,
          borderBottomRightRadius: size * 0.5,
        },
      ]}
    >
      <Text style={[styles.crestText, { fontSize: size * 0.34 }]}>{club.shortName.slice(0, 3)}</Text>
    </View>
  );
}

/** Texto de posição colorido pelo setor (estado informativo, sem fundo). */
export function PosText({ position, style }: { position: Position; style?: object }) {
  return (
    <Text style={[styles.posText, { color: POS_COLORS[POSITION_GROUP[position]] }, style]}>
      {position}
    </Text>
  );
}

/** Compat: badge de posição (usado por ecrãs antigos). */
export function PosBadge({ position, size = 'md' }: { position: Position; size?: 'sm' | 'md' }) {
  return <PosText position={position} style={size === 'sm' ? { fontSize: 10 } : undefined} />;
}

/** Barra fina de progresso (fitness, confiança). */
export function Bar({ value, color, height = 4 }: { value: number; color: string; height?: number }) {
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

/** Últimos resultados como marcas ✓/=/✗ coloridas. */
export function FormDots({ results }: { results: ('W' | 'D' | 'L')[] }) {
  const colorOf = { W: theme.colors.green, D: theme.colors.textDim, L: theme.colors.red } as const;
  const markOf = { W: '✓', D: '=', L: '✗' } as const;
  return (
    <View style={styles.formRow}>
      {results.map((r, i) => (
        <Text key={i} style={[styles.formMark, { color: colorOf[r] }]}>{markOf[r]}</Text>
      ))}
    </View>
  );
}

/** Pastilha de estatística compacta. */
export function StatPill({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.spacing(1.5) },

  topbarWrap: { backgroundColor: theme.colors.surface },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  topbarBadge: { width: 26, height: 26, borderRadius: 4 },
  topbarClub: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  topbarMoney: { fontSize: theme.font.h3, fontWeight: '700', fontVariant: ['tabular-nums'] },
  topbarDate: { color: theme.colors.textDim, fontSize: theme.font.small },
  topbarGear: { color: theme.colors.textDim, fontSize: 18, paddingLeft: 4 },
  stars: { color: theme.colors.yellow, fontSize: 10, letterSpacing: 1 },

  section: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: theme.spacing(2), marginBottom: theme.spacing(0.5),
  },
  sectionText: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(1.5),
  },

  h1: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700' },
  h2: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  body: { color: theme.colors.text, fontSize: theme.font.body },
  dim: { color: theme.colors.textDim },

  rowKV: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: theme.spacing(0.9),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  rowKVKey: { color: theme.colors.textDim, fontSize: theme.font.body },
  rowKVVal: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', fontVariant: ['tabular-nums'] },

  statBarRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3 },
  statBarLabel: { color: theme.colors.textDim, fontSize: theme.font.small, width: 88 },
  statBarTrack: { flex: 1, height: 8, backgroundColor: theme.colors.bg, borderRadius: 2, overflow: 'hidden' },
  statBarFill: { height: '100%', backgroundColor: theme.colors.blue, borderRadius: 2 },
  statBarVal: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 22, textAlign: 'right', fontVariant: ['tabular-nums'] },

  btn: {
    height: 42, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: theme.spacing(2),
  },
  btnPrimary: { backgroundColor: theme.colors.green },
  btnDanger: { backgroundColor: theme.colors.red },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.borderLight },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontSize: theme.font.h3, fontWeight: '700' },
  btnGhostText: { color: theme.colors.text },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  stepBtn: {
    width: 30, height: 30, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  stepVal: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },

  crest: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  crestText: { color: '#fff', fontWeight: '800' },

  posText: { fontSize: theme.font.small, fontWeight: '800' },

  barTrack: { backgroundColor: theme.colors.bg, overflow: 'hidden', flex: 1 },
  barFill: { height: '100%' },

  formRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  formMark: { fontSize: theme.font.body, fontWeight: '800' },

  pill: { alignItems: 'center', flex: 1 },
  pillValue: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pillLabel: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
});
