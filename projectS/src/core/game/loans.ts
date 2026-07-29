/**
 * Empréstimos — dar (emprestar jovens para ganharem minutos e saírem da folha)
 * e receber (reforçar com jovens de outros clubes). O jogador MOVE-SE de plantel
 * (joga pelo clube de acolhimento) mas o dono fica registado e recupera-o no fim
 * da época. Simplificação de salários: o clube de acolhimento paga o ordenado
 * enquanto o jogador lá está (sai da folha do dono).
 *
 * Lógica pura: muta o GameState, sem UI nem SDKs.
 */
import { Club, GameState, Player, shortName } from '../models';
import { recalcWages } from '../economy';

export const LOAN_MAX_AGE = 21;

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
}

/** Preço de compra de um jogador emprestado (valor de mercado + prémio de 15%). */
export function loanBuyPrice(player: Player): number {
  const base = Math.max(player.marketValue ?? 0, 50_000);
  return Math.round((base * 1.15) / 1_000) * 1_000;
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

/** Jovens de OUTROS clubes disponíveis para receber por empréstimo (≤21, suplentes). */
export function loanInMarket(state: GameState): Player[] {
  const managed = state.meta.managedClubId;
  const out: Player[] = [];
  for (const c of Object.values(state.clubs)) {
    if (c.id === managed) continue;
    for (const id of c.squad) {
      const p = state.players[id];
      if (p && p.age <= LOAN_MAX_AGE && !p.condition.loanOwnerId && !isStarter(state, p)) out.push(p);
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
    .filter((c) => c.id !== managed)
    .sort((a, b) => a.reputation - b.reputation)[0];
  if (!borrower) return { ok: false, errorKey: 'loan.err.noClub' };

  movePlayer(state, player, managed, borrower.id);
  player.condition.loanOwnerId = managed;
  player.condition.loanUntil = state.meta.season; // regressa no próximo fim de época
  return { ok: true, clubName: borrower.name };
}

/** Recebe um jovem de outro clube por empréstimo (junta-se ao plantel gerido). */
export function loanIn(state: GameState, playerId: string): LoanResult {
  const managed = state.meta.managedClubId;
  const player = state.players[playerId];
  if (!player || !player.clubId || player.clubId === managed) return { ok: false, errorKey: 'loan.err.invalid' };
  if (player.age > LOAN_MAX_AGE) return { ok: false, errorKey: 'loan.err.age' };
  if (player.condition.loanOwnerId) return { ok: false, errorKey: 'loan.err.already' };
  if (isStarter(state, player)) return { ok: false, errorKey: 'loan.err.starter' };

  const ownerId = player.clubId;
  movePlayer(state, player, ownerId, managed);
  player.condition.loanOwnerId = ownerId;
  player.condition.loanUntil = state.meta.season;
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
      returned.push({
        playerId: p.id,
        playerName: shortName(p),
        ownerId,
        ownerName: state.clubs[ownerId]?.name ?? ownerId,
        price: loanBuyPrice(p),
      });
    }
    if (current && state.clubs[ownerId]) movePlayer(state, p, current, ownerId);
    p.condition.loanOwnerId = undefined;
    p.condition.loanUntil = undefined;
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
  finance.balance -= price;
  if (sellerId && state.finances[sellerId]) state.finances[sellerId].balance += price;
  if (sellerId && state.clubs[sellerId]) movePlayer(state, player, sellerId, managed);
  else {
    // Jogador livre (sem clube) — apenas junta ao plantel gerido.
    if (!buyer.squad.includes(player.id)) buyer.squad.push(player.id);
    player.clubId = managed;
    recalcWages(buyer, finance, state.players);
  }
  player.condition.loanOwnerId = undefined;
  player.condition.loanUntil = undefined;
  player.transferListed = false;
  return { ok: true, clubName: buyer.name };
}
