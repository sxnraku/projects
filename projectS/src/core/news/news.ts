import { GameState } from '../models';
import { MsgParams } from '../i18n';

/**
 * Notícias — feed em formato jornal, gerado pelos acontecimentos do mundo.
 *
 * O core NÃO formata texto: cada notícia guarda uma CHAVE de tradução + params.
 * A UI traduz no idioma escolhido ao desenhar, por isso trocar de idioma
 * reescreve todo o histórico na hora. Capado para não crescer sem limite.
 */

export const NewsType = {
  MATCH: 'MATCH',
  TRANSFER: 'TRANSFER',
  INJURY: 'INJURY',
  BOARD: 'BOARD',
  YOUTH: 'YOUTH',
  CUP: 'CUP',
  CLUB: 'CLUB',
  SEASON: 'SEASON',
} as const;
export type NewsType = (typeof NewsType)[keyof typeof NewsType];

export interface NewsItem {
  id: string;
  date: string; // data do jogo "YYYY-MM-DD"
  type: NewsType;
  key: string; // chave de tradução
  params?: MsgParams; // valores a interpolar (nomes, números)
}

export const NEWS_CAP = 60;

let newsCounter = 0;

/** Acrescenta uma notícia ao topo do feed (mais recente primeiro). Muta o estado. */
export function addNews(state: GameState, type: NewsType, key: string, params?: MsgParams): void {
  state.news.unshift({
    id: `n_${state.meta.season}_${newsCounter++}`,
    date: state.meta.currentDate,
    type,
    key,
    params,
  });
  if (state.news.length > NEWS_CAP) state.news.length = NEWS_CAP;
}
