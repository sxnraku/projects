import { Club, Finance, GameState, Player } from '../models';
import { computeMarketValue, suggestedWage } from './marketValue';

/** Proposta de transferência de um clube por um jogador de outro clube. */
export interface TransferOffer {
  playerId: string;
  fromClubId: string; // clube comprador
  fee: number; // valor oferecido pelo passe
  wageOffer: number; // salário semanal proposto ao jogador
  contractYears: number; // duração do novo contrato
}

/** Decisão do clube vendedor + jogador perante uma proposta. */
export const OfferDecision = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  COUNTER: 'COUNTER', // contra-proposta (fee mínimo aceitável)
} as const;
export type OfferDecision = (typeof OfferDecision)[keyof typeof OfferDecision];

export interface OfferEvaluation {
  decision: OfferDecision;
  /** Fee mínimo que o vendedor aceitaria (em COUNTER). */
  requiredFee?: number;
  /** Salário mínimo que o jogador aceitaria (se o problema for o ordenado). */
  requiredWage?: number;
  reason: string;
}

/**
 * Avalia uma proposta do ponto de vista do clube vendedor E do jogador.
 * Aceita se: fee >= valor de mercado (com margem) E salário satisfaz o jogador.
 */
export function evaluateOffer(
  offer: TransferOffer,
  state: GameState,
): OfferEvaluation {
  const player = state.players[offer.playerId];
  if (!player) return { decision: 'REJECTED', reason: 'Jogador não existe.' };
  if (player.clubId === null) {
    // Jogador livre — só precisa de aceitar o salário (fee = 0).
    return evaluatePlayerWillingness(offer, player, state);
  }
  if (player.clubId === offer.fromClubId) {
    return { decision: 'REJECTED', reason: 'Jogador já pertence ao clube.' };
  }

  const value = computeMarketValue(player, state.meta.season);
  // O vendedor pede pelo menos o valor de mercado; jovens com contrato longo pedem mais.
  const yearsLeft = (player.contractUntil ?? state.meta.season) - state.meta.season;
  const premium = yearsLeft >= 3 ? 1.25 : yearsLeft === 2 ? 1.1 : 1.0;
  const requiredFee = Math.round((value * premium) / 1000) * 1000;

  if (offer.fee < requiredFee) {
    return {
      decision: 'COUNTER',
      requiredFee,
      reason: `Proposta baixa. Clube pede ${requiredFee.toLocaleString('pt-PT')}.`,
    };
  }

  // Fee aceite pelo clube — falta o jogador aceitar o salário.
  return evaluatePlayerWillingness(offer, player, state);
}

/** O jogador aceita se o salário >= sugerido pelo seu valor (com pequena tolerância). */
function evaluatePlayerWillingness(
  offer: TransferOffer,
  player: Player,
  state: GameState,
): OfferEvaluation {
  const wanted = suggestedWage(player, state.meta.season);
  if (offer.wageOffer < wanted * 0.9) {
    return {
      decision: 'COUNTER',
      requiredWage: wanted,
      reason: `Salário insuficiente. Jogador quer ${wanted.toLocaleString('pt-PT')}/semana.`,
    };
  }
  if (offer.contractYears < 1 || offer.contractYears > 6) {
    return { decision: 'REJECTED', reason: 'Duração de contrato inaceitável (1-6 anos).' };
  }
  return { decision: 'ACCEPTED', reason: 'Proposta aceite.' };
}

/** Resultado da execução de uma transferência. */
export interface TransferResult {
  ok: boolean;
  error?: string;
}

/**
 * Executa a transferência: valida orçamento, move o passe, atualiza plantéis,
 * contrato, salário e finanças dos dois clubes. Muta o GameState.
 *
 * Pré-condição: a proposta deve ter sido ACEITE (evaluateOffer). Ainda assim
 * revalida fundos para segurança.
 */
export function executeTransfer(
  offer: TransferOffer,
  state: GameState,
): TransferResult {
  const player = state.players[offer.playerId];
  if (!player) return { ok: false, error: 'Jogador não existe.' };

  const buyer = state.clubs[offer.fromClubId];
  const buyerFin = state.finances[offer.fromClubId];
  if (!buyer || !buyerFin) return { ok: false, error: 'Clube comprador inválido.' };

  if (buyerFin.transferBudget < offer.fee) {
    return { ok: false, error: 'Orçamento de transferências insuficiente.' };
  }

  const sellerId = player.clubId;

  // Movimento financeiro do comprador.
  buyerFin.transferBudget -= offer.fee;
  buyerFin.balance -= offer.fee;

  // Movimento do vendedor (se não for jogador livre).
  if (sellerId) {
    const seller = state.clubs[sellerId];
    const sellerFin = state.finances[sellerId];
    if (seller && sellerFin) {
      sellerFin.balance += offer.fee;
      sellerFin.transferBudget += offer.fee;
      seller.squad = seller.squad.filter((id) => id !== player.id);
      recalcWages(seller, sellerFin, state.players);
    }
  }

  // Atualiza o jogador e o novo clube.
  player.clubId = buyer.id;
  player.wage = offer.wageOffer;
  player.contractUntil = state.meta.season + offer.contractYears;
  if (!buyer.squad.includes(player.id)) buyer.squad.push(player.id);
  recalcWages(buyer, buyerFin, state.players);

  // Valor de mercado reavaliado após a mudança de contrato.
  player.marketValue = computeMarketValue(player, state.meta.season);

  return { ok: true };
}

/** Recalcula a despesa salarial semanal do clube a partir do plantel atual. */
export function recalcWages(
  club: Club,
  finance: Finance,
  players: Record<string, Player>,
): void {
  let total = 0;
  for (const id of club.squad) {
    const p = players[id];
    if (p) total += p.wage;
  }
  finance.expenses.wages = total;
}
