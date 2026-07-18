/**
 * Carreira do treinador — objetivos da direção, confiança, despedimento,
 * troféus, historial e bónus diário. Lógica pura, sem UI nem SDKs.
 */

/** Objetivo definido pela direção no início da época. */
export const Objective = {
  TITLE: 'TITLE', // lutar pelo título (terminar em 1º-2º)
  TOP_HALF: 'TOP_HALF', // primeira metade da tabela
  AVOID_RELEGATION: 'AVOID_RELEGATION', // fugir à despromoção
} as const;
export type Objective = (typeof Objective)[keyof typeof Objective];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  TITLE: 'Lutar pelo título',
  TOP_HALF: 'Terminar na 1ª metade',
  AVOID_RELEGATION: 'Evitar a despromoção',
};

/** Registo de uma época concluída (linha do historial). */
export interface SeasonRecord {
  season: number;
  clubId: string;
  clubName: string;
  leagueName: string;
  tier: number;
  position: number;
  points: number;
  won: number;
  drawn: number;
  lost: number;
  champion: boolean;
  promoted: boolean;
  relegated: boolean;
}

/** Troféu conquistado. */
export interface Trophy {
  season: number;
  label: string; // ex: "Campeão — Liga Principal"
}

/** Estado completo da carreira, persistido no save. */
export interface CareerState {
  objective: Objective;
  confidence: number; // confiança da direção 0..100
  seasons: SeasonRecord[];
  trophies: Trophy[];
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  timesFired: number;
  /** Ofertas de emprego pendentes (clubIds) após despedimento. Vazio = empregado. */
  pendingOffers: string[];

  // Bónus diário (datas do MUNDO REAL, não do jogo)
  lastLoginDate: string; // "YYYY-MM-DD"
  loginStreak: number;
}

export function initialCareer(): CareerState {
  return {
    objective: 'TOP_HALF',
    confidence: 60,
    seasons: [],
    trophies: [],
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    timesFired: 0,
    pendingOffers: [],
    lastLoginDate: '',
    loginStreak: 0,
  };
}

/**
 * Atribui o objetivo da época com base na posição esperada do clube
 * (ranking de reputação dentro da liga).
 */
export function assignObjective(expectedRank: number, leagueSize: number): Objective {
  if (expectedRank <= 2) return 'TITLE';
  if (expectedRank <= Math.ceil(leagueSize / 2)) return 'TOP_HALF';
  return 'AVOID_RELEGATION';
}

/** Posição-alvo (limite) para o objetivo cumprido. */
export function objectiveTarget(objective: Objective, leagueSize: number): number {
  if (objective === 'TITLE') return 2;
  if (objective === 'TOP_HALF') return Math.ceil(leagueSize / 2);
  return leagueSize - 2; // acima da zona de despromoção (últimos 2)
}

/**
 * Atualiza a confiança da direção após uma jornada.
 * Compara a posição atual com o alvo do objetivo: acima = sobe, abaixo = desce.
 * Muta o career. Devolve a nova confiança.
 */
export function updateConfidence(
  career: CareerState,
  currentPosition: number,
  leagueSize: number,
): number {
  const target = objectiveTarget(career.objective, leagueSize);
  const delta = currentPosition <= target ? +2 : currentPosition <= target + 2 ? -1 : -3;
  career.confidence = Math.max(0, Math.min(100, career.confidence + delta));
  return career.confidence;
}

/** Resultado da avaliação de fim de época pela direção. */
export interface BoardVerdict {
  metObjective: boolean;
  fired: boolean;
  message: string;
}

/**
 * Avaliação de fim de época: cumpriu o objetivo?
 * Despedido se falhou por margem grande OU se a confiança colapsou.
 */
export function evaluateSeason(
  career: CareerState,
  finalPosition: number,
  leagueSize: number,
  relegated: boolean,
): BoardVerdict {
  const target = objectiveTarget(career.objective, leagueSize);
  const met = finalPosition <= target && !(career.objective !== 'AVOID_RELEGATION' && relegated);

  if (met) {
    career.confidence = Math.min(100, career.confidence + 15);
    return { metObjective: true, fired: false, message: 'A direção está satisfeita. Objetivo cumprido!' };
  }

  const badMiss = finalPosition > target + 3 || relegated;
  const fired = badMiss || career.confidence <= 15;
  if (fired) {
    career.timesFired += 1;
    return { metObjective: false, fired: true, message: 'A direção perdeu a paciência. Foste despedido.' };
  }

  career.confidence = Math.max(0, career.confidence - 15);
  return { metObjective: false, fired: false, message: 'Objetivo falhado. A direção dá-te mais uma época — a última.' };
}

// ---------- Bónus diário (retenção) ----------

export const DAILY_BONUS_BASE = 100_000;
export const DAILY_BONUS_MAX_STREAK = 7;

/** O bónus de hoje está disponível? (data real, não do jogo) */
export function dailyBonusAvailable(career: CareerState, todayISO: string): boolean {
  return career.lastLoginDate !== todayISO;
}

/** Valor do bónus para uma streak (dia 1 = 100k … dia 7+ = 700k). */
export function dailyBonusAmount(streak: number): number {
  return DAILY_BONUS_BASE * Math.min(Math.max(1, streak), DAILY_BONUS_MAX_STREAK);
}

/**
 * Reclama o bónus diário. Muta o career (streak/data) e devolve o valor a
 * creditar. Streak continua se o último login foi ontem; senão reinicia.
 */
export function claimDailyBonus(career: CareerState, todayISO: string): number {
  if (!dailyBonusAvailable(career, todayISO)) return 0;

  const yesterday = addDaysISO(todayISO, -1);
  career.loginStreak = career.lastLoginDate === yesterday ? career.loginStreak + 1 : 1;
  career.lastLoginDate = todayISO;
  return dailyBonusAmount(career.loginStreak);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
