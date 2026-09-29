import {
  CUP_LEAGUE_ID,
  CUP_WINNER_PRIZE,
  cupRoundMsg,
  cupStageParam,
  CupState,
  Fixture,
  GameState,
  hasPlan,
} from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import { simulateMatch } from '../engine';
import { addNews } from '../news';
import { moveMoney } from '../economy';

/**
 * Taça — eliminatória com TODOS os clubes da pirâmide.
 * Uma eliminatória é jogada a cada CUP_EVERY_LEAGUE_ROUNDS jornadas da liga.
 *
 * Duas regras que fazem a Taça parecer uma Taça e não um campeonato curto:
 *
 *  1. **Quem é de divisão inferior recebe em casa.** É assim na Taça a sério, e
 *     é de onde vem a chamada magia: o pequeno agarra-se ao seu campo e ao seu
 *     público. Antes o campo era sorteado, e o grande jogava em casa metade das
 *     vezes sem qualquer razão.
 *  2. **As meias-finais são a duas mãos.** Uma eliminatória a um jogo é uma
 *     moeda ao ar; a duas mãos dá tempo para uma reviravolta, que é o que se
 *     lembra. A final continua a um jogo, como deve ser.
 *
 * Empate no fim → grandes penalidades (decididas pela seed).
 */

export { CUP_LEAGUE_ID, CUP_WINNER_PRIZE, cupRoundMsg, cupStageParam };
export type { CupState };

/**
 * Ordena um par pondo o clube MAIS PEQUENO primeiro — é ele que recebe.
 *
 * O critério é o escalão (tier maior = divisão mais baixa) e, em caso de empate,
 * a reputação. Sem isto o campo saía do sorteio, e um 3.ª divisão recebia o
 * campeão só metade das vezes — que é precisamente a metade das histórias.
 */
export function smallerFirst(state: GameState, a: string, b: string): [string, string] {
  const rank = (id: string) => {
    const club = state.clubs[id];
    const tier = club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;
    return { tier, rep: club?.reputation ?? 0 };
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra.tier !== rb.tier) return ra.tier > rb.tier ? [a, b] : [b, a];
  if (ra.rep !== rb.rep) return ra.rep < rb.rep ? [a, b] : [b, a];
  return [a, b];
}

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

  // Meias-finais a duas mãos: é a ronda em que sobram 4 (2 jogos). A final
  // (`alive.length === 2`) fica a jogo único.
  const twoLegs = entrants.length === 4;

  for (let i = 0; i < entrants.length; i += 2) {
    const a = entrants[i]!;
    const b = entrants[i + 1]!;
    // MAGIA DA TAÇA: o de escalão mais baixo (tier maior) recebe. Empate de
    // escalão desfaz-se pela reputação — o mais pequeno joga em casa.
    const [homeId, awayId] = smallerFirst(state, a, b);
    const homeTactic = state.tactics[homeId];
    const awayTactic = state.tactics[awayId];
    if (!homeTactic || !awayTactic) { winners.push(homeId); continue; }

    // O PLANO contra o adversário vale em todas as provas — seria estranho a
    // marcação individual existir na liga e desaparecer na Taça. Lê-se direto
    // da carreira: importar `core/game` daqui criaria um ciclo.
    const mId = state.meta.managedClubId;
    const plan = hasPlan(state.career.gamePlan) ? state.career.gamePlan : undefined;
    const result = simulateMatch(
      homeId, awayId, homeTactic, awayTactic, state.players,
      deriveSeed(state.meta.rngSeed, 'cupmatch', cup.season, round, i),
      undefined,
      { homePlan: homeId === mId ? plan : undefined, awayPlan: awayId === mId ? plan : undefined },
    );

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

    // Agregado. A uma mão é o próprio jogo; a duas, soma-se a segunda mão com
    // os campos trocados. Sem regra de golo fora — foi abolida, e somar golos
    // fora a dobrar tornava a primeira mão em casa um castigo.
    let aggHome = result.home.goals;
    let aggAway = result.away.goals;
    if (twoLegs) {
      const leg2 = simulateMatch(
        awayId, homeId, awayTactic, homeTactic, state.players,
        deriveSeed(state.meta.rngSeed, 'cupmatch2', cup.season, round, i),
        undefined,
        { homePlan: awayId === mId ? plan : undefined, awayPlan: homeId === mId ? plan : undefined },
      );
      const fx2: Fixture = {
        id: `cup_${cup.season}_${round}_${i}_2`,
        leagueId: CUP_LEAGUE_ID,
        round,
        homeClubId: awayId,
        awayClubId: homeId,
        result: leg2,
      };
      cup.fixtures.push(fx2);
      played.push(fx2);
      aggHome += leg2.away.goals; // o "home" da 1ª mão joga fora na 2ª
      aggAway += leg2.home.goals;
    }

    // Empate no agregado → grandes penalidades (ligeiro favor a quem decide em casa).
    let winnerId: string;
    let pens = false;
    if (aggHome > aggAway) winnerId = homeId;
    else if (aggAway > aggHome) winnerId = awayId;
    else { pens = true; winnerId = rng.chance(0.55) ? (twoLegs ? awayId : homeId) : (twoLegs ? homeId : awayId); }
    winners.push(winnerId);

    // Notícia para jogos do clube gerido.
    if (homeId === managedId || awayId === managedId) {
      const won = winnerId === managedId;
      const mineAgg = homeId === managedId ? aggHome : aggAway;
      const theirsAgg = homeId === managedId ? aggAway : aggHome;
      const score = `${mineAgg}-${theirsAgg}${pens ? ' (g.p.)' : ''}${twoLegs ? ' (ag.)' : ''}`;
      const opp = state.clubs[homeId === managedId ? awayId : homeId]?.name ?? '';
      const stage = cupStageParam(cup, round);
      if (won) {
        addNews(state, 'CUP', 'news.cup.win', { club: state.clubs[managedId]?.shortName ?? '', opp, score, stage });
      } else {
        addNews(state, 'CUP', 'news.cup.out', { opp, score, stage });
      }
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
      moveMoney(fin, CUP_WINNER_PRIZE);
    }
    if (champion === managedId) {
      state.career.trophies.push({ season: cup.season, key: 'trophy.cup' });
      addNews(state, 'CUP', 'news.cup.championManaged', { amount: CUP_WINNER_PRIZE.toLocaleString('pt-PT') });
    } else {
      addNews(state, 'CUP', 'news.cup.champion', { club: state.clubs[champion]?.name ?? champion });
    }
  }

  return played;
}
