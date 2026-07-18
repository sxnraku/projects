import { Fixture, Schedule } from '../models';
import { Rng } from '../engine/rng';

/**
 * Gera o calendário todos-contra-todos ida-e-volta (método do círculo / round-robin).
 *
 * Para N clubes (N par): 2*(N-1) jornadas, cada clube joga uma vez por jornada.
 * Se N for ímpar, adiciona-se um "bye" (folga) — nessa jornada um clube descansa.
 *
 * A primeira volta define os mandos; a segunda volta inverte casa/fora do mesmo
 * emparelhamento, garantindo equilíbrio (cada par joga 1x em casa de cada).
 *
 * @param seed opcional — baralha a ordem inicial dos clubes para variar calendários
 *             entre épocas, mantendo determinismo.
 */
export function generateSchedule(
  leagueId: string,
  clubIds: string[],
  seed?: number,
): Schedule {
  let teams = [...clubIds];

  if (seed !== undefined) {
    const rng = new Rng(seed);
    // Fisher–Yates determinístico.
    for (let i = teams.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [teams[i], teams[j]] = [teams[j]!, teams[i]!];
    }
  }

  const BYE = '__BYE__';
  if (teams.length % 2 !== 0) teams.push(BYE);

  const n = teams.length;
  const roundsFirstLeg = n - 1;
  const half = n / 2;

  const fixtures: Fixture[] = [];
  // Índices rotativos: fixa o primeiro, roda os restantes.
  const rotation = teams.slice();

  for (let round = 0; round < roundsFirstLeg; round++) {
    for (let i = 0; i < half; i++) {
      const a = rotation[i]!;
      const b = rotation[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;

      // Alterna mando por jornada para distribuir casa/fora ao primeiro clube fixo.
      const homeFirst = round % 2 === 0;
      const home = i === 0 ? (homeFirst ? a : b) : a;
      const away = i === 0 ? (homeFirst ? b : a) : b;

      // Primeira volta.
      fixtures.push(makeFixture(leagueId, round + 1, home, away));
      // Segunda volta — mando invertido, jornada deslocada.
      fixtures.push(makeFixture(leagueId, round + 1 + roundsFirstLeg, away, home));
    }

    // Roda: mantém rotation[0] fixo, gira o resto no sentido horário.
    const last = rotation.pop()!;
    rotation.splice(1, 0, last);
  }

  fixtures.sort((x, y) => x.round - y.round);

  return {
    leagueId,
    totalRounds: roundsFirstLeg * 2,
    fixtures,
  };
}

let fixtureCounter = 0;
function makeFixture(
  leagueId: string,
  round: number,
  homeClubId: string,
  awayClubId: string,
): Fixture {
  return {
    id: `fx_${leagueId}_${round}_${homeClubId}_${awayClubId}_${fixtureCounter++}`,
    leagueId,
    round,
    homeClubId,
    awayClubId,
    result: null,
  };
}
