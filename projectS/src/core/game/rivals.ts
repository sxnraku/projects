/**
 * RIVALIDADES — os jogos que não são como os outros.
 *
 * Uma época de 34 jornadas em que todos os jogos pesam o mesmo é uma folha de
 * cálculo. O dérbi resolve isso sem inventar sistemas novos: usa o calendário
 * que já existe e muda o que está à volta do jogo — estádio cheio, mais
 * bilheteira, mais cartões, mais moral em jogo e imprensa a falar do assunto
 * durante a semana.
 *
 * As rivalidades são DERIVADAS, não gravadas: saem dos nomes e da reputação dos
 * clubes, sempre com o mesmo resultado. Não ocupam espaço no save nem precisam
 * de migração, e um clube que sobe de divisão herda automaticamente os dérbis
 * do escalão novo.
 *
 * Duas regras, por esta ordem:
 *  1. **Dérbi de cidade** — clubes da mesma liga cujo nome começa pela mesma
 *     palavra ("Lisboa Águias" vs "Lisboa Verdes"). É o dérbi a sério.
 *  2. **Clássico** — os dois clubes de maior reputação da liga, mesmo que
 *     estejam em pontas opostas do país. Toda a liga tem o seu jogo grande.
 */
import { Club, GameState } from '../models';

/** Máximo de rivais por clube — acima disto o dérbi deixava de ser especial. */
export const MAX_RIVALS = 3;

/** Multiplicador de afluência num dérbi (o estádio enche). */
export const DERBY_GATE = 1.18;

/** Moral extra (±) ganha ou perdida por ganhar/perder um dérbi. */
export const DERBY_MORALE = 6;

/**
 * Primeira palavra do nome, normalizada — o "token de cidade".
 * Palavras genéricas não servem para identificar cidade nenhuma.
 */
const GENERIC = new Set(['fc', 'sc', 'ac', 'cd', 'sl', 'cf', 'ud', 'real', 'atletico', 'atlético', 'academico', 'académico', 'sporting']);

/** Tira os acentos sem meter caracteres invisíveis no código-fonte. */
function stripMarks(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFD')) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue; // sinais diacríticos combinados
    out += ch;
  }
  return out;
}

function cityToken(club: Club): string | null {
  const first = club.name.trim().split(/\s+/)[0];
  if (!first) return null;
  const norm = stripMarks(first.toLowerCase());
  if (norm.length < 3 || GENERIC.has(norm)) return null;
  return norm;
}

/**
 * Rivais de um clube na sua liga atual.
 *
 * Determinístico e sem estado: chama-se à vontade. Ordena por id para que a
 * lista não dependa da ordem do `Record` de clubes.
 */
export function rivalsOf(state: GameState, clubId: string): string[] {
  const club = state.clubs[clubId];
  if (!club) return [];
  const league = state.leagues[club.leagueId];
  if (!league) return [];

  const peers = league.clubIds
    .map((id) => state.clubs[id])
    .filter((c): c is Club => !!c && c.id !== clubId)
    .sort((a, b) => a.id.localeCompare(b.id));

  const out: string[] = [];

  // 1. Dérbis de cidade.
  const token = cityToken(club);
  if (token) {
    for (const other of peers) {
      if (cityToken(other) === token) out.push(other.id);
      if (out.length >= MAX_RIVALS) return out;
    }
  }

  // 2. Par de ESTATUTO: o vizinho no ranking de reputação da liga.
  //
  // Emparelham-se 1º-2º, 3º-4º, 5º-6º… Assim o clássico da liga sai de graça
  // (o par de cima) e — o que é mais importante — NENHUM clube fica sem dérbi.
  // Sem esta regra, um clube com nome de cidade única e a meio da tabela nunca
  // tinha um jogo grande, que é a maioria dos 1085 clubes do mundo.
  //
  // O emparelhamento por índice garante simetria: se A é o par de B, B é o par
  // de A, sem ser preciso guardar nada.
  const ranked = [...peers, club].sort((a, b) =>
    b.reputation - a.reputation || a.id.localeCompare(b.id));
  const idx = ranked.findIndex((c) => c.id === clubId);
  if (idx >= 0) {
    const partner = idx % 2 === 0 ? ranked[idx + 1] : ranked[idx - 1];
    // Numa liga com um nº ímpar de clubes o último fica sem par: junta-se ao
    // anterior (que passa a ter dois rivais — é o preço de ser ímpar).
    const fallback = partner ?? ranked[idx - 1];
    if (fallback && fallback.id !== clubId && !out.includes(fallback.id)) out.push(fallback.id);
  }

  return out.slice(0, MAX_RIVALS);
}

/** True se estes dois clubes se odeiam (relação simétrica por construção). */
export function isDerby(state: GameState, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  return rivalsOf(state, aId).includes(bId) || rivalsOf(state, bId).includes(aId);
}

/** O rival mais forte de um clube — o que a imprensa usa como "o grande jogo". */
export function mainRival(state: GameState, clubId: string): string | null {
  const rivals = rivalsOf(state, clubId);
  if (rivals.length === 0) return null;
  return rivals
    .map((id) => state.clubs[id])
    .filter((c): c is Club => !!c)
    .sort((a, b) => b.reputation - a.reputation)[0]?.id ?? null;
}
