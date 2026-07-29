import { create } from 'zustand';
import {
  BidItem,
  Club,
  Fixture,
  GameState,
  InboxItem,
  MatchResult,
  Player,
  StandingRow,
  Tactic,
} from '../core/models';
import {
  acceptJobOffer,
  advanceWeek,
  createNewGame,
  managedLeagueId,
  NewGameOptions,
  nextRound,
  replayFixture,
  acceptBid as coreAcceptBid,
  acceptCounter as coreAcceptCounter,
  autoRotate,
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
  applyHalftime as coreApplyHalftime,
} from '../core/game';
import type { BudgetRequestResult, ScoutMission } from '../core/career';
import {
  claimDailyBonus,
  dailyBonusAvailable,
  requestTransferBudget,
} from '../core/career';
import {
  FacilityType,
  renewContract as coreRenew,
  suggestedWage,
  TransferOffer,
  upgradeFacility,
  UpgradeResult,
} from '../core/economy';
import { sortStandings, transferWindow, WindowState } from '../core/season';
import { deriveSeed, Rng } from '../core/engine/rng';
import { TrainingFocus } from '../core/training';
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
  trainingFocus: TrainingFocus;
  lastWeek: WeekResult | null;
  blockedReason: string | null;
  lastSeason: SeasonSummary | null; // sumário do último fim de época (para a UI)
  replayedFixtures: string[]; // fixtures já re-simulados (1 segunda hipótese por jogo)
  /** Balanço da última jornada — o modal de fecho lê daqui e limpa no fim. */
  pendingReport: WeekReport | null;

  // Ciclo de vida
  newGame: (opts: NewGameOptions) => void;
  loadState: (state: GameState) => void;
  /** Idioma da interface (persiste no save). */
  setLang: (lang: Lang) => void;

  /** Menu inicial já ultrapassado nesta sessão (em memória; reinicia a cada arranque). */
  menuPassed: boolean;
  releasedIds: string[]; // jogadores em fim de contrato que o utilizador libertou (transitório)
  returnedLoans: ReturnedLoan[]; // empréstimos recebidos que terminaram (oferta de compra pendente)
  /** Jogadores em fim de contrato por decidir (só quando a época terminou). */
  expiringDecisions: () => Player[];
  renewExpiring: (playerId: string) => void;
  releaseExpiring: (playerId: string) => void;
  /** Sai do menu inicial (após "Nova Carreira" ou "Continuar"). */
  passMenu: () => void;
  /** Marca o tutorial de abas como visto (persiste no save da carreira). */
  markTutorialSeen: () => void;

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
  claimDaily: () => number; // devolve o valor creditado (0 se indisponível)
  dailyAvailable: () => boolean;
  requestBudget: () => BudgetRequestResult; // pedir orçamento à direção (1×/época)
  budgetRequestUsed: () => boolean; // já foi pedido esta época?

  // Slots de anúncio rewarded
  replayLastMatch: (fixtureId: string) => MatchResult | null;
  /** Ajuste ao intervalo: re-simula a 2ª parte com nova tática. Null se não aplicável. */
  applyHalftime: (lineup: Tactic['lineup'], mentality: Tactic['mentality'], tempo: Tactic['tempo']) => MatchResult | null;
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
  renewPlayer: (playerId: string, years: number, wage: number) => { ok: boolean; error?: string };

  // Olheiros (scouting)
  // Empréstimos (dar/receber jovens).
  loanOutList: () => Player[];
  loanInList: () => Player[];
  doLoanOut: (playerId: string) => LoanResult;
  doLoanIn: (playerId: string) => LoanResult;
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
  /** Ligas ao alcance dos olheiros (nível da instalação). */
  scoutableLeagues: () => import('../core/models').League[];
  canScoutP: (playerId: string) => boolean;
  canScoutL: (leagueId: string) => boolean;

  // Vendas / caixa de entrada
  acceptBid: (bidId: string) => BidDecision;
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
  squad: (clubId?: string) => Player[];
  inboxBids: () => BidItem[];
  inboxItems: () => InboxItem[];
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

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  lang: 'pt-PT',
  trainingFocus: TrainingFocus.TECHNICAL,
  lastWeek: null,
  blockedReason: null,
  lastSeason: null,
  replayedFixtures: [],
  pendingReport: null,
  menuPassed: false,
  releasedIds: [],
  returnedLoans: [],

  passMenu: () => set({ menuPassed: true }),

  markTutorialSeen: () => {
    const { state } = get();
    if (state) { state.career.tutorialSeen = true; set({ state: bump(state) }); }
  },

  newGame: (opts) => {
    const state = createNewGame(opts);
    state.career.lang = get().lang; // guarda o idioma escolhido no save
    set({ state, lastWeek: null, lastSeason: null, replayedFixtures: [], pendingReport: null });
  },

  loadState: (state) => {
    // Migração de saves anteriores à rede de olheiros: garante o campo em todos
    // os clubes (senão o ecrã de instalações lê undefined e rebenta).
    for (const c of Object.values(state.clubs)) {
      if (c.facilities.scouting == null) c.facilities.scouting = 1;
    }
    if (!state.career.scouting) state.career.scouting = { known: [], missions: [], prospects: [] };
    set({ state, lang: state.career.lang ?? get().lang });
  },

  setLang: (lang) => {
    const { state } = get();
    if (state) { state.career.lang = lang; set({ state: bump(state), lang }); }
    else set({ lang });
  },

  advance: () => {
    const { state, trainingFocus } = get();
    if (!state) return null;
    if (state.career.pendingOffers.length > 0) return null; // despedido: tem de aceitar oferta

    // Fim de época → decisões de contrato (renovar/libertar) ANTES do rollover.
    if (nextRound(state, managedLeagueId(state)) === null) {
      const { releasedIds } = get();
      const undecided = (state.clubs[state.meta.managedClubId]?.squad ?? [])
        .map((id) => state.players[id])
        .filter((p): p is Player => !!p && p.contractUntil === state.meta.season && !releasedIds.includes(p.id));
      if (undecided.length > 0) {
        set({ blockedReason: 'contracts' }); // o painel mostra o modal de decisões
        return null;
      }
      const summary = rolloverSeason(state);
      set({
        state: bump(state), lastWeek: null, lastSeason: summary, replayedFixtures: [],
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
    const res = autoRotate(state);
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
      if (fin) {
        fin.balance += amount;
        fin.transferBudget += Math.round(amount * 0.5);
      }
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
      lastWeek: lastWeek ? { ...lastWeek, fixtures } : null,
    });
    return result;
  },

  applyHalftime: (lineup, mentality, tempo) => {
    const { state, lastWeek } = get();
    if (!state || !lastWeek) return null;
    const managedId = state.meta.managedClubId;
    const fx = lastWeek.fixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId);
    if (!fx) return null;
    const result = coreApplyHalftime(state, fx.id, lineup, mentality, tempo);
    if (!result) return null;
    const fixtures = lastWeek.fixtures.map((f) => (f.id === fx.id ? { ...f, result } : f));
    set({ state: bump(state), lastWeek: { ...lastWeek, fixtures } });
    return result;
  },

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
  doLoanIn: (playerId) => {
    const { state } = get();
    if (!state) return { ok: false, errorKey: 'loan.err.invalid' };
    const r = coreLoanIn(state, playerId);
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
  acceptBid: (bidId) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = coreAcceptBid(state, bidId);
    if (res.ok) set({ state: bump(state) });
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
    if (res.ok) set({ state: bump(state) });
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

  renewPlayer: (playerId, years, wage) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'Sem jogo ativo.' };
    const res = coreRenew(playerId, years, wage, state);
    if (res.ok) set({ state: bump(state) });
    return res;
  },

  expiringDecisions: () => {
    const { state, releasedIds } = get();
    if (!state) return [];
    // Só no fim da época (todas as jornadas jogadas), à espera do rollover.
    if (nextRound(state, managedLeagueId(state)) !== null) return [];
    return (state.clubs[state.meta.managedClubId]?.squad ?? [])
      .map((id) => state.players[id])
      .filter((p): p is Player => !!p && p.contractUntil === state.meta.season && !releasedIds.includes(p.id));
  },

  renewExpiring: (playerId) => {
    const { state } = get();
    if (!state) return;
    const p = state.players[playerId];
    if (!p) return;
    const res = coreRenew(playerId, 3, suggestedWage(p, state.meta.season), state);
    if (res.ok) { set({ state: bump(state), blockedReason: null }); }
  },

  releaseExpiring: (playerId) => {
    const { releasedIds } = get();
    set({ releasedIds: [...releasedIds, playerId], blockedReason: null });
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
    return state ? state.inbox : [];
  },
}));
