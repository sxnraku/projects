import { Club, Finance, weeklyNet } from '../models';

/**
 * Receita de bilheteira de um jogo em casa.
 * Afluência depende da capacidade do estádio e da reputação do clube.
 * Preço médio do bilhete escala ligeiramente com a reputação.
 */
export function matchdayIncome(club: Club): number {
  const attendanceRate = 0.5 + (club.reputation / 100) * 0.45; // 0.5..0.95
  const attendance = Math.round(club.stadiumCapacity * attendanceRate);
  const ticketPrice = 15 + club.reputation * 0.5; // 15..65
  return Math.round(attendance * ticketPrice);
}

/**
 * Aplica o fluxo financeiro de uma semana ao saldo do clube.
 * Recebe também a receita de bilheteira da semana (0 se jogou fora ou não jogou).
 * Muta a Finance. Devolve o novo saldo.
 */
export function applyWeeklyFinances(finance: Finance, matchIncome: number): number {
  finance.balance += weeklyNet(finance) + matchIncome;
  return finance.balance;
}

/**
 * Ajusta os orçamentos de transferências e salários no início de época,
 * com base no saldo disponível. Regra simples e conservadora:
 *  - orçamento de transferências = 40% do saldo positivo;
 *  - teto salarial = despesa salarial atual + 20% de margem.
 */
export function recalcBudgets(finance: Finance): void {
  finance.transferBudget = Math.max(0, Math.round(finance.balance * 0.4));
  finance.wageBudget = Math.round(finance.expenses.wages * 1.2);
}

/** True se o clube está em risco financeiro (saldo negativo e fluxo semanal negativo). */
export function inFinancialTrouble(finance: Finance): boolean {
  return finance.balance < 0 && weeklyNet(finance) < 0;
}
