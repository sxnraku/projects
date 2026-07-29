import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme } from './theme';

export type ToastKind = 'ok' | 'error' | 'info';

/**
 * Popup animado de feedback (sucesso/erro). Desliza+aparece no topo quando
 * `text` muda e desaparece sozinho, chamando `onHide` para o pai limpar.
 * Simples, sem dependências — usa a Animated API.
 */
export function Toast({ text, kind = 'ok', onHide }: { text: string | null; kind?: ToastKind; onHide?: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 80 }).start();
    timer.current && clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onHide?.());
    }, 2600);
    return () => { timer.current && clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!text) return null;
  const bg = kind === 'error' ? theme.colors.red : kind === 'info' ? theme.colors.blue : theme.colors.green;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, {
        backgroundColor: bg,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
      }]}
    >
      <Text style={styles.text} numberOfLines={2}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', top: theme.spacing(1), left: theme.spacing(2), right: theme.spacing(2),
    zIndex: 100, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1.25), paddingHorizontal: theme.spacing(1.5),
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  text: { color: '#fff', fontSize: theme.font.body, fontWeight: '800', textAlign: 'center' },
});
