import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Ícones da barra de navegação, DESENHADOS com Views (sem assets nem libs
 * nativas — à semelhança de Face/Flag/Crest). Cada um recebe `color` (o tint
 * ativo/inativo que o expo-router passa) e um `size` opcional.
 */
export type NavIconName = 'home' | 'squad' | 'tactics' | 'market' | 'league' | 'club';

export function NavIcon({ name, color, size = 22 }: { name: NavIconName; color: string; size?: number }) {
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;
  switch (name) {
    case 'home':
      return (
        <View style={box}>
          <View style={[tri.down, { borderBottomColor: color, borderLeftWidth: size * 0.42, borderRightWidth: size * 0.42, borderBottomWidth: size * 0.4 }]} />
          <View style={{ width: size * 0.52, height: size * 0.36, backgroundColor: color, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -1 }} />
        </View>
      );

    case 'squad': // pessoa (cabeça + ombros) = "Equipa"
      return (
        <View style={box}>
          <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: color, marginBottom: size * 0.06 }} />
          <View style={{ width: size * 0.62, height: size * 0.3, backgroundColor: color, borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3 }} />
        </View>
      );

    case 'tactics': // quadro tático: contorno + linha central + círculo
      return (
        <View style={box}>
          <View style={{ width: size * 0.82, height: size * 0.82, borderWidth: 2, borderColor: color, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: color }} />
            <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, borderWidth: 1.5, borderColor: color }} />
          </View>
        </View>
      );

    case 'market': // setas de transferência (⇄) desenhadas
      return (
        <View style={box}>
          <Arrow color={color} size={size} dir="right" offset={-size * 0.16} />
          <Arrow color={color} size={size} dir="left" offset={size * 0.16} />
        </View>
      );

    case 'league': { // barras de classificação (baixo→alto)
      const bar = (h: number) => (
        <View style={{ width: size * 0.16, height: h, backgroundColor: color, borderRadius: 1 }} />
      );
      return (
        <View style={[box, { flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.1 }]}>
          {bar(size * 0.4)}{bar(size * 0.6)}{bar(size * 0.82)}
        </View>
      );
    }

    case 'club': // escudo (eco do ícone da app): topo arredondado + ponta
      return (
        <View style={box}>
          <View style={{ width: size * 0.6, height: size * 0.44, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          <View style={[tri.up, { borderTopColor: color, borderLeftWidth: size * 0.3, borderRightWidth: size * 0.3, borderTopWidth: size * 0.3 }]} />
        </View>
      );
  }
}

/** Uma seta horizontal (barra + cabeça triangular). */
function Arrow({ color, size, dir, offset }: { color: string; size: number; dir: 'left' | 'right'; offset: number }) {
  const head = size * 0.16;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: size * 0.02, transform: [{ translateX: offset }] }}>
      {dir === 'left' ? (
        <View style={[tri.left, { borderRightColor: color, borderTopWidth: head, borderBottomWidth: head, borderRightWidth: head }]} />
      ) : null}
      <View style={{ width: size * 0.4, height: size * 0.12, backgroundColor: color }} />
      {dir === 'right' ? (
        <View style={[tri.right, { borderLeftColor: color, borderTopWidth: head, borderBottomWidth: head, borderLeftWidth: head }]} />
      ) : null}
    </View>
  );
}

const tri = StyleSheet.create({
  down: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  up: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  left: { width: 0, height: 0, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  right: { width: 0, height: 0, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
});
