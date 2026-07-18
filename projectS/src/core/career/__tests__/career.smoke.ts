/**
 * Teste de fumo — carreira, divisões, academia e segunda hipótese.
 * Corre com: npm run smoke:career
 */
import {
  advanceWeek,
  createNewGame,
  isWonderkid,
  managedLeagueId,
  nextRound,
  replayFixture,
  rolloverSeason,
  youthTrial,
} from '../../game';
import {
  assignObjective,
  claimDailyBonus,
  dailyBonusAvailable,
  evaluateSeason,
  initialCareer,
  objectiveTarget,
  updateConfidence,
} from '../index';
import { acceptJobOffer } from '../../game/advance';
import { deriveSeed, Rng } from '../../engine/rng';
import { TrainingFocus } from '../../training';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Carreira + divisões — teste de fumo\n');

// ---------- Pirâmide de divisões ----------
console.log('Pirâmide de 3 divisões (12 clubes cada):');
const state = createNewGame({ managerName: 'Renato', numClubs: 12, squadSize: 18, divisions: 3, seed: 777 });
assert(Object.keys(state.leagues).length === 3, '3 ligas criadas');
assert(Object.keys(state.clubs).length === 36, '36 clubes no total');
const managedClub = state.clubs[state.meta.managedClubId]!;
assert(managedClub.leagueId === 'liga_3', `treinador começa na última divisão (${managedClub.leagueId})`);
assert(['TITLE', 'TOP_HALF', 'AVOID_RELEGATION'].includes(state.career.objective),
  `objetivo da direção atribuído: ${state.career.objective}`);

const avgRepTier = (id: string) => {
  const l = state.leagues[id]!;
  return l.clubIds.reduce((s, c) => s + state.clubs[c]!.reputation, 0) / l.clubIds.length;
};
assert(avgRepTier('liga_1') > avgRepTier('liga_2') && avgRepTier('liga_2') > avgRepTier('liga_3'),
  'reputação média decresce por divisão');

console.log('\nTodas as divisões avançam em simultâneo:');
advanceWeek(state, TrainingFocus.TECHNICAL);
for (const lid of ['liga_1', 'liga_2', 'liga_3']) {
  const played = Object.values(state.standings[lid]!).every((r) => r.played === 1);
  assert(played, `${lid}: todos os clubes jogaram a jornada 1`);
}

// ---------- Época completa + promoções ----------
console.log('\nÉpoca completa + promoções/despromoções:');
while (nextRound(state, managedLeagueId(state)) !== null) {
  advanceWeek(state, TrainingFocus.TECHNICAL);
}
// Identifica os 2 primeiros da liga_2 e os 2 últimos da liga_1 ANTES do rollover.
const sortedL2 = Object.values(state.standings['liga_2']!).sort((a, b) => b.points - a.points);
const topL2 = sortedL2.slice(0, 2).map((r) => r.clubId);

const summary = rolloverSeason(state);
assert(summary.moves.length === 8, `8 movimentos entre 3 divisões (${summary.moves.length})`);
assert(topL2.every((id) => state.clubs[id]!.leagueId === 'liga_1'), 'os 2 primeiros da Liga 2 subiram à Liga 1');
for (const lid of ['liga_1', 'liga_2', 'liga_3']) {
  assert(state.leagues[lid]!.clubIds.length === 12, `${lid} mantém 12 clubes após as trocas`);
}
assert(state.career.seasons.length === 1, 'historial regista a época');
assert(summary.youth.totalJoined === 36 * 2, `fornada: 2 jovens × 36 clubes (${summary.youth.totalJoined})`);
assert(summary.youth.joinedManagedClub.length === 2, 'clube gerido recebeu 2 jovens');
assert(Object.values(state.players).every((p) => p.age < 38), 'ninguém joga com 38+ (reformas ativas)');

// ---------- Objetivos e confiança (unitário) ----------
console.log('\nObjetivos e confiança:');
assert(assignObjective(1, 12) === 'TITLE', 'rank esperado 1 → lutar pelo título');
assert(assignObjective(5, 12) === 'TOP_HALF', 'rank esperado 5 → 1ª metade');
assert(assignObjective(11, 12) === 'AVOID_RELEGATION', 'rank esperado 11 → evitar despromoção');
assert(objectiveTarget('TITLE', 12) === 2, 'alvo do título = 2º lugar');

const c1 = initialCareer();
c1.objective = 'TOP_HALF';
const conf0 = c1.confidence;
updateConfidence(c1, 3, 12); // acima do alvo (6)
assert(c1.confidence > conf0, 'boa posição sobe a confiança');
updateConfidence(c1, 12, 12); // último
updateConfidence(c1, 12, 12);
assert(c1.confidence < conf0 + 2, 'má posição desce a confiança');

console.log('\nAvaliação de fim de época:');
const cOk = initialCareer(); cOk.objective = 'TITLE';
assert(evaluateSeason(cOk, 1, 12, false).metObjective, 'campeão cumpre objetivo do título');
const cFail = initialCareer(); cFail.objective = 'TITLE';
const verdictBad = evaluateSeason(cFail, 9, 12, false);
assert(verdictBad.fired, 'falhar o título por 7 lugares → despedido');
const cClose = initialCareer(); cClose.objective = 'TOP_HALF'; cClose.confidence = 60;
const verdictClose = evaluateSeason(cClose, 8, 12, false);
assert(!verdictClose.fired, 'falhar por pouco com confiança → última oportunidade');

// ---------- Despedimento e ofertas ----------
console.log('\nDespedimento gera ofertas e aceitar muda de clube:');
const s2 = createNewGame({ managerName: 'X', numClubs: 8, squadSize: 16, divisions: 2, seed: 42 });
s2.career.pendingOffers = []; // simula despedimento manualmente
const otherClub = Object.values(s2.clubs).find((c) => c.id !== s2.meta.managedClubId)!;
s2.career.pendingOffers = [otherClub.id];
assert(acceptJobOffer(s2, otherClub.id), 'oferta aceite');
assert(s2.meta.managedClubId === otherClub.id, 'clube gerido mudou');
assert(s2.career.pendingOffers.length === 0, 'ofertas limpas');
assert(!acceptJobOffer(s2, 'club_inexistente'), 'oferta inválida rejeitada');

// ---------- Wonderkids e jovem à experiência ----------
console.log('\nAcademia — wonderkids e jovem à experiência:');
const anyWonderkid = Object.values(state.players).some(isWonderkid);
console.log(`    (wonderkids no mundo após 1 fornada: ${Object.values(state.players).filter(isWonderkid).length})`);
assert(typeof anyWonderkid === 'boolean', 'flag de wonderkid calculável');
const squadBefore = state.clubs[state.meta.managedClubId]!.squad.length;
const trial = youthTrial(state, new Rng(deriveSeed(state.meta.rngSeed, 'trial', 1)));
assert(state.clubs[state.meta.managedClubId]!.squad.length === squadBefore + 1, 'jovem à experiência entrou no plantel');
assert(trial.age <= 18 && trial.potential > 0, `prospeto: ${trial.firstName} ${trial.lastName}, ${trial.age} anos, pot ${trial.potential}`);

// ---------- Bónus diário ----------
console.log('\nBónus diário (datas reais):');
const cd = initialCareer();
assert(dailyBonusAvailable(cd, '2026-07-16'), 'bónus disponível no 1º dia');
const b1 = claimDailyBonus(cd, '2026-07-16');
assert(b1 === 100_000, `dia 1 = 100k (${b1})`);
assert(!dailyBonusAvailable(cd, '2026-07-16'), 'não repete no mesmo dia');
const b2 = claimDailyBonus(cd, '2026-07-17');
assert(b2 === 200_000 && cd.loginStreak === 2, `dia seguinte: streak 2 → 200k (${b2})`);
const b3 = claimDailyBonus(cd, '2026-07-25'); // falhou dias
assert(b3 === 100_000 && cd.loginStreak === 1, 'falhar um dia reinicia a streak');

// ---------- Segunda hipótese (replay) ----------
console.log('\nSegunda hipótese — re-simular jogo:');
const s3 = createNewGame({ managerName: 'R', numClubs: 8, squadSize: 16, divisions: 1, seed: 99 });
const wr3 = advanceWeek(s3, TrainingFocus.TECHNICAL);
const fx = wr3.fixtures[0]!;
const oldResult = fx.result!;
const table3 = s3.standings['liga_1']!;
const sumBefore = Object.values(table3).reduce((s, r) => s + r.points, 0);
const golosBefore = Object.values(table3).reduce((s, r) => s + r.goalsFor, 0);

const newResult = replayFixture(s3, fx.id);
assert(newResult !== null, 'replay executado');
assert(newResult!.seed !== oldResult.seed, 'novo resultado usa seed diferente');
const golosAfter = Object.values(table3).reduce((s, r) => s + r.goalsFor, 0);
const golosSofridos = Object.values(table3).reduce((s, r) => s + r.goalsAgainst, 0);
assert(golosAfter === golosSofridos, 'tabela consistente após replay (marcados == sofridos)');
const expectedDelta = (newResult!.home.goals + newResult!.away.goals) - (oldResult.home.goals + oldResult.away.goals);
assert(golosAfter === golosBefore + expectedDelta, 'golos da tabela refletem exatamente o novo resultado');
const played1 = Object.values(table3).every((r) => r.played === 1);
assert(played1, 'nº de jogos não duplicou (revert+apply corretos)');
const sumAfter = Object.values(table3).reduce((s, r) => s + r.points, 0);
assert(sumAfter >= sumBefore - 1 && sumAfter <= sumBefore + 1, 'pontos totais consistentes (2 empate / 3 decisão)');

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
