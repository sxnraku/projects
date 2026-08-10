import {
  GameState,
  MAX_ACTIVE_OFFERS,
  OfferItem,
  OfferStatus,
  Player,
} from '../models';
import {
  checkInterest,
  playerStanding,
  evaluateOffer,
  executeTransfer,
  TransferOffer,
} from '../economy';
import { deriveSeed } from '../engine/rng';
import { ensureValidLineup } from './lineup';

/**
 * Propostas NOSSAS — negociação com espera.
 *
 * Antes, carregar em "Enviar proposta" devolvia a resposta na mesma fração de
 * segundo: o mercado sentia-se uma loja com prateleira aberta. Agora a proposta
 * fica pendente e só é avaliada quando a jornada avança, o que obriga a simular
 * para saber o desfecho e trava o ritmo de clicker.
 *
 * O dinheiro NÃO sai na submissão (a transferência pode falhar), mas o valor
 * fica reservado: sem isso era possível enviar cinco propostas com o mesmo
 * orçamento e ver as cinco aceites na mesma semana.
 */

/** Dias de jogo até a resposta chegar (uma jornada). */
const RESPONSE_DELAY_DAYS = 7;
/** Quanto tempo uma resposta já lida fica no inbox antes de desaparecer. */
const RESOLVED_TTL_DAYS = 10;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Todas as propostas nossas presentes no inbox. */
export function outgoingOffers(state: GameState): OfferItem[] {
  return state.inbox.filter((it): it is OfferItem => it.kind === 'OFFER');
}

/** Propostas ainda por responder (ou com contra-proposta em aberto). */
export function activeOffers(state: GameState): OfferItem[] {
  return outgoingOffers(state).filter(
    (o) => o.status === 'PENDING' || o.status === 'COUNTER',
  );
}

/**
 * Orçamento já comprometido em propostas em curso. Subtrai-se ao orçamento
 * disponível para impedir gastar o mesmo dinheiro duas vezes.
 */
export function reservedBudget(state: GameState): number {
  return activeOffers(state).reduce((sum, o) => sum + o.fee + o.signingBonus, 0);
}

/** Orçamento realmente disponível para uma nova proposta. */
export function availableBudget(state: GameState): number {
  const fin = state.finances[state.meta.managedClubId];
  if (!fin) return 0;
  return Math.max(0, fin.transferBudget - reservedBudget(state));
}

/**
 * Até onde o clube gerido pode ir com este jogador.
 *
 *  - OPEN:   negoceia normalmente.
 *  - BONUS:  desce de nível, mas só com prémio de assinatura — e o clube TEM
 *            dinheiro para o pagar (senão seria uma proposta condenada).
 *  - LOCKED: fora de alcance. A UI mostra "Sem interesse" e nem abre a
 *            negociação, em vez de deixar o jogador perder uma semana à espera
 *            de uma recusa garantida.
 */
export const Reach = { OPEN: 'OPEN', BONUS: 'BONUS', LOCKED: 'LOCKED' } as const;
export type Reach = (typeof Reach)[keyof typeof Reach];

export interface Reachability {
  status: Reach;
  requiredSigningBonus: number;
  reasonKey: string;
  reasonParams?: import('../i18n').MsgParams;
}

export function reachability(state: GameState, player: Player): Reachability {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return { status: 'LOCKED', requiredSigningBonus: 0, reasonKey: 'interest.open' };

  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  const interest = checkInterest(player, club, tier, playerStanding(player, state.clubs, state.leagues));

  if (interest.interested) {
    return { status: 'OPEN', requiredSigningBonus: 0, reasonKey: interest.reasonKey, reasonParams: interest.reasonParams };
  }
  const bonus = interest.requiredSigningBonus;
  if (Number.isFinite(bonus) && bonus <= availableBudget(state)) {
    return { status: 'BONUS', requiredSigningBonus: bonus, reasonKey: interest.reasonKey, reasonParams: interest.reasonParams };
  }
  return {
    status: 'LOCKED',
    requiredSigningBonus: Number.isFinite(bonus) ? bonus : 0,
    reasonKey: Number.isFinite(bonus) ? 'reach.lockedBonus' : interest.reasonKey,
    reasonParams: Number.isFinite(bonus)
      ? { name: player.lastName, bonus: bonus.toLocaleString('pt-PT') }
      : interest.reasonParams,
  };
}

/** Atalho: o clube pode sequer abrir negociação por este jogador? */
export function isReachable(state: GameState, player: Player): boolean {
  return reachability(state, player).status !== 'LOCKED';
}

/** Quantos alvos fora de alcance (aspiracionais) mostrar no fim da lista. */
export const LOCKED_SHOWN = 6;

/**
 * Fatia máxima da lista ocupada por jogadores que já cabem no orçamento.
 *
 * Sem este teto, um clube com dinheiro enchia os 120 lugares só com alvos
 * acessíveis: o mercado parecia sempre o mesmo e o filtro "ao meu alcance" não
 * mudava nada, porque nunca havia lá nada FORA do alcance para esconder
 * (queixa do playtest). Reservar espaço para os caros dá horizonte à lista.
 */
export const AFFORDABLE_SHARE = 0.6;

export interface MarketEntry {
  player: Player;
  reach: Reachability;
  affordable: boolean; // o passe cabe no orçamento livre AGORA?
}

/**
 * Lista de scouting ordenada pelo que o clube gerido REALMENTE pode assinar.
 *
 * Ordem: primeiro os que estão ao alcance E dentro do ORÇAMENTO (do mais caro
 * que consegues pagar para baixo — não os inatingíveis no topo), depois os ao
 * alcance mas caros (aspiração), e só um punhado de "sem interesse" no fim.
 * Antes a lista enchia-se de jogadores fora do orçamento; agora os que podes
 * mesmo contratar lideram. A UI filtra/ordena por cima disto.
 */
export function marketShortlist(state: GameState, limit = 120): MarketEntry[] {
  const managedId = state.meta.managedClubId;
  const budget = availableBudget(state);
  // Inclui AGENTES LIVRES (clubId null): custam 0 de passe e são a resposta
  // natural ao "mercado seco" das épocas avançadas — antes estavam de fora e o
  // jogador nem sabia que existiam.
  const entries: MarketEntry[] = Object.values(state.players)
    .filter((p) => p.clubId !== managedId && (!p.clubId || !state.clubs[p.clubId]?.european))
    .filter((p) => !p.condition.loanOwnerId) // emprestados não estão à venda
    .map((player) => ({
      player,
      reach: reachability(state, player),
      affordable: (player.clubId ? player.marketValue : 0) <= budget,
    }));

  const byValue = (a: MarketEntry, b: MarketEntry) => b.player.marketValue - a.player.marketValue;

  const reachable = entries.filter((e) => e.reach.status !== 'LOCKED');
  const affordable = reachable.filter((e) => e.affordable).sort(byValue);
  const pricey = reachable.filter((e) => !e.affordable).sort(byValue);
  const locked = entries.filter((e) => e.reach.status === 'LOCKED').sort(byValue).slice(0, LOCKED_SHOWN);

  // Quotas: os acessíveis lideram mas não ocupam a lista toda; o que sobrar de
  // uma categoria é reaproveitado pelas outras, para a lista vir sempre cheia.
  const lockedShown = locked.slice(0, LOCKED_SHOWN);
  const budgetForReachable = Math.max(0, limit - lockedShown.length);
  const affordableSlots = Math.min(affordable.length, Math.floor(budgetForReachable * AFFORDABLE_SHARE));
  const priceyShown = pricey.slice(0, budgetForReachable - affordableSlots);
  const affordableShown = affordable.slice(0, budgetForReachable - priceyShown.length);

  return [...affordableShown, ...priceyShown, ...lockedShown].slice(0, limit);
}

export interface SubmitResult {
  ok: boolean;
  errorKey?: string; // chave i18n (a UI traduz)
  errorParams?: import('../i18n').MsgParams;
  item?: OfferItem;
}

/**
 * Envia uma proposta. Não decide nada — só valida o que o clube gerido controla
 * (orçamento, número de propostas em curso) e agenda a resposta.
 */
export function submitPendingOffer(state: GameState, offer: TransferOffer): SubmitResult {
  const player = state.players[offer.playerId];
  if (!player) return { ok: false, errorKey: 'submit.unavailable' };
  // AGENTE LIVRE: não há clube com quem negociar — assina-se na hora, só pelo
  // ordenado. Sem este ramo os livres apareciam na lista e não dava para nada.
  if (!player.clubId) {
    const res = executeTransfer({ ...offer, fee: 0 }, state);
    if (res.ok) return { ok: true };
    // O erro REAL (teto salarial, insolvência) em vez de "jogador
    // indisponível": o utilizador via essa mensagem em metade do mercado e não
    // fazia ideia de que o problema era a folha salarial do próprio clube.
    return { ok: false, errorKey: 'submit.failed', errorParams: { reason: res.error ?? '' } };
  }
  if (player.clubId === state.meta.managedClubId) {
    return { ok: false, errorKey: 'submit.own' };
  }
  if (activeOffers(state).some((o) => o.playerId === offer.playerId)) {
    return { ok: false, errorKey: 'submit.duplicate' };
  }
  if (activeOffers(state).length >= MAX_ACTIVE_OFFERS) {
    return { ok: false, errorKey: 'submit.max', errorParams: { n: MAX_ACTIVE_OFFERS } };
  }
  const signingBonus = Math.max(0, offer.signingBonus ?? 0);
  if (offer.fee + signingBonus > availableBudget(state)) {
    return {
      ok: false,
      errorKey: 'submit.budget',
      errorParams: { v: availableBudget(state).toLocaleString('pt-PT') + ' €' },
    };
  }

  const item: OfferItem = {
    kind: 'OFFER',
    id: `off_${state.meta.season}_${deriveSeed(state.meta.rngSeed, offer.playerId, state.meta.currentDate)}`,
    playerId: offer.playerId,
    toClubId: player.clubId,
    fee: offer.fee,
    wageOffer: offer.wageOffer,
    contractYears: offer.contractYears,
    signingBonus,
    status: 'PENDING',
    createdDate: state.meta.currentDate,
    respondDate: addDays(state.meta.currentDate, RESPONSE_DELAY_DAYS),
  };
  state.inbox.unshift(item);
  return { ok: true, item };
}

/** Converte um OfferItem na proposta que o motor de transferências entende. */
function toTransferOffer(state: GameState, item: OfferItem): TransferOffer {
  return {
    playerId: item.playerId,
    fromClubId: state.meta.managedClubId,
    fee: item.fee,
    wageOffer: item.wageOffer,
    contractYears: item.contractYears,
    signingBonus: item.signingBonus,
  };
}

/**
 * Aplica o resultado de uma avaliação ao item, executando a transferência se
 * for aceite. Isolado porque serve tanto a resolução semanal como o "aceitar
 * contra-proposta".
 */
function settle(state: GameState, item: OfferItem): OfferStatus {
  const player = state.players[item.playerId];
  if (!player || player.clubId !== item.toClubId) {
    item.status = 'REJECTED';
    item.reasonKey = 'offer.playerGone';
    item.reasonParams = undefined;
    return item.status;
  }

  const evaluation = evaluateOffer(toTransferOffer(state, item), state);

  if (evaluation.decision === 'ACCEPTED') {
    const sellerId = player.clubId;
    const res = executeTransfer(toTransferOffer(state, item), state);
    if (!res.ok) {
      item.status = 'REJECTED';
      item.reasonKey = 'offer.txFailed';
      item.reasonParams = undefined;
      return item.status;
    }
    if (sellerId) {
      ensureValidLineup(sellerId, state.clubs[sellerId]?.squad ?? [], state.players, state.tactics);
    }
    item.status = 'ACCEPTED';
    item.reasonKey = 'offer.signedContract';
    item.reasonParams = { player: `${player.firstName} ${player.lastName}` };
    return item.status;
  }

  if (evaluation.decision === 'COUNTER') {
    item.status = 'COUNTER';
    item.reasonKey = evaluation.reasonKey;
    item.reasonParams = evaluation.reasonParams;
    item.requiredFee = evaluation.requiredFee;
    item.requiredWage = evaluation.requiredWage;
    return item.status;
  }

  item.status = 'REJECTED';
  item.reasonKey = evaluation.reasonKey;
  item.reasonParams = evaluation.reasonParams;
  return item.status;
}

/**
 * Resolve todas as propostas cuja data de resposta já chegou.
 * Chamado por advanceWeek. Devolve os itens que mudaram de estado.
 */
export function resolveDueOffers(state: GameState): OfferItem[] {
  const today = state.meta.currentDate;
  const changed: OfferItem[] = [];
  for (const item of outgoingOffers(state)) {
    if (item.status !== 'PENDING' || item.respondDate > today) continue;
    settle(state, item);
    changed.push(item);
  }
  return changed;
}

/**
 * Aceita a contra-proposta: sobe os termos ao que foi exigido e fecha já.
 * Aqui a resposta é imediata de propósito — o vendedor acabou de dizer o preço,
 * esperar outra semana só seria fricção sem informação nova.
 */
export function acceptCounter(state: GameState, itemId: string): SubmitResult {
  const item = outgoingOffers(state).find((o) => o.id === itemId);
  if (!item || item.status !== 'COUNTER') {
    return { ok: false, errorKey: 'submit.counterGone' };
  }

  const newFee = Math.max(item.fee, item.requiredFee ?? item.fee);
  const newWage = Math.max(item.wageOffer, item.requiredWage ?? item.wageOffer);

  const fin = state.finances[state.meta.managedClubId];
  // O que já estava reservado por ESTA proposta não conta como novo gasto.
  const extra = newFee - item.fee;
  if (fin && extra > availableBudget(state)) {
    return { ok: false, errorKey: 'submit.counterBudget' };
  }

  item.fee = newFee;
  item.wageOffer = newWage;
  const status = settle(state, item);
  return {
    ok: status === 'ACCEPTED',
    errorKey: status === 'ACCEPTED' ? undefined : item.reasonKey,
    errorParams: status === 'ACCEPTED' ? undefined : item.reasonParams,
    item,
  };
}

/** Desiste de uma proposta (pendente ou com contra-proposta) e liberta o orçamento. */
export function withdrawOffer(state: GameState, itemId: string): void {
  state.inbox = state.inbox.filter((it) => !(it.kind === 'OFFER' && it.id === itemId));
}

/**
 * Remove respostas já resolvidas que passaram a validade.
 * (Aceites e recusadas ficam alguns dias para o jogador as ler.)
 */
export function pruneOffers(state: GameState): void {
  const today = state.meta.currentDate;
  state.inbox = state.inbox.filter((it) => {
    if (it.kind !== 'OFFER') return true;
    if (it.status === 'PENDING' || it.status === 'COUNTER') return true;
    return addDays(it.respondDate, RESOLVED_TTL_DAYS) >= today;
  });
}
