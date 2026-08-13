/**
 * Teste de fumo da DISCIPLINA, dos ADEPTOS e da IMPRENSA.
 * Corre com: npm run smoke:morale
 *
 * As três coisas partilham o mesmo risco: são sistemas de NÚMERO ESCONDIDO. Um
 * contador de amarelos que não acumule, um humor que fique preso num extremo ou
 * uma bravata que nunca se resolva não rebentam nada — o jogo continua a correr
 * e o utilizador nunca percebe que a mecânica está morta. É exatamente o tipo
 * de avaria que só um teste apanha.
 *
 * Cobre também a compatibilidade com saves antigos: nenhum destes campos existe
 * nos jogos gravados por versões anteriores, e todos têm de entrar a zero sem
 * ninguém dar por isso.
 */
import { advanceWeek, createNewGame } from '../index';
import {
  applyCards, isAtRisk, yellowsToBan, YELLOWS_FOR_BAN,
} from '../discipline';
import {
  attendanceFactor, ensureFans, fanBand, fanMood, fansOnArrival, fansOnDeparture,
  fansOnRelegation, fansOnSale, fansOnTrophy, homeSupport, initialMood, matchMoodDelta,
  moraleFromFans, nudgeFans, resetSupport, squadShare, updateFansWeek, FAN_NEUTRAL,
} from '../fans';
import {
  answerPress, ensurePress, expirePress, generatePressConference, pickTopic,
  PRESS_OPTIONS, PressTopic, questionKey, resolveClaim, winlessStreak, winStreak,
} from '../press';
import { simulateMatch } from '../../engine';
import { matchdayGate } from '../../economy';
import { Fixture, MatchResult, naturalOverall } from '../../models';
import { deserialize, serialize } from '../../../persistence/serialize';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — disciplina, adeptos e imprensa\n');

const s = createNewGame({ managerName: 'R', useBase: true, seed: 4242 });
const managedId = s.meta.managedClubId;
const club = s.clubs[managedId]!;

/** Constrói um jogo fictício com os cartões que quisermos. */
function fakeFixture(stats: Record<string, { yellow: number; red: boolean }>): Fixture {
  const playerStats: MatchResult['playerStats'] = {};
  for (const id in stats) {
    playerStats[id] = { goals: 0, assists: 0, yellow: stats[id]!.yellow, red: stats[id]!.red, rating: 6 };
  }
  return {
    id: 'fx_test', leagueId: 'x', round: 1, homeClubId: managedId, awayClubId: 'other',
    result: {
      homeClubId: managedId, awayClubId: 'other',
      home: { goals: 0, shots: 0, onTarget: 0, possession: 50 },
      away: { goals: 0, shots: 0, onTarget: 0, possession: 50 },
      events: [], playerStats, seed: 0, motmId: null,
    } as unknown as MatchResult,
  };
}

// ====================================================================
console.log('Disciplina — amarelos que atravessam jogos:');

const a = club.squad[0]!;
const b = club.squad[1]!;
const c = club.squad[2]!;

{
  // Saves antigos não têm o campo: tem de se comportar como 0.
  assert((s.players[a]!.condition.seasonYellows ?? 0) === 0,
    'um jogador novo começa a época com 0 amarelos');
  assert(!isAtRisk(undefined) && yellowsToBan(undefined) === YELLOWS_FOR_BAN,
    'sem contador, ninguém está em risco e faltam 5 para o castigo');
}

{
  // Quatro amarelos: aviso, sem castigo.
  for (let i = 0; i < 4; i++) applyCards(s, [fakeFixture({ [a]: { yellow: 1, red: false } })]);
  const p = s.players[a]!;
  assert(p.condition.seasonYellows === 4, 'quatro jornadas com amarelo somam 4');
  assert(isAtRisk(p.condition.seasonYellows), 'aos 4 o jogador está EM RISCO');
  assert(!p.condition.suspended, 'aos 4 ainda não há castigo');
}

{
  // O quinto castiga.
  const res = applyCards(s, [fakeFixture({ [a]: { yellow: 1, red: false } })]);
  const p = s.players[a]!;
  assert(p.condition.suspended === 1, 'o 5.º amarelo vale um jogo de castigo');
  assert(p.condition.seasonYellows === 5, 'o contador NÃO zera — é o total da época');
  assert(res.bans.length === 1 && res.bans[0]!.reason === 'ACCUMULATION',
    'o castigo é reportado como acumulação');
  assert(!isAtRisk(5), 'logo a seguir ao castigo já não está em risco');
}

{
  // E volta a castigar aos 10, não antes.
  s.players[a]!.condition.suspended = 0;
  for (let i = 0; i < 4; i++) applyCards(s, [fakeFixture({ [a]: { yellow: 1, red: false } })]);
  assert(!s.players[a]!.condition.suspended, 'do 6.º ao 9.º amarelo não há castigo novo');
  applyCards(s, [fakeFixture({ [a]: { yellow: 1, red: false } })]);
  assert(s.players[a]!.condition.suspended === 1 && s.players[a]!.condition.seasonYellows === 10,
    'o 10.º amarelo castiga outra vez');
}

{
  // Expulsão: 1 jogo, e os amarelos DESSE jogo não contam.
  const before = s.players[b]!.condition.seasonYellows ?? 0;
  const res = applyCards(s, [fakeFixture({ [b]: { yellow: 2, red: true } })]);
  assert(s.players[b]!.condition.suspended === 1, 'a expulsão vale um jogo de castigo');
  assert((s.players[b]!.condition.seasonYellows ?? 0) === before,
    'os amarelos que deram o vermelho não acumulam (senão castigava duas vezes pelo mesmo)');
  assert(res.bans[0]!.reason === 'RED', 'o motivo do castigo é a expulsão');
}

{
  // Dois amarelos de uma vez podem saltar o limiar sem escapar ao castigo.
  s.players[c]!.condition.seasonYellows = 4;
  applyCards(s, [fakeFixture({ [c]: { yellow: 2, red: false } })]);
  assert(s.players[c]!.condition.suspended === 1 && s.players[c]!.condition.seasonYellows === 6,
    'saltar de 4 para 6 num só jogo continua a castigar');
}

// ====================================================================
console.log('\nAdeptos — humor com memória:');

{
  const f = ensureFans(s);
  assert(f.mood >= 0 && f.mood <= 100, 'o humor inicial está dentro dos limites');
  assert(initialMood(90) < initialMood(20),
    'adeptos de clube grande começam mais exigentes do que os de clube pequeno');
}

{
  // O que pesa é o resultado FACE AO ESPERADO.
  const upset = matchMoodDelta({
    goalsFor: 1, goalsAgainst: 0, myReputation: 30, oppReputation: 85, derby: false, oppName: 'X',
  });
  const routine = matchMoodDelta({
    goalsFor: 1, goalsAgainst: 0, myReputation: 85, oppReputation: 30, derby: false, oppName: 'X',
  });
  assert(upset.delta > routine.delta,
    'ganhar ao favorito vale mais do que ganhar a quem se devia ganhar');

  const badLoss = matchMoodDelta({
    goalsFor: 0, goalsAgainst: 1, myReputation: 85, oppReputation: 30, derby: false, oppName: 'X',
  });
  const fairLoss = matchMoodDelta({
    goalsFor: 0, goalsAgainst: 1, myReputation: 30, oppReputation: 85, derby: false, oppName: 'X',
  });
  assert(badLoss.delta < fairLoss.delta, 'perder com o último dói mais do que perder com o primeiro');

  const derbyWin = matchMoodDelta({
    goalsFor: 1, goalsAgainst: 0, myReputation: 50, oppReputation: 50, derby: true, oppName: 'X',
  });
  const plainWin = matchMoodDelta({
    goalsFor: 1, goalsAgainst: 0, myReputation: 50, oppReputation: 50, derby: false, oppName: 'X',
  });
  assert(derbyWin.delta > plainWin.delta, 'um dérbi mexe muito mais do que um jogo qualquer');
}

{
  // Limites: nem 100 vitórias passam de 100, nem 100 derrotas descem de 0.
  for (let i = 0; i < 60; i++) nudgeFans(s, 'fans.reason.win', 20, { opp: 'X' });
  assert(fanMood(s) <= 100, 'o humor nunca passa de 100');
  assert(fanBand(fanMood(s)) === 'ECSTATIC', 'lá em cima a faixa é a de delírio');
  for (let i = 0; i < 60; i++) nudgeFans(s, 'fans.reason.loss', -20, { opp: 'X' });
  assert(fanMood(s) >= 0, 'o humor nunca desce de 0');
  assert(fanBand(fanMood(s)) === 'RIOT', 'lá em baixo a faixa é a de revolta');
}

{
  // Os motivos ficam capados (senão o save crescia sem fim).
  const f = ensureFans(s);
  assert(f.reasons.length <= 6, 'guardam-se no máximo 6 motivos');
  assert(f.reasons[0]!.delta < 0, 'o motivo mais recente está no topo');
}

{
  // Contestação prolongada dispara ao fim da paciência, não antes.
  const f = ensureFans(s);
  f.mood = 10; f.unrestWeeks = 0;
  let firstUnrest = -1;
  for (let w = 1; w <= 5; w++) {
    f.mood = 10; // mantém-se em baixo
    const r = updateFansWeek(s, { position: 18, clubCount: 18, expectedPosition: 9 });
    if (r.unrest && firstUnrest < 0) firstUnrest = w;
  }
  assert(firstUnrest === 3, `a contestação aberta só chega à 3.ª semana em baixo (foi à ${firstUnrest}.ª)`);
}

{
  // Efeitos: assistência, apoio de casa e moral.
  assert(attendanceFactor(100) > attendanceFactor(FAN_NEUTRAL)
    && attendanceFactor(FAN_NEUTRAL) > attendanceFactor(0),
    'mais humor = mais gente no estádio');
  assert(Math.abs(attendanceFactor(FAN_NEUTRAL) - 1) < 1e-9,
    'no humor neutro a bilheteira é EXATAMENTE a de antes (nada muda em saves antigos)');

  const full = matchdayGate(club, [], false, attendanceFactor(100));
  const empty = matchdayGate(club, [], false, attendanceFactor(0));
  assert(full.attendance > empty.attendance && full.revenue > empty.revenue,
    'o humor mexe mesmo na afluência e na receita');

  assert(homeSupport(100) > homeSupport(0), 'mais humor = mais apoio de casa');
  assert(homeSupport(FAN_NEUTRAL) === FAN_NEUTRAL, 'no neutro o apoio é neutro');
  assert(moraleFromFans(95) > 0 && moraleFromFans(10) < 0 && moraleFromFans(FAN_NEUTRAL) >= 0,
    'a moral do plantel segue o ambiente');
}

{
  // Vantagem de casa: o apoio tem de mudar o jogo, mas sem o decidir sozinho.
  const t1 = s.tactics[managedId]!;
  const oppId = s.clubs[managedId]!.leagueId
    ? s.leagues[club.leagueId]!.clubIds.find((id) => id !== managedId)!
    : '';
  const t2 = s.tactics[oppId]!;
  const neutral = simulateMatch(managedId, oppId, t1, t2, s.players, 999, undefined, { homeSupport: 55 });
  const loud = simulateMatch(managedId, oppId, t1, t2, s.players, 999, undefined, { homeSupport: 100 });
  const noCtx = simulateMatch(managedId, oppId, t1, t2, s.players, 999);
  assert(neutral.home.goals === noCtx.home.goals && neutral.away.goals === noCtx.away.goals,
    'apoio neutro dá EXATAMENTE o mesmo jogo de sempre');
  assert(loud.seed === neutral.seed, 'o apoio não mexe na seed (o jogo continua reproduzível)');
}

{
  // Eventos avulsos: só um jogador importante mexe a bancada.
  const f = ensureFans(s);
  f.mood = 55;
  assert(fansOnSale(s, 'Suplente', 0.6) === 0, 'vender um suplente não mexe nada');
  const drop = fansOnSale(s, 'Craque', 1);
  assert(drop < 0, 'vender o melhor do plantel custa humor');
  const up = fansOnTrophy(s, 'Liga');
  assert(up > 0, 'um título levanta a bancada');
  const down = fansOnRelegation(s);
  assert(down < 0, 'a descida é o maior golpe');
}

{
  // A fração NUNCA passa de 1: quando o jogador já saiu do plantel (venda
  // forçada), o "melhor" é o melhor dos que ficaram.
  const best = Math.max(...s.clubs[managedId]!.squad.map((id) => naturalOverall(s.players[id]!)));
  assert(squadShare(s, best + 5) === 1, 'a fração no plantel está travada em 1');
}

{
  // TODOS os caminhos de chegada e saída reagem, não só a transferência. Se um
  // deles ficar de fora, o manual promete uma reação que não acontece.
  const club = s.clubs[managedId]!;
  const star = club.squad
    .map((id) => s.players[id]!)
    .sort((a, b) => naturalOverall(b) - naturalOverall(a))[0]!;

  ensureFans(s).mood = 55;
  const arrival = fansOnArrival(s, star);
  assert(arrival > 0, 'um reforço à altura do melhor da casa levanta a bancada');

  ensureFans(s).mood = 55;
  const departure = fansOnDeparture(s, star, squadShare(s, naturalOverall(star)));
  assert(departure < 0, 'e vê-lo sair custa');

  // Um jogador de outro clube não conta como reforço nosso.
  const outsider = Object.values(s.players).find((p) => p.clubId && p.clubId !== managedId)!;
  assert(fansOnArrival(s, outsider) === 0, 'um jogador de outro clube não mexe a nossa bancada');
}

// ====================================================================
console.log('\nImprensa — perguntas com preço:');

{
  // Prioridade dos assuntos: o jornalista pergunta pelo que arde primeiro.
  const base = {
    form: ['W', 'W', 'W'] as ('W' | 'D' | 'L')[], nextIsDerby: false, nextOpponent: 'X',
    lastMargin: 0, fanMood: 55, unrest: false, position: 5, clubCount: 18, seasonProgress: 0.5,
  };
  assert(pickTopic({ ...base, unrest: true }) === 'FAN_UNREST',
    'a contestação passa à frente de tudo');
  assert(pickTopic({ ...base, lastMargin: -4 }) === 'HEAVY_LOSS',
    'uma derrota pesada vem antes do dérbi');
  assert(pickTopic({ ...base, nextIsDerby: true }) === 'DERBY', 'o dérbi vem antes da rotina');
  assert(pickTopic(base) === 'GOOD_RUN', 'três vitórias dão pergunta própria');
  assert(pickTopic({ ...base, form: ['L', 'D', 'L'] }) === 'BAD_RUN', 'três sem ganhar também');
  assert(pickTopic({ ...base, position: 1, seasonProgress: 0.7 }) === 'TITLE_RACE',
    'liderar no fim da época dá a pergunta do título, não a da série');
  assert(pickTopic({ ...base, form: ['W', 'D', 'L'], position: 17 }) === 'RELEGATION',
    'na zona de descida com a época a meio, a pergunta é essa');
  assert(pickTopic({ ...base, form: ['W', 'D', 'L'], nextOpponent: '' }) === null,
    'sem próximo adversário e sem drama não há conferência');
}

{
  // A SÉRIE tem de ser a real, não "três" fixo: era isso que fazia a pergunta
  // dizer "três vitórias seguidas" a quem levava cinco.
  assert(winStreak(['W', 'W', 'W', 'W', 'W', 'D']) === 5, 'conta 5 vitórias seguidas');
  assert(winStreak(['D', 'W', 'W']) === 0, 'a série parte no primeiro não-triunfo');
  assert(winlessStreak(['L', 'D', 'L', 'W']) === 3, 'conta 3 jogos sem ganhar');
  assert(winlessStreak([]) === 0, 'sem jogos não há série');

  s.career.press = undefined;
  s.inbox = s.inbox.filter((it) => it.kind !== 'PRESS');
  const item = generatePressConference(s, {
    form: ['W', 'W', 'W', 'W', 'W'], nextIsDerby: false, nextOpponent: 'X', lastMargin: 2,
    fanMood: 70, unrest: false, position: 8, clubCount: 18, seasonProgress: 0.3,
  }, 8);
  assert(item?.topic === 'GOOD_RUN' && item.streak === 5,
    `a conferência guarda a série real (${item?.streak})`);
  if (item) answerPress(s, item.id, 'CALM');
}

{
  // VARIEDADE: a mesma conferência tem de dar sempre a mesma redação, e
  // conferências diferentes têm de dar redações diferentes — senão a variante
  // ou é instável (muda ao recarregar) ou é decorativa.
  const seen = new Set<string>();
  for (let round = 1; round <= 12; round++) {
    s.career.press = undefined;
    s.inbox = s.inbox.filter((it) => it.kind !== 'PRESS');
    const it = generatePressConference(s, {
      form: ['L', 'L', 'L'], nextIsDerby: false, nextOpponent: 'X', lastMargin: -1,
      fanMood: 45, unrest: false, position: 10, clubCount: 18, seasonProgress: 0.3,
    }, round);
    if (it) {
      seen.add(questionKey(it.topic, it.variant ?? 0));
      answerPress(s, it.id, 'CALM');
    }
  }
  assert(seen.size > 1, `ao longo de 12 jornadas saem redações diferentes (${seen.size})`);
}

{
  // Todos os assuntos têm respostas, e todas as respostas têm chave i18n válida.
  let bad = 0;
  for (const topic of Object.values(PressTopic)) {
    const opts = PRESS_OPTIONS[topic];
    if (!opts || opts.length !== 3) { bad++; continue; }
    if (new Set(opts.map((o) => o.tone)).size !== 3) bad++;
  }
  assert(bad === 0, 'cada assunto tem exatamente 3 respostas de tons distintos');
}

{
  // Uma conferência por jornada, e não bloqueia nada.
  s.inbox = s.inbox.filter((it) => it.kind !== 'PRESS');
  s.career.press = undefined;
  const ctx = {
    form: ['L', 'L', 'L'] as ('W' | 'D' | 'L')[], nextIsDerby: false, nextOpponent: 'X',
    lastMargin: -1, fanMood: 40, unrest: false, position: 12, clubCount: 18, seasonProgress: 0.4,
  };
  const first = generatePressConference(s, ctx, 4);
  assert(first !== null && first.kind === 'PRESS', 'a conferência entra na caixa de entrada');
  const second = generatePressConference(s, ctx, 4);
  assert(second === null, 'não se geram duas conferências na mesma jornada');
}

{
  // Responder move as três agulhas de uma vez.
  const item = s.inbox.find((it) => it.kind === 'PRESS')!;
  const squad = s.clubs[managedId]!.squad;
  const moraleBefore = squad.reduce((n, id) => n + (s.players[id]?.condition.morale ?? 0), 0);
  const confBefore = s.career.confidence;
  const moodBefore = fanMood(s);

  const r = answerPress(s, item.id, 'BLAME');
  assert(r.ok, 'a resposta é aceite');
  assert(!s.inbox.some((it) => it.kind === 'PRESS'), 'a conferência sai da caixa depois de respondida');

  const moraleAfter = squad.reduce((n, id) => n + (s.players[id]?.condition.morale ?? 0), 0);
  assert(moraleAfter < moraleBefore, 'apontar o dedo baixa a moral de TODO o plantel');
  assert(s.career.confidence > confBefore, 'a direção gosta de ver o treinador exigir');
  assert(fanMood(s) > moodBefore, 'e a bancada também');
}

{
  // Responder com um tom que não pertence ao assunto não faz nada.
  s.career.press = undefined;
  generatePressConference(s, {
    form: ['W', 'W', 'W'], nextIsDerby: false, nextOpponent: 'X', lastMargin: 2,
    fanMood: 70, unrest: false, position: 3, clubCount: 18, seasonProgress: 0.5,
  }, 8);
  const good = s.inbox.find((it) => it.kind === 'PRESS');
  if (good) {
    const bad = answerPress(s, good.id, 'BLAME'); // GOOD_RUN não tem BLAME
    assert(!bad.ok, 'um tom que o assunto não oferece é recusado');
    assert(s.inbox.some((it) => it.id === good.id), 'e a conferência fica na caixa');
    answerPress(s, good.id, 'CALM'); // limpa
  }
}

{
  // BRAVATA: cria dívida, e a dívida cobra-se.
  s.career.press = { claim: { topic: 'DERBY', createdDate: s.meta.currentDate } };
  const moodBefore = fanMood(s);
  const kept = resolveClaim(s, true);
  assert(kept?.delivered === true, 'ganhar cumpre a bravata');
  assert(fanMood(s) > moodBefore, 'e a bancada paga bem');
  assert(ensurePress(s).claim === undefined, 'a bravata fecha-se (não se cobra duas vezes)');

  s.career.press = { claim: { topic: 'DERBY', createdDate: s.meta.currentDate } };
  const moodBefore2 = fanMood(s);
  const broken = resolveClaim(s, false);
  assert(broken?.delivered === false, 'não ganhar falha a bravata');
  assert(fanMood(s) < moodBefore2, 'e falhar custa');
  assert(resolveClaim(s, true) === null, 'sem bravata em aberto não há nada a resolver');
}

{
  // Calar-se também é resposta — e tem preço.
  s.career.press = undefined;
  s.inbox = s.inbox.filter((it) => it.kind !== 'PRESS');
  generatePressConference(s, {
    form: ['L', 'L', 'L'], nextIsDerby: true, nextOpponent: 'X', lastMargin: -1,
    fanMood: 50, unrest: false, position: 10, clubCount: 18, seasonProgress: 0.5,
  }, 5);
  const item = s.inbox.find((it) => it.kind === 'PRESS')!;
  (item as { expiresDate: string }).expiresDate = '1900-01-01'; // já caducou
  const moodBefore = fanMood(s);
  assert(expirePress(s), 'a conferência caducada é limpa');
  assert(fanMood(s) < moodBefore, 'e o silêncio custa humor');
  assert((ensurePress(s).skipped ?? 0) > 0, 'fica registado que se faltou');
}

{
  // Mudar de clube apaga a bancada anterior.
  s.career.press = { claim: { topic: 'DERBY', createdDate: s.meta.currentDate } };
  resetSupport(s);
  assert(s.career.fans === undefined && s.career.press === undefined,
    'trocar de clube recomeça adeptos e imprensa do zero');
  assert(!s.inbox.some((it) => it.kind === 'PRESS'),
    'e não sobra nenhuma conferência do cargo anterior');
}

// ====================================================================
console.log('\nPersistência — nada disto precisa de migração:');

{
  const before = ensureFans(s);
  before.mood = 33;
  nudgeFans(s, 'fans.reason.loss', -1, { opp: 'X' });
  s.career.press = { claim: { topic: 'DERBY', createdDate: s.meta.currentDate }, skipped: 2 };
  s.players[a]!.condition.seasonYellows = 7;

  const round = deserialize(serialize(s));
  assert(Math.round(round.career.fans?.mood ?? -1) === Math.round(s.career.fans!.mood),
    'o humor sobrevive ao save (vive no blob da carreira)');
  assert((round.career.fans?.reasons.length ?? 0) === before.reasons.length,
    'os motivos também');
  assert(round.career.press?.claim?.topic === 'DERBY' && round.career.press?.skipped === 2,
    'a bravata e as faltas à imprensa sobrevivem');
  assert(round.players[a]!.condition.seasonYellows === 7,
    'os amarelos sobrevivem (vivem no blob da condição)');
}

{
  // Um save ANTIGO: sem nenhum destes campos. Tem de carregar e jogar.
  const old = createNewGame({ managerName: 'V', useBase: true, seed: 99 });
  old.career.fans = undefined;
  old.career.press = undefined;
  for (const id of old.clubs[old.meta.managedClubId]!.squad) {
    delete old.players[id]!.condition.seasonYellows;
  }
  const loaded = deserialize(serialize(old));
  assert(loaded.career.fans === undefined, 'um save antigo carrega sem estado de adeptos');
  let crashed = false;
  try {
    advanceWeek(loaded);
    advanceWeek(loaded);
  } catch { crashed = true; }
  assert(!crashed, 'e avança jornadas sem rebentar');
  assert(loaded.career.fans !== undefined,
    'o estado dos adeptos materializa-se sozinho na primeira jornada');
}

// ====================================================================
console.log('\nÉpoca a sério — as três coisas juntas, 12 jornadas:');

{
  const g = createNewGame({ managerName: 'Renato', useBase: true, seed: 31337 });
  let confs = 0;
  let answered = 0;
  for (let w = 0; w < 12; w++) {
    // Responde sempre que houver conferência (o tom possível varia por assunto).
    const item = g.inbox.find((it) => it.kind === 'PRESS');
    if (item && item.kind === 'PRESS') {
      confs++;
      const tone = PRESS_OPTIONS[item.topic]![0]!.tone;
      if (answerPress(g, item.id, tone).ok) answered++;
    }
    advanceWeek(g);
  }
  assert(confs > 0, `a imprensa apareceu ao longo da época (${confs} conferências)`);
  assert(answered === confs, 'todas foram respondidas com sucesso');

  const mood = fanMood(g);
  assert(mood > 0 && mood < 100, `o humor ficou num valor útil, não colado a um extremo (${Math.round(mood)})`);

  const yellows = g.clubs[g.meta.managedClubId]!.squad
    .reduce((n, id) => n + (g.players[id]?.condition.seasonYellows ?? 0), 0);
  assert(yellows > 0, `houve amarelos a acumular ao longo da época (${yellows} no plantel)`);

  const anyRisk = Object.values(g.players).some((p) => isAtRisk(p.condition.seasonYellows));
  assert(anyRisk, 'e alguém no mundo chegou a estar em risco de castigo');
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
