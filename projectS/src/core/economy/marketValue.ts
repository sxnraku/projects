import { computeOverallFine, GameState, Player } from '../models';

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

/** Valor de um jogador de overall 10 (50/100) em idade de pico. */
const OVERALL_BASE = 120_000;

/**
 * Degrau de valor por cada ponto de overall (escala interna 0-20).
 *
 * O mercado do futebol não é linear nem sequer exponencial constante: um 70
 * vale uns milhões, um 80 vale dez vezes isso e um 90 vale dez vezes o 80. Esta
 * tabela reproduz a curva do modo carreira do EA FC — ~2.1×/ponto na base,
 * ~2.6×/ponto na zona de estrela, e a abrandar no topo absoluto (acima de 90 no
 * ecrã já só há um punhado de jogadores no mundo, e os preços saturam).
 *
 * Índice = ponto de partida. Ex.: STEPS[14] é o salto de 14 (70) para 15 (75).
 */
const OVERALL_STEPS: Record<number, number> = {
  10: 2.1, 11: 2.1,        // 50 → 60: jogadores de escalões baixos
  12: 2.5, 13: 2.5, 14: 2.5, // 60 → 75: titulares de 1ª divisão
  15: 2.6, 16: 2.6, 17: 2.6, // 75 → 90: estrelas
  18: 1.75, 19: 1.75,        // 90 → 100: saturação do topo
};

/**
 * Fator de overall acumulado. Aceita overall FINO (fracionário) e interpola
 * dentro do degrau, para dois jogadores de 82 e 84 não valerem o mesmo.
 */
function overallFactor(overall: number): number {
  const o = Math.max(10, Math.min(20, overall));
  let factor = 1;
  for (let point = 10; point < 20; point++) {
    if (o <= point) break;
    const frac = Math.min(1, o - point);
    factor *= Math.pow(OVERALL_STEPS[point] ?? 1.75, frac);
  }
  // Abaixo de 10 o valor cai depressa — são jogadores de formação/última linha.
  return overall < 10 ? factor * Math.pow(1.9, overall - 10) : factor;
}

/**
 * Curva de idade — o que se compra é a CARREIRA que falta, não só a qualidade.
 *
 * A curva antiga tinha o pico aos 24-27 e penalizava quem tinha 18 anos, o que
 * dava o absurdo apanhado no playtest: dois jogadores de 97 com o mesmo teto,
 * o de 27 anos a valer 329M e o de 18 a valer 214M. Na vida real (e no EA FC) é
 * ao contrário — pela mesma qualidade, um miúdo de 18 vale MAIS, porque leva
 * mais dez anos de topo e ainda pode ser revendido.
 *
 * Agora o pico está aos 18-21 e a queda depois dos 28 é bem mais funda: um
 * craque de 33 anos vale uma fração do que valia aos 25, como deve ser.
 */
const AGE_FACTORS: Record<number, number> = {
  16: 1.15, 17: 1.2, 18: 1.3, 19: 1.3, 20: 1.3, 21: 1.3,
  22: 1.2, 23: 1.2, 24: 1.2, 25: 1.2,
  26: 1.05, 27: 1.0,
  28: 0.82, 29: 0.68, 30: 0.55, 31: 0.44, 32: 0.34, 33: 0.26, 34: 0.19,
};

function ageFactor(age: number): number {
  if (age <= 15) return 1.1; // ainda muito cru para pagar prémio cheio
  if (age >= 35) return 0.12;
  return AGE_FACTORS[age] ?? 1.0;
}

/**
 * Prémio por potencial ainda por cumprir — o coração do mercado de jovens.
 *
 * É quadrático na margem e escala com a juventude: um miúdo de 18 anos com
 * 80 no ecrã e 92 de teto vale MUITO mais do que os 80 dele valem hoje, porque
 * o comprador está a pagar o que ele vai ser. É o mesmo raciocínio do EA FC (e
 * do mercado real, onde um Endrick custa mais do que um internacional feito).
 *
 * Limitado a `MAX_POTENTIAL_PREMIUM` para o tail não explodir: um jogador de 14
 * anos com teto 20 continua a ser uma aposta, não uma lotaria de mil milhões.
 */
const POTENTIAL_WEIGHT = 0.37;
const MAX_POTENTIAL_PREMIUM = 8;

function potentialFactor(overall: number, potential: number, age: number): number {
  const gap = Math.max(0, potential - overall);
  if (gap === 0) return 1.0;
  const youthWeight = Math.max(0, Math.min(1.25, (27 - age) / 9));
  if (youthWeight === 0) return 1.0;
  return Math.min(MAX_POTENTIAL_PREMIUM, 1 + POTENTIAL_WEIGHT * gap * gap * youthWeight);
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

/**
 * @param prestige Multiplicador de PRESTÍGIO da liga/país (1 = neutro). Usado só
 *   no mercado INTERNACIONAL para que a mesma qualidade custe mais numa liga forte
 *   e menos numa liga fraca — RELATIVO ao mercado do gestor. O mercado doméstico
 *   passa 1 (calibração intacta). Ver `countryPrestige` em `prestige.ts`.
 */
export function computeMarketValue(player: Player, currentSeason: number, prestige = 1): number {
  // Overall FINO (não arredondado): dois jogadores de 67 e 63 no ecrã deixam de
  // valer o mesmo. Com o inteiro, toda uma banda de 5 pontos colapsava no mesmo
  // valor — daí o "mercado onde os jogadores mal variam de valor".
  const overall = computeOverallFine(player.attributes, player.positions[0]);
  const value =
    OVERALL_BASE *
    overallFactor(overall) *
    ageFactor(player.age) *
    potentialFactor(overall, player.potential, player.age) *
    contractFactor(player.contractUntil, currentSeason) *
    prestige;

  // Arredonda a milhares para valores "limpos".
  return Math.round(value / 1000) * 1000;
}

/**
 * SALÁRIO SEMANAL — ancorado ao OVERALL, não ao valor de mercado.
 *
 * Antes o ordenado era uma percentagem do passe. Com a curva de valores
 * realista isso deixou de funcionar: um miúdo de 18 anos avaliado em 60M pelo
 * potencial passaria a exigir ordenado de superestrela, quando na vida real
 * ganha uma fração do que ganha o craque feito. O que se paga é a QUALIDADE de
 * hoje — o potencial paga-se no passe, não no salário.
 *
 * Curva: ~1.95× por ponto de overall até 18 (90 no ecrã) e mais suave acima.
 */
const WAGE_BASE = 800;     // €/semana de um overall 10 (50/100)
const WAGE_STEP = 1.95;
const WAGE_TAPER_FROM = 18;
const WAGE_TAPER_STEP = 1.5;

/** Jovens ganham menos do que a qualidade sugere; veteranos seguram o ordenado. */
function wageAgeFactor(age: number): number {
  if (age <= 18) return 0.55;
  if (age <= 21) return 0.7;
  if (age <= 23) return 0.85;
  return 1;
}

/**
 * Reavalia o `marketValue` GRAVADO de todos os jogadores.
 *
 * O campo era escrito uma vez (ao criar o jogador ou numa transferência) e
 * nunca mais tocado: um miúdo da academia que crescesse até craque continuava
 * avaliado em algumas centenas de milhar, e um veterano em fim de linha
 * mantinha o preço do auge. Pior, a IA negociava pelo valor REAL
 * (`computeMarketValue`) enquanto o ecrã mostrava o valor velho — números que
 * não batiam certo em lado nenhum.
 *
 * É barato (uma passagem por ~1300 jogadores) e corre no fecho da época e
 * sempre que alguém evolui.
 */
export function refreshMarketValues(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.marketValue = computeMarketValue(player, state.meta.season);
  }
}

export function suggestedWage(player: Player, _currentSeason?: number): number {
  const overall = computeOverallFine(player.attributes, player.positions[0]);
  const capped = Math.max(6, Math.min(20, overall));
  const belowTaper = Math.min(capped, WAGE_TAPER_FROM) - 10;
  const aboveTaper = Math.max(0, capped - WAGE_TAPER_FROM);
  const wage = WAGE_BASE
    * Math.pow(WAGE_STEP, belowTaper)
    * Math.pow(WAGE_TAPER_STEP, aboveTaper)
    * wageAgeFactor(player.age);
  return Math.max(300, Math.round(wage / 100) * 100);
}
