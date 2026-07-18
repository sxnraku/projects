import { goalDifference, MatchResult, StandingRow } from '../models';

/** Cria a tabela inicial (tudo a zero) para um conjunto de clubes. */
export function emptyStandings(clubIds: string[]): Record<string, StandingRow> {
  const table: Record<string, StandingRow> = {};
  for (const clubId of clubIds) {
    table[clubId] = {
      clubId, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    };
  }
  return table;
}

/**
 * Aplica um resultado à tabela (muta as linhas dos dois clubes).
 * 3 pontos por vitória, 1 por empate. Idempotência é responsabilidade do chamador
 * — não aplicar o mesmo Fixture duas vezes.
 */
export function applyResult(
  table: Record<string, StandingRow>,
  result: MatchResult,
): void {
  const home = table[result.homeClubId];
  const away = table[result.awayClubId];
  if (!home || !away) throw new Error('Clube do resultado não está na tabela');

  const hg = result.home.goals;
  const ag = result.away.goals;

  home.played++; away.played++;
  home.goalsFor += hg; home.goalsAgainst += ag;
  away.goalsFor += ag; away.goalsAgainst += hg;

  if (hg > ag) {
    home.won++; home.points += 3; away.lost++;
  } else if (ag > hg) {
    away.won++; away.points += 3; home.lost++;
  } else {
    home.drawn++; away.drawn++;
    home.points += 1; away.points += 1;
  }
}

/**
 * Reverte um resultado previamente aplicado à tabela (operação inversa de
 * applyResult). Usado pela "segunda hipótese" para re-simular um jogo.
 */
export function revertResult(
  table: Record<string, StandingRow>,
  result: MatchResult,
): void {
  const home = table[result.homeClubId];
  const away = table[result.awayClubId];
  if (!home || !away) throw new Error('Clube do resultado não está na tabela');

  const hg = result.home.goals;
  const ag = result.away.goals;

  home.played--; away.played--;
  home.goalsFor -= hg; home.goalsAgainst -= ag;
  away.goalsFor -= ag; away.goalsAgainst -= hg;

  if (hg > ag) {
    home.won--; home.points -= 3; away.lost--;
  } else if (ag > hg) {
    away.won--; away.points -= 3; home.lost--;
  } else {
    home.drawn--; away.drawn--;
    home.points -= 1; away.points -= 1;
  }
}

/**
 * Ordena a tabela por critérios: pontos → diferença de golos → golos marcados → nome do clube.
 * Recebe um resolvedor de nome para o desempate final estável.
 */
export function sortStandings(
  table: Record<string, StandingRow>,
  clubName: (clubId: string) => string,
): StandingRow[] {
  return Object.values(table).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = goalDifference(a);
    const gdB = goalDifference(b);
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return clubName(a.clubId).localeCompare(clubName(b.clubId));
  });
}
