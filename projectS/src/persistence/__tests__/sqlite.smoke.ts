/**
 * Teste de fumo do CAMINHO DE GRAVAÇÃO em SQLite.
 * Corre com: npm run smoke:sqlite
 *
 * O `serialize`/`deserialize` já tinha teste; o `sqlite.ts` não tinha nenhum —
 * e é ele que escreve o save no disco. Uma falha aqui não dá erro visível: o
 * jogo grava, o utilizador fecha a app, e ao voltar falta-lhe meia época.
 *
 * O risco concreto que isto guarda: os INSERTs passaram a ser em LOTES
 * (`INSERT ... VALUES (?,?),(?,?)…`) para o auto-save deixar de fazer 1360
 * chamadas à ponte nativa. Um erro no corte dos lotes perde linhas em silêncio.
 *
 * A base falsa aqui não é um SQLite a sério — é o suficiente para provar que
 * TUDO o que entra volta a sair, que é a propriedade que interessa.
 */
import { createNewGame, advanceWeek } from '../../core/game';
import { GameState } from '../../core/models';
import { loadGame, saveGame, SqliteDb } from '../sqlite';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — gravação em SQLite\n');

/** Conta chamadas para se ver o efeito dos lotes. */
let calls = 0;

/**
 * Base de dados falsa, em memória.
 *
 * Percebe o suficiente do SQL que o `sqlite.ts` gera: `DELETE FROM t`,
 * `INSERT INTO t (cols) VALUES (…),(…)` e `SELECT * FROM t`. Os placeholders
 * são preenchidos por ordem, exatamente como o SQLite faria.
 */
function fakeDb(): SqliteDb & { tables: Map<string, Record<string, unknown>[]> } {
  const tables = new Map<string, Record<string, unknown>[]>();

  return {
    tables,
    async execAsync(sql: string) {
      for (const stmt of sql.split(';')) {
        const del = /^\s*DELETE\s+FROM\s+(\w+)/i.exec(stmt);
        if (del) tables.set(del[1]!, []);
      }
    },
    async runAsync(sql: string, params: unknown[] = []) {
      calls++;
      const m = /^\s*INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+)$/is.exec(sql);
      if (!m) throw new Error(`SQL não reconhecido: ${sql.slice(0, 60)}`);
      const table = m[1]!;
      const cols = m[2]!.split(',').map((c) => c.trim());
      // Quantos grupos "(?,?,…)" traz este statement.
      const groups = (m[3]!.match(/\(/g) ?? []).length;
      const expected = groups * cols.length;
      if (params.length !== expected) {
        throw new Error(`${table}: ${params.length} parâmetros para ${expected} placeholders`);
      }
      const rows = tables.get(table) ?? [];
      for (let g = 0; g < groups; g++) {
        const row: Record<string, unknown> = {};
        cols.forEach((c, i) => { row[c] = params[g * cols.length + i]; });
        rows.push(row);
      }
      tables.set(table, rows);
      return undefined;
    },
    async getAllAsync<T>(sql: string) {
      const m = /FROM\s+(\w+)/i.exec(sql);
      return ((m ? tables.get(m[1]!) : []) ?? []) as T[];
    },
    async getFirstAsync<T>(sql: string) {
      const m = /FROM\s+(\w+)/i.exec(sql);
      return (((m ? tables.get(m[1]!) : []) ?? [])[0] ?? null) as T | null;
    },
    async withTransactionAsync(task: () => Promise<void>) { await task(); },
  };
}

/** Um jogo com história: jornadas jogadas, tabelas preenchidas, inbox com coisas. */
const state = createNewGame({ managerName: 'Renato', useBase: true, seed: 3141 });
for (let i = 0; i < 6; i++) advanceWeek(state);

const db = fakeDb();

(async () => {
  calls = 0;
  await saveGame(db, state);
  const savedCalls = calls;

  // ---------------------------------------------------------------- volume
  {
    const players = db.tables.get('players') ?? [];
    const clubs = db.tables.get('clubs') ?? [];
    const standings = db.tables.get('standings') ?? [];
    assert(players.length === Object.keys(state.players).length,
      `todos os jogadores foram gravados (${players.length})`);
    assert(clubs.length > 0 && standings.length > 0,
      `clubes e classificações gravados (${clubs.length} / ${standings.length})`);

    // O ponto do exercício: o nº de chamadas tem de ser MUITO menor do que o
    // nº de linhas. Sem lotes eram ~1360; com lotes fica em dezenas.
    const rowCount = players.length + clubs.length + standings.length;
    assert(savedCalls < rowCount / 5,
      `os INSERTs vão em lotes: ${savedCalls} chamadas para ${rowCount}+ linhas`);
  }

  // ------------------------------------------------------------ round-trip
  {
    const back = await loadGame(db);
    assert(back !== null, 'o save volta a carregar');
    if (!back) return;

    const cmp = (label: string, a: unknown, b: unknown) =>
      assert(JSON.stringify(a) === JSON.stringify(b), label);

    cmp('meta idêntica', back.meta, state.meta);
    assert(Object.keys(back.players).length === Object.keys(state.players).length,
      'nº de jogadores igual');
    assert(Object.keys(back.clubs).length === Object.keys(state.clubs).length, 'nº de clubes igual');

    // Um jogador ao acaso, campo a campo — é onde um lote mal cortado se vê.
    const id = Object.keys(state.players)[500]!;
    cmp('um jogador do meio da lista volta igual', back.players[id], state.players[id]);

    const managedId = state.meta.managedClubId;
    cmp('o clube gerido volta igual', back.clubs[managedId], state.clubs[managedId]);
    cmp('a tática do clube gerido volta igual', back.tactics[managedId], state.tactics[managedId]);
    cmp('as finanças voltam iguais', back.finances[managedId], state.finances[managedId]);
    cmp('a carreira volta igual', back.career, state.career);
    cmp('a caixa de entrada volta igual', back.inbox, state.inbox);

    const leagueId = state.clubs[managedId]!.leagueId;
    cmp('a classificação da liga volta igual',
      back.standings[leagueId], state.standings[leagueId]);
    assert(
      (back.schedules[leagueId]?.fixtures.filter((f) => f.result).length ?? 0)
      === state.schedules[leagueId]!.fixtures.filter((f) => f.result).length,
      'os jogos já disputados voltam com resultado',
    );
  }

  // ------------------------------------------------- gravar por cima limpa
  {
    await saveGame(db, state);
    const players = db.tables.get('players') ?? [];
    assert(players.length === Object.keys(state.players).length,
      'gravar duas vezes não duplica linhas (o DELETE corre antes)');
  }

  // ------------------------------------------ um save pequeno também passa
  {
    const tiny = createNewGame({ managerName: 'V', useBase: true, seed: 7 });
    const db2 = fakeDb();
    await saveGame(db2, tiny);
    const back = await loadGame(db2);
    assert(back !== null && Object.keys(back.players).length === Object.keys(tiny.players).length,
      'um jogo acabado de criar também faz o percurso completo');
  }

  console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
