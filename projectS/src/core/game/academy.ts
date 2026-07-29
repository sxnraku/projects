/**
 * ACADEMIA de jovens — recrutamento com ESCOLHA.
 *
 * Em vez de um jovem aleatório imposto, a academia apresenta um GRUPO de
 * candidatos à experiência. De cada um vês idade, overall ATUAL (exato) e um
 * INTERVALO de potencial (o exato só se revela com o desenvolvimento). Escolhes
 * quem recrutar — pagando uma quantia baixa (é academia) e vendo um anúncio.
 *
 * O nível da instalação `academy` melhora tudo: mais candidatos, melhor
 * qualidade e intervalos de potencial mais estreitos (informação mais fiável).
 */
import { GameState, naturalOverall, Player, Position } from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import { computeMarketValue, recalcWages, suggestedWage } from '../economy';
import { AcademyState } from '../career';
import { makePlayer } from './newGame';
import { potentialBand, potentialHalfWidth } from './scouting';

const YOUTH_POSITIONS: Position[] = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

// ---- configuração por nível da instalação de academia (1..5) ----

export function academyLevel(state: GameState): number {
  return state.clubs[state.meta.managedClubId]?.facilities.academy ?? 1;
}

/** Nº de candidatos no grupo: L1=3 … L5=5. */
export function academyCandidateCount(level: number): number {
  return Math.min(5, 3 + Math.floor((level - 1) / 2));
}

// ---- geração de candidatos ----

/** "Nível base" dos candidatos a partir da reputação + instalação. */
function candidateBaseLevel(state: GameState): number {
  const club = state.clubs[state.meta.managedClubId]!;
  return Math.max(4, 7 + Math.round(((club.reputation - 40) / 55) * 6) + (club.facilities.academy - 1));
}

function makeCandidate(state: GameState, rng: Rng, idx: number): Player {
  const clubId = state.meta.managedClubId;
  const id = `acad_${state.meta.season}_${state.career.academy?.gen ?? 0}_${idx}`;
  const youth = makePlayer(id, clubId, rng.pick(YOUTH_POSITIONS), candidateBaseLevel(state), state.meta.season, rng);
  youth.clubId = null; // ainda NÃO é do clube — só entra ao recrutar
  youth.age = rng.int(15, 18);
  const ovr = naturalOverall(youth);
  // Upside da academia: por vezes sai uma joia (potencial até +8).
  const upside = rng.chance(0.15) ? rng.int(6, 8) : rng.int(2, 5);
  youth.potential = Math.min(20, Math.max(ovr + 1, ovr + upside));
  youth.contractUntil = state.meta.season + 3;
  youth.wage = Math.max(300, Math.round(suggestedWage(youth, state.meta.season) * 0.4));
  youth.marketValue = computeMarketValue(youth, state.meta.season);
  return youth;
}

/** (Re)gera o grupo de candidatos. `bump` incrementa a geração (varia a seed). */
export function generateAcademyBatch(state: GameState, bump: boolean): AcademyState {
  const prevGen = state.career.academy?.gen ?? 0;
  const gen = bump ? prevGen + 1 : prevGen;
  const acad: AcademyState = { candidates: [], season: state.meta.season, gen };
  state.career.academy = acad; // definido antes p/ makeCandidate ler o gen
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'academy', state.meta.season, gen));
  const n = academyCandidateCount(academyLevel(state));
  for (let i = 0; i < n; i++) acad.candidates.push(makeCandidate(state, rng, i));
  return acad;
}

/** Garante um grupo válido (gera se não existir ou se mudou de época). */
export function ensureAcademyBatch(state: GameState): AcademyState {
  const a = state.career.academy;
  if (!a || a.season !== state.meta.season) return generateAcademyBatch(state, false);
  return a;
}

export function academyCandidates(state: GameState): Player[] {
  return ensureAcademyBatch(state).candidates;
}

// ---- intervalo de potencial (banda apertada, escala 0-100) ----

/** Intervalo de potencial mostrado (0-100, fino). Aperta com o nível da academia. */
export function candidatePotentialRange(state: GameState, c: Player): { min: number; max: number } {
  return potentialBand(c.id + 'acad', c.potential, potentialHalfWidth(academyLevel(state)));
}

// ---- taxa de recrutamento (baixa) ----

/** Taxa de formação — baixa (é academia). Cresce um pouco com o potencial visível. */
export function academyFee(state: GameState, c: Player): number {
  const r = candidatePotentialRange(state, c);
  const mid20 = ((r.min + r.max) / 2) / 5; // volta a 0-20
  return Math.max(2_000, Math.round(mid20 * mid20 * 30 / 500) * 500); // ~2k … ~12k
}

export interface RecruitResult {
  ok: boolean;
  errorKey?: string;
  player?: Player;
  fee?: number;
}

/**
 * Recruta um candidato para o plantel: paga a taxa (do saldo), move o jogador
 * para o clube. O anúncio rewarded é tratado na UI antes de chamar isto.
 */
export function recruitAcademyCandidate(state: GameState, candidateId: string): RecruitResult {
  const acad = ensureAcademyBatch(state);
  const idx = acad.candidates.findIndex((c) => c.id === candidateId);
  if (idx < 0) return { ok: false, errorKey: 'academy.gone' };
  const candidate = acad.candidates[idx]!;

  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  if (!club || !fin) return { ok: false, errorKey: 'submit.noGame' };

  const fee = academyFee(state, candidate);
  if (fin.balance < fee) return { ok: false, errorKey: 'academy.noFunds' };

  // paga e integra no plantel
  fin.balance -= fee;
  candidate.clubId = clubId;
  state.players[candidate.id] = candidate;
  club.squad.push(candidate.id);
  recalcWages(club, fin, state.players);

  // remove do grupo
  acad.candidates.splice(idx, 1);

  return { ok: true, player: candidate, fee };
}
