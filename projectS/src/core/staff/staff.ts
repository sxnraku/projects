/**
 * EQUIPA TÉCNICA — as pessoas que trabalham contigo.
 *
 * Até aqui as instalações eram níveis abstratos que se compravam: subias o
 * "centro de treino" para 4 e os jogadores evoluíam mais depressa, sem que
 * ninguém estivesse lá a treiná-los. Metade de um jogo de gestão é escolher
 * PESSOAS — e pessoas custam salário, envelhecem e podem ser melhores do que o
 * clube merece.
 *
 * Como se encaixa no que já existe: o staff **soma-se** às instalações, não as
 * substitui. Um centro de nível 5 com um treinador fraco rende menos do que um
 * centro de nível 3 com um treinador de topo — e as duas coisas juntas rendem
 * mais do que qualquer uma sozinha.
 *
 * Vive no blob `career` (é o TEU backroom, não o do mundo): zero migração.
 */
import { Rng } from '../engine/rng';
import { FIRST_NAMES, LAST_NAMES } from '../game/names';

export const StaffRole = {
  /** Adjunto — organiza o trabalho: dá VAGAS de treino individual. */
  ASSISTANT: 'ASSISTANT',
  /** Treinador principal adjunto — evolução de todo o plantel. */
  COACH: 'COACH',
  /** Treinador de guarda-redes — evolução dos GR. */
  GK_COACH: 'GK_COACH',
  /** Preparador físico — recuperação de forma física entre jornadas. */
  FITNESS: 'FITNESS',
  /** Fisioterapeuta — encurta lesões (soma ao departamento médico). */
  PHYSIO: 'PHYSIO',
  /** Olheiro-chefe — precisão e velocidade das missões de observação. */
  SCOUT: 'SCOUT',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const STAFF_ROLES: StaffRole[] = [
  'ASSISTANT', 'COACH', 'GK_COACH', 'FITNESS', 'PHYSIO', 'SCOUT',
];

/** Um membro da equipa técnica. `ability` é 1..20, como os atributos. */
export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  ability: number;
  age: number;
  /** Salário SEMANAL. */
  wage: number;
}

/** Um lugar por função: não se contratam três treinadores de guarda-redes. */
export const MAX_PER_ROLE = 1;

export const ABILITY_MIN = 1;
export const ABILITY_MAX = 20;

/** Capacidade na escala do ecrã (0-100), como os jogadores. */
export const abilityTo100 = (ability: number): number =>
  Math.round(Math.max(0, Math.min(20, ability)) * 5);

// ---------------------------------------------------------------------------
// Salários
// ---------------------------------------------------------------------------

/**
 * Salário semanal pedido por um técnico. Cresce depressa com a capacidade (um
 * treinador de topo custa mesmo dinheiro) e escala com o escalão, para que um
 * clube da 3ª divisão não empregue o melhor preparador físico do país.
 */
export function staffWage(ability: number, tier: number): number {
  const base = 350 * Math.pow(1.28, Math.max(0, ability - 1));
  const div = tier <= 1 ? 1 : tier === 2 ? 0.45 : 0.22;
  return Math.max(150, Math.round((base * div) / 50) * 50);
}

/** Soma dos salários semanais da equipa técnica. */
export function staffWageBill(staff: StaffMember[]): number {
  let total = 0;
  for (const s of staff) total += s.wage;
  return total;
}

// ---------------------------------------------------------------------------
// Efeitos — é aqui que o staff deixa de ser decorativo
// ---------------------------------------------------------------------------

/** Capacidade do técnico numa função (0 se o lugar estiver vago). */
export function abilityOf(staff: StaffMember[], role: StaffRole): number {
  let best = 0;
  for (const s of staff) if (s.role === role && s.ability > best) best = s.ability;
  return best;
}

/**
 * Quantos planos de treino individual o clube aguenta.
 * Sem adjunto são 2 (o treinador sozinho); um adjunto de topo leva a 6.
 */
export function individualSlots(staff: StaffMember[]): number {
  return 2 + Math.floor(abilityOf(staff, 'ASSISTANT') / 5);
}

/**
 * Bónus de evolução no treino, somado ao do centro de treino.
 * `isKeeper` troca o treinador de campo pelo de guarda-redes.
 */
export function trainingBonus(staff: StaffMember[], isKeeper: boolean): number {
  const coach = abilityOf(staff, isKeeper ? 'GK_COACH' : 'COACH');
  const assistant = abilityOf(staff, 'ASSISTANT');
  // Máximo ~0.09 — da mesma ordem do centro de treino nível 5 (0.12).
  return coach * 0.0035 + assistant * 0.001;
}

/** Forma física extra recuperada por semana (soma à recuperação normal). */
export function fitnessBonus(staff: StaffMember[]): number {
  return abilityOf(staff, 'FITNESS') * 0.45; // até ~9 pontos/semana
}

/**
 * Multiplicador da duração das lesões (1 = sem efeito). Um fisioterapeuta de
 * topo corta ~35%; junta-se ao departamento médico das instalações.
 */
export function injuryDurationFactor(staff: StaffMember[]): number {
  return 1 - abilityOf(staff, 'PHYSIO') * 0.0175;
}

/** Níveis EFETIVOS de scouting: instalações + olheiro-chefe. */
export function effectiveScoutingLevel(staff: StaffMember[], facilityLevel: number): number {
  return facilityLevel + abilityOf(staff, 'SCOUT') / 7; // até +~2.9 níveis
}

// ---------------------------------------------------------------------------
// Mercado de técnicos
// ---------------------------------------------------------------------------

/**
 * Candidatos disponíveis para uma função. Determinístico: a mesma época e o
 * mesmo clube dão sempre a mesma lista, por isso não vale a pena "rodar" o ecrã
 * à espera de um melhor.
 *
 * O teto de capacidade sobe com a reputação do clube — ninguém de topo aceita
 * trabalhar na 3ª divisão, tal como acontece com os jogadores.
 */
export function staffCandidates(
  role: StaffRole,
  clubReputation: number,
  tier: number,
  rng: Rng,
  count = 4,
): StaffMember[] {
  const ceiling = Math.max(6, Math.min(ABILITY_MAX, Math.round(4 + clubReputation / 5)));
  const floor = Math.max(ABILITY_MIN, ceiling - 8);
  const out: StaffMember[] = [];
  for (let i = 0; i < count; i++) {
    const ability = rng.int(floor, ceiling);
    const age = rng.int(32, 62);
    out.push({
      id: `staff_${role}_${i}_${ability}_${age}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      role,
      ability,
      age,
      wage: staffWage(ability, tier),
    });
  }
  return out.sort((a, b) => b.ability - a.ability);
}

/**
 * Equipa técnica inicial de um clube: nem todos os lugares preenchidos, e a
 * qualidade acompanha a reputação. É o que o clube já tinha quando chegaste.
 */
export function initialStaff(clubReputation: number, tier: number, rng: Rng): StaffMember[] {
  const out: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    // Clubes pequenos têm lugares por preencher — o backroom é um objetivo.
    const chance = 0.35 + clubReputation / 150;
    if (!rng.chance(Math.min(0.95, chance))) continue;
    const ceiling = Math.max(5, Math.min(ABILITY_MAX - 3, Math.round(2 + clubReputation / 6)));
    const ability = rng.int(Math.max(ABILITY_MIN, ceiling - 6), ceiling);
    out.push({
      id: `staff_${role}_init_${ability}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      role,
      ability,
      age: rng.int(34, 60),
      wage: staffWage(ability, tier),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contratar / despedir
// ---------------------------------------------------------------------------

export interface StaffChangeResult {
  ok: boolean;
  errorKey?: string;
  params?: import('../i18n').MsgParams;
  /** Quem saiu para dar lugar ao novo (a UI avisa). */
  replaced?: StaffMember;
}

/**
 * Contrata um técnico. Um lugar por função: contratar para um lugar ocupado
 * substitui quem lá estava (e a UI diz-lo antes).
 */
export function hireStaff(
  staff: StaffMember[],
  member: StaffMember,
): StaffChangeResult {
  const atRole = staff.filter((s) => s.role === member.role);
  let replaced: StaffMember | undefined;
  if (atRole.length >= MAX_PER_ROLE) {
    replaced = atRole[0];
    const idx = staff.findIndex((s) => s.id === replaced!.id);
    if (idx >= 0) staff.splice(idx, 1);
  }
  staff.push({ ...member });
  return { ok: true, replaced };
}

/** Despede um técnico. Sem indemnização: o contrato é semanal. */
export function fireStaff(staff: StaffMember[], staffId: string): StaffChangeResult {
  const idx = staff.findIndex((s) => s.id === staffId);
  if (idx < 0) return { ok: false, errorKey: 'staff.error.notFound' };
  staff.splice(idx, 1);
  return { ok: true };
}
