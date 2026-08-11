/**
 * REGISTO DE ALVOS DO TUTORIAL.
 *
 * O tutorial guiado aponta para elementos REAIS do ecrã: escurece tudo menos o
 * botão de que está a falar. Para isso precisa de saber onde esses elementos
 * estão, em coordenadas de janela — e essa informação só existe depois de o RN
 * medir o `View`.
 *
 * A alternativa seria passar refs de ecrã em ecrã até ao overlay, o que sujava
 * meia dúzia de componentes com adereços que só interessam ao tutorial. Aqui os
 * alvos registam-se num mapa de módulo e quem quiser saber subscreve. Um ecrã
 * que nunca foi aberto simplesmente não tem alvo registado, e o tutorial mostra
 * o cartão ao centro em vez de rebentar.
 */

/** Retângulo medido em coordenadas de JANELA (não do ecrã pai). */
export interface TargetRect { x: number; y: number; width: number; height: number }

const rects = new Map<string, TargetRect>();
const listeners = new Set<() => void>();

/** Ids usados pelos passos do tutorial. Centralizados para não haver typos. */
export const TutorialTargets = {
  topBar: 'topBar',
  nextMatch: 'nextMatch',
  advance: 'advance',
  inbox: 'inbox',
  squadRow: 'squadRow',
  squadFilters: 'squadFilters',
  pitch: 'pitch',
  formation: 'formation',
  setPieces: 'setPieces',
  marketList: 'marketList',
  leagueTable: 'leagueTable',
  clubFinances: 'clubFinances',
  clubFacilities: 'clubFacilities',
  clubStaff: 'clubStaff',
  manual: 'manual',
} as const;
export type TutorialTargetId = (typeof TutorialTargets)[keyof typeof TutorialTargets];

export function setTargetRect(id: string, rect: TargetRect | null): void {
  if (rect === null) rects.delete(id);
  else rects.set(id, rect);
  for (const fn of listeners) fn();
}

export function getTargetRect(id: string | undefined): TargetRect | undefined {
  return id ? rects.get(id) : undefined;
}

export function subscribeTargets(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Limpa tudo — usado ao sair do tutorial para não guardar medidas velhas. */
export function clearTargets(): void {
  rects.clear();
}
