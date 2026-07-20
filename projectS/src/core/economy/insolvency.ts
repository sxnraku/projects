import { GameState, naturalOverall } from '../models';
import { recalcWages } from './transfers';
import { computeMarketValue } from './marketValue';
import { isInsolvent } from './finances';

/**
 * Consequências de estar em insolvência (saldo negativo).
 *
 * As contratações já ficam bloqueadas em transfers.ts. Aqui aplicam-se as
 * penalizações continuadas, avaliadas uma vez por semana:
 *
 *  1. Perda de reputação — arrasta patrocínios, bilheteira e atratividade.
 *  2. Venda forçada pela direção se a dívida for grave: vende-se o jogador de
 *     maior valor por 70% do preço (venda de aflição) para tapar o buraco.
 *
 * É o contrapeso ao gasto descontrolado: quem estoura o orçamento perde
 * ativos e prestígio, não apenas "um número vermelho no ecrã".
 */

/** Dívida a partir da qual a direção intervém e vende um ativo. */
export const FORCED_SALE_DEBT = 500_000;
/** Desconto aplicado numa venda de aflição. */
export const DISTRESS_SALE_RATE = 0.7;

export interface InsolvencyOutcome {
  insolvent: boolean;
  reputationLost: boolean;
  soldPlayerId: string | null;
  soldPlayerName: string | null;
  amount: number;
}

/**
 * Aplica as sanções de insolvência a um clube. Muta o estado.
 * Devolve o que aconteceu, para a UI/notícias.
 */
export function applyInsolvency(state: GameState, clubId: string): InsolvencyOutcome {
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  const out: InsolvencyOutcome = {
    insolvent: false, reputationLost: false,
    soldPlayerId: null, soldPlayerName: null, amount: 0,
  };
  if (!club || !fin || !isInsolvent(fin)) return out;

  out.insolvent = true;

  // 1. Perda de reputação (mínimo 1 — nunca desaparece do mapa).
  if (club.reputation > 1) {
    club.reputation = Math.max(1, club.reputation - 1);
    out.reputationLost = true;
  }

  // 2. Venda forçada se a dívida for grave.
  if (fin.balance < -FORCED_SALE_DEBT) {
    // O ativo mais valioso que não seja o único guarda-redes disponível.
    const candidates = club.squad
      .map((id) => state.players[id])
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => b.marketValue - a.marketValue);

    const target = candidates[0];
    if (target && club.squad.length > 11) {
      const price = Math.round(target.marketValue * DISTRESS_SALE_RATE);

      // Sai do plantel; fica livre (sem clube) — a direção liquida o ativo.
      club.squad = club.squad.filter((id) => id !== target.id);
      target.clubId = null;
      target.transferListed = false;
      target.contractUntil = null;

      fin.balance += price;
      recalcWages(club, fin, state.players);
      target.marketValue = computeMarketValue(target, state.meta.season);

      out.soldPlayerId = target.id;
      out.soldPlayerName = `${target.firstName} ${target.lastName}`;
      out.amount = price;
    }
  }

  return out;
}

/** Ordena o plantel por valor (ajuda a UI a mostrar quem está em risco). */
export function mostValuablePlayer(state: GameState, clubId: string) {
  const club = state.clubs[clubId];
  if (!club) return null;
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => naturalOverall(b) - naturalOverall(a))[0] ?? null;
}
