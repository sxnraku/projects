import { effectiveOverall, GameState, naturalOverall, Player, Position } from '../models';
import { matchdayGate, requiredReputation } from '../economy';
import { matchFatigue } from '../engine/fatigue';
import { currentPosition, managedLeagueId, nextRound, recentFormOf } from './advance';
import { generateRenewalReminders } from './inbox';

/**
 * Pré-jogo — obrigar o treinador a OLHAR antes de carregar em "Jogar".
 *
 * Sem isto o botão verde é o único elemento com peso visual no ecrã inicial e o
 * jogador avança semanas sem consultar plantel, tática ou finanças. Aqui
 * calculamos as três verificações que aparecem por cima do botão (onze,
 * dinheiro, adversário) e a rotação automática que resolve o problema em 1 toque.
 */

/** Abaixo disto um titular é "exausto" — chega para travar o avanço. */
export const TIRED_FITNESS = 60;
/** Abaixo disto já vale a pena avisar no ecrã de Plantel. */
export const ROTATION_ALERT_FITNESS = 70;
/** Últimas N jornadas: janela em que a Lei Bosman fica ativa (pré-contratos). */
export const BOSMAN_WINDOW_ROUNDS = 6;

/** Jornadas que faltam para o fim da época na liga do clube gerido. */
export function roundsRemaining(state: GameState): number {
  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const round = nextRound(state, leagueId);
  if (!schedule || round === null) return 0;
  return schedule.totalRounds - round + 1;
}

/** Estamos nas últimas 6 jornadas? (janela Bosman de pré-contratos). */
export function inBosmanWindow(state: GameState): boolean {
  const r = roundsRemaining(state);
  return r > 0 && r <= BOSMAN_WINDOW_ROUNDS;
}

export interface ExpiringStarter {
  playerId: string;
  name: string;
  position: Position;
}

/**
 * Titulares cujo contrato expira no fim desta época — o núcleo do risco Bosman.
 * Se não os renovares, saem a custo zero e a IA pode levá-los já em pré-contrato.
 */
export function expiringStarters(state: GameState): ExpiringStarter[] {
  const clubId = state.meta.managedClubId;
  const tactic = state.tactics[clubId];
  if (!tactic) return [];
  const out: ExpiringStarter[] = [];
  for (const slot of tactic.lineup) {
    const p = state.players[slot.playerId];
    if (p && p.contractUntil === state.meta.season) {
      out.push({ playerId: p.id, name: p.lastName, position: slot.position });
    }
  }
  return out;
}

export interface LineupWarning {
  playerId: string;
  name: string;
  position: Position;
  fitness: number;
  injured: boolean;
}

export interface MatchdayPreview {
  round: number;
  isHome: boolean;
  opponent: {
    id: string;
    name: string;
    shortName: string;
    position: number;
    form: ('W' | 'D' | 'L')[];
  } | null;
  /** Titulares lesionados ou exaustos (ordenados: lesionados primeiro). */
  warnings: LineupWarning[];
  /** Bilheteira estimada (0 se o jogo é fora). */
  projectedGate: number;
  projectedAttendance: number;
  /** Custos fixos da semana (salários + instalações + staff). */
  projectedCosts: number;
  /** Média do overall efetivo do onze, 1 casa decimal. */
  lineupOverall: number;
  /** Fitness que cada titular vai perder com a tática atual. */
  fatiguePerMatch: number;
  /** Titulares em fim de contrato (só preenchido na janela Bosman). */
  expiringStarters: ExpiringStarter[];
}

/** Média do overall efetivo do onze de um clube (0 se não houver tática). */
export function lineupOverall(state: GameState, clubId: string): number {
  const tactic = state.tactics[clubId];
  if (!tactic || tactic.lineup.length === 0) return 0;
  const total = tactic.lineup.reduce((sum, slot) => {
    const p = state.players[slot.playerId];
    return sum + (p ? effectiveOverall(p, slot.position) : 0);
  }, 0);
  return Math.round((total / tactic.lineup.length) * 10) / 10;
}

/** Titulares que não estão em condições de jogar (lesionados ou sob `threshold`). */
export function lineupWarnings(
  state: GameState,
  clubId: string,
  threshold = TIRED_FITNESS,
): LineupWarning[] {
  const tactic = state.tactics[clubId];
  if (!tactic) return [];
  const out: LineupWarning[] = [];
  for (const slot of tactic.lineup) {
    const p = state.players[slot.playerId];
    if (!p) continue;
    const injured = p.condition.status !== 'AVAILABLE';
    if (!injured && p.condition.fitness >= threshold) continue;
    out.push({
      playerId: p.id,
      name: p.lastName,
      position: slot.position,
      fitness: p.condition.fitness,
      injured,
    });
  }
  // Lesionados primeiro, depois do mais cansado para o menos.
  return out.sort((a, b) =>
    a.injured === b.injured ? a.fitness - b.fitness : a.injured ? -1 : 1);
}

/**
 * Tudo o que o cartão de pré-jogo precisa. Null se a época já acabou (não há
 * próximo jogo) ou se o estado ainda não está pronto.
 */
export function matchdayPreview(state: GameState): MatchdayPreview | null {
  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  const tactic = state.tactics[clubId];
  if (!club || !fin || !tactic) return null;

  const leagueId = managedLeagueId(state);
  const schedule = state.schedules[leagueId];
  const round = nextRound(state, leagueId);
  if (!schedule || round === null) return null;

  const fixture = schedule.fixtures.find(
    (f) => f.round === round && (f.homeClubId === clubId || f.awayClubId === clubId),
  );
  const isHome = fixture?.homeClubId === clubId;

  let opponent: MatchdayPreview['opponent'] = null;
  if (fixture) {
    const oppId = isHome ? fixture.awayClubId : fixture.homeClubId;
    const opp = state.clubs[oppId];
    if (opp) {
      opponent = {
        id: opp.id,
        name: opp.name,
        shortName: opp.shortName,
        position: currentPosition(state, opp.leagueId, opp.id),
        form: recentFormOf(state, opp.id, 3),
      };
    }
  }

  const gate = isHome
    ? matchdayGate(club, recentFormOf(state, clubId, 5))
    : { attendance: 0, revenue: 0 };

  return {
    round,
    isHome,
    opponent,
    warnings: lineupWarnings(state, clubId),
    projectedGate: gate.revenue,
    projectedAttendance: gate.attendance,
    projectedCosts: fin.expenses.wages + fin.expenses.facilities + fin.expenses.staff,
    lineupOverall: lineupOverall(state, clubId),
    fatiguePerMatch: matchFatigue(tactic),
    // O 4º aviso só faz sentido no fim da época, quando ainda dá para agir.
    expiringStarters: inBosmanWindow(state) ? expiringStarters(state) : [],
  };
}

/** Uma sondagem Bosman: clube que corteja um jogador nosso em fim de contrato. */
export interface BosmanApproach {
  playerId: string;
  suitorClubId: string;
}

/**
 * Lei Bosman — nas últimas jornadas, clubes cortejam os nossos jogadores em fim
 * de contrato com pré-contratos (assinam de graça para a época seguinte).
 *
 * A regra existe para dar AVISO justo: garante que há um lembrete de renovação
 * na caixa de entrada e devolve as sondagens para o jogo as anunciar. Assim o
 * treinador tem tempo de renovar ou vender antes de os perder a custo zero — em
 * vez de descobrir a perda só no fim da época.
 */
export function runBosmanApproaches(state: GameState): BosmanApproach[] {
  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  if (!club) return [];
  const season = state.meta.season;

  // Garante um lembrete de renovação (com botão "Renovar") para quem expira.
  generateRenewalReminders(state);

  const suitors = Object.values(state.clubs)
    .filter((c) => c.id !== clubId)
    .sort((a, b) => b.reputation - a.reputation);

  const approaches: BosmanApproach[] = [];
  for (const id of club.squad) {
    const p = state.players[id];
    if (!p || p.contractUntil !== season) continue; // já renovado ou não expira
    const need = requiredReputation(naturalOverall(p));
    const suitor = suitors.find((c) => c.reputation >= need);
    if (suitor) approaches.push({ playerId: p.id, suitorClubId: suitor.id });
  }
  return approaches;
}

export interface RotationResult {
  swapped: number;
  /** Descrições "X entra por Y" para mostrar ao utilizador. */
  changes: string[];
}

/**
 * Substitui titulares lesionados/exaustos pelos melhores suplentes frescos.
 *
 * Critério: só entra quem está disponível E tem pelo menos +15 de fitness que o
 * titular (ou 50+ se o titular está lesionado) — assim a rotação nunca troca um
 * cansado por outro igualmente cansado. Entre os elegíveis escolhe o melhor por
 * overall efetivo NA POSIÇÃO do slot, ponderado pela frescura.
 *
 * Muta a tática do clube gerido. Devolve o que mudou.
 */
export function autoRotate(state: GameState, threshold = TIRED_FITNESS): RotationResult {
  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  const tactic = state.tactics[clubId];
  if (!club || !tactic) return { swapped: 0, changes: [] };

  const inLineup = new Set(tactic.lineup.map((s) => s.playerId));
  const changes: string[] = [];

  for (const slot of tactic.lineup) {
    const cur = state.players[slot.playerId];
    if (!cur) continue;
    const injured = cur.condition.status !== 'AVAILABLE';
    if (!injured && cur.condition.fitness >= threshold) continue;

    const minFitness = injured ? 50 : cur.condition.fitness + 15;

    let best: Player | null = null;
    let bestScore = -1;
    for (const id of club.squad) {
      if (inLineup.has(id)) continue;
      const p = state.players[id];
      if (!p || p.condition.status !== 'AVAILABLE') continue;
      if (p.condition.fitness < minFitness) continue;
      const score = effectiveOverall(p, slot.position) * (p.condition.fitness / 100);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) continue;

    inLineup.delete(cur.id);
    inLineup.add(best.id);
    slot.playerId = best.id;
    changes.push(`${best.lastName} entra por ${cur.lastName}`);
  }

  if (changes.length > 0) {
    tactic.bench = club.squad.filter((id) => !inLineup.has(id)).slice(0, 7);
  }
  return { swapped: changes.length, changes };
}
