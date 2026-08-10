import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { useT } from '../i18n';
import { playSound } from '../sound';
import { bakeClip, pickTemplate, PITCH, VW, VH, BakedClip } from './choreography';
import { PixelPlayer, SPRITE_H, SPRITE_W } from './PixelPlayer';

/**
 * LANCE DE GOLO animado (opção "highlights"): um clip curto e coreografado por
 * golo — passe → corrida → remate → rede → cartão "GOLO!". Duração FIXA em tempo
 * real, tocada com `Animated` no DRIVER NATIVO (à mesma velocidade em qualquer
 * telemóvel, independente da velocidade da repetição). Toca no ecrã para saltar.
 *
 * Todas as posições vêm de keyframes "assados" em choreography.ts e são
 * interpoladas a partir de UM único valor 0→1 → tudo corre na UI thread.
 *
 * Os jogadores são figuras de pixel art (`PixelPlayer`) e não círculos: ver o
 * comentário nesse ficheiro para a razão de serem feitas de retângulos.
 */

const BALL_R = 5.4;
const TRAIL = [{ lag: 1, op: 0.34 }, { lag: 2, op: 0.22 }, { lag: 3, op: 0.12 }];

/** Largura da figura em coordenadas virtuais do campo (o resto sai daqui). */
const SPRITE_VW = 16;

const GRASS = '#4b9e43';
const STRIPE = '#408c3a';
const LINE = 'rgba(255,255,255,0.62)';
const NETLINE = 'rgba(255,255,255,0.28)';
const POST = '#f4f7fa';
const GOLD = theme.colors.accent;
const RED = theme.colors.red;
const STAND = '#0a1710';
const ROOF = '#060f0a';
const BOARD_BG = '#101b25';

/** Cores do público — fixas por índice para a bancada não "cintilar". */
const CROWD_TONES = ['#e6e9ef', '#c9a227', '#8a94a3', '#d95f3a', '#5a6472', '#f0d478'];
const CROWD_COLS = 34;
const CROWD_ROWS = 3;

/** Altura da placa publicitária, em coordenadas virtuais. */
const BOARD_H = 15;

export function GoalClip({
  scorer, minute, attackColor, defenceColor, seed, width, onDone, onNet, ours, clubName,
}: {
  scorer: string;
  minute: number;
  attackColor: string;
  defenceColor: string;
  seed: number;
  width: number;
  onDone: () => void;
  /**
   * Disparado no instante EXATO em que a bola entra na rede. Quem chama usa-o
   * para a reação da bancada — que depende de o golo ser nosso ou sofrido, algo
   * que o clip não sabe. Sem isto o rugido saía no início do lance, antes de a
   * bola sequer ser rematada.
   */
  onNet?: () => void;
  /**
   * O golo é da NOSSA equipa? Muda a etiqueta, a cor do "GOLO!" e o clarão.
   * O jogo sempre soube de que lado foi o golo — só nunca o dizia, e num lance
   * animado com as cores de dois clubes parecidos não havia como perceber.
   */
  ours?: boolean;
  /**
   * Nome (curto) do clube que marcou. Aparece na etiqueta e no cartão — dizer
   * "pela nossa equipa" obrigava o utilizador a traduzir mentalmente; o nome do
   * clube lê-se de imediato e serve tanto para o golo nosso como para o sofrido.
   */
  clubName?: string;
}) {
  const t = useT();
  const which = useMemo(() => pickTemplate(seed), [seed]);
  const clip = useMemo<BakedClip>(() => bakeClip(which), [which]);
  const progress = useRef(new Animated.Value(0)).current;
  // Via ref para o efeito não ter de correr outra vez quando o callback muda.
  const onNetRef = useRef(onNet);
  onNetRef.current = onNet;

  const k = width / VW;
  const height = width * (VH / VW);
  const isOurs = ours !== false;
  const accent = isOurs ? GOLD : RED;

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1, duration: clip.durationMs, easing: Easing.linear, useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) onDone(); });

    // SOM DO LANCE — os toques na bola ("tuc"), o remate e a bola a entrar na
    // rede, seguidos da bancada. Os instantes vêm da própria trajetória
    // (`clip.cues`), por isso batem certo com o que se vê a acontecer.
    const timers = clip.cues.map((cue) => setTimeout(() => {
      if (cue.kind === 'net') { playSound('net'); onNetRef.current?.(); }
      else playSound(cue.kind);
    }, cue.atMs));

    return () => {
      anim.stop();
      for (const timer of timers) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

  const ir = clip.inputRange;
  const ip = (out: number[]) => progress.interpolate({ inputRange: ir, outputRange: out });
  const shift = (arr: number[], lag: number) => arr.map((_, i) => arr[Math.max(0, i - lag)]!);

  // ---- peças estáticas do campo ----
  const P = PITCH;
  const px = (v: number) => v * k;
  const unit = px(SPRITE_VW) / SPRITE_W;      // tamanho de um "pixel" da figura
  const spriteW = SPRITE_W * unit;
  const spriteH = SPRITE_H * unit;
  /** Topo do relvado visível: abaixo da bancada e da placa. */
  const turfTop = P.standsY + BOARD_H;

  // PASSADA — as duas poses trocam ao longo do clip. Um dente de serra sobre os
  // keyframes: o driver nativo interpola-o e lê-se como corrida.
  const strideA = ip(ir.map((_, i) => (i % 4 < 2 ? 1 : 0)));
  const strideB = ip(ir.map((_, i) => (i % 4 < 2 ? 0 : 1)));
  // BRAÇOS NO AR — a partir do momento em que o cartão "GOLO!" começa a subir.
  const armsUp = ip(clip.card.map((c) => Math.min(1, c * 2)));
  const armsDown = ip(clip.card.map((c) => 1 - Math.min(1, c * 2)));

  return (
    <Pressable style={[styles.wrap, { width, height }]} onPress={onDone}>
      {/* PALCO (leva o zoom da câmara) */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: ip(clip.zoom.map((z) => 1 + z * 0.05)) }] }]}>
        {/* relva + riscas horizontais (como um relvado cortado de fundo a fundo) */}
        <View style={StyleSheet.absoluteFill}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? STRIPE : GRASS }} />
          ))}
        </View>

        {/* BANCADA — telhado, público e holofotes. O público é determinístico
            (cor por índice); se fosse aleatório mudava a cada render. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: px(P.standsY), backgroundColor: STAND, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: px(7), backgroundColor: ROOF }} />
          {Array.from({ length: CROWD_ROWS }).map((_, r) => (
            Array.from({ length: CROWD_COLS }).map((__, c) => (
              <View
                key={`${r}-${c}`}
                style={{
                  position: 'absolute',
                  left: (width / CROWD_COLS) * (c + 0.18),
                  top: px(10 + r * 12),
                  width: (width / CROWD_COLS) * 0.62,
                  height: px(8),
                  borderRadius: 1,
                  backgroundColor: CROWD_TONES[(r * 7 + c * 3) % CROWD_TONES.length],
                  opacity: 0.4 + ((c + r) % 3) * 0.16,
                }}
              />
            ))
          ))}
          {[0.13, 0.78].map((left) => (
            <View
              key={left}
              style={{
                position: 'absolute', left: width * left, top: px(2),
                width: px(30), height: px(13), borderRadius: 2,
                backgroundColor: '#f2eccd', borderWidth: 1, borderColor: '#6e6640',
              }}
            />
          ))}
        </View>

        {/* Halo dos holofotes — três círculos concêntricos a esbater, porque não
            há gradientes nativos sem outra biblioteca. */}
        {[0.13, 0.78].map((left) => (
          [0, 1, 2].map((ring) => (
            <View
              key={`${left}-${ring}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: width * left - px(30 + ring * 22),
                top: px(P.standsY - 26 - ring * 14),
                width: px(90 + ring * 44),
                height: px(70 + ring * 30),
                borderRadius: px(60),
                backgroundColor: '#fff8d6',
                opacity: 0.05 - ring * 0.014,
              }}
            />
          ))
        ))}

        {/* PLACA PUBLICITÁRIA atrás da baliza — onde a publicidade está num
            estádio a sério, e onde o jogo se anuncia sem tapar o campo. */}
        <View
          style={{
            position: 'absolute', left: 0, right: 0, top: px(P.standsY), height: px(BOARD_H),
            backgroundColor: BOARD_BG, alignItems: 'center', justifyContent: 'center',
            borderTopWidth: 1, borderTopColor: 'rgba(227,179,65,0.55)',
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.6)',
          }}
        >
          <Text style={[styles.board, { fontSize: px(8.4) }]} numberOfLines={1}>
            ★ FOOTBALL LEGACY ★
          </Text>
        </View>

        {/* LINHAS DO CAMPO — laterais, linha de golo, áreas, marca e meia-lua */}
        <View style={{ position: 'absolute', left: px(6), top: px(turfTop), width: 1.5, height: px(VH - turfTop), backgroundColor: LINE }} />
        <View style={{ position: 'absolute', left: px(VW - 7), top: px(turfTop), width: 1.5, height: px(VH - turfTop), backgroundColor: LINE }} />
        <View style={{ position: 'absolute', left: px(6), top: px(P.GOAL_Y), width: px(VW - 12), height: 1.5, backgroundColor: LINE }} />

        <View style={{ position: 'absolute', left: px(P.box.x), top: px(P.box.y), width: px(P.box.w), height: px(P.box.h), borderWidth: 1.5, borderTopWidth: 0, borderColor: LINE }} />
        <View style={{ position: 'absolute', left: px(P.six.x), top: px(P.six.y), width: px(P.six.w), height: px(P.six.h), borderWidth: 1.5, borderTopWidth: 0, borderColor: LINE }} />
        <View style={{ position: 'absolute', left: px(P.spot.x) - 2, top: px(P.spot.y) - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: LINE }} />

        {/* "D" (meia-lua) — elipse mascarada para mostrar só o arco fora da área */}
        <View style={{ position: 'absolute', left: px(P.dArc.cx - P.dArc.halfChord), top: px(P.dArc.edgeY), width: px(2 * P.dArc.halfChord), height: px(P.dArc.depth), overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, bottom: 0, width: px(2 * P.dArc.halfChord), height: px(2 * P.dArc.depth), borderRadius: px(2 * P.dArc.halfChord), borderWidth: 1.5, borderColor: LINE }} />
        </View>

        {/* Arcos e bandeirolas de canto */}
        {[true, false].map((left) => (
          <View
            key={String(left)}
            style={{
              position: 'absolute', left: left ? px(6) : px(VW - 18), top: px(P.GOAL_Y),
              width: px(12), height: px(12), overflow: 'hidden',
            }}
          >
            <View style={{
              position: 'absolute', left: left ? px(-12) : 0, top: 0,
              width: px(24), height: px(24), borderRadius: px(12), borderWidth: 1.5, borderColor: LINE,
            }} />
          </View>
        ))}
        {[true, false].map((left) => (
          <React.Fragment key={`flag-${left}`}>
            <View style={{ position: 'absolute', left: left ? px(6) : px(VW - 7), top: px(P.GOAL_Y - 12), width: 1.5, height: px(13), backgroundColor: '#e9eef4' }} />
            <View style={{ position: 'absolute', left: left ? px(7.5) : px(VW - 14), top: px(P.GOAL_Y - 12), width: px(7), height: px(5), backgroundColor: GOLD }} />
          </React.Fragment>
        ))}

        {/* BALIZA: rede + postes */}
        <View style={{ position: 'absolute', left: px(P.goal.x), top: px(P.goal.top), width: px(P.goal.w), height: px(P.goal.y - P.goal.top), overflow: 'hidden' }}>
          <Animated.View style={{ flex: 1, transform: [{ scaleY: ip(clip.net.map((n) => 1 + n * 0.07)) }] }}>
            {Array.from({ length: 11 }).map((_, i) => (
              <View key={'v' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / 10) * 100}%`, width: StyleSheet.hairlineWidth, backgroundColor: NETLINE }} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={'h' + i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i / 5) * 100}%`, height: StyleSheet.hairlineWidth, backgroundColor: NETLINE }} />
            ))}
            {/* clarão na rede ao balançar */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', opacity: ip(clip.net.map((n) => n * 0.3)) }]} />
          </Animated.View>
        </View>
        <View style={{ position: 'absolute', left: px(P.goal.x), top: px(P.goal.top), width: px(P.goal.w), height: px(P.goal.y - P.goal.top), borderWidth: 3, borderBottomWidth: 0, borderColor: POST, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />

        {/* JOGADORES — a figura assenta pelos PÉS na coordenada (x, y), por isso
            desloca-se meia largura para a esquerda e a altura toda para cima. */}
        {clip.actors.map((a, idx) => {
          const isGK = a.role === 'GK';
          const col = a.team === 'H' ? attackColor : defenceColor;
          return (
            <Animated.View
              key={idx}
              style={{
                position: 'absolute', left: 0, top: 0, width: spriteW, height: spriteH,
                transform: [
                  { translateX: ip(a.xs.map((x) => px(x) - spriteW / 2)) },
                  { translateY: ip(a.ys.map((y) => px(y) - spriteH)) },
                ],
              }}
            >
              <PixelPlayer
                color={col}
                unit={unit}
                keeper={isGK}
                hero={a.hero}
                heroColor={accent}
                legA={strideA}
                legB={strideB}
                // Só quem marcou festeja de braços no ar.
                armsUp={a.team === 'H' && !isGK ? armsUp : undefined}
                armsDown={a.team === 'H' && !isGK ? armsDown : undefined}
              />
            </Animated.View>
          );
        })}

        {/* sombra da bola no relvado — dá a leitura da ALTURA (encolhe e esbate
            quando a bola sobe); sem ela um cruzamento alto lia-se como passe rasteiro */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, top: 0,
            width: px(2 * BALL_R), height: px(BALL_R * 1.1), borderRadius: px(BALL_R),
            backgroundColor: '#000000',
            opacity: ip(clip.ball.shadow.map((sh) => 0.1 + sh * 0.22)),
            transform: [
              { translateX: ip(clip.ball.xs.map((x) => px(x - BALL_R))) },
              { translateY: ip(clip.ball.groundYs.map((y) => px(y - BALL_R * 0.55))) },
              { scale: ip(clip.ball.shadow.map((sh) => 0.55 + sh * 0.45)) },
            ],
          }}
        />

        {/* rasto da bola (comet) */}
        {TRAIL.map((tr, i) => (
          <Animated.View
            key={'t' + i}
            style={{
              position: 'absolute', left: 0, top: 0, width: px(2 * BALL_R * 0.8), height: px(2 * BALL_R * 0.8), borderRadius: px(BALL_R * 0.8),
              backgroundColor: '#ffffff', opacity: tr.op,
              transform: [{ translateX: ip(shift(clip.ball.xs, tr.lag).map((x) => px(x - BALL_R * 0.8))) }, { translateY: ip(shift(clip.ball.ys, tr.lag).map((y) => px(y - BALL_R * 0.8))) }],
            }}
          />
        ))}
        {/* bola */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, top: 0, width: px(2 * BALL_R), height: px(2 * BALL_R), borderRadius: px(BALL_R),
            backgroundColor: '#ffffff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#c9d2da',
            shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 4,
            transform: [
              { translateX: ip(clip.ball.xs.map((x) => px(x - BALL_R))) },
              { translateY: ip(clip.ball.ys.map((y) => px(y - BALL_R))) },
              { scale: ip(clip.ball.scale) },
            ],
          }}
        />
      </Animated.View>

      {/* clarão do golo (fora do palco → não faz zoom). Vermelho quando é sofrido. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {
          backgroundColor: isOurs ? '#ffffff' : '#ff6b60',
          opacity: ip(clip.flash.map((f) => f * (isOurs ? 0.45 : 0.3))),
        }]}
      />

      {/* etiqueta do tipo de lance */}
      <View style={styles.chip}><Text style={styles.chipText}>{t(`clip.${which}`).toUpperCase()}</Text></View>

      {/* DE QUEM É O GOLO — no topo, onde o olho já está no arranque do lance */}
      <View style={[styles.sideTag, { borderColor: accent, backgroundColor: isOurs ? 'rgba(227,179,65,0.18)' : 'rgba(229,83,75,0.16)' }]}>
        <Text style={[styles.sideText, { color: accent }]} numberOfLines={1}>
          {isOurs ? '★ ' : ''}{(clubName ?? '').toUpperCase()}
        </Text>
      </View>

      {/* cartão GOLO! */}
      <Animated.View
        pointerEvents="none"
        style={[styles.card, {
          borderColor: isOurs ? 'rgba(227,179,65,0.35)' : 'rgba(229,83,75,0.35)',
          opacity: ip(clip.card.map((c) => Math.min(1, c))),
          transform: [{ translateY: ip(clip.card.map((c) => (1 - c) * 120)) }],
        }]}
      >
        <View style={[styles.cardBar, { backgroundColor: isOurs ? attackColor : defenceColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.goloText, { color: accent }]}>{t('clip.goal')}</Text>
          <Text style={styles.scorerText} numberOfLines={1}>{scorer}</Text>
          <Text style={[styles.whoseText, { color: accent }]} numberOfLines={1}>
            {isOurs ? '★ ' : ''}{clubName ?? ''}
          </Text>
        </View>
        <View style={[styles.minPill, { backgroundColor: isOurs ? 'rgba(227,179,65,0.16)' : 'rgba(229,83,75,0.16)' }]}>
          <Text style={[styles.minText, { color: accent }]}>{minute}&apos;</Text>
        </View>
      </Animated.View>

      {/* dica de saltar */}
      <Text style={styles.skip}>{t('clip.skip')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', backgroundColor: '#06110a' },
  board: { color: GOLD, fontWeight: '700', letterSpacing: 2.2 },
  chip: {
    position: 'absolute', left: 12, top: 44, backgroundColor: 'rgba(5,17,11,0.6)',
    borderRadius: 11, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { color: 'rgba(234,240,246,0.9)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  sideTag: {
    position: 'absolute', right: 12, top: 44, maxWidth: '52%',
    borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  sideText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  card: {
    position: 'absolute', left: '9%', right: '9%', bottom: 42, minHeight: 76,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(13,20,28,0.96)', borderRadius: 16, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  cardBar: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  goloText: { fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5 },
  scorerText: { color: '#eaf0f6', fontSize: 16, fontWeight: '700', marginTop: 2 },
  whoseText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginTop: 3 },
  minPill: { borderRadius: 14, paddingHorizontal: 11, paddingVertical: 5 },
  minText: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  skip: {
    position: 'absolute', bottom: 12, alignSelf: 'center', color: 'rgba(255,255,255,0.55)',
    fontSize: 11, fontWeight: '600', left: 0, right: 0, textAlign: 'center',
  },
});
