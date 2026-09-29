/**
 * Teste de fumo — sliders táticos, xG, Taça, instalações e notícias.
 * Corre com: npm run smoke:world
 */
import { createNewGame, advanceWeek, nextRound } from '../../game';
import { smallerFirst } from '../cup';
import { simulateMatch } from '../../engine';
import { makeTeam } from '../../engine/__tests__/fixtures';
import { facilityUpgradeCost, upgradeFacility } from '../../economy';
import { TrainingFocus } from '../../training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — mundo completo (sliders, xG, Taça, instalações, notícias)\n');

// ---- Sliders táticos afetam o motor ----
console.log('Sliders táticos:');
const A = makeTeam('A', 14);
const B = makeTeam('B', 14);
const both = { ...A.players, ...B.players };

let shotsNeutral = 0, shotsPressing = 0;
for (let i = 0; i < 400; i++) {
  const neutral = simulateMatch('A', 'B', A.tactic, B.tactic, both, i * 3 + 1);
  shotsNeutral += neutral.home.shots;
  const pressTactic = { ...A.tactic, pressing: 10 };
  const pressed = simulateMatch('A', 'B', pressTactic, B.tactic, both, i * 3 + 1);
  shotsPressing += pressed.home.shots;
}
assert(shotsPressing > shotsNeutral * 1.05,
  `pressing 10 gera mais remates (${shotsPressing} vs ${shotsNeutral} em 400 jogos)`);

let goalsVsLowLine = 0, goalsVsHighLine = 0;
for (let i = 0; i < 400; i++) {
  const low = simulateMatch('A', 'B', A.tactic, { ...B.tactic, defensiveLine: 0 }, both, i * 7 + 3);
  goalsVsLowLine += low.home.goals;
  const high = simulateMatch('A', 'B', A.tactic, { ...B.tactic, defensiveLine: 10 }, both, i * 7 + 3);
  goalsVsHighLine += high.home.goals;
}
assert(goalsVsHighLine > goalsVsLowLine,
  `linha alta sofre mais golos (${goalsVsHighLine} vs ${goalsVsLowLine} em 400 jogos)`);

// ---- xG ----
console.log('\nxG:');
const r = simulateMatch('A', 'B', A.tactic, B.tactic, both, 999);
assert(r.home.xg > 0 && r.away.xg > 0, `xG calculado (${r.home.xg} / ${r.away.xg})`);
let xgSum = 0, goalSum = 0;
for (let i = 0; i < 500; i++) {
  const m = simulateMatch('A', 'B', A.tactic, B.tactic, both, i * 11 + 5);
  xgSum += m.home.xg + m.away.xg;
  goalSum += m.home.goals + m.away.goals;
}
const ratio = xgSum / goalSum;
assert(ratio > 0.7 && ratio < 1.4, `xG calibrado com os golos reais (rácio ${ratio.toFixed(2)})`);

// ---- Mundo: Taça + notícias ao longo de uma época ----
console.log('\nÉpoca completa com Taça e notícias:');
const state = createNewGame({ managerName: 'R', numClubs: 8, squadSize: 18, divisions: 2, seed: 777 });
assert(state.cup.alive.length === 16, `Taça sorteada com ${state.cup.alive.length} clubes`);
assert(state.cup.totalRounds === 4, `${state.cup.totalRounds} eliminatórias previstas`);

let guard = 0;
while (nextRound(state, state.clubs[state.meta.managedClubId]!.leagueId) !== null && guard++ < 40) {
  advanceWeek(state, TrainingFocus.TECHNICAL);
}
assert(state.cup.winnerClubId !== null, `Taça tem vencedor no fim da época: ${state.clubs[state.cup.winnerClubId!]?.name}`);
// 16 clubes → 15 eliminatórias. As MEIAS-FINAIS (2 eliminatórias) jogam-se a
// duas mãos, por isso somam 2 jogos extra: 15 + 2 = 17.
assert(state.cup.fixtures.length === 17,
  `${state.cup.fixtures.length} jogos de Taça (16 clubes → 15 eliminatórias + 2 segundas mãos nas meias)`);
assert(state.news.length > 0, `${state.news.length} notícias geradas durante a época`);
assert(state.news.some((n) => n.type === 'MATCH'), 'há notícias de resultados');
assert(state.news.some((n) => n.type === 'CUP'), 'há notícias da Taça');

// ---- Instalações ----
console.log('\nInstalações:');
const clubId = state.meta.managedClubId;
const fin = state.finances[clubId]!;
fin.balance = 50_000_000; // garante fundos para o teste
const capBefore = state.clubs[clubId]!.stadiumCapacity;
const clubTier = state.leagues[state.clubs[clubId]!.leagueId]?.tier ?? 1;
const cost = facilityUpgradeCost('stadium', 1, clubTier);
const up = upgradeFacility(state, 'stadium');
assert(up.ok && up.newLevel === 2, `upgrade do estádio para nível 2 (custo ${cost.toLocaleString('pt-PT')})`);
assert(state.clubs[clubId]!.stadiumCapacity > capBefore, 'capacidade do estádio aumentou');
assert(fin.balance === 50_000_000 - cost, 'custo saiu do saldo');

fin.balance = 0;
assert(!upgradeFacility(state, 'training').ok, 'sem saldo, upgrade falha');

// ---------------------------------------------------------------------------
// TAÇA — a magia (o pequeno recebe) e as meias-finais a duas mãos.
// ---------------------------------------------------------------------------
console.log('\nTaça — o pequeno recebe em casa:');
const s2 = createNewGame({ managerName: 'R', useBase: true, seed: 777 });

// `smallerFirst` é a regra pura: escalão mais baixo primeiro, empate pela reputação.
const porTier = Object.values(s2.clubs).reduce<Record<number, string[]>>((acc, c) => {
  const t = s2.leagues[c.leagueId]?.tier ?? 1;
  (acc[t] ??= []).push(c.id);
  return acc;
}, {});
const tiers = Object.keys(porTier).map(Number).sort((a, b) => a - b);
if (tiers.length >= 2) {
  const grande = porTier[tiers[0]!]![0]!;
  const pequeno = porTier[tiers[tiers.length - 1]!]![0]!;
  assert(smallerFirst(s2, grande, pequeno)[0] === pequeno,
    'o clube de divisão mais baixa fica em casa (ordem A)');
  assert(smallerFirst(s2, pequeno, grande)[0] === pequeno,
    'e continua em casa com a ordem trocada (não depende do sorteio)');
}

// Mesmo escalão → o de menor reputação recebe.
const mesmoTier = porTier[tiers[0]!]!;
if (mesmoTier.length >= 2) {
  const [x, y] = [mesmoTier[0]!, mesmoTier[1]!];
  const [casa] = smallerFirst(s2, x, y);
  const repCasa = s2.clubs[casa]!.reputation;
  const outro = casa === x ? y : x;
  assert(repCasa <= s2.clubs[outro]!.reputation,
    'no mesmo escalão, recebe quem tem menos reputação');
}

console.log('\nTaça — meias-finais a duas mãos:');
const s3 = createNewGame({ managerName: 'R', useBase: true, seed: 313 });
let guardCup = 0;
while (!s3.cup.winnerClubId && guardCup++ < 60) advanceWeek(s3);
assert(!!s3.cup.winnerClubId, 'a Taça chegou ao fim e tem vencedor');

// A ronda das meias (4 em prova) tem de ter gerado 4 jogos: 2 eliminatórias × 2 mãos.
const porRonda = s3.cup.fixtures.reduce<Record<number, number>>((acc, f) => {
  acc[f.round] = (acc[f.round] ?? 0) + 1;
  return acc;
}, {});
const rondas = Object.keys(porRonda).map(Number).sort((a, b) => a - b);
const meias = rondas[rondas.length - 2];
const final = rondas[rondas.length - 1];
assert(meias !== undefined && porRonda[meias] === 4,
  `meias-finais com 4 jogos (2 eliminatórias × 2 mãos) — teve ${meias !== undefined ? porRonda[meias] : '?'}`);
assert(final !== undefined && porRonda[final] === 1,
  `a final é a UM jogo — teve ${final !== undefined ? porRonda[final] : '?'}`);

// As duas mãos são com os campos trocados.
const jogosMeias = s3.cup.fixtures.filter((f) => f.round === meias);
const ida = jogosMeias[0]!;
const volta = jogosMeias.find((f) => f.id === `${ida.id}_2`);
assert(!!volta && volta.homeClubId === ida.awayClubId && volta.awayClubId === ida.homeClubId,
  'a segunda mão joga-se com os campos trocados');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
