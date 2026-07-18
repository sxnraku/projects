import { GameState } from '../core/models';
import { SCHEMA_SQL } from './schema';
import { deserialize, SaveRows, serialize } from './serialize';

/**
 * Interface mínima de base de dados que o adaptador precisa.
 *
 * Corresponde ao subconjunto async de `expo-sqlite` (SQLiteDatabase). Ao depender
 * desta interface em vez de importar `expo-sqlite` diretamente, o adaptador
 * mantém-se testável em Node e o typecheck do core não precisa do binding nativo.
 * O app Expo injeta a base real via `openDatabaseAsync()`.
 */
export interface SqliteDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: unknown[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Cria as tabelas se não existirem. Idempotente. */
export async function initSchema(db: SqliteDb): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
}

/** Grava um GameState completo, substituindo o save anterior (uma DB por save). */
export async function saveGame(db: SqliteDb, state: GameState): Promise<void> {
  const rows = serialize(state);
  await db.withTransactionAsync(async () => {
    // Limpa e reescreve. Simples e seguro; o volume (centenas de linhas) é trivial.
    for (const table of ['meta', 'leagues', 'clubs', 'players', 'finances', 'tactics', 'standings', 'schedules', 'career', 'news', 'cup', 'inbox']) {
      await db.execAsync(`DELETE FROM ${table};`);
    }
    await insertAll(db, rows);
  });
}

async function insertAll(db: SqliteDb, rows: SaveRows): Promise<void> {
  const ins = (sql: string, params: unknown[]) => db.runAsync(sql, params);

  const m = rows.meta;
  await ins(
    `INSERT INTO meta (id,save_id,manager_name,managed_club_id,season,current_date,rng_seed,created_at,updated_at,schema_version)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [m.id, m.save_id, m.manager_name, m.managed_club_id, m.season, m.current_date, m.rng_seed, m.created_at, m.updated_at, m.schema_version],
  );
  for (const r of rows.leagues) {
    await ins(`INSERT INTO leagues (id,name,country,tier,club_ids) VALUES (?,?,?,?,?)`,
      [r.id, r.name, r.country, r.tier, r.club_ids]);
  }
  for (const r of rows.clubs) {
    await ins(`INSERT INTO clubs (id,name,short_name,country,league_id,primary_color,secondary_color,stadium_name,stadium_capacity,reputation,facilities,squad)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.name, r.short_name, r.country, r.league_id, r.primary_color, r.secondary_color, r.stadium_name, r.stadium_capacity, r.reputation, r.facilities, r.squad]);
  }
  for (const r of rows.players) {
    await ins(`INSERT INTO players (id,club_id,first_name,last_name,age,nationality,foot,positions,attributes,potential,condition,contract_until,wage,market_value,transfer_listed)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.club_id, r.first_name, r.last_name, r.age, r.nationality, r.foot, r.positions, r.attributes, r.potential, r.condition, r.contract_until, r.wage, r.market_value, r.transfer_listed]);
  }
  for (const r of rows.finances) {
    await ins(`INSERT INTO finances (club_id,balance,transfer_budget,wage_budget,income,expenses) VALUES (?,?,?,?,?,?)`,
      [r.club_id, r.balance, r.transfer_budget, r.wage_budget, r.income, r.expenses]);
  }
  for (const r of rows.tactics) {
    await ins(`INSERT INTO tactics (club_id,formation,mentality,tempo,pressing,defensive_line,creativity,lineup,bench,captain_id,penalty_taker_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [r.club_id, r.formation, r.mentality, r.tempo, r.pressing, r.defensive_line, r.creativity, r.lineup, r.bench, r.captain_id, r.penalty_taker_id]);
  }
  for (const r of rows.standings) {
    await ins(`INSERT INTO standings (league_id,club_id,played,won,drawn,lost,goals_for,goals_against,points) VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.league_id, r.club_id, r.played, r.won, r.drawn, r.lost, r.goals_for, r.goals_against, r.points]);
  }
  for (const r of rows.schedules) {
    await ins(`INSERT INTO schedules (league_id,data) VALUES (?,?)`, [r.league_id, r.data]);
  }
  await ins(`INSERT INTO career (id,data) VALUES (?,?)`, [rows.career.id, rows.career.data]);
  await ins(`INSERT INTO news (id,data) VALUES (?,?)`, [rows.news.id, rows.news.data]);
  await ins(`INSERT INTO cup (id,data) VALUES (?,?)`, [rows.cup.id, rows.cup.data]);
  await ins(`INSERT INTO inbox (id,data) VALUES (?,?)`, [rows.inbox.id, rows.inbox.data]);
}

/** Carrega o GameState do save. Devolve null se não houver save (sem meta). */
export async function loadGame(db: SqliteDb): Promise<GameState | null> {
  const meta = await db.getFirstAsync<SaveRows['meta']>(`SELECT * FROM meta WHERE id = 1`);
  if (!meta) return null;

  const careerRow = await db.getFirstAsync<SaveRows['career']>(`SELECT * FROM career WHERE id = 1`);
  const newsRow = await db.getFirstAsync<SaveRows['news']>(`SELECT * FROM news WHERE id = 1`);
  const cupRow = await db.getFirstAsync<SaveRows['cup']>(`SELECT * FROM cup WHERE id = 1`);
  const inboxRow = await db.getFirstAsync<SaveRows['inbox']>(`SELECT * FROM inbox WHERE id = 1`);
  const rows: SaveRows = {
    meta,
    leagues: await db.getAllAsync(`SELECT * FROM leagues`),
    clubs: await db.getAllAsync(`SELECT * FROM clubs`),
    players: await db.getAllAsync(`SELECT * FROM players`),
    finances: await db.getAllAsync(`SELECT * FROM finances`),
    tactics: await db.getAllAsync(`SELECT * FROM tactics`),
    standings: await db.getAllAsync(`SELECT * FROM standings`),
    schedules: await db.getAllAsync(`SELECT * FROM schedules`),
    career: careerRow ?? { id: 1, data: '' },
    news: newsRow ?? { id: 1, data: '' },
    cup: cupRow ?? { id: 1, data: '' },
    inbox: inboxRow ?? { id: 1, data: '' },
  };
  return deserialize(rows);
}
