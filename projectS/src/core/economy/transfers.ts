import { Club, ContractClauses, Finance, GameState, naturalOverall, Player, SIGNING_QUIET_DAYS, silenceRequests } from '../models';
import { SIGNINGS_KEPT } from '../career';
import {
  canTriggerRelease,
  normalizeClauses,
  requiredWageWith,
  sellOnCut,
} from './clauses';
import {
  checkInterest,
  playerStanding,
  divisionCapRemaining,
  divisionWageCap,
  withinDivisionCap,
} from './divisions';
import { canSpend, isInsolvent, moveMoney } from './finances';
import { computeMarketValue } from './marketValue';

/** Proposta de transferência de um clube por um jogador de outro clube. */
export interface TransferOffer {
  playerId: string;
  fromClubId: string; // clube comprador
  fee: number; // valor oferecido pelo passe
  wageOffer: number; // salário semanal proposto ao jogador
  contractYears: number; // duração do novo contrato
  /** Prémio de assinatura — convence jogadores a descer de nível. */
  signingBonus?: number;
  /**
   * Cláusulas do NOVO contrato (rescisão, prémios). Mexem no salário que o
   * jogador exige — ver `clauses.ts`. A % de futura venda não entra aqui: é o
   * VENDEDOR que a impõe ao aceitar (`acceptBid`).
   */
  clauses?: ContractClauses;
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
  /** Prémio de assinatura necessário para o convencer a descer de nível. */
  requiredSigningBonus?: number;
  reasonKey: string; // chave i18n (a UI traduz)
  reasonParams?: import('../i18n').MsgParams;
}

/** Escalão (tier) da divisão onde um clube joga. 1 = principal. */
function tierOf(state: GameState, clubId: string): number {
  const leagueId = state.clubs[clubId]?.leagueId;
  return leagueId ? state.leagues[leagueId]?.tier ?? 1 : 1;
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
  if (!player) return { decision: 'REJECTED', reasonKey: 'offer.reject.notExist' };
  if (player.clubId === null) {
    // Jogador livre — só precisa de aceitar o salário (fee = 0).
    return evaluatePlayerWillingness(offer, player, state);
  }
  if (player.clubId === offer.fromClubId) {
    return { decision: 'REJECTED', reasonKey: 'offer.reject.own' };
  }

  // Restrições do COMPRADOR — avaliadas antes de negociar valores.
  const buyerFin = state.finances[offer.fromClubId];
  const buyerClub = state.clubs[offer.fromClubId];
  const buyerTier = tierOf(state, offer.fromClubId);

  if (buyerFin && buyerClub) {
    if (isInsolvent(buyerFin)) {
      return { decision: 'REJECTED', reasonKey: 'offer.reject.insolvent' };
    }

    // CAIXA: a verba é uma autorização, o saldo é o dinheiro que existe mesmo.
    // Sem este travão, meses de fluxo negativo deixavam verba sem caixa e a
    // compra empurrava o clube para o vermelho.
    const outlay = offer.fee + Math.max(0, offer.signingBonus ?? 0);
    if (!canSpend(buyerFin, outlay)) {
      return {
        decision: 'REJECTED',
        reasonKey: 'offer.reject.noCash',
        reasonParams: {
          need: Math.round(outlay).toLocaleString('pt-PT'),
          have: Math.round(buyerFin.balance).toLocaleString('pt-PT'),
        },
      };
    }

    // Teto RÍGIDO da divisão — a direção barra, mesmo com dinheiro em caixa.
    if (!withinDivisionCap(buyerFin, buyerTier, offer.wageOffer)) {
      const cap = divisionWageCap(buyerTier);
      const left = Math.max(0, divisionCapRemaining(buyerFin, buyerTier));
      return {
        decision: 'REJECTED',
        reasonKey: 'offer.reject.wageCap',
        reasonParams: { cap: cap.toLocaleString('pt-PT'), left: left.toLocaleString('pt-PT') },
      };
    }

    // Nota: NÃO se bloqueia por "margem salarial" (teto salários×1.2). Basta
    // respeitar o teto da divisão (acima) e ter verba para o passe. O ordenado
    // continua a pesar no fluxo semanal, mas não impede a contratação se houver
    // dinheiro — pedido do jogador: "com dinheiro, deve dar para contratar".

    // INTERESSE DO JOGADOR: um craque não desce de nível sem ser compensado.
    // Medido contra o clube ONDE ELE ESTÁ, não contra uma tabela absoluta —
    // subir de divisão nunca custa prémio (ver `checkInterest`).
    const interest = checkInterest(player, buyerClub, buyerTier, playerStanding(player, state.clubs, state.leagues));
    if (!interest.interested) {
      const bonus = offer.signingBonus ?? 0;
      if (!Number.isFinite(interest.requiredSigningBonus) || bonus < interest.requiredSigningBonus) {
        return {
          decision: 'REJECTED',
          requiredSigningBonus: Number.isFinite(interest.requiredSigningBonus)
            ? interest.requiredSigningBonus : undefined,
          reasonKey: interest.reasonKey,
          reasonParams: interest.reasonParams,
        };
      }
    }
  }

  // CLÁUSULA DE RESCISÃO: quem a paga não negoceia com o clube — só falta
  // convencer o jogador. É o preço de ter posto a cláusula baixa.
  if (canTriggerRelease(player, offer.fee)) {
    return evaluatePlayerWillingness(offer, player, state);
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
      reasonKey: 'offer.counter.fee',
      reasonParams: { fee: requiredFee.toLocaleString('pt-PT') },
    };
  }

  // Fee aceite pelo clube — falta o jogador aceitar o salário.
  return evaluatePlayerWillingness(offer, player, state);
}

/**
 * O jogador aceita se o salário >= o que exige (com pequena tolerância).
 * As cláusulas propostas mexem nessa exigência: uma rescisão barata ou prémios
 * chorudos compram desconto no fixo; blindar o contrato encarece-o.
 */
function evaluatePlayerWillingness(
  offer: TransferOffer,
  player: Player,
  state: GameState,
): OfferEvaluation {
  const wanted = requiredWageWith(player, state.meta.season, offer.clauses);
  if (offer.wageOffer < wanted * 0.9) {
    return {
      decision: 'COUNTER',
      requiredWage: wanted,
      reasonKey: 'offer.counter.wage',
      reasonParams: { wage: wanted.toLocaleString('pt-PT') },
    };
  }
  if (offer.contractYears < 1 || offer.contractYears > 6) {
    return { decision: 'REJECTED', reasonKey: 'offer.reject.contract' };
  }
  return { decision: 'ACCEPTED', reasonKey: 'offer.accepted' };
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

  // Um clube insolvente não contrata — tem primeiro de equilibrar as contas.
  if (isInsolvent(buyerFin)) {
    return { ok: false, error: 'Clube em insolvência: contratações bloqueadas.' };
  }

  // Teto rígido da divisão (a direção barra o contrato).
  const tier = tierOf(state, offer.fromClubId);
  if (!withinDivisionCap(buyerFin, tier, offer.wageOffer)) {
    return {
      ok: false,
      error: `Teto salarial da divisão excedido (máx. ${divisionWageCap(tier).toLocaleString('pt-PT')} €/sem).`,
    };
  }

  // (Removido) Margem salarial: já não bloqueia a contratação. O ordenado pesa
  // no fluxo semanal, mas ter verba para o passe + respeitar o teto da divisão
  // é suficiente.

  // O prémio de assinatura sai do bolso do comprador (vai para o jogador).
  const signingBonus = Math.max(0, offer.signingBonus ?? 0);
  if (buyerFin.transferBudget < offer.fee + signingBonus) {
    return { ok: false, error: 'Orçamento não cobre passe + prémio de assinatura.' };
  }
  // E o dinheiro tem de existir em caixa: nenhuma compra deixa o clube no vermelho.
  if (!canSpend(buyerFin, offer.fee + signingBonus)) {
    return { ok: false, error: 'Saldo insuficiente: a compra deixaria o clube no vermelho.' };
  }

  const sellerId = player.clubId;

  // Movimento financeiro do comprador (passe + prémio de assinatura).
  moveMoney(buyerFin, -(offer.fee + signingBonus));

  // % DE FUTURA VENDA: sai do que o vendedor recebe e vai para o clube que a
  // negociou numa venda anterior. É uma vez só — depois a cláusula extingue-se.
  const cut = sellOnCut(offer.fee, player.clauses);
  const sellerNet = offer.fee - (cut?.amount ?? 0);
  if (cut) {
    const beneficiary = state.finances[cut.clubId];
    if (beneficiary) {
      moveMoney(beneficiary, cut.amount);
    }
  }

  // Movimento do vendedor (se não for jogador livre).
  if (sellerId) {
    const seller = state.clubs[sellerId];
    const sellerFin = state.finances[sellerId];
    if (seller && sellerFin) {
      moveMoney(sellerFin, sellerNet);
      seller.squad = seller.squad.filter((id) => id !== player.id);
      recalcWages(seller, sellerFin, state.players);
    }
  }

  // Atualiza o jogador e o novo clube.
  player.clubId = buyer.id;
  player.wage = offer.wageOffer;
  player.contractUntil = state.meta.season + offer.contractYears;
  // Uma transferência DEFINITIVA fecha qualquer empréstimo em curso. Sem isto,
  // recomprar um jogador que tínhamos emprestado trazia-o de volta ainda
  // marcado como "EMP": aparecia emprestado no plantel, deixava renovar mas não
  // vender, e o jogo não sabia de quem ele era (bug reportado no playtest).
  player.condition.loanOwnerId = undefined;
  player.condition.loanUntil = undefined;
  player.condition.loanBuyOption = undefined;
  // Contrato novo = cláusulas novas. A % de futura venda do contrato ANTERIOR
  // acabou de ser paga, por isso não transita; se o vendedor quiser uma nova,
  // é aplicada logo a seguir por quem aceitou a proposta (`acceptBid`).
  player.clauses = normalizeClauses(offer.clauses, player, state.meta.season);
  // Acabou de assinar: nada de exigir aumento na semana seguinte.
  silenceRequests(player.condition, state.meta.currentDate, SIGNING_QUIET_DAYS);
  if (!buyer.squad.includes(player.id)) buyer.squad.push(player.id);
  recalcWages(buyer, buyerFin, state.players);

  // Valor de mercado reavaliado após a mudança de contrato.
  player.marketValue = computeMarketValue(player, state.meta.season);

  // Reforço do clube GERIDO: fica registado para se saber se uma promessa de
  // contratação foi cumprida (`core/game/relations.ts`).
  if (buyer.id === state.meta.managedClubId) {
    if (!state.career.signings) state.career.signings = [];
    const n = (state.career.signingsMade ?? 0) + 1;
    state.career.signingsMade = n;
    state.career.signings.push({ n, date: state.meta.currentDate, overall: naturalOverall(player) });
    if (state.career.signings.length > SIGNINGS_KEPT) {
      state.career.signings.splice(0, state.career.signings.length - SIGNINGS_KEPT);
    }
  }

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
