import { GameState } from '../core/models';

/**
 * Lógica de monetização — pura e testável, sem SDKs.
 *
 * Regras de negócio:
 *  - Interstitial: no máximo 1 a cada INTERSTITIAL_EVERY avanços de semana,
 *    nunca nos primeiros GRACE_ADVANCES avanços (não bombardear novos jogadores),
 *    e nunca para utilizadores premium.
 *  - Rewarded (voluntário): o jogador troca um anúncio por um bónus no jogo,
 *    com limite diário (data do jogo) para não quebrar o equilíbrio.
 *  - Premium: remove interstitials; rewarded continua disponível (é opt-in).
 *
 * O SDK (AdMob) vive em app/ads.ts; aqui só decidimos QUANDO e O QUÊ.
 */

export const INTERSTITIAL_EVERY = 3; // 1 anúncio a cada 3 jornadas avançadas
export const GRACE_ADVANCES = 5; // primeiras 5 jornadas sem anúncios
export const REWARDED_DAILY_CAP = 3; // máx. de bónus por dia de jogo

export interface MonetizationState {
  premium: boolean;
  totalAdvances: number; // avanços de semana desde sempre (para o período de graça)
  advancesSinceAd: number; // avanços desde o último interstitial
  rewardedUsed: number; // bónus usados na data atual do jogo
  rewardedDate: string; // data de jogo a que o contador se refere
}

export function initialMonetization(): MonetizationState {
  return {
    premium: false,
    totalAdvances: 0,
    advancesSinceAd: 0,
    rewardedUsed: 0,
    rewardedDate: '',
  };
}

/**
 * Regista um avanço de semana e decide se deve aparecer um interstitial.
 * Muta o estado (contadores). Devolve true quando o anúncio deve ser mostrado.
 */
export function registerAdvance(m: MonetizationState): boolean {
  m.totalAdvances += 1;
  m.advancesSinceAd += 1;

  if (m.premium) return false;
  if (m.totalAdvances <= GRACE_ADVANCES) return false;
  if (m.advancesSinceAd < INTERSTITIAL_EVERY) return false;

  m.advancesSinceAd = 0;
  return true;
}

/** Recompensas disponíveis por ver um anúncio rewarded. */
export const AdReward = {
  SPONSOR_BONUS: 'SPONSOR_BONUS', // injeção de dinheiro de "patrocinador"
  FITNESS_BOOST: 'FITNESS_BOOST', // recuperação física do plantel
} as const;
export type AdReward = (typeof AdReward)[keyof typeof AdReward];

export const SPONSOR_BONUS_AMOUNT = 250_000;
export const FITNESS_BOOST_AMOUNT = 20;

/** O jogador ainda pode usar rewarded hoje (data do jogo)? */
export function canUseRewarded(m: MonetizationState, gameDate: string): boolean {
  if (m.rewardedDate !== gameDate) return true; // novo dia de jogo, contador reinicia
  return m.rewardedUsed < REWARDED_DAILY_CAP;
}

/** Regista o uso de um rewarded na data de jogo atual. Muta o estado. */
export function consumeRewarded(m: MonetizationState, gameDate: string): void {
  if (m.rewardedDate !== gameDate) {
    m.rewardedDate = gameDate;
    m.rewardedUsed = 0;
  }
  m.rewardedUsed += 1;
}

/**
 * Aplica a recompensa ao estado do jogo (muta o GameState do clube gerido).
 * Devolve uma descrição para a UI.
 */
export function applyReward(state: GameState, reward: AdReward): string {
  const clubId = state.meta.managedClubId;

  if (reward === 'SPONSOR_BONUS') {
    const fin = state.finances[clubId];
    if (fin) {
      fin.balance += SPONSOR_BONUS_AMOUNT;
      fin.transferBudget += Math.round(SPONSOR_BONUS_AMOUNT * 0.5);
    }
    return `Patrocinador surpresa! +${SPONSOR_BONUS_AMOUNT.toLocaleString('pt-PT')} € em caixa.`;
  }

  // FITNESS_BOOST — recupera o plantel inteiro.
  const club = state.clubs[clubId];
  if (club) {
    for (const id of club.squad) {
      const p = state.players[id];
      if (p) p.condition.fitness = Math.min(100, p.condition.fitness + FITNESS_BOOST_AMOUNT);
    }
  }
  return `Sessão de recuperação! Plantel +${FITNESS_BOOST_AMOUNT} de frescura.`;
}
