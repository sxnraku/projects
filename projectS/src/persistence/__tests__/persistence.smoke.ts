/**
 * Teste de fumo da persistência + store (ETAPA 5).
 * Corre com: npm run smoke:persist
 */
import { createNewGame } from '../../core/game';
import { deserialize, serialize } from '../serialize';
import { useGameStore } from '../../state/gameStore';
import { TrainingFocus } from '../../core/training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('ETAPA 5 — persistência e store\n');

console.log('Round-trip de serialização (GameState → linhas → GameState):');
const original = createNewGame({ managerName: 'Renato', numClubs: 8, squadSize: 18, divisions: 1, seed: 2024 });
const rows = serialize(original);
const restored = deserialize(rows);

assert(Object.keys(restored.players).length === Object.keys(original.players).length, 'nº de jogadores preservado');
assert(restored.meta.managedClubId === original.meta.managedClubId, 'clube gerido preservado');
assert(JSON.stringify(restored.players['club_t1_0_p0']) === JSON.stringify(original.players['club_t1_0_p0']),
  'jogador idêntico após round-trip');
assert(JSON.stringify(restored.clubs['club_t1_0']) === JSON.stringify(original.clubs['club_t1_0']),
  'clube idêntico após round-trip');
assert(JSON.stringify(restored.schedules) === JSON.stringify(original.schedules), 'calendário preservado');
assert(JSON.stringify(restored.standings) === JSON.stringify(original.standings), 'tabela preservada');
assert(JSON.stringify(restored.career) === JSON.stringify(original.career), 'carreira preservada');
// Prova forte: serializar o estado restaurado dá exatamente as mesmas linhas.
assert(JSON.stringify(serialize(restored)) === JSON.stringify(rows), 'serialização estável (idempotente)');

console.log('\nRound-trip a meio de uma época:');
const mid = createNewGame({ managerName: 'X', numClubs: 6, squadSize: 16, divisions: 1, seed: 99 });
// (simula-se via store abaixo; aqui só confirmamos que sobrevive à serialização)
const midRestored = deserialize(serialize(mid));
assert(midRestored.meta.season === mid.meta.season, 'época preservada');

console.log('\nStore Zustand — core loop através da store:');
const store = useGameStore.getState();
store.newGame({ managerName: 'Renato', numClubs: 8, squadSize: 18, divisions: 1, seed: 555 });
assert(useGameStore.getState().state !== null, 'novo jogo criado na store');
assert(useGameStore.getState().managedClub() !== null, 'seletor managedClub funciona');
assert(useGameStore.getState().squad().length === 18, 'seletor squad devolve o plantel');

const stBefore = useGameStore.getState().standings();
assert(stBefore.length === 8, 'tabela tem 8 clubes');
assert(stBefore.every((r) => r.played === 0), 'tabela começa a zero');

const upcoming = useGameStore.getState().upcomingFixtures(3);
assert(upcoming.length > 0 && upcoming.length <= 3, `próximos jogos do clube gerido: ${upcoming.length}`);

useGameStore.getState().setTrainingFocus(TrainingFocus.PHYSICAL);
assert(useGameStore.getState().trainingFocus === TrainingFocus.PHYSICAL, 'foco de treino atualizado');

const wr = useGameStore.getState().advance();
assert(wr !== null && wr.fixtures.length === 4, 'advance simulou a jornada (4 jogos)');
const stAfter = useGameStore.getState().standings();
assert(stAfter.some((r) => r.played === 1), 'tabela avançou após advance');

// Mudança de referência de topo (para re-render), entidades partilhadas.
const s1 = useGameStore.getState().state;
useGameStore.getState().advance();
const s2 = useGameStore.getState().state;
assert(s1 !== s2, 'referência de topo muda a cada advance (dispara re-render)');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
