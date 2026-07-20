/**
 * Teste de fumo da ETAPA 1 — sem framework de testes ainda.
 * Constrói entidades, valida-as e verifica o cálculo de overall.
 * Corre com: npm run smoke
 */
import {
  computeOverall,
  effectiveOverall,
  emptyGameState,
  fullName,
  isNaturalPosition,
  naturalOverall,
  OUT_OF_POSITION_PENALTY,
  Player,
  PlayerAttributes,
  SCHEMA_VERSION,
  validatePlayer,
  weeklyNet,
} from '../index';
import type { Finance } from '../finance';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  ✗ FALHA:', msg);
  } else {
    console.log('  ✓', msg);
  }
}

const attrs = (over: Partial<PlayerAttributes> = {}): PlayerAttributes => ({
  pace: 12, stamina: 12, strength: 12, agility: 12,
  finishing: 12, passing: 12, dribbling: 12, tackling: 12, heading: 12, goalkeeping: 4,
  positioning: 12, composure: 12, teamwork: 12, vision: 12,
  ...over,
});

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    clubId: 'c1',
    firstName: 'João',
    lastName: 'Silva',
    age: 24,
    nationality: 'PRT',
    foot: 'RIGHT',
    positions: ['ST'],
    attributes: attrs(),
    potential: 16,
    condition: { form: 70, morale: 80, fitness: 100, status: 'AVAILABLE', injuryDaysRemaining: 0 },
    contractUntil: 2028,
    wage: 5000,
    marketValue: 2_000_000,
    transferListed: false,
    ...over,
  };
}

console.log('ETAPA 1 — teste de fumo do modelo de dados\n');

console.log('Nome completo:');
assert(fullName(makePlayer()) === 'João Silva', 'fullName concatena nome');

console.log('\nOverall depende da posição:');
const striker = makePlayer({ positions: ['ST'], attributes: attrs({ finishing: 20, tackling: 4 }) });
const defender = makePlayer({ positions: ['CB'], attributes: attrs({ finishing: 20, tackling: 4 }) });
const stOverall = naturalOverall(striker);
const cbOverall = naturalOverall(defender);
assert(stOverall > cbOverall, `mesmo jogador vale mais a ST (${stOverall}) que a CB (${cbOverall}) com finishing alto`);

console.log('\nOverall dentro da escala 1..20:');
const ov = computeOverall(attrs(), 'CM');
assert(ov >= 1 && ov <= 20, `overall CM = ${ov} está em 1..20`);

console.log('\nPenalização por jogar fora de posição:');
const centralBack = makePlayer({ positions: ['CB'], attributes: attrs() });
const atCb = effectiveOverall(centralBack, 'CB');
const atLb = effectiveOverall(centralBack, 'LB');
const atSt = effectiveOverall(centralBack, 'ST');
assert(isNaturalPosition(centralBack, 'CB'), 'CB é posição natural do central');
assert(!isNaturalPosition(centralBack, 'LB'), 'LB não é natural para o central');
assert(atCb === computeOverall(centralBack.attributes, 'CB'), `sem penalização na natural (${atCb})`);
assert(atLb === Math.max(1, computeOverall(centralBack.attributes, 'LB') - OUT_OF_POSITION_PENALTY.sameGroup),
  `mesmo setor (CB→LB) leva -${OUT_OF_POSITION_PENALTY.sameGroup} (${atLb})`);
assert(atSt === Math.max(1, computeOverall(centralBack.attributes, 'ST') - OUT_OF_POSITION_PENALTY.otherGroup),
  `outro setor (CB→ST) leva -${OUT_OF_POSITION_PENALTY.otherGroup} (${atSt})`);
assert(atCb > atLb && atLb > atSt, `render decresce com a distância à posição: ${atCb} > ${atLb} > ${atSt}`);

console.log('\nValidação apanha atributo fora de escala:');
const bad = makePlayer({ attributes: attrs({ pace: 99 }) });
assert(validatePlayer(bad).length > 0, 'pace=99 é rejeitado');
assert(validatePlayer(makePlayer()).length === 0, 'jogador válido passa sem erros');

console.log('\nFinanças — fluxo líquido semanal:');
const fin: Finance = {
  clubId: 'c1',
  balance: 10_000_000,
  transferBudget: 5_000_000,
  wageBudget: 500_000,
  income: { tickets: 200_000, sponsorship: 150_000, tvRights: 300_000, merchandising: 50_000 },
  expenses: { wages: 400_000, facilities: 60_000, staff: 90_000 },
};
assert(weeklyNet(fin) === 150_000, `weeklyNet = ${weeklyNet(fin)} (esperado 150000)`);

console.log('\nGameState vazio:');
const gs = emptyGameState({
  saveId: 's1', managerName: 'Eu', managedClubId: 'c1',
  season: 2026, currentDate: '2026-07-16', rngSeed: 42,
  createdAt: '2026-07-16T00:00:00Z', updatedAt: '2026-07-16T00:00:00Z',
  schemaVersion: SCHEMA_VERSION,
});
assert(Object.keys(gs.players).length === 0, 'estado inicia sem jogadores');
assert(gs.meta.rngSeed === 42, 'seed guardada no meta');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
