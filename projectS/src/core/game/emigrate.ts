import { GameState } from '../models';
import { WORLD_TEAMS } from '../data/world/worldTeams';
import { deriveSeed } from '../engine/rng';
import { createNewGame } from './newGame';
import { activeCountrySlug } from './activeCountry';
import { resetSupport } from './fans';

/**
 * MUDAR DE PAÍS — o treinador aceita um clube no estrangeiro.
 *
 * O jogo tem dois níveis de mundo: um país ATIVO, com plantéis a sério, e ~55
 * países simulados por trás. A carreira estava presa ao primeiro: por muito que
 * ganhasses, a maior oferta possível era o maior clube do teu país. O resto do
 * mundo corria no ecrã Mundo sem que lá pudesses trabalhar — uma porta pintada
 * na parede, num jogo chamado Legacy.
 *
 * A mecânica difícil já existia: `createNewGame` sabe montar QUALQUER país a
 * partir do dataset. Emigrar é montar o país novo e transplantar a carreira.
 *
 * Duas decisões que a tornam segura:
 *
 *  1. **Os ids de clube são globais.** Um clube é `club_<id do dataset>` venha
 *     de que país vier, por isso a oferta pode usar o id final antes mesmo de o
 *     clube existir no estado — e continua válido depois da mudança.
 *  2. **O que é da CARREIRA sobrevive; o que é do PAÍS não.** Troféus,
 *     histórico, épocas, reputação e o nome do treinador seguem com ele.
 *     Classificações, calendário, Taça e caixa de entrada ficam para trás,
 *     porque pertenciam a um campeonato que ele deixou.
 */

/** Uma equipa do dataset pelo id de clube (`club_123`). */
export function worldTeamOfClubId(clubId: string): (typeof WORLD_TEAMS)[number] | undefined {
  const raw = clubId.startsWith('club_') ? clubId.slice(5) : clubId;
  const id = Number(raw);
  if (!Number.isFinite(id)) return undefined;
  return WORLD_TEAMS.find((t) => t.id === id);
}

/** Nome do país a mostrar ("Netherlands"), a partir do slug. */
export function countryNameOf(slug: string): string {
  return WORLD_TEAMS.find((t) => t.slug === slug)?.country ?? slug;
}

/** O clube fica noutro país que não o ativo? */
export function isAbroad(state: GameState, clubId: string): boolean {
  if (state.clubs[clubId]) return false; // já cá está: mudança interna
  const wt = worldTeamOfClubId(clubId);
  return !!wt && wt.slug !== activeCountrySlug(state);
}

export interface EmigrationResult {
  ok: boolean;
  /** Slug do país novo, quando correu bem. */
  country?: string;
  /** Nome do clube novo. */
  clubName?: string;
}

/**
 * Muda o país ativo e leva a carreira. Devolve `ok: false` sem tocar em nada se
 * o clube não existir no dataset ou se o mundo novo não o contiver — mais vale
 * uma oferta que não abre do que um save meio migrado.
 */
export function emigrate(state: GameState, clubId: string): EmigrationResult {
  const wt = worldTeamOfClubId(clubId);
  if (!wt) return { ok: false };

  // Monta o país novo num estado à parte. Mesma época, semente derivada — duas
  // carreiras que emigrem para o mesmo sítio no mesmo ano encontram o mesmo
  // mundo, que é o que o determinismo do projeto exige.
  const fresh = createNewGame({
    managerName: state.meta.managerName,
    useBase: true,
    country: wt.slug,
    season: state.meta.season,
    seed: deriveSeed(state.meta.rngSeed, 'emigrate', state.meta.season, wt.id),
  });
  if (!fresh.clubs[clubId]) return { ok: false };

  // ---- o MUNDO troca-se por inteiro -------------------------------------
  state.clubs = fresh.clubs;
  state.players = fresh.players;
  state.leagues = fresh.leagues;
  state.finances = fresh.finances;
  state.tactics = fresh.tactics;
  state.schedules = fresh.schedules;
  state.standings = fresh.standings;
  state.background = fresh.background; // o antigo país passa a ser fundo
  state.cup = fresh.cup;

  // ---- o que pertencia ao campeonato que ele deixou ----------------------
  state.inbox = [];
  state.europe = undefined; // requalifica-se pelo novo país no fim da época
  state.news = [];

  // ---- a CARREIRA segue com ele ------------------------------------------
  // (troféus, épocas, reputação, despedimentos, definições — tudo o que está em
  // `state.career` e `state.history` fica intocado de propósito.)
  state.meta.managedClubId = clubId;
  state.career.pendingOffers = [];
  state.career.meritOffers = [];
  state.career.confidence = 60; // lua de mel, sem ser um cheque em branco
  // O plano contra o adversário e a palestra pendente eram do jogo anterior.
  state.career.gamePlan = undefined;
  state.career.pendingTalkMorale = undefined;
  // Academia e olheiros são do clube, não do treinador.
  state.career.academy = undefined;
  state.career.preContracts = [];
  resetSupport(state); // outro país, outra bancada: começa do zero

  return { ok: true, country: wt.slug, clubName: fresh.clubs[clubId]!.name };
}
