import {
  ATTR_MAX,
  ATTR_MIN,
  PCT_MAX,
  PCT_MIN,
  Position,
} from './enums';
import { GameState } from './gameState';
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

function isDict(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valida um save que veio de FORA do dispositivo (nuvem, ficheiro) antes de o
 * deixar entrar na store.
 *
 * ⚠️ PORQUÊ ISTO EXISTE: o estado restaurado é gravado no SQLite pelo auto-save
 * poucos segundos depois. Se entrar lixo (ficheiro truncado, JSON de outra app,
 * save de uma versão futura), a UI rebenta E o lixo fica gravado por cima do
 * save bom — o jogo deixa de arrancar. Validar antes é a única barreira.
 *
 * Verifica só a ESTRUTURA e as ligações essenciais, não as regras de jogo:
 * barato o suficiente para correr no restauro e suficiente para apanhar
 * corrupção real.
 */
export function validateRestoredState(raw: unknown): ValidationErrors {
  const errors: ValidationErrors = [];
  if (!isDict(raw)) return ['save não é um objeto'];

  for (const key of ['meta', 'players', 'clubs', 'leagues', 'career'] as const) {
    if (!isDict(raw[key])) errors.push(`falta a secção "${key}"`);
  }
  if (errors.length > 0) return errors; // sem estas secções não vale a pena continuar

  const meta = raw.meta as Record<string, unknown>;
  if (typeof meta.managedClubId !== 'string' || !meta.managedClubId) {
    errors.push('meta.managedClubId em falta');
  }
  if (!Number.isFinite(Number(meta.season))) errors.push(`meta.season inválida (${String(meta.season)})`);
  if (typeof meta.currentDate !== 'string') errors.push('meta.currentDate em falta');

  const players = raw.players as Record<string, unknown>;
  const clubs = raw.clubs as Record<string, unknown>;
  const leagues = raw.leagues as Record<string, unknown>;
  if (Object.keys(players).length === 0) errors.push('save sem jogadores');
  if (Object.keys(clubs).length === 0) errors.push('save sem clubes');
  if (Object.keys(leagues).length === 0) errors.push('save sem ligas');
  if (errors.length > 0) return errors;

  const managed = clubs[meta.managedClubId as string];
  if (!isDict(managed)) {
    errors.push(`clube gerido ${String(meta.managedClubId)} não existe no save`);
    return errors;
  }

  // O plantel do clube gerido tem de apontar para jogadores que existem — é o
  // que a UI toca primeiro e onde a corrupção parcial se manifesta.
  const squad = (managed as { squad?: unknown }).squad;
  if (!Array.isArray(squad) || squad.length === 0) {
    errors.push('clube gerido sem plantel');
  } else {
    const missing = squad.filter((id) => typeof id !== 'string' || !(id in players));
    if (missing.length > 0) errors.push(`${missing.length} jogadores do plantel não existem no save`);
  }

  // Conteúdo: TODO o plantel gerido (é o que a UI desenha primeiro, e onde uma
  // corrupção rebenta logo) mais uma amostra do resto do mundo — sem pagar a
  // validação completa de centenas de jogadores.
  const squadIds = Array.isArray(squad) ? squad.filter((id): id is string => typeof id === 'string') : [];
  const sample = [
    ...squadIds.map((id) => players[id]).filter((p) => p !== undefined),
    ...Object.values(players).slice(0, 25),
  ];
  for (const p of sample) {
    if (!isDict(p) || !isDict((p as { attributes?: unknown }).attributes) || !isDict((p as { condition?: unknown }).condition)) {
      errors.push('jogadores com formato inválido');
      break;
    }
    const pErrors = validatePlayer(p as unknown as Player);
    if (pErrors.length > 0) {
      errors.push(`jogador inválido: ${pErrors[0]}`);
      break;
    }
  }

  return errors;
}

/** True se `raw` pode ser carregado com segurança como estado de jogo. */
export function isRestorableState(raw: unknown): raw is GameState {
  return validateRestoredState(raw).length === 0;
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
