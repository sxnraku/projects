import {
  effectiveOverall,
  effectiveOverallFine,
  Formation,
  LineupSlot,
  Player,
  Position,
  Tactic,
} from '../models';

/** Um jogador esgotado rende ~65% na ESCOLHA do onze — o suficiente para rodar os
 *  exaustos, mas sem trocar um craque só por ter perdido um pouco de frescura. */
const FITNESS_FLOOR_WEIGHT = 0.65;
/** Acima disto o jogador está fresco que baste: a energia NÃO desempata. */
const FRESH_ENOUGH = 70;

/**
 * Peso da frescura: 1.0 enquanto o jogador estiver acima de `FRESH_ENOUGH`, e só
 * daí para baixo é que desce (até 0.65 a zero).
 *
 * Antes o peso descia desde os 100, por isso mesmo com o plantel inteiro a 99%
 * de energia o "onze automático" preferia um suplente 1% mais fresco a um titular
 * melhor — e o onze escolhido ficava com overall MAIS BAIXO do que o manual, que
 * foi exatamente o que o playtest apanhou. Rodar só faz sentido quando alguém
 * está mesmo cansado.
 */
function fitnessWeight(fitness: number): number {
  const fit = Math.max(0, Math.min(100, fitness));
  if (fit >= FRESH_ENOUGH) return 1;
  return FITNESS_FLOOR_WEIGHT + (1 - FITNESS_FLOOR_WEIGHT) * (fit / FRESH_ENOUGH);
}

/**
 * Pontuação de SELEÇÃO: qualidade na posição ponderada pela energia. É isto que
 * o "onze automático" maximiza — os melhores jogadores COM energia, cada um na
 * sua posição.
 */
function selectionScore(p: Player, position: Position): number {
  return effectiveOverallFine(p, position) * fitnessWeight(p.condition.fitness);
}

/** Distribuição de posições por formação. A ordem define os slots do onze. */
export const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  // ---- Linha de 4 ----
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
  '4-4-2 losango': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'AM', 'ST', 'ST'],
  '4-4-1-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'AM', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-3-3 recuado': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-3-1-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'AM', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'AM', 'RW', 'LW', 'ST'],
  // Um "4-2-4" teria exatamente as mesmas posições do 4-4-2 (os alas apenas
  // desenhados mais à frente), por isso jogaria igual. Em vez disso, o 4-1-3-2
  // troca um médio por um trinco — uma diferença que o motor sente mesmo.
  '4-1-3-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'RW', 'CM', 'LW', 'ST', 'ST'],
  // ---- Linha de 3 ----
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'DM', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
  // Alas puros (e não laterais) — é o que distingue este da linha de 5, além de
  // ser a leitura certa de um sistema com três centrais.
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'RW', 'CM', 'CM', 'LW', 'RW', 'ST', 'LW'],
  // ---- Linha de 5 ----
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'ST', 'ST'],
  '5-4-1': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST'],
};

/**
 * Assinatura de uma formação: as posições ordenadas. Duas formações com a mesma
 * assinatura são a MESMA coisa para o motor — só mudam de nome. Serve para o
 * teste que impede formações repetidas.
 */
export function formationSignature(formation: Formation): string {
  return [...FORMATION_POSITIONS[formation]].sort().join(',');
}

/**
 * Escolhe automaticamente o melhor onze para uma formação, a partir do plantel.
 *
 * Para cada slot (na ordem da formação — as posições especialistas primeiro),
 * escolhe o jogador DISPONÍVEL com maior `selectionScore` NESSA posição que ainda
 * não foi usado: melhor qualidade na posição, ponderada pela ENERGIA. Assim os
 * craques ficam na sua posição e os esgotados dão lugar a suplentes frescos.
 */
export function autoPickLineup(
  clubId: string,
  squadIds: string[],
  players: Record<string, Player>,
  formation: Formation = Formation.F_4_3_3,
): Tactic {
  const positions = FORMATION_POSITIONS[formation];
  const used = new Set<string>();
  const lineup: LineupSlot[] = [];

  // Suspenso NÃO é escolhível: aparecia no onze e o jogo deixava-o alinhar.
  const isAvailable = (id: string): boolean => {
    if (used.has(id)) return false;
    const p = players[id];
    return !!p && p.condition.status === 'AVAILABLE' && (p.condition.suspended ?? 0) <= 0;
  };

  for (const position of positions) {
    let bestId: string | null = null;
    let bestScore = -1;
    for (const id of squadIds) {
      if (!isAvailable(id)) continue;
      const score = selectionScore(players[id]!, position);
      if (score > bestScore) { bestScore = score; bestId = id; }
    }
    if (bestId) { used.add(bestId); lineup.push({ position, playerId: bestId }); }
  }

  // Banco = os melhores 7 disponíveis que sobraram, do mais forte (na sua posição
  // natural, com energia) para o mais fraco — para as substituições terem opções.
  const bench = squadIds
    .filter((id) => isAvailable(id))
    .sort((a, b) => benchScore(players[b]!) - benchScore(players[a]!))
    .slice(0, 7);
  const captainId = lineup.length > 0
    ? [...lineup].sort((a, b) => overallOf(b, players) - overallOf(a, players))[0]!.playerId
    : null;

  return {
    clubId,
    formation,
    mentality: 'BALANCED',
    tempo: 'NORMAL',
    pressing: 5,
    defensiveLine: 5,
    creativity: 5,
    lineup,
    bench,
    captainId,
    penaltyTakerId: bestPenaltyTaker(lineup, players),
  };
}

/**
 * Garante que o onze de um clube só contém jogadores do seu plantel atual.
 * Se algum slot referenciar um jogador que já saiu (vendido/livre), volta a
 * escolher o melhor onze na formação atual. Muta o estado (a tática do clube).
 */
export function ensureValidLineup(
  clubId: string,
  squadIds: string[],
  players: Record<string, Player>,
  tactics: Record<string, import('../models').Tactic>,
): void {
  const tactic = tactics[clubId];
  if (!tactic) return;
  const squad = new Set(squadIds);
  const broken = tactic.lineup.some((s) => !squad.has(s.playerId));
  if (!broken) return;
  const fresh = autoPickLineup(clubId, squadIds, players, tactic.formation);
  // Preserva as instruções escolhidas pelo utilizador; só o onze é recalculado.
  tactic.lineup = fresh.lineup;
  tactic.bench = fresh.bench;
  tactic.captainId = fresh.captainId;
  tactic.penaltyTakerId = fresh.penaltyTakerId;
}

/**
 * Troca a FORMAÇÃO de um clube e reescolhe o onze — preservando TUDO o que o
 * treinador configurou (mentalidade, ritmo, pressão, linha defensiva,
 * criatividade) e mantendo capitão e marcador de penáltis se continuarem no onze.
 *
 * Existe porque a UI montava a tática nova a partir do `autoPickLineup` e só
 * copiava de volta a mentalidade e o ritmo: mudar de formação repunha
 * silenciosamente a pressão, a linha e a criatividade a 5 ("meto no 10/10 e
 * volta aos 5/10" no playtest). Com a nova tática a nascer da ANTIGA, esquecer
 * um campo deixa de ser possível.
 */
export function reselectLineup(
  previous: import('../models').Tactic,
  clubId: string,
  squadIds: string[],
  players: Record<string, Player>,
  formation: Formation,
): import('../models').Tactic {
  const picked = autoPickLineup(clubId, squadIds, players, formation);
  const inLineup = new Set(picked.lineup.map((s) => s.playerId));
  return {
    ...previous, // instruções do treinador — nunca se perdem numa troca de onze
    formation,
    lineup: picked.lineup,
    bench: picked.bench,
    captainId: previous.captainId && inLineup.has(previous.captainId)
      ? previous.captainId : picked.captainId,
    penaltyTakerId: previous.penaltyTakerId && inLineup.has(previous.penaltyTakerId)
      ? previous.penaltyTakerId : picked.penaltyTakerId,
  };
}

/**
 * Refaz o onze de TODOS os clubes da IA (o gerido é do utilizador).
 *
 * O `autoPickLineup` já pondera a ENERGIA, por isso isto é a "rotação" da IA.
 * Sem ela a IA jogava a época inteira com os mesmos onze exaustos enquanto o
 * utilizador rodava a cada jornada: numa amostra de 10 épocas, só esse detalhe
 * levava o clube gerido de uma média de 12.4º para 6.1º na 1ª época — o jogo
 * parecia fácil porque o adversário se auto-sabotava, não porque o treinador
 * fosse bom.
 *
 * Preserva as instruções táticas (mentalidade/ritmo/sliders) — só o onze, o
 * banco, o capitão e o marcador de penáltis são recalculados.
 */
export function refreshAiLineups(state: import('../models').GameState): void {
  for (const club of Object.values(state.clubs)) {
    if (club.id === state.meta.managedClubId || club.european) continue;
    const tactic = state.tactics[club.id];
    if (!tactic) continue;
    const fresh = autoPickLineup(club.id, club.squad, state.players, tactic.formation);
    if (fresh.lineup.length === 0) continue; // plantel vazio: fica como estava
    tactic.lineup = fresh.lineup;
    tactic.bench = fresh.bench;
    tactic.captainId = fresh.captainId;
    tactic.penaltyTakerId = fresh.penaltyTakerId;
  }
}

function overallOf(slot: LineupSlot, players: Record<string, Player>): number {
  const p = players[slot.playerId];
  return p ? effectiveOverall(p, slot.position) : 0;
}

/** Valor de um jogador para o banco: qualidade na posição natural, com energia. */
function benchScore(p: Player): number {
  return selectionScore(p, p.positions[0]);
}

/** Melhor marcador de penáltis = maior finalização no onze. */
function bestPenaltyTaker(lineup: LineupSlot[], players: Record<string, Player>): string | null {
  let bestId: string | null = null;
  let best = -1;
  for (const slot of lineup) {
    const p = players[slot.playerId];
    if (p && p.attributes.finishing > best) { best = p.attributes.finishing; bestId = p.id; }
  }
  return bestId;
}
