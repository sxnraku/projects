/**
 * ARQUIVO DE ÉPOCA — o que é preciso correr no rollover para o mundo passar a
 * ter memória.
 *
 * Duas coisas, chamadas do `rolloverSeason` ANTES de qualquer limpeza:
 *   `archiveSeason`        → campeões, melhores marcadores e provas ganhas
 *   `archivePlayerSeasons` → uma linha de carreira em cada jogador
 *
 * Ordem importa. Tem de correr enquanto as tabelas ainda são finais, o
 * vencedor da Taça está definido, os clubes europeus ainda existem e os
 * totalizadores dos jogadores ainda não foram zerados. Ver o comentário no
 * ponto de chamada em `advance.ts`.
 */
import { EuroComp, EuropeState, worldTeamOfClub } from '../europe/types';
import {
  displayOverall,
  emptyHistory,
  GameState,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_SEASONS,
  Player,
  SeasonChampion,
  SeasonCupWinner,
  SeasonHistoryEntry,
  SeasonTopScorer,
} from '../models';
import { creditAwards, SeasonAward, seasonAwards } from './awards';

/** Nome legível de um clube que pode já não estar no estado (adversário europeu). */
function clubNameOf(state: GameState, clubId: string | null | undefined): string | null {
  if (!clubId) return null;
  const inState = state.clubs[clubId]?.name;
  if (inState) return inState;
  return worldTeamOfClub(clubId)?.name ?? null;
}

/**
 * Fecha a época no arquivo do mundo. Idempotente: chamar duas vezes para a
 * mesma época substitui a entrada em vez de duplicar.
 */
export function archiveSeason(state: GameState, finishedEurope?: EuropeState | null): void {
  const season = state.meta.season;
  const history = (state.history ??= emptyHistory());

  const champions: SeasonChampion[] = [];
  const topScorers: SeasonTopScorer[] = [];
  const awards: SeasonAward[] = [];

  for (const league of Object.values(state.leagues)) {
    const table = state.standings[league.id];
    if (!table) continue;

    // Campeão: a mesma ordenação da classificação (pontos, diferença, golos).
    const rows = Object.values(table).sort((a, b) =>
      b.points - a.points
      || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
      || b.goalsFor - a.goalsFor);
    const top = rows[0];
    if (top && top.played > 0) {
      champions.push({
        leagueId: league.id,
        leagueName: league.name,
        tier: league.tier,
        clubId: top.clubId,
        clubName: state.clubs[top.clubId]?.name ?? top.clubId,
        points: top.points,
        won: top.won,
        drawn: top.drawn,
        lost: top.lost,
        goalsFor: top.goalsFor,
        goalsAgainst: top.goalsAgainst,
      });
    }

    // Melhor marcador da liga.
    const clubIds = new Set(league.clubIds);
    let best: Player | null = null;
    for (const p of Object.values(state.players)) {
      if (!p.clubId || !clubIds.has(p.clubId)) continue;
      const goals = p.condition.seasonGoals ?? 0;
      if (goals <= 0) continue;
      if (!best || goals > (best.condition.seasonGoals ?? 0)) best = p;
    }
    if (best) {
      topScorers.push({
        leagueId: league.id,
        leagueName: league.name,
        playerId: best.id,
        playerName: `${best.firstName} ${best.lastName}`,
        clubName: state.clubs[best.clubId!]?.name ?? '',
        goals: best.condition.seasonGoals ?? 0,
      });
    }

    // PRÉMIOS INDIVIDUAIS desta divisão. Corre aqui, e não no rollover, porque
    // é aqui que os totalizadores da época ainda estão inteiros — a seguir são
    // zerados e não há maneira de os recuperar.
    awards.push(...seasonAwards(state, league.id, top && top.played > 0 ? top.clubId : null));
  }

  // Provas a eliminar: taça nacional + as três europeias + supertaça.
  const cups: SeasonCupWinner[] = [];
  const pushCup = (key: string, clubId: string | null | undefined) => {
    const name = clubNameOf(state, clubId);
    if (clubId && name) cups.push({ key, clubId, clubName: name });
  };
  if (state.cup.season === season) pushCup('trophy.cup', state.cup.winnerClubId);
  if (finishedEurope) {
    for (const comp of Object.keys(finishedEurope.competitions) as EuroComp[]) {
      pushCup(`trophy.${comp.toLowerCase()}`, finishedEurope.competitions[comp]?.winnerClubId);
    }
    pushCup('trophy.superCup', finishedEurope.superCup?.winnerId);
  }

  const entry: SeasonHistoryEntry = { season, champions, topScorers, cups, awards };
  // Os prémios do clube gerido entram também no palmarés pessoal, que é onde
  // se vão procurar — o arquivo do mundo é para consultar, não para exibir.
  creditAwards(state, awards);
  const existing = history.seasons.findIndex((s) => s.season === season);
  if (existing >= 0) history.seasons[existing] = entry;
  else history.seasons.push(entry);

  history.seasons.sort((a, b) => a.season - b.season);
  if (history.seasons.length > MAX_HISTORY_ENTRIES) {
    history.seasons.splice(0, history.seasons.length - MAX_HISTORY_ENTRIES);
  }
}

/**
 * Escreve a época na carreira de cada jogador. Só quem entrou em campo — sem
 * isto o arquivo enchia-se de linhas a zero dos suplentes de todo o mundo.
 * Idempotente por época.
 */
export function archivePlayerSeasons(state: GameState): void {
  const season = state.meta.season;
  const tierOf = new Map<string, { tier: number; name: string }>();
  for (const club of Object.values(state.clubs)) {
    const league = state.leagues[club.leagueId];
    tierOf.set(club.id, { tier: league?.tier ?? 1, name: club.name });
  }

  for (const p of Object.values(state.players)) {
    const apps = p.condition.seasonApps ?? 0;
    if (apps <= 0) continue;
    // Clubes europeus temporários não entram: desaparecem no fim da campanha.
    const clubId = p.clubId;
    if (!clubId || state.clubs[clubId]?.european) continue;

    const meta = tierOf.get(clubId);
    const line = {
      season,
      clubId,
      clubName: meta?.name ?? clubId,
      tier: meta?.tier ?? 1,
      apps,
      goals: p.condition.seasonGoals ?? 0,
      assists: p.condition.seasonAssists ?? 0,
      rating10: Math.round(((p.condition.seasonRating ?? 0) / apps) * 10),
      overall: displayOverall(p),
    };

    const history = (p.condition.history ??= []);
    const at = history.findIndex((h) => h.season === season);
    if (at >= 0) history[at] = line;
    else history.push(line);

    if (history.length > MAX_HISTORY_SEASONS) {
      history.splice(0, history.length - MAX_HISTORY_SEASONS);
    }
  }
}

// ---------------------------------------------------------------------------
// Leituras da carreira de um jogador (para a ficha)
// ---------------------------------------------------------------------------

export interface CareerTotals {
  seasons: number;
  apps: number;
  goals: number;
  assists: number;
  /** Média de nota da carreira (1 casa decimal); 0 se nunca teve notas. */
  rating: number;
}

/** Soma da carreira arquivada + a época em curso. */
export function careerTotals(player: Player): CareerTotals {
  const lines = player.condition.history ?? [];
  let apps = 0, goals = 0, assists = 0, ratingSum = 0, ratedApps = 0;
  for (const l of lines) {
    apps += l.apps; goals += l.goals; assists += l.assists;
    if (l.rating10 > 0) { ratingSum += (l.rating10 / 10) * l.apps; ratedApps += l.apps; }
  }
  // Época a decorrer — ainda não arquivada, mas o jogador já a jogou.
  const liveApps = player.condition.seasonApps ?? 0;
  if (liveApps > 0) {
    apps += liveApps;
    goals += player.condition.seasonGoals ?? 0;
    assists += player.condition.seasonAssists ?? 0;
    ratingSum += player.condition.seasonRating ?? 0;
    ratedApps += liveApps;
  }
  return {
    seasons: lines.length + (liveApps > 0 ? 1 : 0),
    apps, goals, assists,
    rating: ratedApps > 0 ? Math.round((ratingSum / ratedApps) * 10) / 10 : 0,
  };
}
