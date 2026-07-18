import { GameState } from '../models';

/**
 * Notícias — feed em formato jornal, gerado pelos acontecimentos do mundo.
 * Só lista: título + data. Capado para não crescer sem limite.
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
  title: string;
}

export const NEWS_CAP = 60;

let newsCounter = 0;

/** Acrescenta uma notícia ao topo do feed (mais recente primeiro). Muta o estado. */
export function addNews(state: GameState, type: NewsType, title: string): void {
  state.news.unshift({
    id: `n_${state.meta.season}_${newsCounter++}`,
    date: state.meta.currentDate,
    type,
    title,
  });
  if (state.news.length > NEWS_CAP) state.news.length = NEWS_CAP;
}
