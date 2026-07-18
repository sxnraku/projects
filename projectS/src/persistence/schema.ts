/**
 * Esquema SQLite dos ficheiros de estado (saves).
 *
 * Estratégia: uma tabela por coleção do GameState. Entidades com muitos campos
 * pequenos e fixos têm colunas próprias; sub-objetos variáveis (atributos,
 * receitas/despesas, tática) guardam-se como JSON numa coluna TEXT — leitura
 * rápida, escrita atómica, e evita dezenas de colunas por jogador.
 *
 * Cada save é uma base de dados própria (ex: save_<id>.db), por isso não há
 * coluna saveId nas tabelas — o ficheiro já isola o save. A tabela `meta`
 * guarda uma única linha.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  save_id        TEXT    NOT NULL,
  manager_name   TEXT    NOT NULL,
  managed_club_id TEXT   NOT NULL,
  season         INTEGER NOT NULL,
  current_date   TEXT    NOT NULL,
  rng_seed       INTEGER NOT NULL,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  id       TEXT PRIMARY KEY,
  name     TEXT    NOT NULL,
  country  TEXT    NOT NULL,
  tier     INTEGER NOT NULL,
  club_ids TEXT    NOT NULL  -- JSON array
);

CREATE TABLE IF NOT EXISTS clubs (
  id               TEXT PRIMARY KEY,
  name             TEXT    NOT NULL,
  short_name       TEXT    NOT NULL,
  country          TEXT    NOT NULL,
  league_id        TEXT    NOT NULL REFERENCES leagues(id),
  primary_color    TEXT    NOT NULL,
  secondary_color  TEXT    NOT NULL,
  stadium_name     TEXT    NOT NULL,
  stadium_capacity INTEGER NOT NULL,
  reputation       INTEGER NOT NULL,
  facilities       TEXT    NOT NULL DEFAULT '{}',  -- JSON Facilities
  squad            TEXT    NOT NULL  -- JSON array de player ids
);
CREATE INDEX IF NOT EXISTS idx_clubs_league ON clubs(league_id);

CREATE TABLE IF NOT EXISTS players (
  id             TEXT PRIMARY KEY,
  club_id        TEXT REFERENCES clubs(id),  -- NULL = livre
  first_name     TEXT    NOT NULL,
  last_name      TEXT    NOT NULL,
  age            INTEGER NOT NULL,
  nationality    TEXT    NOT NULL,
  foot           TEXT    NOT NULL,
  positions      TEXT    NOT NULL,  -- JSON array
  attributes     TEXT    NOT NULL,  -- JSON PlayerAttributes
  potential      INTEGER NOT NULL,
  condition      TEXT    NOT NULL,  -- JSON PlayerCondition
  contract_until INTEGER,
  wage           INTEGER NOT NULL,
  market_value   INTEGER NOT NULL,
  transfer_listed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);

CREATE TABLE IF NOT EXISTS finances (
  club_id         TEXT PRIMARY KEY REFERENCES clubs(id),
  balance         INTEGER NOT NULL,
  transfer_budget INTEGER NOT NULL,
  wage_budget     INTEGER NOT NULL,
  income          TEXT    NOT NULL,  -- JSON
  expenses        TEXT    NOT NULL   -- JSON
);

CREATE TABLE IF NOT EXISTS tactics (
  club_id          TEXT PRIMARY KEY REFERENCES clubs(id),
  formation        TEXT NOT NULL,
  mentality        TEXT NOT NULL,
  tempo            TEXT NOT NULL,
  pressing         INTEGER NOT NULL DEFAULT 5,
  defensive_line   INTEGER NOT NULL DEFAULT 5,
  creativity       INTEGER NOT NULL DEFAULT 5,
  lineup           TEXT NOT NULL,  -- JSON array de LineupSlot
  bench            TEXT NOT NULL,  -- JSON array
  captain_id       TEXT,
  penalty_taker_id TEXT
);

CREATE TABLE IF NOT EXISTS standings (
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  club_id       TEXT NOT NULL REFERENCES clubs(id),
  played        INTEGER NOT NULL DEFAULT 0,
  won           INTEGER NOT NULL DEFAULT 0,
  drawn         INTEGER NOT NULL DEFAULT 0,
  lost          INTEGER NOT NULL DEFAULT 0,
  goals_for     INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  points        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, club_id)
);

-- Calendário completo por liga guardado como blob JSON (muitos jogos, estrutura estável).
CREATE TABLE IF NOT EXISTS schedules (
  league_id TEXT PRIMARY KEY REFERENCES leagues(id),
  data      TEXT NOT NULL
);

-- Carreira do treinador (objetivos, troféus, historial) — blob JSON de linha única.
CREATE TABLE IF NOT EXISTS career (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

-- Feed de notícias — blob JSON de linha única.
CREATE TABLE IF NOT EXISTS news (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

-- Estado da Taça — blob JSON de linha única.
CREATE TABLE IF NOT EXISTS cup (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

-- Preferências do dispositivo (premium, opções) — fora do save, sobrevive a novo jogo.
CREATE TABLE IF NOT EXISTS prefs (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

-- Caixa de entrada (propostas recebidas) — blob JSON de linha única.
CREATE TABLE IF NOT EXISTS inbox (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);
`;

/** Versão do esquema — sincronizada com SCHEMA_VERSION do modelo. Migrações futuras aqui. */
export const DB_SCHEMA_VERSION = 4;
