import { GameState } from '../models';
import { WORLD_TEAMS } from '../data/world/worldTeams';

/**
 * SLUG do país ativo, normalizado.
 *
 * Os jogos criados com mundo GERADO (antes de existir a base de dados real, e
 * ainda hoje se `useBase` for falso) marcam os clubes com `country: 'PRT'`, que
 * NÃO é um slug de `WORLD_TEAMS`. Tudo o que depende do país ativo fazia então
 * uma verificação `WORLD_TEAMS.some(t => t.slug === country)` que falhava em
 * silêncio: sem mundo de fundo, sem qualificação europeia e sem mercado
 * internacional — para sempre. Era o "a Champions não funciona" do playtest,
 * em carreiras antigas que já iam na sexta época.
 *
 * Aqui mapeia-se qualquer código legado para o slug equivalente. Se mesmo assim
 * não houver correspondência, cai em 'portugal' (o país por omissão do jogo).
 */
const LEGACY_ALIAS: Record<string, string> = {
  PRT: 'portugal',
  prt: 'portugal',
};

const isSlug = (s: string): boolean => WORLD_TEAMS.some((t) => t.slug === s);

/** Normaliza um código de país (slug, alias legado ou lixo) para um slug válido. */
export function normalizeCountrySlug(country: string | undefined): string {
  if (country && isSlug(country)) return country;
  const alias = country ? LEGACY_ALIAS[country] : undefined;
  if (alias && isSlug(alias)) return alias;
  return isSlug('portugal') ? 'portugal' : (WORLD_TEAMS[0]?.slug ?? 'portugal');
}

/** Slug do país do clube GERIDO, já normalizado. */
export function activeCountrySlug(state: GameState): string {
  return normalizeCountrySlug(state.clubs[state.meta.managedClubId]?.country);
}
