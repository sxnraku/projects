/**
 * Teste de fumo da ETAPA 5 (núcleo) — novo jogo + core loop completo.
 * Usa divisions:1 para validar o loop base; a pirâmide de divisões tem suite própria (career.smoke).
 * Corre com: npm run smoke:game
 */
import { naturalOverall } from '../../models';
import { advanceWeek, createNewGame, nextRound, rolloverSeason } from '../index';
import { TrainingFocus } from '../../training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

const LEAGUE = 'liga_1';

console.log('ETAPA 5 (núcleo) — novo jogo e core loop\n');

console.log('Geração de novo jogo (1 divisão, 16 clubes, 20 jogadores cada):');
const NUM = 16, SQUAD = 20;
const t0 = Date.now();
const state = createNewGame({ managerName: 'Renato', numClubs: NUM, squadSize: SQUAD, divisions: 1, seed: 12345 });
const genMs = Date.now() - t0;
const playerCount = Object.keys(state.players).length;
assert(Object.keys(state.clubs).length === NUM, `${NUM} clubes criados`);
assert(playerCount === NUM * SQUAD, `${playerCount} jogadores criados`);
assert(state.meta.managedClubId !== '', `clube gerido definido: ${state.clubs[state.meta.managedClubId]?.name}`);
assert(Object.keys(state.tactics).length === NUM, 'cada clube tem tática por defeito');
assert(state.tactics[state.meta.managedClubId]!.lineup.length === 11, 'onze com 11 jogadores auto-selecionados');
assert(state.schedules[LEAGUE]!.fixtures.length === NUM * (NUM - 1), 'calendário completo gerado');
console.log(`    (geração em ${genMs}ms)`);

console.log('\nDeterminismo (mesma seed → mesmo mundo):');
const state2 = createNewGame({ managerName: 'Renato', numClubs: NUM, squadSize: SQUAD, divisions: 1, seed: 12345 });
assert(state.clubs['club_t1_0']!.name === state2.clubs['club_t1_0']!.name, 'nomes de clube idênticos');
assert(JSON.stringify(state.players['club_t1_0_p0']!.attributes) === JSON.stringify(state2.players['club_t1_0_p0']!.attributes),
  'atributos de jogador idênticos');

console.log('\nSimular uma jornada (avançar 1 semana):');
const before = state.standings[LEAGUE]!['club_t1_0']!.played;
const wr = advanceWeek(state, TrainingFocus.TECHNICAL);
assert(wr.fixtures.length === NUM / 2, `${wr.fixtures.length} jogos simulados nesta jornada`);
assert(wr.fixtures.every((f) => f.result !== null), 'todos os jogos têm resultado');
const after = state.standings[LEAGUE]!['club_t1_0']!.played;
assert(after === before + 1, 'tabela avançou 1 jogo para os clubes envolvidos');
assert(wr.confidence >= 0 && wr.confidence <= 100, `confiança da direção em 0..100 (${wr.confidence})`);

console.log('\nSimular época inteira e medir performance:');
const tSeason = Date.now();
let weeks = 1; // já jogámos 1
while (nextRound(state, LEAGUE) !== null) {
  advanceWeek(state, TrainingFocus.TECHNICAL);
  weeks++;
}
const seasonMs = Date.now() - tSeason;
const totalRounds = state.schedules[LEAGUE]!.totalRounds;
assert(weeks === totalRounds, `época completa: ${weeks} jornadas simuladas`);
const allPlayed = state.standings[LEAGUE]!;
assert(Object.values(allPlayed).every((r) => r.played === totalRounds), 'todos os clubes jogaram todas as jornadas');
console.log(`    (época de ${totalRounds} jornadas × ${playerCount} jogadores treinados/semana em ${seasonMs}ms → ${(seasonMs / totalRounds).toFixed(1)}ms/jornada)`);
assert(seasonMs < 3000, `performance: época simulada em <3s (${seasonMs}ms)`);

console.log('\nRollover de época:');
const seasonBefore = state.meta.season;
const summary = rolloverSeason(state);
assert(state.meta.season === seasonBefore + 1, `nova época: ${state.meta.season}`);
assert(summary.record.season === seasonBefore, 'historial regista a época concluída');
assert(nextRound(state, LEAGUE) === 1, 'novo calendário pronto na jornada 1');
assert(Object.values(state.standings[LEAGUE]!).every((r) => r.played === 0), 'tabela reiniciada a zero');
assert(state.career.seasons.length === 1, 'carreira tem 1 época registada');

console.log('\nJogadores jovens evoluíram ao longo da época:');
const youngWithGap = Object.values(state2.players).find(
  (p) => p.age <= 20 && p.potential - naturalOverall(p) >= 3,
);
if (youngWithGap) {
  const ovStart = naturalOverall(youngWithGap);
  let guard = 0;
  while (nextRound(state2, LEAGUE) !== null && guard++ < 40) {
    advanceWeek(state2, TrainingFocus.TECHNICAL);
  }
  const ovEnd = naturalOverall(state2.players[youngWithGap.id]!);
  assert(ovEnd >= ovStart, `jovem ${youngWithGap.firstName} evoluiu ${ovStart}→${ovEnd} numa época`);
} else {
  console.log('  (nenhum jovem com margem grande neste seed — salto)');
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
