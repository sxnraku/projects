import { GameState, naturalOverall } from '../models';
import { recalcWages } from './transfers';
import { computeMarketValue } from './marketValue';
import { isInsolvent, moveMoney } from './finances';

/**
 * Consequências de uma semana que o clube NÃO conseguiu pagar.
 *
 * O saldo já não vai abaixo de zero (ver `applyWeeklyFinances`): quando as
 * receitas não cobrem salários e manutenção, sobra um BURACO — o valor que
 * ficou por pagar. É esse buraco, e não "um número vermelho", que dispara as
 * consequências, avaliadas uma vez por semana:
 *
 *  1. Perda de reputação — arrasta patrocínios, bilheteira e atratividade —
 *     com PISO na divisão do clube (um emblema da 1ª não cai a valores de 3ª).
 *  2. Venda forçada nos clubes da IA: vende-se o ativo mais valioso fora do
 *     onze por 70% do preço. O clube gerido nunca: aí abre-se o dilema.
 *
 * É o contrapeso ao gasto descontrolado: quem estoura a folha salarial perde
 * ativos e prestígio — mas de uma vez, com uma decisão pelo meio, e não numa
 * espiral silenciosa de -1 de reputação por semana durante meses.
 */

/**
 * Buraco a partir do qual a direção da IA intervém e vende um ativo.
 *
 * É relativo ao TAMANHO do clube (semanas de folha salarial), não um número
 * fixo. Com 500 000 € fixos, um clube grande — que move milhões por semana —
 * entrava em venda forçada por um falhanço de tesouraria trivial, e a direção
 * despachava um titular por causa disso.
 */
export const FORCED_SALE_WEEKS = 8;
export const FORCED_SALE_MIN_DEBT = 500_000;

export function forcedSaleThreshold(weeklyWages: number): number {
  return Math.max(FORCED_SALE_MIN_DEBT, weeklyWages * FORCED_SALE_WEEKS);
}

/**
 * Piso da reputação por insolvência, em fração da MEDIANA da divisão.
 *
 * Más contas envergonham um clube, não o apagam do mapa: um emblema da 1ª
 * divisão continua a ser da 1ª divisão. Sem piso relativo aos colegas de liga,
 * semanas seguidas de -1 empurravam-no para valores de 3ª divisão e todo o
 * mercado (que compara reputação com o estatuto do jogador) deixava de fazer
 * sentido.
 */
export const INSOLVENCY_REPUTATION_FLOOR = 0.75;

/** Reputação mínima a que a insolvência pode levar um clube (75% da mediana da sua liga). */
export function insolvencyReputationFloor(state: GameState, clubId: string): number {
  const club = state.clubs[clubId];
  if (!club) return 1;
  const peers = Object.values(state.clubs)
    .filter((c) => c.leagueId === club.leagueId && c.id !== clubId && !c.european)
    .map((c) => c.reputation)
    .sort((a, b) => a - b);
  if (peers.length === 0) return 1;
  const median = peers[Math.floor(peers.length / 2)]!;
  return Math.max(1, Math.round(median * INSOLVENCY_REPUTATION_FLOOR));
}

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
 * Aplica as sanções da semana a um clube. Muta o estado.
 *
 * @param shortfall quanto ficou por pagar esta semana (0 = pagou tudo). É o
 *   valor devolvido por `applyWeeklyFinances`. Sem buraco não há castigo: um
 *   clube sem caixa mas equilibrado não perde reputação nem vende ninguém.
 * @returns o que aconteceu, para a UI/notícias.
 */
export function applyInsolvency(state: GameState, clubId: string, shortfall = 0): InsolvencyOutcome {
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  const out: InsolvencyOutcome = {
    insolvent: false, reputationLost: false,
    soldPlayerId: null, soldPlayerName: null, amount: 0,
  };
  if (!club || !fin) return out;

  // "Insolvente" = mercado bloqueado (sem caixa e a perder dinheiro), mesmo que
  // esta semana ainda tenha fechado à tangente.
  out.insolvent = isInsolvent(fin);
  if (shortfall <= 0) return out;

  // 1. Perda de reputação — só numa semana que ficou por pagar, e nunca abaixo
  //    do piso da divisão (ver `insolvencyReputationFloor`).
  const floor = insolvencyReputationFloor(state, clubId);
  if (club.reputation > floor) {
    club.reputation = Math.max(floor, club.reputation - 1);
    out.reputationLost = true;
  }

  // 2. Venda forçada se o buraco for grave.
  //
  // NUNCA para o clube gerido: aí a decisão é do treinador. `saleCandidates`
  // monta a lista e o inbox apresenta o dilema (ver `core/game/inbox.ts`).
  // A IA continua a resolver-se sozinha, que é o que mantém o mundo coerente.
  if (clubId === state.meta.managedClubId) return out;

  // QUEM se vende: o ativo mais valioso FORA DO ONZE.
  //
  // Antes levava sempre o melhor jogador do plantel, semana após semana — o
  // utilizador via os craques que construiu a desaparecerem um a um e a
  // reaparecerem no mercado, sem perceber porquê. Um clube em aflição vende
  // primeiro o que não lhe faz falta no relvado; só quando não há mais nada
  // é que mexe no onze.
  const lineup = new Set((state.tactics[clubId]?.lineup ?? []).map((s) => s.playerId));
  const byValue = club.squad
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p && !p.condition.loanOwnerId)
    .sort((a, b) => b.marketValue - a.marketValue);

  const target = byValue.find((p) => !lineup.has(p.id)) ?? byValue[0];
  if (target && club.squad.length > 11) {
    const price = Math.round(target.marketValue * DISTRESS_SALE_RATE);

    // Sai do plantel; fica livre (sem clube) — a direção liquida o ativo.
    club.squad = club.squad.filter((id) => id !== target.id);
    target.clubId = null;
    target.transferListed = false;
    target.contractUntil = null;

    moveMoney(fin, price);
    recalcWages(club, fin, state.players);
    target.marketValue = computeMarketValue(target, state.meta.season);

    out.soldPlayerId = target.id;
    out.soldPlayerName = `${target.firstName} ${target.lastName}`;
    out.amount = price;
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
