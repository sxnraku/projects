/**
 * Teste de fumo — provas europeias (modelo suíço): qualificação, sorteio, fase de
 * liga, corte, eliminatórias, prémios e round-trip do save.
 * Corre com: npm run smoke:europe
 */
import { createNewGame } from '../../game/newGame';
import { advanceWeek, rolloverSeason } from '../../game/advance';
import { serialize, deserialize } from '../../../persistence/serialize';
import {
  qualifyNextSeason, buildEuropeCampaign, advanceEuropeMatchday, europeInProgress,
  euroTableSorted, EURO_COMPS, teamIdOf, worldTeamOfClub,
} from '../index';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — provas europeias (Champions/Europa/Conference)\n');

// ---- Qualificação ----
console.log('Qualificação:');
const g = createNewGame({ managerName: '', useBase: true, country: 'portugal', seed: 999 });
const q = qualifyNextSeason(g);
assert(q.managedComp === null, 'clube na divisão baixa NÃO se qualifica');
for (const c of EURO_COMPS) assert(q.byComp[c].length === 36, `${c}: 36 equipas`);
const seen = new Map<string, string>();
let dup = 0;
for (const c of EURO_COMPS) for (const e of q.byComp[c]) { if (seen.has(e.clubId)) dup++; else seen.set(e.clubId, c); }
assert(dup === 0, 'nenhum clube em duas provas ao mesmo tempo');
for (const c of EURO_COMPS) {
  const pots = [0, 0, 0, 0];
  for (const e of q.byComp[c]) pots[e.pot - 1]++;
  assert(pots.every((p) => p === 9), `${c}: 4 potes de 9`);
}

// ---- Força o gerido para a UCL ----
const managedId = g.meta.managedClubId;
const liga1 = Object.values(g.leagues).find((l) => l.country === 'portugal' && l.tier === 1)!;
g.clubs[managedId]!.leagueId = liga1.id;
g.standings[liga1.id]![managedId] = { clubId: managedId, played: 30, won: 30, drawn: 0, lost: 0, goalsFor: 99, goalsAgainst: 5, points: 99 };
liga1.clubIds = [managedId, ...liga1.clubIds.filter((id) => id !== managedId)];
const q2 = qualifyNextSeason(g);
q2.byComp.UCL[q2.byComp.UCL.length - 1] = { clubId: managedId, teamId: teamIdOf(managedId), country: 'portugal', pot: 4 };
q2.managedComp = 'UCL';

const balBefore = g.finances[managedId]!.balance;
g.europe = buildEuropeCampaign(g, q2, g.meta.season, 1);

// ---- Sorteio / fase de liga ----
console.log('\nSorteio + fase de liga:');
assert(g.finances[managedId]!.balance - balBefore === 8_000_000, 'prémio de entrada UCL creditado (8M)');
assert(Object.values(g.clubs).filter((c) => c.european).length === 8, 'materializados 8 adversários (de fundo)');
{
  const cs = g.europe.competitions.UCL;
  const games = new Map<string, number>();
  const opps = new Map<string, Set<string>>();
  let sameCountry = 0;
  for (const f of cs.fixtures) {
    for (const id of [f.homeId, f.awayId]) games.set(id, (games.get(id) ?? 0) + 1);
    (opps.get(f.homeId) ?? opps.set(f.homeId, new Set()).get(f.homeId)!).add(f.awayId);
    (opps.get(f.awayId) ?? opps.set(f.awayId, new Set()).get(f.awayId)!).add(f.homeId);
    if (worldTeamOfClub(f.homeId)?.slug === worldTeamOfClub(f.awayId)?.slug) sameCountry++;
  }
  assert([...games.values()].every((n) => n === 8), 'cada equipa joga 8 jogos');
  assert([...opps.values()].every((s) => s.size === 8), '8 adversários diferentes por equipa');
  assert(sameCountry === 0, 'nenhum jogo entre clubes do mesmo país');
}

// ---- Campanha completa ----
console.log('\nCampanha completa:');
let euroMd = 0, managedGames = 0, managedFullEngine = 0;
while (europeInProgress(g.europe) && euroMd < 60) {
  for (const f of advanceEuropeMatchday(g)) {
    managedGames++;
    if ((f.result?.events.length ?? 0) > 0) managedFullEngine++;
  }
  euroMd++;
}
for (const c of EURO_COMPS) {
  const cs = g.europe.competitions[c];
  assert(cs.stage === 'DONE' && !!cs.winnerClubId, `${c}: prova terminada com campeão`);
  assert(cs.table.every((r) => r.P === cs.rounds), `${c}: todos jogaram ${cs.rounds} jornadas`);
}
assert(managedGames > 0 && managedFullEngine === managedGames, 'todos os jogos do gerido foram a motor completo');
assert(g.finances[managedId]!.balance - balBefore > 8_000_000, 'ganhos europeus acima do prémio de entrada');

// ---- Round-trip do save (a meio de nova campanha) ----
console.log('\nSave round-trip:');
const g2 = createNewGame({ managerName: '', useBase: true, country: 'portugal', seed: 321 });
const mid = g2.meta.managedClubId;
for (const pid of g2.clubs[mid]!.squad) { const p = g2.players[pid]; if (p) for (const k in p.attributes) (p.attributes as unknown as Record<string, number>)[k] = 20; }
const qm = qualifyNextSeason(g2);
qm.byComp.UCL[qm.byComp.UCL.length - 1] = { clubId: mid, teamId: teamIdOf(mid), country: 'portugal', pot: 4 };
qm.managedComp = 'UCL';
g2.europe = buildEuropeCampaign(g2, qm, g2.meta.season, 1);
for (let i = 0; i < 5; i++) advanceEuropeMatchday(g2);
const tableBefore = JSON.stringify(g2.europe.competitions.UCL.table);
const restored = deserialize(serialize(g2));
assert(!!restored.europe, 'europe presente após load');
assert(JSON.stringify(restored.europe!.competitions.UCL.table) === tableBefore, 'tabela UCL preservada no round-trip');
assert(!serialize(g2).clubs.some((c) => String(c.id).startsWith('eu_')), 'clubes europeus NÃO são gravados');
assert(Object.values(restored.clubs).filter((c) => c.european).length > 0, 'adversários re-materializados na leitura');
const anyOppId = euroTableSorted(restored.europe!.competitions.UCL).map((r) => r.clubId).find((id) => id.startsWith('eu_') && restored.clubs[id]);
assert(!!anyOppId && (restored.clubs[anyOppId!]?.squad.length ?? 0) > 0, 'adversário re-materializado tem plantel');

// ---- Rollover não crasha e reconstrói ----
console.log('\nRollover:');
const before = g.meta.season;
rolloverSeason(g);
assert(g.meta.season === before + 1, 'época avançou');
assert(!!g.europe, 'europe reconstruído para a nova época');
assert(g.europe!.superCup !== null, 'Supertaça preparada (campeões CL/EL da época anterior)');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
