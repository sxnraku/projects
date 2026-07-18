/**
 * Finanças do clube. Valores em unidade monetária inteira (ex: euros).
 * Detalhe de orçamentos e fluxo semanal expande na ETAPA 4.
 */
export interface Finance {
  clubId: string;

  balance: number; // saldo em caixa
  transferBudget: number; // orçamento disponível para transferências
  wageBudget: number; // teto salarial semanal

  // Receitas semanais estimadas
  income: {
    tickets: number; // bilheteira
    sponsorship: number; // patrocínios
    tvRights: number; // direitos de TV
    merchandising: number;
  };

  // Despesas semanais estimadas
  expenses: {
    wages: number; // salários (soma do plantel)
    facilities: number; // manutenção de instalações
    staff: number; // equipa técnica
  };
}

/** Fluxo líquido semanal — receitas menos despesas. */
export function weeklyNet(f: Finance): number {
  const income =
    f.income.tickets +
    f.income.sponsorship +
    f.income.tvRights +
    f.income.merchandising;
  const expenses = f.expenses.wages + f.expenses.facilities + f.expenses.staff;
  return income - expenses;
}
