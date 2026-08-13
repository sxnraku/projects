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
/**
 * Funções de medição dos `Spot` MONTADOS, por id.
 *
 * O `onLayout` não chega: as coordenadas são de janela e mudam quando o ecrã
 * faz scroll ou quando um cartão acima aparece mais tarde e empurra o resto —
 * em nenhum desses casos o `onLayout` do alvo volta a disparar. Guardar aqui a
 * função permite ao tutorial pedir uma medição fresca a cada passo.
 */
const measurers = new Map<string, () => void>();

/** Ids usados pelos passos do tutorial. Centralizados para não haver typos. */
export const TutorialTargets = {
  topBar: 'topBar',
  nextMatch: 'nextMatch',
  advance: 'advance',
  inbox: 'inbox',
  fansCard: 'fansCard',
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

/** Um `Spot` montado anuncia-se, para poder ser re-medido a pedido. */
export function registerMeasurer(id: string, fn: () => void): () => void {
  measurers.set(id, fn);
  return () => {
    if (measurers.get(id) === fn) measurers.delete(id);
  };
}

/**
 * Pede uma medição fresca de um alvo (ou de todos). Chamado pelo tutorial a
 * cada passo: é o que garante que o buraco cai onde o elemento está AGORA e
 * não onde estava quando o ecrã montou.
 */
export function remeasure(id?: string): void {
  if (id) { measurers.get(id)?.(); return; }
  for (const fn of measurers.values()) fn();
}

/** Limpa tudo — usado ao sair do tutorial para não guardar medidas velhas. */
export function clearTargets(): void {
  rects.clear();
}
