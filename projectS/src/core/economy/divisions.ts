import { Club, Finance, naturalOverall, Player } from '../models';

/**
 * Regras indexadas à DIVISÃO.
 *
 * Sem isto, um clube da 4ª divisão recebe quase o mesmo que um da 1ª e pode
 * pagar ordenados de elite — o que quebra a progressão e a imersão. Aqui fica
 * tudo o que depende do escalão: receitas, prémios, teto salarial e que
 * jogadores aceitam sequer negociar.
 */

/** Peso económico do escalão: 1ª = 1, 2ª = 0.5, 3ª = 0.25, 4ª = 0.125. */
export function divisionMultiplier(tier: number): number {
  return Math.pow(0.5, Math.max(0, tier - 1));
}

/**
 * TETO SALARIAL RÍGIDO da divisão (€/semana para a folha toda).
 * É um limite absoluto imposto pela direção: mesmo com dinheiro em caixa,
 * um clube da 3ª divisão não paga ordenados de 1ª divisão.
 */
export const TOP_DIVISION_WAGE_CAP = 3_000_000;

export function divisionWageCap(tier: number): number {
  return Math.round(TOP_DIVISION_WAGE_CAP * divisionMultiplier(tier));
}

/**
 * Fração da receita semanal que a direção aceita ver em ordenados.
 *
 * O teto do escalão é um piso comum a toda a divisão, mas os clubes dentro dela
 * não são iguais: um grande fatura várias vezes mais do que um recém-subido e
 * consegue mesmo pagar mais. Sem isto, um clube que cresce muito bate no mesmo
 * teto de toda a gente e fica sem poder renovar sequer os seus jogadores.
 */
export const WAGE_CAP_INCOME_SHARE = 1.4;

/** Teto salarial EFETIVO deste clube: o do escalão ou o que a receita permite. */
export function clubWageCap(finance: Finance, tier: number): number {
  const weeklyIncome = finance.income.sponsorship + finance.income.tvRights
    + finance.income.merchandising + finance.income.tickets;
  return Math.max(divisionWageCap(tier), Math.round(weeklyIncome * WAGE_CAP_INCOME_SHARE));
}

/** Quanto falta para bater no teto do clube. */
export function divisionCapRemaining(finance: Finance, tier: number): number {
  return clubWageCap(finance, tier) - finance.expenses.wages;
}

/** O clube pode assumir mais este salário sem estourar o teto? */
export function withinDivisionCap(finance: Finance, tier: number, weeklyWage: number): boolean {
  return weeklyWage <= divisionCapRemaining(finance, tier);
}

// ---------------------------------------------------------------------------
// Receitas por escalão
// ---------------------------------------------------------------------------

/**
 * Recalcula as receitas fixas do clube a partir da reputação E do escalão.
 * Chamado no arranque e SEMPRE que o clube muda de divisão — subir traz um
 * salto real de patrocínios e direitos de TV; descer corta-os.
 */
/**
 * As receitas crescem com o QUADRADO da reputação: os clubes pequenos quase não
 * se mexem quando se puxa este número, os grandes disparam. Foi por aqui que se
 * acompanhou a escala realista de valores de mercado — sem isto nenhum clube do
 * mundo tinha orçamento para um jogador de 80, e o mercado ficava congelado.
 */
export function recalcIncome(club: Club, tier: number, finance: Finance): void {
  const scale = club.reputation / 100;
  const div = divisionMultiplier(tier);
  finance.income.sponsorship = Math.round((8_000 + scale * scale * 800_000) * div);
  finance.income.tvRights = Math.round((12_000 + scale * scale * 1_200_000) * div);
  finance.income.merchandising = Math.round((4_000 + scale * scale * 300_000) * div);
  finance.expenses.staff = baseStaffCost(club, tier);
}

/**
 * Custo semanal da estrutura (roupeiros, secretaria, equipa médica...) SEM os
 * técnicos que tu contratas. Exportado para o clube gerido poder somar-lhe o
 * salário do backroom sem que o total se acumule a cada semana — a conta é
 * sempre `base + salários`, nunca `total + salários`.
 */
export function baseStaffCost(club: Club, tier: number): number {
  const scale = club.reputation / 100;
  return Math.round((8_000 + scale * scale * 350_000) * divisionMultiplier(tier));
}

/** Prémio por posição final na liga, já indexado ao escalão. */
export function leaguePrize(tier: number, position: number, leagueSize: number): number {
  const base = 18_000_000 * divisionMultiplier(tier);
  // 1º leva o prémio cheio; o último leva ~15%.
  const share = 1 - (position - 1) / Math.max(1, leagueSize - 1) * 0.85;
  return Math.round(base * share);
}

/** Prémio extra por subir de divisão — o "salto" de orçamento. */
export function promotionPrize(newTier: number): number {
  return Math.round(30_000_000 * divisionMultiplier(newTier));
}

/**
 * PISO do orçamento de transferências por escalão — garante que subir de divisão
 * dá mesmo mais dinheiro para gastar, mesmo antes de a folha salarial crescer.
 * Num país TOP: 1ª ~10M, 2ª ~4M, 3ª ~1.6M, 4ª ~0.6M. A queda por escalão é mais
 * funda (0.4×) do que a das receitas (0.5×) de propósito: a 2ª divisão de
 * Inglaterra tem estádios cheios mas não compra como a Premier League.
 *
 * O `countryFactor` (0.2..1.5) faz o resto — a 1ª divisão de um país fraco fica
 * com ~2M, não com os 10M de um país grande.
 */
const BUDGET_TIER_DECAY = 0.4;

export function divisionBudgetFloor(tier: number, countryFactor = 1): number {
  const decay = Math.pow(BUDGET_TIER_DECAY, Math.max(0, tier - 1));
  return Math.round(10_000_000 * decay * countryFactor / 10_000) * 10_000;
}

/** Piso de liquidez por escalão — quanto de caixa um clube da divisão pode guardar. */
export function divisionLiquidityFloor(tier: number, countryFactor = 1): number {
  const decay = Math.pow(BUDGET_TIER_DECAY, Math.max(0, tier - 1));
  return Math.round(8_000_000 * decay * countryFactor);
}

// ---------------------------------------------------------------------------
// Reputação por desempenho (fim de época)
// ---------------------------------------------------------------------------

/**
 * Variação de reputação de um clube pela posição final na SUA divisão.
 *
 * Sem isto, `club.reputation` era estático (só descia por insolvência) — um
 * clube que ganhava o título ou subia de divisão ficava com a MESMA reputação
 * de sempre, e o objetivo da direção na época seguinte (que ordena os clubes
 * por reputação) nunca refletia o sucesso. Título/subida sobem, despromoção
 * desce; no meio da tabela o efeito é pequeno. Delta modesto de propósito —
 * a reputação evolui ao longo de VÁRIAS épocas, não salta numa só.
 */
export const TITLE_BASE_REPUTATION = 6;
/** Bónus por cada título CONSECUTIVO além do primeiro. */
export const TITLE_STREAK_BONUS = 3;
/** A partir daqui a série deixa de acrescentar (6 → 9 → 12 → 15). */
export const TITLE_STREAK_CAP = 4;

/**
 * @param titleStreak nº de campeonatos SEGUIDOS incluindo o desta época (1 = o
 *   primeiro). Ganhar cinco anos a fio faz de um clube uma potência: um título
 *   isolado vale 6, o segundo seguido 9, o terceiro 12 e daí para cima 15. Sem
 *   isto, um clube que dominava uma década continuava a ser tratado como
 *   qualquer outro — e a direção pedia-lhe "primeira metade da tabela".
 */
export function seasonReputationDelta(
  position: number, leagueSize: number, champion: boolean, promoted: boolean, relegated: boolean,
  titleStreak = 1,
): number {
  if (relegated) return -6;
  if (champion) {
    const extra = Math.min(TITLE_STREAK_CAP, Math.max(1, titleStreak)) - 1;
    return TITLE_BASE_REPUTATION + extra * TITLE_STREAK_BONUS;
  }
  if (promoted) return 5;
  const mid = (leagueSize + 1) / 2;
  const rel = (mid - position) / mid; // +1 (1º) .. -1 (último)
  return Math.round(rel * 2); // -2..+2, positivo na metade de cima
}

/** Aplica a variação, mantendo a reputação num intervalo plausível (nunca 0 nem 100). */
export function applySeasonReputation(club: Club, delta: number): void {
  club.reputation = Math.max(5, Math.min(99, club.reputation + delta));
}

/**
 * Realinha a reputação de um clube que ACABOU de subir/descer de divisão, para
 * ficar plausível face à companhia nova — puxa-a para perto da MEDIANA dos
 * colegas de liga (55% mediana / 45% valor antigo, preserva algum histórico).
 *
 * Sem isto, um clube que subisse várias divisões seguidas (fácil de acontecer
 * numa 1ª época fácil) ficava com a reputação de quando estava lá em baixo —
 * um campeão da 1ª divisão podia ter MENOS reputação que um clube que nunca
 * saiu da 3ª, e o jogo achava (corretamente, dado o número errado) que assinar
 * um jogador da 3ª era "descer de nível". O ajuste anual (`seasonReputationDelta`)
 * sozinho é lento demais para apanhar um salto de várias divisões numa só época.
 */
export function realignReputationOnMove(club: Club, newLeagueClubs: Club[]): void {
  const peers = newLeagueClubs
    .filter((c) => c.id !== club.id)
    .map((c) => c.reputation)
    .sort((a, b) => a - b);
  if (peers.length === 0) return;
  const median = peers[Math.floor(peers.length / 2)]!;
  club.reputation = Math.max(5, Math.min(99, Math.round(median * 0.55 + club.reputation * 0.45)));
}

// ---------------------------------------------------------------------------
// Interesse do jogador (reputação)
// ---------------------------------------------------------------------------

/**
 * Reputação mínima que um clube precisa para um jogador o considerar.
 * Um OVR 20 exige ~84 de reputação; um OVR 12 exige ~36.
 */
export function requiredReputation(overall: number): number {
  return Math.max(0, (overall - 6) * 6);
}

/**
 * Quão acima do seu estatuto um clube ainda consegue convencer um jogador
 * (em pontos de reputação em falta). ~12 = cerca de 2 níveis de OVR: um clube
 * pequeno reforça ao seu nível e um pouco acima, mas NÃO assalta a elite só
 * com dinheiro de passe. Antes eram 25 (~4 níveis), o que deixava um clube da
 * 3ª divisão contratar quase craques — quebrava a progressão.
 */
export const REACH_BAND = 12;

/** Onde o jogador está HOJE — o ponto de comparação de `checkInterest`. */
export interface PlayerStanding {
  reputation: number;
  tier: number;
  country: string;
}

/**
 * Estatuto atual do jogador. Num empréstimo conta o DONO, não quem o acolhe: um
 * miúdo do campeão emprestado à 3ª divisão não fica barato por isso.
 * `undefined` = sem clube (agente livre), onde não há referência nenhuma.
 */
export function playerStanding(
  player: Player,
  clubs: Record<string, Club | undefined>,
  leagues: Record<string, { tier: number; country: string } | undefined>,
): PlayerStanding | undefined {
  const homeId = player.condition.loanOwnerId ?? player.clubId;
  if (!homeId) return undefined;
  const club = clubs[homeId];
  if (!club) return undefined;
  const league = leagues[club.leagueId];
  return {
    reputation: club.reputation,
    tier: league?.tier ?? 1,
    country: league?.country ?? club.country ?? '',
  };
}

export interface InterestCheck {
  interested: boolean;
  /** Prémio de assinatura necessário para o convencer (0 se já aceita). */
  requiredSigningBonus: number;
  reasonKey: string;
  reasonParams?: import('../i18n').MsgParams;
}

/**
 * O jogador aceita sequer NEGOCIAR com este clube?
 *
 * Um craque não vai para um clube muito abaixo do seu nível só por dinheiro de
 * passe — mas um prémio de assinatura suficientemente alto compra a vontade.
 * Quanto maior a diferença de estatuto, mais absurdo o prémio necessário.
 *
 * `from` é onde ele joga HOJE. Sem isto a conta era só `requiredReputation(ovr)`,
 * uma tabela absoluta que ignorava a vida do jogador: um OVR 63 da 2ª divisão
 * exigia prémio para subir à 1ª, porque o OVR dele "pedia" mais reputação do
 * que o clube comprador tinha. Ninguém cobra para ser promovido. Duas regras:
 *
 *  1. **Subir de divisão nunca custa prémio.** Jogar no escalão principal é por
 *     si só um atrativo, mesmo num clube recém-subido com pouca reputação. Só
 *     vale dentro do mesmo país — escalões de países diferentes não se comparam.
 *  2. Caso contrário, a exigência dele fica limitada pelo sítio de onde vem:
 *     quem está num clube pequeno sai barato, por muito bom que seja. É assim
 *     que se encontram pechinchas em divisões inferiores.
 *
 * Um jogador SEM clube não tem referência e mantém a tabela absoluta.
 */
export function checkInterest(
  player: Player,
  club: Club,
  tier: number,
  from?: PlayerStanding,
): InterestCheck {
  // 1. Movimento para um escalão melhor do MESMO país: aceita sempre.
  if (from && from.country === club.country && tier < from.tier) {
    return { interested: true, requiredSigningBonus: 0, reasonKey: 'interest.open' };
  }

  const ovr = naturalOverall(player);
  const needed = from === undefined
    ? requiredReputation(ovr)
    : Math.min(requiredReputation(ovr), from.reputation);
  const gap = needed - club.reputation;

  if (gap <= 0) {
    return { interested: true, requiredSigningBonus: 0, reasonKey: 'interest.open' };
  }

  // Fora de alcance: nem com dinheiro (acima da banda de alcance do clube).
  if (gap > REACH_BAND) {
    return {
      interested: false,
      requiredSigningBonus: Infinity,
      reasonKey: 'interest.refuse',
      reasonParams: { name: player.lastName, rep: club.reputation, needed },
    };
  }

  // Convencível — a um preço que cresce com a diferença e com o escalão, mas
  // com inflação SUAVE por divisão (sqrt) para não assustar: um clube da 3ª
  // paga ~2× (não 4×) o prémio de um da 1ª pela mesma diferença de estatuto.
  const bonus = Math.round(
    player.marketValue * (gap / REACH_BAND) * 1.4 / Math.sqrt(divisionMultiplier(tier)) / 10_000,
  ) * 10_000;

  return {
    interested: false,
    requiredSigningBonus: Math.max(50_000, bonus),
    reasonKey: 'interest.bonus',
    reasonParams: { name: player.lastName, bonus: Math.max(50_000, bonus).toLocaleString('pt-PT') },
  };
}
