import { useCallback } from 'react';
import { useGameStore } from '../state/gameStore';
import { Lang, Msg, MsgParams, translate, tMsg } from '../core/i18n';

/**
 * Ponte i18n para a UI. Os ecrãs chamam `const t = useT()` e depois `t('chave')`;
 * quando o idioma muda na store, o hook re-executa e tudo é redesenhado.
 */
export type TFn = (key: string, params?: MsgParams) => string;

export function useLang(): Lang {
  return useGameStore((s) => s.lang);
}

export function useT(): TFn {
  const lang = useGameStore((s) => s.lang);
  return useCallback((key: string, params?: MsgParams) => translate(lang, key, params), [lang]);
}

/** Traduz um descritor do core (notícia, nota, troféu) com o idioma atual. */
export function useTMsg(): (msg: Msg) => string {
  const lang = useGameStore((s) => s.lang);
  return useCallback((msg: Msg) => tMsg(lang, msg), [lang]);
}

export { translate, tMsg };
export type { Lang, Msg, MsgParams };
