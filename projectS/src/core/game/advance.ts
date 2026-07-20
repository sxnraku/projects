import { CUP_EVERY_LEAGUE_ROUNDS, Fixture, GameState, isRoundComplete } from '../models';
import { generateCup, playCupRound } from '../cup';
import { addNews } from '../news';
import { deriveSeed, Rng } from '../engine/rng';
import {
  applyInsolvency,
  applyWeeklyFinances,
  matchdayIncome,
  processContractExpiries,
  recalcBudgets,
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
} from '../season';
import { evaluateSeason, SeasonRecord, updateConfidence } from '../career';
import { trainPlayer, TrainingFocus } from '../training';
import { setManagedObjective } from './newGame';
import { processYouthAndRetirements, YouthIntakeResult } from './youth';
import {
  generateIncomingBids,
  generatePlayerRequests,
  generateRenewalReminders,
  pruneInbox,
} from './inbox';

const MATCH_FATIGUE = 18; // perda de fitness de quem joga a titular

/** Liga do clube gerido (muda com promoções/despromoções). */
export function managedLeagueId(state: GameState): string {
  return state.clubs[state.meta.managedClubId]?.leagueId ?? Object.keys(state.leagues)[0]!;
}

/** Resultado de avançar uma semana. */
export interface WeekResult {
  round: number;
  fixtures: Fixture[]; // jogos da liga do clube gerido nesta semana
  cupFixtures: Fixture[]; // jogos da Taça disputados nesta semana (se houve)
  seasonEnded: boolean;
  confidence: number; // confiança da direção após a jornada
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
        addNews(state, 'INJURY', `Lesão: ${p.firstName} ${p.lastName} parado ~${p.condition.injuryDaysRemaining} dias.`);
      }
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
    const verb = mine > theirs ? 'vence' : mine === theirs ? 'empata com' : 'perde com';
    addNews(state, 'MATCH', `${state.clubs[managedId]?.shortName} ${verb} ${opp} (${mine}-${theirs}), jornada ${managedRound}.`);
  }

  // 2. Fadiga dos titulares que jogaram (pressing alto cansa mais).
  for (const clubId of playedClubs) {
    const tactic = state.tactics[clubId];
    if (!tactic) continue;
    const fatigue = MATCH_FATIGUE + Math.round((tactic.pressing - 5) * 1.2);
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

    const income = homeClubsThisWeek.has(club.id)
      ? matchdayIncome(club, recentFormOf(state, club.id, 5))
      : 0;
    fin.income.tickets = income;
    applyWeeklyFinances(fin, income);

    const sanction = applyInsolvency(state, club.id);
    if (sanction.insolvent && club.id === managedId) {
      if (sanction.soldPlayerName) {
        addNews(state, 'CLUB',
          `Insolvência: a direção vendeu ${sanction.soldPlayerName} por ${sanction.amount.toLocaleString('pt-PT')} € para cobrir dívidas.`);
      } else {
        addNews(state, 'CLUB', 'Clube em insolvência — contratações bloqueadas até equilibrar as contas.');
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
  pruneInbox(state);
  const bidRng = new Rng(deriveSeed(state.meta.rngSeed, 'bids', weekKey));
  const newBids = generateIncomingBids(state, bidRng);
  for (const b of newBids) {
    const p = state.players[b.playerId];
    const buyer = state.clubs[b.fromClubId];
    if (p && buyer) {
      addNews(state, 'TRANSFER', `${buyer.name} oferece ${(b.fee).toLocaleString('pt-PT')} € por ${p.firstName} ${p.lastName}.`);
    }
  }

  // 7b. Avisos de renovação — uma vez por época, no arranque (jornada 3).
  if (managedRound === 3) {
    const reminders = generateRenewalReminders(state);
    for (const r of reminders) {
      const p = state.players[r.playerId];
      if (p) addNews(state, 'CLUB', `Contrato de ${p.firstName} ${p.lastName} expira no fim da época.`);
    }
  }

  // 7c. Pedidos de jogadores insatisfeitos (moral baixa).
  const reqRng = new Rng(deriveSeed(state.meta.rngSeed, 'requests', weekKey));
  const newRequests = generatePlayerRequests(state, reqRng);
  for (const r of newRequests) {
    const p = state.players[r.playerId];
    if (p) {
      addNews(state, 'CLUB', r.request === 'WAGE_RISE'
        ? `${p.firstName} ${p.lastName} pede aumento salarial.`
        : `${p.firstName} ${p.lastName} quer ser vendido.`);
    }
  }

  // 8. Avançar a data uma semana.
  state.meta.currentDate = addDays(state.meta.currentDate, 7);
  state.meta.updatedAt = new Date().toISOString();

  const seasonEnded = nextRound(state, mLeagueId) === null;
  return { round: managedRound, fixtures: managedFixtures, cupFixtures, seasonEnded, confidence };
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
  boardMessage: string;
  moves: TierMove[];
  youth: YouthIntakeResult;
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
    state.career.trophies.push({ season: state.meta.season, label: `Campeão — ${mLeague.name}` });
  }

  // --- 2. Avaliação da direção ---
  const verdict = evaluateSeason(state.career, pos, leagueSize, relegated);
  if (verdict.fired) {
    state.career.pendingOffers = generateJobOffers(state, managedId);
  }

  // --- 3. Promoções/despromoções ---
  const moves = processPromotions(state);

  // --- 4. Nova época: envelhecer, contratos, reformas + jovens, orçamentos ---
  state.meta.season += 1;
  for (const p of Object.values(state.players)) {
    p.age += 1;
    p.condition.fitness = 100;
    p.condition.form = p.condition.morale;
  }
  processContractExpiries(state);
  const youthRng = new Rng(deriveSeed(state.meta.rngSeed, 'youth', state.meta.season));
  const youth = processYouthAndRetirements(state, youthRng);
  for (const fin of Object.values(state.finances)) recalcBudgets(fin);

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
  if (record.champion) addNews(state, 'SEASON', `🏆 CAMPEÕES! ${record.clubName} vence a ${record.leagueName}.`);
  if (record.promoted && !record.champion) addNews(state, 'SEASON', `Subida de divisão garantida! (${record.position}º na ${record.leagueName})`);
  if (record.relegated) addNews(state, 'SEASON', `Despromovidos após terminar em ${record.position}º.`);
  addNews(state, 'BOARD', verdict.message);
  if (youth.joinedManagedClub.length > 0) {
    addNews(state, 'YOUTH', `${youth.joinedManagedClub.length} jovens da academia sobem à equipa principal.`);
  }

  return { record, fired: verdict.fired, boardMessage: verdict.message, moves, youth };
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
