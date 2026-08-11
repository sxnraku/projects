/**
 * ALVO DO TUTORIAL — embrulha um pedaço da UI para o tutorial o poder apontar.
 *
 * Uso: `<Spot id={TutorialTargets.advance}>{...}</Spot>`.
 *
 * Mede-se em coordenadas de JANELA (`measureInWindow`), porque o buraco do
 * spotlight é desenhado por cima de tudo e não conhece a árvore de quem mediu.
 * A medição é adiada com `requestAnimationFrame`: no Android, medir dentro do
 * próprio `onLayout` devolve às vezes zeros, e um alvo a zeros faria o tutorial
 * cair para o cartão centrado sem razão.
 *
 * Fora do tutorial isto é um `View` normal — não custa nada e não muda o
 * desenho do ecrã.
 */
import React, { useCallback, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { setTargetRect } from './registry';

export function Spot({
  id, children, style,
}: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) setTargetRect(id, { x, y, width, height });
      });
    });
  }, [id]);

  return (
    <View ref={ref} style={style} onLayout={measure} collapsable={false}>
      {children}
    </View>
  );
}

/**
 * Alvo condicional — para listas, onde só a PRIMEIRA linha serve de exemplo.
 * Envolver todas as linhas num `View` extra mudava a altura de tudo; assim, as
 * outras passam exatamente como estavam.
 */
export function MaybeSpot({
  on, id, children,
}: { on: boolean; id: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return <Spot id={id}>{children}</Spot>;
}
