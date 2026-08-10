import {
  ATTR_MAX,
  ATTR_MIN,
  naturalOverall,
  naturalOverallFine,
  Player,
  PlayerAttributes,
  positionAttrWeights,
} from '../models';
import { Rng } from '../engine/rng';

/** Todos os atributos (para o treino escolher onde crescer). */
const ALL_ATTRS: (keyof PlayerAttributes)[] = [
  'pace', 'stamina', 'strength', 'agility', 'finishing', 'passing', 'dribbling',
  'tackling', 'heading', 'goalkeeping', 'positioning', 'composure', 'teamwork', 'vision',
];

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

export const PEAK_AGE = 24; // idade até à qual há crescimento FÁCIL
/**
 * Ainda se pode crescer até aqui, mas devagar — os "late bloomers".
 * Antes o crescimento parava seco aos 24: um jogador de 25 anos com 80 e teto
 * 100 ficava congelado para sempre, com a ficha a prometer 100 e o ecrã de
 * treino a dizer "no auge". Nem melhorava nem a promessa desaparecia.
 */
export const GROWTH_LIMIT_AGE = 28;
/** Quão mais lento é crescer depois do pico (fração da hipótese normal). */
const LATE_GROWTH_SCALE = 0.35;
const DECLINE_AGE = 31; // idade a partir da qual atributos físicos caem

/**
 * A partir desta idade o potencial por cumprir começa a EVAPORAR-SE.
 *
 * É a outra metade do problema: sem isto, um jogador que claramente nunca ia
 * chegar ao teto continuava a exibir "potencial 100" até se reformar. Agora o
 * teto aproxima-se da realidade um quarto da distância por época, portanto aos
 * ~30 anos o potencial anunciado é praticamente o que ele é mesmo.
 */
export const POTENTIAL_FADE_AGE = 26;
export const POTENTIAL_FADE_RATE = 0.25;

/** Recuperação de forma física por semana com treino RECOVERY vs normal. */
/** FIT recuperado por semana de treino (exportado: a UI mostra o saldo real). */
export const FITNESS_RECOVERY = { RECOVERY: 25, NORMAL: 12 };

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
  /** Forma física extra recuperada por semana (preparador físico). */
  fitnessBonus = 0,
): TrainingChange {
  const overall = naturalOverall(player);
  const change: TrainingChange = { playerId: player.id, attribute: null, delta: 0 };

  // --- Crescimento ---
  // Progressão gradual mas VISÍVEL: um jovem-promessa sobe de forma clara ao
  // longo de 1-2 épocas. O crescimento acerta nos atributos que contam para a
  // posição (por isso o OVERALL sobe mesmo), com o FOCO a dar um empurrão.
  if (player.age <= GROWTH_LIMIT_AGE && overall < player.potential && focus !== 'RECOVERY') {
    const gap = player.potential - overall;
    const youth = Math.max(0, (PEAK_AGE - player.age + 1) / (PEAK_AGE - 15 + 1)); // 0..1
    // Passado o pico ainda se evolui, mas a conta-gotas.
    const late = player.age > PEAK_AGE ? LATE_GROWTH_SCALE : 1;
    const growthChance = Math.min(0.5, (0.06 + gap * 0.03 + youth * 0.18 + growthBonus) * late);
    if (rng.chance(growthChance)) {
      const attr = pickGrowthAttr(player, focus, rng);
      if (attr) {
        player.attributes[attr] = Math.min(ATTR_MAX, player.attributes[attr] + 1);
        change.attribute = attr;
        change.delta = 1;
        player.condition.devSeason = (player.condition.devSeason ?? 0) + 1;
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
  const recovery = (focus === 'RECOVERY' ? FITNESS_RECOVERY.RECOVERY : FITNESS_RECOVERY.NORMAL)
    + fitnessBonus;
  player.condition.fitness = Math.min(100, player.condition.fitness + recovery);
  player.condition.form += Math.sign(player.condition.morale - player.condition.form) * 2;

  return change;
}

/**
 * Aproxima o potencial da realidade nos jogadores que já passaram a idade de
 * crescer. Chamar UMA vez por época (no rollover, depois de envelhecer).
 *
 * Sem isto a ficha prometia para sempre um teto que o jogador nunca ia atingir.
 * O teto nunca desce abaixo do que ele JÁ é — um jogador não "perde" potencial
 * que já concretizou.
 */
export function fadePotential(player: Player): void {
  if (player.age < POTENTIAL_FADE_AGE) return;
  const overall = naturalOverallFine(player);
  const gap = player.potential - overall;
  if (gap <= 0) {
    player.potential = Math.max(player.potential, overall);
    return;
  }
  // Duas casas decimais: arredondar a meios pontos fazia o valor saltar de volta
  // ao original quando a diferença era pequena, e o teto ficava encravado para
  // sempre a prometer mais do que o jogador ia dar.
  const faded = player.potential - gap * POTENTIAL_FADE_RATE;
  player.potential = Math.max(overall, Math.round(faded * 100) / 100);
}

/**
 * Escolhe QUE atributo cresce. Prioriza os que pesam na posição do jogador (para
 * o overall subir de forma visível), com o FOCO da semana a dar um empurrão e os
 * atributos mais fracos a evoluírem um pouco mais depressa.
 */
function pickGrowthAttr(player: Player, focus: TrainingFocus, rng: Rng): keyof PlayerAttributes | null {
  const attrs = player.attributes;
  const cands = ALL_ATTRS.filter((a) => attrs[a] < ATTR_MAX);
  if (cands.length === 0) return null;
  const w = positionAttrWeights(player.positions[0]!); // relevância p/ a posição
  const focusSet = new Set(FOCUS_ATTRS[focus]);
  const weights = cands.map((a) => {
    const rel = (w[a] ?? 0) * 12;                 // faz subir o OVR
    const focusB = focusSet.has(a) ? 3 : 0;       // o foco da semana ajuda
    const low = (ATTR_MAX - attrs[a]) * 0.25;     // fracos crescem mais
    return rel + focusB + low + 0.3;
  });
  return cands[rng.weightedIndex(weights)]!;
}
