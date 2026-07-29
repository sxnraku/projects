import React, { useMemo, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGameStore } from '../../src/state/gameStore';
import {
  effectiveOverall,
  effectiveOverallFine,
  Formation,
  isNaturalPosition,
  Mentality,
  Position,
  shortName,
  Tactic,
  Tempo,
} from '../../src/core/models';
import { autoPickLineup, lineupOverall } from '../../src/core/game';
import { physicalLoad } from '../../src/core/engine';
import { attrColor, fitnessColor, theme } from '../../src/ui/theme';
import { to100 } from '../../src/ui/format';
import { useT } from '../../src/ui/i18n';
import { Face } from '../../src/ui/Face';
import { Body, PosText, Screen, Section } from '../components';

const FORMATIONS = Object.values(Formation);
const MENTALITIES: Mentality[] = ['DEFENSIVE', 'BALANCED', 'ATTACKING'];
const TEMPOS: Tempo[] = ['SLOW', 'NORMAL', 'FAST'];

/** Coordenadas normalizadas por formação (x: 0-1 esq→dir; y: 0-1 baliza→ataque). */
const LAYOUTS: Record<Formation, { x: number; y: number }[]> = {
  '4-4-2': [
    { x: 0.5, y: 0.06 },
    { x: 0.15, y: 0.28 }, { x: 0.38, y: 0.26 }, { x: 0.62, y: 0.26 }, { x: 0.85, y: 0.28 },
    { x: 0.15, y: 0.55 }, { x: 0.38, y: 0.52 }, { x: 0.62, y: 0.52 }, { x: 0.85, y: 0.55 },
    { x: 0.38, y: 0.82 }, { x: 0.62, y: 0.82 },
  ],
  '4-3-3': [
    { x: 0.5, y: 0.06 },
    { x: 0.15, y: 0.28 }, { x: 0.38, y: 0.26 }, { x: 0.62, y: 0.26 }, { x: 0.85, y: 0.28 },
    { x: 0.28, y: 0.52 }, { x: 0.5, y: 0.55 }, { x: 0.72, y: 0.52 },
    { x: 0.18, y: 0.82 }, { x: 0.5, y: 0.85 }, { x: 0.82, y: 0.82 },
  ],
  '4-2-3-1': [
    { x: 0.5, y: 0.06 },
    { x: 0.15, y: 0.28 }, { x: 0.38, y: 0.26 }, { x: 0.62, y: 0.26 }, { x: 0.85, y: 0.28 },
    { x: 0.36, y: 0.46 }, { x: 0.64, y: 0.46 },
    { x: 0.5, y: 0.64 }, { x: 0.18, y: 0.72 }, { x: 0.82, y: 0.72 },
    { x: 0.5, y: 0.88 },
  ],
  '3-5-2': [
    { x: 0.5, y: 0.06 },
    { x: 0.28, y: 0.26 }, { x: 0.5, y: 0.24 }, { x: 0.72, y: 0.26 },
    { x: 0.5, y: 0.44 },
    { x: 0.12, y: 0.56 }, { x: 0.36, y: 0.54 }, { x: 0.64, y: 0.54 }, { x: 0.88, y: 0.56 },
    { x: 0.38, y: 0.84 }, { x: 0.62, y: 0.84 },
  ],
  '5-3-2': [
    { x: 0.5, y: 0.06 },
    { x: 0.1, y: 0.30 }, { x: 0.3, y: 0.26 }, { x: 0.5, y: 0.24 }, { x: 0.7, y: 0.26 }, { x: 0.9, y: 0.30 },
    { x: 0.3, y: 0.54 }, { x: 0.5, y: 0.56 }, { x: 0.7, y: 0.54 },
    { x: 0.38, y: 0.84 }, { x: 0.62, y: 0.84 },
  ],
  '4-5-1': [
    { x: 0.5, y: 0.06 },
    { x: 0.15, y: 0.28 }, { x: 0.38, y: 0.26 }, { x: 0.62, y: 0.26 }, { x: 0.85, y: 0.28 },
    { x: 0.12, y: 0.56 }, { x: 0.32, y: 0.54 }, { x: 0.5, y: 0.56 }, { x: 0.68, y: 0.54 }, { x: 0.88, y: 0.56 },
    { x: 0.5, y: 0.84 },
  ],
};

const MARK_W = 50;

/** Texto legível (claro/escuro) sobre uma cor de camisola. */
function readableOn(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#20242A' : '#fff';
}

export default function Tactics() {
  const t = useT();
  const state = useGameStore((s) => s.state);
  const setTactic = useGameStore((s) => s.setTactic);
  const managedId = state?.meta.managedClubId;

  const [pitchW, setPitchW] = useState(0);
  const [pickSlot, setPickSlot] = useState<number | null>(null); // slot a escolher

  if (!state || !managedId) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const tactic = state.tactics[managedId]!;
  const club = state.clubs[managedId]!;
  const layout = LAYOUTS[tactic.formation];
  const pitchH = pitchW * 1.35;

  const changeFormation = (formation: Formation) => {
    const next = autoPickLineup(managedId, club.squad, state.players, formation);
    next.mentality = tactic.mentality;
    next.tempo = tactic.tempo;
    setTactic(next);
  };

  /** Coloca um jogador no slot: se já está no onze, troca; senão substitui. */
  const assignPlayer = (slotIndex: number, playerId: string) => {
    const lineup = tactic.lineup.map((s) => ({ ...s }));
    const existingIdx = lineup.findIndex((s) => s.playerId === playerId);
    if (existingIdx >= 0) {
      lineup[existingIdx]!.playerId = lineup[slotIndex]!.playerId;
    }
    lineup[slotIndex]!.playerId = playerId;
    const inLineup = new Set(lineup.map((s) => s.playerId));
    const bench = club.squad.filter((id) => !inLineup.has(id)).slice(0, 7);
    setTactic({ ...tactic, lineup, bench });
    setPickSlot(null);
  };

  const onPitchLayout = (e: LayoutChangeEvent) => setPitchW(e.nativeEvent.layout.width);

  // Consolidação das escolhas: qualidade do onze e preço físico da tática.
  const xiOverall = lineupOverall(state, managedId);
  const load = physicalLoad(tactic);
  const loadColor = load.level === 'VERY_HIGH' ? theme.colors.red
    : load.level === 'HIGH' ? theme.colors.yellow
    : load.level === 'LOW' ? theme.colors.blue
    : theme.colors.green;

  // Candidatos para o slot: TODOS os jogadores, mas os da posição natural
  // aparecem primeiro. O rating já inclui a penalização de fora de posição.
  const slotPosition: Position | null = pickSlot !== null ? tactic.lineup[pickSlot]!.position : null;
  const candidates = useMemo(() => {
    if (slotPosition === null) return [];
    return club.squad
      .map((id) => state.players[id]!)
      .filter(Boolean)
      .map((p) => ({
        p,
        rating: effectiveOverall(p, slotPosition),
        natural: isNaturalPosition(p, slotPosition),
      }))
      .sort((a, b) => {
        if (a.natural !== b.natural) return a.natural ? -1 : 1; // naturais à frente
        return b.rating - a.rating;
      });
  }, [slotPosition, club.squad, state.players]);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Section title={t('tac.formation')} />
        <View style={styles.chips}>
          {FORMATIONS.map((f) => (
            <Chip key={f} label={f} active={tactic.formation === f} onPress={() => changeFormation(f)} />
          ))}
        </View>

        {/* Dois números que consolidam as escolhas todas: qualidade e custo. */}
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>{t('tac.xiOverall')}</Text>
            <Text style={[styles.summaryVal, { color: attrColor(Math.round(xiOverall)) }]}>
              {to100(xiOverall)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>{t('tac.load')}</Text>
            <Text style={[styles.summaryVal, { color: loadColor }]}>
              {t('tac.loadLine', { label: t(`loadlvl.${load.level}`), fit: load.fatigue })}
            </Text>
          </View>
        </View>

        {/* CAMPO — toca num jogador para o substituir (lista, não drag) */}
        <View style={styles.pitch} onLayout={onPitchLayout}>
          <PitchStripes />
          <FieldMarkings />
          {pitchW > 0 && tactic.lineup.map((slot, i) => {
            const p = state.players[slot.playerId];
            const pos = layout[i]!;
            // Rating já com penalização se estiver fora da posição natural.
            const rating = p ? effectiveOverall(p, slot.position) : 0;
            const outOfPos = p ? !isNaturalPosition(p, slot.position) : false;
            return (
              <Pressable
                key={i}
                onPress={() => setPickSlot(i)}
                style={[styles.mkWrap, {
                  // x espelhado: direita do ecrã = lado direito do campo (RB/RW).
                  left: (1 - pos.x) * pitchW - MARK_W / 2,
                  top: (1 - pos.y) * pitchH - 26,
                }]}
              >
                <PlayerMarker
                  shirtColor={club.primaryColor}
                  gk={slot.position === 'GK'}
                  outOfPos={outOfPos}
                  injured={p?.condition.status === 'INJURED'}
                  suspended={!!p?.condition.suspended}
                  ovr={p ? String(to100(effectiveOverallFine(p, slot.position))) : '—'}
                  pos={`${slot.position}${outOfPos ? '!' : ''}`}
                  name={p ? shortName(p) : '—'}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('tac.hint')}</Text>

        <Section title={t('tac.mentality')} />
        <Segment
          options={MENTALITIES.map((m) => ({
            key: m, label: t(`mentality.${m}`), active: tactic.mentality === m,
            onPress: () => setTactic({ ...tactic, mentality: m }),
          }))}
        />

        <Section title={t('tac.tempo')} />
        <Segment
          options={TEMPOS.map((tp) => ({
            key: tp, label: t(`tempo.${tp}`), active: tactic.tempo === tp,
            onPress: () => setTactic({ ...tactic, tempo: tp }),
          }))}
        />

        <Section title={t('tac.instructions')} />
        <Slider
          label={t('tac.pressing')}
          value={tactic.pressing}
          onChange={(v) => setTactic({ ...tactic, pressing: v })}
          hint={t('tac.pressing.hint')}
        />
        <Slider
          label={t('tac.line')}
          value={tactic.defensiveLine}
          onChange={(v) => setTactic({ ...tactic, defensiveLine: v })}
          hint={t('tac.line.hint')}
        />
        <Slider
          label={t('tac.creativity')}
          value={tactic.creativity}
          onChange={(v) => setTactic({ ...tactic, creativity: v })}
          hint={t('tac.creativity.hint')}
        />

        {/* O preço da tática, em números — decidir pressão alta é decidir
            estoirar o plantel para a jornada seguinte. */}
        <View style={[styles.loadBox, { borderColor: loadColor }]}>
          <Text style={[styles.loadTitle, { color: loadColor }]}>
            {t('load.title', {
              label: t(`loadlvl.${load.level}`),
              delta: load.deltaPct !== 0
                ? t('load.delta', { sign: load.deltaPct > 0 ? '+' : '', pct: load.deltaPct })
                : '',
            })}
          </Text>
          <Text style={styles.loadHint}>{t(`load.${load.level}`)}</Text>
        </View>

        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>

      {/* SELETOR DE JOGADOR */}
      <Modal visible={pickSlot !== null} animationType="fade" transparent onRequestClose={() => setPickSlot(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPickSlot(null)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {t('tac.pick', { pos: slotPosition ?? '' })}
            </Text>
            <FlatList
              data={candidates}
              keyExtractor={(c) => c.p.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => {
                const inLineup = tactic.lineup.some((s) => s.playerId === item.p.id);
                const current = pickSlot !== null && tactic.lineup[pickSlot]!.playerId === item.p.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => pickSlot !== null && assignPlayer(pickSlot, item.p.id)}
                  >
                    <Text style={[styles.pickOvr, { color: attrColor(item.rating) }]}>{to100(effectiveOverallFine(item.p, slotPosition ?? item.p.positions[0]!))}</Text>
                    <Face seed={item.p.id} size={30} shirt={club.primaryColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickName}>
                        {shortName(item.p)}
                        {current ? <Text style={{ color: theme.colors.blue }}>  {t('tac.current')}</Text> : null}
                        {inLineup && !current ? <Text style={{ color: theme.colors.textDim }}>  {t('tac.inLineup')}</Text> : null}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <PosText position={item.p.positions[0]!} />
                        <Text style={styles.pickSub}>{t('tac.years', { n: item.p.age })}</Text>
                        {!item.natural ? (
                          <Text style={styles.pickOutOfPos}>{t('tac.outOfPos')}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={[styles.pickFit, { color: fitnessColor(item.p.condition.fitness) }]}>
                      {item.p.condition.fitness}%
                    </Text>
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** Slider discreto 0..10 em blocos ■■■■□□□ — toca num bloco para definir. */
function Slider({
  label, value, onChange, hint,
}: { label: string; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderVal}>{value}/10</Text>
      </View>
      <View style={styles.sliderTrack}>
        {Array.from({ length: 11 }, (_, i) => (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            hitSlop={4}
            style={[styles.sliderCell, i <= value && styles.sliderCellOn]}
          />
        ))}
      </View>
      <Text style={styles.sliderHint}>{hint}</Text>
    </View>
  );
}

function Chip({ label, active, onPress, radio }: { label: string; active: boolean; onPress: () => void; radio?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {radio ? (active ? '● ' : '○ ') : ''}{label}
      </Text>
    </Pressable>
  );
}

/** Seletor segmentado — opções lado a lado, a ativa com destaque dourado. */
function Segment({ options }: { options: { key: string; label: string; active: boolean; onPress: () => void }[] }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={o.onPress} style={[styles.segItem, o.active && styles.segItemOn]}>
          <Text style={[styles.segText, o.active && styles.segTextOn]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Marcador de jogador em forma de camisola (cabeça + camisola + posição + nome). */
function PlayerMarker({
  shirtColor, gk, outOfPos, injured, suspended, ovr, pos, name,
}: { shirtColor: string; gk: boolean; outOfPos: boolean; injured?: boolean; suspended?: boolean; ovr: string; pos: string; name: string }) {
  const fill = gk ? theme.colors.yellow : shirtColor;
  const ink = readableOn(fill);
  return (
    <>
      <View style={styles.mkHead} />
      <View style={[styles.mkShirt, { backgroundColor: fill }, outOfPos && styles.mkShirtWarn, (injured || suspended) && styles.mkShirtUnavail]}>
        <View style={[styles.mkSleeve, styles.mkSleeveL, { backgroundColor: fill }]} />
        <View style={[styles.mkSleeve, styles.mkSleeveR, { backgroundColor: fill }]} />
        <Text style={[styles.mkOvr, { color: ink }]}>{ovr}</Text>
        {injured ? <Text style={styles.mkBadge}>🚑</Text> : suspended ? <Text style={styles.mkBadge}>🟥</Text> : null}
      </View>
      <View style={[styles.mkPosPill, outOfPos && { backgroundColor: theme.colors.red }]}>
        <Text style={styles.mkPosText}>{pos}</Text>
      </View>
      <Text style={styles.mkName} numberOfLines={1}>{name}</Text>
    </>
  );
}

/** Riscas de relvado (bandas horizontais alternadas) por baixo das marcações. */
function PitchStripes() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? theme.colors.pitchStripe : theme.colors.pitch }} />
      ))}
    </View>
  );
}

function FieldMarkings() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.halfLine} />
      <View style={styles.centerCircle} />
      <View style={[styles.box, styles.boxTop]} />
      <View style={[styles.box, styles.boxBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(0.75) },
  chip: {
    paddingHorizontal: theme.spacing(1.25), paddingVertical: theme.spacing(0.75),
    borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { borderColor: theme.colors.blue, backgroundColor: theme.colors.surfaceAlt },
  chipText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  chipTextActive: { color: theme.colors.blue },

  summary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(1.25), marginTop: theme.spacing(1.5),
  },
  summaryLabel: {
    color: theme.colors.textDim, fontSize: theme.font.small,
    fontWeight: '700', letterSpacing: 1,
  },
  summaryVal: { fontSize: theme.font.h2, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },

  loadBox: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm,
    borderWidth: 1, padding: theme.spacing(1.25), marginTop: theme.spacing(0.5),
  },
  loadTitle: { fontSize: theme.font.body, fontWeight: '700' },
  loadHint: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 3 },

  pitch: {
    width: '100%', aspectRatio: 1 / 1.35, backgroundColor: theme.colors.pitch,
    borderRadius: theme.radius.md, overflow: 'hidden', marginTop: theme.spacing(1.5),
    borderWidth: 1, borderColor: theme.colors.border,
  },
  hint: {
    color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center',
    marginTop: theme.spacing(0.75),
  },

  halfLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, backgroundColor: theme.colors.pitchLine },
  centerCircle: {
    position: 'absolute', top: '50%', left: '50%', width: 76, height: 76, marginLeft: -38, marginTop: -38,
    borderRadius: 38, borderWidth: 1.5, borderColor: theme.colors.pitchLine,
  },
  box: { position: 'absolute', left: '50%', width: 130, marginLeft: -65, height: 48, borderWidth: 1.5, borderColor: theme.colors.pitchLine },
  boxTop: { top: -1.5, borderTopWidth: 0 },
  boxBottom: { bottom: -1.5, borderBottomWidth: 0 },

  // Marcador de jogador (camisola)
  mkWrap: { position: 'absolute', width: MARK_W, alignItems: 'center' },
  mkHead: {
    width: 11, height: 11, borderRadius: 6, backgroundColor: '#D2D6DC',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)', marginBottom: 1,
  },
  mkShirt: {
    width: 34, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.30)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  mkShirtWarn: { borderColor: theme.colors.red, borderWidth: 2 },
  mkShirtUnavail: { borderColor: theme.colors.red, borderWidth: 2, opacity: 0.7 },
  mkBadge: { position: 'absolute', top: -8, right: -8, fontSize: 13 },
  mkSleeve: { position: 'absolute', top: 3, width: 9, height: 11, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.30)' },
  mkSleeveL: { left: -5, transform: [{ rotate: '-20deg' }] },
  mkSleeveR: { right: -5, transform: [{ rotate: '20deg' }] },
  mkOvr: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mkPosPill: {
    marginTop: 3, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  mkPosText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  mkName: {
    color: '#fff', fontSize: 10.5, fontWeight: '700', marginTop: 2, maxWidth: MARK_W + 18,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 2,
  },

  // Seletor segmentado (Mentalidade / Ritmo)
  segment: {
    flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.colors.border, padding: 3, gap: 3, marginTop: 4,
  },
  segItem: { flex: 1, paddingVertical: theme.spacing(1), alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  segItemOn: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textDim, fontSize: theme.font.small, fontWeight: '700' },
  segTextOn: { color: '#20242A', fontWeight: '800' },

  sliderRow: { marginBottom: theme.spacing(1.5) },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sliderLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  sliderVal: { color: theme.colors.blue, fontSize: theme.font.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sliderTrack: { flexDirection: 'row', gap: 3 },
  sliderCell: { flex: 1, height: 18, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt },
  sliderCellOn: { backgroundColor: theme.colors.blue },
  sliderHint: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 3 },

  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: theme.spacing(2) },
  modalBox: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(1.5),
  },
  modalTitle: {
    color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700',
    marginBottom: theme.spacing(1),
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.25), paddingVertical: theme.spacing(1) },
  pickOvr: { fontSize: theme.font.h3, fontWeight: '800', width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pickName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  pickSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  pickOutOfPos: { color: theme.colors.red, fontSize: theme.font.small, fontWeight: '700' },
  pickFit: { fontSize: theme.font.small, fontWeight: '700', width: 38, textAlign: 'right' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
});
