/**
 * Teste de fumo da ETAPA 2 — motor de simulação.
 * Corre com: npm run smoke:engine
 */
import { winnerSide } from '../../models';
import { simulateMatch } from '../index';
import { makeTeam } from './fixtures';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

const teamA = makeTeam('A', 14);
const teamB = makeTeam('B', 14);
const bothPlayers = { ...teamA.players, ...teamB.players };

console.log('ETAPA 2 — teste de fumo do motor de simulação\n');

console.log('Determinismo (mesma seed → mesmo resultado):');
const r1 = simulateMatch('A', 'B', teamA.tactic, teamB.tactic, bothPlayers, 12345);
const r2 = simulateMatch('A', 'B', teamA.tactic, teamB.tactic, bothPlayers, 12345);
assert(r1.home.goals === r2.home.goals && r1.away.goals === r2.away.goals,
  `resultado idêntico: ${r1.home.goals}-${r1.away.goals} == ${r2.home.goals}-${r2.away.goals}`);
assert(r1.events.length === r2.events.length, `nº de eventos idêntico (${r1.events.length})`);
assert(JSON.stringify(r1.events) === JSON.stringify(r2.events), 'sequência de eventos idêntica');

console.log('\nSeeds diferentes → resultados variam:');
const seeds = [1, 2, 3, 4, 5];
const scores = seeds.map((s) => {
  const r = simulateMatch('A', 'B', teamA.tactic, teamB.tactic, bothPlayers, s);
  return `${r.home.goals}-${r.away.goals}`;
});
assert(new Set(scores).size > 1, `variedade de resultados: ${scores.join(', ')}`);

console.log('\nIntegridade do resultado:');
assert(r1.home.possession + r1.away.possession === 100, `posse soma 100 (${r1.home.possession}/${r1.away.possession})`);
assert(r1.home.shotsOnTarget <= r1.home.shots, 'remates à baliza <= remates totais');
assert(r1.home.goals <= r1.home.shotsOnTarget, 'golos <= remates à baliza');
const goalEvents = r1.events.filter((e) => e.type === 'GOAL');
assert(goalEvents.length === r1.home.goals + r1.away.goals, 'nº de eventos GOLO == golos totais');
assert(r1.events[0]!.type === 'KICKOFF' && r1.events[r1.events.length - 1]!.type === 'FULL_TIME',
  'eventos começam em KICKOFF e acabam em FULL_TIME');

console.log('\nMédias realistas (2000 partidas equilibradas):');
let totalGoals = 0, homeWins = 0, awayWins = 0, draws = 0;
const N = 2000;
for (let i = 0; i < N; i++) {
  const r = simulateMatch('A', 'B', teamA.tactic, teamB.tactic, bothPlayers, i * 7 + 1);
  totalGoals += r.home.goals + r.away.goals;
  const w = winnerSide(r);
  if (w === 'HOME') homeWins++; else if (w === 'AWAY') awayWins++; else draws++;
}
const avgGoals = totalGoals / N;
console.log(`    média de golos/jogo: ${avgGoals.toFixed(2)} | casa ${homeWins} / empate ${draws} / fora ${awayWins}`);
assert(avgGoals > 2.0 && avgGoals < 3.6, `média de golos ${avgGoals.toFixed(2)} num intervalo realista (2.0..3.6)`);
assert(homeWins > awayWins, `vantagem de casa presente (casa ${homeWins} > fora ${awayWins})`);

console.log('\nEquipa forte ganha mais vezes (nível 17 vs 11):');
const strong = makeTeam('S', 17);
const weak = makeTeam('W', 11);
const mix = { ...strong.players, ...weak.players };
let strongWins = 0, weakWins = 0;
for (let i = 0; i < 500; i++) {
  // Coloca a equipa forte fora, para não confundir com vantagem de casa.
  const r = simulateMatch('W', 'S', weak.tactic, strong.tactic, mix, i * 13 + 3);
  const w = winnerSide(r);
  if (w === 'AWAY') strongWins++; else if (w === 'HOME') weakWins++;
}
console.log(`    forte venceu ${strongWins} / fraca venceu ${weakWins} (em 500)`);
assert(strongWins > weakWins * 2, `equipa forte domina (${strongWins} vs ${weakWins})`);

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
