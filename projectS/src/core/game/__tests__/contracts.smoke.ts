/**
 * Teste de fumo — cláusulas de contrato e relação com o plantel.
 * Corre com: npm run smoke:contracts
 */
import { Formation, FORMATION_FAMILIES, naturalOverallFine, Player } from '../../models';
import { FORMATION_POSITIONS, formationSignature } from '../lineup';
import {
  bonusesDue,
  computeMarketValue,
  defaultReleaseClause,
  evaluateOffer,
  minReleaseClause,
  releaseWageFactor,
  requiredWageWith,
  seasonReputationDelta,
  sellOnCut,
  sellOnFeeFactor,
  suggestedWage,
  withinDivisionCap,
} from '../../economy';
import {
  acceptBid,
  advanceWeek,
  createNewGame,
  generateIncomingBids,
  loanOptionPrice,
  promiseTo,
  reselectLineup,
  setManagedObjective,
  setTransferListed,
  talkTo,
  tickPromises,
  trustOf,
} from '../index';
import { Rng } from '../../engine/rng';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — cláusulas e relação com o plantel\n');

const state = createNewGame({ managerName: 'R', numClubs: 12, squadSize: 20, divisions: 3, seed: 909 });
const managedId = state.meta.managedClubId;
const squad = () => state.clubs[managedId]!.squad.map((id) => state.players[id]!);

// ---------------------------------------------------------------- valores
console.log('Escala de valores (curva realista):');
const byOvr = [...Object.values(state.players)]
  .filter((p) => p.age >= 24 && p.age <= 28)
  .sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a));
const best = byOvr[0]!;
const mid = byOvr[Math.floor(byOvr.length / 2)]!;
assert(
  computeMarketValue(best, state.meta.season) > computeMarketValue(mid, state.meta.season) * 5,
  'o melhor jogador vale muitas vezes mais do que o mediano (curva íngreme)',
);

// Um jovem com margem de potencial vale mais do que o overall de hoje sugere.
const prospect = Object.values(state.players)
  .filter((p) => p.age <= 19 && p.potential - naturalOverallFine(p) >= 3)
  .sort((a, b) => b.potential - a.potential)[0];
if (prospect) {
  const twin: Player = { ...prospect, age: 29, potential: naturalOverallFine(prospect) };
  assert(
    computeMarketValue(prospect, state.meta.season) > computeMarketValue(twin, state.meta.season),
    'jovem com potencial vale mais que o gémeo velho sem margem',
  );
}

// ------------------------------------------------------------- rescisão
console.log('\nCláusula de rescisão:');
const target = squad().sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a))[0]!;
const value = computeMarketValue(target, state.meta.season);
assert(minReleaseClause(target, state.meta.season) >= value * 1.15, 'mínimo da cláusula acima do valor de mercado');
assert(defaultReleaseClause(target, state.meta.season) > minReleaseClause(target, state.meta.season),
  'a sugestão é mais alta que o mínimo');

const cheap = requiredWageWith(target, state.meta.season, { releaseClause: minReleaseClause(target, state.meta.season) });
const rich = requiredWageWith(target, state.meta.season, { releaseClause: value * 4 });
assert(cheap < rich, 'cláusula barata desconta no ordenado; blindada encarece');
assert(releaseWageFactor(undefined, value) > 1, 'sem cláusula nenhuma o jogador pede mais');

// Pagar a cláusula dispensa negociar com o clube.
const rival = Object.values(state.clubs).find((c) => c.id !== managedId && !c.european)!;
target.clauses = { releaseClause: Math.round(value * 1.3) };
const rivalFin = state.finances[rival.id]!;
rivalFin.transferBudget = target.clauses.releaseClause! * 3;
rivalFin.balance = rivalFin.transferBudget;
const viaClause = evaluateOffer({
  playerId: target.id, fromClubId: rival.id, fee: target.clauses.releaseClause!,
  wageOffer: suggestedWage(target) * 2, contractYears: 4,
}, state);
assert(viaClause.decision !== 'COUNTER', 'com a cláusula paga o clube não contrapropõe pelo passe');

// --------------------------------------------------------- futura venda
console.log('\nPercentagem de futura venda:');
assert(sellOnFeeFactor(0.2) < 1 && sellOnFeeFactor(0) === 1, 'pedir % de futura venda desconta no passe');
assert(sellOnCut(10_000_000, { sellOn: 0.2, sellOnClubId: 'x' })!.amount === 2_000_000, 'a fatia é 20% do passe');
assert(sellOnCut(10_000_000, { sellOn: 0.2 }) === null, 'sem clube beneficiário não há fatia');

// Venda real com futura venda registada.
const seller = squad().find((p) => p.id !== target.id)!;
setTransferListed(state, seller.id, true);
let bid = null;
for (let w = 0; w < 40 && !bid; w++) {
  const created = generateIncomingBids(state, new Rng(500 + w));
  bid = created.find((b) => b.playerId === seller.id) ?? null;
  if (!bid) advanceWeek(state);
}
if (bid) {
  const gross = bid.fee;
  const res = acceptBid(state, bid.id, 0.2);
  assert(res.ok, 'venda com 20% de futura venda concretizada');
  assert((res.fee ?? 0) < gross, 'recebe-se menos hoje por causa da percentagem');
  assert(state.players[seller.id]!.clauses?.sellOn === 0.2, 'a percentagem ficou registada no jogador');
  assert(state.players[seller.id]!.clauses?.sellOnClubId === managedId, 'a percentagem é nossa');
} else {
  console.log('  (sem proposta gerada — salta o teste de futura venda)');
}

// ------------------------------------------------------------- prémios
console.log('\nPrémios de contrato:');
assert(bonusesDue({ goalBonus: 10_000 }, 2, true) === 20_000, 'dois golos pagam dois prémios');
assert(bonusesDue({ appearanceBonus: 5_000 }, 0, true) === 5_000, 'prémio por jogo pago mesmo sem golos');
assert(bonusesDue({ appearanceBonus: 5_000 }, 0, false) === 0, 'quem não joga não recebe prémio de jogo');
const withBonus = requiredWageWith(target, state.meta.season, {
  releaseClause: defaultReleaseClause(target, state.meta.season), goalBonus: 50_000, appearanceBonus: 20_000,
});
const without = requiredWageWith(target, state.meta.season, {
  releaseClause: defaultReleaseClause(target, state.meta.season),
});
assert(withBonus < without, 'trocar fixo por prémios baixa o ordenado exigido');

// ------------------------------------------------- opção de compra (empréstimo)
console.log('\nOpção de compra:');
const kid = Object.values(state.players).find((p) => p.age <= 21 && p.clubId && p.clubId !== managedId)!;
assert(loanOptionPrice(kid) > kid.marketValue, 'a opção custa mais que o valor de hoje (o dono cobra por travar o preço)');

// ------------------------------------------------------------- conversas
console.log('\nConversas com o plantel:');
const talker = squad()[0]!;
talker.condition.form = 90; // está bem — o elogio deve cair bem
talker.condition.relation = undefined;
const praise = talkTo(state, talker.id, 'PRAISE');
assert(praise.ok && praise.wellReceived === true, 'elogio merecido é bem recebido');
assert(trustOf(talker) > 0, 'a confiança sobe com um elogio merecido');
assert(!talkTo(state, talker.id, 'PRAISE').ok, 'não dá para falar outra vez logo a seguir');

const other = squad()[1]!;
other.condition.form = 85;
other.condition.relation = undefined;
// "Está bem" tem de valer nas DUAS medidas: forma E nota da época. Depois de
// dezenas de jornadas simuladas o jogador já traz uma média baixa, e sem
// limpá-la a crítica passava a justa — o teste media outra coisa que não a
// regra que quer proteger.
other.condition.seasonApps = 10;
other.condition.seasonRating = 75; // média 7.5
const badCrit = talkTo(state, other.id, 'CRITICISE');
assert(badCrit.ok && badCrit.wellReceived === false, 'criticar quem está bem sai caro');
assert(trustOf(other) < 0, 'a confiança cai com uma crítica injusta');

// ------------------------------------------------------------- promessas
console.log('\nPromessas:');
const promised = squad()[2]!;
promised.condition.relation = undefined;
promised.condition.morale = 50;
const before = promised.condition.morale;
const pr = promiseTo(state, promised.id, 'PLAYING_TIME');
assert(pr.ok, 'promessa de minutos feita');
assert(promised.condition.morale > before, 'a moral sobe logo ao prometer');
assert(!promiseTo(state, promised.id, 'SIGNING').ok, 'só uma promessa em aberto de cada vez');

// Falhar a promessa: o prazo passa sem jogos.
promised.condition.relation!.promise!.deadline = '2000-01-01';
const trustBefore = trustOf(promised);
const verdicts = tickPromises(state);
const broken = verdicts.find((v) => v.playerId === promised.id);
assert(!!broken && !broken.kept, 'promessa por cumprir é dada como falhada no prazo');
assert(trustOf(promised) < trustBefore, 'falhar uma promessa queima a confiança');

// Cumprir: jogos suficientes antes do prazo.
const keeper = squad()[3]!;
keeper.condition.relation = undefined;
keeper.condition.seasonApps = 5;
promiseTo(state, keeper.id, 'PLAYING_TIME');
keeper.condition.seasonApps = 10; // jogou os jogos prometidos
const kept = tickPromises(state).find((v) => v.playerId === keeper.id);
assert(!!kept && kept.kept, 'promessa cumprida fecha-se logo, sem esperar pelo prazo');
assert(trustOf(keeper) > 0, 'cumprir sobe a confiança');

// ------------------------------------------- instruções táticas sobrevivem
console.log('\nTroca de formação preserva as instruções:');
const myTactic = state.tactics[managedId]!;
myTactic.pressing = 10;
myTactic.defensiveLine = 9;
myTactic.creativity = 8;
myTactic.mentality = 'ATTACKING';
myTactic.tempo = 'FAST';
const otherFormation = myTactic.formation === '4-3-3' ? '4-4-2' : '4-3-3';
const swapped = reselectLineup(
  myTactic, managedId, state.clubs[managedId]!.squad, state.players, otherFormation as never,
);
assert(swapped.formation === otherFormation, 'a formação mudou');
assert(swapped.pressing === 10, 'pressão preservada (era o bug: voltava a 5)');
assert(swapped.defensiveLine === 9, 'linha defensiva preservada');
assert(swapped.creativity === 8, 'criatividade preservada');
assert(swapped.mentality === 'ATTACKING' && swapped.tempo === 'FAST', 'mentalidade e ritmo preservados');
assert(swapped.lineup.length > 0, 'o onze foi recalculado para a formação nova');

// ------------------------------- toda a proposta recebida tem de ser vendável
//
// O BUG que voltou vezes sem conta: escolhia-se o comprador por ele aguentar 90%
// do valor de mercado e só depois se sorteava o preço, que podia ir a 150%. A
// proposta aparecia na caixa de entrada, o "Vender" chamava `executeTransfer`, e
// este recusava por falta de verba — sem mensagem nenhuma no ecrã. Este teste
// percorre muitas semanas e exige que TODA a proposta gerada seja executável.
console.log('\nPropostas recebidas são todas concretizáveis:');
{
  const sim = createNewGame({ managerName: 'R', numClubs: 14, squadSize: 20, divisions: 3, seed: 777 });
  const simManaged = sim.meta.managedClubId;
  let generated = 0;
  let impossible = 0;

  for (let week = 0; week < 60; week++) {
    // Metade do plantel na lista de transferências → muitas propostas.
    for (const id of sim.clubs[simManaged]!.squad) {
      const p = sim.players[id];
      if (p) p.transferListed = true;
    }
    for (const bid of generateIncomingBids(sim, new Rng(9000 + week))) {
      generated++;
      const fin = sim.finances[bid.fromClubId];
      const buyerClub = sim.clubs[bid.fromClubId];
      const tier = buyerClub ? sim.leagues[buyerClub.leagueId]?.tier ?? 1 : 1;
      const canPayFee = !!fin && fin.transferBudget >= bid.fee;
      const canPayWage = !!fin && withinDivisionCap(fin, tier, bid.wageOffer);
      if (!canPayFee || !canPayWage) {
        impossible++;
        if (impossible <= 3) {
          console.error(`     proposta impossível: ${buyerClub?.shortName} oferece ${bid.fee}` +
            ` (verba ${fin?.transferBudget}) · ordenado ${bid.wageOffer} · cabe no teto=${canPayWage}`);
        }
      }
    }
    advanceWeek(sim);
  }
  assert(generated > 20, `geraram-se propostas suficientes para o teste valer (${generated})`);
  assert(impossible === 0, `nenhuma proposta é impossível de concretizar (${impossible} de ${generated})`);
}

// ------------------------------------------------- formações sem repetidas
//
// O motor de partida só vê as POSIÇÕES dos onze slots: desenhar os jogadores
// mais acima ou mais abaixo no ecrã não muda uma linha da simulação. Por isso
// duas formações com o mesmo conjunto de posições são a mesma formação com dois
// nomes — foi o que aconteceu ao 4-5-1, idêntico ao 4-3-3 ("o 451 é igual ao
// 433"). Este teste torna impossível voltar a acontecer.
console.log('\nFormações:');
{
  const all = Object.values(Formation);
  const bySignature = new Map<string, string>();
  const duplicates: string[] = [];
  let wrongSize = 0;
  for (const f of all) {
    if (FORMATION_POSITIONS[f].length !== 11) wrongSize++;
    const sig = formationSignature(f);
    const twin = bySignature.get(sig);
    if (twin) duplicates.push(`${f} === ${twin}`);
    else bySignature.set(sig, f);
  }
  assert(all.length >= 10, `há variedade de formações (${all.length})`);
  assert(wrongSize === 0, 'todas as formações têm 11 posições');
  assert(duplicates.length === 0, `nenhuma formação repete outra${duplicates.length ? ': ' + duplicates.join(', ') : ''}`);

  // Há mesmo formações com trinco e com médio ofensivo (o pedido do playtest).
  const withDM = all.filter((f) => FORMATION_POSITIONS[f].includes('DM'));
  const withAM = all.filter((f) => FORMATION_POSITIONS[f].includes('AM'));
  assert(withDM.length >= 3, `formações com trinco (DM): ${withDM.length}`);
  assert(withAM.length >= 3, `formações com médio ofensivo (AM): ${withAM.length}`);

  // Toda a formação tem de ter desenho no ecrã e caber numa família da gaveta.
  const inFamilies = new Set(FORMATION_FAMILIES.flatMap((g) => g.formations));
  const missing = all.filter((f) => !inFamilies.has(f));
  assert(missing.length === 0, `todas as formações estão agrupadas na UI${missing.length ? ': faltam ' + missing.join(', ') : ''}`);
}

// ------------------------------------------------- objetivos da direção
console.log('\nObjetivo da direção (a direção tem memória):');
assert(seasonReputationDelta(1, 18, true, false, false, 1) === 6, 'título isolado vale +6 de reputação');
assert(seasonReputationDelta(1, 18, true, false, false, 2) === 9, '2º título seguido vale +9');
assert(seasonReputationDelta(1, 18, true, false, false, 4) === 15, '4º título seguido vale +15');
assert(
  seasonReputationDelta(1, 18, true, false, false, 9) === seasonReputationDelta(1, 18, true, false, false, 4),
  'a série tem teto (não cresce para sempre)',
);

const myClub = state.clubs[managedId]!;
const myLeague = state.leagues[myClub.leagueId]!;
const record = (champion: boolean, promoted: boolean) => ({
  season: state.meta.season - 1, clubId: managedId, clubName: myClub.name,
  leagueName: myLeague.name, tier: myLeague.tier, position: champion ? 1 : 8,
  points: 60, won: 20, drawn: 5, lost: 5, champion, promoted, relegated: false,
});

// Campeão que ficou na mesma divisão → a direção exige revalidar.
myClub.reputation = 20; // de propósito baixo: pelo ranking daria "fugir à despromoção"
state.career.seasons = [record(true, false)];
setManagedObjective(state);
assert(state.career.objective === 'TITLE', 'campeão em título recebe objetivo de TÍTULO (era o bug)');

// Campeão que SUBIU de escalão → dão-lhe crédito, não lhe exigem o título.
state.career.seasons = [record(true, true)];
setManagedObjective(state);
assert(state.career.objective !== 'TITLE', 'quem acabou de subir não é obrigado a ganhar logo');

// Sem história recente, manda o ranking de reputação.
state.career.seasons = [];
setManagedObjective(state);
assert(state.career.objective === 'AVOID_RELEGATION', 'sem títulos recentes, o objetivo sai da reputação');

console.log(failures === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : `\n❌ ${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
