import { MatchResult } from './match';

/**
 * Um jogo agendado no calendário da época.
 * Antes de simulado: result === null. Depois: guarda o MatchResult.
 */
export interface Fixture {
  id: string;
  leagueId: string;
  round: number; // jornada (1..N)
  homeClubId: string;
  awayClubId: string;
  result: MatchResult | null;
}

/** Calendário completo de uma época para uma liga. */
export interface Schedule {
  leagueId: string;
  totalRounds: number;
  fixtures: Fixture[];
}

/** Jogos de uma jornada específica. */
export function fixturesOfRound(schedule: Schedule, round: number): Fixture[] {
  return schedule.fixtures.filter((f) => f.round === round);
}

/** True se todos os jogos até (e incluindo) uma jornada já foram simulados. */
export function isRoundComplete(schedule: Schedule, round: number): boolean {
  return fixturesOfRound(schedule, round).every((f) => f.result !== null);
}
