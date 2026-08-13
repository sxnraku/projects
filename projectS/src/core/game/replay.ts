import { Fixture, GameState, hasPlan, MatchResult, Side, Tactic } from '../models';
import { deriveSeed } from '../engine/rng';
import { MatchContext, simulateMatch, TacticChange } from '../engine';
import { revertResult, applyResult } from '../season';
import { managedLeagueId } from './advance';
import { type FanMatchInput, fanMood, homeSupport, replaceMatchReaction } from './fans';
import { isDerby } from './rivals';
import { gamePlan } from './opponent';

/**
 * Contexto do jogo (dérbi + apoio da bancada) para uma re-simulação.
 *
 * Sem isto, tanto a "segunda hipótese" como qualquer substituição ao vivo
 * re-simulavam o jogo SEM saber que era um dérbi e SEM o apoio dos adeptos: o
 * mesmo jogo valia coisas diferentes só por se ter mexido nele.
 */
function contextOf(
  state: GameState, homeId: string, awayId: string, previous: MatchResult,
): MatchContext {
  // O contexto GRAVADO manda sempre: é o que produziu os minutos que o
  // utilizador já viu. Só se o jogo vier de um save antigo (sem `ctx`) é que se
  // recalcula — e aí recalcular é o melhor que há.
  if (previous.ctx) {
    return {
      derby: previous.ctx.derby,
      homeSupport: previous.ctx.homeSupport,
      homePlan: previous.ctx.homePlan,
      awayPlan: previous.ctx.awayPlan,
    };
  }
  const managedId = state.meta.managedClubId;
  return {
    derby: isDerby(state, homeId, awayId),
    homeSupport: homeId === managedId ? homeSupport(fanMood(state)) : undefined,
    homePlan: homeId === managedId && hasPlan(gamePlan(state)) ? gamePlan(state) : undefined,
    awayPlan: awayId === managedId && hasPlan(gamePlan(state)) ? gamePlan(state) : undefined,
  };
}

/**
 * "Segunda hipótese" (slot de anúncio rewarded): re-simula um jogo já jogado
 * da liga do clube gerido com uma seed diferente, revertendo o resultado
 * antigo da tabela e aplicando o novo.
 *
 * O novo resultado pode ser melhor OU pior — é uma segunda hipótese, não uma
 * vitória garantida. Determinístico: mesma tentativa → mesmo resultado.
 *
 * @returns o novo resultado, ou null se o fixture não existir/não estiver jogado.
 */
export function replayFixture(state: GameState, fixtureId: string): MatchResult | null {
  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const table = state.standings[leagueId];
  if (!schedule || !table) return null;

  const fixture = schedule.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !fixture.result) return null;

  const homeTactic = state.tactics[fixture.homeClubId];
  const awayTactic = state.tactics[fixture.awayClubId];
  if (!homeTactic || !awayTactic) return null;

  // Guarda o resultado antigo: é preciso para DESFAZER o que ele provocou nos
  // adeptos, na moral e nos totalizadores da época.
  const old = fixture.result;

  // Reverte o resultado antigo da tabela.
  revertResult(table, fixture.result);

  // Re-simula com seed derivada diferente da original.
  const newResult = simulateMatch(
    fixture.homeClubId,
    fixture.awayClubId,
    homeTactic,
    awayTactic,
    state.players,
    deriveSeed(state.meta.rngSeed, 'replay', fixtureId, fixture.result.seed),
    undefined,
    contextOf(state, fixture.homeClubId, fixture.awayClubId, fixture.result),
  );

  fixture.result = newResult;
  applyResult(table, newResult);
  swapConsequences(state, fixture, old, newResult);
  return newResult;
}

/**
 * Troca as consequências de um jogo que foi REPETIDO.
 *
 * A tabela já é revertida e reaplicada por quem chama; o problema era tudo o
 * resto. O humor dos adeptos, a moral do plantel e os totalizadores da época
 * tinham sido calculados a partir do resultado ANTIGO e ninguém lhes tocava:
 * perdias 0-3, a bancada afundava, repetias e ganhavas 2-0, e a bancada ficava
 * afundada na mesma.
 *
 * O que NÃO se desfaz, de propósito: lesões e cartões. São consequências
 * físicas já registadas no jogador, e "des-lesionar" alguém porque se viu o
 * jogo outra vez seria pior do que o problema — a segunda hipótese troca o
 * RESULTADO, não apaga o que aconteceu aos corpos.
 */
function swapConsequences(
  state: GameState, fixture: Fixture, oldResult: MatchResult, newResult: MatchResult,
): void {
  const managedId = state.meta.managedClubId;
  const isHome = fixture.homeClubId === managedId;
  const isAway = fixture.awayClubId === managedId;
  if (!isHome && !isAway) return;

  // --- totalizadores da época: tira os do jogo antigo, põe os do novo ---
  const applyStats = (r: MatchResult, sign: 1 | -1) => {
    const ps = r.playerStats;
    if (!ps) return;
    for (const pid in ps) {
      const p = state.players[pid];
      if (!p) continue;
      const st = ps[pid]!;
      const c = p.condition;
      if (st.goals) c.seasonGoals = Math.max(0, (c.seasonGoals ?? 0) + sign * st.goals);
      if (st.assists) c.seasonAssists = Math.max(0, (c.seasonAssists ?? 0) + sign * st.assists);
      if (st.rating) {
        c.seasonRating = Math.max(0, (c.seasonRating ?? 0) + sign * st.rating);
        c.seasonApps = Math.max(0, (c.seasonApps ?? 0) + sign);
      }
    }
  };
  applyStats(oldResult, -1);
  applyStats(newResult, 1);

  // --- moral do onze: o mesmo cálculo do fecho da semana, ao contrário ---
  const derby = isDerby(state, fixture.homeClubId, fixture.awayClubId);
  const scale = derby ? 2.2 : 1;
  const deltaOf = (r: MatchResult) => {
    const mine = isHome ? r.home.goals : r.away.goals;
    const theirs = isHome ? r.away.goals : r.home.goals;
    return Math.round((mine > theirs ? 3 : mine < theirs ? -4 : -1) * scale);
  };
  const moraleShift = deltaOf(newResult) - deltaOf(oldResult);
  if (moraleShift !== 0) {
    const tactic = state.tactics[managedId];
    for (const slot of tactic?.lineup ?? []) {
      const p = state.players[slot.playerId];
      if (!p) continue;
      p.condition.morale = Math.max(10, Math.min(95, p.condition.morale + moraleShift));
    }
  }

  // --- adeptos: desfaz a reação antiga e aplica a nova ---
  const club = state.clubs[managedId];
  const oppId = isHome ? fixture.awayClubId : fixture.homeClubId;
  const opp = state.clubs[oppId];
  if (!club) return;
  const inputOf = (r: MatchResult): FanMatchInput => ({
    goalsFor: isHome ? r.home.goals : r.away.goals,
    goalsAgainst: isHome ? r.away.goals : r.home.goals,
    myReputation: club.reputation,
    oppReputation: opp?.reputation ?? 50,
    derby,
    oppName: opp?.shortName ?? '',
  });
  replaceMatchReaction(state, inputOf(oldResult), inputOf(newResult));
}

/** Um ajuste em jogo: onze/mentalidade/ritmo a entrar em vigor a partir de `minute`. */
export interface MatchAdjustment {
  minute: number; // 45 = intervalo; qualquer minuto durante a reprodução
  lineup: Tactic['lineup'];
  mentality: Tactic['mentality'];
  tempo: Tactic['tempo'];
  /**
   * PALESTRA ao intervalo: multiplicador de força a partir deste minuto.
   * Ausente = o treinador não falou (ou falou e não mexeu nada).
   */
  talkBoost?: number;
}

/**
 * Ajustes EM JOGO (intervalo e substituições ao vivo): re-simula o jogo do clube
 * gerido aplicando, por ordem, cada mudança de tática no seu minuto. Os minutos já
 * vistos ficam idênticos (mesma seed da jornada); só o que vem depois de cada
 * mudança diverge. Reverte-se o resultado antigo da tabela e aplica-se o novo. Só
 * jogos de LIGA (os de Taça usam outra seed — devolve null, a UI segue sem mexer).
 *
 * As mudanças são CUMULATIVAS: cada `lineup` é o onze completo naquele momento, por
 * iso substituir ao 45' e depois ao 60' mantém as trocas anteriores.
 *
 * @returns o novo resultado, ou null se não aplicável.
 */
export function applyMatchChanges(
  state: GameState,
  fixtureId: string,
  adjustments: MatchAdjustment[],
): MatchResult | null {
  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const table = state.standings[leagueId];
  if (!schedule || !table) return null;

  const fixture = schedule.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !fixture.result) return null;

  const managedId = state.meta.managedClubId;
  const managedSide: Side | null = fixture.homeClubId === managedId ? 'HOME'
    : fixture.awayClubId === managedId ? 'AWAY' : null;
  if (!managedSide) return null;

  const homeTactic = state.tactics[fixture.homeClubId];
  const awayTactic = state.tactics[fixture.awayClubId];
  if (!homeTactic || !awayTactic) return null;

  // Cada ajuste vira uma mudança de tática do lado gerido (o outro lado mantém-se).
  const base = managedSide === 'HOME' ? homeTactic : awayTactic;
  const changes: TacticChange[] = adjustments.map((a) => ({
    side: managedSide,
    tactic: { ...base, lineup: a.lineup, mentality: a.mentality, tempo: a.tempo },
    minute: a.minute,
    talkBoost: a.talkBoost,
  }));

  revertResult(table, fixture.result);
  // MESMA seed da jornada (ver season.ts playRound: baseSeed ^ round*1000003) →
  // os minutos antes de cada corte reproduzem-se iguais; o resto diverge.
  const baseSeed = state.meta.rngSeed ^ (fixture.round * 1000003);
  const newResult = simulateMatch(
    fixture.homeClubId, fixture.awayClubId, homeTactic, awayTactic, state.players, baseSeed,
    changes,
    contextOf(state, fixture.homeClubId, fixture.awayClubId, fixture.result),
  );
  fixture.result = newResult;
  applyResult(table, newResult);
  return newResult;
}
