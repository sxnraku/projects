import React from 'react';
import { Animated, View } from 'react-native';

/**
 * JOGADOR EM PIXEL ART — a figura que substituiu as bolinhas coloridas do clip
 * de golo.
 *
 * Construído com `View`s e não com um sprite PNG, por duas razões que mandam
 * mais do que a comodidade:
 *
 *  1. **Cor do clube.** Cada equipa entra com a sua cor primária. Um PNG só se
 *     pode tingir em monocromático (`tintColor`), o que apagaria a pele, os
 *     calções e as chuteiras. Com retângulos, cada peça leva a sua cor.
 *  2. **Driver nativo.** O clip anima tudo a partir de UM valor 0→1 na UI
 *     thread. Retângulos posicionados em absoluto deslocam-se com `transform`,
 *     que é exatamente o que o driver nativo aceita.
 *
 * A vista é de COSTAS (o ataque vai para a baliza no topo do ecrã), como nos
 * jogos de futebol retro: vê-se a nuca e a camisola, e é por isso que a figura
 * se lê sem precisar de rodar conforme a direção da corrida.
 *
 * Grelha de 7 × 10 "pixels". `unit` é o tamanho de um pixel em coordenadas
 * virtuais do campo — quem chama converte para ecrã.
 */

/** Largura e altura da figura, em pixels da grelha. */
export const SPRITE_W = 7;
export const SPRITE_H = 10;

const SKIN = '#e8b48c';
const HAIR = '#2b1d14';
const SHORTS = '#f2f4f7';
const SOCKS = '#1d2530';
const OUTLINE = 'rgba(0,0,0,0.45)';
const KEEPER = '#43d17a'; // camisola de guarda-redes: destaca-se de qualquer clube
const GLOVE = '#f5f7fa';

/** Escurece uma cor hex (#rrggbb) — usado nas mangas e no vinco da camisola. */
function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Um retângulo da grelha, em coordenadas de pixel. */
function Px({
  x, y, w, h, color, unit, radius = 0,
}: { x: number; y: number; w: number; h: number; color: string; unit: number; radius?: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x * unit,
        top: y * unit,
        width: w * unit,
        height: h * unit,
        backgroundColor: color,
        borderRadius: radius,
      }}
    />
  );
}

export function PixelPlayer({
  color,
  unit,
  keeper = false,
  hero = false,
  heroColor,
  /** Opacidade das duas pernas, alternada para dar passada. */
  legA,
  legB,
  /**
   * Opacidade das duas poses de braços. `armsUp` sobe no festejo — é o que
   * distingue "a correr" de "acabei de marcar" sem trocar de sprite.
   */
  armsUp,
  armsDown,
}: {
  color: string;
  unit: number;
  keeper?: boolean;
  hero?: boolean;
  heroColor?: string;
  legA?: Animated.AnimatedInterpolation<number>;
  legB?: Animated.AnimatedInterpolation<number>;
  armsUp?: Animated.AnimatedInterpolation<number>;
  armsDown?: Animated.AnimatedInterpolation<number>;
}) {
  const shirt = keeper ? KEEPER : color;
  const sleeve = shade(shirt, 0.78);
  const w = SPRITE_W * unit;
  const h = SPRITE_H * unit;

  return (
    <View style={{ width: w, height: h }}>
      {/* Sombra no relvado — assenta a figura no chão. Sem ela os jogadores
          pareciam autocolantes a flutuar. */}
      <View
        style={{
          position: 'absolute',
          left: unit * 0.6,
          top: h - unit * 1.1,
          width: w - unit * 1.2,
          height: unit * 1.5,
          borderRadius: unit,
          backgroundColor: 'rgba(0,0,0,0.28)',
        }}
      />

      {/* Pernas: duas poses sobrepostas que trocam de opacidade → passada. */}
      <Animated.View style={{ opacity: legA ?? 1 }}>
        <Px x={2} y={7} w={1.2} h={2.4} color={SOCKS} unit={unit} />
        <Px x={3.9} y={7} w={1.2} h={1.7} color={SOCKS} unit={unit} />
      </Animated.View>
      <Animated.View style={{ opacity: legB ?? 0 }}>
        <Px x={2} y={7} w={1.2} h={1.7} color={SOCKS} unit={unit} />
        <Px x={3.9} y={7} w={1.2} h={2.4} color={SOCKS} unit={unit} />
      </Animated.View>

      {/* Calções */}
      <Px x={1.9} y={5.6} w={3.3} h={1.7} color={keeper ? SOCKS : SHORTS} unit={unit} />

      {/* Tronco */}
      <Px x={1.7} y={2.9} w={3.7} h={2.9} color={shirt} unit={unit} radius={unit * 0.3} />

      {/* Braços: duas poses sobrepostas — ao lado do corpo, ou no ar a festejar. */}
      <Animated.View style={{ opacity: armsDown ?? 1 }}>
        <Px x={0.7} y={3.1} w={1.1} h={2.1} color={sleeve} unit={unit} radius={unit * 0.3} />
        <Px x={5.3} y={3.1} w={1.1} h={2.1} color={sleeve} unit={unit} radius={unit * 0.3} />
      </Animated.View>
      <Animated.View style={{ opacity: armsUp ?? 0 }}>
        <Px x={0.4} y={1.4} w={1.1} h={2.6} color={sleeve} unit={unit} radius={unit * 0.3} />
        <Px x={5.6} y={1.4} w={1.1} h={2.6} color={sleeve} unit={unit} radius={unit * 0.3} />
      </Animated.View>

      {/* Vinco central — separa ombros e dá volume à camisola */}
      <Px x={3.4} y={3.1} w={0.35} h={2.5} color={shade(shirt, 0.86)} unit={unit} />

      {/* Luvas do guarda-redes */}
      {keeper ? (
        <>
          <Px x={0.4} y={4.9} w={1.4} h={1.2} color={GLOVE} unit={unit} radius={unit * 0.4} />
          <Px x={5.3} y={4.9} w={1.4} h={1.2} color={GLOVE} unit={unit} radius={unit * 0.4} />
        </>
      ) : null}

      {/* Cabeça: nuca e cabelo (estamos a vê-lo de costas) */}
      <Px x={2.2} y={1.1} w={2.7} h={2} color={SKIN} unit={unit} radius={unit * 0.6} />
      <Px x={2.1} y={0.7} w={2.9} h={1.2} color={HAIR} unit={unit} radius={unit * 0.5} />

      {/* Contorno geral — em pixel art é o que separa a figura da relva */}
      <View
        style={{
          position: 'absolute',
          left: unit * 1.5,
          top: unit * 0.6,
          width: unit * 4.1,
          height: unit * 5.5,
          borderWidth: Math.max(0.6, unit * 0.16),
          borderColor: OUTLINE,
          borderRadius: unit * 0.5,
        }}
      />

      {/* Halo do protagonista do lance (quem marca) */}
      {hero ? (
        <View
          style={{
            position: 'absolute',
            left: -unit * 0.6,
            top: h - unit * 1.6,
            width: w + unit * 1.2,
            height: unit * 2.4,
            borderRadius: unit * 1.4,
            borderWidth: Math.max(1, unit * 0.3),
            borderColor: heroColor ?? '#E3B341',
          }}
        />
      ) : null}
    </View>
  );
}
