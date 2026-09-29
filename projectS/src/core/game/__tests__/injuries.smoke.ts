/**
 * Teste de fumo das LESÕES COM GRAVIDADE.
 * Corre com: npm run smoke:injuries
 *
 * O que interessa aqui não é a média — é a CAUDA. Antes toda a lesão era 7-28
 * dias e nunca acontecia nada de memorável; o teste da distribuição existe para
 * garantir que a lesão de época continua rara MAS possível.
 */
import {
  advanceWeek,
  applyInjury,
  AGE_FRAGILE_FROM,
  createNewGame,
  daysFor,
  FRAGILE_ROUNDS,
  isFragile,
  pickSeverity,
  SEVERITY_DAYS,
  SEVERITY_ORDER,
  tickInjury,
  weightsForAge,
  worsen,
  type InjurySeverity,
} from '../index';
import { Rng } from '../../engine/rng';
import { Player } from '../../models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('LESÕES — teste de fumo\n');

// --------------------------------------------------------------- escalões
console.log('Escalões e durações:');
const rng = new Rng(1234);
for (const sev of SEVERITY_ORDER) {
  const [lo, hi] = SEVERITY_DAYS[sev];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 400; i++) {
    const d = daysFor(rng, sev);
    min = Math.min(min, d); max = Math.max(max, d);
  }
  assert(min >= lo && max <= hi, `${sev}: ${min}-${max} dias, dentro de ${lo}-${hi}`);
}
assert(SEVERITY_DAYS.SEVERE[0] > SEVERITY_DAYS.SERIOUS[1],
  'uma lesão de época é sempre mais longa que a pior lesão grave');

// ------------------------------------------------------------ distribuição
console.log('\nDistribuição (10 000 sorteios):');
function distribuicao(age: number) {
  const r = new Rng(99);
  const w = weightsForAge(age);
  const c: Record<string, number> = { KNOCK: 0, MINOR: 0, SERIOUS: 0, SEVERE: 0 };
  for (let i = 0; i < 10_000; i++) c[pickSeverity(r, w)]! += 1;
  return c;
}
const jovem = distribuicao(22);
const velho = distribuicao(34);
console.log(`  22 anos: ${SEVERITY_ORDER.map((s) => `${s} ${(jovem[s]! / 100).toFixed(1)}%`).join(' · ')}`);
console.log(`  34 anos: ${SEVERITY_ORDER.map((s) => `${s} ${(velho[s]! / 100).toFixed(1)}%`).join(' · ')}`);

assert(jovem.SEVERE! > 0, 'a lesão de época ACONTECE (senão o escalão era decorativo)');
assert(jovem.SEVERE! / 10_000 < 0.06, 'mas é rara: menos de 6% das lesões');
assert(jovem.KNOCK! > jovem.SERIOUS!, 'a maioria continua a ser mazelada');
assert(velho.SERIOUS! + velho.SEVERE! > jovem.SERIOUS! + jovem.SEVERE!,
  'aos 34 anos as lesões pesadas são mais frequentes que aos 22');
assert(weightsForAge(AGE_FRAGILE_FROM).KNOCK === weightsForAge(20).KNOCK,
  `abaixo dos ${AGE_FRAGILE_FROM} a idade não penaliza`);

// ------------------------------------------------------------- agravamento
console.log('\nAgravamento (recaída):');
assert(worsen('KNOCK') === 'MINOR' && worsen('SERIOUS') === 'SEVERE', 'sobe um escalão');
assert(worsen('SEVERE') === 'SEVERE', 'o topo não sobe mais');

// -------------------------------------------------------------- fragilidade
console.log('\nFragilidade depois de voltar:');
// Ler o estado por aqui: atribuir 'INJURED' e comparar logo a seguir com
// 'AVAILABLE' faz o TS estreitar ao literal e acusar comparação impossível —
// mas é precisamente essa transição que queremos testar.
const statusOf = (p: Player): string => p.condition.status;

function jogadorFake(age = 25): Player {
  const g = createNewGame({ managerName: 'R', numClubs: 6, squadSize: 16, divisions: 1, seed: 5 });
  const p = Object.values(g.players)[0]!;
  p.age = age;
  return p;
}

// Uma MAZELADA não deixa marca.
const p1 = jogadorFake();
p1.condition.status = 'INJURED';
p1.condition.injuryDaysRemaining = 5;
p1.condition.injurySeverity = 'KNOCK';
tickInjury(p1, 10, false, new Rng(1));
assert(statusOf(p1) === 'AVAILABLE', 'mazelada: volta a apto');
assert(!isFragile(p1), 'mazelada não deixa fragilidade');

// Uma lesão A SÉRIO deixa.
const p2 = jogadorFake();
p2.condition.status = 'INJURED';
p2.condition.injuryDaysRemaining = 5;
p2.condition.injurySeverity = 'SERIOUS';
tickInjury(p2, 10, false, new Rng(1));
assert(statusOf(p2) === 'AVAILABLE', 'lesão grave: volta a apto');
assert(p2.condition.fragileRounds === FRAGILE_ROUNDS,
  `lesão grave deixa ${FRAGILE_ROUNDS} jornadas de fragilidade`);
assert(p2.condition.injurySeverity === undefined, 'a gravedade limpa-se quando ele volta');

// DESCANSAR cura.
for (let i = 0; i < FRAGILE_ROUNDS; i++) tickInjury(p2, 10, false, new Rng(i));
assert(!isFragile(p2), `descansar ${FRAGILE_ROUNDS} jornadas limpa a fragilidade`);

// JOGAR não desconta — e arrisca.
const p3 = jogadorFake();
p3.condition.fragileRounds = FRAGILE_ROUNDS;
p3.condition.status = 'AVAILABLE';
p3.condition.injuryDaysRemaining = 0;
tickInjury(p3, 10, true, new Rng(7));
assert((p3.condition.fragileRounds ?? 0) === FRAGILE_ROUNDS || statusOf(p3) === 'INJURED',
  'jogar estando frágil NÃO desconta fragilidade (ou provoca recaída)');

// A recaída acontece, e é pior.
let recaidas = 0;
let piores = 0;
for (let s = 0; s < 600; s++) {
  const p = jogadorFake();
  p.condition.fragileRounds = FRAGILE_ROUNDS;
  p.condition.status = 'AVAILABLE';
  p.condition.injuryDaysRemaining = 0;
  const r = tickInjury(p, 10, true, new Rng(s));
  if (r) {
    recaidas++;
    if (SEVERITY_ORDER.indexOf(r.severity) >= SEVERITY_ORDER.indexOf('MINOR')) piores++;
  }
}
console.log(`  ${recaidas}/600 recaídas em jogadores frágeis que jogaram`);
assert(recaidas > 30 && recaidas < 250, 'a recaída acontece, sem ser constante');
assert(piores === recaidas, 'nenhuma recaída é uma simples mazelada (agravou sempre)');

// Quem NÃO é frágil nunca recai.
let semRisco = 0;
for (let s = 0; s < 300; s++) {
  const p = jogadorFake();
  p.condition.status = 'AVAILABLE';
  p.condition.injuryDaysRemaining = 0;
  p.condition.fragileRounds = 0;
  if (tickInjury(p, 10, true, new Rng(s))) semRisco++;
}
assert(semRisco === 0, 'quem não está frágil nunca recai');

// ------------------------------------------------------ época completa real
console.log('\nUma época a sério:');
const g = createNewGame({ managerName: 'R', useBase: true, seed: 4242 });
const vistas: Record<string, number> = { KNOCK: 0, MINOR: 0, SERIOUS: 0, SEVERE: 0 };
// Conta cada lesão UMA vez, no instante em que começa. Contar quem está
// lesionado a cada semana media outra coisa completamente — semanas de baixa —
// e aí a lesão de época pesa 20x mais só por durar 20 semanas.
let lesionados = new Set<string>();
let guard = 0;
while (guard++ < 40) {
  const agora = new Set<string>();
  for (const p of Object.values(g.players)) {
    if (p.condition.status !== 'INJURED') continue;
    agora.add(p.id);
    if (!lesionados.has(p.id) && p.condition.injurySeverity) {
      vistas[p.condition.injurySeverity]! += 1;
    }
  }
  lesionados = agora;
  if (advanceWeek(g).seasonEnded) break;
}
const total = SEVERITY_ORDER.reduce((s, k) => s + vistas[k]!, 0);
console.log(`  ${total} lesões numa época: ${SEVERITY_ORDER.map((s) => `${s} ${vistas[s]}`).join(' · ')}`);
assert(total > 0, 'houve lesões na época');
assert(vistas.KNOCK! + vistas.MINOR! > vistas.SERIOUS! + vistas.SEVERE!,
  'as lesões leves continuam a ser a maioria numa época real');

// Ninguém fica com dias negativos nem estado incoerente.
const incoerentes = Object.values(g.players).filter((p) =>
  p.condition.injuryDaysRemaining < 0
  || (p.condition.status === 'INJURED' && p.condition.injuryDaysRemaining === 0)
  || (p.condition.injuryDaysRemaining > 0 && p.condition.status !== 'INJURED'));
assert(incoerentes.length === 0, `nenhum jogador com lesão incoerente (${incoerentes.length})`);

const fragilLesionado = Object.values(g.players).filter((p) => isFragile(p) && p.condition.status === 'INJURED');
assert(fragilLesionado.length === 0, 'ninguém está frágil E lesionado ao mesmo tempo');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
