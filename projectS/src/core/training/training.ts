import {
  ATTR_MAX,
  ATTR_MIN,
  naturalOverall,
  Player,
  PlayerAttributes,
} from '../models';
import { Rng } from '../engine/rng';

/** Foco de treino da semana — determina que atributos podem evoluir. */
export const TrainingFocus = {
  PHYSICAL: 'PHYSICAL',
  TECHNICAL: 'TECHNICAL',
  TACTICAL: 'TACTICAL', // mentais
  RECOVERY: 'RECOVERY', // sem evolução, recupera mais forma física
} as const;
export type TrainingFocus = (typeof TrainingFocus)[keyof typeof TrainingFocus];

const FOCUS_ATTRS: Record<TrainingFocus, (keyof PlayerAttributes)[]> = {
  PHYSICAL: ['pace', 'stamina', 'strength', 'agility'],
  TECHNICAL: ['finishing', 'passing', 'dribbling', 'tackling', 'heading', 'goalkeeping'],
  TACTICAL: ['positioning', 'composure', 'teamwork', 'vision'],
  RECOVERY: [],
};

const PEAK_AGE = 24; // idade até à qual há crescimento fácil
const DECLINE_AGE = 31; // idade a partir da qual atributos físicos caem

/** Recuperação de forma física por semana com treino RECOVERY vs normal. */
const FITNESS_RECOVERY = { RECOVERY: 25, NORMAL: 12 };

interface TrainingChange {
  playerId: string;
  attribute: keyof PlayerAttributes | null;
  delta: number; // +1 melhoria, -1 declínio
}

/**
 * Aplica uma semana de treino a um jogador. Muta atributos e condição.
 *
 * Regras:
 *  - Crescimento: se idade <= PEAK e overall < potencial, hipótese de +1 num
 *    atributo do foco (maior hipótese quanto mais jovem e maior a margem).
 *  - Declínio: se idade >= DECLINE, hipótese de -1 num atributo físico.
 *  - Forma física recupera (mais com RECOVERY).
 *  - Forma (form) deriva lentamente para a moral.
 *
 * @param rng gerador determinístico (derivar da seed-mãe + semana + playerId)
 * @returns a alteração de atributo aplicada (para log/notícias), se houver.
 */
export function trainPlayer(
  player: Player,
  focus: TrainingFocus,
  rng: Rng,
  /** Bónus do centro de treino do clube (0..~0.12) — soma à hipótese de evoluir. */
  growthBonus = 0,
): TrainingChange {
  const overall = naturalOverall(player);
  const change: TrainingChange = { playerId: player.id, attribute: null, delta: 0 };

  // --- Crescimento ---
  if (player.age <= PEAK_AGE && overall < player.potential && focus !== 'RECOVERY') {
    const gap = player.potential - overall;
    const youth = (PEAK_AGE - player.age + 1) / (PEAK_AGE - 15 + 1); // 0..1
    const growthChance = Math.min(0.65, 0.15 + gap * 0.05 + youth * 0.2 + growthBonus);
    if (rng.chance(growthChance)) {
      const attr = pickImprovable(player.attributes, FOCUS_ATTRS[focus], rng);
      if (attr) {
        player.attributes[attr] = Math.min(ATTR_MAX, player.attributes[attr] + 1);
        change.attribute = attr;
        change.delta = 1;
      }
    }
  }

  // --- Declínio (só físicos, veteranos) ---
  if (player.age >= DECLINE_AGE) {
    const declineChance = 0.05 + (player.age - DECLINE_AGE) * 0.04;
    if (rng.chance(declineChance)) {
      const physical = FOCUS_ATTRS.PHYSICAL.filter((a) => player.attributes[a] > ATTR_MIN);
      if (physical.length > 0) {
        const attr = rng.pick(physical);
        player.attributes[attr] = Math.max(ATTR_MIN, player.attributes[attr] - 1);
        // Declínio sobrepõe-se ao registo só se não houve melhoria.
        if (change.delta === 0) { change.attribute = attr; change.delta = -1; }
      }
    }
  }

  // --- Recuperação física e deriva de forma ---
  const recovery = focus === 'RECOVERY' ? FITNESS_RECOVERY.RECOVERY : FITNESS_RECOVERY.NORMAL;
  player.condition.fitness = Math.min(100, player.condition.fitness + recovery);
  player.condition.form += Math.sign(player.condition.morale - player.condition.form) * 2;

  return change;
}

/** Escolhe um atributo do foco que ainda não esteja no máximo, preferindo os mais baixos. */
function pickImprovable(
  attrs: PlayerAttributes,
  candidates: (keyof PlayerAttributes)[],
  rng: Rng,
): keyof PlayerAttributes | null {
  const improvable = candidates.filter((a) => attrs[a] < ATTR_MAX);
  if (improvable.length === 0) return null;
  // Peso inverso ao valor: atributos mais fracos crescem mais depressa.
  const weights = improvable.map((a) => ATTR_MAX - attrs[a] + 1);
  return improvable[rng.weightedIndex(weights)]!;
}
