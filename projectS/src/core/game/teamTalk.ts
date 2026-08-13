/**
 * PALESTRA AO INTERVALO — os quinze minutos em que o treinador fala.
 *
 * Aos 45' o jogo já parava e abria o painel: dava para trocar jogadores e mexer
 * na tática. Faltava a única coisa que um treinador faz mesmo ali dentro —
 * abrir a boca. Havia moral por jogador, havia imprensa a mexê-la de fora, e o
 * momento em que ela mais conta era mudo.
 *
 * A regra que torna isto uma decisão e não um botão de bónus: **o que se diz
 * vale pelo que o marcador diz**. Exigir a perder por dois levanta um balneário;
 * exigir a ganhar por dois insulta-o. Elogiar quem está a perder soa a
 * desistência. É por isso que o mesmo tom dá resultados opostos consoante o
 * momento — e por isso não há escolha certa fixa.
 *
 * O segundo travão é o TEMPERAMENTO do plantel: uma equipa de moral em baixo
 * parte-se com um sermão, uma equipa confiante aguenta-o. `composure` médio do
 * onze decide quanto do golpe é absorvido.
 *
 * Módulo puro. O efeito na segunda parte viaja no `TacticChange.talkBoost` (o
 * motor só sabe multiplicar); o efeito na moral aplica-se ao estado.
 */
import type { GameState, Player, Tactic } from '../models';

/** O que o treinador pode dizer. */
export const TalkTone = {
  /** Elogiar: eleva quem está a ganhar, soa a resignação a quem está a perder. */
  PRAISE: 'PRAISE',
  /** Calma: pequeno e seguro, nunca estraga nada. */
  CALM: 'CALM',
  /** Exigir mais: acorda quem está a dormir, ofende quem está a cumprir. */
  DEMAND: 'DEMAND',
  /** Explodir: o all-in. Grande se for merecido, desastre se não for. */
  FURY: 'FURY',
} as const;
export type TalkTone = (typeof TalkTone)[keyof typeof TalkTone];

export const TALK_TONES: TalkTone[] = ['PRAISE', 'CALM', 'DEMAND', 'FURY'];

/** Como está o jogo à hora da palestra, do ponto de vista de quem fala. */
export const TalkSituation = {
  /** A ganhar por 2 ou mais. */
  CRUISING: 'CRUISING',
  /** A ganhar por 1. */
  AHEAD: 'AHEAD',
  DRAWING: 'DRAWING',
  /** A perder por 1. */
  BEHIND: 'BEHIND',
  /** A perder por 2 ou mais. */
  LOSING_BADLY: 'LOSING_BADLY',
} as const;
export type TalkSituation = (typeof TalkSituation)[keyof typeof TalkSituation];

export function situationOf(goalsFor: number, goalsAgainst: number): TalkSituation {
  const d = goalsFor - goalsAgainst;
  if (d >= 2) return 'CRUISING';
  if (d === 1) return 'AHEAD';
  if (d === 0) return 'DRAWING';
  if (d === -1) return 'BEHIND';
  return 'LOSING_BADLY';
}

/**
 * Reação base de cada tom em cada situação, em "pontos de palestra" (-10..+10).
 *
 * Lê-se por linhas: a mesma frase muda de valor conforme o marcador. Repare-se
 * que NENHUM tom é bom em todo o lado — o CALM é o único que nunca fere, e
 * também o único que nunca decide nada.
 */
const TALK_TABLE: Record<TalkTone, Record<TalkSituation, number>> = {
  //           a ganhar 2+   a ganhar 1   empate   a perder 1   a perder 2+
  PRAISE: { CRUISING: 6, AHEAD: 5, DRAWING: 2, BEHIND: -2, LOSING_BADLY: -6 },
  CALM: { CRUISING: 2, AHEAD: 2, DRAWING: 2, BEHIND: 1, LOSING_BADLY: 1 },
  DEMAND: { CRUISING: -3, AHEAD: 0, DRAWING: 4, BEHIND: 6, LOSING_BADLY: 5 },
  FURY: { CRUISING: -8, AHEAD: -5, DRAWING: -1, BEHIND: 5, LOSING_BADLY: 9 },
};

/** Limites do multiplicador de força que a palestra pode dar à 2.ª parte. */
export const TALK_BOOST_MIN = 0.93;
export const TALK_BOOST_MAX = 1.07;

export interface TalkOutcome {
  /** Multiplicador de força da 2.ª parte (1 = palestra sem efeito). */
  boost: number;
  /** Delta de moral aplicado a quem está em campo. */
  morale: number;
  /** Pontos de palestra crus, para a UI escolher a frase de reação. */
  points: number;
  /** Correu bem? (a UI colore o veredicto) */
  positive: boolean;
}

/** Compostura média do onze — quanto o balneário aguenta antes de se partir. */
function composureOf(tactic: Tactic, players: Record<string, Player>): number {
  let sum = 0;
  let n = 0;
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    sum += p.attributes.composure;
    n++;
  }
  return n > 0 ? sum / n : 10;
}

/** Moral média do onze. */
function moraleOf(tactic: Tactic, players: Record<string, Player>): number {
  let sum = 0;
  let n = 0;
  for (const slot of tactic.lineup) {
    const p = players[slot.playerId];
    if (!p) continue;
    sum += p.condition.morale;
    n++;
  }
  return n > 0 ? sum / n : 50;
}

/**
 * Calcula o efeito da palestra. Determinístico: mesma situação + mesmo plantel
 * → mesmo resultado. Nada de acaso aqui, porque o jogador tem de conseguir
 * APRENDER a ler o balneário; um dado escondido tornava isto num sorteio.
 */
export function evaluateTalk(
  tone: TalkTone,
  situation: TalkSituation,
  tactic: Tactic,
  players: Record<string, Player>,
): TalkOutcome {
  let points = TALK_TABLE[tone][situation];

  // COMPOSTURA amortece os extremos nos dois sentidos: um grupo experiente não
  // se desfaz com um sermão, mas também não se inflama com um discurso.
  const damp = 0.7 + (composureOf(tactic, players) - 10) * 0.03; // ~0.55..1.0
  points *= Math.max(0.5, Math.min(1.05, damp));

  // MORAL BAIXA amplifica o castigo: quem já está em baixo parte-se ao segundo
  // grito. Moral alta amortece-o. Não mexe no lado positivo — elogiar quem já
  // está bem não multiplica nada.
  if (points < 0) {
    const m = moraleOf(tactic, players);
    points *= m < 40 ? 1.4 : m > 70 ? 0.7 : 1;
  }

  const boost = Math.max(TALK_BOOST_MIN, Math.min(TALK_BOOST_MAX, 1 + points * 0.008));
  return {
    boost,
    morale: Math.round(points * 0.8),
    points: Math.round(points),
    positive: points >= 0,
  };
}

/**
 * Guarda a moral da palestra para ser aplicada NO FECHO DA SEMANA.
 *
 * ⚠ Não se aplica de imediato, e a razão é subtil mas decisiva: a moral entra
 * na força da equipa (`teamStrength`), e cada substituição ao vivo RE-SIMULA o
 * jogo inteiro a partir do minuto 1. Se a palestra mexesse na moral ali mesmo,
 * a primeira parte que o utilizador acabou de ver era recalculada com valores
 * diferentes e mudava por baixo dele — golos a aparecer e a desaparecer.
 *
 * O efeito imediato da palestra na 2.ª parte viaja no `talkBoost`, que o motor
 * aplica só a partir do minuto do corte. A moral é o efeito DURADOURO e entra
 * quando já não há re-simulações possíveis.
 *
 * Vive no blob da carreira, por isso sobrevive a fechar a app a meio do jogo.
 */
export function recordTalkMorale(state: GameState, delta: number): void {
  if (delta === 0) return;
  state.career.pendingTalkMorale = (state.career.pendingTalkMorale ?? 0) + delta;
}

/**
 * Aplica ao onze a moral acumulada pelas palestras e limpa o saldo. Chamado no
 * arranque de `advanceWeek`, quando o jogo anterior já não pode ser re-simulado.
 */
export function flushTalkMorale(state: GameState): number {
  const delta = state.career.pendingTalkMorale ?? 0;
  state.career.pendingTalkMorale = 0;
  if (delta === 0) return 0;
  applyTalkMorale(state, delta);
  return delta;
}

/** Aplica um delta de moral ao onze do clube gerido. */
export function applyTalkMorale(state: GameState, delta: number): void {
  if (delta === 0) return;
  const tactic = state.tactics[state.meta.managedClubId];
  if (!tactic) return;
  for (const slot of tactic.lineup) {
    const p = state.players[slot.playerId];
    if (!p) continue;
    p.condition.morale = Math.max(10, Math.min(95, p.condition.morale + delta));
  }
}

/** Chave i18n do que o treinador diz, por tom. */
export function talkLineKey(tone: TalkTone, situation: TalkSituation): string {
  return `talk.say.${tone}.${situation}`;
}

/** Chave i18n da reação do balneário. */
export function talkReactionKey(outcome: TalkOutcome): string {
  if (outcome.points >= 5) return 'talk.react.great';
  if (outcome.points >= 2) return 'talk.react.good';
  if (outcome.points >= 0) return 'talk.react.flat';
  if (outcome.points >= -4) return 'talk.react.bad';
  return 'talk.react.awful';
}
