import { create } from 'zustand';
import {
  BidItem,
  Club,
  ContractClauses,
  Fixture,
  GameState,
  InboxItem,
  MatchResult,
  Player,
  PromiseKind,
  StandingRow,
  Tactic,
} from '../core/models';
import {
  acceptJobOffer,
  acceptMeritOffer,
  advanceWeek,
  createNewGame,
  isEuroWeek,
  managedLeagueId,
  NewGameOptions,
  nextRound,
  replayFixture,
  acceptBid as coreAcceptBid,
  counterBid as coreCounterBid,
  resolveCrisis as coreResolveCrisis,
  answerPress as coreAnswerPress,
  ensureFans,
  fanBand,
  fanMood,
  acceptCounter as coreAcceptCounter,
  optimizeLineup,
  availableBudget as coreAvailableBudget,
  blockingCounts,
  BlockingCounts,
  blockingReason,
  BidDecision,
  dismissItem as coreDismissItem,
  ensureValidLineup,
  MatchdayPreview,
  matchdayPreview,
  Reachability,
  reachability,
  rejectBid as coreRejectBid,
  RenewalDecision,
  reservedBudget as coreReservedBudget,
  resolveRenewal as coreResolveRenewal,
  resolveRequest as coreResolveRequest,
  rolloverSeason,
  RotationResult,
  SeasonSummary,
  setManagedObjective,
  setTransferListed,
  submitPendingOffer,
  SubmitResult,
  WeekReport,
  WeekResult,
  withdrawOffer as coreWithdrawOffer,
  youthTrial,
  activeMissions as coreScoutMissions,
  canScoutLeague,
  canScoutPlayer,
  cancelMission,
  freeSlots as coreFreeSlots,
  isPotentialKnown,
  potentialRange,
  PotentialRange,
  scoutableProspects,
  scoutingLevel,
  scoutSlots,
  startLeagueMission,
  startPlayerMission,
  tierInRange,
  academyCandidates as coreAcademyCandidates,
  recruitAcademyCandidate,
  generateAcademyBatch,
  RecruitResult,
  loanOutCandidates,
  loanInMarket,
  loanOut as coreLoanOut,
  loanIn as coreLoanIn,
  terminateLoan as coreTerminateLoan,
  buyReturnedPlayer as coreBuyReturnedPlayer,
  LoanResult,
  ReturnedLoan,
  applyMatchChanges as coreApplyMatchChanges,
  MatchAdjustment,
  talkTo as coreTalkTo,
  promiseTo as corePromiseTo,
  TalkKind,
  TalkResult,
  scoutCountry as coreScoutCountry,
  internationalTargets as coreInternationalTargets,
  signWorldTarget as coreSignWorldTarget,
  scoutCountryCost as coreScoutCountryCost,
  WorldTarget,
  BgLeague,
} from '../core/game';
import {
  applyEuroMatchChanges as coreApplyEuroMatchChanges,
  europeInProgress,
  nextManagedEuroMatch,
} from '../core/europe';
import type { AudioSettings, BudgetRequestResult, ScoutMission } from '../core/career';
import {
  claimDailyBonus,
  dailyBonusAvailable,
  DEFAULT_AUDIO,
  normalizeAudio,
  requestTransferBudget,
} from '../core/career';
import {
  FacilityType,
  moveMoney,
  refreshMarketValues,
  renewContract as coreRenew,
  requiredWageWith,
  suggestedWage,
  TransferOffer,
  upgradeFacility,
  claimFreeFacilityUpgrade,
  UpgradeResult,
} from '../core/economy';
import { sortStandings, transferWindow, WindowState } from '../core/season';
import { deriveSeed, Rng } from '../core/engine/rng';
import {
  cancelRetraining as coreCancelRetraining,
  startRetraining as coreStartRetraining,
  TrainingFocus,
} from '../core/training';
import { StaffChangeResult, StaffMember, StaffRole } from '../core/staff';
import type { PreContract, SignResult } from '../core/game';
import {
  agreePreContract,
  cancelPreContract,
  candidatesFor,
  ensureStaff,
  freeAgentWage,
  listFreeAgents,
  preContracts,
  preContractTargets,
  preContractWindowOpen,
  signFreeAgent,
  fireStaffMember,
  hireStaffMember,
  individualSlotsFor,
  setPlayerTraining,
  usedSlots,
} from '../core/game';
import { Lang } from '../core/i18n';

/**
 * Store global do jogo (Zustand).
 *
 * Regra de arquitetura: TODA a lógica vive em `/core` (funções puras). A store
 * só guarda o GameState, chama o core e notifica a UI. O GameState é mutado
 * pelo core e depois a referência de topo é substituída para disparar re-render.
 */
export interface GameStore {
  state: GameState | null;
  lang: Lang;
  /** Som/vibração (persiste no save, como o idioma). */
  audio: AudioSettings;
  trainingFocus: TrainingFocus;
  lastWeek: WeekResult | null;
  blockedReason: string | null;
  lastSeason: SeasonSummary | null; // sumário do último fim de época (para a UI)
  replayedFixtures: string[]; // fixtures já re-simulados (1 segunda hipótese por jogo)
  /** Ajustes em jogo (intervalo + substituições ao vivo) do jogo atual — cumulativos. */
  matchAdjustments: MatchAdjustment[];
  /** Balanço da última jornada — o modal de fecho lê daqui e limpa no fim. */
  pendingReport: WeekReport | null;

  // Ciclo de vida
  newGame: (opts: NewGameOptions) => void;
  loadState: (state: GameState) => void;
  /** Idioma da interface (persiste no save). */
  setLang: (lang: Lang) => void;
  /** Altera som/volume/vibração (aplica na hora e persiste no save). */
  setAudio: (patch: Partial<AudioSettings>) => void;

  /** Menu inicial já ultrapassado nesta sessão (em memória; reinicia a cada arranque). */
  menuPassed: boolean;
  releasedIds: string[]; // jogadores em fim de contrato que o utilizador libertou (transitório)
  returnedLoans: ReturnedLoan[]; // empréstimos recebidos que terminaram (oferta de compra pendente)
  /** Jogadores em fim de contrato por decidir (só quando a época terminou). */
  expiringDecisions: () => Player[];
  /** Jogadores do clube gerido que se vão reformar no fim da época (idade ≥36). */
  retiringSoon: () => Player[];
  renewExpiring: (playerId: string) => void;
  releaseExpiring: (playerId: string) => void;
  /** Sai do menu inicial (após "Nova Carreira" ou "Continuar"). */
  passMenu: () => void;
  /** Marca o tutorial de abas como visto (persiste no save da carreira). */
  markTutorialSeen: () => void;
  /** Repõe o tutorial guiado para ser visto outra vez. */
  replayTutorial: () => void;

  // Core loop
  advance: () => WeekResult | null;
  /** Motivo do bloqueio do avanco (null = pode avancar). */
  advanceBlockedBy: () => string | null;
  /** Contagens do bloqueio para a UI traduzir (null = pode avançar). */
  blockedCounts: () => BlockingCounts | null;
  setTrainingFocus: (focus: TrainingFocus) => void;
  setTactic: (tactic: Tactic) => void;

  // Pré-jogo
  /** Checklist da próxima jornada (onze, dinheiro, adversário). */
  preview: () => MatchdayPreview | null;
  /** Troca titulares exaustos/lesionados por suplentes frescos. */
  rotate: () => RotationResult;
  /** Fecha o modal de balanço da jornada. */
  clearReport: () => void;

  // Carreira
  acceptOffer: (clubId: string) => boolean;
  /** Ofertas de clubes maiores por mérito (clubIds). */
  meritOffers: () => string[];
  /** Aceita uma oferta por mérito (muda de clube). */
  acceptMerit: (clubId: string) => boolean;
  /** Recusa as ofertas por mérito (mantém o clube). */
  declineMerit: () => void;
  claimDaily: () => number; // devolve o valor creditado (0 se indisponível)
  dailyAvailable: () => boolean;
  requestBudget: () => BudgetRequestResult; // pedir dinheiro à direção (1×/época)
  budgetRequestUsed: () => boolean; // já foi pedido esta época?

  // Slots de anúncio rewarded
  replayLastMatch: (fixtureId: string) => MatchResult | null;
  /**
   * Ajuste em jogo (intervalo ou substituição ao vivo): re-simula a partir de
   * `minute` com nova tática, acumulando com ajustes anteriores. Null se não aplicável.
   */
  applyMatchChange: (
    minute: number,
    lineup: Tactic['lineup'],
    mentality: Tactic['mentality'],
    tempo: Tactic['tempo'],
  ) => MatchResult | null;
  /** Substituição ao vivo num jogo da FASE DE LIGA europeia (por id do jogo). */
  applyEuroMatchChange: (
    fixtureId: string,
    minute: number,
    lineup: Tactic['lineup'],
    mentality: Tactic['mentality'],
    tempo: Tactic['tempo'],
  ) => MatchResult | null;
  /** Limpa os ajustes acumulados (ao trocar de jogo na fila da semana). */
  clearMatchAdjustments: () => void;
  runYouthTrial: () => Player | null;

  // Academia de jovens (recrutamento com escolha)
  /** Grupo atual de candidatos à experiência. */
  academyCandidates: () => Player[];
  /** Recruta um candidato (paga a taxa). O anúncio é tratado na UI antes. */
  recruitYouth: (candidateId: string) => RecruitResult;
  /** Gera um novo grupo de candidatos. */
  refreshAcademy: () => void;

  /** Compra o próximo nível de uma instalação do clube gerido. */
  upgrade: (type: FacilityType) => UpgradeResult;

  // --- Equipa técnica ------------------------------------------------------
  /** O backroom atual (gera o inicial se o save for anterior à funcionalidade). */
  staff: () => StaffMember[];
  /** Candidatos desta época para uma função (determinístico). */
  staffCandidates: (role: StaffRole) => StaffMember[];
  hireStaff: (member: StaffMember) => StaffChangeResult;
  fireStaff: (staffId: string) => StaffChangeResult;

  // --- Livres e pré-contratos ----------------------------------------------
  /** Jogadores sem clube, do melhor para o pior. */
  freeAgents: () => Player[];
  /** Ordenado semanal que este livre exige. */
  askingWage: (playerId: string) => number;
  signFree: (playerId: string, wage: number, years: number) => SignResult;
  /** Estamos nas últimas jornadas, onde se fecham pré-contratos? */
  preWindowOpen: () => boolean;
  /** Jogadores de outros clubes que acabam contrato — alvos de pré-contrato. */
  preTargets: () => Player[];
  /** Acordos já fechados para o próximo verão. */
  preDeals: () => PreContract[];
  agreePre: (playerId: string, wage: number, years: number) => SignResult;
  cancelPre: (playerId: string) => void;

  // --- Treino individual ---------------------------------------------------
  /** Vagas de plano individual (dadas pelo adjunto) e quantas estão usadas. */
  trainingSlots: () => { used: number; total: number };
  /** Define (ou limpa, com null) o plano individual de um jogador. */
  setPlayerFocus: (playerId: string, focus: TrainingFocus | null) =>
    { ok: boolean; errorKey?: string; params?: Record<string, string | number> };
  /** Melhoria de instalação GRÁTIS por vídeo está disponível? (nova a cada 5 jornadas). */
  freeUpgradePending: () => boolean;
  /** Usa a melhoria grátis (após ver o vídeo) numa instalação. */
  claimFreeUpgrade: (type: FacilityType) => UpgradeResult;

  /**
   * Conclui o onboarding: define o nome do treinador e o clube escolhido.
   * (O mundo já foi gerado; managerName === '' marca "por concluir".)
   */
  completeOnboarding: (managerName: string, clubId: string) => void;

  // Mercado — a proposta fica pendente; a resposta chega ao avançar a jornada.
  submitOffer: (offer: TransferOffer) => SubmitResult;
  /** Aceita os termos exigidos numa contra-proposta (fecha já). */
  acceptCounter: (itemId: string) => SubmitResult;
  /** Desiste de uma proposta e liberta o orçamento reservado. */
  withdrawOffer: (itemId: string) => void;
  /** Orçamento livre (já descontadas as propostas em curso). */
  freeBudget: () => number;
  /** Orçamento comprometido em propostas por responder. */
  committedBudget: () => number;
  /** O clube tem estatuto para contratar este jogador? */
  reachOf: (playerId: string) => Reachability | null;
  renewPlayer: (
    playerId: string,
    years: number,
    wage: number,
    clauses?: ContractClauses,
  ) => { ok: boolean; error?: string };
  /** Salário que o jogador exige com ESTAS cláusulas (para a UI mostrar ao vivo). */
  wageWithClauses: (playerId: string, clauses?: ContractClauses) => number;
  /** Falar com um jogador: elogiar ou criticar. */
  talkToPlayer: (playerId: string, kind: TalkKind) => TalkResult;
  /** Prometer minutos ou um reforço. */
  promisePlayer: (playerId: string, kind: PromiseKind) => TalkResult;

  // Olheiros (scouting)
  // Empréstimos (dar/receber jovens).
  loanOutList: () => Player[];
  loanInList: () => Player[];
  doLoanOut: (playerId: string) => LoanResult;
  /** `withOption` negoceia opção de compra (paga taxa, trava o preço). */
  doLoanIn: (playerId: string, withOption?: boolean) => LoanResult;
  /** Termina um empréstimo mais cedo (dispensa recebido / chama de volta cedido). */
  doTerminateLoan: (playerId: string) => LoanResult;
  /** Empréstimos RECEBIDOS que terminaram no último rollover (oferta de compra). */
  returnedLoansPending: () => ReturnedLoan[];
  /** Compra um jogador que estava emprestado, no fim do empréstimo. */
  buyReturnedLoan: (playerId: string, price: number) => LoanResult;
  /** Descarta a oferta de compra de um empréstimo terminado (não comprar). */
  dismissReturnedLoan: (playerId: string) => void;
  /** Nível da rede de olheiros + slots (missões em simultâneo). */
  scoutInfo: () => { level: number; freeSlots: number; totalSlots: number } | null;
  /** Intervalo de potencial (ou exato se conhecido/já sondado). */
  potentialRangeOf: (playerId: string) => PotentialRange | null;
  /** O potencial já é conhecido (não-promessa, nosso, ou sondado)? */
  potentialKnown: (playerId: string) => boolean;
  /** Promessas ao alcance com potencial por revelar (para "Sondáveis"). */
  scoutableList: () => Player[];
  /** Inicia missão a um jogador. Devolve true se aceite. */
  scoutPlayer: (playerId: string) => boolean;
  /** Inicia missão a uma liga (descobre promessas). Devolve true se aceite. */
  scoutLeague: (leagueId: string) => boolean;
  /** Cancela uma missão em curso. */
  cancelScout: (missionId: string) => void;
  /** Missões de olheiro em curso. */
  scoutMissions: () => ScoutMission[];
  /** Promessas já descobertas por missões a ligas. */
  scoutProspects: () => Player[];

  // --- Mercado INTERNACIONAL (explorar países estrangeiros) ---
  /** Manda um olheiro a um país (paga do saldo); abre o seu mercado. */
  scoutCountry: (slug: string) => boolean;
  /** Países estrangeiros já explorados. */
  scoutedCountries: () => string[];
  /** Custo atual de explorar um país. */
  scoutCountryCost: () => number;
  /** Alvos internacionais dos países explorados. */
  internationalTargets: (filter?: import('../core/game').WorldFilter) => WorldTarget[];
  /** Contrata um alvo internacional (paga a taxa). Devolve true se assinado. */
  signWorldTarget: (id: string) => boolean;
  /** Ligas do mundo de fundo (para o browser de todas as ligas). */
  worldLeagues: () => BgLeague[];
  /** Ligas ao alcance dos olheiros (nível da instalação). */
  scoutableLeagues: () => import('../core/models').League[];
  canScoutP: (playerId: string) => boolean;
  canScoutL: (leagueId: string) => boolean;

  // Vendas / caixa de entrada
  /** `sellOn` (0..0.3) troca parte do passe por % de uma futura venda. */
  acceptBid: (bidId: string, sellOn?: number) => BidDecision;
  /** Contraproposta a uma oferta recebida: pedir MAIS dinheiro pelo jogador. */
  counterBid: (bidId: string, askedFee: number) => import('../core/game').CounterResult;
  /** Resolve a crise financeira vendendo o jogador escolhido. */
  resolveCrisis: (itemId: string, playerId: string) => import('../core/game').CrisisResult;
  /** Responde à conferência de imprensa com um dos tons disponíveis. */
  answerPress: (
    itemId: string, tone: import('../core/game').PressTone,
  ) => import('../core/game').PressAnswerResult;
  /** Começa a reconversão de posição de um jogador (treino de N semanas). */
  startRetrain: (playerId: string, position: import('../core/models').Position) => import('../core/training').RetrainResult;
  /** Cancela a reconversão em curso. */
  cancelRetrain: (playerId: string) => void;
  rejectBid: (bidId: string) => void;
  setListed: (playerId: string, listed: boolean) => void;
  resolveRenewal: (itemId: string, years?: number) => RenewalDecision;
  resolveRequest: (itemId: string, accept: boolean) => import('../core/i18n').Msg | null;
  dismissItem: (itemId: string) => void;

  // Seletores (derivados — não guardam estado)
  managedClub: () => Club | null;
  managedLeague: () => string;
  standings: (leagueId?: string) => StandingRow[];
  upcomingFixtures: (count?: number) => Fixture[];
  /** A próxima partida é europeia? (nessa semana não se joga a liga) */
  nextIsEuropean: () => boolean;
  /** O jogo europeu que o clube gerido tem na próxima jornada (null = não joga). */
  nextEuroMatch: () => import('../core/europe').NextEuroMatch | null;
  squad: (clubId?: string) => Player[];
  inboxBids: () => BidItem[];
  inboxItems: () => InboxItem[];
  /** Humor dos adeptos do clube gerido (0-100), a faixa e os últimos motivos. */
  fans: () => {
    mood: number;
    band: import('../core/game').FanBand;
    reasons: import('../core/game').FanReason[];
  };
  /** Estado da janela de mercado na jornada atual. */
  marketWindow: () => WindowState;
}

/** Substitui a referência de topo para forçar re-render mantendo as entidades. */
function bump(state: GameState): GameState {
  return { ...state, meta: { ...state.meta }, career: { ...state.career } };
}

/** Data real de hoje em ISO (para o bónus diário). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Acerta o balanço da semana com o resultado FINAL do jogo.
 *
 * O `WeekReport` é montado em `advanceWeek`, com o resultado da simulação
 * inicial. Se depois houver substituições ao vivo (ou uma segunda hipótese), o
 * jogo passa a acabar noutro resultado — mas o pop-up continuava a mostrar o
 * antigo, e o utilizador via um jogo terminar 2-1 e o balanço dizer 1-1.
 */
function syncReport(
  report: WeekReport | null,
  managedId: string,
  result: MatchResult | null,
): WeekReport | null {
  if (!report || !result) return report;
  const isHome = result.homeClubId === managedId;
  if (!isHome && result.awayClubId !== managedId) return report;
  return {
    ...report,
    goalsFor: isHome ? result.home.goals : result.away.goals,
    goalsAgainst: isHome ? result.away.goals : result.home.goals,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  lang: 'pt-PT',
  audio: { ...DEFAULT_AUDIO },
  trainingFocus: TrainingFocus.TECHNICAL,
  lastWeek: null,
  blockedReason: null,
  lastSeason: null,
  replayedFixtures: [],
  matchAdjustments: [],
  pendingReport: null,
  menuPassed: false,
  releasedIds: [],
  returnedLoans: [],

  passMenu: () => set({ menuPassed: true }),

  markTutorialSeen: () => {
    const { state } = get();
    if (state) { state.career.tutorialSeen = true; set({ state: bump(state) }); }
  },

  /** Volta a mostrar o tutorial guiado (botão nas Definições). */
  replayTutorial: () => {
    const { state } = get();
    if (state) { state.career.tutorialSeen = false; set({ state: bump(state) }); }
  },

  newGame: (opts) => {
    const state = createNewGame(opts);
    state.career.lang = get().lang; // guarda o idioma escolhido no save
    state.career.audio = { ...get().audio }; // idem para som/vibração
    set({ state, lastWeek: null, lastSeason: null, replayedFixtures: [], matchAdjustments: [], pendingReport: null });
  },

  loadState: (state) => {
    // Migração de saves anteriores à rede de olheiros: garante o campo em todos
    // os clubes (senão o ecrã de instalações lê undefined e rebenta).
    for (const c of Object.values(state.clubs)) {
      if (c.facilities.scouting == null) c.facilities.scouting = 1;
    }
    if (!state.career.scouting) state.career.scouting = { known: [], missions: [], prospects: [] };
    // MIGRAÇÃO — jogadores "emprestados a si próprios". Recomprar um jogador
    // que tínhamos emprestado não limpava a marca de empréstimo: ele voltava ao
    // plantel como EMP, dava para renovar mas não para vender, e o jogo não
    // sabia de quem era. A origem já está corrigida; isto conserta os saves que
    // ficaram com o estado partido.
    for (const p of Object.values(state.players)) {
      if (p.condition.loanOwnerId && p.condition.loanOwnerId === p.clubId) {
        p.condition.loanOwnerId = undefined;
        p.condition.loanUntil = undefined;
        p.condition.loanBuyOption = undefined;
      }
    }
    // Preços congelados no dia em que o jogador foi criado — reavalia tudo.
    refreshMarketValues(state);
    const audio = normalizeAudio(state.career.audio);
    state.career.audio = audio;
    set({ state, lang: state.career.lang ?? get().lang, audio });
  },

  setLang: (lang) => {
    const { state } = get();
    if (state) { state.career.lang = lang; set({ state: bump(state), lang }); }
    else set({ lang });
  },

  setAudio: (patch) => {
    const audio = normalizeAudio({ ...get().audio, ...patch });
    const { state } = get();
    if (state) { state.career.audio = audio; set({ state: bump(state), audio }); }
    else set({ audio });
  },

  advance: () => {
    const { state, trainingFocus } = get();
    if (!state) return null;
    if (state.career.pendingOffers.length > 0) return null; // despedido: tem de aceitar oferta

    // Fim de época → decisões de contrato (renovar/libertar) ANTES do rollover.
    //
    // A época só termina quando o campeonato E a Europa acabarem. Antes bastava
    // o calendário doméstico esgotar-se: as eliminatórias europeias que ainda
    // faltavam eram jogadas em silêncio dentro do `rolloverSeason`, e o
    // utilizador ficava sem jogos a seguir à fase de liga mesmo tendo passado.
    const euroPending = !!state.europe && europeInProgress(state.europe);
    if (nextRound(state, managedLeagueId(state)) === null && !euroPending) {
      const { releasedIds } = get();
      const undecided = (state.clubs[state.meta.managedClubId]?.squad ?? [])
        .map((id) => state.players[id])
        .filter((p): p is Player =>
          !!p && p.contractUntil !== null && p.contractUntil <= state.meta.season + 1
          && !releasedIds.includes(p.id));
      if (undecided.length > 0) {
        set({ blockedReason: 'contracts' }); // o painel mostra o modal de decisões
        return null;
      }
      const summary = rolloverSeason(state);
      set({
        state: bump(state), lastWeek: null, lastSeason: summary, replayedFixtures: [], matchAdjustments: [],
        releasedIds: [], returnedLoans: summary.returnedLoans,
      });
      return null;
    }

    // Interrupção obrigatória: propostas e pedidos exigem decisão antes de
    // continuar (regra de interface — o core simula sempre).
    const blocking = blockingReason(state);
    if (blocking) {
      set({ blockedReason: blocking });
      return null;
    }

    const result = advanceWeek(state, trainingFocus);
    set({
      state: bump(state),
      lastWeek: result,
      lastSeason: null,
      matchAdjustments: [], // novo jogo → esquece os ajustes do anterior
      blockedReason: null,
      pendingReport: result.report,
    });
    return result;
  },

  // ---- Pré-jogo ----
  preview: () => {
    const { state } = get();
    return state ? matchdayPreview(state) : null;
  },

  rotate: () => {
    const { state } = get();
    if (!state) return { swapped: 0, changes: [] };
    // Onze automático: melhor equipa possível (exclui lesionados/suspensos,
    // penaliza cansados). Serve o auto de rotação e o botão da Tática.
    const res = optimizeLineup(state);
    if (res.swapped > 0) set({ state: bump(state) });
    return res;
  },

  clearReport: () => set({ pendingReport: null }),

  /** Motivo pelo qual o avanço está bloqueado (null se puder avançar). */
  advanceBlockedBy: () => {
    const { state } = get();
    return state ? blockingReason(state) : null;
  },

  blockedCounts: () => {
    const { state } = get();
    return state ? blockingCounts(state) : null;
  },

  setTrainingFocus: (focus) => set({ trainingFocus: focus }),

  setTactic: (tactic) => {
    const { state } = get();
    if (!state) return;
    state.tactics[tactic.clubId] = tactic;
    set({ state: bump(state) });
  },

  // ---- Carreira ----
  acceptOffer: (clubId) => {
    const { state } = get();
    if (!state) return false;
    const ok = acceptJobOffer(state, clubId);
    if (ok) set({ state: bump(state) });
    return ok;
  },
  meritOffers: () => get().state?.career.meritOffers ?? [],
  acceptMerit: (clubId) => {
    const { state } = get();
    if (!state) return false;
    const ok = acceptMeritOffer(state, clubId);
    if (ok) set({ state: bump(state), lastSeason: null });
    return ok;
  },
  declineMerit: () => {
    const { state } = get();
    if (!state) return;
    state.career.meritOffers = [];
    set({ state: bump(state) });
  },

  dailyAvailable: () => {
    const { state } = get();
    if (!state) return false;
    return dailyBonusAvailable(state.career, todayISO());
  },

  claimDaily: () => {
    const { state } = get();
    if (!state) return 0;
    const raw = claimDailyBonus(state.career, todayISO());
    // Escala pelo ESCALÃO: um bónus fixo de 700k afogava a Liga 3 (receita ~28k/
    // semana) e tornava o dinheiro igual em todas as divisões. Agora cresce com a
    // subida de divisão — a progressão passa a valer.
    const club = state.clubs[state.meta.managedClubId];
    const tier = club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;
    const amount = Math.round(raw * Math.pow(0.5, tier - 1) / 10_000) * 10_000;
    if (amount > 0) {
      const fin = state.finances[state.meta.managedClubId];
      if (fin) moveMoney(fin, amount);
      set({ state: bump(state) });
    }
    return amount;
  },

  budgetRequestUsed: () => {
    const { state } = get();
    return !!state && state.career.lastBudgetRequestSeason === state.meta.season;
  },

  requestBudget: () => {
    const { state } = get();
    if (!state) return { granted: 0, messageKey: 'board.budget.refused' };
    const club = state.clubs[state.meta.managedClubId];
    const fin = state.finances[state.meta.managedClubId];
    const tier = club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;
    if (!fin) return { granted: 0, messageKey: 'board.budget.refused' };
    const res = requestTransferBudget(state.career, fin, tier, state.meta.season);
    set({ state: bump(state) });
    return res;
  },

  // ---- Slots rewarded ----
  replayLastMatch: (fixtureId) => {
    const { state, replayedFixtures, lastWeek } = get();
    if (!state || replayedFixtures.includes(fixtureId)) return null;
    const result = replayFixture(state, fixtureId);
    if (!result) return null;

    // Atualiza o lastWeek para o ecrã de jogo mostrar o novo resultado.
    const fixtures = lastWeek?.fixtures.map((f) => (f.id === fixtureId ? { ...f, result } : f)) ?? [];
    set({
      state: bump(state),
      replayedFixtures: [...replayedFixtures, fixtureId],
      matchAdjustments: [], // a re-simulação usa outra seed → ajustes anteriores deixam de valer
      lastWeek: lastWeek ? { ...lastWeek, fixtures } : null,
      pendingReport: syncReport(get().pendingReport, state.meta.managedClubId, result),
    });
    return result;
  },

  applyMatchChange: (minute, lineup, mentality, tempo) => {
    const { state, lastWeek, matchAdjustments } = get();
    if (!state || !lastWeek) return null;
    const managedId = state.meta.managedClubId;
    const fx = lastWeek.fixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId);
    if (!fx) return null;
    // Substitui o ajuste do MESMO minuto (re-aplicar o intervalo, p.ex.) e acumula.
    const next: MatchAdjustment[] = [
      ...matchAdjustments.filter((a) => a.minute !== minute),
      { minute, lineup, mentality, tempo },
    ];
    const result = coreApplyMatchChanges(state, fx.id, next);
    if (!result) return null;
    const fixtures = lastWeek.fixtures.map((f) => (f.id === fx.id ? { ...f, result } : f));
    set({
      state: bump(state),
      lastWeek: { ...lastWeek, fixtures },
      matchAdjustments: next,
      pendingReport: syncReport(get().pendingReport, managedId, result),
    });
    return result;
  },

  applyEuroMatchChange: (fixtureId, minute, lineup, mentality, tempo) => {
    const { state, lastWeek, matchAdjustments } = get();
    if (!state || !lastWeek) return null;
    const next: MatchAdjustment[] = [
      ...matchAdjustments.filter((a) => a.minute !== minute),
      { minute, lineup, mentality, tempo },
    ];
    const result = coreApplyEuroMatchChanges(state, fixtureId, next);
    if (!result) return null;
    const patch = <F extends { id: string; result: MatchResult | null }>(f: F): F =>
      (f.id === fixtureId ? { ...f, result } : f);
    set({
      state: bump(state),
      lastWeek: {
        ...lastWeek,
        managedMatches: lastWeek.managedMatches.map(patch),
        fixtures: lastWeek.fixtures.map(patch),
      },
      matchAdjustments: next,
    });
    return result;
  },

  clearMatchAdjustments: () => set({ matchAdjustments: [] }),

  runYouthTrial: () => {
    const { state } = get();
    if (!state) return null;
    const rng = new Rng(deriveSeed(state.meta.rngSeed, 'trial', state.meta.season, Object.keys(state.players).length));
    const youth = youthTrial(state, rng);
    set({ state: bump(state) });
    return youth;
  },

  academyCandidates: () => {
    const { state } = get();
    return state ? coreAcademyCandidates(state) : [];
  },
  recruitYouth: (candidateId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'submit.noGame' };
    const res = recruitAcademyCandidate(state, candidateId);
    if (res.ok) set({ state: bump(state) });
    return res;
  },
  refreshAcademy: () => {
    const { state } = get();
    if (!state) return;
    generateAcademyBatch(state, true);
    set({ state: bump(state) });
  },

  upgrade: (type) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = upgradeFacility(state, type);
    if (res.ok) set({ state: bump(state) });
    return res;
  },
  staff: () => {
    const { state } = get();
    if (!state) return [];
    ensureStaff(state); // saves anteriores à funcionalidade / clube novo
    return state.career.staff ?? [];
  },
  staffCandidates: (role) => {
    const { state } = get();
    return state ? candidatesFor(state, role) : [];
  },
  hireStaff: (member) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'staff.error.notFound' };
    const res = hireStaffMember(state, member);
    if (res.ok) set({ state: bump(state) });
    return res;
  },
  fireStaff: (staffId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'staff.error.notFound' };
    const res = fireStaffMember(state, staffId);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  trainingSlots: () => {
    const { state } = get();
    if (!state) return { used: 0, total: 0 };
    const squad = (state.clubs[state.meta.managedClubId]?.squad ?? [])
      .map((id) => state.players[id]);
    return { used: usedSlots(squad), total: individualSlotsFor(state) };
  },
  setPlayerFocus: (playerId, focus) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'training.individual.invalid' };
    const res = setPlayerTraining(state, playerId, focus);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  freeAgents: () => {
    const { state } = get();
    return state ? listFreeAgents(state) : [];
  },
  askingWage: (playerId) => {
    const { state } = get();
    const p = state?.players[playerId];
    return state && p ? freeAgentWage(state, p) : 0;
  },
  signFree: (playerId, wage, years) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'free.err.gone' };
    const res = signFreeAgent(state, playerId, wage, years);
    if (res.ok) set({ state: bump(state) });
    return res;
  },
  preWindowOpen: () => {
    const { state } = get();
    return state ? preContractWindowOpen(state) : false;
  },
  preTargets: () => {
    const { state } = get();
    return state ? preContractTargets(state) : [];
  },
  preDeals: () => {
    const { state } = get();
    return state ? preContracts(state) : [];
  },
  agreePre: (playerId, wage, years) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'free.err.gone' };
    const res = agreePreContract(state, playerId, wage, years);
    if (res.ok) set({ state: bump(state) });
    return res;
  },
  cancelPre: (playerId) => {
    const { state } = get();
    if (!state) return;
    cancelPreContract(state, playerId);
    set({ state: bump(state) });
  },

  freeUpgradePending: () => !!get().state?.career.freeUpgradePending,
  claimFreeUpgrade: (type) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = claimFreeFacilityUpgrade(state, type);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  completeOnboarding: (managerName, clubId) => {
    const { state } = get();
    if (!state || !state.clubs[clubId]) return;
    state.meta.managerName = managerName.trim() || 'Treinador';
    state.meta.managedClubId = clubId;
    state.career.confidence = 60;
    setManagedObjective(state);
    set({ state: bump(state) });
  },

  // ---- Mercado ----
  // A proposta NÃO é decidida aqui: fica pendente e a resposta chega quando a
  // jornada avança. É o que separa negociar de comprar numa loja.
  submitOffer: (offer) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'submit.noGame' };
    const res = submitPendingOffer(state, offer);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  acceptCounter: (itemId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'submit.noGame' };
    const res = coreAcceptCounter(state, itemId);
    set({ state: bump(state) });
    return res;
  },

  withdrawOffer: (itemId) => {
    const { state } = get();
    if (!state) return;
    coreWithdrawOffer(state, itemId);
    set({ state: bump(state) });
  },

  freeBudget: () => {
    const { state } = get();
    return state ? coreAvailableBudget(state) : 0;
  },

  committedBudget: () => {
    const { state } = get();
    return state ? coreReservedBudget(state) : 0;
  },

  reachOf: (playerId) => {
    const { state } = get();
    const p = state?.players[playerId];
    return state && p ? reachability(state, p) : null;
  },

  // ---- Olheiros ----
  scoutInfo: () => {
    const { state } = get();
    if (!state) return null;
    const level = scoutingLevel(state);
    return { level, freeSlots: coreFreeSlots(state), totalSlots: scoutSlots(level) };
  },
  potentialRangeOf: (playerId) => {
    const { state } = get();
    const p = state?.players[playerId];
    return state && p ? potentialRange(state, p) : null;
  },
  potentialKnown: (playerId) => {
    const { state } = get();
    const p = state?.players[playerId];
    return state && p ? isPotentialKnown(state, p) : true;
  },
  scoutableList: () => {
    const { state } = get();
    return state ? scoutableProspects(state) : [];
  },

  loanOutList: () => { const { state } = get(); return state ? loanOutCandidates(state) : []; },
  loanInList: () => { const { state } = get(); return state ? loanInMarket(state) : []; },
  doLoanOut: (playerId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'loan.err.invalid' };
    const r = coreLoanOut(state, playerId);
    if (r.ok) set({ state: bump(state) });
    return r;
  },
  doLoanIn: (playerId, withOption = false) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'loan.err.invalid' };
    const r = coreLoanIn(state, playerId, withOption);
    if (r.ok) set({ state: bump(state) });
    return r;
  },
  doTerminateLoan: (playerId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'loan.err.invalid' };
    const r = coreTerminateLoan(state, playerId);
    if (r.ok) set({ state: bump(state) });
    return r;
  },
  returnedLoansPending: () => get().returnedLoans,
  buyReturnedLoan: (playerId, price) => {
    const { state, returnedLoans } = get();
    if (!state) return { ok: false, errorKey: 'loan.err.invalid' };
    const r = coreBuyReturnedPlayer(state, playerId, price);
    if (r.ok) set({ state: bump(state), returnedLoans: returnedLoans.filter((l) => l.playerId !== playerId) });
    return r;
  },
  dismissReturnedLoan: (playerId) => {
    const { returnedLoans } = get();
    set({ returnedLoans: returnedLoans.filter((l) => l.playerId !== playerId) });
  },
  scoutPlayer: (playerId) => {
    const { state } = get();
    if (!state) return false;
    const ok = startPlayerMission(state, playerId);
    if (ok) set({ state: bump(state) });
    return ok;
  },
  scoutLeague: (leagueId) => {
    const { state } = get();
    if (!state) return false;
    const ok = startLeagueMission(state, leagueId);
    if (ok) set({ state: bump(state) });
    return ok;
  },
  cancelScout: (missionId) => {
    const { state } = get();
    if (!state) return;
    cancelMission(state, missionId);
    set({ state: bump(state) });
  },
  scoutMissions: () => {
    const { state } = get();
    return state ? coreScoutMissions(state) : [];
  },
  scoutProspects: () => {
    const { state } = get();
    if (!state) return [];
    const ids = state.career.scouting?.prospects ?? [];
    // Só promessas AINDA noutros clubes (as já contratadas saem da lista).
    return ids
      .map((id) => state.players[id])
      .filter((p): p is Player => !!p && !!p.clubId && p.clubId !== state.meta.managedClubId);
  },

  // --- Mercado internacional ---
  scoutCountry: (slug) => {
    const { state } = get();
    if (!state) return false;
    const r = coreScoutCountry(state, slug);
    if (r.ok) set({ state: bump(state) });
    return r.ok;
  },
  scoutedCountries: () => get().state?.career.scoutedCountries ?? [],
  scoutCountryCost: () => {
    const { state } = get();
    return state ? coreScoutCountryCost(state) : 0;
  },
  internationalTargets: (filter) => {
    const { state } = get();
    return state ? coreInternationalTargets(state, filter) : [];
  },
  signWorldTarget: (id) => {
    const { state } = get();
    if (!state) return false;
    const r = coreSignWorldTarget(state, id);
    if (r.ok) set({ state: bump(state) });
    return r.ok;
  },
  worldLeagues: () => get().state?.background?.leagues ?? [],
  scoutableLeagues: () => {
    const { state } = get();
    if (!state) return [];
    const club = state.clubs[state.meta.managedClubId];
    const ownTier = club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;
    const level = scoutingLevel(state);
    return Object.values(state.leagues).filter((l) => tierInRange(ownTier, l.tier, level));
  },
  canScoutP: (playerId) => {
    const { state } = get();
    return state ? canScoutPlayer(state, playerId) : false;
  },
  canScoutL: (leagueId) => {
    const { state } = get();
    return state ? canScoutLeague(state, leagueId) : false;
  },

  // ---- Vendas / caixa de entrada ----
  startRetrain: (playerId, position) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'retrain.err.invalid' };
    const res = coreStartRetraining(state, playerId, position);
    set({ state: bump(state) });
    return res;
  },
  cancelRetrain: (playerId) => {
    const { state } = get();
    if (!state) return;
    coreCancelRetraining(state, playerId);
    set({ state: bump(state) });
  },
  resolveCrisis: (itemId, playerId) => {
    const { state } = get();
    if (!state) return { ok: false, amount: 0, errorKey: 'crisis.err.gone' };
    const res = coreResolveCrisis(state, itemId, playerId);
    set({ state: bump(state) });
    return res;
  },
  answerPress: (itemId, tone) => {
    const { state } = get();
    if (!state) return { ok: false, messageKey: 'press.gone' };
    const res = coreAnswerPress(state, itemId, tone);
    set({ state: bump(state) });
    return res;
  },

  counterBid: (bidId, askedFee) => {
    const { state } = get();
    if (!state) return { ok: false, fee: 0, messageKey: 'bid.counter.gone' };
    const res = coreCounterBid(state, bidId, askedFee);
    set({ state: bump(state) });
    return res;
  },
  acceptBid: (bidId, sellOn = 0) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = coreAcceptBid(state, bidId, sellOn);
    // Bump SEMPRE — mesmo em falha o estado pode ter mudado, e a UI tem de
    // refrescar (senão o item fica no ecrã e o botão parece morto).
    set({ state: bump(state) });
    return res;
  },

  rejectBid: (bidId) => {
    const { state } = get();
    if (!state) return;
    coreRejectBid(state, bidId);
    set({ state: bump(state) });
  },

  setListed: (playerId, listed) => {
    const { state } = get();
    if (!state) return;
    // Jogadores emprestados (recebidos) não podem ir para a lista de transferências —
    // o passe não é nosso. A UI deve esconder o botão, isto é a rede de segurança.
    if (listed && state.players[playerId]?.condition.loanOwnerId) return;
    setTransferListed(state, playerId, listed);
    set({ state: bump(state) });
  },

  resolveRenewal: (itemId, years = 3) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = coreResolveRenewal(state, itemId, years);
    set({ state: bump(state) }); // bump sempre (ver acceptBid)
    return res;
  },

  resolveRequest: (itemId, accept) => {
    const { state } = get();
    if (!state) return null;
    const msg = coreResolveRequest(state, itemId, accept);
    set({ state: bump(state) });
    return msg;
  },

  dismissItem: (itemId) => {
    const { state } = get();
    if (!state) return;
    coreDismissItem(state, itemId);
    set({ state: bump(state) });
  },

  renewPlayer: (playerId, years, wage, clauses) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = coreRenew(playerId, years, wage, state, false, clauses);
    set({ state: bump(state) }); // bump sempre (ver acceptBid)
    return res;
  },

  wageWithClauses: (playerId, clauses) => {
    const { state } = get();
    const p = state?.players[playerId];
    if (!state || !p) return 0;
    return requiredWageWith(p, state.meta.season, clauses);
  },

  talkToPlayer: (playerId, kind) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'talk.err.invalid' };
    const res = coreTalkTo(state, playerId, kind);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  promisePlayer: (playerId, kind) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'talk.err.invalid' };
    const res = corePromiseTo(state, playerId, kind);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  retiringSoon: () => {
    const { state } = get();
    if (!state) return [];
    // Só no fim da época (à espera do rollover). Idade ≥36 = reforma GARANTIDA
    // no próximo rollover (fica 37+, reforma-se de certeza).
    if (nextRound(state, managedLeagueId(state)) !== null) return [];
    return (state.clubs[state.meta.managedClubId]?.squad ?? [])
      .map((id) => state.players[id])
      .filter((p): p is Player => !!p && p.age >= 36)
      .sort((a, b) => b.age - a.age);
  },
  expiringDecisions: () => {
    const { state, releasedIds } = get();
    if (!state) return [];
    // Só no fim da época (todas as jornadas jogadas), à espera do rollover.
    if (nextRound(state, managedLeagueId(state)) !== null) return [];
    return (state.clubs[state.meta.managedClubId]?.squad ?? [])
      .map((id) => state.players[id])
      // Expiram no PRÓXIMO rollover: o core liberta `contractUntil <= época+1`
      // (incrementa a época e depois corta). Tem de bater com esse critério,
      // senão o modal nunca aparecia e o jogador "desaparecia" só com notícia.
      .filter((p): p is Player =>
        !!p && p.contractUntil !== null && p.contractUntil <= state.meta.season + 1
        && !releasedIds.includes(p.id));
  },

  renewExpiring: (playerId) => {
    const { state } = get();
    if (!state) return;
    const p = state.players[playerId];
    if (!p) return;
    // Decisão de fim de época: renova SEMPRE (ignoreMargin) para o modal não encravar.
    const res = coreRenew(playerId, 3, suggestedWage(p, state.meta.season), state, true);
    if (res.ok) { set({ state: bump(state), blockedReason: null }); }
  },

  releaseExpiring: (playerId) => {
    const { state, releasedIds } = get();
    // Bump OBRIGATÓRIO: a UI subscreve `state`, por isso mudar só `releasedIds`
    // não repintava nada e o modal de fim de época ficava preso — parecia que o
    // botão "libertar" não fazia nada e só "renovar" adiantava a fila.
    set({
      releasedIds: [...releasedIds, playerId],
      blockedReason: null,
      ...(state ? { state: bump(state) } : {}),
    });
  },

  // ---- Seletores ----
  managedClub: () => {
    const { state } = get();
    if (!state) return null;
    return state.clubs[state.meta.managedClubId] ?? null;
  },

  managedLeague: () => {
    const { state } = get();
    if (!state) return '';
    return managedLeagueId(state);
  },

  standings: (leagueId) => {
    const { state } = get();
    if (!state) return [];
    const id = leagueId ?? managedLeagueId(state);
    const table = state.standings[id];
    if (!table) return [];
    return sortStandings(table, (cid) => state.clubs[cid]?.name ?? cid);
  },

  upcomingFixtures: (count = 5) => {
    const { state } = get();
    if (!state) return [];
    const leagueId = managedLeagueId(state);
    const schedule = state.schedules[leagueId];
    if (!schedule) return [];
    const round = nextRound(state, leagueId) ?? schedule.totalRounds + 1;
    const clubId = state.meta.managedClubId;
    return schedule.fixtures
      .filter((f) => f.round >= round && (f.homeClubId === clubId || f.awayClubId === clubId))
      .slice(0, count);
  },

  nextIsEuropean: () => {
    const { state } = get();
    return !!state && isEuroWeek(state);
  },

  nextEuroMatch: () => {
    const { state } = get();
    return state ? nextManagedEuroMatch(state) : null;
  },

  squad: (clubId) => {
    const { state } = get();
    if (!state) return [];
    const id = clubId ?? state.meta.managedClubId;
    const club = state.clubs[id];
    if (!club) return [];
    return club.squad.map((pid) => state.players[pid]).filter((p): p is Player => !!p);
  },

  inboxBids: () => {
    const { state } = get();
    if (!state) return [];
    return state.inbox.filter((it): it is BidItem => it.kind === 'BID');
  },

  marketWindow: () => {
    const { state } = get();
    if (!state) return { open: false, labelKey: 'window.closed', opensAtRound: null };
    const leagueId = managedLeagueId(state);
    const schedule = state.schedules[leagueId];
    const round = nextRound(state, leagueId) ?? (schedule?.totalRounds ?? 1);
    return transferWindow(round, schedule?.totalRounds ?? 30);
  },

  inboxItems: () => {
    const { state } = get();
    if (!state) return [];
    // Esconde itens cujo jogador já não existe (vendido/livre) — senão contavam
    // na inbox mas apareciam vazios e não davam para resolver. A crise
    // financeira e a conferência de imprensa não falam (necessariamente) de um
    // jogador, por isso passam sempre.
    return state.inbox.filter((it) => {
      if (it.kind === 'CRISIS' || it.kind === 'PRESS') return true;
      return !!state.players[it.playerId];
    });
  },

  fans: () => {
    const { state } = get();
    // Sem jogo, o valor neutro: a UI desenha a barra a meio em vez de rebentar.
    if (!state) return { mood: 55, band: fanBand(55), reasons: [] };
    // `ensureFans` cria o estado se faltar (save antigo), mas NÃO se chama
    // `set` aqui: um seletor que escreve na store durante o render mete o React
    // em ciclo. O que ele muta é o objeto de estado, que a próxima gravação
    // apanha na mesma.
    const f = ensureFans(state);
    return { mood: Math.round(fanMood(state)), band: fanBand(f.mood), reasons: f.reasons };
  },
}));
