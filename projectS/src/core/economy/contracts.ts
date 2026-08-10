import { ContractClauses, GameState } from '../models';
import { normalizeClauses, requiredWageWith } from './clauses';
import { canAffordWage, wageBudgetRemaining } from './finances';
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
  ignoreMargin = false,
  clauses?: ContractClauses,
): RenewalResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'Jogador não existe.' };
  if (player.clubId === null) return { ok: false, error: 'Jogador não pertence a nenhum clube.' };
  // Emprestado: o contrato é do DONO. Renovar aqui não fazia sentido nenhum e
  // acabava com um erro de "sem dinheiro" à frente do utilizador.
  if (player.condition.loanOwnerId) {
    return { ok: false, error: 'Está emprestado — o contrato é do clube dono.' };
  }
  if (years < 1 || years > 6) return { ok: false, error: 'Duração inválida (1-6 anos).' };

  // As cláusulas propostas mexem no que ele exige: rescisão baixa e prémios
  // baixam o fixo; blindar o contrato encarece-o (ver `clauses.ts`).
  const wanted = requiredWageWith(player, state.meta.season, clauses);
  if (wage < wanted * 0.9) {
    return { ok: false, error: `Salário insuficiente. Jogador quer ${wanted.toLocaleString('pt-PT')}/semana.` };
  }

  // Margem salarial: conta só o AUMENTO, já que o jogador já pesa na folha.
  // `ignoreMargin` (decisão de fim de época) nunca bloqueia — manter o próprio
  // jogador não pode ficar refém do teto, senão o modal encravava.
  const fin = state.finances[player.clubId];
  if (!ignoreMargin && fin) {
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
  if (clauses) {
    // A % de futura venda pertence a um contrato antigo entre CLUBES — uma
    // renovação não a apaga nem a inventa; só mexe em rescisão e prémios.
    const kept = player.clauses?.sellOn
      ? { sellOn: player.clauses.sellOn, sellOnClubId: player.clauses.sellOnClubId }
      : {};
    player.clauses = normalizeClauses({ ...clauses, ...kept }, player, state.meta.season);
  }

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
