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
  registerAdvance,
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
assert(msg1.includes('Patrocinador'), 'mensagem de patrocínio devolvida');

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

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
