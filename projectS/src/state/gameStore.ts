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
  blockingReason,
  BidDecision,
  dismissItem as coreDismissItem,
  ensureValidLineup,
  rejectBid as coreRejectBid,
  RenewalDecision,
  resolveRenewal as coreResolveRenewal,
  resolveRequest as coreResolveRequest,
  rolloverSeason,
  SeasonSummary,
  setManagedObjective,
  setTransferListed,
  WeekResult,
  youthTrial,
} from '../core/game';
import {
  claimDailyBonus,
  dailyBonusAvailable,
} from '../core/career';
import {
  evaluateOffer,
  executeTransfer,
  FacilityType,
  OfferEvaluation,
  renewContract as coreRenew,
  TransferOffer,
  upgradeFacility,
  UpgradeResult,
} from '../core/economy';
import { sortStandings, transferWindow, WindowState } from '../core/season';
import { deriveSeed, Rng } from '../core/engine/rng';
import { TrainingFocus } from '../core/training';

/**
 * Store global do jogo (Zustand).
 *
 * Regra de arquitetura: TODA a lógica vive em `/core` (funções puras). A store
 * só guarda o GameState, chama o core e notifica a UI. O GameState é mutado
 * pelo core e depois a referência de topo é substituída para disparar re-render.
 */
export interface GameStore {
  state: GameState | null;
  trainingFocus: TrainingFocus;
  lastWeek: WeekResult | null;
  blockedReason: string | null;
  lastSeason: SeasonSummary | null; // sumário do último fim de época (para a UI)
  replayedFixtures: string[]; // fixtures já re-simulados (1 segunda hipótese por jogo)

  // Ciclo de vida
  newGame: (opts: NewGameOptions) => void;
  loadState: (state: GameState) => void;

  // Core loop
  advance: () => WeekResult | null;
  /** Motivo do bloqueio do avanco (null = pode avancar). */
  advanceBlockedBy: () => string | null;
  setTrainingFocus: (focus: TrainingFocus) => void;
  setTactic: (tactic: Tactic) => void;

  // Carreira
  acceptOffer: (clubId: string) => boolean;
  claimDaily: () => number; // devolve o valor creditado (0 se indisponível)
  dailyAvailable: () => boolean;

  // Slots de anúncio rewarded
  replayLastMatch: (fixtureId: string) => MatchResult | null;
  runYouthTrial: () => Player | null;

  /** Compra o próximo nível de uma instalação do clube gerido. */
  upgrade: (type: FacilityType) => UpgradeResult;

  /**
   * Conclui o onboarding: define o nome do treinador e o clube escolhido.
   * (O mundo já foi gerado; managerName === '' marca "por concluir".)
   */
  completeOnboarding: (managerName: string, clubId: string) => void;

  // Mercado
  submitOffer: (offer: TransferOffer) => OfferEvaluation;
  renewPlayer: (playerId: string, years: number, wage: number) => { ok: boolean; error?: string };

  // Vendas / caixa de entrada
  acceptBid: (bidId: string) => BidDecision;
  rejectBid: (bidId: string) => void;
  setListed: (playerId: string, listed: boolean) => void;
  resolveRenewal: (itemId: string, years?: number) => RenewalDecision;
  resolveRequest: (itemId: string, accept: boolean) => string | null;
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
  trainingFocus: TrainingFocus.TECHNICAL,
  lastWeek: null,
  blockedReason: null,
  lastSeason: null,
  replayedFixtures: [],

  newGame: (opts) => {
    const state = createNewGame(opts);
    set({ state, lastWeek: null, lastSeason: null, replayedFixtures: [] });
  },

  loadState: (state) => set({ state }),

  advance: () => {
    const { state, trainingFocus } = get();
    if (!state) return null;
    if (state.career.pendingOffers.length > 0) return null; // despedido: tem de aceitar oferta

    // Fim de época → rollover automático antes de continuar.
    if (nextRound(state, managedLeagueId(state)) === null) {
      const summary = rolloverSeason(state);
      set({ state: bump(state), lastWeek: null, lastSeason: summary, replayedFixtures: [] });
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
    set({ state: bump(state), lastWeek: result, lastSeason: null, blockedReason: null });
    return result;
  },

  /** Motivo pelo qual o avanço está bloqueado (null se puder avançar). */
  advanceBlockedBy: () => {
    const { state } = get();
    return state ? blockingReason(state) : null;
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
    const amount = claimDailyBonus(state.career, todayISO());
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

  runYouthTrial: () => {
    const { state } = get();
    if (!state) return null;
    const rng = new Rng(deriveSeed(state.meta.rngSeed, 'trial', state.meta.season, Object.keys(state.players).length));
    const youth = youthTrial(state, rng);
    set({ state: bump(state) });
    return youth;
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
  submitOffer: (offer) => {
    const { state } = get();
    if (!state) return { decision: 'REJECTED', reason: 'Sem jogo ativo.' };
    const sellerId = state.players[offer.playerId]?.clubId;
    const evaluation = evaluateOffer(offer, state);
    if (evaluation.decision === 'ACCEPTED') {
      const res = executeTransfer(offer, state);
      if (!res.ok) return { decision: 'REJECTED', reason: res.error ?? 'Falha na transferência.' };
      // O clube vendedor pode ter perdido um titular — repõe um onze válido.
      if (sellerId) ensureValidLineup(sellerId, state.clubs[sellerId]?.squad ?? [], state.players, state.tactics);
      set({ state: bump(state) });
    }
    return evaluation;
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
    if (!state) return { open: false, label: '—', opensAtRound: null };
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
