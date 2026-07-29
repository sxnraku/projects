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
import { managedLeagueId, nextRound } from '../src/core/game';
import { useGameStore } from '../src/state/gameStore';
import { money } from '../src/ui/format';
import { useT } from '../src/ui/i18n';
import { fitnessColor, POS_COLORS, reputationStars, theme } from '../src/ui/theme';

/** Preto ou branco conforme a cor de fundo, para o texto ficar legível. */
export function contrastOn(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return '#fff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Luminância relativa aproximada.
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1A1D22' : '#FFFFFF';
}

/** Escurece uma cor hex por um fator (0..1) — usado nos degradés do cabeçalho. */
export function darken(hex: string, factor: number): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(c.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(c.slice(4, 6), 16) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Escudo circular (estilo "logo token" dos ecrãs de referência). */
export function CrestCircle({ club, size = 32 }: { club: Club; size?: number }) {
  return (
    <View style={[
      styles.crestCircle,
      {
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: club.primaryColor,
        borderColor: club.secondaryColor,
        borderWidth: Math.max(1.5, size * 0.06),
      },
    ]}>
      <Text style={[styles.crestCircleText, {
        fontSize: size * 0.36, color: contrastOn(club.primaryColor),
      }]}>
        {club.shortName.slice(0, 3)}
      </Text>
    </View>
  );
}

export function Screen({ children, edges }: { children: React.ReactNode; edges?: ('top' | 'right' | 'bottom' | 'left')[] }) {
  return <SafeAreaView style={styles.screen} edges={edges ?? ['left', 'right']}>{children}</SafeAreaView>;
}

/**
 * Barra superior: faixa colorida do clube (escudo + nome) + tira escura com
 * época/jornada ao centro e pastilhas de recursos (energia, lesões, dinheiro,
 * reputação). Estilo dos jogos de gestão móveis, mas com dados reais.
 */
export function TopBar() {
  const router = useRouter();
  const t = useT();
  const state = useGameStore((s) => s.state);
  const club = useGameStore((s) => s.managedClub)();
  // Sem estado ou durante o onboarding: barra vazia (sem dados falsos).
  if (!state || !club || state.meta.managerName === '') {
    return <SafeAreaView edges={['top']} style={styles.topbarWrap} />;
  }

  const fin = state.finances[club.id];
  const balance = fin?.balance ?? 0;
  const head = club.primaryColor;
  const ink = contrastOn(head);

  // Recursos derivados do plantel.
  const squad = club.squad.map((id) => state.players[id]).filter(Boolean);
  const avgFit = squad.length
    ? Math.round(squad.reduce((s, p) => s + (p!.condition.fitness), 0) / squad.length)
    : 0;
  const injured = squad.filter((p) => p!.condition.status === 'INJURED').length;

  const careerYear = state.career.seasons.length + 1;
  const round = nextRound(state, managedLeagueId(state));
  const seasonLabel = `${state.meta.season}/${String((state.meta.season + 1) % 100).padStart(2, '0')}`;

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: head }}>
      {/* Faixa do clube */}
      <View style={[styles.clubBand, { backgroundColor: head }]}>
        <CrestCircle club={club} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.clubBandName, { color: ink }]} numberOfLines={1}>{club.name}</Text>
          <View style={{ opacity: 0.9 }}>
            <Stars value={reputationStars(club.reputation)} />
          </View>
        </View>
        <Pressable onPress={() => router.push('/club' as never)} hitSlop={8}
          style={[styles.gearBtn, { borderColor: ink === '#FFFFFF' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)' }]}>
          <Text style={[styles.gearText, { color: ink }]}>⚙</Text>
        </Pressable>
      </View>

      {/* Tira de recursos */}
      <View style={styles.resBar}>
        <Text style={styles.resSeason} numberOfLines={1}>
          {round
            ? t('top.season', { y: careerYear, season: seasonLabel, round })
            : t('top.seasonNoRound', { y: careerYear, season: seasonLabel })}
        </Text>
        <View style={styles.resPills}>
          <ResPill icon="⚡" text={`${avgFit}%`} color={fitnessColor(avgFit)} />
          <ResPill icon="✚" text={String(injured)} color={injured > 0 ? theme.colors.red : theme.colors.textDim} />
          <ResPill icon="€" text={money(balance)} color={balance >= 0 ? theme.colors.green : theme.colors.red} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ResPill({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <View style={styles.resPill}>
      <Text style={[styles.resPillIcon, { color }]}>{icon}</Text>
      <Text style={[styles.resPillText, { color }]}>{text}</Text>
    </View>
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

/**
 * Cartão de dashboard: barra de título com chevron (toca para abrir o ecrã
 * completo) e conteúdo por baixo. É o tijolo do novo ecrã inicial em cartões.
 */
export function DashCard({
  title, onOpen, right, children, style, accent,
}: {
  title: string;
  onOpen?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string; // fio de cor à esquerda (estado: alerta, etc.)
}) {
  return (
    <View style={[styles.dashCard, accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : null, style]}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        style={styles.dashHead}
      >
        <Text style={styles.dashTitle}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) }}>
          {right}
          {onOpen ? <Text style={styles.dashChevron}>»</Text> : null}
        </View>
      </Pressable>
      <View style={styles.dashBody}>{children}</View>
    </View>
  );
}

/** Trio de forças DEF · MED · ATA em caixas, como nos ecrãs de referência. */
export function StrengthTriplet({
  def, mid, att, compact,
}: { def: number; mid: number; att: number; compact?: boolean }) {
  const cells: [string, number][] = [['DEF', def], ['MED', mid], ['ATA', att]];
  return (
    <View style={styles.triplet}>
      {cells.map(([label, v]) => (
        <View key={label} style={styles.tripletCell}>
          <Text style={styles.tripletLabel}>{label}</Text>
          <Text style={[styles.tripletVal, compact && { fontSize: theme.font.body }]}>{v}</Text>
        </View>
      ))}
    </View>
  );
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
      {/* Mostra na escala 0-100 (a % do máximo interno). */}
      <Text style={styles.statBarVal}>{Math.round(pct)}</Text>
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

  clubBand: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25),
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
  },
  clubBandName: { fontSize: theme.font.h2, fontWeight: '800' },
  gearBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  gearText: { fontSize: 18 },

  resBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#171B21', paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(0.75),
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  resSeason: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  resPills: { flexDirection: 'row', gap: theme.spacing(0.75) },
  resPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: theme.colors.surface, borderRadius: 5,
    paddingHorizontal: theme.spacing(0.75), paddingVertical: 3,
  },
  resPillIcon: { fontSize: 11, fontWeight: '800' },
  resPillText: { fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },

  crestCircle: { alignItems: 'center', justifyContent: 'center' },
  crestCircleText: { fontWeight: '900', letterSpacing: 0.5 },

  stars: { color: theme.colors.yellow, fontSize: 10, letterSpacing: 1 },

  dashCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing(1.25),
    overflow: 'hidden',
  },
  dashHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
    backgroundColor: theme.colors.surfaceAlt,
  },
  dashTitle: {
    color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '800',
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  dashChevron: { color: theme.colors.textDim, fontSize: theme.font.h3, fontWeight: '800' },
  dashBody: { padding: theme.spacing(1.5) },

  triplet: { flexDirection: 'row', gap: theme.spacing(0.75) },
  tripletCell: {
    flex: 1, alignItems: 'center', backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm, paddingVertical: theme.spacing(0.75),
  },
  tripletLabel: { color: theme.colors.textDim, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  tripletVal: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', fontVariant: ['tabular-nums'] },

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
