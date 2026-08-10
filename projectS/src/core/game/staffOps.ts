/**
 * Cola entre a EQUIPA TÉCNICA (`core/staff`, puro) e o estado do jogo.
 *
 * `core/staff` não conhece o `GameState` de propósito — as regras de capacidade,
 * salário e efeito são testáveis sozinhas. Tudo o que precisa de olhar para o
 * save (gerar o backroom inicial, pagar os salários, contratar) vive aqui.
 */
import { baseStaffCost } from '../economy/divisions';
import { deriveSeed, Rng } from '../engine/rng';
import { GameState } from '../models';
import {
  fireStaff,
  hireStaff,
  initialStaff,
  StaffChangeResult,
  StaffMember,
  StaffRole,
  staffCandidates,
  staffWageBill,
} from '../staff';
import { clearIndividualFocus, individualFocus, individualSlotsFor, usedSlots } from './staffSlots';

/** Escalão do clube gerido. */
function managedTier(state: GameState): number {
  const club = state.clubs[state.meta.managedClubId];
  const leagueId = club?.leagueId;
  return (leagueId ? state.leagues[leagueId]?.tier : 1) ?? 1;
}

/**
 * Garante que o clube gerido tem equipa técnica. Chamado no arranque da semana:
 * cobre os saves anteriores a esta funcionalidade e o momento em que mudas de
 * clube (aí o backroom anterior fica para trás e herdas o do clube novo).
 */
export function ensureStaff(state: GameState): void {
  if (state.career.staff) return;
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return;
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'staff', club.id));
  state.career.staff = initialStaff(club.reputation, managedTier(state), rng);
  applyStaffCost(state);
}

/**
 * Repõe a despesa semanal de estrutura do clube gerido: base do clube mais os
 * salários dos técnicos. Idempotente — pode correr todas as semanas.
 */
export function applyStaffCost(state: GameState): void {
  const club = state.clubs[state.meta.managedClubId];
  const fin = state.finances[state.meta.managedClubId];
  if (!club || !fin) return;
  fin.expenses.staff = baseStaffCost(club, managedTier(state))
    + staffWageBill(state.career.staff ?? []);
}

/** Candidatos disponíveis para uma função, nesta época e neste clube. */
export function candidatesFor(state: GameState, role: StaffRole): StaffMember[] {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return [];
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'staffMarket', state.meta.season, role));
  return staffCandidates(role, club.reputation, managedTier(state), rng);
}

/**
 * Contrata um técnico. Trava se o clube não tiver caixa para o salário — o
 * mesmo princípio dos jogadores: nada de contratar o que não se paga.
 */
export function hireStaffMember(state: GameState, member: StaffMember): StaffChangeResult {
  const fin = state.finances[state.meta.managedClubId];
  if (!fin) return { ok: false, errorKey: 'staff.error.notFound' };

  // Quatro semanas de salário em caixa: contratar não pode ser um bilhete para
  // a crise da semana seguinte.
  const needed = member.wage * 4;
  if (fin.balance < needed) {
    return {
      ok: false,
      errorKey: 'staff.error.noCash',
      params: {
        need: Math.round(needed).toLocaleString('pt-PT'),
        have: Math.round(fin.balance).toLocaleString('pt-PT'),
      },
    };
  }

  const staff = (state.career.staff ??= []);
  const result = hireStaff(staff, member);
  applyStaffCost(state);
  return result;
}

/** Despede um técnico e reajusta a despesa. */
export function fireStaffMember(state: GameState, staffId: string): StaffChangeResult {
  const staff = (state.career.staff ??= []);
  const result = fireStaff(staff, staffId);
  if (!result.ok) return result;
  applyStaffCost(state);
  // Despedir o adjunto pode deixar planos individuais a mais: os que sobram
  // acima do limite caem, do fim da lista para trás.
  enforceIndividualSlots(state);
  return result;
}

/**
 * Corta planos individuais em excesso (depois de despedir o adjunto ou de mudar
 * de clube). Sem isto o limite era uma sugestão: bastava contratar, montar seis
 * planos e despedir.
 */
export function enforceIndividualSlots(state: GameState): void {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return;
  const squad = club.squad.map((id) => state.players[id]);
  const limit = individualSlotsFor(state);
  let over = usedSlots(squad) - limit;
  if (over <= 0) return;
  for (let i = squad.length - 1; i >= 0 && over > 0; i--) {
    const p = squad[i];
    if (p && individualFocus(p)) { clearIndividualFocus(p); over--; }
  }
}
