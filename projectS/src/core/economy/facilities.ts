import { Facilities, FACILITY_MAX_LEVEL, GameState } from '../models';
import { divisionMultiplier } from './divisions';
import { infrastructureFunds, moveMoney } from './finances';

/**
 * Upgrades das instalações do clube. Cada nível tem efeito REAL:
 *  - stadium: +18% de capacidade por nível (bilheteira).
 *  - training: +3% de hipótese de evolução por semana por nível (training.ts).
 *  - academy: +1 nível de qualidade da fornada por nível (youth.ts).
 *  - medical: recuperação de lesões 2 dias/semana mais rápida por nível (advance.ts).
 */

export type FacilityType = keyof Facilities;

export const FACILITY_LABELS: Record<FacilityType, string> = {
  stadium: 'Estádio',
  training: 'Centro de treino',
  academy: 'Academia',
  medical: 'Departamento médico',
  scouting: 'Rede de olheiros',
};

export const FACILITY_EFFECTS: Record<FacilityType, string> = {
  stadium: '+18% capacidade por nível',
  training: 'Evolução mais rápida no treino',
  academy: 'Jovens da fornada com mais qualidade',
  medical: 'Lesões recuperam mais depressa',
  scouting: 'Mais olheiros, alcance e relatórios precisos',
};

/**
 * Custo do próximo nível, INDEXADO À DIVISÃO. Um clube da 3ª divisão (que recebe
 * ~¼ de um da 1ª) paga ~¼ pelas instalações — senão nunca conseguia melhorar.
 * Curva 1.9^n (menos brutal que 2.2) e bases mais baixas, para a melhoria ser
 * alcançável ao longo de algumas épocas em qualquer escalão.
 */
export function facilityUpgradeCost(type: FacilityType, currentLevel: number, tier = 1): number {
  const base: Record<FacilityType, number> = {
    stadium: 4_000_000,
    training: 3_000_000,
    academy: 2_500_000,
    medical: 2_000_000,
    scouting: 1_600_000,
  };
  const raw = base[type] * Math.pow(1.9, currentLevel - 1) * divisionMultiplier(tier);
  return Math.round(raw / 10_000) * 10_000;
}

export interface UpgradeResult {
  ok: boolean;
  error?: string;
  newLevel?: number;
  cost?: number;
}

/**
 * Compra o próximo nível de uma instalação do clube gerido.
 * Paga do SALDO (não do orçamento de transferências). Muta o GameState.
 */
export function upgradeFacility(state: GameState, type: FacilityType): UpgradeResult {
  const club = state.clubs[state.meta.managedClubId];
  const fin = state.finances[state.meta.managedClubId];
  if (!club || !fin) return { ok: false, error: 'Clube inválido.' };

  const level = club.facilities[type];
  if (level >= FACILITY_MAX_LEVEL) return { ok: false, error: 'Nível máximo atingido.' };

  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  const cost = facilityUpgradeCost(type, level, tier);
  // Obras saem da FATIA de infraestrutura do saldo, não do saldo inteiro: a
  // reserva salarial e a verba de transferências ficam de fora.
  if (infrastructureFunds(fin) < cost) return { ok: false, error: 'Verba de obras insuficiente.' };

  moveMoney(fin, -cost);
  applyFacilityLevel(state, type);
  return { ok: true, newLevel: level + 1, cost };
}

/**
 * Melhoria GRÁTIS de uma instalação (recompensa por ver um vídeo). Disponível
 * de 5 em 5 jornadas (`career.freeUpgradePending`); fica à espera até ser usada.
 * Não paga do saldo. Consome a disponibilidade.
 */
export function claimFreeFacilityUpgrade(state: GameState, type: FacilityType): UpgradeResult {
  if (!state.career.freeUpgradePending) return { ok: false, error: 'Sem melhoria grátis disponível.' };
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return { ok: false, error: 'Clube inválido.' };
  const level = club.facilities[type];
  if (level >= FACILITY_MAX_LEVEL) return { ok: false, error: 'Nível máximo atingido.' };
  applyFacilityLevel(state, type);
  state.career.freeUpgradePending = false;
  return { ok: true, newLevel: level + 1, cost: 0 };
}

/** Sobe 1 nível uma instalação do clube gerido e aplica o efeito imediato. */
function applyFacilityLevel(state: GameState, type: FacilityType): void {
  const club = state.clubs[state.meta.managedClubId]!;
  club.facilities[type] = club.facilities[type] + 1;
  if (type === 'stadium') {
    club.stadiumCapacity = Math.round(club.stadiumCapacity * 1.18);
  }
}
