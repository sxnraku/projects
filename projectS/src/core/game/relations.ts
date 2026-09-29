import { GameState, naturalOverall, Player, PlayerRelation, PlayerPromise, PromiseKind } from '../models';
import type { Msg } from '../i18n';

/**
 * RELAÇÃO COM O PLANTEL — falar com os jogadores.
 *
 * Até aqui a moral só se mexia por resultados e pelos pedidos do inbox: geria-se
 * uma folha de números, não pessoas. Agora o treinador pode ir ter com o jogador
 * e:
 *   - ELOGIAR — de graça se for merecido, contraproducente se não for. Ninguém
 *     acredita em quem elogia uma exibição má.
 *   - CRITICAR — dói na moral mas acorda quem está a dormir; injusto, queima
 *     a relação.
 *   - PROMETER — minutos ou um reforço. A moral sobe JÁ, mas fica um prazo. Se
 *     a promessa não for cumprida, a queda é muito maior do que a subida foi.
 *
 * A `trust` (-100..100) é a memória disto tudo: quem confia no treinador não vai
 * exigir aumentos de duas em duas semanas e assina renovações por menos dinheiro
 * (ver `economy/clauses.ts` e `inbox.ts`).
 *
 * Tudo determinístico: as conversas dependem de números do estado, nunca de RNG.
 */

export const TRUST_MIN = -100;
export const TRUST_MAX = 100;

/** Dias de silêncio depois de uma conversa — falar todos os dias não vale nada. */
export const TALK_COOLDOWN_DAYS = 21;
/** Prazo (dias) para cumprir uma promessa. ~5 jornadas. */
export const PROMISE_DAYS = 35;
/** Jogos que o jogador espera fazer depois de uma promessa de minutos. */
export const PROMISE_APPS_TARGET = 3;

const clampTrust = (v: number) => Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(v)));
const clampMorale = (v: number) => Math.max(5, Math.min(95, Math.round(v)));

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Relação atual (cria a estrutura por omissão para saves antigos). */
export function relationOf(player: Player): PlayerRelation {
  if (!player.condition.relation) player.condition.relation = { trust: 0 };
  return player.condition.relation;
}

export function trustOf(player: Player): number {
  return player.condition.relation?.trust ?? 0;
}

// ---------------------------------------------------------------- desempenho

/** Média de nota da época (0 se ainda não jogou). */
export function seasonRating(player: Player): number {
  const apps = player.condition.seasonApps ?? 0;
  if (apps <= 0) return 0;
  return (player.condition.seasonRating ?? 0) / apps;
}

/**
 * O jogador está a merecer elogios? Forma alta OU boa média de notas.
 * Quem ainda não jogou não está a merecer nada — nem elogio nem crítica.
 */
export function deservesPraise(player: Player): boolean {
  const rating = seasonRating(player);
  return player.condition.form >= 65 || (rating > 0 && rating >= 7);
}

/** O jogador está a merecer um raspanete? */
export function deservesCriticism(player: Player): boolean {
  const rating = seasonRating(player);
  return player.condition.form <= 40 || (rating > 0 && rating < 6.2);
}

// -------------------------------------------------------------------- falar

export const TalkKind = {
  PRAISE: 'PRAISE',
  CRITICISE: 'CRITICISE',
} as const;
export type TalkKind = (typeof TalkKind)[keyof typeof TalkKind];

export interface TalkResult {
  ok: boolean;
  /** A conversa correu bem? (falso = tiro pela culatra, não é erro) */
  wellReceived?: boolean;
  message?: Msg;
  errorKey?: string;
}

/** Este jogador está disponível para conversa agora? */
export function canTalk(state: GameState, player: Player): boolean {
  if (player.clubId !== state.meta.managedClubId) return false;
  const until = player.condition.relation?.talkCooldownUntil;
  return !until || until <= state.meta.currentDate;
}

/**
 * Fala com um jogador do plantel. Muta o estado (moral, confiança, cooldown).
 *
 * Elogio merecido e crítica merecida movem a agulha; o contrário sai caro. É
 * de propósito que não há RNG: o utilizador consegue ler a forma e a média de
 * notas no ecrã do jogador, por isso isto é uma decisão informada, não sorte.
 */
export function talkTo(state: GameState, playerId: string, kind: TalkKind): TalkResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'talk.err.invalid' };
  if (player.clubId !== state.meta.managedClubId) return { ok: false, errorKey: 'talk.err.notYours' };
  if (!canTalk(state, player)) return { ok: false, errorKey: 'talk.err.cooldown' };

  const rel = relationOf(player);
  rel.talkCooldownUntil = addDays(state.meta.currentDate, TALK_COOLDOWN_DAYS);
  const name = `${player.firstName} ${player.lastName}`;

  if (kind === 'PRAISE') {
    if (deservesPraise(player)) {
      player.condition.morale = clampMorale(player.condition.morale + 8);
      rel.trust = clampTrust(rel.trust + 10);
      return { ok: true, wellReceived: true, message: { key: 'talk.praise.good', params: { name } } };
    }
    // Elogiar quem está a jogar mal soa a gozo — e ele percebe.
    player.condition.morale = clampMorale(player.condition.morale - 3);
    rel.trust = clampTrust(rel.trust - 6);
    return { ok: true, wellReceived: false, message: { key: 'talk.praise.bad', params: { name } } };
  }

  if (deservesCriticism(player)) {
    // Justa: dói agora, mas acorda-o (forma sobe) e ele respeita a franqueza.
    player.condition.morale = clampMorale(player.condition.morale - 4);
    player.condition.form = Math.min(100, player.condition.form + 8);
    rel.trust = clampTrust(rel.trust + 6);
    return { ok: true, wellReceived: true, message: { key: 'talk.crit.good', params: { name } } };
  }
  player.condition.morale = clampMorale(player.condition.morale - 12);
  rel.trust = clampTrust(rel.trust - 12);
  return { ok: true, wellReceived: false, message: { key: 'talk.crit.bad', params: { name } } };
}

// ---------------------------------------------------------------- promessas

/** Nível de reforço que satisfaz uma promessa a este jogador. */
export function promisedSigningOverall(player: Player): number {
  return Math.max(8, naturalOverall(player) - 1);
}

/**
 * Faz uma promessa. A moral sobe já — é um adiantamento, não um presente:
 * `tickPromises` cobra-o no prazo.
 */
export function promiseTo(state: GameState, playerId: string, kind: PromiseKind): TalkResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, errorKey: 'talk.err.invalid' };
  if (player.clubId !== state.meta.managedClubId) return { ok: false, errorKey: 'talk.err.notYours' };
  const rel = relationOf(player);
  if (rel.promise) return { ok: false, errorKey: 'talk.err.promised' };
  if (!canTalk(state, player)) return { ok: false, errorKey: 'talk.err.cooldown' };

  rel.talkCooldownUntil = addDays(state.meta.currentDate, TALK_COOLDOWN_DAYS);
  rel.promise = {
    kind,
    deadline: addDays(state.meta.currentDate, PROMISE_DAYS),
    baselineApps: player.condition.seasonApps ?? 0,
    baselineSignings: state.career.signingsMade ?? 0,
    requiredOverall: kind === 'SIGNING' ? promisedSigningOverall(player) : undefined,
  };
  player.condition.morale = clampMorale(player.condition.morale + 10);
  const name = `${player.firstName} ${player.lastName}`;
  return {
    ok: true,
    wellReceived: true,
    message: { key: kind === 'PLAYING_TIME' ? 'talk.promise.minutes' : 'talk.promise.signing', params: { name } },
  };
}

/** Uma promessa que chegou ao prazo. */
export interface PromiseVerdict {
  playerId: string;
  playerName: string;
  kind: PromiseKind;
  kept: boolean;
}

/** A promessa foi cumprida à data de hoje? */
function isKept(state: GameState, player: Player, promise: PlayerPromise): boolean {
  if (promise.kind === 'PLAYING_TIME') {
    const apps = (player.condition.seasonApps ?? 0) - (promise.baselineApps ?? 0);
    return apps >= PROMISE_APPS_TARGET;
  }
  if (promise.kind === 'SIGNING') {
    // SIGNING: entrou algum reforço com o nível prometido depois da promessa?
    const since = promise.baselineSignings ?? 0;
    const required = promise.requiredOverall ?? 0;
    return (state.career.signings ?? []).some((s) => s.n > since && s.overall >= required);
  }
  if (promise.kind === 'CONTRACT_EXTENSION') {
    return (player.contractUntil ?? 0) > state.meta.season;
  }
  if (promise.kind === 'PROMOTION_OR_TITLE') {
    const club = state.clubs[state.meta.managedClubId];
    const table = club?.leagueId ? state.standings[club.leagueId] : undefined;
    const pos = table ? Object.values(table).sort((a, b) => b.points - a.points).findIndex((r) => r.clubId === club?.id) + 1 : 99;
    return pos <= 2;
  }
  return false;
}

/**
 * Avalia as promessas vencidas do plantel gerido. Chamar uma vez por
 * `advanceWeek`. Devolve os veredictos para notícia/balanço.
 *
 * A punição por falhar é maior do que o prémio por cumprir — de propósito:
 * senão prometer a toda a gente todas as semanas era moral de graça.
 */
export function tickPromises(state: GameState): PromiseVerdict[] {
  const today = state.meta.currentDate;
  const club = state.clubs[state.meta.managedClubId];
  if (!club) return [];

  const out: PromiseVerdict[] = [];
  for (const id of club.squad) {
    const player = state.players[id];
    const rel = player?.condition.relation;
    const promise = rel?.promise;
    if (!player || !rel || !promise) continue;

    // Cumprida antes do prazo? Fecha já — a boa notícia não espera.
    const kept = isKept(state, player, promise);
    if (!kept && promise.deadline > today) continue;

    rel.promise = undefined;
    if (kept) {
      player.condition.morale = clampMorale(player.condition.morale + 10);
      rel.trust = clampTrust(rel.trust + 16);
    } else {
      player.condition.morale = clampMorale(player.condition.morale - 20);
      rel.trust = clampTrust(rel.trust - 30);
    }
    out.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      kind: promise.kind,
      kept,
    });
  }
  return out;
}

/**
 * Resolve uma audiência interativa no Gabinete do Treinador com 3 opções de diálogo.
 */
export function resolveAudienceChoice(
  state: GameState,
  itemId: string,
  choice: 'OPTION_A' | 'OPTION_B' | 'OPTION_C',
): Msg | null {
  const item = state.inbox.find((it) => it.kind === 'REQUEST' && it.id === itemId);
  if (!item || item.kind !== 'REQUEST') return null;
  const player = state.players[item.playerId];
  state.inbox = state.inbox.filter((it) => it.id !== itemId);
  if (!player) return null;

  const rel = relationOf(player);
  const name = `${player.firstName} ${player.lastName}`;
  player.condition.requestCooldownUntil = addDays(state.meta.currentDate, 56);

  if (item.request === 'WANTS_MINUTES') {
    if (choice === 'OPTION_A') {
      // Prometer titularidade (3 jogos em 5 semanas)
      rel.promise = {
        kind: 'PLAYING_TIME',
        deadline: addDays(state.meta.currentDate, PROMISE_DAYS),
        baselineApps: player.condition.seasonApps ?? 0,
      };
      player.condition.morale = clampMorale(player.condition.morale + 12);
      rel.trust = clampTrust(rel.trust + 10);
      return { key: 'aud.minutes.promise', params: { name } };
    }
    if (choice === 'OPTION_B') {
      // Pedir paciência e rotação
      if (rel.trust >= 0) {
        player.condition.morale = clampMorale(player.condition.morale + 4);
        rel.trust = clampTrust(rel.trust + 5);
        return { key: 'aud.minutes.calm.ok', params: { name } };
      }
      player.condition.morale = clampMorale(player.condition.morale - 6);
      rel.trust = clampTrust(rel.trust - 8);
      return { key: 'aud.minutes.calm.bad', params: { name } };
    }
    // Rejeitar / Autoridade
    player.condition.morale = clampMorale(player.condition.morale - 15);
    rel.trust = clampTrust(rel.trust - 18);
    if (player.condition.morale < 30) player.transferListed = true;
    return { key: 'aud.minutes.reject', params: { name } };
  }

  if (item.request === 'WAGE_RISE') {
    if (choice === 'OPTION_A') {
      // Aumento salarial imediato
      const newWage = Math.max(Math.round((player.wage * 1.25) / 100) * 100, Math.round(player.wage * 1.2));
      player.wage = newWage;
      player.condition.morale = clampMorale(80);
      rel.trust = clampTrust(rel.trust + 15);
      return { key: 'aud.wage.accepted', params: { name, wage: newWage.toLocaleString('pt-PT') } };
    }
    if (choice === 'OPTION_B') {
      // Promessa de renovação no fecho da época
      rel.promise = {
        kind: 'CONTRACT_EXTENSION',
        deadline: addDays(state.meta.currentDate, 70),
      };
      player.condition.morale = clampMorale(player.condition.morale + 8);
      rel.trust = clampTrust(rel.trust + 8);
      return { key: 'aud.wage.promise', params: { name } };
    }
    // Recusa financeira
    player.condition.morale = clampMorale(player.condition.morale - 10);
    rel.trust = clampTrust(rel.trust - 12);
    return { key: 'aud.wage.reject', params: { name } };
  }

  if (item.request === 'WANTS_BIG_MOVE') {
    if (choice === 'OPTION_A') {
      // Pacto de 1 época para lutar por objetivos
      rel.promise = {
        kind: 'PROMOTION_OR_TITLE',
        deadline: addDays(state.meta.currentDate, 120),
      };
      player.condition.morale = clampMorale(player.condition.morale + 10);
      rel.trust = clampTrust(rel.trust + 12);
      return { key: 'aud.bigMove.pact', params: { name } };
    }
    if (choice === 'OPTION_B') {
      // Acordo de mercado amigável
      player.transferListed = true;
      player.condition.morale = clampMorale(60);
      rel.trust = clampTrust(rel.trust + 6);
      return { key: 'aud.bigMove.list', params: { name } };
    }
    // Porta trancada
    player.condition.morale = clampMorale(player.condition.morale - 18);
    rel.trust = clampTrust(rel.trust - 20);
    return { key: 'aud.bigMove.lock', params: { name } };
  }

  // WANTS_LEAVE
  if (choice === 'OPTION_A') {
    player.transferListed = true;
    player.condition.morale = clampMorale(55);
    rel.trust = clampTrust(rel.trust + 5);
    return { key: 'req.leaveAccepted', params: { name } };
  }
  if (choice === 'OPTION_B') {
    if (rel.trust >= 20) {
      player.transferListed = false;
      player.condition.morale = clampMorale(player.condition.morale + 6);
      rel.trust = clampTrust(rel.trust + 8);
      return { key: 'aud.leave.reconsider.ok', params: { name } };
    }
    player.condition.morale = clampMorale(player.condition.morale - 8);
    return { key: 'aud.leave.reconsider.bad', params: { name } };
  }
  player.condition.morale = clampMorale(player.condition.morale - 14);
  rel.trust = clampTrust(rel.trust - 18);
  return { key: 'req.leaveRefused', params: { name } };
}
