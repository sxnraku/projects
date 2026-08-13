/**
 * Teste de fumo da PALESTRA, do ADVERSÁRIO e dos PRÉMIOS INDIVIDUAIS.
 * Corre com: npm run smoke:plan
 *
 * O risco que isto cobre não é "rebentar" — é **mudar o passado**. As três
 * funcionalidades mexem em jogos já simulados: a palestra entra ao minuto 45 de
 * uma partida que se re-simula do minuto 1, e o plano contra o adversário viaja
 * no contexto que essas re-simulações têm de reproduzir. Se qualquer um deles
 * escorregar, a primeira parte que o utilizador ACABOU DE VER muda por baixo
 * dele: golos que desaparecem, cartões que nunca existiram. Nada disso dá erro.
 */
import { advanceWeek, createNewGame, managedLeagueId } from '../index';
import { applyMatchChanges, replayFixture } from '../replay';
import {
  evaluateTalk, flushTalkMorale, recordTalkMorale, situationOf, TALK_TONES,
  TALK_BOOST_MAX, TALK_BOOST_MIN,
} from '../teamTalk';
import { gamePlan, opponentReport, setGamePlan, suggestPlan, DETAIL_SCOUT_LEVEL } from '../opponent';
import { creditAwards, seasonAwards, MIN_APPS_FOR_AWARD, YOUNG_MAX_AGE } from '../awards';
import { simulateMatch } from '../../engine';
import { hasPlan, naturalOverall } from '../../models';
import { deserialize, serialize } from '../../../persistence/serialize';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — palestra, adversário e prémios\n');

const s = createNewGame({ managerName: 'Renato', useBase: true, seed: 8181 });
const managedId = s.meta.managedClubId;
const tactic = s.tactics[managedId]!;
const leagueIds = s.leagues[s.clubs[managedId]!.leagueId]!.clubIds;

// ====================================================================
console.log('Palestra — o que se diz vale pelo que o marcador diz:');

{
  assert(situationOf(3, 0) === 'CRUISING' && situationOf(1, 0) === 'AHEAD'
    && situationOf(1, 1) === 'DRAWING' && situationOf(0, 1) === 'BEHIND'
    && situationOf(0, 3) === 'LOSING_BADLY',
    'a situação lê-se do marcador');
}

{
  // A MESMA frase tem de valer o contrário conforme o momento — é isto que
  // torna a palestra uma decisão e não um botão de bónus.
  const furyLosing = evaluateTalk('FURY', 'LOSING_BADLY', tactic, s.players);
  const furyWinning = evaluateTalk('FURY', 'CRUISING', tactic, s.players);
  assert(furyLosing.points > 0 && furyWinning.points < 0,
    `explodir salva a perder (${furyLosing.points}) e afunda a ganhar (${furyWinning.points})`);

  const praiseWinning = evaluateTalk('PRAISE', 'CRUISING', tactic, s.players);
  const praiseLosing = evaluateTalk('PRAISE', 'LOSING_BADLY', tactic, s.players);
  assert(praiseWinning.points > 0 && praiseLosing.points < 0,
    'elogiar levanta quem ganha e soa a desistência a quem perde');

  const calm = TALK_TONES.map((t) => evaluateTalk(t, 'DRAWING', tactic, s.players));
  assert(calm.every((o) => o.boost >= TALK_BOOST_MIN && o.boost <= TALK_BOOST_MAX),
    'o efeito na 2.ª parte fica sempre dentro dos limites');
}

{
  // Nenhum tom pode ser bom em TODAS as situações: se houvesse um, era o único
  // que valia a pena escolher e a mecânica morria.
  const sits = ['CRUISING', 'AHEAD', 'DRAWING', 'BEHIND', 'LOSING_BADLY'] as const;
  let alwaysGood = 0;
  for (const tone of TALK_TONES) {
    const pts = sits.map((sit) => evaluateTalk(tone, sit, tactic, s.players).points);
    if (tone !== 'CALM' && pts.every((p) => p > 0)) alwaysGood++;
  }
  assert(alwaysGood === 0, 'nenhum tom (tirando o morno) é bom em todas as situações');
}

{
  // Determinismo: a mesma palestra tem de dar sempre o mesmo.
  const a = evaluateTalk('DEMAND', 'BEHIND', tactic, s.players);
  const b = evaluateTalk('DEMAND', 'BEHIND', tactic, s.players);
  assert(a.points === b.points && a.boost === b.boost, 'a mesma palestra dá sempre o mesmo');
}

{
  // A moral NÃO pode entrar durante o jogo (ver `recordTalkMorale`).
  const p0 = s.players[tactic.lineup[0]!.playerId]!;
  const before = p0.condition.morale;
  recordTalkMorale(s, 6);
  assert(p0.condition.morale === before, 'registar a palestra NÃO mexe já na moral');
  assert(s.career.pendingTalkMorale === 6, 'fica pendente no blob da carreira');
  const applied = flushTalkMorale(s);
  assert(applied === 6 && p0.condition.morale > before, 'e entra quando se despeja');
  assert((s.career.pendingTalkMorale ?? 0) === 0, 'o saldo limpa-se (não se aplica duas vezes)');
}

// ====================================================================
console.log('\nDeterminismo — re-simular não pode reescrever o que já se viu:');

const wk = advanceWeek(s);
const myFx = wk.fixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId);

if (!myFx?.result) {
  console.error('  ✗ FALHA: sem jogo do clube gerido para testar');
  failures++;
} else {
  const firstHalf = (r: { events: { minute: number }[] }) =>
    JSON.stringify(r.events.filter((e) => e.minute <= 45));
  const original = firstHalf(myFx.result);
  const neutralLineup = () => tactic.lineup.map((x) => ({ ...x }));

  {
    const same = applyMatchChanges(s, myFx.id, [{
      minute: 45, lineup: neutralLineup(), mentality: tactic.mentality, tempo: tactic.tempo,
    }]);
    assert(!!same && firstHalf(same) === original,
      'um ajuste neutro ao 45 deixa a 1.ª parte EXATAMENTE igual');
  }

  {
    const talked = applyMatchChanges(s, myFx.id, [{
      minute: 45, lineup: neutralLineup(), mentality: tactic.mentality, tempo: tactic.tempo,
      talkBoost: 1.06,
    }]);
    assert(!!talked && firstHalf(talked) === original,
      'uma palestra ao 45 também não toca na 1.ª parte');
  }

  {
    // O contexto do jogo (dérbi/bancada/plano) tem de ficar GRAVADO no
    // resultado: se o replay o fosse buscar ao estado atual, o humor dos
    // adeptos — que muda no fecho da semana — mudava o jogo já visto.
    //
    // Só se grava apoio nos jogos EM CASA, por isso avança-se até haver um.
    let homeFx = myFx.homeClubId === managedId ? myFx : null;
    for (let i = 0; i < 8 && !homeFx; i++) {
      const w = advanceWeek(s);
      homeFx = w.fixtures.find((f) => f.homeClubId === managedId && f.result) ?? null;
    }
    assert(!!homeFx, 'encontrou-se um jogo em casa do clube gerido');
    assert(homeFx?.result?.ctx?.homeSupport != null,
      'um jogo em casa grava o apoio da bancada com que foi simulado');

    // E re-simular esse jogo tem de reproduzir a 1.ª parte, mesmo depois de o
    // humor dos adeptos já ter mudado no fecho da semana.
    if (homeFx?.result) {
      const seen = JSON.stringify(homeFx.result.events.filter((e) => e.minute <= 45));
      const again = applyMatchChanges(s, homeFx.id, [{
        minute: 45, lineup: neutralLineup(), mentality: tactic.mentality, tempo: tactic.tempo,
      }]);
      assert(!!again && JSON.stringify(again.events.filter((e) => e.minute <= 45)) === seen,
        'com o humor dos adeptos já alterado, a 1.ª parte continua idêntica');
    }
  }
}

// ====================================================================
console.log('\nBravata — julgada pelo jogo CERTO:');

{
  // ⚠ A bravata tem de ser cobrada pelo jogo DA LIGA, que é o que a pergunta
  // nomeou e o que o balanço da semana mostra. Antes usava-se o ÚLTIMO jogo da
  // semana, e como a Taça é empilhada depois da liga, uma vitória de 3-0 no
  // campeonato aparecia como "promessa falhada" por causa de uma eliminatória
  // que ninguém tinha associado à promessa.
  const g = createNewGame({ managerName: 'R', useBase: true, seed: 5150 });
  const gid = g.meta.managedClubId;
  let kept = 0;
  let broken = 0;
  let checked = 0;

  for (let w = 0; w < 30; w++) {
    // Promete SEMPRE, e confirma-se que o veredicto bate com o jogo da liga.
    g.career.press = { claim: { topic: 'PRE_MATCH', createdDate: g.meta.currentDate } };
    const wk = advanceWeek(g);
    const league = wk.fixtures.find(
      (f) => f.result && (f.homeClubId === gid || f.awayClubId === gid),
    );
    const note = wk.report?.notes.find((n) => n.key.startsWith('note.press.'));
    if (!league?.result || !note) continue;
    const isHome = league.homeClubId === gid;
    const mine = isHome ? league.result.home.goals : league.result.away.goals;
    const theirs = isHome ? league.result.away.goals : league.result.home.goals;
    const won = mine > theirs;
    checked++;
    const delivered = note.key === 'note.press.kept';
    if (delivered !== won) {
      failures++;
      console.error(`  ✗ FALHA: liga ${mine}-${theirs} mas veredicto "${note.key}"`);
    }
    if (delivered) kept++; else broken++;
  }
  assert(checked > 5, `houve bravatas que chegue para testar (${checked})`);
  assert(kept > 0 && broken > 0,
    `apanharam-se os dois desfechos (${kept} cumpridas, ${broken} falhadas)`);
  console.log(`  ✓ ${checked} bravatas, todas julgadas pelo resultado da liga`);
}

// ====================================================================
console.log('\nAdversário — relatório e instruções:');

const oppId = leagueIds.find((id) => id !== managedId)!;

{
  const rep = opponentReport(s, oppId);
  assert(!!rep, 'o relatório sai');
  assert(rep!.clubId === oppId && !!rep!.formation, 'traz clube e formação');
  assert(['WEAK', 'AVERAGE', 'STRONG'].includes(rep!.attack.band), 'as bandas são válidas');
  assert(rep!.detailed === (rep!.scoutLevel >= DETAIL_SCOUT_LEVEL),
    'o detalhe segue o nível dos olheiros');
  if (!rep!.detailed) {
    assert(rep!.attack.value === null && rep!.keyPlayer === null,
      'com poucos olheiros não há números nem nome do melhor deles');
  }
  assert(opponentReport(s, 'clube_que_nao_existe') === null, 'clube inexistente devolve null');
  const plan = suggestPlan(rep!);
  assert(typeof plan.markStar === 'boolean', 'a sugestão automática é utilizável');
}

{
  assert(!hasPlan(gamePlan(s)), 'sem escolha nenhuma, não há plano');
  setGamePlan(s, { markStar: true });
  assert(hasPlan(gamePlan(s)) && gamePlan(s).markStar === true, 'ligar uma instrução guarda-a');
  setGamePlan(s, { blockWings: true });
  assert(gamePlan(s).markStar === true && gamePlan(s).blockWings === true,
    'ligar a segunda não apaga a primeira');
  setGamePlan(s, { markStar: false, blockWings: false });
  assert(!hasPlan(gamePlan(s)), 'desligar as duas volta a não haver plano');
}

{
  // As instruções TÊM de mexer no jogo — senão são dois botões decorativos.
  const home = leagueIds[0]!;
  const away = leagueIds[1]!;
  const base = simulateMatch(home, away, s.tactics[home]!, s.tactics[away]!, s.players, 4242);
  const marked = simulateMatch(home, away, s.tactics[home]!, s.tactics[away]!, s.players, 4242,
    undefined, { homePlan: { markStar: true } });
  const blocked = simulateMatch(home, away, s.tactics[home]!, s.tactics[away]!, s.players, 4242,
    undefined, { homePlan: { blockWings: true } });
  assert(JSON.stringify(base.events) !== JSON.stringify(marked.events),
    'a marcação individual muda o jogo');
  assert(JSON.stringify(base.events) !== JSON.stringify(blocked.events),
    'fechar as alas muda o jogo');

  // E um plano VAZIO tem de ser indistinguível de não haver plano: é isto que
  // garante que nada muda para quem nunca toca nestas opções.
  const empty = simulateMatch(home, away, s.tactics[home]!, s.tactics[away]!, s.players, 4242,
    undefined, { homePlan: {} });
  assert(JSON.stringify(base.events) === JSON.stringify(empty.events),
    'um plano vazio dá EXATAMENTE o mesmo jogo de sempre');
}

{
  // ⚠ O CUSTO das instruções tem de sobreviver a uma substituição.
  //
  // `applyTacticChange` recalcula a força do lado alterado de raiz. O efeito no
  // ADVERSÁRIO vive no outro lado e sobrevive sozinho; o custo vive no NOSSO e
  // era apagado — substituir tornava as instruções gratuitas a partir daí.
  // Medido antes da correção: o custo no ataque caía de -0.117 para -0.096.
  const home = leagueIds[0]!;
  const away = leagueIds[1]!;
  const hT = s.tactics[home]!;
  const plan = { markStar: true, blockWings: true };
  const noop = [{ side: 'HOME' as const, minute: 60, tactic: hT }];

  const goalsWith = (p: typeof plan | undefined, ch: typeof noop | undefined) => {
    let gf = 0;
    for (let k = 0; k < 160; k++) {
      gf += simulateMatch(home, away, hT, s.tactics[away]!, s.players, 60_000 + k, ch,
        p ? { homePlan: p } : undefined).home.goals;
    }
    return gf / 160;
  };

  const costPlain = goalsWith(plan, undefined) - goalsWith(undefined, undefined);
  const costAfterSub = goalsWith(plan, noop) - goalsWith(undefined, noop);
  assert(costPlain < -0.02, `as instruções custam mesmo golos (${costPlain.toFixed(3)})`);
  assert(Math.abs(costAfterSub - costPlain) < 0.005,
    `e o custo NÃO desaparece com uma substituição (${costPlain.toFixed(3)} vs ${costAfterSub.toFixed(3)})`);
}

// ====================================================================
console.log('\nPrémios individuais:');

{
  // Uma época inteira para haver notas e golos que cheguem.
  const g = createNewGame({ managerName: 'Renato', useBase: true, seed: 606 });
  const gLeague = managedLeagueId(g);
  for (let i = 0; i < 40 && !advanceWeek(g).seasonEnded; i++) { /* joga a época */ }

  const table = g.standings[gLeague]!;
  const champ = Object.values(table).sort((a, b) => b.points - a.points)[0]!.clubId;
  const awards = seasonAwards(g, gLeague, champ);

  const kinds = new Set(awards.map((a) => a.kind));
  assert(kinds.has('TOP_SCORER'), 'há melhor marcador');
  assert(kinds.has('BEST_PLAYER'), 'há melhor jogador');
  assert(kinds.has('BEST_MANAGER'), 'há melhor treinador');

  const bp = awards.find((a) => a.kind === 'BEST_PLAYER');
  if (bp) {
    const p = g.players[bp.playerId]!;
    assert((p.condition.seasonApps ?? 0) >= MIN_APPS_FOR_AWARD,
      `o melhor jogador tem os jogos mínimos (${p.condition.seasonApps})`);
  }
  const by = awards.find((a) => a.kind === 'BEST_YOUNG');
  if (by) {
    assert(g.players[by.playerId]!.age <= YOUNG_MAX_AGE, 'o melhor jovem tem 21 anos ou menos');
  }
  const ts = awards.find((a) => a.kind === 'TOP_SCORER');
  if (ts) {
    const best = Math.max(...Object.values(g.players)
      .filter((p) => p.clubId && g.leagues[gLeague]!.clubIds.includes(p.clubId))
      .map((p) => p.condition.seasonGoals ?? 0));
    assert(ts.value === best, `o melhor marcador é mesmo o que marcou mais (${ts.value})`);
  }

  // Determinismo: apurar duas vezes dá o mesmo.
  assert(JSON.stringify(seasonAwards(g, gLeague, champ)) === JSON.stringify(awards),
    'apurar os prémios duas vezes dá exatamente o mesmo');

  // Só os do clube gerido entram no palmarés pessoal.
  const before = g.career.trophies.length;
  const mine = creditAwards(g, awards);
  assert(g.career.trophies.length === before + mine.length,
    `só os prémios do nosso clube entram no palmarés (${mine.length})`);
  assert(mine.every((a) => a.clubId === g.meta.managedClubId),
    'e nenhum prémio de outro clube se cola ao nosso palmarés');

  // …e o caso POSITIVO tem de funcionar mesmo: força-se um prémio nosso e
  // verifica-se que aterra no palmarés com a chave certa. Sem isto, o teste
  // acima passava na mesma com a função a não fazer nada.
  const forged = awards.map((a) => ({ ...a, clubId: g.meta.managedClubId }));
  const n0 = g.career.trophies.length;
  const credited = creditAwards(g, forged);
  assert(credited.length === forged.length && g.career.trophies.length === n0 + forged.length,
    `um prémio de um jogador nosso entra mesmo no palmarés (${credited.length})`);
  assert(g.career.trophies.slice(n0).every((t) => t.key.startsWith('trophy.')),
    'e entra com uma chave de troféu válida');
}

// ====================================================================
console.log('\nPersistência — sem migração, como o resto:');

{
  setGamePlan(s, { markStar: true, blockWings: false });
  s.career.pendingTalkMorale = 4;
  const round = deserialize(serialize(s));
  assert(round.career.gamePlan?.markStar === true,
    'o plano contra o adversário sobrevive ao save');
  assert(round.career.pendingTalkMorale === 4, 'a moral pendente da palestra também');

  // Save ANTIGO: sem plano, sem moral pendente, sem prémios arquivados.
  const old = createNewGame({ managerName: 'V', useBase: true, seed: 12 });
  old.career.gamePlan = undefined;
  old.career.pendingTalkMorale = undefined;
  const loaded = deserialize(serialize(old));
  let crashed = false;
  try { advanceWeek(loaded); advanceWeek(loaded); } catch { crashed = true; }
  assert(!crashed, 'um save sem nada disto avança jornadas sem rebentar');
  assert(!hasPlan(gamePlan(loaded)), 'e continua sem plano até alguém escolher um');
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
