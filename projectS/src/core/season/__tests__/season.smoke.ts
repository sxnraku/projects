/**
 * Teste de fumo da ETAPA 3 — calendário, jornadas e tabela.
 * Corre com: npm run smoke:season
 */
import { fixturesOfRound, Player, StandingRow, Tactic } from '../../models';
import { makeTeam } from '../../engine/__tests__/fixtures';
import {
  emptyStandings,
  generateSchedule,
  playFullSeason,
  playRound,
  SeasonContext,
  sortStandings,
} from '../index';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

// 8 clubes com níveis diferentes → tabela deve refletir a qualidade.
const CLUBS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const LEVELS: Record<string, number> = { A: 17, B: 16, C: 15, D: 14, E: 13, F: 12, G: 11, H: 10 };

const players: Record<string, Player> = {};
const tactics: Record<string, Tactic> = {};
for (const c of CLUBS) {
  const team = makeTeam(c, LEVELS[c]!);
  Object.assign(players, team.players);
  tactics[c] = team.tactic;
}
const names: Record<string, string> = Object.fromEntries(CLUBS.map((c) => [c, `Clube ${c}`]));

console.log('ETAPA 3 — teste de fumo do fluxo de época\n');

console.log('Estrutura do calendário (8 clubes, ida-e-volta):');
const schedule = generateSchedule('L1', CLUBS, 999);
assert(schedule.totalRounds === 2 * (CLUBS.length - 1), `${schedule.totalRounds} jornadas (esperado ${2 * (CLUBS.length - 1)})`);
assert(schedule.fixtures.length === CLUBS.length * (CLUBS.length - 1), `${schedule.fixtures.length} jogos (esperado ${CLUBS.length * (CLUBS.length - 1)})`);

console.log('\nCada clube joga exatamente uma vez por jornada:');
let perRoundOk = true;
for (let r = 1; r <= schedule.totalRounds; r++) {
  const fxs = fixturesOfRound(schedule, r);
  const appear = new Map<string, number>();
  for (const f of fxs) {
    appear.set(f.homeClubId, (appear.get(f.homeClubId) ?? 0) + 1);
    appear.set(f.awayClubId, (appear.get(f.awayClubId) ?? 0) + 1);
  }
  if (fxs.length !== CLUBS.length / 2 || [...appear.values()].some((v) => v !== 1)) perRoundOk = false;
}
assert(perRoundOk, `todas as ${schedule.totalRounds} jornadas têm ${CLUBS.length / 2} jogos e clubes únicos`);

console.log('\nEquilíbrio casa/fora e emparelhamentos:');
const homeCount = new Map<string, number>();
const awayCount = new Map<string, number>();
const pairVenues = new Map<string, number>();
for (const f of schedule.fixtures) {
  homeCount.set(f.homeClubId, (homeCount.get(f.homeClubId) ?? 0) + 1);
  awayCount.set(f.awayClubId, (awayCount.get(f.awayClubId) ?? 0) + 1);
  pairVenues.set(`${f.homeClubId}v${f.awayClubId}`, (pairVenues.get(`${f.homeClubId}v${f.awayClubId}`) ?? 0) + 1);
}
assert(CLUBS.every((c) => homeCount.get(c) === CLUBS.length - 1 && awayCount.get(c) === CLUBS.length - 1),
  `cada clube joga ${CLUBS.length - 1}x em casa e ${CLUBS.length - 1}x fora`);
assert([...pairVenues.values()].every((v) => v === 1), 'cada emparelhamento casa-fora ocorre exatamente 1x');

console.log('\nSimular época completa:');
const table = emptyStandings(CLUBS);
const ctx: SeasonContext = { players, tactics, baseSeed: 42 };
const totalPlayed = playFullSeason(schedule, table, ctx);
assert(totalPlayed === schedule.fixtures.length, `${totalPlayed} jogos simulados (todos)`);

console.log('\nIntegridade da tabela:');
const rows: StandingRow[] = Object.values(table);
const totalJogosContados = rows.reduce((s, r) => s + r.played, 0);
assert(totalJogosContados === schedule.fixtures.length * 2, `soma de "jogados" = 2×nº jogos (${totalJogosContados})`);
assert(rows.every((r) => r.played === 2 * (CLUBS.length - 1)), 'cada clube jogou 14 jogos');
assert(rows.every((r) => r.won + r.drawn + r.lost === r.played), 'V+E+D == jogados para todos');
const golosMarcados = rows.reduce((s, r) => s + r.goalsFor, 0);
const golosSofridos = rows.reduce((s, r) => s + r.goalsAgainst, 0);
assert(golosMarcados === golosSofridos, `golos marcados == sofridos no total (${golosMarcados})`);
assert(rows.every((r) => r.points === r.won * 3 + r.drawn), 'pontos == 3×V + E para todos');

console.log('\nOrdenação e desempates:');
const sorted = sortStandings(table, (id) => names[id]!);
let sortedOk = true;
for (let i = 1; i < sorted.length; i++) {
  const a = sorted[i - 1]!, b = sorted[i]!;
  const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst;
  if (a.points < b.points) sortedOk = false;
  else if (a.points === b.points && gdA < gdB) sortedOk = false;
}
assert(sortedOk, 'tabela ordenada por pontos → diferença de golos → golos marcados');
console.log('    Classificação final:');
sorted.forEach((r, i) => {
  console.log(`    ${String(i + 1).padStart(2)}. ${names[r.clubId]} — ${r.points}pts (${r.won}V ${r.drawn}E ${r.lost}D, ${r.goalsFor}:${r.goalsAgainst})`);
});

console.log('\nDeterminismo da época (mesma seed → mesma tabela):');
const table2 = emptyStandings(CLUBS);
const schedule2 = generateSchedule('L1', CLUBS, 999);
playFullSeason(schedule2, table2, { players, tactics, baseSeed: 42 });
const sig = (t: Record<string, StandingRow>) => CLUBS.map((c) => `${c}:${t[c]!.points}:${t[c]!.goalsFor}:${t[c]!.goalsAgainst}`).join('|');
assert(sig(table) === sig(table2), 'época reproduzida dá tabela idêntica');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
