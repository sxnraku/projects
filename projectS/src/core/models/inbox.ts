/**
 * Caixa de entrada — decisões que puxam o treinador para fora do "avançar".
 * Três tipos: propostas de compra (BID), contratos a expirar (RENEWAL) e
 * pedidos dos jogadores (REQUEST). Todos referem jogadores do clube gerido.
 */

export const InboxKind = {
  BID: 'BID', // proposta de outro clube por um jogador nosso
  RENEWAL: 'RENEWAL', // contrato do jogador expira no fim desta época
  REQUEST: 'REQUEST', // o jogador pede algo (aumento / quer sair)
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

export type InboxItem = BidItem | RenewalItem | RequestItem;

export const MAX_ACTIVE_BIDS = 5;
export const MAX_ACTIVE_RENEWALS = 4;
export const MAX_ACTIVE_REQUESTS = 3;
