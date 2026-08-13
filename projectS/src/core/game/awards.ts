/**
 * PRÉMIOS INDIVIDUAIS — o palmarés deixa de ser só de equipas.
 *
 * Uma carreira de vinte épocas tinha exatamente seis tipos de troféu, todos
 * coletivos: liga, taça, as três provas europeias e a supertaça. Podias fazer
 * de um miúdo de 17 anos o melhor marcador da década e não ficava uma linha em
 * lado nenhum. É o oposto do que um jogo chamado *Legacy* devia guardar.
 *
 * Quatro prémios, atribuídos no fecho da época e a partir de números que já
 * existiam (`seasonGoals`, `seasonRating`, `seasonApps`):
 *
 *  - **Melhor jogador** — melhor média de nota, com um mínimo de jogos para
 *    que ninguém ganhe com três aparições afortunadas.
 *  - **Melhor jovem** — o mesmo, só para quem tem 21 anos ou menos.
 *  - **Melhor marcador** — golos, desempate pela média de nota.
 *  - **Melhor treinador** — o treinador do campeão. Este é o único que pode
 *    cair no utilizador, e cai sem cerimónia: ganhaste a liga, é teu.
 *
 * Os prémios entram no arquivo do mundo (`WorldHistory`) para o palmarés e no
 * `career.trophies` quando o premiado é do clube gerido — assim aparecem na
 * ficha da carreira ao lado dos títulos, que é onde se vão procurar.
 *
 * Módulo puro e determinístico: os desempates são por id, nunca por acaso.
 */
import { GameState, Player } from '../models';

/** Jogos mínimos para entrar na corrida ao prémio de melhor jogador. */
export const MIN_APPS_FOR_AWARD = 12;

/** Idade máxima para o prémio de melhor jovem. */
export const YOUNG_MAX_AGE = 21;

export const AwardKind = {
  BEST_PLAYER: 'BEST_PLAYER',
  BEST_YOUNG: 'BEST_YOUNG',
  TOP_SCORER: 'TOP_SCORER',
  BEST_MANAGER: 'BEST_MANAGER',
} as const;
export type AwardKind = (typeof AwardKind)[keyof typeof AwardKind];

/** Chave i18n do troféu de cada prémio. */
export const AWARD_TROPHY_KEY: Record<AwardKind, string> = {
  BEST_PLAYER: 'trophy.bestPlayer',
  BEST_YOUNG: 'trophy.bestYoung',
  TOP_SCORER: 'trophy.topScorer',
  BEST_MANAGER: 'trophy.bestManager',
};

/** Um prémio atribuído numa época. Texto já resolvido — sobrevive a tudo. */
export interface SeasonAward {
  kind: AwardKind;
  /** Vazio no prémio de treinador. */
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  leagueId: string;
  leagueName: string;
  /** Golos (marcador) ou nota média ×10 (jogador/jovem). 0 no treinador. */
  value: number;
}

/** Média de nota da época, ou null se não tiver jogos suficientes. */
function seasonAvg(p: Player, minApps: number): number | null {
  const apps = p.condition.seasonApps ?? 0;
  if (apps < minApps) return null;
  return (p.condition.seasonRating ?? 0) / apps;
}

/**
 * Apura os prémios da época na liga indicada.
 *
 * Só olha para jogadores dos clubes DESSA liga: um prémio de "melhor jogador"
 * que misturasse a 1.ª com a 3.ª divisão seria sempre ganho pela 1.ª e as
 * divisões de baixo nunca veriam um. Assim cada escalão tem os seus.
 */
export function seasonAwards(
  state: GameState, leagueId: string, championClubId: string | null,
): SeasonAward[] {
  const league = state.leagues[leagueId];
  if (!league) return [];
  const out: SeasonAward[] = [];

  const inLeague: Player[] = [];
  for (const clubId of league.clubIds) {
    for (const id of state.clubs[clubId]?.squad ?? []) {
      const p = state.players[id];
      if (p) inLeague.push(p);
    }
  }
  if (inLeague.length === 0) return out;

  const entry = (kind: AwardKind, p: Player, value: number): SeasonAward => {
    const club = p.clubId ? state.clubs[p.clubId] : undefined;
    return {
      kind,
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId ?? '',
      clubName: club?.name ?? '',
      leagueId,
      leagueName: league.name,
      value,
    };
  };

  // --- Melhor jogador e melhor jovem: média de nota, mínimo de jogos ---
  // Desempate por id para o resultado ser reproduzível: dois jogadores com
  // exatamente a mesma média não podem dar prémios diferentes em duas leituras.
  const byRating = (a: Player, b: Player) => {
    const ra = seasonAvg(a, MIN_APPS_FOR_AWARD) ?? -1;
    const rb = seasonAvg(b, MIN_APPS_FOR_AWARD) ?? -1;
    return rb - ra || a.id.localeCompare(b.id);
  };

  const eligible = inLeague.filter((p) => seasonAvg(p, MIN_APPS_FOR_AWARD) !== null);
  if (eligible.length > 0) {
    const best = [...eligible].sort(byRating)[0]!;
    out.push(entry('BEST_PLAYER', best, Math.round(seasonAvg(best, MIN_APPS_FOR_AWARD)! * 10)));

    const young = eligible.filter((p) => p.age <= YOUNG_MAX_AGE);
    if (young.length > 0) {
      const bestYoung = [...young].sort(byRating)[0]!;
      out.push(entry('BEST_YOUNG', bestYoung, Math.round(seasonAvg(bestYoung, MIN_APPS_FOR_AWARD)! * 10)));
    }
  }

  // --- Melhor marcador: golos, desempate pela média e depois pelo id ---
  const scorers = inLeague.filter((p) => (p.condition.seasonGoals ?? 0) > 0);
  if (scorers.length > 0) {
    const top = [...scorers].sort((a, b) => {
      const ga = a.condition.seasonGoals ?? 0;
      const gb = b.condition.seasonGoals ?? 0;
      if (gb !== ga) return gb - ga;
      return (seasonAvg(b, 1) ?? 0) - (seasonAvg(a, 1) ?? 0) || a.id.localeCompare(b.id);
    })[0]!;
    out.push(entry('TOP_SCORER', top, top.condition.seasonGoals ?? 0));
  }

  // --- Melhor treinador: o do campeão ---
  if (championClubId) {
    const club = state.clubs[championClubId];
    if (club) {
      out.push({
        kind: 'BEST_MANAGER',
        playerId: '',
        playerName: championClubId === state.meta.managedClubId
          ? state.meta.managerName
          : club.name,
        clubId: championClubId,
        clubName: club.name,
        leagueId,
        leagueName: league.name,
        value: 0,
      });
    }
  }

  return out;
}

/**
 * Passa para o palmarés do treinador os prémios que lhe dizem respeito: os dos
 * jogadores DELE, e o de melhor treinador quando é ele. Muta `career.trophies`.
 */
export function creditAwards(state: GameState, awards: SeasonAward[]): SeasonAward[] {
  const managedId = state.meta.managedClubId;
  // O prémio de treinador já vem com `clubId` = clube campeão, por isso este
  // filtro único cobre os dois casos: jogadores nossos e treinador nosso.
  const mine = awards.filter((a) => a.clubId === managedId);
  for (const a of mine) {
    state.career.trophies.push({
      season: state.meta.season,
      key: AWARD_TROPHY_KEY[a.kind],
      params: a.kind === 'BEST_MANAGER'
        ? { league: a.leagueName }
        : { player: a.playerName, value: a.value },
    });
  }
  return mine;
}
