/**
 * IMPRENSA — a sala de conferências.
 *
 * O feed de notícias sempre falou sozinho: o mundo acontecia e o treinador
 * lia. Aqui a imprensa PERGUNTA, e a resposta tem preço. Cada conferência é
 * uma pergunta com três saídas, e as três são defensáveis:
 *
 *  - **Diplomático** — não custa nada e não rende quase nada. A escolha de
 *    quem não quer problemas.
 *  - **Defender o plantel** — o balneário agradece (moral), a bancada acha que
 *    o treinador está a tapar buracos (adeptos) e a direção fica de sobrolho.
 *  - **Bravata / dedo apontado** — o extremo. Prometer, desafiar ou culpar dá
 *    resposta grande imediata, mas uma bravata cria uma DÍVIDA: o próximo jogo
 *    confirma-a ou desmente-a, e desmentida custa o dobro do que rendeu.
 *
 * O que isto move é o que já existia e não conversava: `condition.morale` de
 * todo o plantel, `career.confidence` da direção e o humor dos adeptos
 * (`core/game/fans.ts`). A imprensa é o fio que liga os três.
 *
 * Módulo puro. Vive no blob `career` (`career.press`) e no inbox — nenhum dos
 * dois precisa de migração de save.
 */
import type { MsgParams } from '../i18n';
import type { GameState, PressItem } from '../models';
import { addNews } from '../news';
import { nudgeFans } from './fans';

/** Assunto da conferência. Determina a pergunta e as respostas possíveis. */
export const PressTopic = {
  /** Antevisão do próximo jogo. O caso geral. */
  PRE_MATCH: 'PRE_MATCH',
  /** Semana de dérbi: a pergunta que toda a gente quer ouvir. */
  DERBY: 'DERBY',
  /** Três ou mais jogos sem ganhar. */
  BAD_RUN: 'BAD_RUN',
  /** Três ou mais vitórias seguidas. */
  GOOD_RUN: 'GOOD_RUN',
  /** Derrota pesada na última jornada. */
  HEAVY_LOSS: 'HEAVY_LOSS',
  /** A bancada está em contestação aberta. */
  FAN_UNREST: 'FAN_UNREST',
  /** Um jogador nosso tem proposta em cima da mesa. */
  TRANSFER: 'TRANSFER',
  /** Zona de despromoção com a época a meio ou mais. */
  RELEGATION: 'RELEGATION',
  /** Na frente do campeonato com a época adiantada — a pergunta inevitável. */
  TITLE_RACE: 'TITLE_RACE',
  /** Vitória expressiva ou goleada na última jornada. */
  BIG_WIN: 'BIG_WIN',
  /** Noite europeia / jogo de competição internacional. */
  EUROPE: 'EUROPE',
  /** Eliminatória ou decisão de Taça nacional. */
  CUP_MATCH: 'CUP_MATCH',
  /** Apresentação / comentário sobre nova contratação de peso. */
  NEW_SIGNING: 'NEW_SIGNING',
  /** Questões disciplinares ou castigo de jogador. */
  DISCIPLINE_ISSUE: 'DISCIPLINE_ISSUE',
  /** Provocações e jogos psicológicos contra o treinador adversário. */
  MIND_GAMES: 'MIND_GAMES',
} as const;
export type PressTopic = (typeof PressTopic)[keyof typeof PressTopic];

/** Tom da resposta. */
export const PressTone = {
  CALM: 'CALM',
  BACK_SQUAD: 'BACK_SQUAD',
  BOLD: 'BOLD',
  BLAME: 'BLAME',
} as const;
export type PressTone = (typeof PressTone)[keyof typeof PressTone];

/**
 * Efeitos de uma resposta. Deltas pequenos de propósito: uma conferência não
 * salva uma época, mas dez conferências desastradas afundam-na.
 */
export interface PressOption {
  tone: PressTone;
  /** Delta na moral de TODO o plantel. */
  morale: number;
  /** Delta na confiança da direção. */
  confidence: number;
  /** Delta no humor dos adeptos. */
  fans: number;
  /**
   * Bravata: fica uma dívida que o próximo jogo cobra. Ganhar paga com juros,
   * não ganhar custa mais do que a bravata rendeu.
   */
  claim?: boolean;
}

/**
 * As respostas de cada assunto. Nem todos os tons fazem sentido em todos os
 * assuntos — apontar o dedo depois de três vitórias seria ridículo, e por isso
 * não está lá.
 */
export const PRESS_OPTIONS: Record<PressTopic, PressOption[]> = {
  PRE_MATCH: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: 0 },
    { tone: 'BACK_SQUAD', morale: 3, confidence: 0, fans: -1 },
    { tone: 'BOLD', morale: 1, confidence: 0, fans: 4, claim: true },
  ],
  DERBY: [
    { tone: 'CALM', morale: -1, confidence: 1, fans: -3 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 1 },
    { tone: 'BOLD', morale: 2, confidence: -1, fans: 8, claim: true },
  ],
  BAD_RUN: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: -2 },
    { tone: 'BACK_SQUAD', morale: 5, confidence: -2, fans: -3 },
    { tone: 'BLAME', morale: -6, confidence: 1, fans: 5 },
  ],
  GOOD_RUN: [
    { tone: 'CALM', morale: 1, confidence: 2, fans: 1 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 3 },
    { tone: 'BOLD', morale: 2, confidence: -1, fans: 7, claim: true },
  ],
  HEAVY_LOSS: [
    { tone: 'CALM', morale: 1, confidence: 0, fans: -3 },
    { tone: 'BACK_SQUAD', morale: 6, confidence: -3, fans: -5 },
    { tone: 'BLAME', morale: -7, confidence: 2, fans: 6 },
  ],
  FAN_UNREST: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: -1 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: -1, fans: -4 },
    { tone: 'BOLD', morale: 1, confidence: -2, fans: 10, claim: true },
  ],
  TRANSFER: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: -1 },
    { tone: 'BACK_SQUAD', morale: 5, confidence: -1, fans: 4 },
    { tone: 'BLAME', morale: -5, confidence: 2, fans: -2 },
  ],
  RELEGATION: [
    { tone: 'CALM', morale: 0, confidence: 0, fans: -2 },
    { tone: 'BACK_SQUAD', morale: 5, confidence: -2, fans: -3 },
    { tone: 'BOLD', morale: 3, confidence: -1, fans: 9, claim: true },
  ],
  TITLE_RACE: [
    { tone: 'CALM', morale: 1, confidence: 2, fans: 0 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 4 },
    { tone: 'BOLD', morale: 2, confidence: -2, fans: 11, claim: true },
  ],
  BIG_WIN: [
    { tone: 'CALM', morale: 1, confidence: 1, fans: 1 },
    { tone: 'BACK_SQUAD', morale: 5, confidence: 0, fans: 4 },
    { tone: 'BOLD', morale: 2, confidence: -1, fans: 8, claim: true },
  ],
  EUROPE: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: 0 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 3 },
    { tone: 'BOLD', morale: 2, confidence: -2, fans: 9, claim: true },
  ],
  CUP_MATCH: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: -1 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 2 },
    { tone: 'BOLD', morale: 2, confidence: -1, fans: 8, claim: true },
  ],
  NEW_SIGNING: [
    { tone: 'CALM', morale: 1, confidence: 1, fans: 2 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: 0, fans: 5 },
    { tone: 'BLAME', morale: -4, confidence: 1, fans: -1 },
  ],
  DISCIPLINE_ISSUE: [
    { tone: 'CALM', morale: 0, confidence: 1, fans: 0 },
    { tone: 'BACK_SQUAD', morale: 4, confidence: -1, fans: -2 },
    { tone: 'BLAME', morale: -6, confidence: 2, fans: 4 },
  ],
  MIND_GAMES: [
    { tone: 'CALM', morale: 0, confidence: 2, fans: -1 },
    { tone: 'BACK_SQUAD', morale: 3, confidence: 0, fans: 2 },
    { tone: 'BOLD', morale: 2, confidence: -2, fans: 9, claim: true },
  ],
};

/** Lista de órgãos de comunicação social para atribuir à conferência. */
export const PRESS_OUTLETS = [
  'press.outlet.sportsDaily',
  'press.outlet.tabloid',
  'press.outlet.fanRadio',
  'press.outlet.national',
] as const;

/** Nomes de repórteres conhecidos da sala de imprensa. */
export const PRESS_REPORTERS = [
  'João Pereira',
  'Miguel Silva',
  'Carlos Santos',
  'André Costa',
  'Tiago Martins',
  'Ricardo Ferreira',
  'Diogo Oliveira',
  'Rui Rodrigues',
] as const;

/**
 * Quantas maneiras diferentes existem de fazer a mesma pergunta.
 *
 * Sem isto, a mesma frase repetia-se de conferência em conferência e a
 * mecânica lia-se como um menu fixo. A variante é escolhida pela jornada, não
 * ao acaso: fica estável para uma dada conferência (sobrevive a gravar e
 * carregar) mas muda de uma para a seguinte.
 */
export const PRESS_VARIANTS = 3;
/** Variantes por RESPOSTA (menos, porque o tom já as distingue). */
export const ANSWER_VARIANTS = 2;

/** Bravata em aberto: paga-se ou cobra-se no próximo jogo do clube gerido. */
export interface PressClaim {
  topic: PressTopic;
  createdDate: string;
}

/** O que a carreira guarda sobre imprensa. */
export interface PressMemory {
  /** Data da última conferência dada (evita duas na mesma jornada). */
  lastDate?: string;
  /** Bravata por resolver. */
  claim?: PressClaim;
  /** Conferências deixadas cair sem resposta, no total da carreira. */
  skipped?: number;
}

/** Dias que uma conferência fica de pé antes de o jornalista desistir. */
export const PRESS_TTL_DAYS = 7;

/** Custo de não aparecer: os adeptos leem o silêncio como fuga. */
export const PRESS_SKIP_FANS = -3;

/** Recompensa/castigo de uma bravata, resolvida no jogo seguinte. */
export const CLAIM_PAYOFF = { morale: 3, confidence: 4, fans: 9 };
export const CLAIM_BACKFIRE = { morale: -5, confidence: -5, fans: -12 };

export function ensurePress(state: GameState): PressMemory {
  if (!state.career.press) state.career.press = {};
  return state.career.press;
}

/** A opção escolhida existe neste assunto? */
export function pressOption(topic: PressTopic, tone: PressTone): PressOption | null {
  return PRESS_OPTIONS[topic]?.find((o) => o.tone === tone) ?? null;
}

/** Sufixo de variante: a primeira não leva nenhum (mantém as chaves antigas). */
const suffix = (v: number) => (v > 0 ? `.${'bc'[v - 1]}` : '');

/** Chave i18n da pergunta do jornalista, na variante pedida. */
export function questionKey(topic: PressTopic, variant = 0, profile?: string): string {
  if (topic === 'TRANSFER' && profile) {
    return `press.q.TRANSFER.${profile}${suffix(variant % PRESS_VARIANTS)}`;
  }
  return `press.q.${topic}${suffix(variant % PRESS_VARIANTS)}`;
}

/** Chave i18n de uma resposta possível, na variante pedida. */
export function answerKey(topic: PressTopic, tone: PressTone, variant = 0, profile?: string): string {
  if (topic === 'TRANSFER' && profile) {
    return `press.a.TRANSFER.${profile}.${tone}${suffix(variant % ANSWER_VARIANTS)}`;
  }
  return `press.a.${topic}.${tone}${suffix(variant % ANSWER_VARIANTS)}`;
}

/** Escolhe deterministicamente o órgão e repórter da conferência. */
export function pickOutlet(season: number, round: number, topic: PressTopic): { outletKey: string; journalistName: string } {
  const hash = Math.abs(season * 13 + round * 17 + topic.length * 23);
  const outletKey = PRESS_OUTLETS[hash % PRESS_OUTLETS.length]!;
  const journalistName = PRESS_REPORTERS[(hash >> 2) % PRESS_REPORTERS.length]!;
  return { outletKey, journalistName };
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

/** O que a semana traz, para escolher o assunto da conferência. */
export interface PressContext {
  /**
   * Forma recente do clube gerido, mais recente primeiro. Convém dar-lhe MAIS
   * do que 3 jogos: era isso que fazia a pergunta dizer sempre "três vitórias"
   * a quem levava cinco ou seis seguidas.
   */
  form: ('W' | 'D' | 'L')[];
  /** O próximo jogo é um dérbi? */
  nextIsDerby: boolean;
  /** Nome curto do próximo adversário (vazio se a época acabou). */
  nextOpponent: string;
  /** Diferença de golos do último jogo (negativa = derrota). */
  lastMargin: number;
  /** Humor dos adeptos. */
  fanMood: number;
  /** A bancada passou o limite de paciência? */
  unrest: boolean;
  /** Posição e nº de clubes na liga. */
  position: number;
  clubCount: number;
  /** Fração da época já jogada (0..1). */
  seasonProgress: number;
  /** Jogador nosso alvo de proposta ou rumor de mercado (id + nome + perfil). */
  bidTarget?: {
    playerId: string;
    playerName: string;
    profile?: 'STAR' | 'WONDERKID' | 'UNHAPPY' | 'EXPIRING' | 'BID';
    suitorName?: string;
  };
  /** Golos marcados / sofridos no último jogo. */
  lastResultGoals?: { scored: number; conceded: number };
  /** O próximo jogo é europeu? */
  nextIsEurope?: boolean;
  /** O próximo jogo é de taça? */
  nextIsCup?: boolean;
  /** Reforço recém-contratado (id + nome), se houver. */
  newSigning?: { playerId: string; playerName: string };
  /** Jogador em risco/castigo disciplinar (id + nome), se houver. */
  disciplinedPlayer?: { playerId: string; playerName: string };
  /** Treinador ou clube adversário para mind games. */
  mindGamesOpponent?: string;
}

/** Vitórias seguidas, do jogo mais recente para trás. */
export function winStreak(form: ('W' | 'D' | 'L')[]): number {
  let n = 0;
  for (const r of form) { if (r !== 'W') break; n++; }
  return n;
}

/** Jogos seguidos sem ganhar. */
export function winlessStreak(form: ('W' | 'D' | 'L')[]): number {
  let n = 0;
  for (const r of form) { if (r === 'W') break; n++; }
  return n;
}

/**
 * Escolhe o assunto. Ordem de prioridade: o que um jornalista perguntaria
 * primeiro. Sem próximo jogo e sem drama, não há conferência (devolve null) —
 * uma pergunta genérica todas as semanas seria ruído, e ruído ensina o jogador
 * a fechar a caixa sem ler.
 */
export function pickTopic(ctx: PressContext): PressTopic | null {
  if (ctx.unrest) return 'FAN_UNREST';
  if (ctx.disciplinedPlayer) return 'DISCIPLINE_ISSUE';
  if (ctx.lastMargin <= -3) return 'HEAVY_LOSS';
  if (ctx.lastMargin >= 3 || (ctx.lastResultGoals && ctx.lastResultGoals.scored >= 4)) return 'BIG_WIN';
  if (ctx.nextIsDerby) return 'DERBY';
  if (ctx.nextIsEurope) return 'EUROPE';
  if (ctx.nextIsCup) return 'CUP_MATCH';
  if (ctx.newSigning) return 'NEW_SIGNING';
  if (ctx.bidTarget) return 'TRANSFER';

  // A CORRIDA AO TÍTULO passa à frente da simples série de vitórias: quem lidera
  // em abril não quer ouvir falar dos últimos três jogos.
  if (ctx.seasonProgress >= 0.55 && ctx.position <= 2) return 'TITLE_RACE';

  if (winStreak(ctx.form) >= 3) return 'GOOD_RUN';
  if (winlessStreak(ctx.form) >= 3) return 'BAD_RUN';

  // Zona de descida com a época a meio ou mais: a pergunta inevitável.
  const dropZone = ctx.clubCount - 2;
  if (ctx.seasonProgress >= 0.5 && ctx.position >= dropZone) return 'RELEGATION';

  // Mind games ocasionais com o adversário.
  if (ctx.mindGamesOpponent && ctx.seasonProgress >= 0.25) return 'MIND_GAMES';

  // Antevisão normal: só de vez em quando, para a conferência continuar a ser
  // um acontecimento. Sem próximo adversário não há o que anteceder.
  if (!ctx.nextOpponent) return null;
  return 'PRE_MATCH';
}

/**
 * Cria a conferência da jornada no inbox, se houver assunto. Devolve o item
 * criado (ou null). Determinística: o assunto sai do contexto, não do acaso.
 *
 * `preMatchEvery` limita as antevisões banais a uma em cada N jornadas — os
 * assuntos quentes (dérbi, contestação, derrota pesada, etc.) passam sempre.
 */
export function generatePressConference(
  state: GameState, ctx: PressContext, round: number, preMatchEvery = 4,
): PressItem | null {
  const press = ensurePress(state);
  // Uma por jornada.
  if (press.lastDate === state.meta.currentDate) return null;
  if (state.inbox.some((it) => it.kind === 'PRESS')) return null;

  const topic = pickTopic(ctx);
  if (!topic) return null;
  if (topic === 'PRE_MATCH' && (round <= 0 || round % preMatchEvery !== 0)) return null;

  // A variante sai da época + jornada: estável para esta conferência, diferente
  // na próxima. Nada de acaso — o mesmo save relê sempre a mesma pergunta.
  const variant = (state.meta.season * 5 + round * 7 + topic.length * 11) % PRESS_VARIANTS;
  const { outletKey, journalistName } = pickOutlet(state.meta.season, round, topic);

  const targetPlayer = ctx.bidTarget ?? ctx.newSigning ?? ctx.disciplinedPlayer;

  const item: PressItem = {
    kind: 'PRESS',
    id: `press_${state.meta.season}_${round}_${topic}`,
    topic,
    variant,
    streak: topic === 'GOOD_RUN' ? winStreak(ctx.form)
      : topic === 'BAD_RUN' ? winlessStreak(ctx.form) : undefined,
    createdDate: state.meta.currentDate,
    expiresDate: addDays(state.meta.currentDate, PRESS_TTL_DAYS),
    opponentName: ctx.mindGamesOpponent || ctx.nextOpponent || undefined,
    playerId: targetPlayer?.playerId,
    playerName: targetPlayer?.playerName,
    playerProfile: ctx.bidTarget?.profile,
    suitorName: ctx.bidTarget?.suitorName,
    outletKey,
    journalistName,
  };
  state.inbox.push(item);
  press.lastDate = state.meta.currentDate;
  return item;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Resolução
// ---------------------------------------------------------------------------

export interface PressAnswerResult {
  ok: boolean;
  /** Chave i18n da reação (a UI mostra no toast). */
  messageKey?: string;
  messageParams?: MsgParams;
  /** Ficou uma bravata por confirmar? */
  claimed?: boolean;
}

/** Aplica um delta de moral a todo o plantel do clube gerido. */
function nudgeSquadMorale(state: GameState, delta: number): void {
  if (delta === 0) return;
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return;
  for (const id of club.squad) {
    const p = state.players[id];
    if (!p) continue;
    p.condition.morale = Math.max(10, Math.min(95, p.condition.morale + delta));
  }
}

/** Aplica um delta à confiança da direção, dentro dos limites do jogo. */
function nudgeConfidence(state: GameState, delta: number): void {
  if (delta === 0) return;
  state.career.confidence = Math.max(0, Math.min(100, state.career.confidence + delta));
}

/**
 * Responde à conferência. Remove o item do inbox e aplica os efeitos.
 * `tone` tem de pertencer ao assunto — se não pertencer, não faz nada.
 */
export function answerPress(state: GameState, itemId: string, tone: PressTone): PressAnswerResult {
  const item = state.inbox.find((it): it is PressItem => it.kind === 'PRESS' && it.id === itemId);
  if (!item) return { ok: false, messageKey: 'press.gone' };
  const opt = pressOption(item.topic, tone);
  if (!opt) return { ok: false, messageKey: 'press.gone' };

  state.inbox = state.inbox.filter((it) => it.id !== itemId);

  nudgeSquadMorale(state, opt.morale);
  nudgeConfidence(state, opt.confidence);
  if (opt.fans !== 0) {
    nudgeFans(state, `press.reason.${tone}`, opt.fans, { opp: item.opponentName ?? '' });
  }

  // Efeito de moral individual no jogador em foco (reforço, castigo ou proposta/rumor)
  if (item.playerId && state.players[item.playerId]) {
    const p = state.players[item.playerId];
    if (opt.tone === 'BACK_SQUAD') {
      p.condition.morale = Math.max(10, Math.min(95, p.condition.morale + 8));
    } else if (opt.tone === 'BLAME') {
      p.condition.morale = Math.max(10, Math.min(95, p.condition.morale - 10));
    }
  }

  const press = ensurePress(state);
  if (opt.claim) press.claim = { topic: item.topic, createdDate: state.meta.currentDate };

  const clubShort = state.clubs[state.meta.managedClubId]?.shortName ?? '';

  // Gera manchetes no feed de notícias quando há declarações marcantes
  if (item.topic === 'TRANSFER') {
    if (opt.tone === 'BACK_SQUAD') {
      addNews(state, 'TRANSFER', 'news.press.transferLocked', { player: item.playerName ?? '', club: clubShort });
    } else if (opt.tone === 'BLAME') {
      addNews(state, 'TRANSFER', 'news.press.transferOpen', { player: item.playerName ?? '', club: clubShort });
    }
  } else if (opt.tone === 'BOLD') {
    addNews(state, 'CLUB', 'news.press.boldHeadline', {
      opp: item.opponentName ?? '',
      club: clubShort,
    });
  } else if (opt.tone === 'BLAME') {
    addNews(state, 'CLUB', 'news.press.blameHeadline', {
      player: item.playerName ?? '',
      club: clubShort,
    });
  }

  return {
    ok: true,
    messageKey: `press.said.${tone}`,
    messageParams: { opp: item.opponentName ?? '', player: item.playerName ?? '' },
    claimed: opt.claim === true,
  };
}

/**
 * Caduca conferências não respondidas. Calar-se tem custo — pequeno, mas
 * cumulativo: quem nunca fala vê a bancada afastar-se.
 */
export function expirePress(state: GameState): boolean {
  const today = state.meta.currentDate;
  const stale = state.inbox.filter((it): it is PressItem => it.kind === 'PRESS' && it.expiresDate < today);
  if (stale.length === 0) return false;
  state.inbox = state.inbox.filter((it) => !stale.includes(it as PressItem));
  const press = ensurePress(state);
  press.skipped = (press.skipped ?? 0) + stale.length;
  nudgeFans(state, 'fans.reason.silence', PRESS_SKIP_FANS * stale.length);
  return true;
}

export interface ClaimOutcome {
  /** A bravata foi confirmada? */
  delivered: boolean;
  topic: PressTopic;
}

/**
 * Fecha a bravata em aberto com o resultado do jogo do clube gerido.
 * `won` é o único critério: prometer e empatar é não cumprir.
 */
export function resolveClaim(state: GameState, won: boolean): ClaimOutcome | null {
  const press = ensurePress(state);
  const claim = press.claim;
  if (!claim) return null;
  press.claim = undefined;

  const fx = won ? CLAIM_PAYOFF : CLAIM_BACKFIRE;
  nudgeSquadMorale(state, fx.morale);
  nudgeConfidence(state, fx.confidence);
  nudgeFans(state, won ? 'fans.reason.claimKept' : 'fans.reason.claimBroken', fx.fans);
  return { delivered: won, topic: claim.topic };
}
