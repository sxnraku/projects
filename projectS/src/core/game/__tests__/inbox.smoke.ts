/**
 * Teste de fumo — vender jogadores e caixa de entrada de propostas.
 * Corre com: npm run smoke:inbox
 */
import { naturalOverall, RequestItem } from '../../models';
import {
  acceptBid,
  advanceWeek,
  createNewGame,
  generateIncomingBids,
  rejectBid,
  resolveRenewal,
  resolveRequest,
  rolloverSeason,
  setTransferListed,
} from '../index';
import { Rng } from '../../engine/rng';
import { TrainingFocus } from '../../training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — vendas e caixa de entrada\n');

const state = createNewGame({ managerName: 'R', numClubs: 12, squadSize: 20, divisions: 3, seed: 4242 });
const managedId = state.meta.managedClubId;
const squad = () => state.clubs[managedId]!.squad;

// ---- Listar um jogador atrai ofertas depressa ----
console.log('Listar para transferência gera propostas:');
const listed = state.players[squad()[0]!]!;
setTransferListed(state, listed.id, true);
assert(listed.transferListed, 'jogador marcado na lista de transferências');

let got = false;
for (let w = 0; w < 20 && !got; w++) {
  const rng = new Rng(1000 + w);
  const bids = generateIncomingBids(state, rng);
  if (bids.some((b) => b.playerId === listed.id)) got = true;
  // limpa para permitir nova tentativa
  if (!got) state.inbox = [];
  state.meta.currentDate = `2026-${String((w % 12) + 1).padStart(2, '0')}-01`;
}
assert(got, 'jogador listado recebeu proposta em poucas semanas');

// ---- Aceitar uma proposta vende o jogador ----
console.log('\nAceitar proposta = venda:');
const bid = state.inbox.find((it) => it.kind === 'BID')!;
const soldId = bid.playerId;
const buyerId = bid.fromClubId;
const sellerBalBefore = state.finances[managedId]!.balance;
const buyerBalBefore = state.finances[buyerId]!.balance;
const inSquadBefore = squad().includes(soldId);

const res = acceptBid(state, bid.id);
assert(res.ok, 'proposta aceite com sucesso');
assert(inSquadBefore && !squad().includes(soldId), 'jogador saiu do nosso plantel');
assert(state.clubs[buyerId]!.squad.includes(soldId), 'jogador entrou no plantel do comprador');
assert(state.players[soldId]!.clubId === buyerId, 'clube do jogador mudou');
assert(state.finances[managedId]!.balance === sellerBalBefore + bid.fee, `recebemos ${bid.fee.toLocaleString('pt-PT')} €`);
assert(state.finances[buyerId]!.balance === buyerBalBefore - bid.fee, 'comprador pagou o valor exato');
assert(!state.inbox.some((it) => it.kind === 'BID' && it.playerId === soldId), 'propostas por esse jogador foram removidas');

// ---- O onze mantém-se válido (11 jogadores do plantel) ----
console.log('\nOnze válido após venda:');
const tactic = state.tactics[managedId]!;
const squadSet = new Set(squad());
assert(tactic.lineup.length === 11, 'onze continua com 11 jogadores');
assert(tactic.lineup.every((s) => squadSet.has(s.playerId)), 'todos os titulares pertencem ao plantel');

// ---- Recusar remove a proposta ----
console.log('\nRecusar proposta:');
const p2 = state.players[squad()[1]!]!;
setTransferListed(state, p2.id, true);
let bid2Id: string | null = null;
for (let w = 0; w < 20 && !bid2Id; w++) {
  const rng = new Rng(5000 + w);
  const bids = generateIncomingBids(state, rng);
  const b = bids.find((x) => x.playerId === p2.id);
  if (b) bid2Id = b.id;
  state.meta.currentDate = `2027-${String((w % 12) + 1).padStart(2, '0')}-01`;
}
if (bid2Id) {
  rejectBid(state, bid2Id);
  assert(!state.inbox.some((it) => it.id === bid2Id), 'proposta recusada foi removida');
} else {
  console.log('  (sem proposta para recusar neste seed — salto)');
}

// ---- Não estragar o loop: uma época com o mercado ativo continua a fechar ----
console.log('\nÉpoca completa com mercado ativo:');
const s2 = createNewGame({ managerName: 'X', numClubs: 8, squadSize: 18, divisions: 2, seed: 9 });
// Lista alguns jogadores para forçar tráfego de mercado.
for (const id of s2.clubs[s2.meta.managedClubId]!.squad.slice(0, 3)) setTransferListed(s2, id, true);
let guard = 0;
let totalBids = 0;
const leagueId = s2.clubs[s2.meta.managedClubId]!.leagueId;
while (guard++ < 40) {
  const wr = advanceWeek(s2, TrainingFocus.TECHNICAL);
  totalBids += s2.inbox.length;
  if (wr.seasonEnded) break;
}
assert(guard >= 10, `época correu ${guard} jornadas sem crashar`);
const bidCount = s2.inbox.filter((it) => it.kind === 'BID').length;
assert(bidCount <= 5, `propostas respeitam o limite (${bidCount} <= 5)`);
assert(naturalOverall(s2.players[s2.clubs[s2.meta.managedClubId]!.squad[0]!]!) > 0, 'plantel continua íntegro');

// ---- Moral dinâmica ----
console.log('\nMoral dinâmica (resultados mexem na moral):');
const s3 = createNewGame({ managerName: 'M', numClubs: 8, squadSize: 18, divisions: 1, seed: 31 });
const m3Id = s3.meta.managedClubId;
const lineupIds = s3.tactics[m3Id]!.lineup.map((s) => s.playerId);
const moraleBefore = lineupIds.map((id) => s3.players[id]!.condition.morale);
advanceWeek(s3, TrainingFocus.TECHNICAL);
const moraleAfter = lineupIds.map((id) => s3.players[id]!.condition.morale);
assert(moraleAfter.some((m, i) => m !== moraleBefore[i]),
  'moral dos titulares mudou após a jornada (vitória/empate/derrota)');
const delta = moraleAfter[0]! - moraleBefore[0]!;
assert(moraleAfter.every((m, i) => m - moraleBefore[i]! === delta || m === 95 || m === 10),
  `delta uniforme para o onze (${delta > 0 ? 'vitória +3' : delta === -1 ? 'empate -1' : 'derrota -4'})`);

// ---- Avisos de renovação ----
console.log('\nAvisos de renovação (jornada 3):');
const s4 = createNewGame({ managerName: 'N', numClubs: 8, squadSize: 18, divisions: 1, seed: 77 });
const m4Id = s4.meta.managedClubId;
// Força um jogador a estar em último ano de contrato (geração nunca cria nenhum na 1ª época).
const expiring = s4.players[s4.clubs[m4Id]!.squad[2]!]!;
expiring.contractUntil = s4.meta.season;
for (let w = 0; w < 3; w++) advanceWeek(s4, TrainingFocus.TECHNICAL);
const renItem = s4.inbox.find((it) => it.kind === 'RENEWAL' && it.playerId === expiring.id);
assert(!!renItem, 'aviso de renovação criado na jornada 3 para o jogador em último ano');
if (renItem) {
  const contractBefore = expiring.contractUntil;
  const res = resolveRenewal(s4, renItem.id, 3);
  assert(res.ok, 'renovação via inbox aceite');
  assert(expiring.contractUntil === s4.meta.season + 3, `contrato estendido ${contractBefore}→${expiring.contractUntil}`);
  assert(!s4.inbox.some((it) => it.id === renItem.id), 'aviso removido após renovar');
}

// ---- Pedidos de jogadores ----
console.log('\nPedidos de jogadores insatisfeitos:');
const s5 = createNewGame({ managerName: 'P', numClubs: 8, squadSize: 18, divisions: 1, seed: 55 });
const m5Id = s5.meta.managedClubId;
// Escolhe um suplente (fora do onze) e mantém-lhe a moral no fundo até pedir algo.
const inLineup = new Set(s5.tactics[m5Id]!.lineup.map((s) => s.playerId));
const benchId = s5.clubs[m5Id]!.squad.find((id) => !inLineup.has(id))!;
let requestItem: RequestItem | null = null;
for (let w = 0; w < 16 && !requestItem; w++) {
  s5.players[benchId]!.condition.morale = 20; // infeliz de forma persistente
  advanceWeek(s5, TrainingFocus.TECHNICAL);
  requestItem = s5.inbox.find(
    (it): it is RequestItem => it.kind === 'REQUEST' && it.playerId === benchId,
  ) ?? null;
}
assert(!!requestItem, `jogador com moral 20 acabou por fazer um pedido (${requestItem?.request})`);
if (requestItem) {
  if (requestItem.request === 'WANTS_LEAVE') {
    const msg = resolveRequest(s5, requestItem.id, true);
    assert(s5.players[benchId]!.transferListed, 'aceitar "quer sair" coloca-o na lista de transferências');
    assert(msg !== null && msg.includes('lista'), 'mensagem devolvida');
  } else {
    const wageBefore = s5.players[benchId]!.wage;
    const msg = resolveRequest(s5, requestItem.id, true);
    assert(s5.players[benchId]!.wage > wageBefore, `aceitar aumento sobe o salário (${wageBefore}→${s5.players[benchId]!.wage})`);
    assert(s5.players[benchId]!.condition.morale >= 60, 'moral recuperou após o aumento');
    assert(msg !== null, 'mensagem devolvida');
  }
  assert(!s5.inbox.some((it) => it.id === requestItem!.id), 'pedido removido após resolver');
}

// ---- Recusar pedido tem custo ----
console.log('\nRecusar pedido baixa a moral:');
const benchId2 = s5.clubs[m5Id]!.squad.find((id) => !inLineup.has(id) && id !== benchId);
if (benchId2) {
  let req2 = null;
  for (let w = 0; w < 16 && !req2; w++) {
    s5.players[benchId2]!.condition.morale = 20;
    advanceWeek(s5, TrainingFocus.TECHNICAL);
    req2 = s5.inbox.find((it) => it.kind === 'REQUEST' && it.playerId === benchId2) ?? null;
  }
  if (req2) {
    const moraleB4 = s5.players[benchId2]!.condition.morale;
    resolveRequest(s5, req2.id, false);
    assert(s5.players[benchId2]!.condition.morale < moraleB4, `moral caiu após recusa (${moraleB4}→${s5.players[benchId2]!.condition.morale})`);
  } else {
    console.log('  (sem segundo pedido neste seed — salto)');
  }
}

// ---- Rollover limpa a caixa ----
console.log('\nRollover limpa a caixa de entrada:');
let guard6 = 0;
while (guard6++ < 40) {
  const wr = advanceWeek(s5, TrainingFocus.TECHNICAL);
  if (wr.seasonEnded) break;
}
rolloverSeason(s5);
assert(s5.inbox.length === 0, 'inbox vazio na nova época');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
