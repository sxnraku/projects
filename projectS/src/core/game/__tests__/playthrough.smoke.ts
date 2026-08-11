/**
 * MEGA TESTE — uma pessoa a jogar o jogo, do princípio ao fim.
 * Corre com: npm run smoke:play
 *
 * As outras suites testam regras isoladas: se o prémio de assinatura está
 * certo, se a tabela soma, se o arquivo não duplica. Nenhuma delas apanha o
 * erro mais comum de todos — a APP a rebentar (ou a mentir) quando alguém
 * carrega nos botões pela ordem em que uma pessoa carrega.
 *
 * Aqui conduz-se a store REAL (a mesma que os ecrãs usam, Zustand corre em
 * node porque o core não tem nada de nativo) durante duas épocas inteiras,
 * chamando as mesmas ações e os mesmos seletores que os ecrãs chamam. Tudo o
 * que a UI mostraria é lido e verificado: números impossíveis, `undefined` onde
 * devia estar texto, chaves de tradução que não existem, listas que se
 * contradizem.
 *
 * Divide-se em três partes:
 *   1. COBERTURA DE TEXTO — todas as chaves i18n usadas no código existem em
 *      pt-PT e em inglês. É o que apanha um ecrã a mostrar "man.staff.b".
 *   2. SESSÃO DE JOGO — duas épocas a carregar em tudo.
 *   3. SANIDADE DO ESTADO — o que tem de continuar verdade no fim.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useGameStore } from '../../../state/gameStore';
import { LANGS, translate } from '../../i18n';
import { MANUAL } from '../../../ui/manual';
import { displayOverall, effectiveRole, rolesFor } from '../../models';
import { isDerby, rivalsOf } from '../rivals';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

/** Corre uma ação da UI e transforma qualquer exceção numa falha do teste. */
function act<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    failures++;
    console.error(`  ✗ FALHA: "${label}" rebentou:`, (err as Error).message);
    return undefined;
  }
}

console.log('MEGA TESTE — uma pessoa a jogar\n');

// ===========================================================================
// 1. COBERTURA DE TEXTO
// ===========================================================================
console.log('Textos e traduções:');

const ROOT = join(__dirname, '..', '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'android' || name === '_backup') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !full.includes('__tests__')) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'src')));

// Chaves literais: t('x'), tMsg({ key: 'x' }), addNews(..., 'x'), key: 'x'.
const literalKeys = new Set<string>();
const KEY_RE = /['"`]((?:common|tab|top|btn|label|action|dash|card|match|season|squad|tac|mentality|tempo|loadlvl|load|mkt|scout|league|club|fin|facility|staff|training|focus|retrain|role|roleShort|corner|derby|news|note|inbox|toast|player|pos|loan|academy|youth|cup|euro|world|history|hist|free|pre|crisis|board|trophy|manual|man|tut|tutorial|blocked|interest|offer|window|contract|clause|relation|talk|promise|daily|cloud|update|ad|error|onboard|menu|stars|form|bar|split|runway)\.[a-zA-Z0-9._-]+)['"`]/g;

/**
 * Tira comentários antes de procurar chaves. Sem isto, um comentário a falar de
 * `player.transferListed` entrava na lista como se fosse uma chave i18n e o
 * teste acusava um erro que não existe.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

for (const file of files) {
  const src = stripComments(readFileSync(file, 'utf8'));
  let m: RegExpExecArray | null;
  while ((m = KEY_RE.exec(src)) !== null) {
    const key = m[1]!;
    if (/\.(ts|tsx|json|png)$/.test(key)) continue; // caminhos de import, não chaves
    literalKeys.add(key);
  }
}

// Chaves do manual (vêm de dados, não de literais no JSX).
for (const chapter of MANUAL) {
  literalKeys.add(chapter.titleKey);
  for (const entry of chapter.entries) {
    literalKeys.add(entry.titleKey);
    literalKeys.add(entry.bodyKey);
    if (entry.whereKey) literalKeys.add(entry.whereKey);
  }
}

// Chaves dinâmicas com prefixo fixo (`role.${role}`) — expande-se à mão o que
// o jogo constrói em runtime, que é onde faltar uma tradução dá mais nas vistas.
for (const position of ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as const) {
  for (const role of rolesFor(position)) {
    literalKeys.add(`role.${role}`);
    literalKeys.add(`role.${role}.hint`);
    literalKeys.add(`roleShort.${role}`);
  }
}
for (const f of ['PHYSICAL', 'TECHNICAL', 'TACTICAL', 'RECOVERY']) literalKeys.add(`focus.${f}`);
for (const c of ['MIXED', 'NEAR', 'FAR', 'SHORT']) { literalKeys.add(`corner.${c}`); literalKeys.add(`corner.${c}.hint`); }

const missing: Record<string, string[]> = {};
for (const lang of LANGS) {
  const bad: string[] = [];
  for (const key of literalKeys) {
    // `translate` devolve a própria chave quando não encontra tradução.
    if (translate(lang, key) === key) bad.push(key);
  }
  if (bad.length > 0) missing[lang] = bad;
}
console.log(`  (${literalKeys.size} chaves encontradas no código)`);
for (const lang of LANGS) {
  const bad = missing[lang] ?? [];
  assert(bad.length === 0, `${lang}: todas as chaves traduzidas${bad.length ? ` — faltam ${bad.length}: ${bad.join(', ')}` : ''}`);
}

// ===========================================================================
// 2. SESSÃO DE JOGO
// ===========================================================================
console.log('\nSessão de jogo (2 épocas, a carregar em tudo):');

const store = useGameStore.getState;

act('novo jogo', () => useGameStore.getState().newGame({
  managerName: 'Renato', useBase: true, seed: 20260811,
}));
assert(!!store().state, 'o jogo arranca com estado');

const managedId = store().state!.meta.managedClubId;
assert(!!store().managedClub(), 'o clube gerido existe');
assert(store().squad().length >= 11, `plantel com jogadores (${store().squad().length})`);

// --- o que o ecrã INICIAL lê
{
  const pre = act('pré-jogo', () => store().preview());
  assert(!!pre, 'cartão de pré-jogo montado');
  if (pre) {
    assert(pre.lineupOverall > 0 && Number.isFinite(pre.lineupOverall), `OVR do onze é um número (${pre.lineupOverall})`);
    assert(pre.projectedGate >= 0, 'bilheteira estimada não é negativa');
    assert(typeof pre.derby === 'boolean', 'o pré-jogo diz se é dérbi');
  }
  act('caixa de entrada', () => store().inboxItems());
  act('propostas recebidas', () => store().inboxBids());
  act('classificação', () => store().standings());
  act('próximos jogos', () => store().upcomingFixtures());
  act('janela de mercado', () => store().marketWindow());
  assert(typeof store().dailyAvailable() === 'boolean', 'bónus diário responde');
}

// --- TÁTICA: mexer em tudo o que o ecrã deixa mexer
{
  const before = store().state!.tactics[managedId]!;
  act('mudar formação', () => store().setTactic({ ...before, formation: '4-3-3' }));
  act('mentalidade + ritmo', () => store().setTactic({
    ...store().state!.tactics[managedId]!, mentality: 'ATTACKING', tempo: 'FAST',
  }));
  act('sliders', () => store().setTactic({
    ...store().state!.tactics[managedId]!, pressing: 8, defensiveLine: 7, creativity: 9,
  }));

  // Papéis: põe um em cada slot que os aceite (é o que faz quem descobre a funcionalidade).
  const withRoles = store().state!.tactics[managedId]!;
  act('papéis em todo o onze', () => store().setTactic({
    ...withRoles,
    lineup: withRoles.lineup.map((slot) => {
      const options = rolesFor(slot.position);
      return { ...slot, role: options[options.length - 1] };
    }),
  }));
  const after = store().state!.tactics[managedId]!;
  assert(after.lineup.every((s) => s.role && effectiveRole(s.role, s.position) === s.role),
    'todos os papéis escolhidos são válidos na sua posição');

  // Bolas paradas
  const xi = after.lineup.map((s) => s.playerId);
  act('marcadores de bola parada', () => store().setTactic({
    ...store().state!.tactics[managedId]!,
    freeKickTakerId: xi[9]!, cornerTakerId: xi[6]!, cornerFocus: 'NEAR',
  }));
  assert(store().state!.tactics[managedId]!.cornerFocus === 'NEAR', 'a instrução de canto ficou gravada');

  act('rotação automática', () => store().rotate());
  assert(store().state!.tactics[managedId]!.lineup.length === 11, 'o onze continua com 11 depois da rotação');
}

// --- MERCADO, OLHEIROS, EQUIPA TÉCNICA, TREINO
{
  const free = act('lista de livres', () => store().freeAgents()) ?? [];
  assert(Array.isArray(free), `mercado de livres responde (${free.length})`);
  if (free[0]) {
    const wage = store().askingWage(free[0].id);
    assert(wage > 0, `um livre pede ordenado (${wage})`);
    act('assinar livre', () => store().signFree(free[0]!.id, wage, 2));
  }

  act('candidatos a staff', () => store().staffCandidates('COACH'));
  const cands = store().staffCandidates('ASSISTANT');
  if (cands[0]) act('contratar adjunto', () => store().hireStaff(cands[0]!));
  assert(store().staff().length >= 0, 'equipa técnica listável');
  assert(store().trainingSlots().total >= 2, 'há vagas de treino individual');

  const mine = store().squad();
  if (mine[0]) {
    act('plano individual', () => store().setPlayerFocus(mine[0]!.id, 'PHYSICAL'));
    act('conversa com jogador', () => store().talkToPlayer(mine[0]!.id, 'PRAISE'));
    act('reconversão', () => store().startRetrain(mine[0]!.id, 'CM'));
  }
  act('foco de treino da equipa', () => store().setTrainingFocus('TECHNICAL'));
  act('missões de observação', () => store().scoutMissions());
  act('academia', () => store().academyCandidates());

  // --- OBSERVAR um jogador de fora e ver o que a ficha passa a dizer
  const scoutable = act('lista de observáveis', () => store().scoutableList()) ?? [];
  assert(scoutable.length > 0, `há jogadores para observar (${scoutable.length})`);
  const target = scoutable.find((p) => store().canScoutP(p.id));
  if (target) {
    const before = store().potentialKnown(target.id);
    const ok = act('mandar observar', () => store().scoutPlayer(target.id));
    assert(ok === true, 'a missão de observação arranca');
    assert(before === false || before === true, 'o "potencial conhecido" responde antes e depois');
    const range = store().potentialRangeOf(target.id);
    assert(!!range && range.max >= range.min, 'a estimativa de potencial é um intervalo coerente');
  }

  // --- PROPOSTA por um jogador de outro clube (o caminho mais usado do jogo)
  const wanted = scoutable
    .filter((p) => p.clubId && p.clubId !== managedId)
    .sort((a, b) => a.marketValue - b.marketValue)[0];
  if (wanted) {
    const reach = act('estatuto para contratar', () => store().reachOf(wanted.id));
    assert(!!reach, 'o jogo diz se o clube tem estatuto para o jogador');
    const budgetBefore = store().freeBudget();
    const res = act('fazer proposta', () => store().submitOffer({
      playerId: wanted.id,
      fromClubId: managedId,
      fee: Math.round(wanted.marketValue * 1.1),
      wageOffer: Math.round(wanted.wage * 1.2),
      contractYears: 3,
    }));
    assert(!!res, 'a proposta devolve uma resposta (aceite, recusada ou em espera)');
    if (res?.ok) {
      assert(store().committedBudget() > 0, 'o orçamento fica comprometido enquanto a proposta espera');
      assert(store().freeBudget() <= budgetBefore, 'o orçamento livre desce com a proposta em curso');
    }
  }

  // --- EMPRÉSTIMOS nos dois sentidos
  const out = act('quem posso emprestar', () => store().loanOutList()) ?? [];
  if (out[0]) {
    const r = act('emprestar jogador', () => store().doLoanOut(out[0]!.id));
    if (r?.ok) {
      const p = store().state!.players[out[0]!.id]!;
      assert(!!p.condition.loanOwnerId, 'o emprestado guarda o dono a quem regressa');
    }
  }
  const inList = act('quem posso pedir emprestado', () => store().loanInList()) ?? [];
  if (inList[0]) act('pedir emprestado com opção de compra', () => store().doLoanIn(inList[0]!.id, true));

  // --- INSTALAÇÕES e pedido de verba
  const facBefore = store().managedClub()!.facilities.training;
  const up = act('melhorar centro de treino', () => store().upgrade('training'));
  if (up?.ok) {
    assert(store().managedClub()!.facilities.training === facBefore + 1, 'a instalação subiu um nível');
  }
  const budget = act('pedir verba à direção', () => store().requestBudget());
  assert(!!budget, 'o pedido de verba responde');
  assert(store().budgetRequestUsed() === true, 'o pedido fica marcado como usado nesta época');

  // --- LISTAR e RENOVAR
  const anyPlayer = store().squad()[1];
  if (anyPlayer) {
    act('pôr na lista de transferências', () => store().setListed(anyPlayer.id, true));
    assert(store().state!.players[anyPlayer.id]!.transferListed === true, 'o jogador fica listado');
    act('tirar da lista', () => store().setListed(anyPlayer.id, false));
    const asked = store().wageWithClauses(anyPlayer.id, { goalBonus: 500 });
    assert(asked > 0, 'o salário com cláusulas é um número positivo');
    act('renovar contrato', () => store().renewPlayer(anyPlayer.id, 3, asked));
  }
}

// --- JOGAR duas épocas inteiras, semana a semana
let weeks = 0, seasonsFinished = 0, matchesSeen = 0, goalsSeen = 0, derbies = 0;
const scorelines: string[] = [];

/**
 * Trata a caixa de entrada como uma pessoa trata: aceita o que é bom, recusa o
 * resto e resolve a crise vendendo o primeiro candidato. É obrigatório — a
 * jornada NÃO avança com decisões por tomar, e sem isto o teste ficava preso à
 * segunda semana (foi assim que se descobriu que a nota do bloqueio não
 * mencionava a crise financeira).
 */
function clearInbox(): number {
  let handled = 0;
  for (let guard = 0; guard < 20; guard++) {
    const items = store().inboxItems();
    const pending = items.filter((i) => i.kind === 'BID' || i.kind === 'REQUEST'
      || i.kind === 'OFFER' || i.kind === 'CRISIS' || i.kind === 'RENEWAL');
    if (pending.length === 0) break;
    for (const item of pending) {
      handled++;
      if (item.kind === 'BID') act('recusar proposta', () => store().rejectBid(item.id));
      else if (item.kind === 'REQUEST') act('responder a pedido', () => store().resolveRequest(item.id, false));
      else if (item.kind === 'RENEWAL') act('renovar contrato', () => store().resolveRenewal(item.id));
      else if (item.kind === 'CRISIS') {
        const target = item.candidates[0];
        if (target) act('resolver crise', () => store().resolveCrisis(item.id, target));
        else act('dispensar crise', () => store().dismissItem(item.id));
      } else act('dispensar item', () => store().dismissItem(item.id));
    }
  }
  return handled;
}

let inboxHandled = 0, sacked = 0, contractsDecided = 0;
let euroNights = 0, euroPlayed = 0, euroPaused = 0;
let liveTested = false;
for (let w = 0; w < 90 && seasonsFinished < 2; w++) {
  if (store().advanceBlockedBy()) {
    inboxHandled += clearInbox();
    act('desbloquear com rotação', () => store().rotate());
    assert(store().advanceBlockedBy() === null,
      `bloqueio da semana ${w} resolvido pela caixa de entrada`);
  }
  const res = act(`avançar semana ${w}`, () => store().advance());
  if (!res) {
    // `advance()` devolve null quando o jogo PEDE uma decisão. Uma pessoa vê o
    // ecrã que aparece e decide; o teste tem de fazer o mesmo, senão fica
    // parado a achar que o jogo rebentou.
    const offers = store().state!.career.pendingOffers;
    if (offers.length > 0) {
      sacked++;
      const ok = act('aceitar novo clube depois de despedido', () => store().acceptOffer(offers[0]!));
      assert(ok === true, 'despedido: aceitar uma oferta de emprego funciona');
      continue;
    }
    const expiring = store().expiringDecisions();
    if (expiring.length > 0) {
      contractsDecided += expiring.length;
      // Renova metade, liberta a outra metade — as duas saídas têm de funcionar.
      expiring.forEach((p, idx) => act('decidir contrato', () => (
        idx % 2 === 0 ? store().renewExpiring(p.id) : store().releaseExpiring(p.id)
      )));
      continue;
    }
    if (store().lastSeason) { seasonsFinished++; act('fechar resumo da época', () => store().clearReport()); continue; }
    if (store().advanceBlockedBy()) { clearInbox(); continue; }
    failures++;
    console.error(`  ✗ FALHA: o jogo não avança na semana ${w} e não pede decisão nenhuma`);
    break;
  }
  weeks++;
  if (res.seasonEnded) seasonsFinished++;

  // O que a UI mostra a seguir a jogar.
  const last = store().lastWeek;
  if (last) {
    for (const fx of last.fixtures) {
      if (!fx.result) continue;
      matchesSeen++;
      const { home, away } = fx.result;
      goalsSeen += home.goals + away.goals;
      scorelines.push(`${home.goals}-${away.goals}`);
      if (isDerby(store().state!, fx.homeClubId, fx.awayClubId)) derbies++;
      // Números que a UI imprime: nada pode vir NaN nem negativo.
      if (!Number.isFinite(home.xg) || home.xg < 0 || home.possession < 0 || home.possession > 100) {
        failures++;
        console.error('  ✗ FALHA: estatísticas de jogo inválidas', JSON.stringify(fx.result.home));
        break;
      }
    }
  }
  // --- O ECRÃ DE JOGO: substituições ao vivo e segunda hipótese.
  //
  // É a parte mais fácil de partir do jogo inteiro (mexe em táticas a meio de
  // uma simulação já feita) e a que ninguém testa, porque exige ter acabado de
  // jogar uma jornada.
  const myFx = store().lastWeek?.fixtures.find(
    (f) => f.homeClubId === store().state!.meta.managedClubId
      || f.awayClubId === store().state!.meta.managedClubId,
  );
  if (myFx?.result && !liveTested) {
    liveTested = true;
    const before = myFx.result;
    const tactic = store().state!.tactics[store().state!.meta.managedClubId]!;
    const bench = store().state!.clubs[store().state!.meta.managedClubId]!.squad
      .filter((id) => !tactic.lineup.some((s) => s.playerId === id));
    if (bench[0]) {
      // Substituição ao intervalo, como no ecrã de jogo.
      const lineup = tactic.lineup.map((s, i) => (i === 10 ? { ...s, playerId: bench[0]! } : s));
      const changed = act('substituição ao intervalo', () => store().applyMatchChange(45, lineup, 'DEFENSIVE', 'SLOW'));
      assert(!!changed, 'a substituição ao vivo devolve um resultado novo');
      if (changed) {
        const firstHalfBefore = before.events.filter((e) => e.minute <= 45 && e.type === 'GOAL').length;
        const firstHalfAfter = changed.events.filter((e) => e.minute <= 45 && e.type === 'GOAL').length;
        assert(firstHalfBefore === firstHalfAfter,
          'trocar ao intervalo não reescreve a primeira parte já jogada');
        assert(changed.events.some((e) => e.type === 'FULL_TIME'), 'o jogo re-simulado chega ao fim');
      }
      act('limpar ajustes', () => store().clearMatchAdjustments());
    }
    const replay = act('segunda hipótese (repetir jogo)', () => store().replayLastMatch(myFx.id));
    assert(replay !== undefined, 'a repetição responde sem rebentar');
    assert(store().replayLastMatch(myFx.id) === null, 'não dá para repetir o mesmo jogo duas vezes');
  }

  // --- EUROPA. Uma semana europeia pode ser DE DUAS maneiras: jogas, ou a liga
  // pausa e tu ficas de fora (eliminado ou nunca qualificado). As duas são
  // legítimas; o que não pode acontecer é a UI receber um jogo com adversário
  // que não existe, que é o que dava ecrã em branco.
  if (store().nextIsEuropean()) {
    euroNights++;
    const euro = act('próximo jogo europeu', () => store().nextEuroMatch());
    if (euro) {
      euroPlayed++;
      const opp = store().state!.clubs[euro.opponentId];
      if (!opp) {
        failures++;
        console.error('  ✗ FALHA: noite europeia com adversário inexistente', euro.opponentId);
      }
      if (!opp?.shortName || !euro.comp) {
        failures++;
        console.error('  ✗ FALHA: noite europeia sem dados para desenhar o cartão');
      }
    } else {
      euroPaused++;
    }
  }

  // O relatório semanal e a caixa de entrada são lidos a cada jornada.
  act('relatório da semana', () => store().pendingReport);
  act('caixa depois da jornada', () => store().inboxItems());
  act('classificação depois da jornada', () => store().standings());
  store().clearReport();
}

assert(weeks > 30, `jogaram-se ${weeks} semanas sem rebentar`);
assert(inboxHandled > 0, `${inboxHandled} decisões tomadas na caixa de entrada`);
console.log(`  (${contractsDecided} contratos decididos no fim de época · ${sacked} despedimento(s))`);
assert(seasonsFinished >= 1, `${seasonsFinished} época(s) completa(s)`);
assert(matchesSeen > 0, `${matchesSeen} jogos simulados`);
assert(goalsSeen / Math.max(1, matchesSeen) > 1.5 && goalsSeen / Math.max(1, matchesSeen) < 5,
  `média de golos plausível (${(goalsSeen / Math.max(1, matchesSeen)).toFixed(2)}/jogo)`);
assert(derbies > 0, `${derbies} dérbis pelo caminho`);
console.log(`  (${euroNights} noites europeias: ${euroPlayed} a jogar, ${euroPaused} em pausa)`);
assert(euroNights === euroPlayed + euroPaused, 'toda a noite europeia é ou jogo ou pausa — nunca um estado sem resposta');
assert(new Set(scorelines).size > 5, `resultados variados (${new Set(scorelines).size} placares diferentes)`);

// ===========================================================================
// 3. SANIDADE DO ESTADO
// ===========================================================================
console.log('\nEstado no fim:');

const st = store().state!;

{
  const club = st.clubs[st.meta.managedClubId]!;
  assert(club.squad.length >= 11, `plantel viável (${club.squad.length} jogadores)`);
  assert(club.squad.every((id) => !!st.players[id]), 'nenhum jogador do plantel é um id fantasma');
  const fin = st.finances[club.id]!;
  assert(Number.isFinite(fin.balance), 'o saldo é um número');
  assert(fin.balance >= 0, `o saldo nunca fica negativo (${fin.balance})`);
}

{
  const tactic = st.tactics[st.meta.managedClubId]!;
  assert(tactic.lineup.length === 11, 'o onze tem 11');
  assert(new Set(tactic.lineup.map((s) => s.playerId)).size === 11, 'sem jogadores repetidos no onze');
  assert(tactic.lineup.every((s) => !!st.players[s.playerId]), 'todos os titulares existem');
  assert(tactic.lineup.every((s) => !s.role || effectiveRole(s.role, s.position) === s.role),
    'os papéis continuam válidos depois de duas épocas');
}

{
  let bad = 0;
  for (const p of Object.values(st.players)) {
    const ovr = displayOverall(p);
    if (!Number.isFinite(ovr) || ovr < 1 || ovr > 100) bad++;
    if (p.condition.fitness < 0 || p.condition.fitness > 100) bad++;
    if (p.condition.morale < 0 || p.condition.morale > 100) bad++;
    if (p.age < 14 || p.age > 45) bad++;
    if (!Number.isFinite(p.wage) || p.wage < 0) bad++;
  }
  assert(bad === 0, `todos os ${Object.values(st.players).length} jogadores com valores dentro da escala`);
}

{
  // As notícias são texto que o utilizador LÊ: uma chave sem tradução aparece
  // crua no ecrã, e é exatamente o tipo de erro que ninguém deteta a olho.
  let untranslated = 0;
  const seen = new Set<string>();
  for (const n of st.news) {
    if (seen.has(n.key)) continue;
    seen.add(n.key);
    for (const lang of LANGS) if (translate(lang, n.key) === n.key) untranslated++;
  }
  assert(untranslated === 0, `as ${seen.size} notícias geradas estão todas traduzidas`);
}

{
  const table = st.standings[st.clubs[st.meta.managedClubId]!.leagueId]!;
  const rows = Object.values(table);
  const pts = rows.every((r) => r.points === r.won * 3 + r.drawn);
  const games = rows.every((r) => r.played === r.won + r.drawn + r.lost);
  assert(pts && games, 'a classificação é internamente coerente');
  const goalsFor = rows.reduce((n, r) => n + r.goalsFor, 0);
  const goalsAgainst = rows.reduce((n, r) => n + r.goalsAgainst, 0);
  assert(goalsFor === goalsAgainst, `golos marcados = sofridos na liga (${goalsFor})`);
}

{
  const rivals = rivalsOf(st, st.meta.managedClubId);
  assert(rivals.length > 0, 'o clube continua a ter rivais depois de mudar de divisão/época');
}

// ===========================================================================
// 4. SEGUNDA CARREIRA — num clube GRANDE, para passar pela Europa
// ===========================================================================
//
// A primeira sessão começou num clube pequeno e nunca se qualificou: as 17
// noites europeias foram todas de pausa, e a Europa ficou por testar. Aqui
// escolhe-se o clube de maior reputação do país (é o que o ecrã de escolha de
// clube permite fazer) e joga-se até apanhar noites europeias a sério.
console.log('\nSegunda carreira (clube grande, para chegar à Europa):');

act('novo jogo no clube grande', () => store().newGame({
  managerName: 'Renato', useBase: true, seed: 5150,
}));
{
  const all = Object.values(store().state!.clubs).filter((c) => !c.european);
  const big = [...all].sort((a, b) => b.reputation - a.reputation)[0]!;
  act('escolher o clube grande', () => store().completeOnboarding('Renato', big.id));
  assert(store().state!.meta.managedClubId === big.id, `carreira começada no ${big.shortName}`);
}

let euroPlayedBig = 0, euroWeeksBig = 0;
for (let w = 0; w < 120 && euroPlayedBig < 4; w++) {
  if (store().advanceBlockedBy()) { clearInbox(); store().rotate(); }
  if (store().nextIsEuropean()) {
    euroWeeksBig++;
    const euro = store().nextEuroMatch();
    if (euro) {
      euroPlayedBig++;
      const opp = store().state!.clubs[euro.opponentId];
      assert(!!opp, `noite europeia ${euroPlayedBig}: adversário materializado (${opp?.shortName ?? '???'})`);
      // O adversário europeu tem de trazer plantel e tática, senão o jogo não
      // se pode simular — é o risco conhecido de materializar clubes de fora.
      if (opp) {
        assert(opp.squad.length >= 11, `o adversário europeu tem plantel (${opp.squad.length})`);
        assert(!!store().state!.tactics[opp.id], 'o adversário europeu tem tática');
      }
    }
  }
  const res = store().advance();
  if (!res) {
    const offers = store().state!.career.pendingOffers;
    if (offers.length > 0) { store().acceptOffer(offers[0]!); continue; }
    const expiring = store().expiringDecisions();
    if (expiring.length > 0) { expiring.forEach((p) => store().renewExpiring(p.id)); continue; }
    if (store().lastSeason) { store().clearReport(); continue; }
    if (store().advanceBlockedBy()) { clearInbox(); continue; }
    break;
  }
}
console.log(`  (${euroWeeksBig} semanas europeias · ${euroPlayedBig} com jogo nosso)`);
assert(euroPlayedBig > 0, 'um clube grande chega mesmo às provas europeias');

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
