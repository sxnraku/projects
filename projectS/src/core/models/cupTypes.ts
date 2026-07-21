import { Fixture } from './fixture';

/**
 * Estado da Taça (tipos puros — a lógica de sorteio/simulação vive em core/cup,
 * separada para evitar ciclos de import com o motor).
 */
export const CUP_LEAGUE_ID = 'taca';
export const CUP_EVERY_LEAGUE_ROUNDS = 5; // eliminatória a cada N jornadas da liga
export const CUP_WINNER_PRIZE = 3_000_000;

export interface CupState {
  season: number;
  alive: string[]; // clubes ainda em prova (ordem = bracket)
  fixtures: Fixture[]; // jogos disputados, round = eliminatória
  currentRound: number; // próxima eliminatória (1-based)
  totalRounds: number;
  winnerClubId: string | null;
}

export function emptyCup(): CupState {
  return { season: 0, alive: [], fixtures: [], currentRound: 1, totalRounds: 0, winnerClubId: null };
}

/** Descritor i18n da eliminatória (final, meia-final, quartos, …). */
export function cupRoundMsg(cup: CupState, round: number): import('../i18n').Msg {
  const remaining = cup.totalRounds - round;
  if (remaining === 0) return { key: 'cup.final' };
  if (remaining === 1) return { key: 'cup.semi' };
  if (remaining === 2) return { key: 'cup.quarter' };
  return { key: 'cup.prelim', params: { n: round } };
}

/** Converte a eliminatória num param aninhado "@chave|n=…" para notícias. */
export function cupStageParam(cup: CupState, round: number): string {
  const m = cupRoundMsg(cup, round);
  if (!m.params) return `@${m.key}`;
  const segs = Object.entries(m.params).map(([k, v]) => `${k}=${v}`).join('|');
  return `@${m.key}|${segs}`;
}
