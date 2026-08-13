/**
 * ADEPTOS — a bancada como força própria.
 *
 * Até aqui só a DIREÇÃO avaliava o treinador: `career.confidence` subia com a
 * classificação e descia com ela, e mais nada no jogo tinha opinião. A
 * assistência existia, mas era uma linha de receita calculada a partir da forma
 * — ninguém no estádio sentia nada.
 *
 * Isto dá-lhes memória e voz. O humor (0-100) sobe e desce com aquilo que os
 * adeptos realmente veem — ganhar ao vizinho, perder com o último, vender o
 * melhor jogador, ficar longe do objetivo — e tem TRÊS efeitos reais:
 *
 *  1. **Estádio** — o humor multiplica a afluência (e portanto a bilheteira).
 *  2. **Casa** — apoio forte é vantagem de casa a sério no motor de jogo;
 *     um estádio revoltado deixa de valer o que valia.
 *  3. **Balneário e direção** — semanas seguidas de contestação picam a moral
 *     do plantel e roem a confiança da direção.
 *
 * Vive no blob `career` (sem migração de save) e só existe para o clube
 * gerido: uma multidão simulada para 1085 clubes seria custo sem retorno,
 * porque ninguém a veria.
 */
import type { MsgParams } from '../i18n';
import { type GameState, naturalOverall, type Player } from '../models';

/** Humor neutro — onde uma época começa e para onde o tempo empurra. */
export const FAN_NEUTRAL = 55;
export const FAN_MIN = 0;
export const FAN_MAX = 100;

/** Abaixo disto a bancada está em contestação aberta. */
export const FAN_UNREST = 30;
/** Acima disto é festa — e o estádio nota-se. */
export const FAN_EUPHORIA = 78;

/** Semanas seguidas de contestação até a direção começar a ouvir a rua. */
export const UNREST_PATIENCE = 3;

/** Quantos motivos recentes se guardam (a UI mostra os últimos). */
export const FAN_REASONS_KEPT = 6;

/** Uma linha do "porquê" do humor atual: chave i18n + variação. */
export interface FanReason {
  key: string;
  /** Variação aplicada, já arredondada (positiva ou negativa). */
  delta: number;
  params?: MsgParams;
  /** Data de jogo em que aconteceu. */
  date: string;
}

export interface FanState {
  /** Humor 0..100. */
  mood: number;
  /** Últimos motivos, do mais recente para o mais antigo. */
  reasons: FanReason[];
  /** Semanas seguidas abaixo de `FAN_UNREST`. */
  unrestWeeks: number;
}

export const clampMood = (v: number): number => Math.max(FAN_MIN, Math.min(FAN_MAX, v));

/**
 * O humor inicial não é 55 para toda a gente: os adeptos de um clube grande
 * chegam exigentes (a paciência é curta e a euforia rara) e os de um clube
 * pequeno chegam com o benefício da dúvida.
 */
export function initialMood(reputation: number): number {
  return Math.round(clampMood(FAN_NEUTRAL + (55 - reputation) * 0.18));
}

/** Garante o estado dos adeptos (saves antigos entram por aqui). Muta. */
export function ensureFans(state: GameState): FanState {
  if (!state.career.fans) {
    const club = state.clubs[state.meta.managedClubId];
    state.career.fans = {
      mood: initialMood(club?.reputation ?? 50),
      reasons: [],
      unrestWeeks: 0,
    };
  }
  const f = state.career.fans;
  // Sanidade: um save escrito por uma versão anterior pode não ter os campos.
  if (!Array.isArray(f.reasons)) f.reasons = [];
  if (typeof f.unrestWeeks !== 'number') f.unrestWeeks = 0;
  f.mood = clampMood(Number.isFinite(f.mood) ? f.mood : FAN_NEUTRAL);
  return f;
}

/**
 * O treinador mudou de clube: a bancada anterior fica para trás. Apaga o humor
 * (para `ensureFans` o recalcular a partir da reputação do novo clube), os
 * motivos antigos — que falariam de jogos de outra equipa — e qualquer bravata
 * por cumprir, que morre com o cargo em que foi feita.
 */
export function resetSupport(state: GameState): void {
  state.career.fans = undefined;
  state.career.press = undefined;
  state.inbox = state.inbox.filter((it) => it.kind !== 'PRESS');
}

/** Leitura simples para a UI e para o resto do core. */
export function fanMood(state: GameState): number {
  return state.career.fans ? clampMood(state.career.fans.mood) : FAN_NEUTRAL;
}

/**
 * Aplica uma variação ao humor e regista o motivo. `delta` é em pontos de
 * humor; devolve a variação EFETIVA (pode ser cortada pelos limites).
 */
export function nudgeFans(
  state: GameState, key: string, delta: number, params?: MsgParams,
): number {
  const f = ensureFans(state);
  const before = f.mood;
  f.mood = clampMood(f.mood + delta);
  const applied = Math.round(f.mood - before);
  if (applied !== 0) {
    f.reasons.unshift({ key, delta: applied, params, date: state.meta.currentDate });
    if (f.reasons.length > FAN_REASONS_KEPT) f.reasons.length = FAN_REASONS_KEPT;
  }
  return applied;
}

/** Faixa do humor — a UI escolhe cor e frase a partir disto. */
export const FanBand = {
  RIOT: 'RIOT',       // 0-19: querem o treinador fora
  ANGRY: 'ANGRY',     // 20-39: contestação
  CALM: 'CALM',       // 40-64: resignados
  HAPPY: 'HAPPY',     // 65-84: contentes
  ECSTATIC: 'ECSTATIC', // 85-100: em delírio
} as const;
export type FanBand = (typeof FanBand)[keyof typeof FanBand];

export function fanBand(mood: number): FanBand {
  if (mood < 20) return 'RIOT';
  if (mood < 40) return 'ANGRY';
  if (mood < 65) return 'CALM';
  if (mood < 85) return 'HAPPY';
  return 'ECSTATIC';
}

/**
 * Multiplicador de AFLUÊNCIA dado o humor. Vai de 0.78 (bancada vazia em
 * protesto) a 1.15 (casa cheia e fila à porta). Deliberadamente assimétrico:
 * a desilusão esvazia mais depressa do que o entusiasmo enche, porque o
 * estádio tem um teto e a indiferença não.
 */
export function attendanceFactor(mood: number): number {
  const m = clampMood(mood);
  return m >= FAN_NEUTRAL
    ? 1 + ((m - FAN_NEUTRAL) / (FAN_MAX - FAN_NEUTRAL)) * 0.15
    : 1 - ((FAN_NEUTRAL - m) / FAN_NEUTRAL) * 0.22;
}

/**
 * Apoio de casa a passar ao motor de jogo (0..100). É o humor, mas puxado para
 * o meio: nem o melhor ambiente do mundo transforma uma equipa fraca.
 */
export function homeSupport(mood: number): number {
  return Math.round(FAN_NEUTRAL + (clampMood(mood) - FAN_NEUTRAL) * 0.8);
}

/** O que o resultado de uma jornada faz ao humor. */
export interface FanMatchInput {
  /** Golos do clube gerido e do adversário. */
  goalsFor: number;
  goalsAgainst: number;
  /** Reputação do clube gerido e do adversário (0-100). */
  myReputation: number;
  oppReputation: number;
  derby: boolean;
  /** Nome curto do adversário, para o motivo ficar legível. */
  oppName: string;
}

/**
 * Reação da bancada a um jogo.
 *
 * O peso não é o resultado em si, é o resultado FACE AO ESPERADO. Ganhar em
 * casa do líder vale muito; perder com o último dói o dobro. A expectativa sai
 * da diferença de reputação, e um dérbi multiplica tudo — é o jogo que os
 * adeptos levam para o trabalho na segunda-feira.
 */
export function matchMoodDelta(input: FanMatchInput): { delta: number; key: string } {
  const { goalsFor, goalsAgainst, myReputation, oppReputation, derby } = input;
  // Expectativa de vitória, 0.15..0.85.
  const expected = Math.max(0.15, Math.min(0.85, 0.5 + (myReputation - oppReputation) / 160));
  const scale = derby ? 1.9 : 1;

  let delta: number;
  let key: string;
  if (goalsFor > goalsAgainst) {
    delta = (3 + (1 - expected) * 12) * scale;
    key = derby ? 'fans.reason.derbyWin' : 'fans.reason.win';
    // Goleada: uma tarde que se conta durante anos.
    if (goalsFor - goalsAgainst >= 3) delta += 2;
  } else if (goalsFor === goalsAgainst) {
    delta = ((0.45 - expected) * 12) * scale;
    key = delta >= 0 ? 'fans.reason.drawGood' : 'fans.reason.drawBad';
  } else {
    delta = -(3 + expected * 13) * scale;
    key = derby ? 'fans.reason.derbyLoss' : 'fans.reason.loss';
    if (goalsAgainst - goalsFor >= 3) delta -= 2;
  }
  return { delta: Math.round(delta), key };
}

/**
 * SEGUNDA HIPÓTESE: troca a reação da bancada a um jogo que foi repetido.
 *
 * Desfaz o que o resultado antigo provocou e aplica o do novo. A subtração usa
 * o delta REGISTADO no motivo (e não o recalculado), porque o original pode ter
 * sido cortado pelos limites 0-100 — sem isso o humor derivava a cada repetição.
 *
 * Devolve a variação líquida.
 */
export function replaceMatchReaction(
  state: GameState, before: FanMatchInput, after: FanMatchInput,
): number {
  const f = ensureFans(state);
  const old = matchMoodDelta(before);

  // Encontra o motivo daquele jogo (o mais recente que bata certo) e desfá-lo.
  const idx = f.reasons.findIndex((r) => r.key === old.key);
  if (idx >= 0) {
    f.mood = clampMood(f.mood - f.reasons[idx]!.delta);
    f.reasons.splice(idx, 1);
  }

  const now = matchMoodDelta(after);
  return nudgeFans(state, now.key, now.delta, { opp: after.oppName });
}

/** Contexto da semana para `updateFansWeek`. */
export interface FanWeekInput {
  /** Jogo do clube gerido, se houve. */
  match?: FanMatchInput;
  /** Posição atual na liga e nº de clubes (pressão de classificação). */
  position: number;
  clubCount: number;
  /** Posição que a direção espera (do objetivo). */
  expectedPosition: number;
}

export interface FanWeekResult {
  mood: number;
  band: FanBand;
  /** A bancada passou o limite de paciência esta semana? */
  unrest: boolean;
  /** Variação total da semana. */
  delta: number;
}

/**
 * Atualiza o humor no fecho da semana. Chamado uma vez por `advanceWeek`,
 * DEPOIS de os jogos estarem simulados e a posição recalculada.
 */
export function updateFansWeek(state: GameState, input: FanWeekInput): FanWeekResult {
  const f = ensureFans(state);
  const before = f.mood;

  if (input.match) {
    const { delta, key } = matchMoodDelta(input.match);
    if (delta !== 0) nudgeFans(state, key, delta, { opp: input.match.oppName });
  }

  // Classificação face ao esperado: um empurrão pequeno mas constante. É o que
  // faz uma época morna azedar sem nenhum desastre em particular.
  const gap = input.expectedPosition - input.position; // positivo = melhor do que o esperado
  if (gap !== 0) {
    const step = Math.max(-2, Math.min(2, gap * 0.4));
    f.mood = clampMood(f.mood + step);
  }

  // Regressão suave ao neutro: o futebol esquece. Sem isto, uma boa série no
  // início blindava o treinador o resto da época.
  f.mood = clampMood(f.mood + (FAN_NEUTRAL - f.mood) * 0.05);

  const unrestNow = f.mood < FAN_UNREST;
  f.unrestWeeks = unrestNow ? f.unrestWeeks + 1 : 0;

  return {
    mood: Math.round(f.mood),
    band: fanBand(f.mood),
    unrest: unrestNow && f.unrestWeeks >= UNREST_PATIENCE,
    delta: Math.round(f.mood - before),
  };
}

/**
 * Efeito do ambiente na MORAL do plantel, por semana. Pequeno de propósito: os
 * adeptos empurram, não decidem. Devolve o delta a somar a cada jogador.
 */
export function moraleFromFans(mood: number): number {
  if (mood >= FAN_EUPHORIA) return 2;
  if (mood >= FAN_NEUTRAL) return 1;
  if (mood < FAN_UNREST) return -2;
  return 0;
}

/**
 * Efeito da contestação na confiança da DIREÇÃO. Só morde quando a bancada já
 * passou da paciência — a direção defende o treinador enquanto pode, e depois
 * deixa de poder.
 */
export const UNREST_CONFIDENCE_HIT = 2;

// ---------------------------------------------------------------------------
// Eventos avulsos — chamados de fora quando algo acontece
// ---------------------------------------------------------------------------

/**
 * Peso de um jogador no plantel gerido: o overall dele a dividir pelo do melhor
 * (1 = é o melhor que lá há). É esta a régua dos eventos abaixo — a bancada não
 * reage a nomes, reage a perder (ou ganhar) alguém que faz falta.
 *
 * Devolve 0 se o clube não tiver plantel utilizável, o que desliga o evento.
 */
export function squadShare(state: GameState, overall: number): number {
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return 0;
  let best = 0;
  for (const id of club.squad) {
    const p = state.players[id];
    if (p) best = Math.max(best, naturalOverall(p));
  }
  // Travado em 1: quando o jogador JÁ saiu do plantel (venda forçada pela
  // direção), o "melhor" é o melhor dos que ficaram, e sem este travão vender
  // o craque dava uma fração acima de 1 e um golpe maior do que o previsto.
  return best > 0 ? Math.min(1, overall / best) : 0;
}

/**
 * Vendeu-se um jogador. O golpe é proporcional ao peso dele no plantel: vender
 * o 3.º avançado não custa nada, vender o capitão-goleador esvazia o estádio.
 * `share` é o overall dele a dividir pelo do melhor do plantel (0..1).
 */
export function fansOnSale(state: GameState, playerName: string, share: number): number {
  if (share < 0.9) return 0; // suplente ou peça substituível: ninguém dá por isso
  const delta = -Math.round((share - 0.88) * 90); // até ~-11 ao vender o melhor
  return delta === 0 ? 0 : nudgeFans(state, 'fans.reason.sold', delta, { player: playerName });
}

/** Chegou um reforço. `share` como acima: só um nome a sério mexe a bancada. */
export function fansOnSigning(state: GameState, playerName: string, share: number): number {
  if (share < 0.92) return 0;
  const delta = Math.round((share - 0.9) * 70);
  return delta === 0 ? 0 : nudgeFans(state, 'fans.reason.signed', delta, { player: playerName });
}

/**
 * ATALHO para os pontos de chegada e de saída do plantel gerido.
 *
 * A bancada tem de reagir da MESMA maneira venha o jogador de onde vier —
 * transferência, mercado internacional, fim de contrato ou pré-contrato — e
 * saia como sair. Sem isto, o manual prometia uma reação que só acontecia num
 * dos caminhos, que é pior do que não a prometer de todo.
 *
 * Chamar SEMPRE com o jogador ainda a existir em `state.players`.
 */
export function fansOnArrival(state: GameState, player: Player): number {
  if (player.clubId !== state.meta.managedClubId) return 0;
  return fansOnSigning(
    state, `${player.firstName} ${player.lastName}`, squadShare(state, naturalOverall(player)),
  );
}

/** Como `fansOnArrival`, para quem sai. `share` mede-se ANTES de o remover. */
export function fansOnDeparture(state: GameState, player: Player, share: number): number {
  return fansOnSale(state, `${player.firstName} ${player.lastName}`, share);
}

/** Ganhou-se um troféu. */
export function fansOnTrophy(state: GameState, trophyName: string): number {
  return nudgeFans(state, 'fans.reason.trophy', 18, { trophy: trophyName });
}

/** Subida de divisão. */
export function fansOnPromotion(state: GameState): number {
  return nudgeFans(state, 'fans.reason.promoted', 22);
}

/** Descida de divisão. */
export function fansOnRelegation(state: GameState): number {
  return nudgeFans(state, 'fans.reason.relegated', -28);
}
