/**
 * Carreira do treinador — objetivos da direção, confiança, despedimento,
 * troféus, historial e bónus diário. Lógica pura, sem UI nem SDKs.
 */
import { Lang } from '../i18n';
import type { Finance } from '../models';

/** Objetivo definido pela direção no início da época. */
export const Objective = {
  TITLE: 'TITLE', // lutar pelo título (terminar em 1º-2º)
  TOP_HALF: 'TOP_HALF', // primeira metade da tabela
  AVOID_RELEGATION: 'AVOID_RELEGATION', // fugir à despromoção
} as const;
export type Objective = (typeof Objective)[keyof typeof Objective];

/** Chave i18n do objetivo (a UI traduz). */
export const OBJECTIVE_KEYS: Record<Objective, string> = {
  TITLE: 'objective.TITLE',
  TOP_HALF: 'objective.TOP_HALF',
  AVOID_RELEGATION: 'objective.AVOID_RELEGATION',
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

/** Troféu conquistado (chave i18n + params; a UI traduz). */
export interface Trophy {
  season: number;
  key: string;
  params?: import('../i18n').MsgParams;
}

/** Uma missão de olheiro em curso (persistida no save). */
export interface ScoutMission {
  id: string;
  kind: 'PLAYER' | 'LEAGUE';
  targetId: string; // playerId (PLAYER) ou leagueId (LEAGUE)
  roundsLeft: number; // jornadas até o relatório ficar pronto
  total: number; // jornadas totais (para a barra de progresso)
}

/** Conhecimento acumulado pela rede de olheiros do clube gerido. */
export interface ScoutingState {
  known: string[]; // ids de jogadores com relatório completo (info exata)
  missions: ScoutMission[]; // missões em curso
  prospects: string[]; // promessas descobertas por missões a ligas (para a shortlist)
}

/**
 * Academia de jovens: grupo de candidatos à experiência (ainda NÃO no plantel).
 * Os candidatos vivem aqui embutidos (não em state.players) para não poluírem o
 * mercado; ao recrutar, o jogador passa para o plantel.
 */
export interface AcademyState {
  candidates: import('../models').Player[];
  season: number; // época em que o grupo foi gerado (refresca a cada época)
  gen: number; // contador de grupos gerados (varia a seed a cada "novo grupo")
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

  /** Idioma escolhido pelo utilizador (persiste no save). */
  lang?: Lang;

  /** O tutorial de abas já foi visto nesta carreira? (mostra 1x por carreira). */
  tutorialSeen?: boolean;

  /** Rede de olheiros: conhecimento e missões. Inicializado sob demanda. */
  scouting?: ScoutingState;

  /** Academia: grupo atual de candidatos à experiência. Inicializado sob demanda. */
  academy?: AcademyState;

  /** Última época em que se pediu orçamento à direção (limita a 1×/época). */
  lastBudgetRequestSeason?: number;
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
  messageKey: string; // chave i18n (a UI traduz)
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
    return { metObjective: true, fired: false, messageKey: 'board.satisfied' };
  }

  const badMiss = finalPosition > target + 3 || relegated;
  const fired = badMiss || career.confidence <= 15;
  if (fired) {
    career.timesFired += 1;
    return { metObjective: false, fired: true, messageKey: 'board.fired' };
  }

  career.confidence = Math.max(0, career.confidence - 15);
  return { metObjective: false, fired: false, messageKey: 'board.lastChance' };
}

// ---------- Interação com a direção: pedir orçamento ----------

export interface BudgetRequestResult {
  granted: number; // valor somado ao orçamento de transferências (0 = recusado)
  messageKey: string;
  messageParams?: import('../i18n').MsgParams;
}

/**
 * Pede um reforço de orçamento de transferências à direção.
 *
 * Regras: uma vez por época. A direção só cede se a confiança for razoável
 * (>= 40); o valor cresce com a confiança e com o escalão (1ª divisão = mais).
 * Pedir custa um pouco de confiança (a direção não gosta de choradeira).
 */
export function requestTransferBudget(
  career: CareerState,
  finance: Finance,
  tier: number,
  season: number,
): BudgetRequestResult {
  if (career.lastBudgetRequestSeason === season) {
    return { granted: 0, messageKey: 'board.budget.already' };
  }
  career.lastBudgetRequestSeason = season;

  if (career.confidence < 40) {
    return { granted: 0, messageKey: 'board.budget.refused' };
  }

  const divFactor = Math.pow(0.5, Math.max(0, tier - 1)); // 1ª=1, 2ª=0.5, 3ª=0.25…
  const confFactor = (career.confidence - 40) / 60; // 0..1
  const granted = Math.round(4_000_000 * divFactor * (0.3 + confFactor) / 100_000) * 100_000;
  finance.transferBudget += granted;
  career.confidence = Math.max(0, career.confidence - 3);

  return {
    granted,
    messageKey: 'board.budget.granted',
    messageParams: { amount: granted.toLocaleString('pt-PT') },
  };
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
