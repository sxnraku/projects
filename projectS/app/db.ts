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
let dbPromise: Promise<SqliteDb | null> | null = null;
let unavailable = Platform.OS === 'web'; // SQLite nativo não existe em web

/**
 * Abre a base de dados do save UMA só vez e garante o schema. Null se indisponível.
 *
 * ⚠️ Promessa PARTILHADA (singleton): no arranque, `Promise.all([restore(),
 * loadPrefs()])` chama isto EM PARALELO. Sem o guard, entravam ambos no bloco de
 * abertura → duas `openDatabaseAsync` + `initSchema` da MESMA base ao mesmo tempo
 * → a base fica bloqueada e todas as chamadas seguintes rejeitam com
 * "NativeDatabase.execAsync has been rejected". Com o guard, todos os chamadores
 * concorrentes esperam pela MESMA abertura.
 */
export function openDb(): Promise<SqliteDb | null> {
  if (unavailable) return Promise.resolve(null);
  if (db) return Promise.resolve(db);
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        // Import dinâmico: só carrega o binding nativo quando existe.
        const SQLite = await import('expo-sqlite');
        // ⚠️ NÃO MUDAR ESTE NOME. Renomear a DB apaga o save do jogador em cada
        // atualização. O schema é estável e retrocompatível (campos novos vão
        // para blobs JSON). Se for MESMO preciso, usar ALTER TABLE, nunca um
        // nome de ficheiro novo.
        const handle = await SQLite.openDatabaseAsync('gestor_futebol_v4.db');
        await initSchema(handle as unknown as SqliteDb);
        db = handle as unknown as SqliteDb;
        return db;
      } catch {
        unavailable = true;
        dbPromise = null;
        return null;
      }
    })();
  }
  return dbPromise;
}

// ---- Diagnóstico de save (temporário: confirmar a correção da concorrência) ----
let _saveError: string | null = null;
let _saveCount = 0;
let _loadInfo = 'arranque';

/** Estado do save em texto curto, para um diagnóstico visível no ecrã. */
export function saveDiag(): string {
  const s = _saveError ? `ERRO ${_saveError}` : _saveCount > 0 ? `ok x${_saveCount}` : 'sem gravar';
  return `load:${_loadInfo} · save:${s}`;
}

// Mutex: NUNCA correr dois saveGame ao mesmo tempo. Guarda-se sempre o ÚLTIMO
// estado pedido e grava-se em série (o timer de 2s e o flush ao minimizar colidiam).
let _saving = false;
let _pending: GameState | null = null;

export async function persist(state: GameState): Promise<void> {
  _pending = state;
  if (_saving) return; // já há uma gravação a decorrer; ela apanha o _pending
  _saving = true;
  try {
    while (_pending) {
      const s = _pending;
      _pending = null;
      const handle = await openDb();
      if (!handle) { _saveError = 'sem-db'; return; }
      try {
        await saveGame(handle, s);
        _saveError = null;
        _saveCount++;
      } catch (e) {
        _saveError = ((e as Error)?.message ?? String(e)).slice(0, 90);
      }
    }
  } finally {
    _saving = false;
  }
}

export async function restore(): Promise<GameState | null> {
  const handle = await openDb();
  if (!handle) { _loadInfo = 'sem-db'; return null; }
  try {
    const g = await loadGame(handle);
    _loadInfo = g ? `s${g.meta.season}/${Object.keys(g.players).length}j` : 'sem-save';
    return g;
  } catch (e) {
    _loadInfo = 'erro:' + ((e as Error)?.message ?? String(e)).slice(0, 50);
    return null;
  }
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
