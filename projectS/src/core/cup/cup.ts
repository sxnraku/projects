import {
  CUP_LEAGUE_ID,
  CUP_WINNER_PRIZE,
  cupRoundName,
  CupState,
  Fixture,
  GameState,
} from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import { simulateMatch } from '../engine';
import { addNews } from '../news';

/**
 * Taça — eliminatória a jogo único com TODOS os clubes da pirâmide.
 * Uma eliminatória é jogada a cada CUP_EVERY_LEAGUE_ROUNDS jornadas da liga.
 * Empate no fim dos 90' → grandes penalidades (decididas pela seed).
 */

export { CUP_LEAGUE_ID, CUP_WINNER_PRIZE, cupRoundName };
export type { CupState };

/** Gera o sorteio da Taça para a época atual (baralha todos os clubes). */
export function generateCup(state: GameState): CupState {
  const clubIds = Object.keys(state.clubs);
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'cup', state.meta.season));
  const alive = [...clubIds];
  for (let i = alive.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [alive[i], alive[j]] = [alive[j]!, alive[i]!];
  }
  return {
    season: state.meta.season,
    alive,
    fixtures: [],
    currentRound: 1,
    totalRounds: Math.ceil(Math.log2(Math.max(2, alive.length))),
    winnerClubId: null,
  };
}

/**
 * Joga a próxima eliminatória completa. Ímpar → o último passa por isenção.
 * Muta o estado (fixtures, alive, prémio, notícias). Devolve os jogos disputados.
 */
export function playCupRound(state: GameState): Fixture[] {
  const cup = state.cup;
  if (cup.winnerClubId || cup.alive.length < 2) return [];

  const managedId = state.meta.managedClubId;
  const round = cup.currentRound;
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'cupround', cup.season, round));
  const played: Fixture[] = [];
  const winners: string[] = [];

  const entrants = [...cup.alive];
  // Isenção (bye) para o último se o número for ímpar.
  if (entrants.length % 2 !== 0) winners.push(entrants.pop()!);

  for (let i = 0; i < entrants.length; i += 2) {
    const homeId = entrants[i]!;
    const awayId = entrants[i + 1]!;
    const homeTactic = state.tactics[homeId];
    const awayTactic = state.tactics[awayId];
    if (!homeTactic || !awayTactic) { winners.push(homeId); continue; }

    const result = simulateMatch(
      homeId, awayId, homeTactic, awayTactic, state.players,
      deriveSeed(state.meta.rngSeed, 'cupmatch', cup.season, round, i),
    );

    // Empate → grandes penalidades (ligeiro favor a quem joga em casa).
    let winnerId: string;
    let pens = false;
    if (result.home.goals > result.away.goals) winnerId = homeId;
    else if (result.away.goals > result.home.goals) winnerId = awayId;
    else { pens = true; winnerId = rng.chance(0.55) ? homeId : awayId; }
    winners.push(winnerId);

    const fx: Fixture = {
      id: `cup_${cup.season}_${round}_${i}`,
      leagueId: CUP_LEAGUE_ID,
      round,
      homeClubId: homeId,
      awayClubId: awayId,
      result,
    };
    cup.fixtures.push(fx);
    played.push(fx);

    // Notícia para jogos do clube gerido.
    if (homeId === managedId || awayId === managedId) {
      const won = winnerId === managedId;
      const score = `${result.home.goals}-${result.away.goals}${pens ? ' (g.p.)' : ''}`;
      const opp = state.clubs[homeId === managedId ? awayId : homeId]?.name ?? '';
      addNews(state, 'CUP',
        won
          ? `Taça: ${state.clubs[managedId]?.shortName} elimina ${opp} (${score}) — ${cupRoundName(cup, round)}`
          : `Taça: eliminado por ${opp} (${score}) na ${cupRoundName(cup, round)}`);
    }
  }

  cup.alive = winners;
  cup.currentRound += 1;

  // Campeão da Taça?
  if (cup.alive.length === 1) {
    const champion = cup.alive[0]!;
    cup.winnerClubId = champion;
    const fin = state.finances[champion];
    if (fin) {
      fin.balance += CUP_WINNER_PRIZE;
      fin.transferBudget += Math.round(CUP_WINNER_PRIZE / 2);
    }
    if (champion === managedId) {
      state.career.trophies.push({ season: cup.season, label: 'Vencedor da Taça' });
      addNews(state, 'CUP', `🏆 CAMPEÕES DA TAÇA! Prémio de ${CUP_WINNER_PRIZE.toLocaleString('pt-PT')} €`);
    } else {
      addNews(state, 'CUP', `${state.clubs[champion]?.name ?? champion} vence a Taça.`);
    }
  }

  return played;
}
