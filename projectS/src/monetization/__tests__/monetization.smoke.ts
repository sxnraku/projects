/**
 * Teste de fumo da ETAPA 6 — regras de monetização.
 * Corre com: npm run smoke:ads
 */
import { createNewGame } from '../../core/game';
import {
  applyReward,
  canUseRewarded,
  consumeRewarded,
  FITNESS_BOOST_AMOUNT,
  GRACE_ADVANCES,
  initialMonetization,
  INTERSTITIAL_EVERY,
  PREMIUM_DAILY_CAP,
  registerAdvance,
  rewardedCap,
  REWARDED_DAILY_CAP,
  SPONSOR_BONUS_AMOUNT,
} from '../index';
import { useMonetizationStore } from '../../state/monetizationStore';
import { useGameStore } from '../../state/gameStore';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('ETAPA 6 — teste de fumo da monetização\n');

console.log('Período de graça (sem anúncios no início):');
const m1 = initialMonetization();
let shownDuringGrace = 0;
for (let i = 0; i < GRACE_ADVANCES; i++) if (registerAdvance(m1)) shownDuringGrace++;
assert(shownDuringGrace === 0, `0 interstitials nos primeiros ${GRACE_ADVANCES} avanços`);

console.log('\nFrequência de interstitials após a graça:');
const m2 = initialMonetization();
let shown = 0;
const TOTAL = GRACE_ADVANCES + INTERSTITIAL_EVERY * 4; // 4 ciclos completos
for (let i = 0; i < TOTAL; i++) if (registerAdvance(m2)) shown++;
assert(shown === 4, `${shown} interstitials em ${TOTAL} avanços (esperado 4 — 1 a cada ${INTERSTITIAL_EVERY})`);

console.log('\nPremium remove interstitials:');
const m3 = initialMonetization();
m3.premium = true;
let shownPremium = 0;
for (let i = 0; i < 30; i++) if (registerAdvance(m3)) shownPremium++;
assert(shownPremium === 0, 'premium nunca vê interstitials');

console.log('\nLimite diário de rewarded:');
const m4 = initialMonetization();
const date = '2026-09-01';
let used = 0;
while (canUseRewarded(m4, date)) { consumeRewarded(m4, date); used++; if (used > 10) break; }
assert(used === REWARDED_DAILY_CAP, `cap diário respeitado (${used}/${REWARDED_DAILY_CAP})`);
assert(canUseRewarded(m4, '2026-09-08'), 'nova data de jogo reinicia o contador');

console.log('\nRecompensas aplicadas ao GameState:');
const game = createNewGame({ managerName: 'Renato', numClubs: 6, squadSize: 16, divisions: 1, seed: 7 });
const clubId = game.meta.managedClubId;
const balBefore = game.finances[clubId]!.balance;
const msg1 = applyReward(game, 'SPONSOR_BONUS');
assert(game.finances[clubId]!.balance === balBefore + SPONSOR_BONUS_AMOUNT,
  `patrocínio soma ${SPONSOR_BONUS_AMOUNT.toLocaleString('pt-PT')} ao saldo`);
assert(msg1.key === 'reward.sponsor', 'mensagem de patrocínio devolvida');

// Cansa o plantel e aplica o boost.
const squad = game.clubs[clubId]!.squad;
for (const id of squad) game.players[id]!.condition.fitness = 50;
applyReward(game, 'FITNESS_BOOST');
assert(squad.every((id) => game.players[id]!.condition.fitness === 50 + FITNESS_BOOST_AMOUNT),
  `plantel inteiro recuperou +${FITNESS_BOOST_AMOUNT} de frescura`);

console.log('\nIntegração via stores (Zustand):');
useGameStore.getState().newGame({ managerName: 'R', numClubs: 6, squadSize: 16, divisions: 1, seed: 11 });
const mStore = useMonetizationStore.getState();
assert(mStore.rewardedAvailable(), 'rewarded disponível no arranque');
const balStoreBefore = (() => {
  const s = useGameStore.getState().state!;
  return s.finances[s.meta.managedClubId]!.balance;
})();
const msg = mStore.claimReward('SPONSOR_BONUS');
const balStoreAfter = (() => {
  const s = useGameStore.getState().state!;
  return s.finances[s.meta.managedClubId]!.balance;
})();
assert(msg !== null && balStoreAfter === balStoreBefore + SPONSOR_BONUS_AMOUNT,
  'claimReward aplica o bónus através das stores');

// Esgota o cap e verifica o bloqueio.
useMonetizationStore.getState().claimReward('SPONSOR_BONUS');
useMonetizationStore.getState().claimReward('SPONSOR_BONUS');
assert(!useMonetizationStore.getState().rewardedAvailable(), 'cap diário bloqueia o 4º rewarded');
assert(useMonetizationStore.getState().claimReward('SPONSOR_BONUS') === null, 'claim bloqueado devolve null');

useMonetizationStore.getState().setPremium(true);
assert(useMonetizationStore.getState().m.premium, 'setPremium ativa o modo premium');
assert(!useMonetizationStore.getState().onAdvance(), 'premium: onAdvance nunca pede anúncio');

// ---------------------------------------------------------------------------
// PREMIUM: bónus sem anúncio, com cap por dia de jogo.
//
// Tirado o vídeo, some o travão que limitava o jogador gratuito — daí o cap.
// A academia, que era o caso pior (rolar o grupo até sair um craque), passou a
// ter limite próprio por época: ver `ACADEMY_ROLLS_PER_SEASON`.
// ---------------------------------------------------------------------------
// Bloco assíncrono: o `tsx` compila para CJS e não aceita `await` no topo.
void (async () => {
console.log('\nPremium: bónus sem anúncio, com cap diário:');
useGameStore.getState().newGame({ managerName: 'R', numClubs: 6, squadSize: 16, divisions: 1, seed: 12 });
useMonetizationStore.setState({ m: { ...initialMonetization(), premium: true } });

assert(rewardedCap({ ...initialMonetization(), premium: true }) === PREMIUM_DAILY_CAP,
  `cap do premium é ${PREMIUM_DAILY_CAP}`);
assert(rewardedCap(initialMonetization()) === REWARDED_DAILY_CAP,
  `cap de quem vê anúncios continua ${REWARDED_DAILY_CAP}`);

assert(useMonetizationStore.getState().adSlotAvailable(), 'premium: há bónus no arranque do dia');

const balPremBefore = (() => {
  const s = useGameStore.getState().state!;
  return s.finances[s.meta.managedClubId]!.balance;
})();
// `claimAdSlot` resolve SEM tocar no SDK: se importasse `native/ads` para
// mostrar um vídeo, isto rebentava aqui em Node — que é a prova de que não o faz.
const granted = await useMonetizationStore.getState().claimAdSlot();
assert(granted, 'premium: o bónus é concedido sem anúncio');

const premMsg = useMonetizationStore.getState().claimReward('SPONSOR_BONUS');
const balPremAfter = (() => {
  const s = useGameStore.getState().state!;
  return s.finances[s.meta.managedClubId]!.balance;
})();
assert(premMsg !== null && balPremAfter === balPremBefore + SPONSOR_BONUS_AMOUNT,
  'premium: o bónus entra no saldo uma só vez');

// Gasta os restantes até ao cap. Escrito em função da constante de propósito:
// assim mudar o cap não obriga a reescrever o teste (foi o que aconteceu ao
// subir de 1 para 5).
for (let k = 1; k < PREMIUM_DAILY_CAP; k++) {
  assert(await useMonetizationStore.getState().claimAdSlot(), `premium: bónus ${k + 1} de ${PREMIUM_DAILY_CAP} concedido`);
}
assert(!useMonetizationStore.getState().adSlotAvailable(),
  `premium: gastos os ${PREMIUM_DAILY_CAP} bónus, não há mais nesse dia`);
assert(!(await useMonetizationStore.getState().claimAdSlot()),
  'premium: o pedido seguinte do mesmo dia é recusado');

// Dia de jogo novo → volta a haver bónus.
const g = useGameStore.getState().state!;
useGameStore.getState().loadState({ ...g, meta: { ...g.meta, currentDate: '2030-01-01' } });
assert(useMonetizationStore.getState().adSlotAvailable(), 'premium: novo dia de jogo repõe o bónus');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
})();
