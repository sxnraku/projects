/**
 * Ligação real ao expo-sqlite. Vive fora de src/ porque importa o binding nativo
 * (não faz parte do typecheck do core). Fornece um SqliteDb ao adaptador puro
 * em src/persistence/sqlite.ts, que trata do save/load.
 *
 * expo-sqlite é nativo (Android/iOS). Em plataformas sem o módulo (ex: web no
 * browser durante desenvolvimento) a persistência é desativada de forma segura
 * e o jogo corre em memória — não bloqueia a app.
 */
import { Platform } from 'react-native';
import { GameState } from '../src/core/models';
import { initSchema, loadGame, saveGame, SqliteDb } from '../src/persistence/sqlite';

let db: SqliteDb | null = null;
let unavailable = Platform.OS === 'web'; // SQLite nativo não existe em web

/** Abre (uma vez) a base de dados do save e garante o schema. Null se indisponível. */
export async function openDb(): Promise<SqliteDb | null> {
  if (unavailable) return null;
  if (!db) {
    try {
      // Import dinâmico: só carrega o binding nativo quando existe.
      const SQLite = await import('expo-sqlite');
      // v3: nome novo — o schema mudou (colunas novas) e em dev é mais simples
      // começar limpo do que migrar. Antes de publicar, fixar migrações a sério.
      const handle = await SQLite.openDatabaseAsync('gestor_futebol_v4.db');
      db = handle as unknown as SqliteDb;
      await initSchema(db);
    } catch {
      unavailable = true;
      return null;
    }
  }
  return db;
}

export async function persist(state: GameState): Promise<void> {
  const handle = await openDb();
  if (!handle) return; // sem persistência nesta plataforma
  await saveGame(handle, state);
}

export async function restore(): Promise<GameState | null> {
  const handle = await openDb();
  if (!handle) return null;
  return loadGame(handle);
}

/** True se a persistência está disponível (ambiente nativo). */
export function persistenceAvailable(): boolean {
  return !unavailable;
}

// ---- Preferências do dispositivo (premium, etc.) — fora do save ----

export interface DevicePrefs {
  premium: boolean;
}

const DEFAULT_PREFS: DevicePrefs = { premium: false };

export async function loadPrefs(): Promise<DevicePrefs> {
  const handle = await openDb();
  if (!handle) return DEFAULT_PREFS;
  try {
    const row = await handle.getFirstAsync<{ data: string }>(`SELECT data FROM prefs WHERE id = 1`);
    return row?.data ? { ...DEFAULT_PREFS, ...JSON.parse(row.data) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: DevicePrefs): Promise<void> {
  const handle = await openDb();
  if (!handle) return;
  try {
    await handle.runAsync(
      `INSERT INTO prefs (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [JSON.stringify(prefs)],
    );
  } catch {
    // prefs são conveniência; falha silenciosa não pode bloquear o jogo
  }
}
