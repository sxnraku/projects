/**
 * Teste de fumo dos PAPÉIS TÁCTICOS, das BOLAS PARADAS e das RIVALIDADES.
 * Corre com: npm run smoke:tactics
 *
 * O que se protege aqui são invariantes que se partem em silêncio: um papel
 * neutro que deixe de ser neutro muda TODOS os resultados do jogo; um marcador
 * de bola parada que não seja respeitado transforma a escolha num placebo; um
 * dérbi que não seja simétrico faz o mesmo jogo valer coisas diferentes às duas
 * equipas.
 */
import {
  advanceWeek, createNewGame, isDerby, rivalsOf, carryRoles, mainRival,
} from '../index';
import { computeTeamStrength, simulateMatch } from '../../engine';
import { effectiveRole, roleAllowed, roleFit, rolesFor, ROLE_SPECS, Tactic } from '../../models';
import { matchdayGate } from '../../economy';
import { deserialize, serialize } from '../../../persistence/serialize';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✗ FALHA:', msg); }
  else console.log('  ✓', msg);
}

console.log('Teste de fumo — papéis, bolas paradas e rivalidades\n');

const s = createNewGame({ managerName: 'R', useBase: true, seed: 7788 });
const managedId = s.meta.managedClubId;
const tactic = s.tactics[managedId]!;

// --------------------------------------------------------------- papéis
console.log('Papéis tácticos:');

{
  const attrs = s.players[tactic.lineup[0]!.playerId]!.attributes;
  const foot = s.players[tactic.lineup[0]!.playerId]!.foot;
  assert(roleFit('GK_CLASSIC', attrs, foot, 'GK') === 1,
    'papel neutro tem fit exatamente 1 (saves antigos jogam igual)');
}

{
  // Um onze SEM papéis tem de dar exatamente a mesma força de sempre.
  const withoutRoles = computeTeamStrength(tactic, s.players);
  const explicitNeutral: Tactic = {
    ...tactic,
    lineup: tactic.lineup.map((slot) => ({ ...slot, role: effectiveRole(undefined, slot.position) })),
  };
  const withNeutral = computeTeamStrength(explicitNeutral, s.players);
  assert(
    Math.abs(withoutRoles.attack - withNeutral.attack) < 1e-9
    && Math.abs(withoutRoles.midfield - withNeutral.midfield) < 1e-9
    && Math.abs(withoutRoles.defence - withNeutral.defence) < 1e-9,
    'sem papel = papel neutro: a força da equipa não muda',
  );
}

{
  // Só se oferecem papéis que a posição aceita.
  let bad = 0;
  for (const position of ['GK', 'CB', 'RB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as const) {
    for (const role of rolesFor(position)) {
      if (!roleAllowed(role, position)) bad++;
      const spec = ROLE_SPECS[role];
      const w = spec.weights.attack + spec.weights.midfield + spec.weights.defence;
      if (Math.abs(w - 1) > 1e-9) bad++;
    }
  }
  assert(bad === 0, 'todos os papéis oferecidos são válidos e os pesos somam 1');
  assert(rolesFor('CB').includes('DEF_STOPPER') && !rolesFor('CB').includes('DEF_WINGBACK'),
    'central aceita marcador mas não lateral ofensivo');
}

{
  // Extremo invertido: o pé decide. Mesmo jogador, mesma ala, pés diferentes.
  const attrs = s.players[tactic.lineup[10]!.playerId]!.attributes;
  const right = roleFit('ATT_INVERTED', attrs, 'RIGHT', 'LW');
  const left = roleFit('ATT_INVERTED', attrs, 'LEFT', 'LW');
  assert(right > left, 'extremo invertido na esquerda rende mais com pé direito');
}

{
  // O papel move valor entre zonas: lateral ofensivo empresta ao meio-campo.
  const withWingback: Tactic = {
    ...tactic,
    lineup: tactic.lineup.map((slot) => (
      slot.position === 'RB' || slot.position === 'LB'
        ? { ...slot, role: 'DEF_WINGBACK' as const }
        : slot
    )),
  };
  const base = computeTeamStrength(tactic, s.players);
  const wb = computeTeamStrength(withWingback, s.players);
  const hasFullBacks = tactic.lineup.some((x) => x.position === 'RB' || x.position === 'LB');
  assert(!hasFullBacks || wb.midfield !== base.midfield,
    'laterais ofensivos mudam o peso do meio-campo');
}

{
  // O papel segue o jogador quando o onze é recalculado.
  const prev = tactic.lineup.map((slot, i) => (i === 5 ? { ...slot, role: 'MID_PLAYMAKER' as const } : slot));
  const next = prev.map((slot) => ({ position: slot.position, playerId: slot.playerId }));
  const carried = carryRoles(prev, next);
  assert(carried[5]!.role === 'MID_PLAYMAKER', 'o papel sobrevive a um recálculo do onze');

  // …mas não sobrevive a uma posição que não o aceita.
  const moved = prev.map((slot, i) => (i === 5 ? { position: 'GK' as const, playerId: slot.playerId } : { position: slot.position, playerId: slot.playerId }));
  assert(carryRoles(prev, moved)[5]!.role === undefined,
    'o papel cai se a posição nova não o aceitar');
}

// --------------------------------------------------------- bolas paradas
console.log('\nBolas paradas:');

{
  const sp = computeTeamStrength(tactic, s.players).setPiece;
  assert(sp.freeKickTakerId !== null && sp.cornerTakerId !== null,
    'sem escolha do treinador, o motor escolhe os marcadores (a IA joga assim)');
  assert(tactic.lineup.some((x) => x.playerId === sp.freeKickTakerId),
    'o marcador automático sai sempre do onze');
}

{
  // Escolher um marcador é respeitado…
  const chosen = tactic.lineup[7]!.playerId;
  const withTaker: Tactic = { ...tactic, freeKickTakerId: chosen, cornerTakerId: chosen };
  const sp = computeTeamStrength(withTaker, s.players).setPiece;
  assert(sp.freeKickTakerId === chosen && sp.cornerTakerId === chosen,
    'o marcador escolhido é o que bate');

  // …mas escolher alguém fora do onze não deixa a equipa sem batedor.
  const benched = s.clubs[managedId]!.squad.find((id) => !tactic.lineup.some((x) => x.playerId === id))!;
  const spBench = computeTeamStrength({ ...tactic, freeKickTakerId: benched }, s.players).setPiece;
  assert(spBench.freeKickTakerId !== null && spBench.freeKickTakerId !== benched,
    'marcador no banco não bate: cai para o melhor do onze');
}

{
  // Golos de bola parada existem, estão marcados e não dominam o jogo.
  const clubs = Object.values(s.clubs).filter((c) => !c.european);
  let goals = 0, setPiece = 0, games = 0;
  for (let i = 0; i < clubs.length && games < 240; i++) {
    for (let j = 0; j < clubs.length && games < 240; j++) {
      const h = clubs[i]!, a = clubs[j]!;
      if (i === j || h.leagueId !== a.leagueId) continue;
      const ht = s.tactics[h.id], at = s.tactics[a.id];
      if (!ht || !at) continue;
      const r = simulateMatch(h.id, a.id, ht, at, s.players, 555 + i * 31 + j);
      games++;
      for (const e of r.events) {
        if (e.type !== 'GOAL') continue;
        goals++;
        if (e.detail) setPiece++;
      }
    }
  }
  const perGame = goals / games;
  const share = setPiece / goals;
  console.log(`  (${games} jogos · ${perGame.toFixed(2)} golos/jogo · ${(share * 100).toFixed(1)}% de bola parada)`);
  assert(perGame > 2 && perGame < 4, 'média de golos por jogo continua realista');
  assert(share > 0.05 && share < 0.35, 'as bolas paradas pesam, sem tomar conta do jogo');
}

{
  // O canto curto tira o lance do ar: marca menos de canto do que o primeiro poste.
  const clubs = Object.values(s.clubs).filter((c) => !c.european).slice(0, 12);
  const count = (focus: 'NEAR' | 'SHORT') => {
    let n = 0;
    for (let i = 0; i < clubs.length; i++) {
      for (let j = 0; j < clubs.length; j++) {
        const h = clubs[i]!, a = clubs[j]!;
        if (i === j || h.leagueId !== a.leagueId) continue;
        const ht = s.tactics[h.id], at = s.tactics[a.id];
        if (!ht || !at) continue;
        const r = simulateMatch(h.id, a.id, { ...ht, cornerFocus: focus }, at, s.players, 909 + i * 17 + j);
        for (const e of r.events) {
          if (e.type === 'GOAL' && e.side === 'HOME' && (e.detail === 'CORNER' || e.detail === 'HEADER')) n++;
        }
      }
    }
    return n;
  };
  const near = count('NEAR');
  const short = count('SHORT');
  console.log(`  (cantos ao 1º poste: ${near} golos · cantos curtos: ${short})`);
  assert(near > short, 'primeiro poste dá mais golo de canto do que o canto curto');
}

// ----------------------------------------------------------- rivalidades
console.log('\nRivalidades:');

{
  const rivals = rivalsOf(s, managedId);
  assert(rivals.length > 0, `o clube gerido tem rivais (${rivals.length})`);
  assert(!rivals.includes(managedId), 'ninguém é rival de si próprio');
  assert(rivals.every((r) => isDerby(s, managedId, r) && isDerby(s, r, managedId)),
    'a rivalidade é simétrica nos dois sentidos');
  assert(rivalsOf(s, managedId).join() === rivals.join(),
    'a lista de rivais é determinística (mesma chamada, mesma resposta)');
  const main = mainRival(s, managedId);
  assert(main !== null && rivals.includes(main), 'o rival principal sai da lista de rivais');
}

{
  // Dérbi enche o estádio e sobe o preço do bilhete.
  const club = s.clubs[managedId]!;
  const normal = matchdayGate(club, []);
  const derby = matchdayGate(club, [], true);
  assert(derby.revenue > normal.revenue, 'um dérbi rende mais bilheteira do que um jogo normal');
  assert(derby.attendance >= normal.attendance, 'e traz pelo menos tanta gente ao estádio');
}

{
  // O dérbi muda o jogo (casa mais forte, mais cartões) sem o tornar outro jogo.
  const clubs = Object.values(s.clubs).filter((c) => !c.european);
  let normalCards = 0, derbyCards = 0, n = 0;
  for (let i = 0; i < clubs.length && n < 120; i++) {
    for (let j = 0; j < clubs.length && n < 120; j++) {
      const h = clubs[i]!, a = clubs[j]!;
      if (i === j || h.leagueId !== a.leagueId) continue;
      const ht = s.tactics[h.id], at = s.tactics[a.id];
      if (!ht || !at) continue;
      const seed = 4242 + i * 13 + j;
      const cards = (derby: boolean) => simulateMatch(h.id, a.id, ht, at, s.players, seed, undefined, { derby })
        .events.filter((e) => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD').length;
      normalCards += cards(false);
      derbyCards += cards(true);
      n++;
    }
  }
  console.log(`  (${n} jogos · cartões normais ${normalCards} · em dérbi ${derbyCards})`);
  assert(derbyCards > normalCards, 'num dérbi sai mais cartão');
}

// ------------------------------------------------------------ persistência
console.log('\nGravar e ler:');

{
  // Os papéis viajam dentro do JSON do lineup; as bolas paradas foram para uma
  // tabela nova. Se qualquer um dos dois se perder no save, o treinador volta a
  // abrir o jogo e encontra a tática desfeita — sem erro nenhum a avisar.
  const g = createNewGame({ managerName: 'R', useBase: true, seed: 1234 });
  const t0 = g.tactics[g.meta.managedClubId]!;
  t0.lineup = t0.lineup.map((slot) => ({ ...slot, role: rolesFor(slot.position).slice(-1)[0] }));
  t0.freeKickTakerId = t0.lineup[8]!.playerId;
  t0.cornerTakerId = t0.lineup[4]!.playerId;
  t0.cornerFocus = 'SHORT';

  const back = deserialize(serialize(g));
  const t1 = back.tactics[back.meta.managedClubId]!;
  assert(t1.lineup.every((s, i) => s.role === t0.lineup[i]!.role), 'os papéis sobrevivem ao save');
  assert(t1.freeKickTakerId === t0.freeKickTakerId, 'o marcador de livres sobrevive ao save');
  assert(t1.cornerTakerId === t0.cornerTakerId, 'o marcador de cantos sobrevive ao save');
  assert(t1.cornerFocus === 'SHORT', 'a instrução de canto sobrevive ao save');

  // Save ANTIGO (sem a tabela `setpieces`): tem de abrir, não rebentar.
  const rows = serialize(g);
  const legacy = deserialize({ ...rows, setpieces: { id: 1, data: '' } });
  const t2 = legacy.tactics[legacy.meta.managedClubId]!;
  assert(t2.freeKickTakerId === null && t2.cornerFocus === undefined,
    'um save anterior às bolas paradas abre com os marcadores por definir');
  assert(t2.lineup.every((s, i) => s.role === t0.lineup[i]!.role),
    'e mantém os papéis, que viajam noutro sítio');
}

// ----------------------------------------------- integração (época a correr)
console.log('\nIntegração:');

{
  const g = createNewGame({ managerName: 'R', useBase: true, seed: 31337 });
  // Escolhas do treinador que TÊM de sobreviver a uma semana simulada.
  const t = g.tactics[g.meta.managedClubId]!;
  t.freeKickTakerId = t.lineup[9]!.playerId;
  t.cornerFocus = 'FAR';
  t.lineup[9] = { ...t.lineup[9]!, role: effectiveRole('ATT_POACHER', t.lineup[9]!.position) };

  // 20 jornadas: tempo mais do que suficiente para apanhar o dérbi da liga.
  let derbyNews = 0;
  for (let w = 0; w < 20; w++) {
    advanceWeek(g);
    derbyNews = g.news.filter((x) => x.key.startsWith('news.derby.')).length;
  }
  const after = g.tactics[g.meta.managedClubId]!;
  assert(after.cornerFocus === 'FAR', 'a instrução de canto sobrevive às jornadas');
  assert(after.freeKickTakerId !== null, 'o marcador de livres continua definido');
  assert(derbyNews > 0, 'o dérbi produz notícia (semana de dérbi e/ou resultado)');
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);
