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
export const TOP_DIVISION_WAGE_CAP = 1_200_000;

export function divisionWageCap(tier: number): number {
  return Math.round(TOP_DIVISION_WAGE_CAP * divisionMultiplier(tier));
}

/** Quanto falta para bater no teto rígido do escalão. */
export function divisionCapRemaining(finance: Finance, tier: number): number {
  return divisionWageCap(tier) - finance.expenses.wages;
}

/** O clube pode assumir mais este salário sem estourar o teto do escalão? */
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
export function recalcIncome(club: Club, tier: number, finance: Finance): void {
  const scale = club.reputation / 100;
  const div = divisionMultiplier(tier);
  finance.income.sponsorship = Math.round((8_000 + scale * scale * 320_000) * div);
  finance.income.tvRights = Math.round((12_000 + scale * scale * 480_000) * div);
  finance.income.merchandising = Math.round((4_000 + scale * scale * 120_000) * div);
  finance.expenses.staff = Math.round((8_000 + scale * scale * 140_000) * div);
}

/** Prémio por posição final na liga, já indexado ao escalão. */
export function leaguePrize(tier: number, position: number, leagueSize: number): number {
  const base = 6_000_000 * divisionMultiplier(tier);
  // 1º leva o prémio cheio; o último leva ~15%.
  const share = 1 - (position - 1) / Math.max(1, leagueSize - 1) * 0.85;
  return Math.round(base * share);
}

/** Prémio extra por subir de divisão — o "salto" de orçamento. */
export function promotionPrize(newTier: number): number {
  return Math.round(8_000_000 * divisionMultiplier(newTier));
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

export interface InterestCheck {
  interested: boolean;
  /** Prémio de assinatura necessário para o convencer (0 se já aceita). */
  requiredSigningBonus: number;
  reason: string;
}

/**
 * O jogador aceita sequer NEGOCIAR com este clube?
 *
 * Um craque não vai para um clube muito abaixo do seu nível só por dinheiro de
 * passe — mas um prémio de assinatura suficientemente alto compra a vontade.
 * Quanto maior a diferença de estatuto, mais absurdo o prémio necessário.
 */
export function checkInterest(
  player: Player,
  club: Club,
  tier: number,
): InterestCheck {
  const ovr = naturalOverall(player);
  const needed = requiredReputation(ovr);
  const gap = needed - club.reputation;

  if (gap <= 0) {
    return { interested: true, requiredSigningBonus: 0, reason: 'Jogador aberto a negociar.' };
  }

  // Fora de alcance: nem com dinheiro (mais de 25 pontos de diferença).
  if (gap > 25) {
    return {
      interested: false,
      requiredSigningBonus: Infinity,
      reason: `${player.lastName} não considera um clube deste nível (${club.reputation} vs ${needed} necessários).`,
    };
  }

  // Convencível — a um preço que cresce com a diferença e com o escalão.
  const bonus = Math.round(
    player.marketValue * (gap / 25) * 1.5 / divisionMultiplier(tier) / 10_000,
  ) * 10_000;

  return {
    interested: false,
    requiredSigningBonus: Math.max(50_000, bonus),
    reason: `${player.lastName} só desce de nível com um prémio de assinatura de ${Math.max(50_000, bonus).toLocaleString('pt-PT')} €.`,
  };
}
