/**
 * Teste de fumo da ACADEMIA de jovens (recrutamento com escolha):
 * grupo de candidatos, intervalo de potencial (contém a verdade), taxa baixa,
 * recrutar (paga + entra no plantel + sai do grupo) e novo grupo.
 * Corre com: npm run smoke:academy
 */
import {
  createNewGame,
  academyLevel,
  academyCandidateCount,
  academyCandidates,
  candidatePotentialRange,
  academyFee,
  recruitAcademyCandidate,
  generateAcademyBatch,
} from '../index';
import { naturalOverall } from '../../models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — academia de jovens\n');

const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 20, divisions: 3, seed: 555 });
const myId = s.meta.managedClubId;

console.log('Grupo de candidatos:');
assert(academyCandidateCount(1) === 3 && academyCandidateCount(5) === 5, 'nº de candidatos: L1=3 … L5=5');
const cands = academyCandidates(s);
assert(cands.length === academyCandidateCount(academyLevel(s)), `grupo com ${cands.length} candidatos ao nível ${academyLevel(s)}`);
assert(cands.every((c) => c.age >= 15 && c.age <= 18), 'todos os candidatos têm 15-18 anos');
assert(cands.every((c) => c.clubId === null), 'candidatos ainda NÃO pertencem ao clube (clubId null)');

console.log('\nIntervalo de potencial + taxa (escala 0-100):');
for (const c of cands) {
  const r = candidatePotentialRange(s, c);
  const true100 = c.potential * 5;
  assert(true100 >= r.min && true100 <= r.max, `${c.lastName}: potencial real (${true100}) dentro do intervalo ${r.min}-${r.max}`);
  assert((r.max - r.min) <= 14, `${c.lastName}: intervalo apertado (${r.max - r.min})`);
}
const fees = cands.map((c) => academyFee(s, c));
assert(fees.every((f) => f >= 2_000 && f <= 30_000), `taxas de formação baixas (${Math.min(...fees)}–${Math.max(...fees)} €)`);

console.log('\nRecrutar:');
const target = cands[0]!;
const squadBefore = s.clubs[myId]!.squad.length;
const balBefore = s.finances[myId]!.balance;
const fee = academyFee(s, target);
const res = recruitAcademyCandidate(s, target.id);
assert(res.ok, 'recrutamento aceite');
assert(s.clubs[myId]!.squad.includes(target.id), 'o jovem entrou no plantel');
assert(s.players[target.id]?.clubId === myId, 'o jogador passou a pertencer ao clube');
assert(s.clubs[myId]!.squad.length === squadBefore + 1, 'plantel cresceu 1');
assert(balBefore - s.finances[myId]!.balance === fee, `a taxa (${fee} €) foi debitada`);
assert(!academyCandidates(s).some((c) => c.id === target.id), 'o candidato saiu do grupo');

console.log('\nSem saldo + novo grupo:');
s.finances[myId]!.balance = 0;
const poor = recruitAcademyCandidate(s, academyCandidates(s)[0]!.id);
assert(!poor.ok && poor.errorKey === 'academy.noFunds', 'sem saldo → recusa com "academy.noFunds"');
const idsA = academyCandidates(s).map((c) => c.id).join(',');
generateAcademyBatch(s, true);
const idsB = academyCandidates(s).map((c) => c.id).join(',');
assert(idsA !== idsB, 'gerar novo grupo muda os candidatos');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
