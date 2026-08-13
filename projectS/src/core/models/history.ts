/**
 * MEMÓRIA DO MUNDO — quem ganhou o quê, época a época.
 *
 * O jogo chama-se "Legacy" e até aqui só a carreira do treinador sobrevivia ao
 * rollover: as tabelas eram limpas, os totalizadores dos jogadores zerados e
 * ninguém se lembrava do campeão do ano passado. Isto guarda o essencial em
 * texto já resolvido (nomes, não só ids) para que uma época de 2029 continue
 * legível quando o clube tiver mudado de divisão ou o jogador de clube.
 *
 * Vive num blob JSON próprio (tabela `history`), como `background` e `europe`.
 */

/** Campeão de uma liga numa época, com a linha final da tabela. */
export interface SeasonChampion {
  leagueId: string;
  leagueName: string;
  tier: number;
  clubId: string;
  clubName: string;
  points: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** Melhor marcador de uma liga numa época. */
export interface SeasonTopScorer {
  leagueId: string;
  leagueName: string;
  playerId: string;
  playerName: string;
  clubName: string;
  goals: number;
}

/** Vencedor de uma prova a eliminar (taça nacional, provas europeias, supertaça). */
export interface SeasonCupWinner {
  /** Chave i18n da prova: `trophy.cup`, `trophy.ucl`, `trophy.uel`, ... */
  key: string;
  clubId: string;
  clubName: string;
}

/** Tudo o que aconteceu numa época. */
export interface SeasonHistoryEntry {
  season: number;
  champions: SeasonChampion[];
  topScorers: SeasonTopScorer[];
  cups: SeasonCupWinner[];
  /**
   * PRÉMIOS INDIVIDUAIS (melhor jogador, melhor jovem, melhor marcador, melhor
   * treinador), um conjunto por divisão. Opcional: as épocas arquivadas por
   * versões anteriores não os têm e continuam a ler-se sem problema.
   */
  awards?: import('../game/awards').SeasonAward[];
}

/** O arquivo completo. */
export interface WorldHistory {
  seasons: SeasonHistoryEntry[];
}

/** Quantas épocas se guardam. 50 chega para uma carreira inteira. */
export const MAX_HISTORY_ENTRIES = 50;

export function emptyHistory(): WorldHistory {
  return { seasons: [] };
}

// ---------------------------------------------------------------------------
// Leituras derivadas (a UI não recalcula, chama isto)
// ---------------------------------------------------------------------------

export interface TitleCount {
  clubId: string;
  clubName: string;
  titles: number;
  /** Épocas em que ganhou, da mais recente para a mais antiga. */
  seasons: number[];
}

/**
 * Palmarés de uma liga: quem ganhou mais vezes. `leagueId` opcional — sem ele
 * conta os títulos de TODAS as ligas (útil para "clube mais titulado do país").
 */
export function titleTable(history: WorldHistory, leagueId?: string): TitleCount[] {
  const byClub = new Map<string, TitleCount>();
  for (const entry of history.seasons) {
    for (const c of entry.champions) {
      if (leagueId && c.leagueId !== leagueId) continue;
      const cur = byClub.get(c.clubId);
      if (cur) {
        cur.titles += 1;
        cur.seasons.push(entry.season);
        cur.clubName = c.clubName; // fica com o nome mais recente
      } else {
        byClub.set(c.clubId, { clubId: c.clubId, clubName: c.clubName, titles: 1, seasons: [entry.season] });
      }
    }
  }
  const out = [...byClub.values()];
  for (const t of out) t.seasons.sort((a, b) => b - a);
  return out.sort((a, b) => b.titles - a.titles || a.clubName.localeCompare(b.clubName));
}

export interface ScorerRecord {
  playerId: string;
  playerName: string;
  /** Melhor época dele: golos e em que ano. */
  goals: number;
  season: number;
  clubName: string;
  leagueName: string;
}

/**
 * As melhores épocas de sempre à frente da baliza — uma entrada por jogador
 * (a melhor dele), para o quadro não ficar cheio do mesmo nome.
 */
export function scoringRecords(history: WorldHistory, topN = 10): ScorerRecord[] {
  const best = new Map<string, ScorerRecord>();
  for (const entry of history.seasons) {
    for (const s of entry.topScorers) {
      const cur = best.get(s.playerId);
      if (!cur || s.goals > cur.goals) {
        best.set(s.playerId, {
          playerId: s.playerId, playerName: s.playerName, goals: s.goals,
          season: entry.season, clubName: s.clubName, leagueName: s.leagueName,
        });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.goals - a.goals).slice(0, topN);
}

/** Quantas provas a eliminar cada clube ganhou (taça + Europa). */
export function cupTable(history: WorldHistory, key?: string): TitleCount[] {
  const byClub = new Map<string, TitleCount>();
  for (const entry of history.seasons) {
    for (const c of entry.cups) {
      if (key && c.key !== key) continue;
      const cur = byClub.get(c.clubId);
      if (cur) { cur.titles += 1; cur.seasons.push(entry.season); cur.clubName = c.clubName; }
      else byClub.set(c.clubId, { clubId: c.clubId, clubName: c.clubName, titles: 1, seasons: [entry.season] });
    }
  }
  const out = [...byClub.values()];
  for (const t of out) t.seasons.sort((a, b) => b - a);
  return out.sort((a, b) => b.titles - a.titles || a.clubName.localeCompare(b.clubName));
}

/** A entrada de uma época concreta (undefined se não foi arquivada). */
export function seasonEntry(history: WorldHistory, season: number): SeasonHistoryEntry | undefined {
  return history.seasons.find((s) => s.season === season);
}
