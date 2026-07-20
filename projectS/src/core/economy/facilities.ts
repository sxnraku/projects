import { Facilities, FACILITY_MAX_LEVEL, GameState } from '../models';

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
};

export const FACILITY_EFFECTS: Record<FacilityType, string> = {
  stadium: '+18% capacidade por nível',
  training: 'Evolução mais rápida no treino',
  academy: 'Jovens da fornada com mais qualidade',
  medical: 'Lesões recuperam mais depressa',
};

/** Custo do próximo nível (cresce de forma acentuada). */
export function facilityUpgradeCost(type: FacilityType, currentLevel: number): number {
  // Custos altos + curva acentuada (2.2^n): melhorar instalações é um
  // investimento de várias épocas, como nos jogos de gestão a sério — não algo
  // que se maximiza numa temporada.
  const base: Record<FacilityType, number> = {
    stadium: 8_000_000,
    training: 6_000_000,
    academy: 5_000_000,
    medical: 4_000_000,
  };
  return Math.round(base[type] * Math.pow(2.2, currentLevel - 1));
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

  const cost = facilityUpgradeCost(type, level);
  if (fin.balance < cost) return { ok: false, error: 'Saldo insuficiente.' };

  fin.balance -= cost;
  club.facilities[type] = level + 1;

  // Efeito imediato do estádio: capacidade sobe já.
  if (type === 'stadium') {
    club.stadiumCapacity = Math.round(club.stadiumCapacity * 1.18);
  }

  return { ok: true, newLevel: level + 1, cost };
}
