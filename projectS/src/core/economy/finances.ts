import { Club, Finance, weeklyNet } from '../models';

/**
 * Receita de bilheteira de um jogo em casa.
 *
 * A afluência parte da reputação (base 0.5..0.95) e é depois puxada pela FORMA
 * recente: ganhar enche o estádio, uma má série esvazia-o. Cada vitória nos
 * últimos 5 jogos vale +5%, cada derrota -8% — os adeptos punem mais do que
 * premeiam. A ocupação fica sempre entre 35% e 100%.
 *
 * @param recentForm últimos resultados (mais recentes primeiro ou por ordem —
 *   só contam quantas vitórias/derrotas há). Vazio = sem efeito.
 */
export function matchdayIncome(club: Club, recentForm: ('W' | 'D' | 'L')[] = []): number {
  const wins = recentForm.filter((r) => r === 'W').length;
  const losses = recentForm.filter((r) => r === 'L').length;
  const formMultiplier = 1 + wins * 0.05 - losses * 0.08;

  const base = 0.5 + (club.reputation / 100) * 0.45; // 0.5..0.95
  const attendanceRate = Math.min(1, Math.max(0.35, base * formMultiplier));

  const attendance = Math.round(club.stadiumCapacity * attendanceRate);
  const ticketPrice = 8 + club.reputation * 0.25; // 8..33
  return Math.round(attendance * ticketPrice);
}

/**
 * Custo semanal de manutenção das instalações — escala com os níveis.
 * Sem isto, melhorar instalações seria lucro puro sem contrapartida; assim,
 * um estádio maior traz mais bilheteira MAS também mais despesa fixa.
 */
export function facilityUpkeep(club: Club): number {
  const f = club.facilities;
  const base = 25_000;
  return Math.round(
    base +
    (f.stadium - 1) * 45_000 +
    (f.training - 1) * 30_000 +
    (f.academy - 1) * 22_000 +
    (f.medical - 1) * 18_000 +
    // Estádios grandes custam a manter, independentemente do nível comprado.
    club.stadiumCapacity * 1.2,
  );
}

/** Atualiza a despesa de manutenção do clube a partir das instalações atuais. */
export function recalcUpkeep(club: Club, finance: Finance): void {
  finance.expenses.facilities = facilityUpkeep(club);
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

/** True se o clube está insolvente — saldo negativo bloqueia contratações. */
export function isInsolvent(finance: Finance): boolean {
  return finance.balance < 0;
}

/**
 * Margem salarial semanal ainda disponível: teto menos o que já se paga.
 * Pode ser negativa se a folha já estourou o teto.
 */
export function wageBudgetRemaining(finance: Finance): number {
  return finance.wageBudget - finance.expenses.wages;
}

/**
 * O clube consegue suportar mais este salário semanal?
 * É esta regra que impede encher o plantel de ordenados altos — a "regra de
 * ouro" da gestão: sem margem salarial, não há contratações nem renovações.
 */
export function canAffordWage(finance: Finance, weeklyWage: number): boolean {
  return weeklyWage <= wageBudgetRemaining(finance);
}
