import {
  CUP_EVERY_LEAGUE_ROUNDS,
  Fixture,
  GameState,
  isRoundComplete,
  naturalOverall,
} from '../models';
import { generateCup, playCupRound } from '../cup';
import { addNews } from '../news';
import { deriveSeed, Rng } from '../engine/rng';
import { matchFatigue } from '../engine/fatigue';
import {
  annualBudgetReset,
  applyInsolvency,
  applyWeeklyFinances,
  leaguePrize,
  matchdayGate,
  processContractExpiries,
  promotionPrize,
  recalcIncome,
  recalcUpkeep,
} from '../economy';
import {
  emptyStandings,
  finalPosition,
  generateSchedule,
  playRound,
  processPromotions,
  sortStandings,
  TierMove,
  transferWindow,
} from '../season';
import { evaluateSeason, SeasonRecord, updateConfidence } from '../career';
import { trainPlayer, TrainingFocus } from '../training';
import { setManagedObjective } from './newGame';
import { ensureMinimumSquad, processYouthAndRetirements, YouthIntakeResult } from './youth';
import { returnExpiredLoans, ReturnedLoan } from './loans';
import { ensureValidLineup } from './lineup';
import {
  blockingReason,
  generateIncomingBids,
  generatePlayerRequests,
  generateRenewalReminders,
  pruneInbox,
} from './inbox';
import { pruneOffers, resolveDueOffers } from './offers';
import { BOSMAN_WINDOW_ROUNDS, roundsRemaining, runBosmanApproaches } from './matchday';
import { tickScouting } from './scouting';

/** Liga do clube gerido (muda com promoções/despromoções). */
export function managedLeagueId(state: GameState): string {
  return state.clubs[state.meta.managedClubId]?.leagueId ?? Object.keys(state.leagues)[0]!;
}

/** Uma linha das "notas do plantel" no resumo da jornada (chave + params). */
export interface WeekNote {
  key: string;
  params?: import('../i18n').MsgParams;
  kind: 'INJURY' | 'GROWTH' | 'TRANSFER' | 'INFO';
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
  let managedFixtures: Fixture[] = [];
  let managedRound = 0;
  const allPlayed: Fixture[] = [];
  const homeClubsThisWeek = new Set<string>();
  const playedClubs = new Set<string>();

  // Dados recolhidos ao longo da semana para o relatório final.
  const notes: WeekNote[] = [];
  let managedGate = { attendance: 0, revenue: 0 };
  // Overall antes do treino, para detetar quem evoluiu esta semana.
  const overallBefore = new Map<string, number>();
  for (const id of state.clubs[managedId]?.squad ?? []) {
    const p = state.players[id];
    if (p) overallBefore.set(id, naturalOverall(p));
  }

  // 0. Suspensões: quem está suspenso falha esta jornada. Tira-o do onze (troca
  //    por um suplente apto) e desconta um jogo de suspensão. Aplica-se a todos
  //    os clubes (a IA também cumpre castigos).
  for (const club of Object.values(state.clubs)) {
    const tactic = state.tactics[club.id];
    for (const id of club.squad) {
      const p = state.players[id];
      if (!p || (p.condition.suspended ?? 0) <= 0) continue;
      if (tactic) {
        const slot = tactic.lineup.find((s) => s.playerId === id);
        if (slot) {
          const inLineup = new Set(tactic.lineup.map((s) => s.playerId));
          const sub = club.squad.find((bid) => {
            const b = state.players[bid];
            return !!b && !inLineup.has(bid) && b.condition.status !== 'INJURED' && (b.condition.suspended ?? 0) === 0;
          });
          if (sub) slot.playerId = sub;
        }
      }
      p.condition.suspended = (p.condition.suspended ?? 0) - 1;
    }
  }

  // 1. Simular a próxima jornada de cada divisão.
  for (const league of Object.values(state.leagues)) {
    const schedule = state.schedules[league.id];
    const table = state.standings[league.id];
    if (!schedule || !table) continue;

    const round = nextRound(state, league.id);
    if (round === null) continue;

    const played = playRound(schedule, round, table, {
      players: state.players,
      tactics: state.tactics,
      baseSeed: state.meta.rngSeed,
    });

    for (const fx of played) {
      allPlayed.push(fx);
      homeClubsThisWeek.add(fx.homeClubId);
      playedClubs.add(fx.homeClubId);
      playedClubs.add(fx.awayClubId);
    }
    if (league.id === mLeagueId) {
      managedFixtures = played;
      managedRound = round;
    }
  }

  // 1b. Taça — eliminatórias distribuídas uniformemente pela época
  // (intervalo dinâmico: garante que todas cabem antes da última jornada).
  const mSchedule = state.schedules[mLeagueId];
  const cupInterval = mSchedule
    ? Math.max(2, Math.min(CUP_EVERY_LEAGUE_ROUNDS,
        Math.floor(mSchedule.totalRounds / (state.cup.totalRounds + 1))))
    : CUP_EVERY_LEAGUE_ROUNDS;
  let cupFixtures: Fixture[] = [];
  if (
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
        addNews(state, 'INJURY', 'news.injury', { player: `${p.firstName} ${p.lastName}`, days: p.condition.injuryDaysRemaining });
        notes.push({
          kind: 'INJURY',
          key: 'note.injury',
          params: { player: p.lastName, days: p.condition.injuryDaysRemaining },
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
      if (s.red) p.condition.suspended = Math.max(p.condition.suspended ?? 0, 1); // vermelho → falha o jogo seguinte
    }
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
      club: state.clubs[managedId]?.shortName ?? '', opp, score: `${mine}-${theirs}`, round: managedRound,
    });
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
    const deltaFor = (mine: number, theirs: number) => (mine > theirs ? 3 : mine < theirs ? -4 : -1);
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
    for (const id of club.squad) {
      if (lineupPlayedIds.has(id)) continue;
      const p = state.players[id];
      if (p) p.condition.morale += Math.sign(50 - p.condition.morale);
    }
  }

  // 3. Finanças semanais de todos os clubes.
  //    Bilheteira depende da FORMA recente; manutenção escala com instalações;
  //    saldo negativo traz sanções (reputação e venda forçada).
  for (const club of Object.values(state.clubs)) {
    const fin = state.finances[club.id];
    if (!fin) continue;

    recalcUpkeep(club, fin); // instalações maiores = manutenção maior

    const gate = homeClubsThisWeek.has(club.id)
      ? matchdayGate(club, recentFormOf(state, club.id, 5))
      : { attendance: 0, revenue: 0 };
    if (club.id === managedId) managedGate = gate;
    fin.income.tickets = gate.revenue;
    applyWeeklyFinances(fin, gate.revenue);

    const sanction = applyInsolvency(state, club.id);
    if (sanction.insolvent && club.id === managedId) {
      if (sanction.soldPlayerName) {
        addNews(state, 'CLUB', 'news.insolvency.sold',
          { player: sanction.soldPlayerName, amount: sanction.amount.toLocaleString('pt-PT') });
      } else {
        addNews(state, 'CLUB', 'news.insolvency.blocked');
      }
    }
  }

  // 4. Treino de todos os plantéis (determinístico por semana+jogador).
  // O centro de treino do clube acelera a evolução.
  const weekKey = state.meta.currentDate;
  for (const club of Object.values(state.clubs)) {
    const clubFocus = club.id === state.meta.managedClubId ? focus : rotateFocus(club.id, weekKey);
    const growthBonus = (club.facilities.training - 1) * 0.03;
    for (const id of club.squad) {
      const p = state.players[id];
      if (!p) continue;
      const rng = new Rng(deriveSeed(state.meta.rngSeed, 'train', weekKey, id));
      trainPlayer(p, clubFocus, rng, growthBonus);
    }
  }

  // 4b. Quem subiu de overall esta semana — a recompensa visível do treino.
  for (const [id, before] of overallBefore) {
    const p = state.players[id];
    if (!p) continue;
    const after = naturalOverall(p);
    if (after > before) {
      notes.push({ kind: 'GROWTH', key: 'note.growth', params: { player: p.lastName, ovr: after } });
    }
  }

  // 5. Recuperação de lesões — o departamento médico encurta o tempo.
  for (const club of Object.values(state.clubs)) {
    const recoveryPerWeek = 7 + (club.facilities.medical - 1) * 2;
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
  const confidence = updateConfidence(state.career, position, mLeague.clubIds.length);

  // 7. Mercado: caducar propostas antigas e gerar novas pelos nossos jogadores.
  //    A IA só compra com a JANELA ABERTA — simétrico ao jogador, que também só
  //    negoceia dentro da janela (antes a IA comprava sempre, o que era injusto).
  pruneInbox(state);
  const mSched = state.schedules[mLeagueId];
  const mRound = nextRound(state, mLeagueId) ?? ((mSched?.totalRounds ?? 30) + 1);
  const windowOpen = transferWindow(mRound, mSched?.totalRounds ?? 30).open;
  const bidRng = new Rng(deriveSeed(state.meta.rngSeed, 'bids', weekKey));
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

  // 9. Balanço da semana do clube gerido.
  const mFin = state.finances[managedId];
  const report: WeekReport | null = mFin ? buildWeekReport({
    state, managedId, managedRound, myFx, gate: managedGate, fin: mFin, notes,
  }) : null;

  const seasonEnded = nextRound(state, mLeagueId) === null;
  return { round: managedRound, fixtures: managedFixtures, cupFixtures, seasonEnded, confidence, report };
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

  // --- 2. Avaliação da direção ---
  const verdict = evaluateSeason(state.career, pos, leagueSize, relegated);
  if (verdict.fired) {
    state.career.pendingOffers = generateJobOffers(state, managedId);
  }

  // --- 2b. Prémios de fim de época (indexados ao escalão) ---
  // Uma equipa da 3ª divisão não pode receber o mesmo que uma da 1ª.
  for (const league of Object.values(state.leagues)) {
    const table = state.standings[league.id];
    if (!table) continue;
    const ranked = sortStandings(table, (id) => state.clubs[id]?.name ?? id);
    ranked.forEach((row, idx) => {
      const fin = state.finances[row.clubId];
      if (!fin) return;
      const prize = leaguePrize(league.tier, idx + 1, ranked.length);
      fin.balance += prize;
      if (row.clubId === managedId) {
        addNews(state, 'SEASON', 'news.prize.league',
          { pos: idx + 1, league: league.name, amount: prize.toLocaleString('pt-PT') });
      }
    });
  }

  // --- 3. Promoções/despromoções ---
  const moves = processPromotions(state);

  // Prémio de subida — o "salto" de orçamento.
  for (const mv of moves) {
    if (mv.direction !== 'UP') continue;
    const fin = state.finances[mv.clubId];
    const newTier = state.leagues[mv.toLeagueId]?.tier ?? 1;
    if (!fin) continue;
    const bonus = promotionPrize(newTier);
    fin.balance += bonus;
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
    p.condition.fitness = 100;
    p.condition.form = p.condition.morale;
    p.condition.seasonGoals = 0; // totalizadores reiniciam a cada época
    p.condition.seasonAssists = 0;
  }
  const returnedLoans = returnExpiredLoans(state); // empréstimos vencidos regressam aos donos
  processContractExpiries(state);
  for (const name of bosmanLosses) {
    addNews(state, 'TRANSFER', 'news.bosman.left', { player: name });
  }
  const youthRng = new Rng(deriveSeed(state.meta.rngSeed, 'youth', state.meta.season));
  const youth = processYouthAndRetirements(state, youthRng);
  // Mínimo por posição: nenhum clube fica desfalcado (contratos/reformas/vendas).
  const fillRng = new Rng(deriveSeed(state.meta.rngSeed, 'fill', state.meta.season));
  for (const club of Object.values(state.clubs)) ensureMinimumSquad(state, club, fillRng);
  // Repõe um onze válido no clube gerido após todas as saídas/entradas.
  ensureValidLineup(managedId, state.clubs[managedId]?.squad ?? [], state.players, state.tactics);
  // Receitas recalculadas com a NOVA divisão (subir traz mais TV/patrocínios),
  // e a direção absorve o excesso de liquidez antes de refazer os orçamentos.
  for (const club of Object.values(state.clubs)) {
    const fin = state.finances[club.id];
    if (!fin) continue;
    const newTier = state.leagues[club.leagueId]?.tier ?? 1;
    recalcIncome(club, newTier, fin);
    recalcUpkeep(club, fin);
    const absorbed = annualBudgetReset(fin);
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
  state.cup = generateCup(state);
  if (!verdict.fired) {
    setManagedObjective(state);
    state.career.confidence = Math.max(35, state.career.confidence);
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
  setManagedObjective(state);
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
