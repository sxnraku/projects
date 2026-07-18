import {
  Club,
  Finance,
  GameState,
  League,
  Player,
  Schedule,
  StandingRow,
  Tactic,
} from '../core/models';
import { CareerState, initialCareer } from '../core/career';
import { defaultFacilities, emptyCup } from '../core/models';

/**
 * Serialização GameState ↔ linhas planas (SQLite).
 *
 * Sub-objetos variáveis (atributos, receitas, tática, calendário) vão como JSON
 * em colunas TEXT — coincide com o schema.ts. Funções puras: testáveis sem o
 * binding nativo. O adaptador sqlite.ts só faz o INSERT/SELECT destas linhas.
 */

export interface SaveRows {
  meta: MetaRow;
  leagues: LeagueRow[];
  clubs: ClubRow[];
  players: PlayerRow[];
  finances: FinanceRow[];
  tactics: TacticRow[];
  standings: StandingRowDb[];
  schedules: ScheduleRow[];
  career: CareerRow;
  news: BlobRow;
  cup: BlobRow;
  inbox: BlobRow;
}

/** Linha única com blob JSON (news, cup). */
export interface BlobRow { id: 1; data: string; }

export interface MetaRow {
  id: 1;
  save_id: string; manager_name: string; managed_club_id: string;
  season: number; current_date: string; rng_seed: number;
  created_at: string; updated_at: string; schema_version: number;
}
export interface LeagueRow { id: string; name: string; country: string; tier: number; club_ids: string; }
export interface ClubRow {
  id: string; name: string; short_name: string; country: string; league_id: string;
  primary_color: string; secondary_color: string; stadium_name: string;
  stadium_capacity: number; reputation: number; facilities: string; squad: string;
}
export interface PlayerRow {
  id: string; club_id: string | null; first_name: string; last_name: string;
  age: number; nationality: string; foot: string; positions: string;
  attributes: string; potential: number; condition: string;
  contract_until: number | null; wage: number; market_value: number;
  transfer_listed: number;
}
export interface FinanceRow {
  club_id: string; balance: number; transfer_budget: number; wage_budget: number;
  income: string; expenses: string;
}
export interface TacticRow {
  club_id: string; formation: string; mentality: string; tempo: string;
  pressing: number; defensive_line: number; creativity: number;
  lineup: string; bench: string; captain_id: string | null; penalty_taker_id: string | null;
}
export interface StandingRowDb {
  league_id: string; club_id: string; played: number; won: number; drawn: number;
  lost: number; goals_for: number; goals_against: number; points: number;
}
/** O calendário não está no schema base — guardado como um blob JSON por liga. */
export interface ScheduleRow { league_id: string; data: string; }
/** Carreira do treinador — blob JSON de linha única. */
export interface CareerRow { id: 1; data: string; }

// ---------- GameState → linhas ----------

export function serialize(state: GameState): SaveRows {
  const m = state.meta;
  return {
    meta: {
      id: 1, save_id: m.saveId, manager_name: m.managerName, managed_club_id: m.managedClubId,
      season: m.season, current_date: m.currentDate, rng_seed: m.rngSeed,
      created_at: m.createdAt, updated_at: m.updatedAt, schema_version: m.schemaVersion,
    },
    leagues: Object.values(state.leagues).map(serializeLeague),
    clubs: Object.values(state.clubs).map(serializeClub),
    players: Object.values(state.players).map(serializePlayer),
    finances: Object.values(state.finances).map(serializeFinance),
    tactics: Object.values(state.tactics).map(serializeTactic),
    standings: Object.entries(state.standings).flatMap(([leagueId, table]) =>
      Object.values(table).map((r) => serializeStanding(leagueId, r)),
    ),
    schedules: Object.entries(state.schedules).map(([leagueId, s]) => ({
      league_id: leagueId, data: JSON.stringify(s),
    })),
    career: { id: 1, data: JSON.stringify(state.career) },
    news: { id: 1, data: JSON.stringify(state.news) },
    cup: { id: 1, data: JSON.stringify(state.cup) },
    inbox: { id: 1, data: JSON.stringify(state.inbox) },
  };
}

const serializeLeague = (l: League): LeagueRow => ({
  id: l.id, name: l.name, country: l.country, tier: l.tier, club_ids: JSON.stringify(l.clubIds),
});
const serializeClub = (c: Club): ClubRow => ({
  id: c.id, name: c.name, short_name: c.shortName, country: c.country, league_id: c.leagueId,
  primary_color: c.primaryColor, secondary_color: c.secondaryColor, stadium_name: c.stadiumName,
  stadium_capacity: c.stadiumCapacity, reputation: c.reputation,
  facilities: JSON.stringify(c.facilities), squad: JSON.stringify(c.squad),
});
const serializePlayer = (p: Player): PlayerRow => ({
  id: p.id, club_id: p.clubId, first_name: p.firstName, last_name: p.lastName,
  age: p.age, nationality: p.nationality, foot: p.foot, positions: JSON.stringify(p.positions),
  attributes: JSON.stringify(p.attributes), potential: p.potential, condition: JSON.stringify(p.condition),
  contract_until: p.contractUntil, wage: p.wage, market_value: p.marketValue,
  transfer_listed: p.transferListed ? 1 : 0,
});
const serializeFinance = (f: Finance): FinanceRow => ({
  club_id: f.clubId, balance: f.balance, transfer_budget: f.transferBudget, wage_budget: f.wageBudget,
  income: JSON.stringify(f.income), expenses: JSON.stringify(f.expenses),
});
const serializeTactic = (t: Tactic): TacticRow => ({
  club_id: t.clubId, formation: t.formation, mentality: t.mentality, tempo: t.tempo,
  pressing: t.pressing, defensive_line: t.defensiveLine, creativity: t.creativity,
  lineup: JSON.stringify(t.lineup), bench: JSON.stringify(t.bench),
  captain_id: t.captainId, penalty_taker_id: t.penaltyTakerId,
});
const serializeStanding = (leagueId: string, r: StandingRow): StandingRowDb => ({
  league_id: leagueId, club_id: r.clubId, played: r.played, won: r.won, drawn: r.drawn,
  lost: r.lost, goals_for: r.goalsFor, goals_against: r.goalsAgainst, points: r.points,
});

// ---------- linhas → GameState ----------

export function deserialize(rows: SaveRows): GameState {
  const meta = {
    saveId: rows.meta.save_id, managerName: rows.meta.manager_name, managedClubId: rows.meta.managed_club_id,
    season: rows.meta.season, currentDate: rows.meta.current_date, rngSeed: rows.meta.rng_seed,
    createdAt: rows.meta.created_at, updatedAt: rows.meta.updated_at, schemaVersion: rows.meta.schema_version,
  };

  const state: GameState = {
    meta, players: {}, clubs: {}, leagues: {}, finances: {}, tactics: {}, schedules: {}, standings: {},
    // Saves antigos não têm estes blocos — inicializa por omissão.
    career: rows.career?.data ? (JSON.parse(rows.career.data) as CareerState) : initialCareer(),
    news: rows.news?.data ? JSON.parse(rows.news.data) : [],
    cup: rows.cup?.data ? JSON.parse(rows.cup.data) : emptyCup(),
    inbox: rows.inbox?.data ? JSON.parse(rows.inbox.data) : [],
  };

  for (const r of rows.leagues) {
    state.leagues[r.id] = { id: r.id, name: r.name, country: r.country, tier: r.tier, clubIds: JSON.parse(r.club_ids) };
  }
  for (const r of rows.clubs) {
    state.clubs[r.id] = {
      id: r.id, name: r.name, shortName: r.short_name, country: r.country, leagueId: r.league_id,
      primaryColor: r.primary_color, secondaryColor: r.secondary_color, stadiumName: r.stadium_name,
      stadiumCapacity: r.stadium_capacity, reputation: r.reputation,
      facilities: r.facilities && r.facilities !== '{}' ? JSON.parse(r.facilities) : defaultFacilities(),
      squad: JSON.parse(r.squad),
    };
  }
  for (const r of rows.players) {
    state.players[r.id] = {
      id: r.id, clubId: r.club_id, firstName: r.first_name, lastName: r.last_name,
      age: r.age, nationality: r.nationality, foot: r.foot as Player['foot'],
      positions: JSON.parse(r.positions), attributes: JSON.parse(r.attributes),
      potential: r.potential, condition: JSON.parse(r.condition),
      contractUntil: r.contract_until, wage: r.wage, marketValue: r.market_value,
      transferListed: !!r.transfer_listed,
    };
  }
  for (const r of rows.finances) {
    state.finances[r.club_id] = {
      clubId: r.club_id, balance: r.balance, transferBudget: r.transfer_budget, wageBudget: r.wage_budget,
      income: JSON.parse(r.income), expenses: JSON.parse(r.expenses),
    };
  }
  for (const r of rows.tactics) {
    state.tactics[r.club_id] = {
      clubId: r.club_id, formation: r.formation as Tactic['formation'], mentality: r.mentality as Tactic['mentality'],
      tempo: r.tempo as Tactic['tempo'],
      pressing: r.pressing ?? 5, defensiveLine: r.defensive_line ?? 5, creativity: r.creativity ?? 5,
      lineup: JSON.parse(r.lineup), bench: JSON.parse(r.bench),
      captainId: r.captain_id, penaltyTakerId: r.penalty_taker_id,
    };
  }
  for (const r of rows.standings) {
    (state.standings[r.league_id] ??= {})[r.club_id] = {
      clubId: r.club_id, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
      goalsFor: r.goals_for, goalsAgainst: r.goals_against, points: r.points,
    };
  }
  for (const r of rows.schedules) {
    state.schedules[r.league_id] = JSON.parse(r.data) as Schedule;
  }

  return state;
}
