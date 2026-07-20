import { naturalOverall, Player } from '../models';

/**
 * Estima o valor de mercado de um jogador.
 *
 * Fatores:
 *  - Overall (base) — cresce de forma exponencial: um 18 vale muito mais que um 16.
 *  - Idade — curva com pico ~24-27; jovens valem prémio por margem de evolução,
 *    veteranos desvalorizam.
 *  - Potencial — jovem com teto alto vale mais que o overall atual sugere.
 *  - Contrato — poucos anos de contrato baixam o valor (risco de saída livre).
 *
 * Valores em unidade monetária inteira. Números calibrados para uma escala
 * plausível de clube médio (overall 14 ≈ 1-2M).
 */

const OVERALL_BASE = 400_000; // multiplicador base — calibrado p/ overall 14 ≈ 1.5M

/**
 * Fator exponencial do overall — cada ponto acima de 10 pesa MUITO mais.
 *
 * A base 1.55 (em vez de 1.35) torna a curva bem mais íngreme: um craque de
 * overall 20 passa a valer ~40x um jogador de 14, em vez de ~6x. É isto que
 * impede um clube de divisão baixa de comprar estrelas logo na 1ª época — os
 * craques ficam fora de alcance até o clube crescer.
 */
function overallFactor(overall: number): number {
  return Math.pow(1.55, overall - 10);
}

/** Curva de idade: pico em 24-27, quebra depois dos 30. Retorna ~0.3..1.15. */
function ageFactor(age: number): number {
  if (age <= 18) return 0.85;
  if (age <= 23) return 1.0 + (23 - age) * 0.02; // ligeiro prémio de juventude
  if (age <= 27) return 1.15; // pico
  if (age <= 30) return 1.15 - (age - 27) * 0.1;
  if (age <= 34) return 0.85 - (age - 30) * 0.12;
  return 0.3;
}

/** Prémio por margem de potencial ainda não atingida (só relevante em jovens). */
function potentialFactor(overall: number, potential: number, age: number): number {
  const gap = Math.max(0, potential - overall);
  if (gap === 0 || age > 26) return 1.0;
  // Quanto mais jovem e maior a margem, maior o prémio (até ~+60%).
  const youthWeight = Math.max(0, (26 - age) / 8);
  return 1.0 + Math.min(0.6, gap * 0.12 * youthWeight);
}

/** Desconto por contrato curto — 1 ano restante desvaloriza; 3+ anos neutro. */
function contractFactor(contractUntil: number | null, currentSeason: number): number {
  if (contractUntil === null) return 0.5; // sem contrato: só custa salário, valor de venda baixo
  const yearsLeft = contractUntil - currentSeason;
  if (yearsLeft <= 0) return 0.35;
  if (yearsLeft === 1) return 0.7;
  if (yearsLeft === 2) return 0.9;
  return 1.0;
}

export function computeMarketValue(player: Player, currentSeason: number): number {
  const overall = naturalOverall(player);
  const value =
    OVERALL_BASE *
    overallFactor(overall) *
    ageFactor(player.age) *
    potentialFactor(overall, player.potential, player.age) *
    contractFactor(player.contractUntil, currentSeason);

  // Arredonda a milhares para valores "limpos".
  return Math.round(value / 1000) * 1000;
}

/** Salário semanal sugerido, proporcional ao valor de mercado e overall. */
export function suggestedWage(player: Player, currentSeason: number): number {
  const value = computeMarketValue(player, currentSeason);
  // ~0.8% do valor por semana (~40% do valor por ano). Com os 0.1% originais
  // os salários eram ~3% da receita e nenhum clube sentia pressão financeira;
  // agora a folha salarial é a maior despesa, como no futebol real.
  return Math.max(500, Math.round((value * 0.008) / 100) * 100);
}
