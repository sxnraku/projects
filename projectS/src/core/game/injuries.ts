import { GameState, Player } from '../models';
import { Rng } from '../engine/rng';

/**
 * LESÕES COM GRAVIDADE.
 *
 * Antes toda a lesão era `rng.int(7, 28)`: uma distribuição uniforme entre duas
 * e quatro jornadas. Isso tornava as lesões um imposto, não um acontecimento —
 * nunca perdias ninguém por tempo suficiente para a época mudar de forma, e o
 * departamento médico só encurtava um número que já era pequeno.
 *
 * Agora há quatro escalões. O que interessa não é a média (que ficou parecida),
 * é a CAUDA: uma vez por outra o teu melhor marcador sai em novembro e não
 * volta. É isso que faz uma época ser lembrada.
 *
 * Três regras que a tornam uma decisão e não só má sorte:
 *
 *  1. **A idade pesa.** Acima dos 30 as lesões são mais graves. É o que dá
 *     sentido a ter um plantel jovem para além dos números do overall.
 *  2. **Voltar não é estar curado.** Quem regressa fica FRÁGIL durante algumas
 *     jornadas. Nesse período há risco de recaída — e a recaída é sempre pior
 *     do que a lesão original.
 *  3. **A fragilidade só desaparece com descanso.** Jogar com ele enquanto está
 *     frágil é a escolha que corre o risco; deixá-lo de fora limpa-a. É aqui
 *     que "voltar cedo demais" passa a ser uma decisão tua e não um sorteio.
 */

export const InjurySeverity = {
  KNOCK: 'KNOCK',     // mazelada — falha um jogo, talvez dois
  MINOR: 'MINOR',     // semanas
  SERIOUS: 'SERIOUS', // meses; muda a época
  SEVERE: 'SEVERE',   // acaba a época
} as const;
export type InjurySeverity = (typeof InjurySeverity)[keyof typeof InjurySeverity];

/** Ordem crescente de gravidade — usada para agravar um escalão. */
export const SEVERITY_ORDER: InjurySeverity[] = ['KNOCK', 'MINOR', 'SERIOUS', 'SEVERE'];

/** Dias de paragem por escalão (antes do departamento médico). */
export const SEVERITY_DAYS: Record<InjurySeverity, [number, number]> = {
  KNOCK: [4, 10],
  MINOR: [12, 30],
  SERIOUS: [38, 95],
  SEVERE: [120, 250],
};

/**
 * Probabilidade de cada escalão, para um jogador na casa dos 20.
 *
 * `SEVERE` a 3% pode parecer pouco, mas o motor sorteia uma lesão por equipa e
 * por jogo: numa época de 34 jornadas, com 56 clubes, é mais que suficiente
 * para haver sempre alguém de fora — e para te acontecer a ti de vez em quando,
 * sem virar rotina.
 */
export const BASE_WEIGHTS: Record<InjurySeverity, number> = {
  KNOCK: 0.47,
  MINOR: 0.36,
  SERIOUS: 0.14,
  SEVERE: 0.03,
};

/** Idade a partir da qual o corpo começa a não perdoar. */
export const AGE_FRAGILE_FROM = 30;

/** Jornadas de fragilidade depois de voltar de uma lesão a sério. */
export const FRAGILE_ROUNDS = 4;

/** Gravidade mínima a partir da qual se sai frágil (uma mazelada não deixa marca). */
export const FRAGILE_FROM: InjurySeverity = 'MINOR';

/** Hipótese de recaída, por jornada, para quem JOGA estando frágil. */
export const RELAPSE_CHANCE = 0.16;

/** Um escalão acima (o topo não sobe mais). */
export function worsen(sev: InjurySeverity): InjurySeverity {
  const i = SEVERITY_ORDER.indexOf(sev);
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, i + 1)]!;
}

/**
 * Pesos ajustados à idade: acima dos 30 desloca-se massa das mazeladas para os
 * escalões pesados, um pouco mais por cada ano.
 */
export function weightsForAge(age: number): Record<InjurySeverity, number> {
  const w = { ...BASE_WEIGHTS };
  const over = Math.max(0, age - AGE_FRAGILE_FROM);
  if (over === 0) return w;
  // 3,5 pontos percentuais por ano acima dos 30, travado nos 8 anos (38 anos).
  const shift = Math.min(0.28, over * 0.035);
  w.KNOCK = Math.max(0.05, w.KNOCK - shift);
  w.SERIOUS += shift * 0.7;
  w.SEVERE += shift * 0.3;
  return w;
}

/** Sorteia um escalão pelos pesos dados. */
export function pickSeverity(rng: Rng, weights: Record<InjurySeverity, number>): InjurySeverity {
  const total = SEVERITY_ORDER.reduce((s, k) => s + weights[k], 0);
  let r = rng.next() * total;
  for (const k of SEVERITY_ORDER) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'MINOR';
}

/** O jogador está no período frágil a seguir a uma lesão? */
export function isFragile(p: Player): boolean {
  return (p.condition.fragileRounds ?? 0) > 0;
}

/** Dias de paragem sorteados para um escalão. */
export function daysFor(rng: Rng, sev: InjurySeverity): number {
  const [lo, hi] = SEVERITY_DAYS[sev];
  return rng.int(lo, hi);
}

/**
 * Põe um jogador de fora. Devolve o escalão para a UI poder dizer o que foi.
 *
 * `relapse` agrava um escalão: quem se magoa outra vez logo a seguir não se
 * magoa de leve.
 */
export function applyInjury(p: Player, rng: Rng, relapse = false): InjurySeverity {
  let sev = pickSeverity(rng, weightsForAge(p.age));
  if (relapse) sev = worsen(sev);
  p.condition.status = 'INJURED';
  p.condition.injuryDaysRemaining = daysFor(rng, sev);
  p.condition.injurySeverity = sev;
  // Enquanto está lesionado não conta fragilidade; ela começa quando volta.
  p.condition.fragileRounds = 0;
  return sev;
}

/**
 * Passa uma jornada: recupera, devolve quem ficou apto e gasta a fragilidade.
 *
 * `recoveryPerWeek` já vem com o departamento médico e o fisioterapeuta.
 * `played` são os jogadores que ENTRARAM em campo esta jornada — é o que separa
 * arriscar de poupar.
 *
 * Devolve os que recaíram, para o chamador dar a notícia.
 */
export interface RelapseInfo { player: Player; severity: InjurySeverity }

export function tickInjury(
  p: Player,
  recoveryPerWeek: number,
  played: boolean,
  rng: Rng,
): RelapseInfo | null {
  if (p.condition.injuryDaysRemaining > 0) {
    p.condition.injuryDaysRemaining = Math.max(0, p.condition.injuryDaysRemaining - recoveryPerWeek);
    if (p.condition.injuryDaysRemaining === 0 && p.condition.status === 'INJURED') {
      p.condition.status = 'AVAILABLE';
      // Sai frágil só quem esteve fora a sério.
      const sev = p.condition.injurySeverity;
      const grave = !!sev && SEVERITY_ORDER.indexOf(sev) >= SEVERITY_ORDER.indexOf(FRAGILE_FROM);
      p.condition.fragileRounds = grave ? FRAGILE_ROUNDS : 0;
      p.condition.injurySeverity = undefined;
    }
    return null;
  }

  if (!isFragile(p)) return null;

  // FRÁGIL. Jogar arrisca; descansar cura.
  if (played) {
    if (rng.chance(RELAPSE_CHANCE)) {
      const sev = applyInjury(p, rng, true);
      return { player: p, severity: sev };
    }
    // Jogou e aguentou — mas continua frágil. Só o descanso desconta.
    return null;
  }
  p.condition.fragileRounds = Math.max(0, (p.condition.fragileRounds ?? 0) - 1);
  return null;
}

/** Chave i18n do nome do escalão. */
export function severityKey(sev: InjurySeverity): string {
  return `injury.sev.${sev}`;
}

/**
 * Jogadores do clube gerido que estão frágeis — a UI avisa antes de os pôr a
 * jogar. Sem este aviso a recaída era só má sorte inexplicável.
 */
export function fragilePlayers(state: GameState): Player[] {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return [];
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p && isFragile(p) && p.condition.status !== 'INJURED');
}
