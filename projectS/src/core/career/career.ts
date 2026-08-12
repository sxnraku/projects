/**
 * Carreira do treinador — objetivos da direção, confiança, despedimento,
 * troféus, historial e bónus diário. Lógica pura, sem UI nem SDKs.
 */
import { Lang } from '../i18n';
import type { Finance } from '../models';
import { moveMoney } from '../economy';

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

/**
 * Preferências de som e vibração. Vivem no save (como o idioma) para o
 * utilizador não ter de as repor de cada vez que abre o jogo.
 */
export interface AudioSettings {
  /** Efeitos sonoros ligados. */
  sound: boolean;
  /** Volume 0..1 (o passo da UI é 0.25). */
  volume: number;
  /** Vibração/háptica ligada. */
  haptics: boolean;
}

/**
 * Por omissão o som vem a MEIO volume: é para dar vida ao jogo, não para
 * dominar. Quem quiser mais sobe nas definições; quem odiar desliga.
 */
export const DEFAULT_AUDIO: AudioSettings = { sound: true, volume: 0.5, haptics: true };

/** Sanitiza definições vindas de um save antigo ou corrompido. */
export function normalizeAudio(a: Partial<AudioSettings> | undefined): AudioSettings {
  if (!a) return { ...DEFAULT_AUDIO };
  const volume = typeof a.volume === 'number' && Number.isFinite(a.volume)
    ? Math.max(0, Math.min(1, a.volume))
    : DEFAULT_AUDIO.volume;
  return {
    sound: a.sound !== false,
    volume,
    haptics: a.haptics !== false,
  };
}

/** Quantos reforços recentes ficam guardados no save. */
export const SIGNINGS_KEPT = 30;

/** Um reforço contratado pelo clube gerido (para avaliar promessas). */
export interface SigningRecord {
  /** Nº de ordem monotónico na carreira. */
  n: number;
  date: string;
  overall: number;
}

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

  /** Reputação/prestígio do treinador (0..100) — cresce com o sucesso. */
  reputation?: number;
  /** Ofertas de clubes MAIORES por mérito (opcionais — aceitar muda de clube). */
  meritOffers?: string[];
  /** Países estrangeiros já explorados por olheiro → mercado internacional aberto. */
  scoutedCountries?: string[];
  /** Alvos internacionais já contratados (`slug:idx`) — para não voltarem à lista. */
  signedWorld?: string[];

  // Bónus diário (datas do MUNDO REAL, não do jogo)
  lastLoginDate: string; // "YYYY-MM-DD"
  loginStreak: number;

  /** Idioma escolhido pelo utilizador (persiste no save). */
  lang?: Lang;

  /** Som e vibração escolhidos pelo utilizador (persiste no save). */
  audio?: AudioSettings;

  /**
   * EQUIPA TÉCNICA do clube que geres. Vive na carreira (e não no clube) porque
   * é o TEU backroom: muda contigo quando mudas de clube. Ausente nos saves
   * anteriores — `ensureStaff` gera a inicial na primeira semana.
   */
  staff?: import('../staff/staff').StaffMember[];

  /**
   * PRÉ-CONTRATOS fechados nas últimas jornadas com jogadores de outros clubes
   * em fim de contrato (lei Bosman). Executam-se no rollover. Ausente nos saves
   * anteriores — ver `core/game/freeAgents.ts`.
   */
  preContracts?: import('../game/freeAgents').PreContract[];

  /** O tutorial de abas já foi visto nesta carreira? (mostra 1x por carreira). */
  tutorialSeen?: boolean;

  /** Rede de olheiros: conhecimento e missões. Inicializado sob demanda. */
  scouting?: ScoutingState;

  /** Academia: grupo atual de candidatos à experiência. Inicializado sob demanda. */
  academy?: AcademyState;

  /** Última época em que se pediu orçamento à direção (limita a 1×/época). */
  lastBudgetRequestSeason?: number;

  /**
   * Títulos SEGUIDOS por clube (`clubId` → nº de campeonatos consecutivos).
   *
   * Vive aqui, e não no `Club`, porque a tabela `clubs` do SQLite não tem
   * mecanismo de migração: acrescentar-lhe uma coluna partia os saves antigos.
   * O blob da carreira é gravado inteiro, por isso aceita campos novos de graça.
   */
  titleStreaks?: Record<string, number>;

  /**
   * Reforços feitos pelo clube gerido — serve para saber se uma promessa de
   * contratação foi cumprida (`core/game/relations.ts`). `signingsMade` é um
   * contador monotónico; a lista é truncada, o contador não.
   */
  signingsMade?: number;
  signings?: SigningRecord[];

  /**
   * ADEPTOS do clube gerido: humor, motivos e semanas de contestação. Vive aqui
   * (blob JSON gravado inteiro) para não precisar de migração do save, e muda
   * de clube contigo — cada praça começa com o seu próprio nível de exigência.
   * Ver `core/game/fans.ts`.
   */
  fans?: import('../game/fans').FanState;

  /**
   * IMPRENSA: a conferência já dada esta jornada e a bravata em aberto (uma
   * resposta atrevida que o próximo jogo confirma ou desmente).
   * Ver `core/game/press.ts`.
   */
  press?: import('../game/press').PressMemory;

  /** Melhoria de instalação GRÁTIS por vídeo disponível (fica até ser usada). */
  freeUpgradePending?: boolean;
  /** Jornadas jogadas desde a última melhoria grátis (nova a cada 5). */
  roundsSinceFreeUpgrade?: number;
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
    reputation: 45,
    meritOffers: [],
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

/**
 * Atualiza a reputação/prestígio do treinador no fim da época. Sobe com títulos,
 * subidas e boas classificações; desce com despromoções. Erosão natural leve
 * para que só o sucesso continuado leve um treinador ao topo.
 */
export function updateManagerReputation(
  career: CareerState,
  opts: { champion: boolean; promoted: boolean; relegated: boolean; position: number; met: boolean; fired: boolean },
): void {
  let d = -1;
  if (opts.champion) d += 13;
  else if (opts.promoted) d += 8;
  else if (opts.position <= 3) d += 4;
  else if (opts.met) d += 2;
  if (opts.relegated) d -= 12;
  if (opts.fired) d -= 8;
  career.reputation = Math.max(0, Math.min(100, (career.reputation ?? 45) + d));
}

// ---------- Interação com a direção: pedir orçamento ----------

export interface BudgetRequestResult {
  granted: number; // valor somado ao orçamento de transferências (0 = recusado)
  messageKey: string;
  messageParams?: import('../i18n').MsgParams;
}

/** Semanas de receita que a direção liberta, entre a confiança mínima e a máxima. */
export const BUDGET_WEEKS_MIN = 8;
export const BUDGET_WEEKS_MAX = 22;

/**
 * Pede um reforço de orçamento de transferências à direção.
 *
 * Regras: uma vez por época. A direção só cede se a confiança for razoável
 * (>= 40) e o valor cresce com a confiança.
 *
 * O montante é uma fatia da RECEITA DO PRÓPRIO CLUBE (8 a 22 semanas), não um
 * número fixo. Antes eram sempre ~5M para toda a gente: uma fortuna para um
 * clube da 3ª divisão e uma esmola para um grande — "não faz muito sentido",
 * como se apanhou no playtest. Ancorar na receita faz o reforço escalar sozinho
 * com o escalão, o país, a dimensão do clube e a época, sem mais parâmetros.
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

  const weeklyIncome = finance.income.sponsorship + finance.income.tvRights
    + finance.income.merchandising + finance.income.tickets;
  const confFactor = (career.confidence - 40) / 60; // 0..1
  const weeks = BUDGET_WEEKS_MIN + confFactor * (BUDGET_WEEKS_MAX - BUDGET_WEEKS_MIN);
  const granted = Math.max(100_000, Math.round(weeklyIncome * weeks / 100_000) * 100_000);
  moveMoney(finance, granted);
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
