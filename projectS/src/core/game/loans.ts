/**
 * Empréstimos — dar (emprestar jovens para ganharem minutos e saírem da folha)
 * e receber (reforçar com jovens de outros clubes). O jogador MOVE-SE de plantel
 * (joga pelo clube de acolhimento) mas o dono fica registado e recupera-o no fim
 * da época. Simplificação de salários: o clube de acolhimento paga o ordenado
 * enquanto o jogador lá está (sai da folha do dono).
 *
 * Lógica pura: muta o GameState, sem UI nem SDKs.
 */
import { Club, GameState, naturalOverall, Player, shortName, SIGNING_QUIET_DAYS, silenceRequests } from '../models';
import { canSpend, moveMoney, REACH_BAND, recalcWages, requiredReputation, withinDivisionCap } from '../economy';

export const LOAN_MAX_AGE = 21;

/**
 * Teto de emprestados no plantel ao mesmo tempo.
 *
 * Sem teto, e como receber um empréstimo custa só um anúncio, dava para encher
 * o onze inteiro com os melhores jovens do país — foi assim que um clube da 3ª
 * divisão do playtest ficou campeão nacional com "1 anúncio". Três é o que a
 * maioria das federações permite e chega para tapar buracos.
 */
export const MAX_LOANS_IN = 3;

/** Quantos emprestados o clube gerido já tem no plantel. */
export function loansInCount(state: GameState): number {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return 0;
  return club.squad.filter((id) => !!state.players[id]?.condition.loanOwnerId).length;
}

/**
 * O clube gerido pode receber ESTE jogador por empréstimo?
 *
 * Aplica as mesmas regras de estatuto de uma contratação normal (`REACH_BAND`):
 * um craque não vai para um clube muito abaixo do seu nível só porque o
 * empréstimo é grátis. A vantagem do empréstimo continua a ser não pagar passe.
 */
export function loanInEligibility(state: GameState, player: Player): { ok: boolean; errorKey?: string } {
  const managed = state.meta.managedClubId;
  const club = state.clubs[managed];
  const fin = state.finances[managed];
  if (!club || !fin) return { ok: false, errorKey: 'loan.err.invalid' };
  if (loansInCount(state) >= MAX_LOANS_IN) return { ok: false, errorKey: 'loan.err.tooMany' };

  const gap = requiredReputation(naturalOverall(player)) - club.reputation;
  if (gap > REACH_BAND) return { ok: false, errorKey: 'loan.err.reach' };

  // O ordenado passa a ser NOSSO enquanto cá estiver — tem de caber no teto do escalão.
  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  if (!withinDivisionCap(fin, tier, player.wage)) return { ok: false, errorKey: 'loan.err.wages' };

  return { ok: true };
}

export interface LoanResult {
  ok: boolean;
  clubName?: string;
  errorKey?: string;
}

/** Empréstimo terminado que o clube gerido tinha RECEBIDO — pode comprar o jogador. */
export interface ReturnedLoan {
  playerId: string;
  playerName: string;
  ownerId: string;
  ownerName: string;
  price: number;
  /** O preço vem de uma opção de compra acordada no início do empréstimo? */
  viaOption?: boolean;
  /** Quanto se poupa face ao preço de mercado de hoje (0 se a opção não compensa). */
  saved?: number;
}

/** Preço de compra de um jogador emprestado (valor de mercado + prémio de 15%). */
export function loanBuyPrice(player: Player): number {
  const base = Math.max(player.marketValue ?? 0, 50_000);
  return Math.round((base * 1.15) / 1_000) * 1_000;
}

/**
 * OPÇÃO DE COMPRA — preço fechado no dia do empréstimo.
 *
 * Custa 25% acima do valor de hoje (o dono não a dá de graça) mas fica travado:
 * se o miúdo crescer meia época, compra-se a preço de saldo. É a diferença
 * entre "emprestem-me um jogador" e "estou a formar o meu próximo titular".
 */
export const LOAN_OPTION_MULTIPLE = 1.25;
/** Taxa paga ao dono, já, por ele travar o preço (percentagem da opção). */
export const LOAN_OPTION_FEE_SHARE = 0.1;

export function loanOptionPrice(player: Player): number {
  const base = Math.max(player.marketValue ?? 0, 50_000);
  return Math.round((base * LOAN_OPTION_MULTIPLE) / 1_000) * 1_000;
}

/** Custo imediato de negociar a opção de compra. */
export function loanOptionFee(player: Player): number {
  return Math.round((loanOptionPrice(player) * LOAN_OPTION_FEE_SHARE) / 1_000) * 1_000;
}

/** Está o jogador no onze do seu clube? (titulares não são candidatos a empréstimo). */
function isStarter(state: GameState, p: Player): boolean {
  const t = p.clubId ? state.tactics[p.clubId] : null;
  return !!t && t.lineup.some((s) => s.playerId === p.id);
}

/** Jovens do clube gerido que podem ser EMPRESTADOS (≤21, não emprestados, suplentes). */
export function loanOutCandidates(state: GameState): Player[] {
  const managed = state.meta.managedClubId;
  const club = state.clubs[managed];
  if (!club) return [];
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player =>
      !!p && p.clubId === managed && p.age <= LOAN_MAX_AGE
      && !p.condition.loanOwnerId && !isStarter(state, p))
    .sort((a, b) => b.potential - a.potential);
}

/**
 * Jovens de OUTROS clubes disponíveis para receber por empréstimo (≤21,
 * suplentes) e que o clube gerido ALCANÇA. Filtrar aqui evita a lista de
 * craques inalcançáveis que o playtest usou para montar um onze de estrelas.
 */
export function loanInMarket(state: GameState): Player[] {
  const managed = state.meta.managedClubId;
  const club = state.clubs[managed];
  if (!club) return [];
  const maxOverall = Math.floor(club.reputation + REACH_BAND) / 6 + 6; // inverso de requiredReputation
  const out: Player[] = [];
  for (const c of Object.values(state.clubs)) {
    if (c.id === managed || c.european) continue;
    for (const id of c.squad) {
      const p = state.players[id];
      if (!p || p.age > LOAN_MAX_AGE || p.condition.loanOwnerId || isStarter(state, p)) continue;
      if (naturalOverall(p) > maxOverall) continue;
      out.push(p);
    }
  }
  return out.sort((a, b) => b.potential - a.potential);
}

/** Move um jogador de um clube para outro (plantel + salários). */
function movePlayer(state: GameState, player: Player, fromId: string, toId: string): void {
  const from = state.clubs[fromId];
  const to = state.clubs[toId];
  if (from) {
    from.squad = from.squad.filter((id) => id !== player.id);
    const ff = state.finances[fromId];
    if (ff) recalcWages(from, ff, state.players);
  }
  if (to && !to.squad.includes(player.id)) to.squad.push(player.id);
  player.clubId = toId;
  silenceRequests(player.condition, state.meta.currentDate, SIGNING_QUIET_DAYS);
  const tf = state.finances[toId];
  if (to && tf) recalcWages(to, tf, state.players);
}

/** Empresta um jovem do clube gerido ao clube de menor reputação (dá-lhe minutos). */
export function loanOut(state: GameState, playerId: string): LoanResult {
  const managed = state.meta.managedClubId;
  const player = state.players[playerId];
  if (!player || player.clubId !== managed) return { ok: false, errorKey: 'loan.err.notYours' };
  if (player.age > LOAN_MAX_AGE) return { ok: false, errorKey: 'loan.err.age' };
  if (player.condition.loanOwnerId) return { ok: false, errorKey: 'loan.err.already' };
  if (isStarter(state, player)) return { ok: false, errorKey: 'loan.err.starter' };

  const borrower = Object.values(state.clubs)
    .filter((c) => c.id !== managed && !c.european)
    .sort((a, b) => a.reputation - b.reputation)[0];
  if (!borrower) return { ok: false, errorKey: 'loan.err.noClub' };

  movePlayer(state, player, managed, borrower.id);
  player.condition.loanOwnerId = managed;
  player.condition.loanUntil = state.meta.season; // regressa no próximo fim de época
  return { ok: true, clubName: borrower.name };
}

/**
 * Recebe um jovem de outro clube por empréstimo (junta-se ao plantel gerido).
 *
 * Com `withOption`, negoceia-se OPÇÃO DE COMPRA: paga-se já uma taxa ao dono
 * (`loanOptionFee`) e em troca o preço de compra fica TRAVADO no valor de hoje
 * +25%. Se o miúdo crescer meia época, fica-se com ele a preço de saldo; se não
 * crescer, perdeu-se a taxa. Mexer no ordenado seria mais sujo — ficava inflado
 * quando o jogador voltasse ao dono.
 */
export function loanIn(state: GameState, playerId: string, withOption = false): LoanResult {
  const managed = state.meta.managedClubId;
  const player = state.players[playerId];
  if (!player || !player.clubId || player.clubId === managed) return { ok: false, errorKey: 'loan.err.invalid' };
  if (player.age > LOAN_MAX_AGE) return { ok: false, errorKey: 'loan.err.age' };
  if (player.condition.loanOwnerId) return { ok: false, errorKey: 'loan.err.already' };
  if (isStarter(state, player)) return { ok: false, errorKey: 'loan.err.starter' };
  const gate = loanInEligibility(state, player);
  if (!gate.ok) return { ok: false, errorKey: gate.errorKey };

  const ownerId = player.clubId;
  const fin = state.finances[managed];
  const fee = withOption ? loanOptionFee(player) : 0;
  if (fee > 0) {
    if (!fin || fin.transferBudget < fee) return { ok: false, errorKey: 'loan.err.optionFunds' };
    // Nenhuma despesa voluntária deixa o clube no vermelho — nem a taxa de opção.
    if (!canSpend(fin, fee)) return { ok: false, errorKey: 'loan.err.funds' };
    moveMoney(fin, -fee);
    const ownerFin = state.finances[ownerId];
    if (ownerFin) moveMoney(ownerFin, fee);
  }

  const option = withOption ? loanOptionPrice(player) : undefined;
  movePlayer(state, player, ownerId, managed);
  player.condition.loanOwnerId = ownerId;
  player.condition.loanUntil = state.meta.season;
  player.condition.loanBuyOption = option;
  return { ok: true, clubName: state.clubs[ownerId]?.name };
}

/**
 * Devolve os empréstimos vencidos aos donos. Chamar no rollover DEPOIS de
 * incrementar a época: regressam os que têm `loanUntil < nova época`.
 *
 * Retorna a lista dos que o clube GERIDO tinha recebido e que regressaram —
 * a UI usa-a para oferecer a compra do jogador (popup de fim de empréstimo).
 */
export function returnExpiredLoans(state: GameState): ReturnedLoan[] {
  const managed = state.meta.managedClubId;
  const returned: ReturnedLoan[] = [];
  for (const p of Object.values(state.players)) {
    const ownerId = p.condition.loanOwnerId;
    if (!ownerId) continue;
    if ((p.condition.loanUntil ?? 0) >= state.meta.season) continue; // ainda não regressa
    const current = p.clubId;
    // Só oferecemos compra dos que estavam a jogar PELO clube gerido.
    if (current === managed && state.clubs[ownerId]) {
      // A opção de compra, se foi negociada, manda sempre: é um preço travado.
      const market = loanBuyPrice(p);
      const option = p.condition.loanBuyOption;
      const price = option ?? market;
      returned.push({
        playerId: p.id,
        playerName: shortName(p),
        ownerId,
        ownerName: state.clubs[ownerId]?.name ?? ownerId,
        price,
        viaOption: option != null,
        saved: option != null ? Math.max(0, market - option) : 0,
      });
    }
    if (current && state.clubs[ownerId]) movePlayer(state, p, current, ownerId);
    p.condition.loanOwnerId = undefined;
    p.condition.loanUntil = undefined;
    // A opção só vale no fim DESTE empréstimo — a UI já recebeu o preço acima.
    p.condition.loanBuyOption = undefined;
  }
  return returned;
}

/**
 * Termina um empréstimo mais cedo. Funciona nos dois sentidos:
 *  - jogador RECEBIDO (a jogar no clube gerido) → volta ao dono já.
 *  - jogador CEDIDO (dono = clube gerido) → é chamado de volta do clube de acolhimento.
 */
export function terminateLoan(state: GameState, playerId: string): LoanResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'loan.err.invalid' };
  const ownerId = player.condition.loanOwnerId;
  if (!ownerId) return { ok: false, errorKey: 'loan.err.notLoan' };
  const current = player.clubId;
  if (current && state.clubs[ownerId]) movePlayer(state, player, current, ownerId);
  player.condition.loanOwnerId = undefined;
  player.condition.loanUntil = undefined;
  // Dispensar antes do tempo queima a opção (e a taxa já paga) — é o custo de
  // desistir a meio.
  player.condition.loanBuyOption = undefined;
  player.transferListed = false;
  return { ok: true, clubName: state.clubs[ownerId]?.name };
}

/**
 * Compra definitiva de um jogador que estava emprestado ao clube gerido, no fim
 * do empréstimo. Paga `price` ao dono, transfere o passe. A UI só deve chamar
 * isto depois de `returnExpiredLoans` (o jogador já está de volta ao dono).
 */
export function buyReturnedPlayer(state: GameState, playerId: string, price: number): LoanResult {
  const managed = state.meta.managedClubId;
  const player = state.players[playerId];
  const buyer = state.clubs[managed];
  const finance = state.finances[managed];
  if (!player || !buyer || !finance) return { ok: false, errorKey: 'loan.err.invalid' };
  if (finance.balance < price) return { ok: false, errorKey: 'loan.err.funds' };
  const sellerId = player.clubId;
  moveMoney(finance, -price);
  if (sellerId && state.finances[sellerId]) moveMoney(state.finances[sellerId]!, price);
  if (sellerId && state.clubs[sellerId]) movePlayer(state, player, sellerId, managed);
  else {
    // Jogador livre (sem clube) — apenas junta ao plantel gerido.
    if (!buyer.squad.includes(player.id)) buyer.squad.push(player.id);
    player.clubId = managed;
    silenceRequests(player.condition, state.meta.currentDate, SIGNING_QUIET_DAYS);
    recalcWages(buyer, finance, state.players);
  }
  player.condition.loanOwnerId = undefined;
  player.condition.loanUntil = undefined;
  player.transferListed = false;
  return { ok: true, clubName: buyer.name };
}
