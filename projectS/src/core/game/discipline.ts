/**
 * DISCIPLINA — os cartões que sobrevivem ao apito final.
 *
 * Até aqui o amarelo era decoração: o motor emitia `YELLOW_CARD`, o resumo do
 * jogo mostrava-o e no minuto seguinte desaparecia do mundo. Só o vermelho
 * tinha consequência (falhar o jogo seguinte). O resultado era que a única
 * decisão disciplinar do jogo — poupar um jogador em risco, escolher quem
 * entra num dérbi áspero — não existia.
 *
 * Regra: 5 amarelos na época = um jogo de castigo. O contador NÃO zera — é o
 * total de amarelos da época (a estatística que se quer ver na lista do
 * plantel) — e o castigo dispara sempre que se cruza um múltiplo de 5: aos 5,
 * aos 10, aos 15. Quem joga sempre no limite paga sempre.
 *
 * Expulsão: vale 1 jogo E ANULA os amarelos desse jogo. É a regra real (os
 * dois amarelos que dão o vermelho são consumidos pela expulsão) e evita o
 * absurdo de um jogador ser expulso e ainda levar castigo por acumulação pelos
 * mesmos cartões.
 *
 * Módulo puro: recebe estado + jogos, muta `condition` e devolve o que
 * aconteceu para quem quiser noticiar.
 */
import { Fixture, GameState } from '../models';

/** Amarelos acumulados que valem um jogo de castigo. */
export const YELLOWS_FOR_BAN = 5;

/** A partir daqui o jogador está a um cartão do castigo — a UI avisa. */
export const YELLOWS_WARNING = YELLOWS_FOR_BAN - 1;

/** Porque é que o jogador ficou de fora. */
export const BanReason = {
  /** Expulso (vermelho direto ou segundo amarelo). */
  RED: 'RED',
  /** Somou 5 amarelos. */
  ACCUMULATION: 'ACCUMULATION',
} as const;
export type BanReason = (typeof BanReason)[keyof typeof BanReason];

export interface Ban {
  playerId: string;
  clubId: string;
  reason: BanReason;
  /** Jogos de castigo aplicados agora. */
  games: number;
}

export interface CardWarning {
  playerId: string;
  clubId: string;
  /** Amarelos acumulados depois desta jornada. */
  yellows: number;
}

export interface DisciplineResult {
  /** Castigos aplicados esta jornada, em TODOS os clubes. */
  bans: Ban[];
  /** Quem chegou ao limiar de aviso esta jornada, em TODOS os clubes. */
  warnings: CardWarning[];
}

/**
 * Está a um cartão do castigo? Leitura para a UI (lista do plantel, ficha).
 * Não conta quem já está suspenso — esse já está a pagar.
 */
export function isAtRisk(yellows: number | undefined): boolean {
  const y = yellows ?? 0;
  return y % YELLOWS_FOR_BAN === YELLOWS_WARNING && y > 0;
}

/** Quantos amarelos faltam para o próximo castigo (>=1). */
export function yellowsToBan(yellows: number | undefined): number {
  return YELLOWS_FOR_BAN - ((yellows ?? 0) % YELLOWS_FOR_BAN);
}

/**
 * Processa os cartões dos jogos desta jornada: acumula amarelos, aplica
 * castigos e devolve o que mudou. Muta `player.condition`.
 *
 * Aplica-se a TODOS os clubes — a IA cumpre os mesmos castigos que o
 * utilizador, senão a acumulação seria um imposto que só o jogador paga.
 */
export function applyCards(state: GameState, played: Fixture[]): DisciplineResult {
  const bans: Ban[] = [];
  const warnings: CardWarning[] = [];

  for (const fx of played) {
    const stats = fx.result?.playerStats;
    if (!stats) continue;
    for (const pid in stats) {
      const p = state.players[pid];
      if (!p) continue;
      const s = stats[pid]!;
      const clubId = p.clubId ?? '';

      if (s.red) {
        // Expulsão: um jogo de fora. Os amarelos deste jogo morrem aqui.
        p.condition.suspended = Math.max(p.condition.suspended ?? 0, 1);
        bans.push({ playerId: pid, clubId, reason: 'RED', games: 1 });
        continue;
      }

      if (!s.yellow) continue;
      const before = p.condition.seasonYellows ?? 0;
      const after = before + s.yellow;
      p.condition.seasonYellows = after;

      // Quantos múltiplos de 5 foram cruzados nesta jornada. Normalmente 0 ou
      // 1, mas dois amarelos num jogo podem saltar o limiar de uma vez.
      const crossed = Math.floor(after / YELLOWS_FOR_BAN) - Math.floor(before / YELLOWS_FOR_BAN);
      if (crossed > 0) {
        p.condition.suspended = Math.max(p.condition.suspended ?? 0, crossed);
        bans.push({ playerId: pid, clubId, reason: 'ACCUMULATION', games: crossed });
      } else if (isAtRisk(after) && !isAtRisk(before)) {
        warnings.push({ playerId: pid, clubId, yellows: after });
      }
    }
  }

  return { bans, warnings };
}
