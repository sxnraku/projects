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
 * O adaptador de anúncios é carregado À DEMANDA, nunca no topo.
 *
 * `native/ads` arrasta o React Native, e esta store corre também em Node nos
 * testes (`smoke:ads`): um import estático derrubava a suite inteira no arranque
 * do módulo, antes do primeiro teste. Assim, quem nunca mostra um anúncio —
 * testes e utilizadores Premium — nunca chega a tocar no RN.
 */
async function ads() {
  return import('../native/ads');
}

/**
 * A fronteira dos anúncios tem de saber, para nunca chegar a carregar um.
 * Falhar aqui (Node, web) não pode partir a ativação do Premium/VIP.
 */
function syncAds(premium: boolean): void {
  void ads().then((a) => a.setAdsPremium(premium)).catch(() => { /* sem SDK */ });
}

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

  /** Consome um rewarded e aplica a recompensa ao jogo. Devolve o descritor de mensagem. */
  claimReward: (reward: AdReward) => import('../core/i18n').Msg | null;

  /**
   * Há bónus disponível AGORA? Use isto para mostrar/esconder os botões.
   *
   * Sem Premium é sempre true (o anúncio é que trava). Com Premium fica false
   * depois de gasto o bónus do dia — assim o botão desaparece em vez de falhar.
   */
  adSlotAvailable: () => boolean;

  /**
   * Pede a recompensa: anúncio para quem não tem Premium, direto para quem tem.
   *
   * É o substituto de `showRewarded()` em todos os botões de bónus. Devolve true
   * quando o bónus deve ser aplicado.
   */
  claimAdSlot: () => Promise<boolean>;

  /** Marca o Premium (compra única) como comprado ou não. */
  setPremium: (premium: boolean) => void;

  /** Marca a subscrição VIP como em vigor ou não. VIP também dispensa anúncios. */
  setVip: (vip: boolean) => void;
}

/** Aplica um patch e recalcula o "sem anúncios" efetivo: Premium comprado OU VIP. */
function withPremium(m: MonetizationState, patch: Partial<MonetizationState>): MonetizationState {
  const next = { ...m, ...patch };
  next.premium = next.premiumOwned || next.vip;
  return next;
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
    const m0 = get().m;
    // Com Premium o slot já foi consumido por `claimAdSlot` antes de chegar
    // aqui; consumir outra vez gastava dois bónus num só toque.
    if (!m0.premium) {
      if (!canUseRewarded(m0, game.meta.currentDate)) return null;
      const m = { ...m0 };
      consumeRewarded(m, game.meta.currentDate);
      set({ m });
    }

    const msg = applyReward(game, reward);
    // Notifica a UI da mutação do GameState (mesma técnica do gameStore).
    gameStore.loadState({ ...game, meta: { ...game.meta } });
    return msg;
  },

  adSlotAvailable: () => {
    const m = get().m;
    if (!m.premium) return true; // o anúncio é o travão
    const game = useGameStore.getState().state;
    if (!game) return false;
    return canUseRewarded(m, game.meta.currentDate);
  },

  claimAdSlot: async () => {
    const m0 = get().m;
    if (!m0.premium) return (await ads()).showRewarded();

    // Premium: sem vídeo. Gasta o bónus do dia de jogo e concede.
    const game = useGameStore.getState().state;
    if (!game) return false;
    const date = game.meta.currentDate;
    if (!canUseRewarded(m0, date)) return false;
    const m = { ...m0 };
    consumeRewarded(m, date);
    set({ m });
    return true;
  },

  setPremium: (premium) => {
    const m = withPremium(get().m, { premiumOwned: premium });
    set({ m });
    syncAds(m.premium);
  },

  setVip: (vip) => {
    const m = withPremium(get().m, { vip });
    set({ m });
    syncAds(m.premium);
  },
}));
