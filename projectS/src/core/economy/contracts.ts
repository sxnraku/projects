import { Club, Finance, GameState, Player } from '../models';
import { canAffordWage, wageBudgetRemaining } from './finances';
import { suggestedWage } from './marketValue';
import { recalcWages } from './transfers';

/** Renova o contrato de um jogador do próprio clube. */
export interface RenewalResult {
  ok: boolean;
  error?: string;
}

/**
 * Renova o contrato de um jogador já no clube.
 * O jogador aceita se o salário >= sugerido (com tolerância).
 * Muta o jogador e a despesa salarial do clube.
 */
export function renewContract(
  playerId: string,
  years: number,
  wage: number,
  state: GameState,
): RenewalResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'Jogador não existe.' };
  if (player.clubId === null) return { ok: false, error: 'Jogador não pertence a nenhum clube.' };
  if (years < 1 || years > 6) return { ok: false, error: 'Duração inválida (1-6 anos).' };

  const wanted = suggestedWage(player, state.meta.season);
  if (wage < wanted * 0.9) {
    return { ok: false, error: `Salário insuficiente. Jogador quer ${wanted.toLocaleString('pt-PT')}/semana.` };
  }

  // Margem salarial: conta só o AUMENTO, já que o jogador já pesa na folha.
  const fin = state.finances[player.clubId];
  if (fin) {
    const increase = wage - player.wage;
    if (increase > 0 && !canAffordWage(fin, increase)) {
      const left = Math.max(0, wageBudgetRemaining(fin));
      return {
        ok: false,
        error: `Sem margem salarial para o aumento: sobram ${left.toLocaleString('pt-PT')} €/sem.`,
      };
    }
  }

  player.wage = wage;
  player.contractUntil = state.meta.season + years;

  const club = state.clubs[player.clubId];
  if (club && fin) recalcWages(club, fin, state.players);

  return { ok: true };
}

/**
 * Processa o fim de época: jogadores com contrato expirado tornam-se livres.
 * Chamar na transição de épocas (ETAPA 3 → nova época).
 * Devolve os ids dos jogadores que ficaram livres.
 */
export function processContractExpiries(state: GameState): string[] {
  const freed: string[] = [];
  const touchedClubs = new Set<string>();

  for (const player of Object.values(state.players)) {
    if (player.clubId === null) continue;
    if (player.contractUntil !== null && player.contractUntil <= state.meta.season) {
      const oldClubId = player.clubId;
      const club = state.clubs[oldClubId];
      if (club) {
        club.squad = club.squad.filter((id) => id !== player.id);
        touchedClubs.add(oldClubId);
      }
      player.clubId = null;
      player.contractUntil = null;
      freed.push(player.id);
    }
  }

  // Recalcula salários dos clubes afetados.
  for (const clubId of touchedClubs) {
    const club = state.clubs[clubId];
    const fin = state.finances[clubId];
    if (club && fin) recalcWages(club, fin, state.players);
  }

  return freed;
}
