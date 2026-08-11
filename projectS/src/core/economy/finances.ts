import { Club, Finance, weeklyNet } from '../models';
import { divisionBudgetFloor, divisionLiquidityFloor } from './divisions';

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
export function matchdayIncome(
  club: Club,
  recentForm: ('W' | 'D' | 'L')[] = [],
  derby = false,
): number {
  return matchdayGate(club, recentForm, derby).revenue;
}

/**
 * Bilheteira detalhada: afluência E receita. O resumo pós-jogo mostra quantos
 * adeptos apareceram, por isso o número de espectadores não pode ficar
 * escondido dentro do cálculo da receita.
 */
export function matchdayGate(
  club: Club,
  recentForm: ('W' | 'D' | 'L')[] = [],
  /** Dérbi: o estádio enche e o bilhete vale mais, mesmo em má fase. */
  derby = false,
): { attendance: number; revenue: number } {
  const wins = recentForm.filter((r) => r === 'W').length;
  const losses = recentForm.filter((r) => r === 'L').length;
  const formMultiplier = 1 + wins * 0.05 - losses * 0.08;

  const base = 0.5 + (club.reputation / 100) * 0.45; // 0.5..0.95
  const derbyMul = derby ? 1.18 : 1;
  const attendanceRate = Math.min(1, Math.max(0.35, base * formMultiplier * derbyMul));

  const attendance = Math.round(club.stadiumCapacity * attendanceRate);
  // Num dérbi o bilhete é mais caro — é a receita que faz um clube pequeno
  // aguentar a época com dois jogos grandes.
  const ticketPrice = (8 + club.reputation * 0.25) * (derby ? 1.25 : 1); // 8..33
  return { attendance, revenue: Math.round(attendance * ticketPrice) };
}

/**
 * Custo semanal de manutenção das instalações — escala com os níveis.
 * Sem isto, melhorar instalações seria lucro puro sem contrapartida; assim,
 * um estádio maior traz mais bilheteira MAS também mais despesa fixa.
 */
export function facilityUpkeep(club: Club): number {
  const f = club.facilities;
  const base = 4_000;
  return Math.round(
    base +
    (f.stadium - 1) * 18_000 +
    (f.training - 1) * 12_000 +
    (f.academy - 1) * 9_000 +
    (f.medical - 1) * 7_000 +
    ((f.scouting ?? 1) - 1) * 8_000 +
    // Estádios grandes custam a manter, independentemente do nível comprado.
    club.stadiumCapacity * 0.6,
  );
}

/** Atualiza a despesa de manutenção do clube a partir das instalações atuais. */
export function recalcUpkeep(club: Club, finance: Finance): void {
  finance.expenses.facilities = facilityUpkeep(club);
}

/**
 * Aplica o fluxo financeiro de uma semana ao saldo do clube.
 * Recebe também a receita de bilheteira da semana (0 se jogou fora ou não jogou).
 * Muta a Finance. Devolve quanto FALTOU para fechar a semana (0 se pagou tudo).
 *
 * O SALDO NUNCA FICA NEGATIVO. Antes ficava, e um clube podia arrastar meses no
 * vermelho a perder 1 ponto de reputação por semana — uma espiral silenciosa que
 * lhe destruía o estatuto (estrelas, mercado, patrocínios) sem uma decisão pelo
 * meio. Agora a semana que não fecha produz um BURACO (o valor devolvido), que é
 * tratado já: o clube gerido recebe o dilema de crise (escolhe quem vender) e a
 * IA vende sozinha. Ou se resolve nesta semana, ou volta a aparecer na próxima —
 * mas nunca fica a apodrecer num número vermelho.
 */
export function applyWeeklyFinances(finance: Finance, matchIncome: number): number {
  finance.balance += weeklyNet(finance) + matchIncome;
  let shortfall = 0;
  if (finance.balance < 0) {
    shortfall = Math.round(-finance.balance);
    finance.balance = 0;
  }
  syncBudgets(finance); // as fatias seguem sempre o saldo
  return shortfall;
}

// ---------------------------------------------------------------------------
// CARTEIRA ÚNICA: um saldo total, repartido em três fatias
// ---------------------------------------------------------------------------
//
// Havia dois montes de dinheiro independentes — "saldo" e "orçamento de
// transferências" — e ninguém percebia a relação entre eles. Pior: divergiam.
// Ao fim de meses de fluxo negativo sobrava verba sem haver caixa, e o jogo
// recusava vendas e compras com mensagens que não batiam certo com o número
// que estava no ecrã ("orçamento de transferências insuficiente" ao VENDER).
//
// Agora só existe UM dinheiro — `balance`, o saldo total — e um balanço que o
// reparte por três destinos:
//
//   saldo total
//     ├─ reserva salarial   10 semanas de folha + manutenção (a direção não larga)
//     ├─ transferências     70% do que sobra  → `transferBudget`
//     └─ obras              os outros 30%     → `infrastructureFunds`
//
// `transferBudget` continua a existir como campo (o save e meio jogo leem-no),
// mas é sempre um ESPELHO do saldo: `syncBudgets` recalcula-o a cada movimento.

/** Semanas de despesa corrente que a direção nunca deixa sair da caixa. */
export const WAGE_RESERVE_WEEKS = 10;
/** Fatia do dinheiro livre autorizada para passes (o resto fica para obras). */
export const TRANSFER_SHARE = 0.7;

/** Despesa corrente de uma semana (salários + manutenção + equipa técnica). */
export function weeklyCosts(f: Finance): number {
  return f.expenses.wages + f.expenses.facilities + f.expenses.staff;
}

/**
 * Reserva salarial: o dinheiro encostado para pagar os próximos meses.
 *
 * NUNCA passa de metade da caixa. Um clube da 3ª divisão tem em caixa pouco
 * mais do que 10 semanas de despesa — com a reserva a valer o total, ficava com
 * zero de verba e o mercado das divisões de baixo parava por completo.
 */
export function wageReserve(f: Finance): number {
  return Math.min(
    Math.round(weeklyCosts(f) * WAGE_RESERVE_WEEKS),
    Math.round(Math.max(0, f.balance) * 0.5),
  );
}

/** Dinheiro livre: o saldo total menos a reserva salarial. */
export function freeFunds(f: Finance): number {
  return Math.max(0, Math.round(f.balance - wageReserve(f)));
}

/** Fatia do livre autorizada para passes — é o valor de `transferBudget`. */
export function transferAllowance(f: Finance): number {
  return Math.round(freeFunds(f) * TRANSFER_SHARE);
}

/** Fatia do livre que sobra para obras nas instalações. */
export function infrastructureFunds(f: Finance): number {
  return freeFunds(f) - transferAllowance(f);
}

/**
 * Realinha as fatias com o saldo total. Chamar depois de QUALQUER movimento de
 * dinheiro (ver `moveMoney`, que já o faz).
 */
export function syncBudgets(finance: Finance): void {
  finance.transferBudget = transferAllowance(finance);
  finance.wageBudget = Math.round(finance.expenses.wages * 1.2);
}

/**
 * Movimenta o saldo total e realinha as fatias. É o ÚNICO sítio por onde entra
 * e sai dinheiro — assim a verba nunca volta a divergir da caixa.
 * O saldo nunca fica negativo (as despesas voluntárias já são travadas por
 * `canSpend`; a semana que não fecha passa por `applyWeeklyFinances`).
 */
export function moveMoney(finance: Finance, delta: number): void {
  finance.balance = Math.max(0, Math.round(finance.balance + delta));
  syncBudgets(finance);
}

/** Mantido pelo nome antigo: realinhar as fatias no início de época. */
export function recalcBudgets(finance: Finance, tier = 1, countryFactor = 1): void {
  // Um clube que SOBE de divisão não pode arrancar a época sem poder de compra
  // só porque a caixa vem do escalão de baixo: a direção injeta o que falta
  // para chegar ao piso do escalão (agora em dinheiro real, no saldo, e não
  // numa verba fantasma que não existia em caixa).
  const floorCash = Math.round(
    divisionBudgetFloor(tier, countryFactor) / TRANSFER_SHARE + wageReserve(finance),
  );
  // ...mas a injeção nunca passa o teto de liquidez do escalão: a direção não
  // dá mais caixa do que a que estaria disposta a deixar o clube guardar.
  const cap = liquidityCeiling(finance, tier, countryFactor);
  if (finance.balance < floorCash) finance.balance = Math.min(floorCash, cap);
  syncBudgets(finance);
}

/**
 * Liquidez máxima que um clube leva de uma época para a outra — o resto é
 * absorvido pela direção (dívidas, investimento, acionistas).
 * Escala com a dimensão do clube: 40 semanas de despesa corrente.
 */
export function liquidityCeiling(finance: Finance, tier = 1, countryFactor = 1): number {
  const weekly = finance.expenses.wages + finance.expenses.facilities + finance.expenses.staff;
  // Teto = ~40 semanas de despesa corrente OU o piso de liquidez do escalão (o
  // que for maior) — assim um clube que sobe consegue guardar caixa da divisão
  // nova e transformá-la em orçamento, em vez de a direção absorver tudo.
  return Math.max(divisionLiquidityFloor(tier, countryFactor), Math.round(weekly * 40));
}

/**
 * Reset anual: a direção absorve o excesso de caixa e refaz os orçamentos.
 *
 * Sem isto o dinheiro acumulava época após época e, a partir de certa altura,
 * o orçamento deixava de ser uma restrição. Devolve quanto foi absorvido.
 */
export function annualBudgetReset(finance: Finance, tier = 1, countryFactor = 1): number {
  const ceiling = liquidityCeiling(finance, tier, countryFactor);
  let absorbed = 0;
  if (finance.balance > ceiling) {
    absorbed = finance.balance - ceiling;
    finance.balance = ceiling;
  }
  recalcBudgets(finance, tier, countryFactor);
  return Math.round(absorbed);
}

/**
 * True se o clube está sem caixa — bloqueia contratações.
 *
 * Como o saldo já não vai abaixo de zero (ver `applyWeeklyFinances`), "estar no
 * vermelho" deixou de existir como estado. O que resta é a regra simples: sem
 * dinheiro não se compra. Deliberadamente NÃO depende do fluxo semanal, que
 * oscila com a bilheteira (casa/fora) e faria o mercado abrir e fechar de
 * semana para semana sem nada ter mudado.
 */
export function isInsolvent(finance: Finance): boolean {
  return finance.balance <= 0;
}

/** Mesma condição, com o nome que a UI usa para "risco financeiro". */
export function inFinancialTrouble(finance: Finance): boolean {
  return isInsolvent(finance);
}

/** Quantas semanas de despesa corrente a caixa ainda aguenta. */
export function cashRunway(finance: Finance): number {
  const costs = weeklyCosts(finance);
  return costs <= 0 ? Infinity : finance.balance / costs;
}

/** Abaixo disto a direção acende o aviso — ainda dá tempo de agir. */
export const RUNWAY_WARNING_WEEKS = 3;

/**
 * A caixa está a acabar? É o AVISO que aparece antes do dilema de crise.
 *
 * O sinal anterior era "saldo negativo", que só acendia quando o estrago já
 * estava feito. Agora acende enquanto o clube ainda consegue vender alguém ou
 * cortar salários por vontade própria.
 */
export function cashWarning(finance: Finance): boolean {
  return cashRunway(finance) < RUNWAY_WARNING_WEEKS;
}

/**
 * Uma despesa VOLUNTÁRIA (passe, prémio, obra, empréstimo) só passa se o clube
 * ficar com o saldo a zero ou acima.
 *
 * O orçamento de transferências sozinho não chegava como travão: ele e o saldo
 * são pratos diferentes, e ao fim de meses de fluxo negativo havia verba sem
 * haver dinheiro. Comprava-se e o clube ficava no vermelho.
 */
export function canSpend(finance: Finance, amount: number): boolean {
  return Math.round(amount) <= finance.balance;
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

/**
 * Reserva que a direção nunca deixa sair da caixa.
 *
 * Nome antigo de `wageReserve`, mantido porque é assim que a UI trata a ideia
 * ("a direção não larga X"). Com a carteira única deixou de haver conversão de
 * saldo em verba — a verba É uma fatia do saldo — por isso `injectIntoTransferBudget`
 * e companhia desapareceram: não havia nada para converter.
 */
export function boardReserve(finance: Finance): number {
  return wageReserve(finance);
}
