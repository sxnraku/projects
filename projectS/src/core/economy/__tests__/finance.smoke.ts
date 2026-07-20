/**
 * Teste de fumo das regras financeiras: teto salarial, manutenção escalável,
 * bilheteira ligada à forma e sanções de insolvência.
 * Corre com: npm run smoke:finance
 */
import {
  applyInsolvency,
  canAffordWage,
  evaluateOffer,
  executeTransfer,
  facilityUpkeep,
  isInsolvent,
  matchdayIncome,
  renewContract,
  upgradeFacility,
  wageBudgetRemaining,
} from '../index';
import { createNewGame } from '../../game';
import { naturalOverall } from '../../models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

const eur = (n: number) => n.toLocaleString('pt-PT') + ' €';

console.log('Teste de fumo — regras financeiras\n');

// ---------------------------------------------------------------- teto salarial
console.log('Teto salarial bloqueia contratações:');
const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 18, divisions: 2, seed: 4242 });
const myId = s.meta.managedClubId;
const myFin = s.finances[myId]!;

const margin = wageBudgetRemaining(myFin);
assert(margin > 0, `há margem salarial inicial: ${eur(margin)}`);
assert(canAffordWage(myFin, margin), 'um salário igual à margem cabe');
assert(!canAffordWage(myFin, margin + 1), 'um salário acima da margem NÃO cabe');

// Alvo caro de outro clube.
const target = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId)
  .sort((a, b) => b.marketValue - a.marketValue)[0]!;

myFin.transferBudget = 999_999_999; // dinheiro de sobra: só o salário deve travar
const rich = evaluateOffer({
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: margin + 50_000, contractYears: 3,
}, s);
assert(rich.decision === 'REJECTED' && /margem salarial/i.test(rich.reason),
  `com orçamento infinito, o teto salarial trava: "${rich.reason}"`);

// E o executeTransfer também recusa (defesa em profundidade).
const forced = executeTransfer({
  playerId: target.id, fromClubId: myId,
  fee: 1000, wageOffer: margin + 50_000, contractYears: 3,
}, s);
assert(!forced.ok && /margem salarial/i.test(forced.error ?? ''),
  'executeTransfer também bloqueia (não só a avaliação)');

console.log('\nTeto salarial bloqueia renovações caras:');
const mine = s.players[s.clubs[myId]!.squad[0]!]!;
const before = mine.wage;
const bad = renewContract(mine.id, 3, before + margin + 100_000, s);
assert(!bad.ok && /margem salarial/i.test(bad.error ?? ''),
  'aumento acima da margem é recusado');
assert(mine.wage === before, 'o salário não foi alterado pela tentativa falhada');

// ------------------------------------------------------- manutenção escalável
console.log('\nManutenção escala com as instalações:');
const club = s.clubs[myId]!;
const upkeep0 = facilityUpkeep(club);
s.finances[myId]!.balance = 500_000_000; // para poder pagar o upgrade
const up = upgradeFacility(s, 'stadium');
const upkeep1 = facilityUpkeep(club);
assert(up.ok, 'upgrade do estádio efetuado');
assert(upkeep1 > upkeep0, `manutenção subiu: ${eur(upkeep0)} -> ${eur(upkeep1)}/sem`);

// -------------------------------------------------------- bilheteira e forma
console.log('\nBilheteira reage à forma da equipa:');
const neutral = matchdayIncome(club, []);
const winning = matchdayIncome(club, ['W', 'W', 'W', 'W', 'W']);
const losing = matchdayIncome(club, ['L', 'L', 'L', 'L', 'L']);
assert(winning > neutral, `5 vitórias enchem o estádio: ${eur(neutral)} -> ${eur(winning)}`);
assert(losing < neutral, `5 derrotas esvaziam-no: ${eur(neutral)} -> ${eur(losing)}`);
assert(losing < winning * 0.75, 'a diferença entre boa e má fase é substancial');

// ------------------------------------------------------------- insolvência
console.log('\nSanções de insolvência:');
const fin = s.finances[myId]!;
fin.balance = -50_000; // dívida ligeira
assert(isInsolvent(fin), 'saldo negativo = insolvente');

const repBefore = club.reputation;
const light = applyInsolvency(s, myId);
assert(light.insolvent && light.reputationLost, 'insolvência custa reputação');
assert(club.reputation < repBefore, `reputação caiu: ${repBefore} -> ${club.reputation}`);
assert(light.soldPlayerId === null, 'dívida ligeira ainda não força venda');

console.log('\nDívida grave força venda de um ativo:');
fin.balance = -2_000_000;
const squadBefore = s.clubs[myId]!.squad.length;
const balBefore = fin.balance;
const heavy = applyInsolvency(s, myId);
assert(heavy.soldPlayerId !== null, `direção vendeu ${heavy.soldPlayerName}`);
assert(s.clubs[myId]!.squad.length === squadBefore - 1, 'o jogador saiu do plantel');
assert(fin.balance > balBefore, `entrou dinheiro: ${eur(balBefore)} -> ${eur(fin.balance)}`);
assert(s.players[heavy.soldPlayerId!]!.clubId === null, 'o jogador ficou sem clube');

// ------------------------------------------------- contratação com insolvência
console.log('\nInsolvência bloqueia o mercado:');
fin.balance = -1000;
fin.transferBudget = 999_999_999;
const blocked = evaluateOffer({
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: 100, contractYears: 3,
}, s);
assert(blocked.decision === 'REJECTED' && /insolv/i.test(blocked.reason),
  `mercado bloqueado: "${blocked.reason}"`);

// ------------------------------------------------------ curva de valor íngreme
console.log('\nCurva de valor separa craques de medianos:');
const all = Object.values(s.players).filter((p) => p.clubId);
const byOvr = (o: number) => all.filter((p) => naturalOverall(p) === o);
const mid = byOvr(12)[0], top = byOvr(17)[0] ?? byOvr(16)[0];
if (mid && top) {
  const ratio = top.marketValue / mid.marketValue;
  assert(ratio > 5, `um OVR ${naturalOverall(top)} vale ${ratio.toFixed(1)}x um OVR 12 (${eur(mid.marketValue)} -> ${eur(top.marketValue)})`);
} else {
  console.log('  (sem amostras suficientes neste seed — salto)');
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
