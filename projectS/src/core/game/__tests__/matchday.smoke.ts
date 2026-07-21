/**
 * Teste de fumo do pré-jogo e das propostas com espera:
 * checklist do onze, rotação automática, carga física da tática, balanço da
 * jornada e negociação assíncrona (resposta só na jornada seguinte).
 * Corre com: npm run smoke:matchday
 */
import {
  acceptCounter,
  activeOffers,
  advanceWeek,
  autoRotate,
  availableBudget,
  blockingReason,
  BOSMAN_WINDOW_ROUNDS,
  createNewGame,
  expiringStarters,
  inBosmanWindow,
  isReachable,
  lineupOverall,
  lineupWarnings,
  matchdayPreview,
  outgoingOffers,
  reachability,
  reservedBudget,
  roundsRemaining,
  submitPendingOffer,
  TIRED_FITNESS,
} from '../index';
import { matchFatigue, physicalLoad } from '../../engine/fatigue';
import { naturalOverall } from '../../models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}
const eur = (n: number) => n.toLocaleString('pt-PT') + ' €';

console.log('Teste de fumo — pré-jogo e propostas assíncronas\n');

const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 20, divisions: 3, seed: 4242 });
const myId = s.meta.managedClubId;
const tactic = s.tactics[myId]!;

// ------------------------------------------------------------ carga física
console.log('Carga física da tática:');
const neutral = matchFatigue({ pressing: 5, tempo: 'NORMAL' });
const brutal = matchFatigue({ pressing: 10, tempo: 'FAST' });
const gentle = matchFatigue({ pressing: 0, tempo: 'SLOW' });
assert(brutal > neutral, `pressão 10 + ritmo rápido cansa mais (${brutal} vs ${neutral})`);
assert(gentle < neutral, `pressão 0 + ritmo lento cansa menos (${gentle} vs ${neutral})`);
assert(physicalLoad({ pressing: 10, tempo: 'FAST' }).level === 'VERY_HIGH',
  `pressão máxima é sinalizada como muito alta (+${physicalLoad({ pressing: 10, tempo: 'FAST' }).deltaPct}%)`);
assert(physicalLoad({ pressing: 5, tempo: 'NORMAL' }).level === 'NORMAL',
  'tática neutra não gera aviso');

// ---------------------------------------------------------------- pré-jogo
console.log('\nCartão de pré-jogo:');
const preview = matchdayPreview(s)!;
assert(!!preview, 'há pré-visualização da próxima jornada');
assert(preview.round === 1, `arranca na jornada ${preview.round}`);
assert(!!preview.opponent, `adversário identificado: ${preview.opponent?.name}`);
assert(preview.lineupOverall > 0, `OVR médio do onze: ${preview.lineupOverall}`);
assert(preview.projectedCosts > 0, `custos semanais projetados: ${eur(preview.projectedCosts)}`);
assert(preview.warnings.length === 0, 'plantel fresco no arranque: sem avisos');
assert(preview.fatiguePerMatch === matchFatigue(tactic),
  'a fadiga mostrada é a mesma que a simulação aplica');

if (preview.isHome) {
  assert(preview.projectedGate > 0, `bilheteira estimada em casa: ${eur(preview.projectedGate)}`);
} else {
  assert(preview.projectedGate === 0, 'jogo fora não gera bilheteira');
}

// ------------------------------------------------------- rotação automática
console.log('\nRotação automática:');
// Cansa dois titulares à força.
const tired = tactic.lineup.slice(1, 3).map((slot) => slot.playerId);
for (const id of tired) s.players[id]!.condition.fitness = 30;

const warns = lineupWarnings(s, myId);
assert(warns.length === 2, `deteta ${warns.length} titulares exaustos (< ${TIRED_FITNESS} FIT)`);

const ovrBefore = lineupOverall(s, myId);
const rot = autoRotate(s);
assert(rot.swapped === 2, `rodou ${rot.swapped} jogadores: ${rot.changes.join(', ')}`);
assert(lineupWarnings(s, myId).length === 0, 'depois da rotação já não há exaustos no onze');
assert(!tactic.lineup.some((sl) => tired.includes(sl.playerId)),
  'os exaustos saíram mesmo do onze');
console.log(`    (OVR do onze ${ovrBefore} → ${lineupOverall(s, myId)} — rodar custa qualidade)`);

// Sem ninguém cansado, a rotação não mexe em nada.
assert(autoRotate(s).swapped === 0, 'onze descansado: rotação não faz nada');

// ------------------------------------------------------- balanço da jornada
console.log('\nBalanço da jornada:');
const week = advanceWeek(s);
const rep = week.report!;
assert(!!rep, 'a semana devolve um relatório');
assert(rep.round === 1, `relatório da jornada ${rep.round}`);
assert(rep.wages > 0 && rep.staff > 0, `despesas registadas: salários ${eur(rep.wages)}`);
assert(
  rep.net === rep.gate + rep.otherIncome - rep.wages - rep.facilities - rep.staff,
  `lucro líquido bate certo: ${eur(rep.net)}`,
);
assert(rep.played, `jogo disputado: ${rep.goalsFor}-${rep.goalsAgainst} vs ${rep.opponentName}`);
if (rep.isHome) assert(rep.attendance > 0, `${rep.attendance} adeptos no estádio`);

// ------------------------------------------------- propostas com espera
console.log('\nPropostas assíncronas:');
const myClub = s.clubs[myId]!;
const fin = s.finances[myId]!;
fin.transferBudget = 50_000_000;
fin.wageBudget = 5_000_000;

const targets = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId && reachability(s, p).status === 'OPEN')
  .sort((a, b) => naturalOverall(b) - naturalOverall(a));
const target = targets[0]!;
assert(!!target, `alvo aberto a negociar: ${target.lastName} (OVR ${naturalOverall(target)})`);

// Um craque fora do alcance do clube tem de ser barrado ANTES de negociar.
const locked = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId && !isReachable(s, p))
  .sort((a, b) => naturalOverall(b) - naturalOverall(a))[0];
if (locked) {
  assert(reachability(s, locked).status === 'LOCKED',
    `craque OVR ${naturalOverall(locked)} bloqueado com "sem interesse" (rep. do clube: ${myClub.reputation})`);
}
// Degrau intermédio: convencível com prémio que o clube consegue pagar.
const bonusTarget = Object.values(s.players)
  .filter((p) => p.clubId && p.clubId !== myId && reachability(s, p).status === 'BONUS')
  .sort((a, b) => naturalOverall(b) - naturalOverall(a))[0];
if (bonusTarget) {
  const r = reachability(s, bonusTarget);
  assert(r.requiredSigningBonus > 0 && r.requiredSigningBonus <= availableBudget(s),
    `${bonusTarget.lastName} vem por um prémio de ${eur(r.requiredSigningBonus)} (pagável)`);
}

const sub = submitPendingOffer(s, {
  playerId: target.id, fromClubId: myId,
  fee: target.marketValue * 2, wageOffer: 40_000, contractYears: 3,
});
assert(sub.ok, 'proposta submetida');
assert(activeOffers(s).length === 1, 'fica 1 proposta em curso');
assert(activeOffers(s)[0]!.status === 'PENDING', 'estado inicial é PENDING (sem resposta imediata)');
assert(target.clubId !== myId, 'o jogador NÃO mudou de clube na submissão');
assert(blockingReason(s) === null || !blockingReason(s)!.includes('contra-proposta'),
  'uma proposta pendente não bloqueia o avanço');

// Orçamento reservado: não se gasta o mesmo dinheiro duas vezes.
assert(reservedBudget(s) === target.marketValue * 2,
  `orçamento reservado: ${eur(reservedBudget(s))}`);
assert(availableBudget(s) === fin.transferBudget - reservedBudget(s),
  `disponível para novas propostas: ${eur(availableBudget(s))}`);

const dup = submitPendingOffer(s, {
  playerId: target.id, fromClubId: myId, fee: 1000, wageOffer: 1000, contractYears: 3,
});
assert(!dup.ok, `proposta duplicada bloqueada: "${dup.errorKey}"`);

// A resposta só chega quando a jornada avança.
advanceWeek(s);
const resolved = outgoingOffers(s).find((o) => o.playerId === target.id)!;
assert(resolved.status !== 'PENDING',
  `resposta chegou depois de avançar: ${resolved.status} — "${resolved.reasonKey}"`);

if (resolved.status === 'COUNTER') {
  assert(blockingReason(s)?.includes('contra-proposta') ?? false,
    'a contra-proposta bloqueia o avanço até haver decisão');
  const acc = acceptCounter(s, resolved.id);
  assert(acc.ok || !!acc.errorKey, `contra-proposta resolvida: ${acc.ok ? 'aceite' : acc.errorKey}`);
  if (acc.ok) assert(s.players[target.id]!.clubId === myId, 'o jogador mudou mesmo de clube');
} else if (resolved.status === 'ACCEPTED') {
  assert(s.players[target.id]!.clubId === myId, 'o jogador assinou pelo nosso clube');
  assert(myClub.squad.includes(target.id), 'entrou no plantel');
}

// O inbox não pode apagar as nossas propostas por elas referirem jogadores de fora.
assert(outgoingOffers(s).length >= 1, 'a proposta sobreviveu ao pruneInbox');

// ------------------------------------------------------------- Lei Bosman
console.log('\nLei Bosman (fim de contrato):');
const bs = createNewGame({ managerName: 'B', numClubs: 8, squadSize: 18, divisions: 1, seed: 77 });
const bId = bs.meta.managedClubId;
const starter = bs.players[bs.tactics[bId]!.lineup[5]!.playerId]!;
starter.contractUntil = bs.meta.season; // expira no fim desta época

assert(!inBosmanWindow(bs), 'no arranque ainda não há janela Bosman');

let hitWindow = false;
for (let w = 0; w < 40; w++) {
  advanceWeek(bs);
  if (inBosmanWindow(bs)) { hitWindow = true; break; }
  if (roundsRemaining(bs) === 0) break;
}
assert(hitWindow, `entrou na janela Bosman a ${BOSMAN_WINDOW_ROUNDS} jornadas do fim`);

if (hitWindow) {
  assert(expiringStarters(bs).some((e) => e.playerId === starter.id),
    `${starter.lastName} sinalizado como fim de contrato no onze`);
  assert(bs.news.some((n) => n.key === 'news.bosman'),
    'apareceu aviso de pré-contrato nas notícias (aviso justo)');
  const preW = matchdayPreview(bs);
  assert(!!preW && preW.expiringStarters.length > 0,
    `o cartão de jogo mostra o 4º aviso: ${preW?.expiringStarters.length} em fim de contrato`);
  assert(starter.clubId === bId, 'o jogador ainda é nosso — o pré-contrato só age no fim da época');
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
