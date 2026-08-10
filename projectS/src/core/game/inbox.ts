import {
  BidItem,
  CrisisItem,
  GameState,
  InboxItem,
  Player,
  MAX_ACTIVE_BIDS,
  MAX_ACTIVE_REQUESTS,
  naturalOverall,
  RenewalItem,
  RequestItem,
  silenceRequests,
} from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import {
  canSpend,
  computeMarketValue,
  DISTRESS_SALE_RATE,
  moveMoney,
  executeTransfer,
  isInsolvent,
  withinDivisionCap,
  MAX_SELL_ON,
  recalcWages,
  renewContract,
  sellOnFeeFactor,
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
    // As propostas NOSSAS referem jogadores de outros clubes — têm ciclo de
    // vida próprio (pruneOffers), por isso escapam ao filtro do plantel.
    if (it.kind === 'OFFER') return true;
    // A crise financeira não se refere a UM jogador — mantém-se até ser
    // decidida (ou até as contas melhorarem sozinhas, ex.: prémio de jogo).
    if (it.kind === 'CRISIS') {
      const fin = state.finances[managedId];
      if (!fin) return false;
      // Já não é preciso se o clube deixou de estar sem caixa a perder dinheiro
      // (uma venda, um prémio de jogo ou um corte de salários resolveu).
      if (!isInsolvent(fin)) return false;
      it.candidates = it.candidates.filter((id) => state.players[id]?.clubId === managedId);
      return it.candidates.length > 0;
    }
    const p = state.players[it.playerId];
    if (!p || p.clubId !== managedId) return false;
    if (it.kind === 'BID' && it.expiresDate < today) return false;
    // O comprador ainda TEM o dinheiro? Uma proposta fica semanas na caixa e
    // entretanto o clube gasta a verba noutro lado. Sem esta limpeza, o
    // "Vender" chamava um `executeTransfer` condenado a falhar — e o botão
    // parecia avariado. Melhor a proposta desaparecer do que enganar.
    if (it.kind === 'BID') {
      const buyerFin = state.finances[it.fromClubId];
      if (!buyerFin || buyerFin.transferBudget < it.fee) return false;
      if (!canSpend(buyerFin, it.fee)) return false;
    }
    if (it.kind === 'REQUEST' && it.expiresDate < today) {
      // Ignorado até caducar: o jogador não volta à carga na semana seguinte.
      silenceRequests(p.condition, today, REQUEST_IGNORED_COOLDOWN_DAYS);
      return false;
    }
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
    .filter((c) => c.id !== managedId && !c.european)
    .map((c) => ({ club: c, fin: state.finances[c.id] }))
    .filter((c) => c.fin && c.fin.transferBudget > 500_000);

  const created: BidItem[] = [];

  for (const playerId of club.squad) {
    if (created.length + activeBids.length >= MAX_ACTIVE_BIDS) break;
    if (alreadyBidPlayers.has(playerId)) continue;

    const player = state.players[playerId];
    if (!player || player.condition.status === 'INJURED') continue;
    // Emprestado: o passe é do dono, não temos nada para vender. Sem isto
    // chegava uma proposta que depois não dava para concretizar.
    if (player.condition.loanOwnerId) continue;

    const ovr = naturalOverall(player);
    const listed = player.transferListed;
    // Só jogadores minimamente cobiçáveis atraem ofertas espontâneas.
    if (!listed && ovr < 11) continue;

    const chance = listed ? LISTED_BID_CHANCE : BASE_BID_CHANCE;
    if (!rng.chance(chance)) continue;

    // O PREÇO PRIMEIRO, o comprador depois.
    //
    // Antes escolhia-se o comprador por ele aguentar 90% do valor de mercado e
    // só a seguir se sorteava a oferta, que podia chegar a 150% — resultado: a
    // proposta entrava no inbox, o utilizador carregava em "Vender" e o
    // `executeTransfer` recusava por falta de verba. Como a UI só mostrava
    // mensagem em caso de sucesso, o botão parecia simplesmente não funcionar
    // (queixa repetida do playtest). Agora o comprador tem de conseguir pagar
    // EXATAMENTE o que vai propor, passe e ordenado.
    const value = computeMarketValue(player, state.meta.season);
    const mult = listed ? 0.85 + rng.next() * 0.25 : 1.15 + rng.next() * 0.35;
    const fee = Math.round((value * mult) / 10000) * 10000;
    const wageOffer = Math.round(suggestedWage(player, state.meta.season) * (1 + rng.next() * 0.3));

    const interested = buyers.filter((b) => {
      const fin = b.fin!;
      const wantOverall = 9 + Math.round((b.club.reputation / 100) * 8); // nível-alvo do clube
      if (ovr < wantOverall - 3 || ovr > wantOverall + 5) return false;
      if (fin.transferBudget < fee) return false;
      // Verba autoriza, caixa paga: sem as duas, o "Vender" voltava a falhar.
      if (!canSpend(fin, fee)) return false;
      if (isInsolvent(fin)) return false;
      const tier = state.leagues[b.club.leagueId]?.tier ?? 1;
      return withinDivisionCap(fin, tier, wageOffer);
    });
    if (interested.length === 0) continue;

    const buyer = rng.pick(interested);

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

/**
 * Acima deste múltiplo do valor de mercado a cláusula é dissuasora: os clubes
 * da IA nem tentam. Abaixo, é uma pechincha e alguém a vai pagar.
 */
export const CLAUSE_TRIGGER_MULTIPLE = 1.5;

/** Um jogador nosso levado por pagamento da cláusula de rescisão. */
export interface ClauseSale { playerId: string; playerName: string; buyerName: string; fee: number }

/**
 * A IA paga cláusulas de rescisão BARATAS dos nossos jogadores.
 *
 * É a outra face da cláusula: pô-la baixa desconta no ordenado, mas qualquer
 * clube com dinheiro leva o jogador sem sequer pedir licença — não passa pelo
 * inbox porque, na vida real, não há nada a decidir. Só dispara quando a
 * cláusula está abaixo de `CLAUSE_TRIGGER_MULTIPLE` do valor de mercado, ou
 * seja, quando a pechincha foi mesmo escolha nossa.
 */
export function triggerReleaseClauses(state: GameState, rng: Rng): ClauseSale[] {
  const managedId = state.meta.managedClubId;
  const club = state.clubs[managedId];
  if (!club) return [];

  const sales: ClauseSale[] = [];
  for (const playerId of [...club.squad]) {
    const player = state.players[playerId];
    const clause = player?.clauses?.releaseClause;
    if (!player || !clause || clause <= 0) continue;
    if (player.condition.loanOwnerId) continue; // o passe não é nosso

    const value = computeMarketValue(player, state.meta.season);
    if (clause > value * CLAUSE_TRIGGER_MULTIPLE) continue; // bem protegido

    // Quem tem dinheiro para a cláusula E interesse no nível do jogador.
    const ovr = naturalOverall(player);
    const buyers = Object.values(state.clubs)
      .filter((c) => c.id !== managedId && !c.european)
      .map((c) => ({ club: c, fin: state.finances[c.id] }))
      .filter((b) => {
        if (!b.fin || b.fin.transferBudget < clause) return false;
        const wantOverall = 9 + Math.round((b.club.reputation / 100) * 8);
        return ovr >= wantOverall - 2 && ovr <= wantOverall + 5;
      });
    if (buyers.length === 0) continue;
    if (!rng.chance(0.35)) continue; // não é toda a semana

    const buyer = rng.pick(buyers);
    const offer: TransferOffer = {
      playerId,
      fromClubId: buyer.club.id,
      fee: clause,
      wageOffer: Math.round(suggestedWage(player, state.meta.season) * 1.15),
      contractYears: 4,
    };
    const res = executeTransfer(offer, state);
    if (!res.ok) continue;

    sales.push({
      playerId,
      playerName: `${player.firstName} ${player.lastName}`,
      buyerName: buyer.club.name,
      fee: clause,
    });
    state.inbox = state.inbox.filter((it) => it.kind !== 'BID' || it.playerId !== playerId);
    ensureValidLineup(managedId, state.clubs[managedId]?.squad ?? [], state.players, state.tactics);
  }
  return sales;
}

export interface BidDecision {
  ok: boolean;
  error?: string;
  fee?: number;
  /** % de futura venda que ficou registada (0 se não se pediu nenhuma). */
  sellOn?: number;
}

/**
 * Aceita uma proposta: vende o jogador ao clube comprador (reutiliza a lógica
 * testada de executeTransfer) e repõe um onze válido. Muta o estado.
 *
 * `sellOn` (0..0.3) troca dinheiro hoje por uma fatia da PRÓXIMA venda: o
 * comprador desconta metade da percentagem no passe (ver `sellOnFeeFactor`).
 * Vender um jovem a 20% de futura venda é abdicar de 10% agora para apanhar
 * 20% se ele explodir — é a aposta.
 */
export function acceptBid(state: GameState, bidId: string, sellOn = 0): BidDecision {
  const bid = state.inbox.find((it): it is BidItem => it.kind === 'BID' && it.id === bidId);
  if (!bid) return { ok: false, error: 'Proposta já não está disponível.' };

  const player = state.players[bid.playerId];
  if (!player) return { ok: false, error: 'Jogador já não existe.' };

  const pct = Math.max(0, Math.min(MAX_SELL_ON, sellOn));
  const fee = Math.round((bid.fee * sellOnFeeFactor(pct)) / 1000) * 1000;

  const sellerId = player.clubId;
  const offer: TransferOffer = {
    playerId: bid.playerId,
    fromClubId: bid.fromClubId,
    fee,
    wageOffer: bid.wageOffer,
    contractYears: 4,
  };
  const res = executeTransfer(offer, state);
  if (!res.ok) return { ok: false, error: res.error };

  // A cláusula de futura venda entra DEPOIS da transferência: o executeTransfer
  // acabou de reescrever as cláusulas com as do novo contrato.
  if (pct > 0 && sellerId) {
    player.clauses = { ...(player.clauses ?? {}), sellOn: pct, sellOnClubId: sellerId };
  }

  // O jogador sai da lista e o onze do vendedor é reposto.
  player.transferListed = false;
  if (sellerId) ensureValidLineup(sellerId, state.clubs[sellerId]?.squad ?? [], state.players, state.tactics);

  // Remove esta proposta e quaisquer outras pelo mesmo jogador.
  state.inbox = state.inbox.filter((it) => it.kind !== 'BID' || it.playerId !== bid.playerId);
  return { ok: true, fee, sellOn: pct };
}

/** Recusa (remove) uma proposta. */
export function rejectBid(state: GameState, bidId: string): void {
  state.inbox = state.inbox.filter((it) => !(it.kind === 'BID' && it.id === bidId));
}

/** Quanto se pode exigir acima da proposta antes de o comprador desistir. */
export const COUNTER_MAX_MULTIPLIER = 1.6;

export interface CounterResult {
  ok: boolean;
  /** Nova proposta (aceite pelo comprador) ou 0 se desistiu. */
  fee: number;
  messageKey: string;
  messageParams?: import('../i18n').MsgParams;
}

/**
 * CONTRAPROPOSTA a uma oferta recebida — exigir mais dinheiro pelo jogador.
 *
 * Os clubes da IA atiravam propostas muito abaixo do valor e a única resposta
 * possível era aceitar ou recusar. Agora dá para pedir mais, tal como eles
 * pedem aumentos ao treinador. O comprador aceita até um limite ligado ao valor
 * REAL do jogador e à sua vontade de o ter; acima disso desiste e a proposta
 * desaparece — pedir de mais tem custo.
 */
export function counterBid(state: GameState, bidId: string, askedFee: number): CounterResult {
  const bid = state.inbox.find((it): it is BidItem => it.kind === 'BID' && it.id === bidId);
  if (!bid) return { ok: false, fee: 0, messageKey: 'bid.counter.gone' };
  const player = state.players[bid.playerId];
  if (!player) return { ok: false, fee: 0, messageKey: 'bid.counter.gone' };

  const name = `${player.firstName} ${player.lastName}`;
  const ceiling = Math.max(bid.fee, Math.round(player.marketValue * 1.25));
  const hardCap = Math.round(bid.fee * COUNTER_MAX_MULTIPLIER);
  // O comprador também tem de TER o dinheiro: sem isto, pedir mais gerava uma
  // proposta impossível de concretizar e o "Vender" falhava em silêncio.
  // Verba E caixa — com a carteira única a verba é uma fatia do saldo, mas o
  // passe sai do saldo inteiro, por isso os dois travões continuam a valer.
  const buyerFin = state.finances[bid.fromClubId];
  const budget = Math.min(buyerFin?.transferBudget ?? 0, buyerFin?.balance ?? 0);
  const accepted = askedFee <= Math.min(ceiling, hardCap, budget);

  state.inbox = state.inbox.filter((it) => it.id !== bidId);
  if (!accepted) {
    return { ok: false, fee: 0, messageKey: 'bid.counter.walked', messageParams: { name } };
  }

  const fee = Math.round(askedFee / 1000) * 1000;
  const item: BidItem = { ...bid, id: `${bid.id}_c`, fee };
  state.inbox.unshift(item);
  return {
    ok: true, fee, messageKey: 'bid.counter.accepted',
    messageParams: { name, fee: fee.toLocaleString('pt-PT') },
  };
}

// ---------------------------------------------------------------------------
// CRISE FINANCEIRA — o dilema em vez da venda silenciosa
// ---------------------------------------------------------------------------

/** Quantos candidatos à venda são apresentados ao treinador. */
export const CRISIS_CANDIDATES = 4;
/** Plantel nunca desce abaixo disto por causa de uma venda de aflição. */
const CRISIS_MIN_SQUAD = 12;

/**
 * Quem a direção põe em cima da mesa numa crise: os ativos mais valiosos FORA
 * do onze primeiro (é o que um clube em aflição vende), e só depois titulares,
 * se não houver mais nada para vender.
 */
export function saleCandidates(state: GameState, clubId: string, count = CRISIS_CANDIDATES): Player[] {
  const club = state.clubs[clubId];
  if (!club || club.squad.length <= CRISIS_MIN_SQUAD) return [];
  const lineup = new Set((state.tactics[clubId]?.lineup ?? []).map((s) => s.playerId));
  const byValue = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p && !p.condition.loanOwnerId)
    .sort((a, b) => b.marketValue - a.marketValue);
  const bench = byValue.filter((p) => !lineup.has(p.id));
  const starters = byValue.filter((p) => lineup.has(p.id));
  return [...bench, ...starters].slice(0, count);
}

/**
 * Abre o dilema de crise para o clube gerido quando a semana NÃO fechou, e
 * ainda não houver um em aberto. Devolve o item criado (ou null).
 *
 * O item BLOQUEIA o avanço da jornada: é uma decisão que não se adia, mas é
 * decisão — a direção deixou de despachar o melhor jogador sem avisar.
 *
 * @param shortfall quanto ficou por pagar (de `applyWeeklyFinances`). Antes o
 *   gatilho era um saldo negativo abaixo de um limite; como o saldo já não fica
 *   negativo, o que dispara agora é o clube não ter conseguido pagar salários.
 */
export function ensureFinancialCrisis(state: GameState, shortfall: number): CrisisItem | null {
  const managedId = state.meta.managedClubId;
  const fin = state.finances[managedId];
  if (!fin) return null;
  if (state.inbox.some((it) => it.kind === 'CRISIS')) return null;
  const debt = Math.round(shortfall);
  if (debt <= 0) return null;

  const candidates = saleCandidates(state, managedId);
  if (candidates.length === 0) return null; // plantel no osso: não há o que vender

  const item: CrisisItem = {
    kind: 'CRISIS',
    id: `crisis_${state.meta.season}_${state.meta.currentDate}`,
    candidates: candidates.map((p) => p.id),
    debt: Math.round(debt),
    createdDate: state.meta.currentDate,
  };
  state.inbox.unshift(item);
  return item;
}

export interface CrisisResult {
  ok: boolean;
  amount: number;
  playerName?: string;
  errorKey?: string;
}

/** Vende o jogador escolhido pelo treinador (preço de aflição) e fecha o dilema. */
export function resolveCrisis(state: GameState, itemId: string, playerId: string): CrisisResult {
  const item = state.inbox.find((it): it is CrisisItem => it.kind === 'CRISIS' && it.id === itemId);
  if (!item) return { ok: false, amount: 0, errorKey: 'crisis.err.gone' };
  if (!item.candidates.includes(playerId)) return { ok: false, amount: 0, errorKey: 'crisis.err.invalid' };

  const player = state.players[playerId];
  const managedId = state.meta.managedClubId;
  const club = state.clubs[managedId];
  const fin = state.finances[managedId];
  if (!player || !club || !fin) return { ok: false, amount: 0, errorKey: 'crisis.err.invalid' };

  const amount = Math.round(player.marketValue * DISTRESS_SALE_RATE);
  club.squad = club.squad.filter((id) => id !== playerId);
  player.clubId = null;
  player.contractUntil = null;
  player.transferListed = false;
  moveMoney(fin, amount);
  recalcWages(club, fin, state.players);
  ensureValidLineup(managedId, club.squad, state.players, state.tactics);

  state.inbox = state.inbox.filter((it) => it.id !== itemId);
  return { ok: true, amount, playerName: `${player.firstName} ${player.lastName}` };
}

/** Marca/desmarca um jogador na lista de transferências. */
export function setTransferListed(state: GameState, playerId: string, listed: boolean): void {
  const p = state.players[playerId];
  if (!p) return;
  // Não se pode listar um jogador emprestado (recebido) — o passe não é nosso.
  if (listed && p.condition.loanOwnerId) return;
  p.transferListed = listed;
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
  return state.inbox.filter((it) =>
    it.kind === 'BID' ||
    it.kind === 'REQUEST' ||
    // Crise financeira: tem de se decidir de quem nos livramos antes de seguir.
    it.kind === 'CRISIS' ||
    // Contra-proposta nossa: o vendedor pôs um preço e espera resposta.
    // (Propostas PENDING não bloqueiam — é precisamente avançar que as resolve.)
    (it.kind === 'OFFER' && it.status === 'COUNTER'));
}

/** Contagens do que bloqueia o avanço, para a UI compor o texto traduzido. */
export interface BlockingCounts { bids: number; reqs: number; counters: number; crisis: number; }
export function blockingCounts(state: GameState): BlockingCounts | null {
  const items = blockingItems(state);
  if (items.length === 0) return null;
  return {
    bids: items.filter((i) => i.kind === 'BID').length,
    reqs: items.filter((i) => i.kind === 'REQUEST').length,
    counters: items.filter((i) => i.kind === 'OFFER').length,
    crisis: items.filter((i) => i.kind === 'CRISIS').length,
  };
}

/** Descrição curta do que está a bloquear o avanço (PT — usado em testes). */
export function blockingReason(state: GameState): string | null {
  const items = blockingItems(state);
  if (items.length === 0) return null;
  const bids = items.filter((i) => i.kind === 'BID').length;
  const reqs = items.filter((i) => i.kind === 'REQUEST').length;
  const counters = items.filter((i) => i.kind === 'OFFER').length;
  const parts: string[] = [];
  if (items.some((i) => i.kind === 'CRISIS')) parts.push('crise financeira por resolver');
  if (bids > 0) parts.push(`${bids} proposta${bids > 1 ? 's' : ''} por resolver`);
  if (reqs > 0) parts.push(`${reqs} pedido${reqs > 1 ? 's' : ''} de jogadores`);
  if (counters > 0) parts.push(`${counters} contra-proposta${counters > 1 ? 's' : ''}`);
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

  // TODOS os jogadores em fim de contrato recebem aviso — nenhum sai em silêncio.
  // (Antes limitava a MAX_ACTIVE_RENEWALS=4, e os restantes desapareciam sem
  // que o utilizador pudesse renovar. Agora avisa o plantel todo que expira.)
  const expiring = club.squad
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> =>
      !!p && p.contractUntil === state.meta.season && !existing.has(p.id))
    .sort((a, b) => b.marketValue - a.marketValue);

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
/** Silêncio depois de um pedido RESOLVIDO (aceite ou recusado). */
const REQUEST_COOLDOWN_DAYS = 56;
/** Silêncio depois de um pedido IGNORADO até caducar (metade — insistir é justo). */
const REQUEST_IGNORED_COOLDOWN_DAYS = 28;

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

    // Em silêncio (assinou há pouco, ou já pediu recentemente).
    if (p.condition.requestCooldownUntil && p.condition.requestCooldownUntil > state.meta.currentDate) continue;

    // CONFIANÇA: quem acredita no treinador não vai bater à porta por tudo e
    // por nada; quem foi enganado numa promessa vem mais depressa. É o que dá
    // consequência real às conversas (`core/game/relations.ts`).
    const trust = p.condition.relation?.trust ?? 0;
    if (trust >= 50) continue;
    const trustScale = Math.max(0.4, Math.min(1.6, 1 - trust / 100));

    const morale = p.condition.morale;
    let request: RequestItem['request'] | null = null;
    if (morale < WANTS_LEAVE_MORALE && rng.chance(0.25 * trustScale)) request = 'WANTS_LEAVE';
    // Só pede aumento quem ganha ABAIXO do mercado. Um jogador bem pago e
    // desmotivado quer jogar, não mais dinheiro — pedir aumento era um não-senso
    // e enchia o inbox de pedidos impossíveis de satisfazer.
    else if (morale < WAGE_RISE_MORALE && p.wage < suggestedWage(p, state.meta.season) * 0.95
      && rng.chance(0.15 * trustScale)) request = 'WAGE_RISE';
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
export function resolveRequest(state: GameState, itemId: string, accept: boolean): import('../i18n').Msg | null {
  const item = state.inbox.find((it): it is RequestItem => it.kind === 'REQUEST' && it.id === itemId);
  if (!item) return null;
  const player = state.players[item.playerId];
  state.inbox = state.inbox.filter((it) => it.id !== itemId);
  if (!player) return null;

  const clamp = (v: number) => Math.max(5, Math.min(95, v));
  const name = `${player.firstName} ${player.lastName}`;
  // Resolvido é resolvido: o assunto fica arrumado por umas semanas. Sem isto,
  // recusar baixava a moral e o mesmo jogador voltava a pedir logo a seguir —
  // uma espiral de pedidos impossível de travar (queixa do playtest).
  silenceRequests(player.condition, state.meta.currentDate, REQUEST_COOLDOWN_DAYS);

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
      return { key: 'req.wageAccepted', params: { name, wage: newWage.toLocaleString('pt-PT') } };
    }
    player.condition.morale = clamp(player.condition.morale - 8);
    return { key: 'req.wageRefused', params: { name } };
  }

  // WANTS_LEAVE
  if (accept) {
    player.transferListed = true;
    player.condition.morale = clamp(55);
    return { key: 'req.leaveAccepted', params: { name } };
  }
  player.condition.morale = clamp(player.condition.morale - 10);
  return { key: 'req.leaveRefused', params: { name } };
}
