/**
 * Teste de fumo do FLUXO DO JOGO — o encadeamento, não as peças soltas.
 * Corre com: npm run smoke:flow
 *
 * Simula carreiras longas em várias seeds e verifica invariantes que só
 * aparecem quando os sistemas correm juntos época após época: ninguém
 * desaparece do plantel sem motivo, o calendário fecha, a Europa acaba com o
 * clube gerido dentro dela, as contas não implodem e o mercado continua vivo.
 *
 * Cada invariante aqui nasceu de um bug real reportado no playtest.
 */
import {
  advanceWeek, createNewGame, isEuroWeek, managedLeagueId, nextRound, rolloverSeason,
  marketShortlist, generateIncomingBids, resolveCrisis, blockingReason,
} from '../index';
import { europeInProgress, EURO_COMPS } from '../../europe';
import { withinDivisionCap } from '../../economy';
import { naturalOverallFine } from '../../models';
import { Rng } from '../../engine/rng';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

const SEEDS = [101, 202, 303];
const SEASONS = 5;

console.log('Teste de fumo — fluxo do jogo (5 épocas × 3 seeds)\n');

for (const seed of SEEDS) {
  console.log(`--- seed ${seed} ---`);
  const state = createNewGame({ managerName: 'R', useBase: true, seed });
  const managed = () => state.meta.managedClubId;

  let vanished = 0;          // jogadores que sumiram do estado estando no plantel
  let squadTooSmall = 0;     // plantéis abaixo do mínimo jogável
  let doubleMatchWeeks = 0;  // semanas com dois jogos do clube gerido
  let euroWeeksWithLeague = 0; // semana europeia que também jogou a liga
  let capBreaches = 0;       // folha salarial acima do teto do clube
  let ghostLineup = 0;       // onze a apontar para quem já não está no plantel
  let negativeBalances = 0;  // saldo no vermelho (não pode existir)
  let budgetOverBalance = 0; // verba de transferências acima da caixa real

  /**
   * SAÍDAS SILENCIOSAS — o bug que interessa.
   *
   * Durante uma época, sem o utilizador vender nem dispensar ninguém, NENHUM
   * jogador pode sair do plantel sem que a jornada o comunique. Era isto que
   * acontecia: a direção vendia por dívida, o jogador aparecia no mercado, e o
   * utilizador só dava pela falta dele dias depois ("roubaram-me um jogador").
   *
   * Um plantel que se mantém nos 22 não prova nada — o craque sai e um jovem
   * entra no lugar. É a IDENTIDADE de quem sai que tem de ser justificada.
   */
  let silentExits = 0;
  let reportedExits = 0; // saídas COM aviso — servem para provar que o teste não é vazio
  const silentExamples: string[] = [];

  for (let season = 1; season <= SEASONS; season++) {
    let guard = 0;
    for (;;) {
      const leagueDone = nextRound(state, managedLeagueId(state)) === null;
      const euroDone = !state.europe || !europeInProgress(state.europe);
      if (leagueDone && euroDone) break;
      if (guard++ > 150) break;

      const expectedEuro = isEuroWeek(state);
      const before = new Set(state.clubs[managed()]!.squad);
      const r = advanceWeek(state);

      // Quem saiu do plantel esta semana, e foi comunicado?
      const after = new Set(state.clubs[managed()]!.squad);
      const gone = [...before].filter((id) => !after.has(id));
      if (gone.length > 0) {
        // O relatório da jornada menciona a saída? (venda por dívida, proposta
        // aceite, empréstimo…). O nome do jogador tem de aparecer nas notas.
        const reported = JSON.stringify(r?.report?.notes ?? []);
        for (const id of gone) {
          const p = state.players[id];
          const emprestado = !!p?.condition.loanOwnerId;
          const mencionado = !!p && reported.includes(p.lastName);
          if (emprestado || mencionado) { reportedExits++; continue; }
          {
            silentExits++;
            if (silentExamples.length < 5) {
              silentExamples.push(
                `${p ? p.lastName : id} (OVR ${p ? (naturalOverallFine(p) * 5).toFixed(0) : '?'},` +
                ` agora ${p?.clubId === null ? 'AGENTE LIVRE' : `clube ${p?.clubId}`})`,
              );
            }
          }
        }
      }

      // 1. Ninguém desaparece do ESTADO estando no plantel (o "jogador fantasma").
      const club = state.clubs[managed()]!;
      for (const id of club.squad) if (!state.players[id]) vanished++;

      // 2. O onze nunca aponta para quem saiu do plantel.
      const squadSet = new Set(club.squad);
      const tac = state.tactics[managed()];
      if (tac && tac.lineup.some((s) => !squadSet.has(s.playerId))) ghostLineup++;

      // 3. Plantel sempre jogável.
      if (club.squad.length < 11) squadTooSmall++;

      // 4. Nunca dois jogos do clube gerido na mesma semana.
      if ((r?.managedMatches?.length ?? 0) > 1) doubleMatchWeeks++;

      // 5. Semana europeia = campeonato em pausa (é o que a UI promete).
      if (expectedEuro) {
        const leagueMatch = (r?.managedMatches ?? []).some((f) => !f.leagueId.startsWith('euro_'));
        if (leagueMatch) euroWeeksWithLeague++;
      }

      // 6. Teto salarial respeitado depois de todo o mercado da semana.
      const fin = state.finances[managed()];
      const tier = state.leagues[club.leagueId]?.tier ?? 1;
      if (fin && !withinDivisionCap(fin, tier, 0)) capBreaches++;

      // 7. CARTEIRA ÚNICA: o saldo NUNCA fica negativo em clube nenhum, e a
      //    verba de transferências é sempre uma fatia dele — nunca mais do que
      //    a caixa. Era a divergência entre os dois que fazia o jogo recusar
      //    vendas com "orçamento de transferências insuficiente".
      for (const [id, f] of Object.entries(state.finances)) {
        if (state.clubs[id]?.european) continue;
        if (f.balance < 0) negativeBalances++;
        if (f.transferBudget > f.balance) budgetOverBalance++;
      }

      void before;
    }

    // A Europa TEM de estar terminada quando a época fecha — senão as
    // eliminatórias são resolvidas em silêncio dentro do rollover.
    const euroUnfinished = !!state.europe && europeInProgress(state.europe);
    assert(!euroUnfinished, `época ${season}: a Europa terminou antes do fecho da época`);

    rolloverSeason(state);
  }

  assert(
    silentExits === 0,
    `nenhum jogador saiu do plantel sem aviso (${silentExits})` +
    (silentExamples.length ? ` — ex.: ${silentExamples.join(' · ')}` : ''),
  );
  console.log(`     (saídas do plantel nesta carreira: ${reportedExits} comunicadas, ${silentExits} silenciosas)`);
  assert(vanished === 0, `nenhum jogador do plantel desapareceu do estado (${vanished})`);
  assert(ghostLineup === 0, `o onze nunca aponta para quem já saiu (${ghostLineup})`);
  assert(squadTooSmall === 0, `plantel nunca ficou abaixo de 11 (${squadTooSmall})`);
  assert(doubleMatchWeeks === 0, `nunca houve dois jogos na mesma semana (${doubleMatchWeeks})`);
  assert(euroWeeksWithLeague === 0, `semanas europeias nunca jogaram a liga (${euroWeeksWithLeague})`);
  assert(capBreaches === 0, `folha salarial nunca estourou o teto do clube (${capBreaches})`);
  assert(negativeBalances === 0, `nenhum clube ficou com saldo negativo (${negativeBalances})`);
  assert(budgetOverBalance === 0, `a verba nunca passou a caixa (${budgetOverBalance})`);

  // O mundo continua saudável ao fim de 5 épocas.
  const finances = Object.entries(state.finances).filter(([id]) => !state.clubs[id]?.european);
  const broke = finances.filter(([, f]) => f.balance <= 0).length;
  assert(broke <= finances.length * 0.25, `poucos clubes sem caixa (${broke}/${finances.length})`);

  const list = marketShortlist(state, 120);
  const affordable = list.filter((e) => e.affordable).length;
  assert(list.length >= 40, `o mercado continua com alvos (${list.length})`);
  assert(affordable > 0 && affordable < list.length,
    `o mercado mistura acessíveis e caros (${affordable}/${list.length})`);

  // Toda a proposta recebida tem de ser concretizável.
  let impossible = 0, generated = 0;
  for (const id of state.clubs[managed()]!.squad) {
    const p = state.players[id];
    if (p) p.transferListed = true;
  }
  for (let w = 0; w < 12; w++) {
    for (const bid of generateIncomingBids(state, new Rng(70000 + w))) {
      generated++;
      const fin = state.finances[bid.fromClubId];
      if (!fin || fin.transferBudget < bid.fee) impossible++;
    }
  }
  assert(impossible === 0, `propostas todas concretizáveis (${generated - impossible}/${generated})`);

  // Ainda há qualidade no mundo (não decaiu tudo ao longo das épocas).
  const best = Math.max(...Object.values(state.players).map((p) => naturalOverallFine(p) * 5));
  assert(best >= 80, `o mundo ainda tem craques (melhor OVR ${best.toFixed(0)})`);

  const euroDone = EURO_COMPS.every((c) => !state.europe || state.europe.competitions[c].stage !== 'LEAGUE');
  void euroDone;
  console.log('');
}

// ---------------------------------------------------------------------------
// VENDA FORÇADA POR DÍVIDA — o caminho que fazia jogadores "desaparecerem"
// ---------------------------------------------------------------------------
//
// Numa carreira normal isto nunca dispara (as contas aguentam-se), e por isso o
// teste acima nunca chega a ver uma saída. Aqui força-se a dívida de propósito,
// para exercitar mesmo o código que tirava jogadores do plantel em silêncio.
console.log('--- venda forçada por dívida (cenário forçado) ---');
{
  const state = createNewGame({ managerName: 'R', useBase: true, seed: 555 });
  const managed = state.meta.managedClubId;
  const club = state.clubs[managed]!;
  const fin = state.finances[managed]!;

  // Onze titular ANTES: nenhum destes deve ser o escolhido para a venda.
  const starters = new Set((state.tactics[managed]?.lineup ?? []).map((s) => s.playerId));
  const before = [...club.squad];

  // Caixa a zero e uma folha salarial impossível: a semana não vai fechar.
  // (O saldo já não pode ser negativo — o que existe agora é o BURACO da
  // semana que ficou por pagar. Ver `applyWeeklyFinances`.)
  fin.balance = 0;
  fin.expenses.wages = 50_000_000;

  const r = advanceWeek(state);

  // NADA foi vendido às escondidas: o plantel está intacto.
  const after = new Set(club.squad);
  const gone = before.filter((id) => !after.has(id));
  assert(gone.length === 0, `a direção NÃO vende sozinha o clube gerido (saíram ${gone.length})`);

  // Em vez disso, abriu-se o dilema — e ele BLOQUEIA o avanço.
  const crisis = state.inbox.find((it) => it.kind === 'CRISIS');
  assert(!!crisis, 'a dívida grave abre o dilema na caixa de entrada');
  assert(blockingReason(state) !== null, 'o dilema impede avançar a jornada');
  const notes = JSON.stringify(r?.report?.notes ?? []);
  assert(notes.includes('crisis') || notes.includes('insolvency'),
    'a crise é comunicada no balanço da jornada');

  if (crisis && crisis.kind === 'CRISIS') {
    assert(crisis.candidates.length >= 2, `há opções para escolher (${crisis.candidates.length})`);
    // Os candidatos começam FORA do onze — vender um titular é o último recurso.
    const first = crisis.candidates[0]!;
    assert(!starters.has(first), 'o primeiro candidato está fora do onze titular');

    // O treinador escolhe; o escolhido sai e o dinheiro entra.
    const chosen = state.players[first]!;
    const balBefore = fin.balance;
    const res = resolveCrisis(state, crisis.id, first);
    assert(res.ok, `a venda escolhida concretiza-se (${chosen.lastName})`);
    assert(fin.balance > balBefore, 'entrou dinheiro nas contas');
    assert(!club.squad.includes(first), 'o jogador escolhido saiu do plantel');
    assert(!state.inbox.some((it) => it.kind === 'CRISIS'), 'o dilema fecha-se depois de decidido');
  }

  // SEM CAIXA mas com a semana a fechar: nada de dilema — só o aviso, que é o
  // que dá tempo de cortar salários ou vender por vontade própria.
  const state2 = createNewGame({ managerName: 'R', useBase: true, seed: 556 });
  const club2 = state2.clubs[state2.meta.managedClubId]!;
  const fin2 = state2.finances[state2.meta.managedClubId]!;
  const size2 = club2.squad.length;
  fin2.balance = 0;
  const r2 = advanceWeek(state2);
  assert(club2.squad.length === size2, 'ficar sem caixa não custa jogadores');
  assert(!state2.inbox.some((it) => it.kind === 'CRISIS'), 'sem caixa mas a pagar: não abre crise');
  assert(fin2.balance >= 0, 'o saldo nunca fica negativo');
  assert(JSON.stringify(r2?.report?.notes ?? []).includes('insolvency'),
    'mas o aviso aparece logo, para dar tempo de resolver');
}

// ---------------------------------------------------------------------------
// ACADEMIA — não pode cuspir craques já feitos
// ---------------------------------------------------------------------------
console.log('\n--- academia (clube enorme, academia no máximo) ---');
{
  const state = createNewGame({ managerName: 'R', useBase: true, seed: 777 });
  // O pior caso: reputação no topo e academia no nível máximo. Era assim que
  // saíam miúdos de 15 anos com OVR 100 ("do nada apareceu-me um gajo 97").
  for (const club of Object.values(state.clubs)) {
    club.reputation = 99;
    club.facilities.academy = 5;
  }
  // Mede-se NO MOMENTO EM QUE ENTRAM, não anos depois: um miúdo que entra a 65
  // e chega a 86 aos 18 anos é o sistema a funcionar. O que não pode acontecer é
  // ele já NASCER feito.
  let bestAtIntake = 0;
  let bestPotAtIntake = 0;
  let intakeCount = 0;
  for (let s = 0; s < 3; s++) {
    let g = 0;
    while (nextRound(state, managedLeagueId(state)) !== null && g++ < 90) advanceWeek(state);
    const before = new Set(Object.keys(state.players));
    rolloverSeason(state);
    for (const p of Object.values(state.players)) {
      if (before.has(p.id) || p.age > 19) continue;
      intakeCount++;
      bestAtIntake = Math.max(bestAtIntake, naturalOverallFine(p) * 5);
      bestPotAtIntake = Math.max(bestPotAtIntake, p.potential * 5);
    }
  }
  assert(intakeCount > 0, `entraram jovens no mundo (${intakeCount})`);
  assert(bestAtIntake <= 75, `nenhum jovem sai da formação já feito (melhor à entrada: OVR ${bestAtIntake.toFixed(0)})`);
  // Mas o TETO continua alto: é o potencial que faz o craque, não a academia.
  assert(bestPotAtIntake >= 85, `os jovens continuam a poder ser craques (melhor potencial ${bestPotAtIntake.toFixed(0)})`);
}

console.log(failures === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : `\n❌ ${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
