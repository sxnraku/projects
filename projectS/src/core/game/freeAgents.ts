/**
 * MERCADO DE LIVRES E PRÉ-CONTRATOS — o outro lado da lei Bosman.
 *
 * O jogo já modelava a metade dolorosa: nas últimas jornadas, clubes rivais
 * cortejam os TEUS jogadores em fim de contrato e levam-nos de graça
 * (`runBosmanApproaches`). A metade que compensa não existia — jogadores sem
 * clube existiam no estado mas eram invisíveis, e não havia forma de prender em
 * janeiro alguém que sai em julho.
 *
 * Duas coisas, portanto:
 *
 *  1. **Livres** — quem está sem clube pode ser assinado a qualquer momento,
 *     dentro ou fora da janela de transferências (é assim no futebol a sério).
 *     Não há passe: só ordenado e duração. Continua a haver estatuto — um livre
 *     de 85 não assina pela 3ª divisão só porque é de graça.
 *
 *  2. **Pré-contrato** — nas últimas `BOSMAN_WINDOW_ROUNDS` jornadas podes
 *     acordar com um jogador de OUTRO clube cujo contrato acaba esta época. Ele
 *     junta-se a ti no rollover, a custo zero. Se o clube dele o renovar
 *     entretanto, o acordo cai — foste apanhado a dormir, tal como acontece
 *     contigo do outro lado.
 */
import { checkInterest, divisionWageCap, withinDivisionCap } from '../economy/divisions';
import { canSpend, isInsolvent } from '../economy/finances';
import { requiredWageWith } from '../economy/clauses';
import { executeTransfer } from '../economy/transfers';
import { deriveSeed, Rng } from '../engine/rng';
import { GameState, naturalOverallFine, Player } from '../models';
import { BOSMAN_WINDOW_ROUNDS, roundsRemaining } from './matchday';
import { fansOnArrival } from './fans';

/** Acordo fechado com um jogador que ainda pertence a outro clube. */
export interface PreContract {
  playerId: string;
  /** Nome à data do acordo — a UI mostra-o mesmo que o jogador desapareça. */
  playerName: string;
  /** Clube onde ele ainda joga, para a lista fazer sentido. */
  fromClubName: string;
  wage: number;
  years: number;
  /** Época em que o acordo foi fechado (executa-se no rollover dessa época). */
  season: number;
}

/** Máximo de pré-contratos em aberto ao mesmo tempo. */
export const MAX_PRE_CONTRACTS = 3;

// ---------------------------------------------------------------------------
// Livres
// ---------------------------------------------------------------------------

/**
 * Jogadores sem clube, do melhor para o pior. Exclui quem está emprestado
 * (`loanOwnerId` marca um jogador que tem dono, mesmo sem clube atual).
 */
export function listFreeAgents(state: GameState): Player[] {
  return Object.values(state.players)
    .filter((p) => p.clubId === null && !p.condition.loanOwnerId)
    .sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a));
}

export interface SignResult {
  ok: boolean;
  errorKey?: string;
  params?: import('../i18n').MsgParams;
  /** Ordenado que ele exige, quando o problema é o salário. */
  requiredWage?: number;
}

/** O que este livre exige por semana para assinar. */
export function freeAgentWage(state: GameState, player: Player): number {
  return requiredWageWith(player, state.meta.season);
}

/**
 * Assina um jogador livre. Sem passe e SEM janela — um clube pode contratar
 * quem está desempregado em qualquer altura da época.
 */
export function signFreeAgent(
  state: GameState,
  playerId: string,
  wage: number,
  years: number,
): SignResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'free.err.gone' };
  if (player.clubId !== null || player.condition.loanOwnerId) {
    return { ok: false, errorKey: 'free.err.notFree' };
  }
  if (years < 1 || years > 6) return { ok: false, errorKey: 'free.err.years' };

  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  if (!club || !fin) return { ok: false, errorKey: 'free.err.gone' };
  if (isInsolvent(fin)) return { ok: false, errorKey: 'offer.reject.insolvent' };

  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  if (!withinDivisionCap(fin, tier, wage)) {
    return {
      ok: false,
      errorKey: 'offer.reject.wageCap',
      params: { cap: divisionWageCap(tier).toLocaleString('pt-PT'), left: '0' },
    };
  }

  // ESTATUTO: ser de graça não apaga o nível dele. Um livre continua a olhar
  // para o emblema — sem isto, um clube da 3ª apanhava craques todos os anos.
  const interest = checkInterest(player, club, tier);
  if (!interest.interested) {
    return { ok: false, errorKey: interest.reasonKey, params: interest.reasonParams };
  }

  const wanted = freeAgentWage(state, player);
  if (wage < wanted * 0.9) {
    return {
      ok: false,
      errorKey: 'free.err.wage',
      requiredWage: wanted,
      params: { wage: wanted.toLocaleString('pt-PT') },
    };
  }

  const res = executeTransfer(
    { playerId, fromClubId: clubId, fee: 0, wageOffer: wage, contractYears: years },
    state,
  );
  if (!res.ok) return { ok: false, errorKey: 'free.err.failed', params: { reason: res.error ?? '' } };
  // Um livre a sério é um reforço a sério: a bancada não pergunta quanto custou.
  fansOnArrival(state, player);
  return { ok: true };
}

/**
 * Os clubes da IA também andam no mercado de livres. Sem isto, o pool era um
 * bufete só para o utilizador: os melhores livres ficavam disponíveis para
 * sempre e valia a pena não contratar ninguém até ao fim da época.
 */
export function aiSignFreeAgents(state: GameState, rng: Rng): number {
  const free = listFreeAgents(state).filter((p) => p.clubId === null);
  if (free.length === 0) return 0;

  // Só os melhores interessam a alguém — o resto do pool fica parado.
  const targets = free.slice(0, 12);
  let signed = 0;
  for (const player of targets) {
    if (!rng.chance(0.18)) continue; // nem toda a semana alguém se decide
    const suitors = Object.values(state.clubs).filter((c) => {
      if (c.european || c.id === state.meta.managedClubId) return false;
      if (c.squad.length >= 26) return false;
      const fin = state.finances[c.id];
      if (!fin || isInsolvent(fin)) return false;
      const tier = state.leagues[c.leagueId]?.tier ?? 1;
      const wage = requiredWageWith(player, state.meta.season);
      if (!withinDivisionCap(fin, tier, wage)) return false;
      if (!canSpend(fin, 0)) return false;
      return checkInterest(player, c, tier).interested;
    });
    if (suitors.length === 0) continue;
    // O clube com mais reputação de entre os interessados leva-o.
    suitors.sort((a, b) => b.reputation - a.reputation);
    const buyer = suitors[0]!;
    const wage = requiredWageWith(player, state.meta.season);
    const res = executeTransfer(
      { playerId: player.id, fromClubId: buyer.id, fee: 0, wageOffer: wage, contractYears: rng.int(1, 3) },
      state,
    );
    if (res.ok) signed++;
  }
  return signed;
}

// ---------------------------------------------------------------------------
// Pré-contratos
// ---------------------------------------------------------------------------

/** Estamos na janela em que se podem fechar pré-contratos? */
export function preContractWindowOpen(state: GameState): boolean {
  const r = roundsRemaining(state);
  return r > 0 && r <= BOSMAN_WINDOW_ROUNDS;
}

/** Pré-contratos em aberto (limpa os de épocas passadas). */
export function preContracts(state: GameState): PreContract[] {
  const all = state.career.preContracts ?? [];
  return all.filter((p) => p.season === state.meta.season);
}

/**
 * Este jogador pode receber uma proposta de pré-contrato? Tem de estar noutro
 * clube e ficar livre no próximo fecho de época.
 *
 * O limiar é `season + 1` e não `season` porque `processContractExpiries` corre
 * DEPOIS de o rollover incrementar a época: quem fica livre este verão é quem
 * tem `contractUntil <= season + 1`. Com o limiar errado a lista vinha sempre
 * vazia — na primeira época do jogo nenhum contrato acaba no próprio ano.
 */
export function canPreContract(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || !player.clubId) return false;
  if (player.clubId === state.meta.managedClubId) return false;
  if (player.condition.loanOwnerId) return false;
  return player.contractUntil !== null && player.contractUntil <= state.meta.season + 1;
}

/** Jogadores de outros clubes que acabam contrato esta época, do melhor para o pior. */
export function preContractTargets(state: GameState): Player[] {
  return Object.values(state.players)
    .filter((p) => canPreContract(state, p.id))
    .sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a));
}

/** Fecha um acordo de pré-contrato. Ele junta-se a ti no rollover, de graça. */
export function agreePreContract(
  state: GameState,
  playerId: string,
  wage: number,
  years: number,
): SignResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'free.err.gone' };
  if (!preContractWindowOpen(state)) {
    return { ok: false, errorKey: 'pre.err.window', params: { rounds: String(BOSMAN_WINDOW_ROUNDS) } };
  }
  if (!canPreContract(state, playerId)) return { ok: false, errorKey: 'pre.err.notExpiring' };
  if (years < 1 || years > 6) return { ok: false, errorKey: 'free.err.years' };

  const list = (state.career.preContracts ??= []);
  const current = list.filter((p) => p.season === state.meta.season);
  if (current.some((p) => p.playerId === playerId)) {
    return { ok: false, errorKey: 'pre.err.already' };
  }
  if (current.length >= MAX_PRE_CONTRACTS) {
    return { ok: false, errorKey: 'pre.err.max', params: { max: String(MAX_PRE_CONTRACTS) } };
  }

  const clubId = state.meta.managedClubId;
  const club = state.clubs[clubId];
  const fin = state.finances[clubId];
  if (!club || !fin) return { ok: false, errorKey: 'free.err.gone' };

  const tier = state.leagues[club.leagueId]?.tier ?? 1;
  if (!withinDivisionCap(fin, tier, wage)) {
    return {
      ok: false,
      errorKey: 'offer.reject.wageCap',
      params: { cap: divisionWageCap(tier).toLocaleString('pt-PT'), left: '0' },
    };
  }
  // Sem passe a pagar, o estatuto é o único travão que resta.
  const interest = checkInterest(player, club, tier);
  if (!interest.interested) {
    return { ok: false, errorKey: interest.reasonKey, params: interest.reasonParams };
  }
  // Um pré-contrato custa mais em ordenado: ele sabe que não recebes passe.
  const wanted = Math.round(requiredWageWith(player, state.meta.season) * 1.15);
  if (wage < wanted * 0.9) {
    return {
      ok: false,
      errorKey: 'free.err.wage',
      requiredWage: wanted,
      params: { wage: wanted.toLocaleString('pt-PT') },
    };
  }

  list.push({
    playerId,
    playerName: `${player.firstName} ${player.lastName}`,
    fromClubName: state.clubs[player.clubId!]?.name ?? '',
    wage,
    years,
    season: state.meta.season,
  });
  return { ok: true };
}

/** Desiste de um pré-contrato ainda por executar. */
export function cancelPreContract(state: GameState, playerId: string): void {
  const list = state.career.preContracts;
  if (!list) return;
  const i = list.findIndex((p) => p.playerId === playerId && p.season === state.meta.season);
  if (i >= 0) list.splice(i, 1);
}

/** O que aconteceu a cada pré-contrato no fecho da época. */
export interface PreContractOutcome {
  playerName: string;
  /** `true` = juntou-se a nós; `false` = o clube dele renovou e o acordo caiu. */
  joined: boolean;
}

/**
 * Executa os pré-contratos. Chamar no rollover DEPOIS de `processContractExpiries`
 * (é aí que o jogador fica livre) e ANTES de a IA reconstruir plantéis, senão
 * outro clube apanha-o primeiro.
 */
export function resolvePreContracts(state: GameState): PreContractOutcome[] {
  const list = state.career.preContracts;
  if (!list || list.length === 0) return [];

  const clubId = state.meta.managedClubId;
  const done = list.filter((p) => p.season === state.meta.season - 1 || p.season === state.meta.season);
  const outcomes: PreContractOutcome[] = [];

  for (const pre of done) {
    const player = state.players[pre.playerId];
    // O clube dele renovou (continua com dono) → o acordo cai. É o mesmo que te
    // acontece quando renovas a tempo um jogador cortejado por outros.
    if (!player || player.clubId !== null) {
      outcomes.push({ playerName: pre.playerName, joined: false });
      continue;
    }
    const res = executeTransfer(
      { playerId: pre.playerId, fromClubId: clubId, fee: 0, wageOffer: pre.wage, contractYears: pre.years },
      state,
    );
    if (res.ok) fansOnArrival(state, player);
    outcomes.push({ playerName: pre.playerName, joined: res.ok });
  }

  // Sejam executados ou caídos, saem todos da lista.
  state.career.preContracts = list.filter((p) => !done.includes(p));
  return outcomes;
}

/** Semente determinística para o mercado de livres da IA nesta semana. */
export function freeAgentRng(state: GameState): Rng {
  return new Rng(deriveSeed(state.meta.rngSeed, 'freeAgents', state.meta.currentDate));
}
