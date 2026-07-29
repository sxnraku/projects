/**
 * Teste de fumo da REDE DE OLHEIROS (nova versão):
 * OVR sempre exposto; só o POTENCIAL de jovens promessas fica por revelar,
 * num intervalo apertado (0-100) que contém a verdade. Sondar → potencial exato.
 * Corre com: npm run smoke:scouting
 */
import {
  createNewGame,
  advanceWeek,
  scoutingLevel,
  scoutSlots,
  scoutRounds,
  potentialHalfWidth,
  tierInRange,
  isProspect,
  isPotentialKnown,
  potentialRange,
  scoutableProspects,
  canScoutPlayer,
  startPlayerMission,
  startLeagueMission,
  freeSlots,
  activeMissions,
  getScouting,
} from '../index';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — rede de olheiros\n');

const s = createNewGame({ managerName: 'R', numClubs: 10, squadSize: 20, divisions: 3, seed: 321 });
const myId = s.meta.managedClubId;
const myTier = s.leagues[s.clubs[myId]!.leagueId]!.tier;

console.log('Configuração por nível:');
assert(scoutSlots(1) === 1 && scoutSlots(5) === 5, 'slots: L1=1 … L5=5');
assert(scoutRounds(1) > scoutRounds(5), `velocidade: L1 (${scoutRounds(1)} jorn.) mais lento que L5 (${scoutRounds(5)})`);
assert(potentialHalfWidth(1) > potentialHalfWidth(5), `intervalo aperta: L1 (±${potentialHalfWidth(1)}) mais largo que L5 (±${potentialHalfWidth(5)})`);
assert(tierInRange(myTier, myTier, 1) && !tierInRange(myTier, myTier - 1, 1), 'L1 só alcança a própria divisão');

console.log('\nExposição (nível 1):');
// jogador feito (>=21) de outro clube → potencial exposto
const veteran = Object.values(s.players).find((p) => p.clubId && p.clubId !== myId && p.age >= 24)!;
assert(!isProspect(veteran), 'um jogador feito (24+) NÃO é promessa');
assert(isPotentialKnown(s, veteran), 'o potencial de um jogador feito está exposto (sem sondar)');
assert(potentialRange(s, veteran).exact, 'a estimativa dele é exata');

// promessa jovem → potencial escondido, num intervalo que contém a verdade
const prospect = Object.values(s.players).find((p) => p.clubId && p.clubId !== myId && isProspect(p)
  && tierInRange(myTier, s.leagues[s.clubs[p.clubId]!.leagueId]!.tier, 1))!;
assert(!!prospect, 'existe uma promessa ao alcance');
const r = potentialRange(s, prospect);
const truePot100 = prospect.potential * 5;
assert(!r.exact, 'a promessa começa com potencial POR revelar (intervalo)');
assert(truePot100 >= r.min && truePot100 <= r.max, `a verdade (${truePot100}) cai no intervalo ${r.min}-${r.max}`);
assert((r.max - r.min) <= 14, `intervalo apertado (${r.max - r.min} de largura, não vago)`);

console.log('\nSondar uma promessa:');
assert(scoutableProspects(s).some((p) => p.id === prospect.id), 'a promessa aparece nos "Sondáveis"');
assert(canScoutPlayer(s, prospect.id), 'pode sondar a promessa');
startPlayerMission(s, prospect.id);
assert(activeMissions(s).length === 1 && freeSlots(s) === 0, 'a missão ocupa o slot');
let guard = 0;
while (!isPotentialKnown(s, prospect) && guard++ < 8) advanceWeek(s);
assert(isPotentialKnown(s, prospect), 'após avançar, o potencial fica conhecido');
assert(potentialRange(s, prospect).exact, 'a estimativa passa a exata');

console.log('\nEspiar uma liga → promessas:');
const leagueId = s.clubs[myId]!.leagueId;
const before = getScouting(s).prospects.length;
startLeagueMission(s, leagueId);
guard = 0;
while (getScouting(s).prospects.length === before && guard++ < 8) advanceWeek(s);
assert(getScouting(s).prospects.length > before, `a missão à liga revelou ${getScouting(s).prospects.length - before} promessas`);

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
