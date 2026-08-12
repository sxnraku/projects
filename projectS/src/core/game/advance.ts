import {
  CUP_EVERY_LEAGUE_ROUNDS,
  displayOverall,
  effectiveOverallFine,
  Fixture,
  GameState,
  isRoundComplete,
  LineupSlot,
  naturalOverall,
  weeklyNet,
} from '../models';
import { generateCup, playCupRound } from '../cup';
import { addNews } from '../news';
import { deriveSeed, Rng } from '../engine/rng';
import { matchFatigue } from '../engine/fatigue';
import {
  annualBudgetReset,
  applyInsolvency,
  applySeasonReputation,
  applyWeeklyFinances,
  bonusesDue,
  cashWarning,
  computeMarketValue,
  countryEconFactor,
  leaguePrize,
  matchdayGate,
  moveMoney,
  processContractExpiries,
  promotionPrize,
  realignReputationOnMove,
  refreshMarketValues,
  recalcIncome,
  recalcUpkeep,
  seasonReputationDelta,
} from '../economy';
import {
  emptyStandings,
  finalPosition,
  generateSchedule,
  playRound,
  processPromotions,
  PROMOTED_PER_TIER,
  RELEGATED_PER_TIER,
  sortStandings,
  TierMove,
  transferWindow,
} from '../season';
import {
  evaluateSeason, objectiveTarget, SeasonRecord, updateConfidence, updateManagerReputation,
} from '../career';
import {
  fadePotential, individualFocus, INDIVIDUAL_GROWTH_BONUS,
  tickRetraining, trainPlayer, TrainingFocus,
} from '../training';
import { fitnessBonus, injuryDurationFactor, staffWageBill, trainingBonus } from '../staff';
import { setManagedObjective } from './newGame';
import { simulateBgWeek, resetBgSeason } from './background';
import {
  advanceEuropeMatchday, buildEuropeCampaign, dematerializeEurope, europeInProgress,
  qualifyNextSeason, retargetManagedEurope, setupSuperCup, EuroFixture,
  evolveCoefficients, coefficientRanking, EURO_MATCHDAYS,
} from '../europe';
import { ensureMinimumSquad, processYouthAndRetirements, YouthIntakeResult } from './youth';
import { returnExpiredLoans, ReturnedLoan } from './loans';
import { ensureValidLineup, refreshAiLineups } from './lineup';
import { pruneFreeAgents, rebuildAiSquads } from './aiSquads';
import {
  blockingReason,
  generateIncomingBids,
  generatePlayerRequests,
  ensureFinancialCrisis,
  generateRenewalReminders,
  pruneInbox,
  triggerReleaseClauses,
} from './inbox';
import { pruneOffers, resolveDueOffers } from './offers';
import { tickPromises } from './relations';
import { isDerby } from './rivals';
import { applyCards } from './discipline';
import {
  attendanceFactor, ensureFans, fanMood, FanMatchInput, fansOnDeparture, fansOnPromotion,
  fansOnRelegation, fansOnTrophy, homeSupport, moraleFromFans, resetSupport, squadShare,
  updateFansWeek, UNREST_CONFIDENCE_HIT,
} from './fans';
import { expirePress, generatePressConference, resolveClaim } from './press';
import { archivePlayerSeasons, archiveSeason } from './history';
import { applyStaffCost, ensureStaff } from './staffOps';
import { aiSignFreeAgents, freeAgentRng, resolvePreContracts } from './freeAgents';
import { BOSMAN_WINDOW_ROUNDS, roundsRemaining, runBosmanApproaches } from './matchday';
import { tickScouting } from './scouting';

/** Liga do clube gerido (muda com promoções/despromoções). */
export function managedLeagueId(state: GameState): string {
  return state.clubs[state.meta.managedClubId]?.leagueId ?? Object.keys(state.leagues)[0]!;
}

/**
 * A PRÓXIMA semana é europeia? (nessas não se joga a liga nem a Taça)
 *
 * Vive aqui, exportado, para haver UMA definição só: o `advanceWeek` decide o
 * que simular e a UI avisa o utilizador com exatamente o mesmo critério. Se
 * fossem duas cópias, mais cedo ou mais tarde divergiam e o aviso mentia.
 *
 * A cadência espalha as jornadas europeias pelo calendário doméstico; mas se o
 * campeonato acabar primeiro, todas as semanas seguintes são europeias até a
 * prova terminar. Sem essa segunda condição, acabada a liga o jogo dava a época
 * por encerrada e as eliminatórias por disputar eram resolvidas em silêncio no
 * rollover — o utilizador passava a fase de liga, ficava sem jogos e via mais
 * tarde que "duas equipas quaisquer foram à final".
 */
export function isEuroWeek(state: GameState): boolean {
  const eu = state.europe;
  if (!eu || !europeInProgress(eu)) return false;
  const mLeagueId = managedLeagueId(state);
  const next = nextRound(state, mLeagueId);
  if (next === null) return true; // campeonato acabado: só falta a Europa
  return next - 1 >= (eu.euroRound + 1) * eu.cadence;
}

/** Uma linha das "notas do plantel" no resumo da jornada (chave + params). */
export interface WeekNote {
  key: string;
  params?: import('../i18n').MsgParams;
  kind: 'INJURY' | 'GROWTH' | 'TRANSFER' | 'INFO' | 'FINANCE';
}

/**
 * Balanço da jornada do clube gerido — alimenta o modal de fecho da semana.
 *
 * O saldo mudava em silêncio na barra de topo e o jogador nunca ligava o
 * resultado desportivo à saúde financeira. Este relatório mostra o dinheiro a
 * entrar e a sair no segundo exato em que a jornada acaba.
 */
export interface WeekReport {
  round: number;
  played: boolean;
  isHome: boolean;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;

  attendance: number;
  gate: number; // bilheteira
  otherIncome: number; // TV + patrocínios + merchandising
  facilities: number; // despesa (positivo)
  wages: number; // despesa (positivo)
  staff: number; // despesa (positivo)
  net: number; // lucro líquido da semana
  balanceAfter: number;

  notes: WeekNote[];
}

/** Resultado de avançar uma semana. */
export interface WeekResult {
  round: number;
  fixtures: Fixture[]; // jogos da liga do clube gerido nesta semana
  cupFixtures: Fixture[]; // jogos da Taça disputados nesta semana (se houve)
  seasonEnded: boolean;
  confidence: number; // confiança da direção após a jornada
  report: WeekReport | null; // balanço da semana do clube gerido
  /**
   * Jogos JOGÁVEIS do clube gerido nesta semana, por ordem de disputa: primeiro a
   * noite europeia (se houver), depois o jogo da liga. A UI reproduz-os em fila.
   */
  managedMatches: Fixture[];
}

/** Converte um jogo europeu num Fixture (para injúrias/estatísticas/UI de jogo). */
function euroToFixture(ef: EuroFixture): Fixture {
  return {
    id: ef.id, leagueId: `euro_${ef.comp}`, round: ef.matchday,
    homeClubId: ef.homeId, awayClubId: ef.awayId, result: ef.result,
  };
}

/** Próxima jornada por simular numa liga. Null se a época dessa liga acabou. */
export function nextRound(state: GameState, leagueId: string): number | null {
  const schedule = state.schedules[leagueId];
  if (!schedule) return null;
  for (let r = 1; r <= schedule.totalRounds; r++) {
    if (!isRoundComplete(schedule, r)) return r;
  }
  return null;
}

/**
 * Avança uma semana de jogo em TODAS as divisões: simula a próxima jornada de
 * cada liga, aplica fadiga, treina os plantéis, processa finanças, recupera
 * lesões e atualiza a confiança da direção.
 */
/**
 * NOTA DE ARQUITETURA: o bloqueio por decisões pendentes (propostas/pedidos)
 * é uma regra de INTERFACE, não de simulação — vive na store, que consulta
 * `blockingReason()`. Se vivesse aqui, partiria toda a simulação automática
 * (testes, épocas simuladas, IA).
 */
export function advanceWeek(
  state: GameState,
  focus: TrainingFocus = TrainingFocus.TECHNICAL,
): WeekResult {
  const mLeagueId = managedLeagueId(state);
  const managedId = state.meta.managedClubId;
  // Equipa técnica: cria a inicial se ainda não existir (saves antigos / clube
  // novo) e repõe a despesa semanal antes de as finanças correrem.
  ensureStaff(state);
  applyStaffCost(state);
  let managedFixtures: Fixture[] = [];
  let managedRound = 0;
  /** Jornada de liga a MOSTRAR: numa semana europeia a liga não avança, mas o
   *  balanço e as notícias continuam a precisar de um número coerente. */
  let displayRound = 0;
  const allPlayed: Fixture[] = [];
  const homeClubsThisWeek = new Set<string>();
  /** Quem recebeu um DÉRBI em casa esta semana — bilheteira cheia e mais cara. */
  const derbyHomeThisWeek = new Set<string>();
  const playedClubs = new Set<string>();

  // Dados recolhidos ao longo da semana para o relatório final.
  const notes: WeekNote[] = [];
  let managedGate = { attendance: 0, revenue: 0 };
  /** Quanto o clube gerido não conseguiu pagar esta semana (0 = fechou as contas). */
  let managedShortfall = 0;
  // Overall antes do treino, para detetar quem evoluiu esta semana.
  //
  // Guarda-se o valor JÁ NA ESCALA DO ECRÃ (0-100). Antes guardava-se o inteiro
  // interno e a notícia fazia `inteiro * 5`, ou seja arredondava duas vezes: um
  // jogador em 19.6 era anunciado como "atingiu 100" quando a ficha dele dizia
  // 98, e o utilizador ia lá ver e não tinha subido nada.
  const overallBefore = new Map<string, number>();
  for (const id of state.clubs[managedId]?.squad ?? []) {
    const p = state.players[id];
    if (p) overallBefore.set(id, displayOverall(p));
  }

  // 0-pré. A IA escolhe o melhor onze COM ENERGIA para esta jornada — a rotação
  //        que o utilizador faz manualmente. Antes das suspensões, que mexem no
  //        onze já escolhido.
  refreshAiLineups(state);

  // 0. Suspensões: quem está suspenso falha ESTA jornada. Entra o MELHOR suplente
  //    apto na posição — mas a troca é TRANSITÓRIA: o titular volta ao seu lugar no
  //    fim da semana (senão ficava fora para sempre, mesmo após cumprir o castigo).
  //    Aplica-se a todos os clubes (a IA também cumpre castigos).
  const suspensionSwaps: Array<{ slot: LineupSlot; original: string }> = [];
  for (const club of Object.values(state.clubs)) {
    if (club.european) continue; // clube europeu temporário — não entra na época doméstica
    const tactic = state.tactics[club.id];
    for (const id of club.squad) {
      const p = state.players[id];
      if (!p || (p.condition.suspended ?? 0) <= 0) continue;
      if (tactic) {
        const slot = tactic.lineup.find((s) => s.playerId === id);
        if (slot) {
          const inLineup = new Set(tactic.lineup.map((s) => s.playerId));
          let bestSub: string | null = null;
          let bestScore = -1;
          for (const bid of club.squad) {
            const b = state.players[bid];
            if (!b || inLineup.has(bid) || b.condition.status !== 'AVAILABLE' || (b.condition.suspended ?? 0) > 0) continue;
            const score = effectiveOverallFine(b, slot.position) * (0.65 + 0.35 * (b.condition.fitness / 100));
            if (score > bestScore) { bestScore = score; bestSub = bid; }
          }
          if (bestSub) { suspensionSwaps.push({ slot, original: id }); slot.playerId = bestSub; }
        }
      }
      p.condition.suspended = (p.condition.suspended ?? 0) - 1;
    }
  }

  // SEMANA EUROPEIA? A campanha europeia tem semana PRÓPRIA: numa semana de
  // Europa não se joga a liga (nem a Taça). Antes acumulava-se tudo na mesma
  // semana e o utilizador levava com dois jogos seguidos ao carregar uma vez em
  // "iniciar partida" — e o calendário lia-se como uma salada.
  const leagueRoundsPlayed = (nextRound(state, mLeagueId) ?? (state.schedules[mLeagueId]?.totalRounds ?? 0) + 1) - 1;
  const euroWeek = isEuroWeek(state);
  displayRound = leagueRoundsPlayed;

  // 1. Simular a próxima jornada de cada divisão (exceto em semana europeia).
  for (const league of euroWeek ? [] : Object.values(state.leagues)) {
    const schedule = state.schedules[league.id];
    const table = state.standings[league.id];
    if (!schedule || !table) continue;

    const round = nextRound(state, league.id);
    if (round === null) continue;

    const played = playRound(schedule, round, table, {
      players: state.players,
      tactics: state.tactics,
      baseSeed: state.meta.rngSeed,
      isDerby: (h, a) => isDerby(state, h, a),
      // Só o clube gerido tem bancada simulada — os outros jogam com o apoio
      // neutro de sempre, que é exatamente o comportamento anterior.
      homeSupport: (h) => (h === managedId ? homeSupport(fanMood(state)) : undefined),
    });

    for (const fx of played) {
      allPlayed.push(fx);
      homeClubsThisWeek.add(fx.homeClubId);
      if (isDerby(state, fx.homeClubId, fx.awayClubId)) derbyHomeThisWeek.add(fx.homeClubId);
      playedClubs.add(fx.homeClubId);
      playedClubs.add(fx.awayClubId);
    }
    if (league.id === mLeagueId) {
      managedFixtures = played;
      managedRound = round;
      displayRound = round;
    }
  }

  // 1a. Ligas de FUNDO (resto do mundo) — uma ronda barata por semana.
  if (state.background) simulateBgWeek(state.background, state.meta.rngSeed, state.meta.season);

  // 1b. Taça — eliminatórias distribuídas uniformemente pela época
  // (intervalo dinâmico: garante que todas cabem antes da última jornada).
  const mSchedule = state.schedules[mLeagueId];
  const cupInterval = mSchedule
    ? Math.max(2, Math.min(CUP_EVERY_LEAGUE_ROUNDS,
        Math.floor(mSchedule.totalRounds / (state.cup.totalRounds + 1))))
    : CUP_EVERY_LEAGUE_ROUNDS;
  let cupFixtures: Fixture[] = [];
  if (
    !euroWeek &&
    managedRound > 0 &&
    managedRound % cupInterval === 0 &&
    state.cup.season === state.meta.season &&
    !state.cup.winnerClubId
  ) {
    cupFixtures = playCupRound(state);
    for (const fx of cupFixtures) {
      allPlayed.push(fx);
      playedClubs.add(fx.homeClubId);
      playedClubs.add(fx.awayClubId);
    }
  }

  // 1b-bis. Provas EUROPEIAS — uma jornada europeia à cadência definida. Os jogos
  // do clube gerido são a motor completo (jogáveis); os outros são placar barato.
  let euroFixtures: Fixture[] = [];
  if (euroWeek && state.europe) {
    for (const ef of advanceEuropeMatchday(state)) {
      const fx = euroToFixture(ef);
      allPlayed.push(fx);
      playedClubs.add(fx.homeClubId);
      playedClubs.add(fx.awayClubId);
      euroFixtures.push(fx);
      const r = ef.result;
      if (r) {
        const isHome = fx.homeClubId === managedId;
        const mine = isHome ? r.home.goals : r.away.goals;
        const theirs = isHome ? r.away.goals : r.home.goals;
        const opp = state.clubs[isHome ? fx.awayClubId : fx.homeClubId]?.name ?? '';
        addNews(state, 'EURO', 'euro.news.result', { opp, score: `${mine}-${theirs}` });
      }
    }
  }

  // 1c. Lesões saídas dos jogos: tornam-se reais (dias de paragem) + notícia.
  for (const fx of allPlayed) {
    if (!fx.result) continue;
    for (const ev of fx.result.events) {
      if (ev.type !== 'INJURY' || !ev.playerId) continue;
      const p = state.players[ev.playerId];
      if (!p || p.condition.status === 'INJURED') continue;
      const rng = new Rng(deriveSeed(state.meta.rngSeed, 'injury', fx.id, ev.playerId));
      p.condition.status = 'INJURED';
      p.condition.injuryDaysRemaining = rng.int(7, 28);
      if (p.clubId === managedId) {
        // Em DIAS a informação era inútil: "17 dias" com um departamento médico
        // bom são 2 jornadas, com um mau são 3 — e o utilizador só conta jogos.
        // Mostra-se as duas coisas, com as jornadas calculadas pela instalação.
        const club = state.clubs[managedId];
        const perWeek = 7 + ((club?.facilities.medical ?? 1) - 1) * 2;
        const rounds = Math.max(1, Math.ceil(p.condition.injuryDaysRemaining / perWeek));
        const params = { player: `${p.firstName} ${p.lastName}`, days: p.condition.injuryDaysRemaining, rounds };
        addNews(state, 'INJURY', 'news.injury', params);
        notes.push({
          kind: 'INJURY',
          key: 'note.injury',
          params: { player: p.lastName, days: p.condition.injuryDaysRemaining, rounds },
        });
      }
    }
  }

  // 1c-bis. Totalizadores da época: golos e assistências por jogador (todas as
  // divisões + Taça). Alimenta futuras listas de melhores marcadores.
  for (const fx of allPlayed) {
    const ps = fx.result?.playerStats;
    if (!ps) continue;
    for (const pid in ps) {
      const p = state.players[pid];
      if (!p) continue;
      const s = ps[pid]!;
      if (s.goals) p.condition.seasonGoals = (p.condition.seasonGoals ?? 0) + s.goals;
      if (s.assists) p.condition.seasonAssists = (p.condition.seasonAssists ?? 0) + s.assists;
      if (s.rating) { // média de notas da época (onze da época)
        p.condition.seasonRating = (p.condition.seasonRating ?? 0) + s.rating;
        p.condition.seasonApps = (p.condition.seasonApps ?? 0) + 1;
      }
    }
  }

  // 1c-quater. DISCIPLINA — amarelos que atravessam jogos. O vermelho já valia
  // um jogo de castigo; a acumulação (5 amarelos) não existia, e por isso não
  // havia nenhuma decisão a tomar sobre quem entra num jogo áspero. Aplica-se a
  // todos os clubes, e só o clube gerido é avisado.
  {
    const disc = applyCards(state, allPlayed);
    for (const ban of disc.bans) {
      if (ban.clubId !== managedId) continue;
      const p = state.players[ban.playerId];
      if (!p) continue;
      const params = { player: `${p.firstName} ${p.lastName}`, games: ban.games };
      const key = ban.reason === 'RED' ? 'news.ban.red' : 'news.ban.yellows';
      addNews(state, 'CLUB', key, params);
      notes.push({
        kind: 'INFO',
        key: ban.reason === 'RED' ? 'note.ban.red' : 'note.ban.yellows',
        params: { player: p.lastName, games: ban.games },
      });
    }
    for (const w of disc.warnings) {
      if (w.clubId !== managedId) continue;
      const p = state.players[w.playerId];
      if (!p) continue;
      addNews(state, 'CLUB', 'news.yellowRisk', { player: `${p.firstName} ${p.lastName}`, yellows: w.yellows });
      notes.push({ kind: 'INFO', key: 'note.yellowRisk', params: { player: p.lastName, yellows: w.yellows } });
    }
  }

  // 1c-ter. PRÉMIOS DE CONTRATO (por jogo e por golo). É aqui que a parte
  // variável do salário se paga: sai barata quando o jogador é suplente e cara
  // quando decide jogos — exatamente o risco que se aceitou ao negociar.
  let bonusPaid = 0;
  for (const fx of allPlayed) {
    const ps = fx.result?.playerStats;
    if (!ps) continue;
    for (const pid in ps) {
      const p = state.players[pid];
      if (!p?.clauses || !p.clubId) continue;
      const due = bonusesDue(p.clauses, ps[pid]!.goals, true);
      if (due <= 0) continue;
      const fin = state.finances[p.clubId];
      if (!fin) continue;
      moveMoney(fin, -due);
      if (p.clubId === managedId) bonusPaid += due;
    }
  }
  if (bonusPaid > 0) {
    notes.push({ kind: 'FINANCE', key: 'note.bonusPaid', params: { v: bonusPaid.toLocaleString('pt-PT') } });
  }

  // 1d. Notícia com o resultado do clube gerido.
  const myFx = managedFixtures.find((f) => f.homeClubId === managedId || f.awayClubId === managedId);
  if (myFx?.result) {
    const r = myFx.result;
    const isHome = myFx.homeClubId === managedId;
    const mine = isHome ? r.home.goals : r.away.goals;
    const theirs = isHome ? r.away.goals : r.home.goals;
    const opp = state.clubs[isHome ? myFx.awayClubId : myFx.homeClubId]?.name ?? '';
    const key = mine > theirs ? 'news.match.win' : mine === theirs ? 'news.match.draw' : 'news.match.loss';
    addNews(state, 'MATCH', key, {
      club: state.clubs[managedId]?.shortName ?? '', opp, score: `${mine}-${theirs}`, round: displayRound,
    });
    // O dérbi tem manchete própria: não é o mesmo que ganhar a qualquer um.
    if (isDerby(state, myFx.homeClubId, myFx.awayClubId)) {
      const derbyKey = mine > theirs ? 'news.derby.win' : mine === theirs ? 'news.derby.draw' : 'news.derby.loss';
      addNews(state, 'MATCH', derbyKey, { opp, score: `${mine}-${theirs}` });
    }
  }

  // 2. Fadiga dos titulares que jogaram (pressing alto cansa mais).
  for (const clubId of playedClubs) {
    const tactic = state.tactics[clubId];
    if (!tactic) continue;
    const fatigue = matchFatigue(tactic);
    for (const slot of tactic.lineup) {
      const p = state.players[slot.playerId];
      if (p) p.condition.fitness = Math.max(0, p.condition.fitness - fatigue);
    }
  }

  // 2b. Moral dinâmica: quem jogou reage ao resultado; quem ficou de fora
  // deriva para o neutro (50). A moral alimenta a força da equipa, por isso
  // séries de derrotas custam caro — e geram pedidos dos jogadores.
  const clampMorale = (v: number) => Math.max(10, Math.min(95, v));
  const lineupPlayedIds = new Set<string>();
  for (const fx of allPlayed) {
    if (!fx.result) continue;
    const hg = fx.result.home.goals;
    const ag = fx.result.away.goals;
    // Num dérbi a moral mexe-se muito mais: ganhar ao vizinho segura um balneário
    // uma época inteira, e perder estraga-a.
    const derby = isDerby(state, fx.homeClubId, fx.awayClubId);
    const scale = derby ? 2.2 : 1;
    const deltaFor = (mine: number, theirs: number) =>
      Math.round((mine > theirs ? 3 : mine < theirs ? -4 : -1) * scale);
    for (const [clubId, delta] of [
      [fx.homeClubId, deltaFor(hg, ag)],
      [fx.awayClubId, deltaFor(ag, hg)],
    ] as const) {
      const tactic = state.tactics[clubId];
      if (!tactic) continue;
      for (const slot of tactic.lineup) {
        const p = state.players[slot.playerId];
        if (!p) continue;
        lineupPlayedIds.add(p.id);
        p.condition.morale = clampMorale(p.condition.morale + delta);
      }
    }
  }
  for (const club of Object.values(state.clubs)) {
    if (club.european) continue;
    for (const id of club.squad) {
      if (lineupPlayedIds.has(id)) continue;
      const p = state.players[id];
      if (!p) continue;
      // Deriva para o neutro, mais depressa quanto mais longe estiver: a ±1 por
      // semana um jogador que caísse aos 10 levava quase uma época a recuperar,
      // e ficava preso a pedir aumento/saída sem fim (queixa do playtest).
      const gap = 50 - p.condition.morale;
      p.condition.morale += Math.sign(gap) * (1 + Math.floor(Math.abs(gap) / 20));
    }
  }

  // Desfaz as trocas por suspensão: o titular volta ao SEU lugar (já cumpriu o
  // jogo de castigo desta jornada). Sem isto, o suplente ficava titular para
  // sempre e o utilizador via "os mais fracos a jogar" sem ter mexido em nada.
  for (const { slot, original } of suspensionSwaps) slot.playerId = original;

  // 3. Finanças semanais de todos os clubes.
  //    Bilheteira depende da FORMA recente; manutenção escala com instalações;
  //    saldo negativo traz sanções (reputação e venda forçada).
  for (const club of Object.values(state.clubs)) {
    const fin = state.finances[club.id];
    if (!fin) continue;

    recalcUpkeep(club, fin); // instalações maiores = manutenção maior

    const gate = homeClubsThisWeek.has(club.id)
      ? matchdayGate(
          club, recentFormOf(state, club.id, 5), derbyHomeThisWeek.has(club.id),
          // O humor da bancada enche ou esvazia o estádio — mas só há bancada
          // simulada no clube gerido; nos outros o fator fica em 1.
          club.id === managedId ? attendanceFactor(fanMood(state)) : 1,
        )
      : { attendance: 0, revenue: 0 };
    if (club.id === managedId) managedGate = gate;
    fin.income.tickets = gate.revenue;
    // O saldo NUNCA fica negativo: o que não deu para pagar volta como buraco.
    const shortfall = applyWeeklyFinances(fin, gate.revenue);
    if (club.id === managedId) managedShortfall = shortfall;

    const sanction = applyInsolvency(state, club.id, shortfall);
    if (shortfall <= 0 && cashWarning(fin) && club.id === managedId) {
      // AVISO ANTES DO PROBLEMA: o clube ainda pagou esta semana, mas a caixa
      // dá para menos de 3 semanas. É aqui que dá para cortar salários ou
      // vender por vontade própria, antes de chegar ao dilema.
      addNews(state, 'CLUB', 'news.insolvency.blocked');
      notes.push({
        kind: 'FINANCE', key: 'note.insolvency.warning',
        params: {
          balance: Math.round(fin.balance).toLocaleString('pt-PT'),
          margin: Math.abs(Math.round(weeklyNet(fin))).toLocaleString('pt-PT'),
        },
      });
    } else if (sanction.soldPlayerName && club.id === managedId) {
      addNews(state, 'CLUB', 'news.insolvency.sold',
        { player: sanction.soldPlayerName, amount: sanction.amount.toLocaleString('pt-PT') });
      // A bancada não distingue "a direção vendeu" de "o treinador vendeu" —
      // vê o jogador a sair. Sem isto, a venda mais dolorosa do jogo (a que se
      // sofre sem escolher) era a única que passava em silêncio.
      const sold = sanction.soldPlayerId ? state.players[sanction.soldPlayerId] : undefined;
      if (sold) fansOnDeparture(state, sold, squadShare(state, naturalOverall(sold)));
    }
  }

  // 3-bis. CRISE FINANCEIRA do clube gerido: a semana não fechou, abre o dilema
  // no inbox (bloqueia o avanço até o treinador escolher quem sai).
  // A direção já não despacha o melhor jogador por sua conta.
  const crisis = ensureFinancialCrisis(state, managedShortfall);
  if (crisis) {
    addNews(state, 'CLUB', 'news.crisis.open', { debt: crisis.debt.toLocaleString('pt-PT') });
    notes.push({
      kind: 'FINANCE', key: 'note.crisis.open',
      params: { debt: crisis.debt.toLocaleString('pt-PT') },
    });
  }

  // 4. Treino de todos os plantéis (determinístico por semana+jogador).
  //
  // Três camadas somam-se: o CENTRO DE TREINO (instalação), a EQUIPA TÉCNICA
  // (pessoas — só o clube gerido tem staff nomeado) e o PLANO INDIVIDUAL do
  // jogador, se o treinador lhe deu um. O plano individual sobrepõe-se ao foco
  // da equipa e traz atenção extra, mas fecha a evolução naquela área só.
  const weekKey = state.meta.currentDate;
  const staff = state.career.staff ?? [];
  const staffFitness = fitnessBonus(staff);
  for (const club of Object.values(state.clubs)) {
    if (club.european) continue; // clubes europeus temporários não treinam
    const isManaged = club.id === state.meta.managedClubId;
    const clubFocus = isManaged ? focus : rotateFocus(club.id, weekKey);
    const facilityBonus = (club.facilities.training - 1) * 0.03;
    for (const id of club.squad) {
      const p = state.players[id];
      if (!p) continue;
      const rng = new Rng(deriveSeed(state.meta.rngSeed, 'train', weekKey, id));
      const own = isManaged ? individualFocus(p) : null;
      const coaching = isManaged
        ? trainingBonus(staff, p.positions[0] === 'GK') + (own ? INDIVIDUAL_GROWTH_BONUS : 0)
        : 0;
      trainPlayer(
        p,
        own ?? clubFocus,
        rng,
        facilityBonus + coaching,
        isManaged ? staffFitness : 0,
      );
    }
  }

  // 4a-bis. Reconversões de posição: mais uma semana de trabalho.
  for (const done of tickRetraining(state)) {
    if (state.players[done.playerId]?.clubId !== managedId) continue;
    addNews(state, 'CLUB', 'news.retrained', { player: done.playerName, pos: done.position });
    notes.push({ kind: 'GROWTH', key: 'note.retrained', params: { player: done.playerName, pos: done.position } });
  }

  // 4a-ter. PROMESSAS aos jogadores: cobra as que venceram (e fecha as que já
  // foram cumpridas). Falhar custa muito mais moral do que cumprir dá — senão
  // prometer a toda a gente todas as semanas era moral de graça.
  for (const v of tickPromises(state)) {
    const key = v.kept ? 'news.promise.kept' : 'news.promise.broken';
    addNews(state, 'CLUB', key, { player: v.playerName });
    notes.push({
      kind: v.kept ? 'GROWTH' : 'INFO',
      key: v.kept ? 'note.promise.kept' : 'note.promise.broken',
      params: { player: v.playerName },
    });
  }

  // 4b. Quem subiu de overall esta semana — a recompensa visível do treino.
  for (const [id, before] of overallBefore) {
    const p = state.players[id];
    if (!p) continue;
    const after = displayOverall(p);
    // Cresceu → vale mais. O `marketValue` é um campo GRAVADO; sem o reavaliar
    // aqui, um jovem que evoluísse continuava com o preço de quando entrou.
    if (after !== before) p.marketValue = computeMarketValue(p, state.meta.season);
    // Só se anuncia o que o utilizador CONSEGUE ver na ficha — o número aqui é
    // exatamente o que o ecrã do jogador vai mostrar.
    if (after > before) {
      notes.push({ kind: 'GROWTH', key: 'note.growth', params: { player: p.lastName, ovr: after } });
    }
  }

  // 5. Recuperação de lesões — o departamento médico encurta o tempo, e o
  // fisioterapeuta do clube gerido encurta-o outra vez por cima disso.
  const physioSpeedup = 1 / Math.max(0.5, injuryDurationFactor(staff));
  for (const club of Object.values(state.clubs)) {
    if (club.european) continue;
    const base = 7 + (club.facilities.medical - 1) * 2;
    const recoveryPerWeek = club.id === managedId ? Math.round(base * physioSpeedup) : base;
    for (const id of club.squad) {
      const p = state.players[id];
      if (!p || p.condition.injuryDaysRemaining <= 0) continue;
      p.condition.injuryDaysRemaining = Math.max(0, p.condition.injuryDaysRemaining - recoveryPerWeek);
      if (p.condition.injuryDaysRemaining === 0 && p.condition.status === 'INJURED') {
        p.condition.status = 'AVAILABLE';
      }
    }
  }

  // 6. Confiança da direção (posição atual vs objetivo).
  const mLeague = state.leagues[mLeagueId]!;
  const position = currentPosition(state, mLeagueId, state.meta.managedClubId);
  let confidence = updateConfidence(state.career, position, mLeague.clubIds.length);

  // 6b. ADEPTOS — a bancada reage ao que viu. Corre DEPOIS da confiança porque
  // a contestação prolongada também morde a paciência da direção: quando o
  // estádio vira, a direção deixa de ter onde se esconder.
  //
  // A reação é por JOGO (liga, taça e Europa contam), não por semana: uma
  // eliminação na taça não pode passar em silêncio só porque a liga parou.
  ensureFans(state);
  let fanWeek: ReturnType<typeof updateFansWeek> | null = null;
  {
    const myClub = state.clubs[managedId];
    const myMatches = allPlayed.filter(
      (f) => f.result && (f.homeClubId === managedId || f.awayClubId === managedId),
    );
    const expectedPosition = objectiveTarget(state.career.objective, mLeague.clubIds.length);

    // Sem jogo nenhum a semana ainda conta (classificação + esquecimento), por
    // isso chama-se pelo menos uma vez.
    const inputs = myMatches.length > 0 ? myMatches : [null];
    for (const fx of inputs) {
      let match: FanMatchInput | undefined;
      if (fx?.result && myClub) {
        const isHome = fx.homeClubId === managedId;
        const oppId = isHome ? fx.awayClubId : fx.homeClubId;
        const opp = state.clubs[oppId];
        match = {
          goalsFor: isHome ? fx.result.home.goals : fx.result.away.goals,
          goalsAgainst: isHome ? fx.result.away.goals : fx.result.home.goals,
          myReputation: myClub.reputation,
          oppReputation: opp?.reputation ?? 50,
          derby: isDerby(state, fx.homeClubId, fx.awayClubId),
          oppName: opp?.shortName ?? '',
        };
      }
      fanWeek = updateFansWeek(state, {
        match,
        position,
        clubCount: mLeague.clubIds.length,
        expectedPosition,
      });
    }

    // O ambiente passa ao balneário: casa cheia levanta, casa vazia afunda.
    const moraleDelta = moraleFromFans(fanWeek!.mood);
    if (moraleDelta !== 0) {
      for (const id of myClub?.squad ?? []) {
        const p = state.players[id];
        if (p) p.condition.morale = Math.max(10, Math.min(95, p.condition.morale + moraleDelta));
      }
    }

    if (fanWeek!.unrest) {
      confidence = Math.max(0, state.career.confidence - UNREST_CONFIDENCE_HIT);
      state.career.confidence = confidence;
      addNews(state, 'CLUB', 'news.fans.unrest', { mood: fanWeek!.mood });
      notes.push({ kind: 'INFO', key: 'note.fans.unrest', params: { mood: fanWeek!.mood } });
    } else if (fanWeek!.delta <= -6) {
      notes.push({ kind: 'INFO', key: 'note.fans.down', params: { mood: fanWeek!.mood, delta: fanWeek!.delta } });
    } else if (fanWeek!.delta >= 6) {
      notes.push({ kind: 'INFO', key: 'note.fans.up', params: { mood: fanWeek!.mood, delta: `+${fanWeek!.delta}` } });
    }

    // BRAVATA: se prometeste alguma coisa à imprensa, o jogo desta jornada
    // cobra-a. Ganhar paga com juros; empatar já é não cumprir.
    if (myMatches.length > 0) {
      const decisive = myMatches[myMatches.length - 1]!;
      const isHome = decisive.homeClubId === managedId;
      const mine = isHome ? decisive.result!.home.goals : decisive.result!.away.goals;
      const theirs = isHome ? decisive.result!.away.goals : decisive.result!.home.goals;
      const outcome = resolveClaim(state, mine > theirs);
      if (outcome) {
        confidence = state.career.confidence;
        const key = outcome.delivered ? 'news.press.claimKept' : 'news.press.claimBroken';
        addNews(state, 'CLUB', key);
        notes.push({ kind: 'INFO', key: outcome.delivered ? 'note.press.kept' : 'note.press.broken' });
      }
    }
  }

  // 7. Mercado: caducar propostas antigas e gerar novas pelos nossos jogadores.
  //    A IA só compra com a JANELA ABERTA — simétrico ao jogador, que também só
  //    negoceia dentro da janela (antes a IA comprava sempre, o que era injusto).
  pruneInbox(state);
  const mSched = state.schedules[mLeagueId];
  const mRound = nextRound(state, mLeagueId) ?? ((mSched?.totalRounds ?? 30) + 1);
  const windowOpen = transferWindow(mRound, mSched?.totalRounds ?? 30).open;
  const bidRng = new Rng(deriveSeed(state.meta.rngSeed, 'bids', weekKey));
  // Cláusulas de rescisão baratas: quem paga leva, sem passar pelo inbox.
  const clauseSales = windowOpen ? triggerReleaseClauses(state, bidRng) : [];
  for (const s of clauseSales) {
    addNews(state, 'TRANSFER', 'news.clausePaid', {
      buyer: s.buyerName, player: s.playerName, fee: s.fee.toLocaleString('pt-PT'),
    });
    notes.push({
      kind: 'TRANSFER', key: 'note.clausePaid',
      params: { player: s.playerName, buyer: s.buyerName, fee: s.fee.toLocaleString('pt-PT') },
    });
  }
  const newBids = windowOpen ? generateIncomingBids(state, bidRng) : [];
  for (const b of newBids) {
    const p = state.players[b.playerId];
    const buyer = state.clubs[b.fromClubId];
    if (p && buyer) {
      addNews(state, 'TRANSFER', 'news.bid', { buyer: buyer.name, fee: b.fee.toLocaleString('pt-PT'), player: `${p.firstName} ${p.lastName}` });
    }
  }

  // 7a. Olheiros: avança as missões; relatórios prontos geram notícia.
  const reports = tickScouting(state);
  for (const r of reports) {
    if (r.kind === 'PLAYER') {
      const p = state.players[r.playerIds[0]!];
      if (p) addNews(state, 'CLUB', 'news.scout.player', { player: `${p.firstName} ${p.lastName}` });
    } else if (r.playerIds.length > 0) {
      addNews(state, 'CLUB', 'news.scout.league', { n: r.playerIds.length, league: state.leagues[r.leagueId ?? '']?.name ?? '' });
    }
  }

  // 7b. Avisos de renovação — uma vez por época, no arranque (jornada 3).
  if (managedRound === 3) {
    const reminders = generateRenewalReminders(state);
    for (const r of reminders) {
      const p = state.players[r.playerId];
      if (p) addNews(state, 'CLUB', 'news.renewal.expiring', { player: `${p.firstName} ${p.lastName}` });
    }
    // Aviso ANTECIPADO (uma época antes): contratos que terminam na PRÓXIMA época.
    // Dá tempo de renovar com calma e evita que o jogador "desapareça" de surpresa.
    for (const id of state.clubs[managedId]?.squad ?? []) {
      const p = state.players[id];
      if (p && p.contractUntil === state.meta.season + 1) {
        addNews(state, 'CLUB', 'news.renewal.nextSeason', { player: `${p.firstName} ${p.lastName}` });
      }
      // Aviso de REFORMA próxima: aos 36+ o jogador reforma-se muito provavelmente
      // no fim da época (aos 37 é garantido). Dá tempo de arranjar substituto.
      if (p && p.age >= 36) {
        addNews(state, 'CLUB', 'news.retiring.soon', { player: `${p.firstName} ${p.lastName}`, age: p.age });
      }
    }
  }

  // 7b-meio. Reforço a MEIO da época para quem ainda não renovou (≈6 meses antes).
  const midRound = mSchedule ? Math.floor(mSchedule.totalRounds / 2) : 0;
  if (midRound > 3 && managedRound === midRound) {
    for (const id of state.clubs[managedId]?.squad ?? []) {
      const p = state.players[id];
      if (p && p.contractUntil === state.meta.season) {
        addNews(state, 'CLUB', 'news.renewal.urgent', { player: `${p.firstName} ${p.lastName}` });
      }
    }
  }

  // 7b-bis. Lei Bosman: ao entrar nas últimas 6 jornadas, clubes sondam os
  // nossos jogadores em fim de contrato. Dispara UMA vez (exatamente 6 a faltar)
  // e avisa com antecedência — renovar ou vender antes de os perder de graça.
  if (roundsRemaining(state) === BOSMAN_WINDOW_ROUNDS) {
    for (const ap of runBosmanApproaches(state)) {
      const p = state.players[ap.playerId];
      const suitor = state.clubs[ap.suitorClubId];
      if (p && suitor) {
        addNews(state, 'TRANSFER', 'news.bosman', { suitor: suitor.name, player: `${p.firstName} ${p.lastName}` });
      }
    }
  }

  // 7c. Pedidos de jogadores insatisfeitos (moral baixa).
  const reqRng = new Rng(deriveSeed(state.meta.rngSeed, 'requests', weekKey));
  const newRequests = generatePlayerRequests(state, reqRng);
  for (const r of newRequests) {
    const p = state.players[r.playerId];
    if (p) {
      addNews(state, 'CLUB', r.request === 'WAGE_RISE' ? 'news.request.wage' : 'news.request.leave',
        { player: `${p.firstName} ${p.lastName}` });
    }
  }

  // 7d. SEMANA DE DÉRBI — a imprensa avisa antes, que é o que faz a semana
  // valer. Anuncia-se depois de a jornada estar jogada, quando o jogo seguinte
  // já é conhecido; o clube tem a semana toda para preparar o onze.
  {
    const nextLeagueRound = nextRound(state, mLeagueId);
    const nextFx = nextLeagueRound === null ? undefined : state.schedules[mLeagueId]?.fixtures.find(
      (f) => f.round === nextLeagueRound && (f.homeClubId === managedId || f.awayClubId === managedId),
    );
    if (nextFx && isDerby(state, nextFx.homeClubId, nextFx.awayClubId)) {
      const oppId = nextFx.homeClubId === managedId ? nextFx.awayClubId : nextFx.homeClubId;
      const opp = state.clubs[oppId];
      if (opp) {
        addNews(state, 'MATCH', 'news.derby.week', { opp: opp.name, round: nextLeagueRound! });
        notes.push({ kind: 'INFO', key: 'note.derby', params: { opp: opp.shortName } });
      }
    }
  }

  // 7e. IMPRENSA — a conferência da jornada. Fica na caixa de entrada, NÃO
  // bloqueia o avanço (é uma oportunidade, não um imposto) e caduca ao fim de
  // uma semana. Calar-se custa: os adeptos leem o silêncio como fuga.
  {
    expirePress(state);
    const nextLeagueRound = nextRound(state, mLeagueId);
    const nextFx = nextLeagueRound === null ? undefined : state.schedules[mLeagueId]?.fixtures.find(
      (f) => f.round === nextLeagueRound && (f.homeClubId === managedId || f.awayClubId === managedId),
    );
    const nextOppId = nextFx ? (nextFx.homeClubId === managedId ? nextFx.awayClubId : nextFx.homeClubId) : '';
    const myLast = allPlayed.find((f) => f.result && (f.homeClubId === managedId || f.awayClubId === managedId));
    let lastMargin = 0;
    if (myLast?.result) {
      const isHome = myLast.homeClubId === managedId;
      lastMargin = (isHome ? myLast.result.home.goals : myLast.result.away.goals)
        - (isHome ? myLast.result.away.goals : myLast.result.home.goals);
    }
    const topBid = state.inbox.find((it) => it.kind === 'BID');
    const bidPlayer = topBid?.kind === 'BID' ? state.players[topBid.playerId] : undefined;
    const totalRounds = mSchedule?.totalRounds ?? 34;

    const conf = generatePressConference(state, {
      form: recentFormOf(state, managedId, 3),
      nextIsDerby: !!nextFx && isDerby(state, nextFx.homeClubId, nextFx.awayClubId),
      nextOpponent: state.clubs[nextOppId]?.shortName ?? '',
      lastMargin,
      fanMood: fanMood(state),
      unrest: fanWeek?.unrest === true,
      position,
      clubCount: mLeague.clubIds.length,
      seasonProgress: totalRounds > 0 ? displayRound / totalRounds : 0,
      bidTarget: bidPlayer
        ? { playerId: bidPlayer.id, playerName: `${bidPlayer.firstName} ${bidPlayer.lastName}` }
        : undefined,
    }, displayRound);
    if (conf) notes.push({ kind: 'INFO', key: 'note.press.open' });
  }

  // 8. Avançar a data uma semana.
  state.meta.currentDate = addDays(state.meta.currentDate, 7);
  state.meta.updatedAt = new Date().toISOString();

  // 8b. Respostas às NOSSAS propostas — chegam agora que a data avançou.
  //     É por isto que negociar exige simular: a resposta vive no futuro.
  for (const offer of resolveDueOffers(state)) {
    const p = state.players[offer.playerId];
    if (!p) continue;
    const name = `${p.firstName} ${p.lastName}`;
    if (offer.status === 'ACCEPTED') {
      addNews(state, 'TRANSFER', 'news.offer.signed', { player: name, club: state.clubs[managedId]?.name ?? '' });
      notes.push({ kind: 'TRANSFER', key: 'note.signed', params: { player: name } });
    } else if (offer.status === 'COUNTER') {
      notes.push({ kind: 'INFO', key: 'note.counter', params: { player: p.lastName } });
    } else {
      notes.push({ kind: 'INFO', key: 'note.rejected', params: { player: p.lastName } });
    }
  }
  pruneOffers(state);

  // 8-bis. Os clubes da IA também vasculham o mercado de livres. Sem isto o
  // pool era um bufete só para o utilizador: os melhores ficavam disponíveis
  // para sempre e compensava esperar até ao fim da época para os apanhar.
  aiSignFreeAgents(state, freeAgentRng(state));

  // 9. Balanço da semana do clube gerido.
  const mFin = state.finances[managedId];
  const report: WeekReport | null = mFin ? buildWeekReport({
    state, managedId, managedRound: displayRound, myFx, gate: managedGate, fin: mFin, notes,
  }) : null;

  // Melhoria de instalação GRÁTIS por vídeo: a cada 5 jornadas jogadas surge uma
  // nova disponibilidade (fica pendente até o jogador ver o vídeo). Não empilha.
  if (managedRound > 0 && !state.career.freeUpgradePending) {
    const rounds = (state.career.roundsSinceFreeUpgrade ?? 0) + 1;
    if (rounds >= 5) {
      state.career.freeUpgradePending = true;
      state.career.roundsSinceFreeUpgrade = 0;
    } else {
      state.career.roundsSinceFreeUpgrade = rounds;
    }
  }

  const seasonEnded = nextRound(state, mLeagueId) === null;
  const managedMatches: Fixture[] = [...euroFixtures]; // noite europeia primeiro
  if (myFx) managedMatches.push(myFx); // depois o jogo da liga
  return { round: displayRound, fixtures: managedFixtures, cupFixtures, seasonEnded, confidence, report, managedMatches };
}

/** Monta o relatório da jornada a partir do que foi recolhido durante a semana. */
function buildWeekReport(args: {
  state: GameState;
  managedId: string;
  managedRound: number;
  myFx: Fixture | undefined;
  gate: { attendance: number; revenue: number };
  fin: import('../models').Finance;
  notes: WeekNote[];
}): WeekReport {
  const { state, managedId, managedRound, myFx, gate, fin, notes } = args;

  const played = !!myFx?.result;
  const isHome = myFx?.homeClubId === managedId;
  const r = myFx?.result;
  const goalsFor = r ? (isHome ? r.home.goals : r.away.goals) : 0;
  const goalsAgainst = r ? (isHome ? r.away.goals : r.home.goals) : 0;
  const oppId = myFx ? (isHome ? myFx.awayClubId : myFx.homeClubId) : null;

  const otherIncome = fin.income.sponsorship + fin.income.tvRights + fin.income.merchandising;
  const net = gate.revenue + otherIncome
    - fin.expenses.wages - fin.expenses.facilities - fin.expenses.staff;

  return {
    round: managedRound,
    played,
    isHome,
    opponentName: oppId ? state.clubs[oppId]?.name ?? '' : '',
    goalsFor,
    goalsAgainst,
    attendance: gate.attendance,
    gate: gate.revenue,
    otherIncome,
    facilities: fin.expenses.facilities,
    wages: fin.expenses.wages,
    staff: fin.expenses.staff,
    net,
    balanceAfter: fin.balance,
    notes,
  };
}

/**
 * Últimos N resultados de um clube na sua liga ('W' | 'D' | 'L').
 * Usado pela bilheteira: uma boa série enche o estádio, uma má esvazia-o.
 */
export function recentFormOf(
  state: GameState,
  clubId: string,
  count = 5,
): ('W' | 'D' | 'L')[] {
  const leagueId = state.clubs[clubId]?.leagueId;
  const schedule = leagueId ? state.schedules[leagueId] : undefined;
  if (!schedule) return [];

  return schedule.fixtures
    .filter((f) => f.result && (f.homeClubId === clubId || f.awayClubId === clubId))
    .slice(-count)
    .map((f) => {
      const r = f.result!;
      const home = f.homeClubId === clubId;
      const mine = home ? r.home.goals : r.away.goals;
      const theirs = home ? r.away.goals : r.home.goals;
      return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
    });
}

/** Posição atual (1-indexada) de um clube na sua liga. */
export function currentPosition(state: GameState, leagueId: string, clubId: string): number {
  const table = state.standings[leagueId];
  if (!table) return 0;
  const sorted = sortStandings(table, (id) => state.clubs[id]?.name ?? id);
  return sorted.findIndex((r) => r.clubId === clubId) + 1;
}

/** Sumário do fim de época — alimenta a UI (verredito, movimentos, fornada). */
export interface SeasonSummary {
  record: SeasonRecord;
  fired: boolean;
  boardMessageKey: string; // chave i18n da mensagem da direção
  moves: TierMove[];
  youth: YouthIntakeResult;
  // Empréstimos RECEBIDOS que terminaram — a UI oferece a compra destes jogadores.
  returnedLoans: ReturnedLoan[];
}

/**
 * Transição para a nova época:
 *  1. Regista o historial e troféus do clube gerido.
 *  2. Avaliação da direção → possível despedimento com ofertas de emprego.
 *  3. Promoções/despromoções entre divisões.
 *  4. Envelhecimento, contratos, reformas + fornada de jovens, orçamentos.
 *  5. Novos calendários/tabelas e novo objetivo.
 */
export function rolloverSeason(state: GameState): SeasonSummary {
  // Época nova, caixa limpa — propostas/avisos/pedidos da época anterior caducam.
  state.inbox = [];

  // Fecha a Taça se ainda houver eliminatórias por jogar (jogam-se "no fim da época").
  let cupGuard = 0;
  while (state.cup.season === state.meta.season && !state.cup.winnerClubId && cupGuard++ < 12) {
    if (playCupRound(state).length === 0 && state.cup.alive.length < 2) break;
  }

  // Fecha a campanha EUROPEIA pendente (joga o que falta → campeões + prémios),
  // captura a qualificação da PRÓXIMA época (standings/Taça ainda finais) e remove
  // os clubes europeus temporários ANTES de envelhecer os jogadores.
  let euroGuard = 0;
  while (state.europe && europeInProgress(state.europe) && euroGuard++ < 90) advanceEuropeMatchday(state);
  const finishedEurope = state.europe;
  // Coeficiente-país tipo-UEFA: evolui com o desempenho europeu da época que acaba
  // (1ª campanha = base) e passa a decidir as vagas da época seguinte.
  const euroCoeffs = evolveCoefficients(finishedEurope?.coefficients, finishedEurope?.competitions);
  const euroQualify = state.background ? qualifyNextSeason(state, coefficientRanking(euroCoeffs)) : null;

  // MEMÓRIA DO MUNDO — tem de ser aqui, no único instante em que tudo ainda é
  // verdade: tabelas finais, Taça e Europa decididas, clubes europeus ainda
  // materializados, totalizadores dos jogadores por zerar e ninguém ainda subiu
  // nem desceu de divisão (senão o escalão arquivado seria o da época seguinte).
  archiveSeason(state, finishedEurope);
  archivePlayerSeasons(state);

  dematerializeEurope(state);

  const managedId = state.meta.managedClubId;
  const mLeagueId = managedLeagueId(state);
  const mLeague = state.leagues[mLeagueId]!;
  const leagueSize = mLeague.clubIds.length;

  // --- 1. Historial e troféus (antes de mexer nas tabelas) ---
  const pos = finalPosition(state, mLeagueId, managedId);
  const row = state.standings[mLeagueId]![managedId]!;
  const champion = pos === 1;
  const relegated = pos > leagueSize - 2 && !!state.leagues[`liga_${mLeague.tier + 1}`];
  const promoted = pos <= 2 && mLeague.tier > 1;

  const record: SeasonRecord = {
    season: state.meta.season,
    clubId: managedId,
    clubName: state.clubs[managedId]?.name ?? managedId,
    leagueName: mLeague.name,
    tier: mLeague.tier,
    position: pos,
    points: row.points,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    champion,
    promoted,
    relegated,
  };
  state.career.seasons.push(record);
  state.career.totalWins += row.won;
  state.career.totalDraws += row.drawn;
  state.career.totalLosses += row.lost;
  if (champion) {
    state.career.trophies.push({ season: state.meta.season, key: 'trophy.league', params: { league: mLeague.name } });
  }

  // --- 1b. Os adeptos fecham a época ---
  // Um título ou uma subida compram paciência para a época seguinte; uma
  // descida gasta-a toda. É a única coisa que atravessa o rollover: o humor
  // NÃO se repõe a meio, porque a memória da bancada é o que lhe dá peso.
  if (champion) fansOnTrophy(state, mLeague.name);
  if (promoted && !champion) fansOnPromotion(state);
  if (relegated) fansOnRelegation(state);

  // --- 2. Avaliação da direção + reputação do treinador ---
  const verdict = evaluateSeason(state.career, pos, leagueSize, relegated);
  updateManagerReputation(state.career, {
    champion, promoted, relegated, position: pos, met: verdict.metObjective, fired: verdict.fired,
  });
  if (verdict.fired) {
    state.career.pendingOffers = generateJobOffers(state, managedId);
  }

  // --- 2b. Prémios de fim de época (indexados ao escalão) ---
  // Uma equipa da 3ª divisão não pode receber o mesmo que uma da 1ª.
  for (const league of Object.values(state.leagues)) {
    const table = state.standings[league.id];
    if (!table) continue;
    const ranked = sortStandings(table, (id) => state.clubs[id]?.name ?? id);
    const hasUpperTier = !!state.leagues[`liga_${league.tier - 1}`];
    const hasLowerTier = !!state.leagues[`liga_${league.tier + 1}`];
    ranked.forEach((row, idx) => {
      const fin = state.finances[row.clubId];
      if (!fin) return;
      const prize = leaguePrize(league.tier, idx + 1, ranked.length);
      moveMoney(fin, prize);
      if (row.clubId === managedId) {
        addNews(state, 'SEASON', 'news.prize.league',
          { pos: idx + 1, league: league.name, amount: prize.toLocaleString('pt-PT') });
      }
      // Reputação segue o desempenho REAL da época — sem isto ficava estática e
      // um clube campeão continuava com o mesmo objetivo/estrelas de sempre.
      const club = state.clubs[row.clubId];
      if (!club) return;
      const isChampion = idx === 0;
      const isPromoted = hasUpperTier && idx < PROMOTED_PER_TIER;
      const isRelegated = hasLowerTier && idx >= ranked.length - RELEGATED_PER_TIER;
      // Série de títulos: quem ganha anos a fio ganha reputação MAIS depressa
      // (6 → 9 → 12 → 15). Falhar um título parte a série.
      if (!state.career.titleStreaks) state.career.titleStreaks = {};
      const streak = isChampion ? (state.career.titleStreaks[club.id] ?? 0) + 1 : 0;
      if (streak > 0) state.career.titleStreaks[club.id] = streak;
      else delete state.career.titleStreaks[club.id];
      applySeasonReputation(
        club,
        seasonReputationDelta(idx + 1, ranked.length, isChampion, isPromoted, isRelegated, streak),
      );
    });
  }

  // --- 3. Promoções/despromoções ---
  const moves = processPromotions(state);

  // Realinha a reputação de quem mudou de divisão — sem isto, um clube que
  // subiu de nível ficava com a reputação de baixo, abaixo de rivais que nunca
  // saíram da divisão antiga (ver realignReputationOnMove).
  for (const mv of moves) {
    const club = state.clubs[mv.clubId];
    const newLeague = state.leagues[mv.toLeagueId];
    if (!club || !newLeague) continue;
    const peers = newLeague.clubIds.map((id) => state.clubs[id]).filter((c): c is NonNullable<typeof c> => !!c);
    realignReputationOnMove(club, peers);
  }

  // Prémio de subida — o "salto" de orçamento.
  for (const mv of moves) {
    if (mv.direction !== 'UP') continue;
    const fin = state.finances[mv.clubId];
    const newTier = state.leagues[mv.toLeagueId]?.tier ?? 1;
    if (!fin) continue;
    const bonus = promotionPrize(newTier);
    moveMoney(fin, bonus);
    if (mv.clubId === managedId) {
      addNews(state, 'SEASON', 'news.prize.promotion', { amount: bonus.toLocaleString('pt-PT') });
    }
  }

  // --- 4. Nova época: envelhecer, contratos, reformas + jovens, orçamentos ---
  // Antes de caducar contratos, guarda quem sai do nosso clube a custo zero
  // (Bosman): foram avisados durante a época e não renovámos.
  const bosmanLosses = (state.clubs[managedId]?.squad ?? [])
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => !!p && p.contractUntil === state.meta.season)
    .map((p) => `${p.firstName} ${p.lastName}`);

  state.meta.season += 1;
  for (const p of Object.values(state.players)) {
    p.age += 1;
    // Teto por cumprir aproxima-se da realidade — a ficha deixa de prometer
    // eternamente um potencial que o jogador já não vai atingir.
    fadePotential(p);
    p.condition.fitness = 100;
    p.condition.form = p.condition.morale;
    p.condition.seasonGoals = 0; // totalizadores reiniciam a cada época
    p.condition.seasonAssists = 0;
    p.condition.seasonRating = 0;
    p.condition.seasonApps = 0;
    p.condition.seasonYellows = 0; // a acumulação disciplinar é POR ÉPOCA
    p.condition.devSeason = 0;
  }
  const returnedLoans = returnExpiredLoans(state); // empréstimos vencidos regressam aos donos
  processContractExpiries(state);
  for (const name of bosmanLosses) {
    addNews(state, 'TRANSFER', 'news.bosman.left', { player: name });
  }
  // PRÉ-CONTRATOS: exatamente aqui. Os contratos acabaram de expirar (é agora
  // que o alvo fica livre) e a IA ainda não reconstruiu plantéis — se corresse
  // depois, outro clube apanhava-o primeiro e o acordo caía sempre.
  for (const outcome of resolvePreContracts(state)) {
    addNews(
      state,
      'TRANSFER',
      outcome.joined ? 'news.pre.joined' : 'news.pre.lost',
      { player: outcome.playerName },
    );
  }
  const youthRng = new Rng(deriveSeed(state.meta.rngSeed, 'youth', state.meta.season));
  const youth = processYouthAndRetirements(state, youthRng);
  // Reformas no clube gerido: avisa por notícia (senão o jogador "desaparece").
  for (const name of youth.retiredManaged) {
    addNews(state, 'CLUB', 'news.retired', { player: name });
  }
  // Mínimo por posição: nenhum clube fica desfalcado (contratos/reformas/vendas).
  const fillRng = new Rng(deriveSeed(state.meta.rngSeed, 'fill', state.meta.season));
  for (const club of Object.values(state.clubs)) ensureMinimumSquad(state, club, fillRng);
  // Mercado da IA: os clubes não geridos reforçam-se até ao nível do seu estatuto.
  // Sem isto só perdiam qualidade (reformas/contratos) e a divisão decaía toda.
  rebuildAiSquads(state);
  // Repõe um onze válido no clube gerido após todas as saídas/entradas.
  ensureValidLineup(managedId, state.clubs[managedId]?.squad ?? [], state.players, state.tactics);
  // E refaz o onze da IA — `ensureValidLineup` só reage a titulares em falta, por
  // isso sem isto os reforços e os jovens que evoluíram ficavam no banco para sempre.
  refreshAiLineups(state);
  // REAVALIAÇÃO GERAL: toda a gente fez anos, evoluiu ou perdeu um ano de
  // contrato. Sem isto o preço no ecrã ficava congelado no dia em que o jogador
  // nasceu — daí aparecerem craques de 88 avaliados em 800 mil.
  refreshMarketValues(state);
  // Só agora se pode cortar o mercado de livres: com os onzes já refeitos, quem
  // saiu deixa de estar referenciado e pode mesmo desaparecer do save.
  pruneFreeAgents(state);
  // Receitas recalculadas com a NOVA divisão (subir traz mais TV/patrocínios),
  // e a direção absorve o excesso de liquidez antes de refazer os orçamentos.
  for (const club of Object.values(state.clubs)) {
    const fin = state.finances[club.id];
    if (!fin) continue;
    const newTier = state.leagues[club.leagueId]?.tier ?? 1;
    recalcIncome(club, newTier, fin);
    recalcUpkeep(club, fin);
    const absorbed = annualBudgetReset(fin, newTier, countryEconFactor(club.country));
    if (club.id === managedId && absorbed > 0) {
      addNews(state, 'CLUB', 'news.absorbed', { amount: absorbed.toLocaleString('pt-PT') });
    }
  }

  // --- 5. Calendários novos, tabelas limpas, nova Taça, objetivo novo ---
  for (const league of Object.values(state.leagues)) {
    state.schedules[league.id] = generateSchedule(
      league.id, league.clubIds, state.meta.rngSeed + state.meta.season * 31 + league.tier,
    );
    state.standings[league.id] = emptyStandings(league.clubIds);
  }
  if (state.background) resetBgSeason(state.background); // ligas de fundo: nova época
  state.cup = generateCup(state);

  // Provas europeias da nova época (só em jogo com base fixa). A qualificação foi
  // capturada acima (standings finais); a cadência espalha ~17 jornadas europeias
  // pelo calendário doméstico. A Supertaça opõe os campeões CL/EL da época anterior.
  if (euroQualify) {
    const newMgLeague = managedLeagueId(state);
    const totalRounds = state.schedules[newMgLeague]?.totalRounds ?? 26;
    // Espalha as 17 jornadas europeias por TODO o calendário doméstico (deixando
    // 1 jornada de folga no fim), em vez de as amontoar na primeira metade.
    const cadence = Math.max(1, Math.floor((totalRounds - 1) / EURO_MATCHDAYS));
    state.europe = buildEuropeCampaign(state, euroQualify, state.meta.season, cadence, euroCoeffs);
    const sc = finishedEurope ? setupSuperCup(state, finishedEurope, state.meta.season) : null;
    if (sc) state.europe.superCup = sc;
  } else {
    state.europe = undefined;
  }
  if (!verdict.fired) {
    setManagedObjective(state);
    state.career.confidence = Math.max(35, state.career.confidence);
    // Ofertas de clubes maiores por mérito (opcionais — a UI mostra no arranque).
    state.career.meritOffers = generateMeritOffers(state);
  } else {
    state.career.meritOffers = [];
  }

  state.meta.currentDate = `${state.meta.season}-08-01`;
  state.meta.updatedAt = new Date().toISOString();

  // --- 6. Notícias do fim de época ---
  if (record.champion) addNews(state, 'SEASON', 'news.season.champion', { club: record.clubName, league: record.leagueName });
  if (record.promoted && !record.champion) addNews(state, 'SEASON', 'news.season.promoted', { pos: record.position, league: record.leagueName });
  if (record.relegated) addNews(state, 'SEASON', 'news.season.relegated', { pos: record.position });
  addNews(state, 'BOARD', verdict.messageKey);
  if (youth.joinedManagedClub.length > 0) {
    addNews(state, 'YOUTH', 'news.youth', { n: youth.joinedManagedClub.length });
  }

  return { record, fired: verdict.fired, boardMessageKey: verdict.messageKey, moves, youth, returnedLoans };
}

/**
 * Aceita uma oferta de emprego após despedimento: muda o clube gerido,
 * limpa as ofertas e define objetivo/confiança novos.
 */
export function acceptJobOffer(state: GameState, clubId: string): boolean {
  if (!state.career.pendingOffers.includes(clubId)) return false;
  state.meta.managedClubId = clubId;
  state.career.pendingOffers = [];
  state.career.confidence = 55;
  resetSupport(state); // outra cidade, outra bancada: humor e imprensa recomeçam
  setManagedObjective(state);
  retargetManagedEurope(state); // a prova europeia segue o novo clube
  return true;
}

/** 3 ofertas: clubes de reputação igual ou inferior, preferindo divisões de baixo. */
function generateJobOffers(state: GameState, excludeClubId: string): string[] {
  const myRep = state.clubs[excludeClubId]?.reputation ?? 50;
  const candidates = Object.values(state.clubs)
    .filter((c) => c.id !== excludeClubId && c.reputation <= myRep + 5)
    .sort((a, b) => b.reputation - a.reputation);
  return candidates.slice(0, 3).map((c) => c.id);
}

/**
 * Ofertas de clubes MAIORES por MÉRITO — geradas no fim de época quando o
 * treinador teve sucesso (confiança alta) e a sua reputação alcança um clube de
 * maior estatuto que o atual. Opcionais: aceitar muda de clube, recusar mantém.
 */
export function generateMeritOffers(state: GameState): string[] {
  const career = state.career;
  if (career.confidence < 55) return [];
  const rep = career.reputation ?? 45;
  const myClub = state.clubs[state.meta.managedClubId];
  if (!myClub) return [];
  const myRep = myClub.reputation;
  const candidates = Object.values(state.clubs)
    .filter((c) => c.id !== myClub.id)
    .filter((c) => c.reputation > myRep + 4)   // um degrau acima
    .filter((c) => c.reputation <= rep + 8)    // ao alcance do prestígio do treinador
    .sort((a, b) => b.reputation - a.reputation);
  return candidates.slice(0, 2).map((c) => c.id);
}

/** Aceita uma oferta por mérito (muda de clube sem ter sido despedido). */
export function acceptMeritOffer(state: GameState, clubId: string): boolean {
  if (!state.career.meritOffers?.includes(clubId)) return false;
  state.meta.managedClubId = clubId;
  state.career.meritOffers = [];
  state.career.confidence = 55;
  resetSupport(state); // outra cidade, outra bancada: humor e imprensa recomeçam
  setManagedObjective(state);
  retargetManagedEurope(state); // a prova europeia segue o novo clube
  return true;
}

/** Roda o foco de treino da IA por clube+semana, de forma determinística. */
function rotateFocus(clubId: string, weekKey: string): TrainingFocus {
  const focuses = [TrainingFocus.PHYSICAL, TrainingFocus.TECHNICAL, TrainingFocus.TACTICAL];
  const h = deriveSeed(1, clubId, weekKey) % focuses.length;
  return focuses[h]!;
}

/** Soma dias a uma data ISO "YYYY-MM-DD". */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
