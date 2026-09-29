import { GameState } from '../core/models';
import { Msg } from '../core/i18n';
import { moveMoney } from '../core/economy';

/**
 * Lógica de monetização — pura e testável, sem SDKs.
 *
 * Regras de negócio:
 *  - Interstitial: no máximo 1 a cada INTERSTITIAL_EVERY avanços de semana
 *    (contagem contínua, não reinicia por época),
 *    nunca nos primeiros GRACE_ADVANCES avanços (não bombardear novos jogadores),
 *    e nunca para utilizadores premium.
 *  - Rewarded (voluntário): o jogador troca um anúncio por um bónus no jogo,
 *    com limite diário (data do jogo) para não quebrar o equilíbrio.
 *  - Premium: NÃO vê anúncio nenhum. Os bónus continuam a existir e concedem-se
 *    ao toque — mas com limite MAIS APERTADO, porque o anúncio deixa de estar lá
 *    a travar. Sem isso, `refreshAcademy` (que não tem limite próprio) rolava a
 *    academia infinitamente até sair um craque.
 *
 * O SDK (AdMob) vive em app/ads.ts; aqui só decidimos QUANDO e O QUÊ.
 */

// Frequência baixada 8→15 e graça 10→15 (feedback: os interstitials "do nada"
// entre "Jogar" e a partida atrapalham e rendem pouco). 1 em cada 15 jornadas dá
// ~1-2 por época (antes ~4), sem perder o inventário todo. O rewarded (opt-in,
// que rende mais por impressão) fica como a via principal de receita.
export const INTERSTITIAL_EVERY = 15; // 1 anúncio a cada 15 jornadas avançadas
export const GRACE_ADVANCES = 15; // primeiras 15 jornadas sem anúncios
export const REWARDED_DAILY_CAP = 3; // máx. de bónus por dia de jogo (com anúncio)

/**
 * Bónus por dia de jogo para quem tem Premium — concedidos sem anúncio.
 *
 * Cinco, não um: o que limita o jogador gratuito é o incómodo de ver vídeos, e
 * tirado o vídeo tem de ficar um travão no lugar — mas um travão tão apertado
 * que o Premium rendesse MENOS do que a paciência era castigar quem pagou.
 *
 * O exploit que isto travava (rolar a academia sem fim) passou a ter limite
 * próprio — `ACADEMY_ROLLS_PER_DAY` — que é onde o problema estava mesmo.
 */
export const PREMIUM_DAILY_CAP = 5;

/** Quantos bónus por dia de jogo este utilizador tem direito. */
export function rewardedCap(m: MonetizationState): number {
  return m.premium ? PREMIUM_DAILY_CAP : REWARDED_DAILY_CAP;
}

export interface MonetizationState {
  /** Sem anúncios AGORA: comprou o Premium OU tem o VIP em vigor. É o que a lógica lê. */
  premium: boolean;
  /** Comprou o `premium_no_ads` (para sempre). */
  premiumOwned: boolean;
  /** Subscrição VIP em vigor (pode expirar; a loja é quem manda). */
  vip: boolean;
  totalAdvances: number; // avanços de semana desde sempre (para o período de graça)
  advancesSinceAd: number; // avanços desde o último interstitial
  rewardedUsed: number; // bónus usados na data atual do jogo
  rewardedDate: string; // data de jogo a que o contador se refere
}

export function initialMonetization(): MonetizationState {
  return {
    premium: false,
    premiumOwned: false,
    vip: false,
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
  return m.rewardedUsed < rewardedCap(m);
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
export function applyReward(state: GameState, reward: AdReward): Msg {
  const clubId = state.meta.managedClubId;

  if (reward === 'SPONSOR_BONUS') {
    const fin = state.finances[clubId];
    // Escala pelo escalão (como o bónus diário): um valor fixo achatava as divisões.
    const tier = state.leagues[state.clubs[clubId]?.leagueId ?? '']?.tier ?? 1;
    const amount = Math.round(SPONSOR_BONUS_AMOUNT * Math.pow(0.5, tier - 1) / 10_000) * 10_000;
    if (fin) moveMoney(fin, amount);
    return { key: 'reward.sponsor', params: { amount: amount.toLocaleString('pt-PT') } };
  }

  // FITNESS_BOOST — recupera o plantel inteiro.
  const club = state.clubs[clubId];
  if (club) {
    for (const id of club.squad) {
      const p = state.players[id];
      if (p) p.condition.fitness = Math.min(100, p.condition.fitness + FITNESS_BOOST_AMOUNT);
    }
  }
  return { key: 'reward.fitness', params: { amount: FITNESS_BOOST_AMOUNT } };
}
