/**
 * Caixa de entrada — decisões que puxam o treinador para fora do "avançar".
 * Três tipos: propostas de compra (BID), contratos a expirar (RENEWAL) e
 * pedidos dos jogadores (REQUEST). Todos referem jogadores do clube gerido.
 */

export const InboxKind = {
  BID: 'BID', // proposta de outro clube por um jogador nosso
  RENEWAL: 'RENEWAL', // contrato do jogador expira no fim desta época
  REQUEST: 'REQUEST', // o jogador pede algo (aumento / quer sair)
  OFFER: 'OFFER', // proposta NOSSA por um jogador de outro clube
  CRISIS: 'CRISIS', // dívida grave: é preciso vender alguém (decisão do treinador)
  PRESS: 'PRESS', // conferência de imprensa: uma pergunta, três respostas
} as const;
export type InboxKind = (typeof InboxKind)[keyof typeof InboxKind];

/** Proposta recebida por um jogador do clube gerido. */
export interface BidItem {
  kind: 'BID';
  id: string;
  playerId: string;
  fromClubId: string; // clube que quer comprar
  fee: number;
  wageOffer: number; // salário que o clube ofereceria ao jogador
  createdDate: string; // data de jogo em que chegou
  expiresDate: string; // data de jogo em que caduca
}

/** Aviso: o contrato deste jogador expira no fim da época atual. */
export interface RenewalItem {
  kind: 'RENEWAL';
  id: string;
  playerId: string;
  createdDate: string;
}

/** O que um jogador insatisfeito pode pedir. */
export const PlayerRequest = {
  WAGE_RISE: 'WAGE_RISE', // quer aumento salarial
  WANTS_LEAVE: 'WANTS_LEAVE', // quer ser colocado na lista de transferências
} as const;
export type PlayerRequest = (typeof PlayerRequest)[keyof typeof PlayerRequest];

/** Pedido de um jogador insatisfeito (moral baixa). */
export interface RequestItem {
  kind: 'REQUEST';
  id: string;
  playerId: string;
  request: PlayerRequest;
  createdDate: string;
  expiresDate: string;
}

/**
 * Estado de uma proposta NOSSA enviada a outro clube.
 * A resposta nunca é imediata: chega na jornada seguinte, o que obriga a
 * simular para saber o desfecho (é isto que separa gestão de "loja online").
 */
export const OfferStatus = {
  PENDING: 'PENDING', // enviada, à espera de resposta
  ACCEPTED: 'ACCEPTED', // aceite — o jogador já assinou
  REJECTED: 'REJECTED', // recusada
  COUNTER: 'COUNTER', // contra-proposta: exige decisão nossa
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

/** Proposta enviada pelo clube gerido por um jogador de outro clube. */
export interface OfferItem {
  kind: 'OFFER';
  id: string;
  playerId: string;
  toClubId: string; // clube vendedor
  fee: number;
  wageOffer: number;
  contractYears: number;
  /** Prémio de assinatura — convence quem desce de nível. */
  signingBonus: number;
  status: OfferStatus;
  createdDate: string;
  /** Data de jogo em que a resposta chega (status PENDING até lá). */
  respondDate: string;
  reasonKey?: string; // chave i18n da resposta do clube/jogador (a UI traduz)
  reasonParams?: import('../i18n').MsgParams;
  requiredFee?: number; // contra-proposta: passe exigido
  requiredWage?: number; // contra-proposta: salário exigido
}

/**
 * CRISE FINANCEIRA — a dívida chegou ao ponto em que é preciso vender.
 *
 * A direção já não decide sozinha: apresenta uma lista curta de candidatos e o
 * treinador escolhe de quem se livra. Antes, a venda acontecia em silêncio e
 * levava o melhor jogador do plantel — o utilizador só dava pela falta dele
 * dias depois ("roubaram-me mais um jogador").
 *
 * BLOQUEIA o avanço da jornada: é uma decisão que não se adia.
 */
export interface CrisisItem {
  kind: 'CRISIS';
  id: string;
  /** Candidatos à venda, do menos ao mais doloroso (nunca titulares primeiro). */
  candidates: string[];
  /** Quanto falta para tapar o buraco (para a UI explicar a dimensão). */
  debt: number;
  createdDate: string;
}

/**
 * CONFERÊNCIA DE IMPRENSA — a única entrada da caixa que não fala de dinheiro.
 *
 * Não bloqueia o avanço (ver `blockingItems`): é uma oportunidade, não um
 * imposto. Mas ignorá-la até caducar tem custo — os adeptos leem o silêncio.
 * O assunto e o texto são resolvidos por `core/game/press.ts`; aqui só vive o
 * necessário para a UI desenhar a pergunta.
 */
export interface PressItem {
  kind: 'PRESS';
  id: string;
  topic: import('../game/press').PressTopic;
  /** Qual das redações da pergunta/respostas usar. Ausente = a primeira. */
  variant?: number;
  /** Jogos da série (vitórias seguidas ou jogos sem ganhar), quando aplicável. */
  streak?: number;
  createdDate: string;
  expiresDate: string;
  /** Adversário do próximo jogo, quando a pergunta é sobre ele. */
  opponentName?: string;
  /** Jogador em causa (proposta recebida), quando a pergunta é sobre ele. */
  playerId?: string;
  playerName?: string;
}

export type InboxItem = BidItem | RenewalItem | RequestItem | OfferItem | CrisisItem | PressItem;

/**
 * Este item do inbox diz respeito a este jogador?
 *
 * A crise financeira é o único item que fala de VÁRIOS jogadores (os candidatos
 * à venda) em vez de um só, por isso não tem `playerId`. Quem varre o inbox à
 * procura de referências a um jogador deve usar isto e não `it.playerId`.
 */
export function inboxRefersTo(item: InboxItem, playerId: string): boolean {
  if (item.kind === 'CRISIS') return item.candidates.includes(playerId);
  // PRESS pode não falar de ninguém — `playerId` é opcional e fica undefined.
  return item.playerId === playerId;
}

export const MAX_ACTIVE_BIDS = 5;
export const MAX_ACTIVE_RENEWALS = 4;
export const MAX_ACTIVE_REQUESTS = 3;
/** Propostas nossas em curso ao mesmo tempo — trava o "spam" de ofertas. */
export const MAX_ACTIVE_OFFERS = 4;
