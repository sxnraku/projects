import {
  ATTR_MAX,
  ATTR_MIN,
  PCT_MAX,
  PCT_MIN,
  Position,
} from './enums';
import { Player, PlayerAttributes } from './player';
import { isValidLineup, Tactic } from './tactic';

/** Resultado de validação: lista de erros. Vazia = válido. */
export type ValidationErrors = string[];

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  'pace', 'stamina', 'strength', 'agility',
  'finishing', 'passing', 'dribbling', 'tackling', 'heading', 'goalkeeping',
  'positioning', 'composure', 'teamwork', 'vision',
];

function inRange(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min && v <= max;
}

/** Valida a integridade de um jogador. Usado ao carregar saves e ao gerar seeds. */
export function validatePlayer(p: Player): ValidationErrors {
  const errors: ValidationErrors = [];

  if (!p.id) errors.push('player.id vazio');
  if (p.positions.length === 0) errors.push(`${p.id}: sem posições`);
  if (p.age < 15 || p.age > 45) errors.push(`${p.id}: idade fora de 15..45 (${p.age})`);

  for (const k of ATTR_KEYS) {
    if (!inRange(p.attributes[k], ATTR_MIN, ATTR_MAX)) {
      errors.push(`${p.id}: atributo ${k}=${p.attributes[k]} fora de ${ATTR_MIN}..${ATTR_MAX}`);
    }
  }

  if (!inRange(p.potential, ATTR_MIN, ATTR_MAX)) {
    errors.push(`${p.id}: potential=${p.potential} fora de ${ATTR_MIN}..${ATTR_MAX}`);
  }

  const c = p.condition;
  for (const [name, v] of [['form', c.form], ['morale', c.morale], ['fitness', c.fitness]] as const) {
    if (!inRange(v, PCT_MIN, PCT_MAX)) {
      errors.push(`${p.id}: ${name}=${v} fora de ${PCT_MIN}..${PCT_MAX}`);
    }
  }

  for (const pos of p.positions) {
    if (!(pos in Position)) errors.push(`${p.id}: posição inválida ${pos}`);
  }

  return errors;
}

/** Valida a tática — onze completo e jogadores pertencentes ao clube. */
export function validateTactic(t: Tactic, squad: Set<string>): ValidationErrors {
  const errors: ValidationErrors = [];

  if (!isValidLineup(t)) errors.push(`${t.clubId}: onze inválido (precisa de 11 jogadores únicos)`);

  for (const slot of t.lineup) {
    if (!squad.has(slot.playerId)) {
      errors.push(`${t.clubId}: ${slot.playerId} no onze não pertence ao plantel`);
    }
  }

  return errors;
}
