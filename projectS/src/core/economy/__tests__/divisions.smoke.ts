/**
 * Teste de fumo das regras por divisão: teto rígido, interesse do jogador,
 * receitas/prémios indexados, janelas de mercado, reset anual e bloqueio do
 * avanço por decisões pendentes.
 * Corre com: npm run smoke:divisions
 */
import {
  annualBudgetReset,
  checkInterest,
  divisionMultiplier,
  divisionWageCap,
  evaluateOffer,
  leaguePrize,
  liquidityCeiling,
  promotionPrize,
  recalcIncome,
  requiredReputation,
} from '../index';
import { transferWindow } from '../../season';
import { advanceWeek, blockingReason, createNewGame, setTransferListed } from '../../game';
import { naturalOverall } from '../../models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}
const eur = (n: number) => n.toLocaleString('pt-PT') + ' €';

console.log('Teste de fumo — regras por divisão\n');

// ------------------------------------------------------- multiplicador
console.log('Multiplicador de divisão:');
assert(divisionMultiplier(1) === 1, '1ª divisão = 1');
assert(divisionMultiplier(2) === 0.5, '2ª divisão = 0.5');
assert(divisionMultiplier(3) === 0.25, '3ª divisão = 0.25');
assert(divisionWageCap(1) > divisionWageCap(3) * 3,
  `teto salarial: 1ª ${eur(divisionWageCap(1))} vs 3ª ${eur(divisionWageCap(3))}`);

console.log('\nPrémios indexados ao escalão:');
const p1 = leaguePrize(1, 1, 14), p3 = leaguePrize(3, 1, 14);
assert(p1 > p3 * 3, `campeão da 1ª (${eur(p1)}) ganha muito mais que da 3ª (${eur(p3)})`);
assert(leaguePrize(1, 1, 14) > leaguePrize(1, 14, 14), '1º lugar rende mais que o último');
assert(promotionPrize(1) > promotionPrize(3), 'subir à 1ª vale mais que subir à 3ª');

// -------------------------------------------------------- teto rígido
console.log('\nTeto salarial rígido da divisão:');
const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 18, divisions: 3, seed: 909 });
const myId = s.meta.managedClubId;
const myClub = s.clubs[myId]!;
const myFin = s.finances[myId]!;
const myTier = s.leagues[myClub.leagueId]!.tier;
assert(myTier === 3, `o clube gerido começa na 3ª divisão (tier ${myTier})`);

const cap = divisionWageCap(myTier);
myFin.transferBudget = 999_999_999;
myFin.wageBudget = 999_999_999; // desliga o teto "mole" para isolar o rígido

const anyTarget = Object.values(s.players).find((p) => p.clubId && p.clubId !== myId)!;
const overCap = evaluateOffer({
  playerId: anyTarget.id, fromClubId: myId,
  fee: 1000, wageOffer: cap + 10_000, contractYears: 3,
}, s);
assert(overCap.decision === 'REJECTED' && /teto salarial da divis/i.test(overCap.reason),
  `direção barra acima do teto da divisão: "${overCap.reason}"`);

// --------------------------------------------------- interesse do jogador
console.log('\nInteresse do jogador (reputação):');
assert(requiredReputation(20) > requiredReputation(12),
  `um OVR 20 exige mais reputação (${requiredReputation(20)}) que um OVR 12 (${requiredReputation(12)})`);

const star = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId)
  .sort((a, b) => naturalOverall(b) - naturalOverall(a))[0]!;
const interest = checkInterest(star, myClub, myTier);
assert(!interest.interested,
  `craque OVR ${naturalOverall(star)} recusa clube de reputação ${myClub.reputation}`);
assert(interest.requiredSigningBonus > 0, 'há (ou não) um prémio que o convence');

const refused = evaluateOffer({
  playerId: star.id, fromClubId: myId,
  fee: star.marketValue * 3, wageOffer: 1000, contractYears: 3,
}, s);
assert(refused.decision === 'REJECTED',
  `mesmo com fee 3x, o craque recusa: "${refused.reason}"`);

// Um jogador ao nível do clube deve passar neste filtro.
const modest = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId && naturalOverall(p) <= 10)
  .sort((a, b) => a.marketValue - b.marketValue)[0];
if (modest) {
  const ok = checkInterest(modest, myClub, myTier);
  assert(ok.interested, `um OVR ${naturalOverall(modest)} aceita negociar com o clube`);
}

// ----------------------------------------------------- receitas por divisão
console.log('\nReceitas mudam com a divisão:');
const finCopy = { ...myFin, income: { ...myFin.income }, expenses: { ...myFin.expenses } };
recalcIncome(myClub, 3, finCopy);
const tv3 = finCopy.income.tvRights;
recalcIncome(myClub, 1, finCopy);
const tv1 = finCopy.income.tvRights;
assert(tv1 > tv3 * 3, `direitos de TV: 3ª ${eur(tv3)} -> 1ª ${eur(tv1)} (subir dá um salto real)`);

// ------------------------------------------------------- janelas de mercado
console.log('\nJanelas de mercado:');
assert(transferWindow(1, 30).open, 'jornada 1: mercado de verão aberto');
assert(transferWindow(5, 30).open, 'jornada 5: ainda aberto');
assert(!transferWindow(8, 30).open, 'jornada 8: fechado');
assert(transferWindow(15, 30).open, 'jornada 15: mercado de inverno aberto');
assert(!transferWindow(25, 30).open, 'jornada 25: fechado até à próxima época');
const closed = transferWindow(8, 30);
assert(closed.opensAtRound === 15, `informa quando reabre: jornada ${closed.opensAtRound}`);

// ----------------------------------------------------------- reset anual
console.log('\nReset anual de tesouraria:');
const fin2 = s.finances[myId]!;
const ceiling = liquidityCeiling(fin2);
fin2.balance = ceiling + 50_000_000;
const absorbed = annualBudgetReset(fin2);
assert(absorbed > 0, `direção absorveu ${eur(absorbed)} de excedente`);
assert(fin2.balance === ceiling, `saldo travado no teto de liquidez (${eur(ceiling)})`);

fin2.balance = 1_000_000; // abaixo do teto: não deve absorver nada
assert(annualBudgetReset(fin2) === 0, 'abaixo do teto não absorve nada');

// -------------------------------------------- avanço bloqueado por decisões
console.log('\nAvanço bloqueado por decisões pendentes:');
const s2 = createNewGame({ managerName: 'B', numClubs: 8, squadSize: 18, divisions: 2, seed: 55 });
const m2 = s2.meta.managedClubId;
setTransferListed(s2, s2.clubs[m2]!.squad[0]!, true);

let gotBid = false;
for (let w = 0; w < 25 && !gotBid; w++) {
  advanceWeek(s2);
  if (s2.inbox.some((i) => i.kind === 'BID' || i.kind === 'REQUEST')) gotBid = true;
}
assert(gotBid, 'apareceu uma decisão pendente durante a época');

if (gotBid) {
  assert(blockingReason(s2) !== null,
    `há decisões a bloquear o avanço: ${blockingReason(s2)}`);

  // Avisos de renovacao sozinhos NAO bloqueiam.
  s2.inbox = s2.inbox.filter((i) => i.kind === 'RENEWAL');
  assert(blockingReason(s2) === null, 'avisos de renovação (informativos) não bloqueiam');
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
