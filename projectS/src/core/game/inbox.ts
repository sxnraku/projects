import {
  BidItem,
  GameState,
  InboxItem,
  MAX_ACTIVE_BIDS,
  MAX_ACTIVE_RENEWALS,
  MAX_ACTIVE_REQUESTS,
  naturalOverall,
  RenewalItem,
  RequestItem,
} from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import {
  computeMarketValue,
  executeTransfer,
  recalcWages,
  renewContract,
  suggestedWage,
  TransferOffer,
} from '../economy';
import { ensureValidLineup } from './lineup';

/**
 * Propostas de compra pelos jogadores do clube gerido — o motor de decisões.
 *
 * A cada semana, clubes da IA com dinheiro e necessidade podem fazer uma oferta
 * por um dos nossos jogadores. Jogadores na lista de transferências recebem
 * ofertas muito mais depressa e a um preço mais justo; os que NÃO estão à venda
 * só recebem propostas altas (têm de tentar o treinador).
 */

const BASE_BID_CHANCE = 0.05; // por jogador "cobiçável", por semana
const LISTED_BID_CHANCE = 0.5; // se estiver na lista de transferências
const BID_TTL_DAYS = 21; // as ofertas caducam em 3 semanas

/** Move a data ISO alguns dias. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Limpa itens obsoletos: propostas/pedidos caducados, itens de jogadores que
 * já saíram do clube e avisos de renovação já resolvidos (contrato estendido).
 */
export function pruneInbox(state: GameState): void {
  const today = state.meta.currentDate;
  const managedId = state.meta.managedClubId;
  state.inbox = state.inbox.filter((it) => {
    const p = state.players[it.playerId];
    if (!p || p.clubId !== managedId) return false;
    if (it.kind === 'BID' && it.expiresDate < today) return false;
    if (it.kind === 'REQUEST' && it.expiresDate < today) return false;
    // Renovado (via ficha ou inbox) → contractUntil já não é a época atual.
    if (it.kind === 'RENEWAL' && p.contractUntil !== state.meta.season) return false;
    return true;
  });
}

/**
 * Gera novas propostas pelos jogadores do clube gerido. Muta o inbox.
 * Determinístico por semana. Respeita MAX_ACTIVE_BIDS.
 */
export function generateIncomingBids(state: GameState, rng: Rng): BidItem[] {
  const managedId = state.meta.managedClubId;
  const club = state.clubs[managedId];
  if (!club) return [];

  const activeBids = state.inbox.filter((it): it is BidItem => it.kind === 'BID');
  if (activeBids.length >= MAX_ACTIVE_BIDS) return [];
  const alreadyBidPlayers = new Set(activeBids.map((b) => b.playerId));

  // Compradores possíveis: clubes com orçamento, ordenados por reputação.
  const buyers = Object.values(state.clubs)
    .filter((c) => c.id !== managedId)
    .map((c) => ({ club: c, fin: state.finances[c.id] }))
    .filter((c) => c.fin && c.fin.transferBudget > 500_000);

  const created: BidItem[] = [];

  for (const playerId of club.squad) {
    if (created.length + activeBids.length >= MAX_ACTIVE_BIDS) break;
    if (alreadyBidPlayers.has(playerId)) continue;

    const player = state.players[playerId];
    if (!player || player.condition.status === 'INJURED') continue;

    const ovr = naturalOverall(player);
    const listed = player.transferListed;
    // Só jogadores minimamente cobiçáveis atraem ofertas espontâneas.
    if (!listed && ovr < 11) continue;

    const chance = listed ? LISTED_BID_CHANCE : BASE_BID_CHANCE;
    if (!rng.chance(chance)) continue;

    // Escolhe um comprador plausível: reputação compatível e que o pagaria.
    const value = computeMarketValue(player, state.meta.season);
    const interested = buyers.filter((b) => {
      const wantOverall = 9 + Math.round((b.club.reputation / 100) * 8); // nível-alvo do clube
      const canAfford = (b.fin!.transferBudget) >= value * 0.9;
      return canAfford && ovr >= wantOverall - 3 && ovr <= wantOverall + 5;
    });
    if (interested.length === 0) continue;

    const buyer = rng.pick(interested);

    // Oferta: listado → 0.85..1.1×; não listado → 1.15..1.5× (tem de tentar).
    const mult = listed ? 0.85 + rng.next() * 0.25 : 1.15 + rng.next() * 0.35;
    const fee = Math.round((value * mult) / 10000) * 10000;
    const wageOffer = Math.round(suggestedWage(player, state.meta.season) * (1 + rng.next() * 0.3));

    const bid: BidItem = {
      kind: 'BID',
      id: `bid_${state.meta.season}_${deriveSeed(state.meta.rngSeed, playerId, state.meta.currentDate)}`,
      playerId,
      fromClubId: buyer.club.id,
      fee,
      wageOffer,
      createdDate: state.meta.currentDate,
      expiresDate: addDays(state.meta.currentDate, BID_TTL_DAYS),
    };
    state.inbox.unshift(bid);
    created.push(bid);
  }

  return created;
}

export interface BidDecision {
  ok: boolean;
  error?: string;
  fee?: number;
}

/**
 * Aceita uma proposta: vende o jogador ao clube comprador (reutiliza a lógica
 * testada de executeTransfer) e repõe um onze válido. Muta o estado.
 */
export function acceptBid(state: GameState, bidId: string): BidDecision {
  const bid = state.inbox.find((it): it is BidItem => it.kind === 'BID' && it.id === bidId);
  if (!bid) return { ok: false, error: 'Proposta já não está disponível.' };

  const player = state.players[bid.playerId];
  if (!player) return { ok: false, error: 'Jogador já não existe.' };

  const sellerId = player.clubId;
  const offer: TransferOffer = {
    playerId: bid.playerId,
    fromClubId: bid.fromClubId,
    fee: bid.fee,
    wageOffer: bid.wageOffer,
    contractYears: 4,
  };
  const res = executeTransfer(offer, state);
  if (!res.ok) return { ok: false, error: res.error };

  // O jogador sai da lista e o onze do vendedor é reposto.
  player.transferListed = false;
  if (sellerId) ensureValidLineup(sellerId, state.clubs[sellerId]?.squad ?? [], state.players, state.tactics);

  // Remove esta proposta e quaisquer outras pelo mesmo jogador.
  state.inbox = state.inbox.filter((it) => it.kind !== 'BID' || it.playerId !== bid.playerId);
  return { ok: true, fee: bid.fee };
}

/** Recusa (remove) uma proposta. */
export function rejectBid(state: GameState, bidId: string): void {
  state.inbox = state.inbox.filter((it) => !(it.kind === 'BID' && it.id === bidId));
}

/** Marca/desmarca um jogador na lista de transferências. */
export function setTransferListed(state: GameState, playerId: string, listed: boolean): void {
  const p = state.players[playerId];
  if (p) p.transferListed = listed;
}

/** Melhor oferta pendente por um jogador (para mostrar no ecrã do jogador). */
export function bidForPlayer(state: GameState, playerId: string): BidItem | null {
  const bids = state.inbox.filter((it): it is BidItem => it.kind === 'BID' && it.playerId === playerId);
  return bids.sort((a, b) => b.fee - a.fee)[0] ?? null;
}

/** Remove um item qualquer do inbox pelo id (dispensar aviso/pedido). */
export function dismissItem(state: GameState, itemId: string): void {
  state.inbox = state.inbox.filter((it) => it.id !== itemId);
}

/**
 * Itens que EXIGEM decisão antes de avançar a jornada.
 *
 * Sem isto o jogador carrega em "Avançar" indefinidamente e o jogo passa ao
 * lado dele. Propostas e pedidos caducam se ignorados, por isso obrigam a uma
 * resposta; os avisos de renovação são informativos e não bloqueiam.
 */
export function blockingItems(state: GameState): InboxItem[] {
  return state.inbox.filter((it) => it.kind === 'BID' || it.kind === 'REQUEST');
}

/** Descrição curta do que está a bloquear o avanço (para a UI). */
export function blockingReason(state: GameState): string | null {
  const items = blockingItems(state);
  if (items.length === 0) return null;
  const bids = items.filter((i) => i.kind === 'BID').length;
  const reqs = items.filter((i) => i.kind === 'REQUEST').length;
  const parts: string[] = [];
  if (bids > 0) parts.push(`${bids} proposta${bids > 1 ? 's' : ''} por resolver`);
  if (reqs > 0) parts.push(`${reqs} pedido${reqs > 1 ? 's' : ''} de jogadores`);
  return parts.join(' e ');
}

// ---------------------------------------------------------------------------
// Renovações — contratos que expiram no fim desta época
// ---------------------------------------------------------------------------

/**
 * Cria avisos de renovação para os jogadores do clube gerido em último ano de
 * contrato (contractUntil === época atual). Chamado uma vez por época, no
 * início (jornada 3). Prioriza os mais valiosos; respeita MAX_ACTIVE_RENEWALS.
 */
export function generateRenewalReminders(state: GameState): RenewalItem[] {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return [];

  const existing = new Set(
    state.inbox.filter((it) => it.kind === 'RENEWAL').map((it) => it.playerId),
  );

  const expiring = club.squad
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> =>
      !!p && p.contractUntil === state.meta.season && !existing.has(p.id))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, MAX_ACTIVE_RENEWALS - existing.size);

  const created: RenewalItem[] = [];
  for (const p of expiring) {
    const item: RenewalItem = {
      kind: 'RENEWAL',
      id: `ren_${state.meta.season}_${p.id}`,
      playerId: p.id,
      createdDate: state.meta.currentDate,
    };
    state.inbox.push(item);
    created.push(item);
  }
  return created;
}

export interface RenewalDecision {
  ok: boolean;
  error?: string;
  wage?: number;
}

/**
 * Resolve um aviso de renovação: renova ao salário pedido pelo jogador.
 * Em caso de sucesso o pruneInbox remove o aviso (contrato deixou de expirar);
 * removemos já para feedback imediato.
 */
export function resolveRenewal(state: GameState, itemId: string, years = 3): RenewalDecision {
  const item = state.inbox.find((it): it is RenewalItem => it.kind === 'RENEWAL' && it.id === itemId);
  if (!item) return { ok: false, error: 'Aviso já não está disponível.' };
  const player = state.players[item.playerId];
  if (!player) return { ok: false, error: 'Jogador já não existe.' };

  const wage = suggestedWage(player, state.meta.season);
  const res = renewContract(item.playerId, years, wage, state);
  if (!res.ok) return { ok: false, error: res.error };

  state.inbox = state.inbox.filter((it) => it.id !== itemId);
  return { ok: true, wage };
}

// ---------------------------------------------------------------------------
// Pedidos dos jogadores — moral baixa gera exigências
// ---------------------------------------------------------------------------

const REQUEST_TTL_DAYS = 14;
const WAGE_RISE_MORALE = 40; // abaixo disto pode pedir aumento
const WANTS_LEAVE_MORALE = 25; // abaixo disto pode pedir para sair

/**
 * Gera pedidos de jogadores insatisfeitos do clube gerido. Moral < 40 →
 * possível pedido de aumento; moral < 25 → possível pedido de saída.
 * Muta o inbox; respeita MAX_ACTIVE_REQUESTS.
 */
export function generatePlayerRequests(state: GameState, rng: Rng): RequestItem[] {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return [];

  const active = state.inbox.filter((it): it is RequestItem => it.kind === 'REQUEST');
  const pending = new Set(active.map((r) => r.playerId));
  const created: RequestItem[] = [];

  for (const id of club.squad) {
    if (active.length + created.length >= MAX_ACTIVE_REQUESTS) break;
    if (pending.has(id)) continue;
    const p = state.players[id];
    if (!p) continue;

    const morale = p.condition.morale;
    let request: RequestItem['request'] | null = null;
    if (morale < WANTS_LEAVE_MORALE && rng.chance(0.25)) request = 'WANTS_LEAVE';
    else if (morale < WAGE_RISE_MORALE && rng.chance(0.15)) request = 'WAGE_RISE';
    if (!request) continue;

    const item: RequestItem = {
      kind: 'REQUEST',
      id: `req_${state.meta.season}_${p.id}_${state.meta.currentDate}`,
      playerId: p.id,
      request,
      createdDate: state.meta.currentDate,
      expiresDate: addDays(state.meta.currentDate, REQUEST_TTL_DAYS),
    };
    state.inbox.unshift(item);
    created.push(item);
  }
  return created;
}

/**
 * Resolve um pedido. As consequências mexem na moral (que alimenta a força da
 * equipa) — decisões com peso real:
 *  - Aumento aceite: salário sobe ~25%, moral recupera. Recusado: moral cai.
 *  - Saída aceite: entra na lista de transferências, moral alivia. Recusado: moral cai mais.
 * Devolve a mensagem para a UI, ou null se o item não existir.
 */
export function resolveRequest(state: GameState, itemId: string, accept: boolean): string | null {
  const item = state.inbox.find((it): it is RequestItem => it.kind === 'REQUEST' && it.id === itemId);
  if (!item) return null;
  const player = state.players[item.playerId];
  state.inbox = state.inbox.filter((it) => it.id !== itemId);
  if (!player) return null;

  const clamp = (v: number) => Math.max(5, Math.min(95, v));
  const name = `${player.firstName} ${player.lastName}`;

  if (item.request === 'WAGE_RISE') {
    if (accept) {
      const newWage = Math.max(
        Math.round((player.wage * 1.25) / 100) * 100,
        suggestedWage(player, state.meta.season),
      );
      player.wage = newWage;
      player.condition.morale = clamp(65);
      const club = state.clubs[state.meta.managedClubId];
      const fin = state.finances[state.meta.managedClubId];
      if (club && fin) recalcWages(club, fin, state.players);
      return `${name} aceitou o novo salário (${newWage.toLocaleString('pt-PT')} €/sem) e está motivado.`;
    }
    player.condition.morale = clamp(player.condition.morale - 8);
    return `${name} não gostou da recusa — a moral caiu.`;
  }

  // WANTS_LEAVE
  if (accept) {
    player.transferListed = true;
    player.condition.morale = clamp(55);
    return `${name} foi colocado na lista de transferências, aliviado.`;
  }
  player.condition.morale = clamp(player.condition.morale - 10);
  return `${name} continua no plantel contrariado — a moral caiu.`;
}
