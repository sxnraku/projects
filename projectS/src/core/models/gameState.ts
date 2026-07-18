import { CareerState, initialCareer } from '../career/career';
import { NewsItem } from '../news/news';
import { CupState, emptyCup } from './cupTypes';
import { InboxItem } from './inbox';
import { Club } from './club';
import { Finance } from './finance';
import { Schedule } from './fixture';
import { League, StandingRow } from './league';
import { Player } from './player';
import { Tactic } from './tactic';

/**
 * Estado global do jogo — a raiz do save.
 *
 * Estruturas PLANAS indexadas por id (dicionários) em vez de árvores aninhadas:
 *  - lookup O(1) de qualquer jogador/clube durante a simulação;
 *  - update de uma entidade não obriga a reescrever as outras (save incremental);
 *  - serialização direta para SQLite (uma tabela por coleção).
 *
 * A store Zustand mantém isto em memória; a camada de persistência (ETAPA 1)
 * faz o mapeamento para SQLite.
 */
export interface GameState {
  meta: GameMeta;

  players: Record<string, Player>;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  finances: Record<string, Finance>; // por clubId
  tactics: Record<string, Tactic>; // por clubId

  // Calendários por liga: leagueId -> Schedule
  schedules: Record<string, Schedule>;

  // Classificações em cache por liga: leagueId -> (clubId -> linha)
  standings: Record<string, Record<string, StandingRow>>;

  // Carreira do treinador (objetivos, troféus, historial, bónus diário)
  career: CareerState;

  // Feed de notícias (mais recente primeiro)
  news: NewsItem[];

  // Taça — eliminatórias intercaladas na época
  cup: CupState;

  // Caixa de entrada — propostas recebidas e outras decisões pendentes
  inbox: InboxItem[];
}

/** Metadados da partida em curso. */
export interface GameMeta {
  saveId: string;
  managerName: string;
  managedClubId: string; // clube controlado pelo utilizador

  season: number; // época atual, ex: 2026
  currentDate: string; // ISO date "YYYY-MM-DD"

  // Seed do gerador aleatório — torna a simulação determinística e reproduzível.
  rngSeed: number;

  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  schemaVersion: number; // para migrações de save entre versões do jogo
}

export const SCHEMA_VERSION = 4;

/** Cria um GameState vazio (usado ao iniciar nova partida antes do seed). */
export function emptyGameState(meta: GameMeta): GameState {
  return {
    meta,
    players: {},
    clubs: {},
    leagues: {},
    finances: {},
    tactics: {},
    schedules: {},
    standings: {},
    career: initialCareer(),
    news: [],
    cup: emptyCup(),
    inbox: [],
  };
}
