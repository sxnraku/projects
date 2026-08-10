/**
 * Teste de fumo da MEMÓRIA, do TREINO INDIVIDUAL e da EQUIPA TÉCNICA.
 * Corre com: npm run smoke:legacy
 *
 * Todos os casos aqui são invariantes que, se se partirem, se partem em
 * silêncio: o arquivo duplica épocas, um plano individual sobrevive ao
 * despedimento do adjunto, a despesa de estrutura acumula semana após semana.
 */
import {
  advanceWeek, agreePreContract, archivePlayerSeasons, archiveSeason, candidatesFor,
  careerTotals, createNewGame, ensureStaff, fireStaffMember, freeAgentWage,
  hireStaffMember, individualSlotsFor, listFreeAgents, preContracts,
  preContractTargets, preContractWindowOpen, rolloverSeason, setPlayerTraining,
  signFreeAgent, usedSlots,
} from '../index';
import { checkInterest, playerStanding } from '../../economy/divisions';
import { scoringRecords, titleTable } from '../../models';
import { individualSlots, staffWageBill } from '../../staff';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — memória, treino individual e equipa técnica\n');

// ---------------------------------------------------------------- memória
console.log('Memória do mundo (3 épocas):');
const s = createNewGame({ managerName: 'R', useBase: true, seed: 909 });
for (let i = 0; i < 3; i++) {
  let guard = 0;
  while (!advanceWeek(s).seasonEnded && guard++ < 80) { /* joga a época */ }
  rolloverSeason(s);
}
const h = s.history!;
assert(h.seasons.length === 3, `3 épocas arquivadas (${h.seasons.length})`);
assert(new Set(h.seasons.map((e) => e.season)).size === 3, 'sem épocas duplicadas');
assert(h.seasons.every((e) => e.champions.length === Object.keys(s.leagues).length),
  'todas as ligas têm campeão em todas as épocas');
assert(h.seasons.every((e) => e.champions.every((c) => c.clubName && c.points > 0)),
  'os campeões têm nome e pontos');
assert(h.seasons.every((e) => e.topScorers.every((t) => t.goals > 0 && !!t.playerName)),
  'os melhores marcadores têm golos e nome');
assert(h.seasons.some((e) => e.cups.some((c) => c.key === 'trophy.cup')),
  'a Taça foi arquivada');

// Idempotência: arquivar duas vezes a mesma época não duplica nem corrompe.
const before = h.seasons.length;
archiveSeason(s, null);
archiveSeason(s, null);
assert(h.seasons.length === before + 1,
  `arquivar a época em curso acrescenta UMA entrada e repetir substitui (${before} -> ${h.seasons.length})`);

const titles = titleTable(h);
assert(titles.length > 0 && titles[0]!.titles >= 1, `palmarés construído (líder: ${titles[0]?.clubName})`);
assert(titles.every((t) => t.seasons.length === t.titles), 'nº de épocas bate com nº de títulos');
const recs = scoringRecords(h, 5);
assert(recs.length > 0, `recordes de marcador (melhor: ${recs[0]?.playerName} ${recs[0]?.goals}g)`);
assert(new Set(recs.map((r) => r.playerId)).size === recs.length, 'um jogador só aparece uma vez nos recordes');

// ------------------------------------------------------- carreira do jogador
console.log('\nCarreira dos jogadores:');
const withHistory = Object.values(s.players).filter((p) => (p.condition.history?.length ?? 0) > 0);
assert(withHistory.length > 100, `${withHistory.length} jogadores com carreira arquivada`);
assert(withHistory.every((p) => p.condition.history!.every((l) => l.apps > 0)),
  'nunca se arquiva uma época sem jogos');
assert(withHistory.every((p) => {
  const seasons = p.condition.history!.map((l) => l.season);
  return new Set(seasons).size === seasons.length;
}), 'nenhum jogador tem a mesma época duas vezes');
const sample = withHistory.sort((a, b) => (b.condition.history?.length ?? 0) - (a.condition.history?.length ?? 0))[0]!;
const totals = careerTotals(sample);
const sumGoals = sample.condition.history!.reduce((n, l) => n + l.goals, 0)
  + (sample.condition.seasonGoals ?? 0);
assert(totals.goals === sumGoals, `os totais somam as linhas (${totals.goals} golos)`);

// Arquivar duas vezes a mesma época não duplica a linha de carreira.
const lines = sample.condition.history!.length;
archivePlayerSeasons(s);
archivePlayerSeasons(s);
assert(sample.condition.history!.length <= lines + 1,
  `arquivo de carreira idempotente (${lines} -> ${sample.condition.history!.length})`);

// ------------------------------------------------------- prémio de assinatura
console.log('\nSubir de divisão nunca custa prémio:');
const my = s.clubs[s.meta.managedClubId]!;
const myTier = s.leagues[my.leagueId]!.tier;
let upwardBonus = 0, upwardChecked = 0;
for (const p of Object.values(s.players)) {
  if (!p.clubId || p.clubId === my.id) continue;
  const theirTier = s.leagues[s.clubs[p.clubId]!.leagueId]?.tier ?? 1;
  if (theirTier <= myTier) continue; // só quem está ABAIXO de nós
  upwardChecked++;
  const r = checkInterest(p, my, myTier, playerStanding(p, s.clubs, s.leagues));
  if (!r.interested) upwardBonus++;
}
assert(upwardChecked > 0, `${upwardChecked} jogadores de divisões inferiores analisados`);
assert(upwardBonus === 0, `nenhum pede prémio para subir de divisão (${upwardBonus})`);

// O travão inverso tem de aguentar: um clube pequeno não assalta a elite.
const small = Object.values(s.clubs)
  .filter((c) => (s.leagues[c.leagueId]?.tier ?? 1) === Math.max(...Object.values(s.leagues).map((l) => l.tier)))
  .sort((a, b) => a.reputation - b.reputation)[0]!;
const smallTier = s.leagues[small.leagueId]!.tier;
const elite = Object.values(s.players)
  .filter((p) => p.clubId)
  .sort((a, b) => b.marketValue - a.marketValue)
  .slice(0, 10);
const eliteOpen = elite.filter((p) =>
  checkInterest(p, small, smallTier, playerStanding(p, s.clubs, s.leagues)).interested).length;
assert(eliteOpen === 0, `os 10 melhores do mundo recusam ${small.name} (${eliteOpen} aceitaram)`);

// ---------------------------------------------------------- equipa técnica
console.log('\nEquipa técnica:');
const s2 = createNewGame({ managerName: 'R', useBase: true, seed: 4321 });
ensureStaff(s2);
const club2 = s2.clubs[s2.meta.managedClubId]!;
const fin2 = s2.finances[club2.id]!;
assert((s2.career.staff?.length ?? 0) > 0, `backroom inicial gerado (${s2.career.staff?.length} pessoas)`);
assert(s2.career.staff!.every((m) => m.wage > 0 && m.ability >= 1 && m.ability <= 20),
  'todos têm salário e capacidade dentro da escala');
const roles = s2.career.staff!.map((m) => m.role);
assert(new Set(roles).size === roles.length, 'um lugar por função (sem duplicados)');

// A despesa de estrutura NÃO pode acumular semana após semana.
const staffCostBefore = fin2.expenses.staff;
advanceWeek(s2);
advanceWeek(s2);
assert(Math.abs(fin2.expenses.staff - staffCostBefore) < 1,
  `despesa de estrutura estável entre semanas (${staffCostBefore} -> ${fin2.expenses.staff})`);
assert(fin2.expenses.staff > staffWageBill(s2.career.staff!),
  'a despesa inclui a base do clube além dos salários');

// Contratar melhor sobe as vagas; despedir corta os planos a mais.
const cands = candidatesFor(s2, 'ASSISTANT');
assert(cands.length > 0 && cands[0]!.ability >= cands[cands.length - 1]!.ability,
  `candidatos ordenados do melhor para o pior (${cands.length})`);
assert(candidatesFor(s2, 'ASSISTANT')[0]!.id === cands[0]!.id,
  'a lista de candidatos é determinística (não muda ao reabrir o ecrã)');

s2.finances[club2.id]!.balance = 5_000_000; // caixa para contratar
const hired = hireStaffMember(s2, cands[0]!);
assert(hired.ok, `contratação aceite (${cands[0]!.name})`);
const slotsAfterHire = individualSlotsFor(s2);
assert(slotsAfterHire === individualSlots(s2.career.staff!), 'as vagas vêm do adjunto contratado');

// Ocupar todas as vagas e confirmar que a seguinte é recusada.
const squad2 = club2.squad.map((id) => s2.players[id]);
let accepted = 0, refused = 0;
for (const p of squad2) {
  if (!p) continue;
  const r = setPlayerTraining(s2, p.id, 'PHYSICAL');
  if (r.ok) accepted++; else refused++;
}
assert(accepted === slotsAfterHire, `aceites exatamente ${slotsAfterHire} planos (${accepted})`);
assert(refused > 0, `os restantes foram recusados (${refused})`);

const assistant = s2.career.staff!.find((m) => m.role === 'ASSISTANT')!;
fireStaffMember(s2, assistant.id);
const slotsAfterFire = individualSlotsFor(s2);
assert(usedSlots(club2.squad.map((id) => s2.players[id])) <= slotsAfterFire,
  `despedir o adjunto corta os planos a mais (${slotsAfterFire} vagas)`);

// Sem caixa não se contrata — o mesmo princípio dos jogadores.
s2.finances[club2.id]!.balance = 10;
const broke = hireStaffMember(s2, candidatesFor(s2, 'COACH')[0]!);
assert(!broke.ok && broke.errorKey === 'staff.error.noCash',
  `sem caixa a contratação é travada: "${broke.errorKey}"`);

// Uma época inteira com staff e planos individuais não pode rebentar.
let guard2 = 0;
while (!advanceWeek(s2).seasonEnded && guard2++ < 80) { /* joga */ }
rolloverSeason(s2);
assert(guard2 < 80, 'época com staff e planos individuais corre até ao fim');
assert(s2.history!.seasons.length >= 1, 'a época ficou arquivada');

// ------------------------------------------------- livres e pré-contratos
console.log('\nMercado de livres e pré-contratos:');
const s3 = createNewGame({ managerName: 'R', useBase: true, seed: 55 });
const my3 = s3.clubs[s3.meta.managedClubId]!;
const tier3 = s3.leagues[my3.leagueId]!.tier;

// Fora da janela não se fecham acordos.
const early = agreePreContract(s3, preContractTargets(s3)[0]?.id ?? 'x', 999_999, 3).errorKey ?? '';
assert(early === 'pre.err.window' || early === 'free.err.gone',
  `fora da janela o pré-contrato é recusado ("${early}")`);

let guard3 = 0, agreed = 0;
while (!advanceWeek(s3).seasonEnded && guard3++ < 80) {
  if (preContractWindowOpen(s3) && preContracts(s3).length === 0) {
    for (const p of preContractTargets(s3).filter((x) => checkInterest(x, my3, tier3).interested).slice(0, 5)) {
      if (agreePreContract(s3, p.id, Math.round(freeAgentWage(s3, p) * 1.2), 3).ok) agreed++;
    }
  }
}
assert(agreed > 0 && agreed <= 3, `${agreed} pré-contratos fechados (teto de 3 respeitado)`);

const dealNames = preContracts(s3).map((p) => p.playerName);
rolloverSeason(s3);
const joined = dealNames.filter((n) => my3.squad.some((id) => {
  const p = s3.players[id];
  return !!p && `${p.firstName} ${p.lastName}` === n;
}));
assert(joined.length > 0, `${joined.length}/${dealNames.length} pré-contratos entraram no plantel`);
assert(preContracts(s3).length === 0, 'a lista de acordos fica limpa depois do rollover');
assert(s3.news.some((n) => n.key === 'news.pre.joined'), 'a chegada foi noticiada');

// O pool de livres tem de servir TODAS as divisões, não só a elite: se o corte
// guardar apenas os melhores, o separador aparece sempre vazio a um clube
// pequeno, porque o estatuto faz com que todos o recusem.
const free3 = listFreeAgents(s3);
assert(free3.length > 20, `${free3.length} livres no mercado`);
const reachable3 = free3.filter((p) => checkInterest(p, my3, tier3).interested);
assert(reachable3.length > 0, `${reachable3.length} ao alcance de um clube da divisão ${tier3}`);

const target3 = reachable3[0]!;
const askedWage = freeAgentWage(s3, target3);
const lowball = signFreeAgent(s3, target3.id, 1, 2);
assert(!lowball.ok && lowball.errorKey === 'free.err.wage', `salário a menos é recusado ("${lowball.errorKey}")`);

const balBefore = s3.finances[my3.id]!.balance;
const fair = signFreeAgent(s3, target3.id, askedWage, 2);
assert(fair.ok, `assinado ${target3.lastName} por ${askedWage} €/sem`);
assert(s3.players[target3.id]!.clubId === my3.id, 'ficou mesmo no nosso plantel');
assert(!listFreeAgents(s3).some((p) => p.id === target3.id), 'saiu da lista de livres');
assert(s3.players[target3.id]!.contractUntil === s3.meta.season + 2, 'contrato com a duração pedida');
assert(s3.finances[my3.id]!.balance === balBefore, 'assinar um livre não mexe no saldo (não há passe)');

// A IA também limpa o mercado — não pode ser um bufete só para o utilizador.
const freeBefore = listFreeAgents(s3).length;
for (let i = 0; i < 12; i++) advanceWeek(s3);
assert(listFreeAgents(s3).length < freeBefore,
  `a IA também contrata livres (${freeBefore} -> ${listFreeAgents(s3).length})`);

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
