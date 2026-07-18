/**
 * Teste de fumo da ETAPA 4 — mercado, contratos, finanças e treino.
 * Corre com: npm run smoke:economy
 */
import {
  Club,
  defaultFacilities,
  emptyCup,
  Finance,
  GameState,
  naturalOverall,
  Player,
  SCHEMA_VERSION,
} from '../../models';
import { initialCareer } from '../../career';
import { makeTeam } from '../../engine/__tests__/fixtures';
import { Rng } from '../../engine/rng';
import {
  applyWeeklyFinances,
  computeMarketValue,
  evaluateOffer,
  executeTransfer,
  matchdayIncome,
  processContractExpiries,
  recalcBudgets,
  recalcWages,
  renewContract,
  suggestedWage,
  TransferOffer,
} from '../index';
import { trainPlayer, TrainingFocus } from '../../training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

// ---- Construtor de um GameState mínimo com 2 clubes ----
function makeClub(id: string, reputation: number, capacity: number): Club {
  return {
    id, name: `Clube ${id}`, shortName: id, country: 'PRT', leagueId: 'L1',
    primaryColor: '#ff0000', secondaryColor: '#ffffff',
    stadiumName: `Estádio ${id}`, stadiumCapacity: capacity, reputation,
    facilities: defaultFacilities(),
    squad: [],
  };
}
function makeFinance(id: string, balance: number): Finance {
  return {
    clubId: id, balance, transferBudget: balance * 0.4, wageBudget: 200_000,
    income: { tickets: 0, sponsorship: 100_000, tvRights: 200_000, merchandising: 30_000 },
    expenses: { wages: 0, facilities: 50_000, staff: 40_000 },
  };
}

function buildState(): GameState {
  const teamA = makeTeam('A', 15);
  const teamB = makeTeam('B', 13);
  const players: Record<string, Player> = { ...teamA.players, ...teamB.players };

  const clubA = makeClub('A', 80, 50_000);
  const clubB = makeClub('B', 55, 30_000);
  clubA.squad = Object.values(teamA.players).map((p) => p.id);
  clubB.squad = Object.values(teamB.players).map((p) => p.id);

  const finA = makeFinance('A', 20_000_000);
  const finB = makeFinance('B', 8_000_000);
  recalcWages(clubA, finA, players);
  recalcWages(clubB, finB, players);

  return {
    meta: {
      saveId: 's1', managerName: 'Eu', managedClubId: 'A',
      season: 2026, currentDate: '2026-07-16', rngSeed: 42,
      createdAt: '', updatedAt: '', schemaVersion: SCHEMA_VERSION,
    },
    players,
    clubs: { A: clubA, B: clubB },
    leagues: {},
    finances: { A: finA, B: finB },
    tactics: {},
    schedules: {},
    standings: {},
    career: initialCareer(),
    news: [],
    cup: emptyCup(),
    inbox: [],
  };
}

console.log('ETAPA 4 — teste de fumo (mercado, contratos, finanças, treino)\n');

// ---- Valor de mercado ----
console.log('Valor de mercado:');
const state = buildState();
const p = state.players['A_p9']!; // ST nível 15

const young = { ...p, age: 19, potential: 19 };
const oldP = { ...p, age: 33, potential: 15 };
assert(computeMarketValue(young, 2026) > computeMarketValue(oldP, 2026),
  `jovem com potencial vale mais que veterano (${computeMarketValue(young, 2026).toLocaleString('pt-PT')} > ${computeMarketValue(oldP, 2026).toLocaleString('pt-PT')})`);

const shortContract = { ...p, contractUntil: 2027 };
const longContract = { ...p, contractUntil: 2031 };
assert(computeMarketValue(shortContract, 2026) < computeMarketValue(longContract, 2026),
  'contrato curto desvaloriza o passe');
assert(suggestedWage(p, 2026) >= 500, 'salário sugerido tem mínimo digno');

// ---- Avaliação de propostas ----
console.log('\nAvaliação de propostas:');
const target = state.players['B_p9']!; // ST do clube B
const value = computeMarketValue(target, 2026);

const lowOffer: TransferOffer = { playerId: target.id, fromClubId: 'A', fee: Math.round(value * 0.5), wageOffer: suggestedWage(target, 2026), contractYears: 3 };
assert(evaluateOffer(lowOffer, state).decision === 'COUNTER', 'proposta baixa gera contra-proposta');

const fairOffer: TransferOffer = { playerId: target.id, fromClubId: 'A', fee: Math.round(value * 1.3), wageOffer: suggestedWage(target, 2026), contractYears: 3 };
assert(evaluateOffer(fairOffer, state).decision === 'ACCEPTED', 'proposta justa é aceite');

const ownPlayer: TransferOffer = { playerId: 'A_p9', fromClubId: 'A', fee: 1_000_000, wageOffer: 10_000, contractYears: 3 };
assert(evaluateOffer(ownPlayer, state).decision === 'REJECTED', 'não se compra jogador do próprio clube');

// ---- Execução da transferência ----
console.log('\nExecução da transferência (conservação de fundos):');
const balABefore = state.finances['A']!.balance;
const balBBefore = state.finances['B']!.balance;
const fee = fairOffer.fee;
const res = executeTransfer(fairOffer, state);
assert(res.ok, 'transferência executada com sucesso');
assert(state.players[target.id]!.clubId === 'A', 'jogador mudou de clube');
assert(state.clubs['A']!.squad.includes(target.id), 'entrou no plantel do comprador');
assert(!state.clubs['B']!.squad.includes(target.id), 'saiu do plantel do vendedor');
assert(state.finances['A']!.balance === balABefore - fee, `comprador pagou ${fee.toLocaleString('pt-PT')}`);
assert(state.finances['B']!.balance === balBBefore + fee, 'vendedor recebeu o valor exato');
assert(state.players[target.id]!.contractUntil === 2026 + fairOffer.contractYears, 'novo contrato aplicado');

console.log('\nOrçamento insuficiente é rejeitado:');
const poor = buildState();
poor.finances['A']!.transferBudget = 1000;
const bigOffer: TransferOffer = { playerId: 'B_p9', fromClubId: 'A', fee: 5_000_000, wageOffer: 20_000, contractYears: 3 };
assert(!executeTransfer(bigOffer, poor).ok, 'sem orçamento, transferência falha');

// ---- Contratos ----
console.log('\nRenovação e expiração de contratos:');
const s2 = buildState();
const own = s2.players['A_p0']!;
const rn = renewContract(own.id, 4, suggestedWage(own, 2026), s2);
assert(rn.ok && own.contractUntil === 2030, 'renovação estende o contrato para 2030');

const s3 = buildState();
s3.players['A_p1']!.contractUntil = 2026; // expira nesta época
const freed = processContractExpiries(s3);
assert(freed.includes('A_p1'), 'jogador com contrato expirado fica livre');
assert(s3.players['A_p1']!.clubId === null, 'jogador livre não tem clube');
assert(!s3.clubs['A']!.squad.includes('A_p1'), 'saiu do plantel ao expirar');

// ---- Finanças ----
console.log('\nFinanças:');
const s4 = buildState();
const income = matchdayIncome(s4.clubs['A']!);
assert(income > 0, `bilheteira positiva: ${income.toLocaleString('pt-PT')}`);
const finA = s4.finances['A']!;
const balBefore = finA.balance;
const newBal = applyWeeklyFinances(finA, income);
assert(newBal === balBefore + (finA.income.sponsorship + finA.income.tvRights + finA.income.merchandising + finA.income.tickets - finA.expenses.wages - finA.expenses.facilities - finA.expenses.staff) + income,
  'saldo atualizado por fluxo semanal + bilheteira');
recalcBudgets(finA);
assert(finA.transferBudget >= 0 && finA.wageBudget > 0, 'orçamentos recalculados');

// ---- Treino ----
console.log('\nTreino — evolução determinística:');
const prospect: Player = { ...makeTeam('X', 12).players['X_p9']!, age: 18, potential: 18 };
const ovBefore = naturalOverall(prospect);
const rngT = new Rng(777);
for (let week = 0; week < 40; week++) trainPlayer(prospect, TrainingFocus.TECHNICAL, rngT);
const ovAfter = naturalOverall(prospect);
assert(ovAfter > ovBefore, `jovem evoluiu ${ovBefore}→${ovAfter} em 40 semanas`);
assert(ovAfter <= prospect.potential, 'evolução não passa o potencial');

const veteran: Player = { ...makeTeam('Y', 16).players['Y_p1']!, age: 35 };
const paceBefore = veteran.attributes.pace;
const rngV = new Rng(555);
for (let week = 0; week < 40; week++) trainPlayer(veteran, TrainingFocus.PHYSICAL, rngV);
assert(veteran.attributes.pace <= paceBefore, `veterano declina fisicamente (pace ${paceBefore}→${veteran.attributes.pace})`);

console.log('\nDeterminismo do treino (mesma seed → mesmo resultado):');
const pa: Player = { ...makeTeam('Z', 12).players['Z_p9']!, age: 18, potential: 18 };
const pb: Player = { ...makeTeam('Z', 12).players['Z_p9']!, age: 18, potential: 18 };
const ra = new Rng(2024), rb = new Rng(2024);
for (let w = 0; w < 30; w++) { trainPlayer(pa, TrainingFocus.TECHNICAL, ra); trainPlayer(pb, TrainingFocus.TECHNICAL, rb); }
assert(JSON.stringify(pa.attributes) === JSON.stringify(pb.attributes), 'mesma seed → atributos idênticos');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
