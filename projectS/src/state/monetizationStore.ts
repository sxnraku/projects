import { create } from 'zustand';
import {
  AdReward,
  applyReward,
  canUseRewarded,
  consumeRewarded,
  initialMonetization,
  MonetizationState,
  registerAdvance,
} from '../monetization';
import { useGameStore } from './gameStore';

/**
 * Store de monetização — contadores de anúncios e estado premium.
 *
 * Nota: o estado vive em memória. O premium real será restaurado pelo fornecedor
 * de compras (IAP/RevenueCat) no arranque; os contadores de anúncios não
 * precisam de sobreviver a reinícios.
 */
export interface MonetizationStore {
  m: MonetizationState;

  /** Regista um avanço de semana. Devolve true se é altura de um interstitial. */
  onAdvance: () => boolean;

  /** O rewarded ainda está disponível hoje (data do jogo)? */
  rewardedAvailable: () => boolean;

  /** Consome um rewarded e aplica a recompensa ao jogo. Devolve a mensagem para a UI. */
  claimReward: (reward: AdReward) => string | null;

  /** Ativa premium (chamado pelo fluxo de compra IAP quando existir). */
  setPremium: (premium: boolean) => void;
}

export const useMonetizationStore = create<MonetizationStore>((set, get) => ({
  m: initialMonetization(),

  onAdvance: () => {
    const m = { ...get().m };
    const show = registerAdvance(m);
    set({ m });
    return show;
  },

  rewardedAvailable: () => {
    const game = useGameStore.getState().state;
    if (!game) return false;
    return canUseRewarded(get().m, game.meta.currentDate);
  },

  claimReward: (reward) => {
    const gameStore = useGameStore.getState();
    const game = gameStore.state;
    if (!game) return null;
    if (!canUseRewarded(get().m, game.meta.currentDate)) return null;

    const m = { ...get().m };
    consumeRewarded(m, game.meta.currentDate);
    set({ m });

    const message = applyReward(game, reward);
    // Notifica a UI da mutação do GameState (mesma técnica do gameStore).
    gameStore.loadState({ ...game, meta: { ...game.meta } });
    return message;
  },

  setPremium: (premium) => set({ m: { ...get().m, premium } }),
}));
