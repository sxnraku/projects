/**
 * PRESTÍGIO de liga/país — realismo do MERCADO INTERNACIONAL.
 *
 * Problema: a economia (reputação, saldo) ancorava só ao ESCALÃO, não ao país, e
 * o valor de mercado era country-agnóstico → o clube de topo da Albânia valia o
 * mesmo que o de Espanha, e "o orçamento parecia igual em todas as equipas dos
 * outros países". Aqui derivamos, dos dados (força média do tier de topo de cada
 * país), um fator de prestígio: uma liga forte encarece a mesma qualidade, uma
 * fraca abarata.
 *
 * Usado SÓ no mercado internacional, e de forma RELATIVA ao país do gestor
 * (`internationalPrestige`), para NÃO tocar na calibração do mercado doméstico.
 */
import { WORLD_TEAMS } from '../data/world/worldTeams';

/** Força de cada país = média de `forca` dos seus clubes do tier 1 (topo). */
const countryStrength = new Map<string, number>();
(() => {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const t of WORLD_TEAMS) {
    if (t.tier !== 1) continue;
    const e = acc.get(t.slug) ?? { sum: 0, n: 0 };
    e.sum += t.forca;
    e.n++;
    acc.set(t.slug, e);
  }
  for (const [slug, e] of acc) countryStrength.set(slug, e.sum / e.n);
})();

/** Mediana da força-país no dataset atual (≈68.5) — âncora neutra (prestígio 1). */
const MEDIAN_STRENGTH = 68.5;

/** Nº de divisões (tiers) por país — sinal de "liga grande". */
const countryTiers = new Map<string, number>();
(() => {
  const seen = new Map<string, Set<number>>();
  for (const t of WORLD_TEAMS) {
    if (!seen.has(t.slug)) seen.set(t.slug, new Set());
    seen.get(t.slug)!.add(t.tier);
  }
  for (const [slug, tiers] of seen) countryTiers.set(slug, tiers.size);
})();

/**
 * Fator de PROFUNDIDADE: uma pirâmide com mais divisões é uma nação de futebol
 * maior. Sem isto, países de 1 divisão com tier-1 forte (Bélgica/Turquia)
 * apareciam no mercado ACIMA de ligas de 3 divisões (Inglaterra/Espanha) — o que
 * não faz sentido. Cada divisão extra encarece ~7%. 1 div = ×1.0, 3 div = ×1.14.
 */
const depthFactor = (slug: string): number => 1 + ((countryTiers.get(slug) ?? 1) - 1) * 0.07;

/**
 * Prestígio ABSOLUTO de um país (~0.6 a 1.9). Grandes ligas de 3 divisões no topo,
 * micro-estados (Malta, Andorra, San Marino…) em baixo. Combina a força média do
 * tier-1 (cada ponto acima/abaixo da mediana pesa ~9%) com a profundidade da liga.
 */
export function countryPrestige(slug: string): number {
  const s = countryStrength.get(slug);
  if (s === undefined) return 1; // país fora do dataset (mundo procedural dos testes)
  return clamp(Math.pow(1.09, s - MEDIAN_STRENGTH) * depthFactor(slug), 0.6, 1.9);
}

/**
 * Slugs de país ordenados do MAIS forte para o mais fraco, para efeitos de
 * QUALIFICAÇÃO europeia (vagas por país). Ordena por PROFUNDIDADE da liga (nº de
 * divisões — os 8 países com 3 divisões são de propósito as ligas grandes) e só
 * depois pela força do tier-1; desempate estável pelo slug. Sem o peso da
 * profundidade, uma parede de países de 1 divisão empatados na força passava à
 * frente de Portugal/Holanda/Argentina, deixando-os sem vagas na Champions.
 */
export function countriesByStrength(): string[] {
  return [...countryStrength.keys()].sort((a, b) =>
    ((countryTiers.get(b) ?? 1) - (countryTiers.get(a) ?? 1)) ||
    (countryStrength.get(b)! - countryStrength.get(a)!) ||
    (a < b ? -1 : a > b ? 1 : 0),
  );
}

/**
 * Fator ECONÓMICO do país (~0.2 a 1.5) para os PISOS por escalão (orçamento e
 * liquidez). Sem isto, a 1ª divisão de Andorra usava a economia da 1ª divisão de
 * Inglaterra — clubes com saldos irreais e um piso de orçamento que achatava todos
 * no mesmo valor. Uma liga forte tem pisos altos; uma fraca, baixos.
 */
export function countryEconFactor(slug: string): number {
  return clamp((countryPrestige(slug) - 0.4) / 1.0, 0.2, 1.5);
}

/**
 * Prestígio RELATIVO ao país do gestor: assinar de uma liga mais forte que a tua
 * custa um prémio; de uma mais fraca, um desconto. Assim o mercado doméstico fica
 * intacto (mesma-a-mesma = 1) e os países estrangeiros passam a diferenciar-se.
 */
export function internationalPrestige(playerCountry: string, managerCountry: string): number {
  const rel = countryPrestige(playerCountry) / countryPrestige(managerCountry);
  return clamp(rel, 0.45, 2.6);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
