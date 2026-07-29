/**
 * Rede de OLHEIROS — profundidade de mercado coesa com as instalações.
 *
 * Sem olheiros, o mercado seria informação perfeita (vês tudo de todos). Aqui:
 *  - Jogadores que não são teus mostram uma ESTIMATIVA de overall e potencial
 *    (uma banda, tanto mais larga quanto pior a tua rede de olheiros).
 *  - Espiar um jogador → relatório completo (valores EXATOS + atributos).
 *  - Espiar uma liga → descobre PROMESSAS (jovens de alto potencial).
 *  - Só podes CONTRATAR um jogador depois de o teres espiado (e na janela).
 *
 * Tudo escala com o nível da instalação `scouting` (1-5): nº de olheiros a
 * trabalhar em simultâneo, alcance (divisões), velocidade e precisão.
 */
import { GameState, Player, naturalOverall } from '../models';
import { ScoutMission, ScoutingState } from '../career';
import { reachability } from './offers';

// ----------------------------------------------------------------------------
// Configuração por NÍVEL da instalação (1..5)
// ----------------------------------------------------------------------------

/** Missões em simultâneo (olheiros a trabalhar). */
export function scoutSlots(level: number): number {
  return Math.max(1, Math.min(5, level));
}

/** Jornadas que um relatório demora a ficar pronto (melhor nível = mais rápido). */
export function scoutRounds(level: number): number {
  return Math.max(1, 6 - level); // L1=5 … L5=1
}

/** Largura (± em pontos 0-20) da estimativa antes de espiar. Melhor nível = mais preciso. */
/**
 * Meia-largura (± em pontos 0-100) do INTERVALO DE POTENCIAL antes de sondar.
 * Apertado e realista: L1 = ±6 (janela de ~12, ex.: 78-90), até L5 = ±2.
 */
export function potentialHalfWidth(level: number): number {
  return Math.max(2, 7 - level); // L1=±6 … L5=±2
}

/** Uma liga está ao alcance dos teus olheiros? (|diferença de divisão| ≤ nível-1) */
export function tierInRange(ownTier: number, tier: number, level: number): boolean {
  return Math.abs(tier - ownTier) <= level - 1;
}

// ----------------------------------------------------------------------------
// Acesso ao estado
// ----------------------------------------------------------------------------

export function scoutingLevel(state: GameState): number {
  return state.clubs[state.meta.managedClubId]?.facilities.scouting ?? 1;
}

/** Devolve o estado de scouting, inicializando-o (e migrando saves antigos). */
export function getScouting(state: GameState): ScoutingState {
  if (!state.career.scouting) {
    state.career.scouting = { known: [], missions: [], prospects: [] };
  }
  return state.career.scouting;
}

function ownTierOf(state: GameState): number {
  const club = state.clubs[state.meta.managedClubId];
  return club ? state.leagues[club.leagueId]?.tier ?? 1 : 1;
}

/** O jogador já é conhecido? O nosso plantel é sempre 100% conhecido. */
export function isScouted(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  if (p.clubId === state.meta.managedClubId) return true;
  return getScouting(state).known.includes(playerId);
}

// ----------------------------------------------------------------------------
// Estimativa (para jogadores ainda não espiados)
// ----------------------------------------------------------------------------

/** Hash determinístico simples (FNV-1a) → [0,1). */
function noise(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * É uma PROMESSA — jovem com teto ainda incerto (potencial acima do atual).
 * O OVR de toda a gente é público; só o POTENCIAL destes fica por revelar até
 * um olheiro os sondar. Jogadores feitos (mais velhos / no seu teto) ficam
 * completamente expostos — por isso ~a maioria do mercado aparece exata.
 */
export function isProspect(player: Player): boolean {
  return player.age <= 19 && player.potential - naturalOverall(player) >= 3;
}

/** O potencial deste jogador já é conhecido? (nosso, não-promessa, ou já sondado) */
export function isPotentialKnown(state: GameState, player: Player): boolean {
  if (player.clubId === state.meta.managedClubId) return true;
  if (!isProspect(player)) return true;
  return getScouting(state).known.includes(player.id);
}

/** Meia-largura da banda de potencial: banda com viés determinístico contendo a verdade. */
function band100(seedId: string, true20: number, half: number): { min: number; max: number } {
  const true100 = true20 * 5;
  const bias = Math.round((noise(seedId) - 0.5) * half); // |bias| ≤ half/2
  const clamp = (v: number) => Math.max(1, Math.min(100, Math.round(v)));
  return { min: clamp(true100 - half + bias), max: clamp(true100 + half + bias) };
}

export interface PotentialRange {
  min: number; max: number; // escala 0-100
  exact: boolean; // true → potencial conhecido (min === max)
}

/** Intervalo de potencial (0-100). Se conhecido, min===max. Senão, banda apertada. */
export function potentialRange(state: GameState, player: Player): PotentialRange {
  if (isPotentialKnown(state, player)) {
    const p = player.potential * 5;
    return { min: p, max: p, exact: true };
  }
  const b = band100(player.id + 'pot', player.potential, potentialHalfWidth(scoutingLevel(state)));
  return { min: b.min, max: b.max, exact: false };
}

/** Banda de potencial genérica (usada também pela academia, com meia-largura própria). */
export function potentialBand(seedId: string, truePotential20: number, half: number): { min: number; max: number } {
  return band100(seedId, truePotential20, half);
}

// ----------------------------------------------------------------------------
// Missões
// ----------------------------------------------------------------------------

export function activeMissions(state: GameState): ScoutMission[] {
  return getScouting(state).missions;
}

export function freeSlots(state: GameState): number {
  return scoutSlots(scoutingLevel(state)) - activeMissions(state).length;
}

/** Pode iniciar uma missão a esta liga? (dentro do alcance + slot livre + não repetida) */
export function canScoutLeague(state: GameState, leagueId: string): boolean {
  const league = state.leagues[leagueId];
  if (!league) return false;
  if (freeSlots(state) <= 0) return false;
  if (!tierInRange(ownTierOf(state), league.tier, scoutingLevel(state))) return false;
  return !activeMissions(state).some((m) => m.kind === 'LEAGUE' && m.targetId === leagueId);
}

/** Pode SONDAR este jogador? (é uma promessa, ao alcance, slot livre, sem missão) */
export function canScoutPlayer(state: GameState, playerId: string): boolean {
  const p = state.players[playerId];
  if (!p || !p.clubId || p.clubId === state.meta.managedClubId) return false;
  if (!isProspect(p) || isPotentialKnown(state, p)) return false; // só promessas por revelar
  if (freeSlots(state) <= 0) return false;
  const tier = state.leagues[state.clubs[p.clubId]?.leagueId ?? '']?.tier ?? 99;
  if (!tierInRange(ownTierOf(state), tier, scoutingLevel(state))) return false;
  return !activeMissions(state).some((m) => m.kind === 'PLAYER' && m.targetId === playerId);
}

/** Promessas ao alcance com potencial ainda por revelar — a lista "Sondáveis". */
export function scoutableProspects(state: GameState, limit = 25): Player[] {
  const managedId = state.meta.managedClubId;
  const ownTier = ownTierOf(state);
  const level = scoutingLevel(state);
  return Object.values(state.players)
    .filter((p) => p.clubId && p.clubId !== managedId && isProspect(p) && !isPotentialKnown(state, p)
      && tierInRange(ownTier, state.leagues[state.clubs[p.clubId]?.leagueId ?? '']?.tier ?? 99, level))
    .sort((a, b) => naturalOverall(b) - naturalOverall(a))
    .slice(0, limit);
}

function newMission(state: GameState, kind: 'PLAYER' | 'LEAGUE', targetId: string): ScoutMission {
  const total = scoutRounds(scoutingLevel(state));
  return {
    id: `scout_${kind}_${targetId}_${state.meta.currentDate}`,
    kind, targetId, roundsLeft: total, total,
  };
}

export function startPlayerMission(state: GameState, playerId: string): boolean {
  if (!canScoutPlayer(state, playerId)) return false;
  getScouting(state).missions.push(newMission(state, 'PLAYER', playerId));
  return true;
}

export function startLeagueMission(state: GameState, leagueId: string): boolean {
  if (!canScoutLeague(state, leagueId)) return false;
  getScouting(state).missions.push(newMission(state, 'LEAGUE', leagueId));
  return true;
}

export function cancelMission(state: GameState, missionId: string): void {
  const sc = getScouting(state);
  sc.missions = sc.missions.filter((m) => m.id !== missionId);
}

/** Jovens de maior potencial de uma liga (as "promessas" que uma missão revela). */
export function findProspects(state: GameState, leagueId: string, count: number): Player[] {
  const league = state.leagues[leagueId];
  if (!league) return [];
  const players: Player[] = [];
  for (const clubId of league.clubIds) {
    const club = state.clubs[clubId];
    if (!club) continue;
    for (const pid of club.squad) {
      const p = state.players[pid];
      if (p && p.age <= 21) players.push(p);
    }
  }
  return players
    .sort((a, b) => b.potential - a.potential || naturalOverall(b) - naturalOverall(a))
    .slice(0, count);
}

export interface ScoutReport {
  kind: 'PLAYER' | 'LEAGUE';
  playerIds: string[]; // jogadores revelados por este relatório
  leagueId?: string;
}

/**
 * Avança as missões UMA jornada. Relatórios que terminam revelam informação.
 * Chamado pelo advance. Devolve os relatórios concluídos (para notícias/UI).
 */
export function tickScouting(state: GameState): ScoutReport[] {
  const sc = getScouting(state);
  if (sc.missions.length === 0) return [];
  const done: ScoutReport[] = [];
  const still: ScoutMission[] = [];

  for (const m of sc.missions) {
    if (m.roundsLeft > 1) { still.push({ ...m, roundsLeft: m.roundsLeft - 1 }); continue; }
    // concluída
    if (m.kind === 'PLAYER') {
      if (!sc.known.includes(m.targetId)) sc.known.push(m.targetId);
      if (!sc.prospects.includes(m.targetId)) sc.prospects.push(m.targetId); // aparece nos "descobertos" p/ contratar
      done.push({ kind: 'PLAYER', playerIds: [m.targetId] });
    } else {
      const prospects = findProspects(state, m.targetId, 4);
      const ids = prospects.map((p) => p.id);
      for (const id of ids) {
        if (!sc.known.includes(id)) sc.known.push(id);
        if (!sc.prospects.includes(id)) sc.prospects.push(id);
      }
      done.push({ kind: 'LEAGUE', playerIds: ids, leagueId: m.targetId });
    }
  }
  sc.missions = still;
  return done;
}
