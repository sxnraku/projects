/**
 * Teste de fumo das regras financeiras: teto salarial, manutenção escalável,
 * bilheteira ligada à forma e sanções de insolvência.
 * Corre com: npm run smoke:finance
 */
import {
  applyInsolvency,
  applyWeeklyFinances,
  canAffordWage,
  evaluateOffer,
  executeTransfer,
  facilityUpkeep,
  insolvencyReputationFloor,
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
console.log('Margem salarial já NÃO bloqueia contratações (só dinheiro + teto da divisão):');
const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 18, divisions: 2, seed: 4242 });
const myId = s.meta.managedClubId;
const myFin = s.finances[myId]!;

const margin = wageBudgetRemaining(myFin);
assert(margin > 0, `há margem salarial inicial: ${eur(margin)}`);
assert(canAffordWage(myFin, margin), 'o ajudante de margem continua a existir (cabe)');
assert(!canAffordWage(myFin, margin + 1), 'o ajudante de margem continua a existir (não cabe)');

// Alvo caro de outro clube.
const target = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId)
  .sort((a, b) => b.marketValue - a.marketValue)[0]!;

// Dinheiro de sobra — CAIXA e verba. Com a carteira única a verba é uma fatia
// do saldo, por isso encher só a verba já não chega: o passe sai da caixa.
myFin.balance = 999_999_999;
myFin.transferBudget = 999_999_999;
// Salário ACIMA da margem do clube, mas modesto (dentro do teto da divisão):
// antes era barrado por "margem salarial"; agora já não deve ser.
const overMargin = evaluateOffer({
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: margin + 5_000, contractYears: 3, signingBonus: 20_000_000,
}, s);
assert(overMargin.reasonKey !== 'offer.reject.noMargin',
  `margem já não trava a avaliação (reason: "${overMargin.reasonKey ?? 'aceite'}")`);

// O teto da DIVISÃO continua a travar salários absurdos.
const absurd = evaluateOffer({
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: 9_000_000, contractYears: 3, signingBonus: 20_000_000,
}, s);
assert(absurd.decision === 'REJECTED' && absurd.reasonKey === 'offer.reject.wageCap',
  `teto da divisão ainda trava salários absurdos: "${absurd.reasonKey}"`);

// E o executeTransfer também já não bloqueia por margem salarial. (Usa um alvo
// DIFERENTE para não gastar `target`, que os testes seguintes ainda usam.)
const target2 = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId && p.id !== target.id)
  .sort((a, b) => a.marketValue - b.marketValue)[0]!;
const forced = executeTransfer({
  playerId: target2.id, fromClubId: myId,
  fee: 1000, wageOffer: margin + 5_000, contractYears: 3, signingBonus: 20_000_000,
}, s);
assert(!/margem salarial/i.test(forced.error ?? ''),
  'executeTransfer já não bloqueia por margem salarial');

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

// -------------------------------------------------------- saldo nunca negativo
console.log('\nO saldo nunca fica negativo — a semana que não fecha vira buraco:');
const fin = s.finances[myId]!;
fin.balance = 10_000;
fin.income = { tickets: 0, sponsorship: 0, tvRights: 0, merchandising: 0 };
fin.expenses = { wages: 200_000, facilities: 20_000, staff: 10_000 };
const hole = applyWeeklyFinances(fin, 0);
assert(fin.balance === 0, `saldo travado no zero (era 10 000 €, despesa 230 000 €)`);
assert(hole === 220_000, `o buraco da semana é devolvido: ${eur(hole)}`);
assert(isInsolvent(fin), 'sem caixa = mercado bloqueado');

// ------------------------------------------------------------- insolvência
console.log('\nSanções da semana que não fechou:');
// Sem buraco não há castigo: um clube sem caixa mas equilibrado não perde nada.
const repBefore = club.reputation;
const noHole = applyInsolvency(s, myId, 0);
assert(noHole.insolvent, 'sem caixa continua a bloquear o mercado');
assert(!noHole.reputationLost, 'semana paga NÃO custa reputação');
assert(club.reputation === repBefore, `reputação intacta: ${repBefore}`);
assert(noHole.soldPlayerId === null, 'e não força venda nenhuma');

// Com buraco custa reputação — mas nunca abaixo do piso da divisão. Antes era
// -1 por semana enquanto o saldo estivesse negativo, sem piso útil: uma época
// no vermelho arrasava um clube da 1ª divisão até valores de 3ª, e com ele as
// estrelas do clube e a vontade de qualquer jogador assinar.
console.log('\nSemana por pagar custa reputação, com piso na divisão:');
const floor = insolvencyReputationFloor(s, myId);
const repBeforeHeavy = club.reputation;
const heavyRep = applyInsolvency(s, myId, 220_000);
assert(heavyRep.reputationLost, 'semana por pagar custa reputação');
assert(club.reputation === repBeforeHeavy - 1, `reputação caiu 1: ${repBeforeHeavy} -> ${club.reputation}`);
club.reputation = floor; // já no fundo
const atFloor = applyInsolvency(s, myId, 220_000);
assert(!atFloor.reputationLost, `no piso (${floor}) a reputação já não desce`);
assert(club.reputation === floor, 'o clube não cai abaixo do piso da sua divisão');
club.reputation = repBeforeHeavy; // repõe para os testes seguintes

// O CLUBE GERIDO nunca perde um jogador por decisão da direção: nele, a semana
// por pagar abre um DILEMA no inbox e é o treinador que escolhe quem sai (ver
// `smoke:flow`). Antes a venda era automática e levava o melhor do plantel sem
// uma palavra — o utilizador só dava pela falta dele dias depois.
console.log('\nBuraco NÃO vende sozinho no clube gerido:');
const mySquadBefore = s.clubs[myId]!.squad.length;
const managedOutcome = applyInsolvency(s, myId, 5_000_000);
assert(managedOutcome.soldPlayerId === null, 'a direção não vende sozinha o clube do utilizador');
assert(s.clubs[myId]!.squad.length === mySquadBefore, 'o plantel gerido fica intacto');
assert(managedOutcome.insolvent, 'mas continua sem caixa (bloqueia o mercado)');

// Nos clubes da IA a venda automática mantém-se — é o que evita que o mundo
// inteiro fique em dívida sem consequência.
console.log('\nBuraco força venda num clube da IA:');
const aiId = Object.keys(s.clubs).find((id) => id !== myId)!;
const aiFin = s.finances[aiId]!;
aiFin.balance = 0;
const aiSquadBefore = s.clubs[aiId]!.squad.length;
const heavy = applyInsolvency(s, aiId, 5_000_000);
assert(heavy.soldPlayerId !== null, `direção vendeu ${heavy.soldPlayerName}`);
assert(s.clubs[aiId]!.squad.length === aiSquadBefore - 1, 'o jogador saiu do plantel');
assert(aiFin.balance > 0, `entrou dinheiro: 0 € -> ${eur(aiFin.balance)}`);
assert(s.players[heavy.soldPlayerId!]!.clubId === null, 'o jogador ficou sem clube');

// ------------------------------------------------- contratação com insolvência
console.log('\nInsolvência bloqueia o mercado:');
fin.balance = 0;
fin.transferBudget = 999_999_999;
const blocked = evaluateOffer({
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: 100, contractYears: 3,
}, s);
assert(blocked.decision === 'REJECTED' && blocked.reasonKey === 'offer.reject.insolvent',
  `mercado bloqueado: "${blocked.reasonKey}"`);

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
