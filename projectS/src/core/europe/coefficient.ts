/**
 * COEFICIENTE DE PAÍS — ranking tipo-UEFA que decide as VAGAS europeias e EVOLUI
 * com o desempenho dos clubes na Europa (como o coeficiente real da UEFA).
 *
 * Duas partes:
 *  1. BASE (fixa, dos dados): mede o "tamanho" da nação de futebol. Combina a
 *     PROFUNDIDADE da pirâmide (nº de divisões — os países com 3 divisões são as
 *     grandes ligas) com a FORÇA média do tier-1. Assim um país de 3 divisões fica
 *     sempre acima de um de 1 divisão de força parecida — corrige a inversão em que
 *     a Bélgica (1 liga) aparecia à frente de Inglaterra/Espanha (3 ligas).
 *  2. FORMA (evolui): a cada época, cada país ganha pontos pelo que os seus clubes
 *     fizeram nas provas (vitórias na fase de liga, ida às eliminatórias, título).
 *     A média por clube (à UEFA) empurra o coeficiente para cima/baixo em relação
 *     aos rivais. Limitada a ±BAND da base — uma boa época sobe-te uns lugares, não
 *     transforma o San Marino num gigante.
 *
 * Só entram países UEFA: Argentina e Brasil estão na base mundial (mercado de
 * transferências) mas NÃO disputam provas europeias.
 */
import { WORLD_TEAMS } from '../data/world/worldTeams';
import { EuroComp, EURO_COMPS, EuroCompetitionState } from './types';

/** Países da base que NÃO são UEFA — ficam de fora das provas europeias. */
export const NON_UEFA = new Set<string>(['argentina', 'brazil']);
export const isUefaSlug = (slug: string): boolean => !NON_UEFA.has(slug);

// ---- BASE: profundidade da liga + força do tier-1, dos dados ----
const DEPTH_BONUS = 5; // cada divisão extra vale +5 ao coeficiente base
const BAND = 10; // a forma pode mover o coeficiente ±10 face à base
const RETAIN = 0.7; // quanto da forma anterior persiste (o resto esquece)
const GAIN = 1.5; // sensibilidade ao desempenho da época

const baseByCountry = (() => {
  const tier1 = new Map<string, { sum: number; n: number }>();
  const tiers = new Map<string, Set<number>>();
  for (const t of WORLD_TEAMS) {
    if (!tiers.has(t.slug)) tiers.set(t.slug, new Set());
    tiers.get(t.slug)!.add(t.tier);
    if (t.tier === 1) {
      const e = tier1.get(t.slug) ?? { sum: 0, n: 0 };
      e.sum += t.forca; e.n++; tier1.set(t.slug, e);
    }
  }
  const m = new Map<string, number>();
  for (const [slug, e] of tier1) {
    if (!isUefaSlug(slug)) continue;
    const ndiv = tiers.get(slug)?.size ?? 1;
    m.set(slug, e.sum / e.n + (ndiv - 1) * DEPTH_BONUS);
  }
  return m;
})();

/** Coeficiente BASE de um país UEFA (sem forma). 0 se não-UEFA/desconhecido. */
export const baseCoefficient = (slug: string): number => baseByCountry.get(slug) ?? 0;

/** Todos os países UEFA e o seu coeficiente base. */
export function baseCoefficients(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [slug, v] of baseByCountry) out[slug] = v;
  return out;
}

/**
 * Pontos de coeficiente que cada país ganha numa época, a partir das provas já
 * TERMINADAS. À UEFA: 2 por vitória, 1 por empate na fase de liga; bónus por ir às
 * eliminatórias (via classificação final) e por ser campeão. Média por clube
 * inscrito (para um país não subir só por ter muitos clubes). Determinístico.
 */
export function seasonPoints(competitions: Record<EuroComp, EuroCompetitionState>): Record<string, number> {
  const total = new Map<string, number>(); // pontos somados
  const clubs = new Map<string, number>(); // clubes inscritos

  const champBonus: Record<EuroComp, number> = { UCL: 4, UEL: 2.5, UECL: 1.5 };

  for (const comp of EURO_COMPS) {
    const cs = competitions[comp];
    const countryOf = new Map<string, string>();
    for (const e of cs.entries) {
      countryOf.set(e.clubId, e.country);
      clubs.set(e.country, (clubs.get(e.country) ?? 0) + 1);
    }
    // Fase de liga: 2/1/0 por resultado.
    for (const r of cs.table) {
      const c = countryOf.get(r.clubId);
      if (!c) continue;
      total.set(c, (total.get(c) ?? 0) + r.W * 2 + r.D);
    }
    // Bónus por chegar às eliminatórias (classificação final da fase de liga).
    (cs.seedOrder ?? []).forEach((clubId, i) => {
      const c = countryOf.get(clubId);
      if (!c) return;
      const bonus = i < 8 ? 2 : i < 24 ? 1 : 0; // top-8 direto ao R16; 9–24 play-off
      total.set(c, (total.get(c) ?? 0) + bonus);
    });
    // Título: bónus nacional.
    if (cs.winnerClubId) {
      const c = countryOf.get(cs.winnerClubId);
      if (c) total.set(c, (total.get(c) ?? 0) + champBonus[comp] * (clubs.get(c) ?? 1));
    }
  }

  const out: Record<string, number> = {};
  for (const [c, pts] of total) out[c] = pts / Math.max(1, clubs.get(c) ?? 1);
  return out;
}

/**
 * Novo mapa de coeficientes para a PRÓXIMA época. Sem estado anterior (1ª campanha)
 * devolve a base. Com estado, evolui a FORMA de cada país pela diferença face à
 * média da época (soma zero — sobe quem se destaca, desce quem falha), com memória
 * (RETAIN) e travada a ±BAND da base.
 */
export function evolveCoefficients(
  prev: Record<string, number> | undefined,
  competitions: Record<EuroComp, EuroCompetitionState> | undefined,
): Record<string, number> {
  const base = baseCoefficients();
  if (!prev || !competitions) return base;

  const pts = seasonPoints(competitions);
  const vals = Object.values(pts);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const out: Record<string, number> = {};
  for (const slug of Object.keys(base)) {
    const b = base[slug]!;
    const prevPerf = (prev[slug] ?? b) - b; // forma acumulada até aqui
    const delta = ((pts[slug] ?? mean) - mean); // desempenho relativo desta época
    const perf = clamp(RETAIN * prevPerf + GAIN * delta, -BAND, BAND);
    out[slug] = b + perf;
  }
  return out;
}

/** Slugs UEFA ordenados por coeficiente (melhor→pior); desempate estável pelo slug. */
export function coefficientRanking(coeffs: Record<string, number>): string[] {
  return Object.keys(coeffs).sort((a, b) =>
    (coeffs[b]! - coeffs[a]!) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Ranking base (1ª época / fallback), sem forma. */
export const baseRanking = (): string[] => coefficientRanking(baseCoefficients());

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
