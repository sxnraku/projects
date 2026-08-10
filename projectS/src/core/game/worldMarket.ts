/**
 * MERCADO INTERNACIONAL — contratar jogadores de OUTROS países, pelo mesmo painel
 * do mercado. Fluxo: mandas um olheiro a um país (custa e abre-o) → os jogadores
 * desse país passam a aparecer como alvos → assinas com o mesmo gate de alcance +
 * taxa. Só se carregam (lazy) os países explorados, por isso a perf mantém-se.
 *
 * Os clubes estrangeiros NÃO estão no estado (vivem no mundo de fundo), por isso a
 * contratação é uma compra direta pela taxa de mercado — sem contraproposta da
 * direção (que não existe para eles). Ao assinar, o jogador é instanciado de
 * verdade e entra no teu plantel.
 */
import {
  GameState, Player, Position, POSITION_GROUP, PositionGroup, SIGNING_QUIET_DAYS, silenceRequests,
} from '../models';
import { transferWindow } from '../season';
import { activeCountrySlug } from './activeCountry';
import { Rng, deriveSeed } from '../engine/rng';
import { WORLD_TEAMS } from '../data/world/worldTeams';
import { loadCountryPlayers, COUNTRIES } from '../data/world/playerIndex';
import { computeMarketValue, internationalPrestige, moveMoney } from '../economy';
import { reachability, availableBudget, Reach } from './offers';
import { makePlayerFromBase, decodeTuple } from './newGame';

/** Um alvo internacional (jogador de um país explorado). */
export interface WorldTarget {
  id: string; // `${slug}:${idx}` — estável (idx = posição no plantel do país)
  slug: string;
  clubName: string;
  clubColor: string;
  country: string;
  league: string;
  name: string;
  pos: string;
  age: number;
  ovr: number;
  pot: number;
  fee: number; // taxa (valor de mercado)
  reach: Reach; // OPEN / BONUS / LOCKED (mesmo gate do mercado interno)
  signingBonus: number; // prémio de assinatura exigido se BONUS/LOCKED
}

const clubMeta = (teamId: number) => WORLD_TEAMS.find((t) => t.id === teamId);

/** Janela de transferências do calendário do clube gerido. */
function currentWindow(state: GameState): { open: boolean } {
  const club = state.clubs[state.meta.managedClubId];
  const schedule = club ? state.schedules[club.leagueId] : undefined;
  if (!schedule) return { open: true };
  const played = schedule.fixtures.filter((f) => f.result).length;
  const perRound = Math.max(1, Math.round(schedule.fixtures.length / schedule.totalRounds));
  return transferWindow(Math.floor(played / perRound), schedule.totalRounds);
}

/** Instancia (determinístico) o jogador de um alvo — usado para mostrar E assinar. */
function buildTargetPlayer(state: GameState, slug: string, idx: number): Player | null {
  const tuples = loadCountryPlayers(slug);
  const tp = tuples[idx];
  if (!tp) return null;
  const bp = decodeTuple(tp);
  const rng = new Rng(deriveSeed(state.meta.rngSeed, 'worldsign', slug, idx));
  const clubId = `world_${bp.teamId}`; // clube estrangeiro (não no estado)
  const player = makePlayerFromBase(`${clubId}_p${idx}`, clubId, bp, state.meta.season, rng);
  // Prestígio da liga estrangeira RELATIVO à do gestor: contratar de Espanha custa
  // um prémio, de uma liga fraca um desconto (mercado doméstico fica intacto).
  const myCountry = activeCountrySlug(state);
  const prestige = internationalPrestige(slug, myCountry);
  player.marketValue = computeMarketValue(player, state.meta.season, prestige);
  return player;
}

/** Filtros do mercado internacional (todos opcionais). */
export interface WorldFilter {
  /** Ver só um país explorado de cada vez — a lista misturada era ilegível. */
  country?: string;
  /** Ver só um setor (GR/DEF/MED/ATA). */
  group?: PositionGroup;
  limit?: number;
}

/**
 * Alvos internacionais dos países explorados. Pré-filtra por overall alcançável
 * (barato) antes de instanciar, e devolve no máximo `limit` ordenados por overall.
 *
 * Sem filtro por país, 5 países explorados repartiam ~12 alvos cada e nunca se
 * via o que um país tinha de melhor — a queixa de "mandei olheiros e só vêm 10
 * jogadores". Com `country` a quota inteira é desse país.
 */
export function internationalTargets(state: GameState, filter: WorldFilter = {}): WorldTarget[] {
  const all = state.career.scoutedCountries ?? [];
  const scouted = filter.country ? all.filter((c) => c === filter.country) : all;
  const limit = filter.limit ?? 80;
  if (scouted.length === 0) return [];

  const club = state.clubs[state.meta.managedClubId];
  const myTier = club ? state.leagues[club.leagueId]?.tier ?? 3 : 3;
  // Banda de overall que faz sentido para o escalão (evita instanciar o mundo todo).
  const maxOvr = myTier <= 1 ? 100 : myTier === 2 ? 82 : 76;
  const minOvr = myTier <= 1 ? 66 : myTier === 2 ? 58 : 48;
  const signed = new Set(state.career.signedWorld ?? []);

  const out: WorldTarget[] = [];
  for (const slug of scouted) {
    const tuples = loadCountryPlayers(slug);
    for (let idx = 0; idx < tuples.length; idx++) {
      if (signed.has(`${slug}:${idx}`)) continue; // já contratado
      const ovr = tuples[idx]![6];
      if (ovr < minOvr || ovr > maxOvr) continue;
      if (filter.group && POSITION_GROUP[tuples[idx]![2] as Position] !== filter.group) continue;
      const player = buildTargetPlayer(state, slug, idx);
      if (!player) continue;
      const r = reachability(state, player);
      const meta = clubMeta(tuples[idx]![0]);
      out.push({
        id: `${slug}:${idx}`, slug,
        clubName: meta?.name ?? '—', clubColor: meta?.color ?? '#888',
        country: meta?.country ?? slug, league: meta?.league ?? '',
        name: player.firstName + ' ' + player.lastName, pos: player.positions[0]!,
        age: player.age, ovr, pot: tuples[idx]![7], fee: player.marketValue,
        reach: r.status, signingBonus: r.requiredSigningBonus,
      });
    }
  }
  // Amostra por FAIXAS de overall antes de cortar. Cortar o topo puro fazia com
  // que a lista viesse toda com o mesmo número ("é tudo 78"… e na época seguinte
  // "é tudo 82"): só sobreviviam os melhores, que num país inteiro são todos
  // parecidos. Assim vêm craques, jogadores de escalão médio e apostas baratas.
  return stratifyByOverall(out, limit)
    .sort((a, b) => (a.reach === b.reach ? b.ovr - a.ovr : rank(a.reach) - rank(b.reach) || b.ovr - a.ovr));
}
const rank = (r: Reach) => (r === 'OPEN' ? 0 : r === 'BONUS' ? 1 : 2);

/** Nº de faixas de overall usadas na amostragem do mercado internacional. */
export const WORLD_BANDS = 5;

/**
 * Escolhe `limit` alvos repartidos pelas faixas de overall disponíveis,
 * servindo-se primeiro das faixas mais altas mas sem as esgotar.
 */
function stratifyByOverall(list: WorldTarget[], limit: number): WorldTarget[] {
  if (list.length <= limit) return list;
  let min = Infinity, max = -Infinity;
  for (const t of list) { if (t.ovr < min) min = t.ovr; if (t.ovr > max) max = t.ovr; }
  const span = Math.max(1, max - min + 1);

  const buckets: WorldTarget[][] = Array.from({ length: WORLD_BANDS }, () => []);
  for (const t of list) {
    const b = Math.min(WORLD_BANDS - 1, Math.floor(((t.ovr - min) / span) * WORLD_BANDS));
    buckets[b]!.push(t);
  }
  for (const b of buckets) b.sort((a, z) => z.ovr - a.ovr);

  const out: WorldTarget[] = [];
  let i = 0;
  while (out.length < limit && buckets.some((b) => b.length > 0)) {
    const next = buckets[WORLD_BANDS - 1 - (i % WORLD_BANDS)]!.shift();
    if (next) out.push(next);
    i++;
  }
  return out;
}

export interface WorldSignResult { ok: boolean; reasonKey: string; player?: Player }

/** Custo de mandar um olheiro a um país (do saldo). Escala com o teu escalão. */
export function scoutCountryCost(state: GameState): number {
  const club = state.clubs[state.meta.managedClubId];
  const tier = club ? state.leagues[club.leagueId]?.tier ?? 3 : 3;
  return tier <= 1 ? 500_000 : tier === 2 ? 150_000 : 50_000;
}

/** Manda um olheiro a um país estrangeiro → abre o seu mercado. Paga do saldo. */
export function scoutCountry(state: GameState, slug: string): WorldSignResult {
  if (slug === activeCountrySlug(state)) return { ok: false, reasonKey: 'world.scout.own' };
  if (!COUNTRIES.some((c) => c.slug === slug)) return { ok: false, reasonKey: 'world.scout.invalid' };
  const scouted = state.career.scoutedCountries ?? [];
  if (scouted.includes(slug)) return { ok: false, reasonKey: 'world.scout.already' };
  const fin = state.finances[state.meta.managedClubId];
  const cost = scoutCountryCost(state);
  if (!fin || fin.balance < cost) return { ok: false, reasonKey: 'world.scout.noFunds' };
  moveMoney(fin, -cost);
  state.career.scoutedCountries = [...scouted, slug];
  return { ok: true, reasonKey: 'world.scout.done' };
}

/** Contrata um alvo internacional: paga a taxa (orçamento) e entra no plantel. */
export function signWorldTarget(state: GameState, targetId: string): WorldSignResult {
  const [slug, idxStr] = targetId.split(':');
  const idx = Number(idxStr);
  const managedId = state.meta.managedClubId;
  const club = state.clubs[managedId];
  const fin = state.finances[managedId];
  if (!club || !fin || !slug || Number.isNaN(idx)) return { ok: false, reasonKey: 'world.sign.invalid' };

  if ((state.career.signedWorld ?? []).includes(targetId)) return { ok: false, reasonKey: 'world.sign.invalid' };
  // A janela vale para TODO o mercado. Sem isto dava para reforçar em pleno
  // inverno pelo painel do Mundo, contornando a regra do mercado doméstico.
  if (!currentWindow(state).open) return { ok: false, reasonKey: 'world.sign.windowClosed' };
  const player = buildTargetPlayer(state, slug, idx);
  if (!player) return { ok: false, reasonKey: 'world.sign.invalid' };

  const r = reachability(state, player);
  if (r.status === 'LOCKED') return { ok: false, reasonKey: 'world.sign.unreachable' };
  const total = player.marketValue + (r.status === 'BONUS' ? r.requiredSigningBonus : 0);
  if (total > availableBudget(state)) return { ok: false, reasonKey: 'world.sign.noBudget' };

  // Transfere para o clube gerido.
  player.id = `${managedId}_w${Object.keys(state.players).length}`;
  player.clubId = managedId;
  silenceRequests(player.condition, state.meta.currentDate, SIGNING_QUIET_DAYS);
  moveMoney(fin, -total);
  state.players[player.id] = player;
  club.squad.push(player.id);
  state.career.signedWorld = [...(state.career.signedWorld ?? []), targetId];
  return { ok: true, reasonKey: 'world.sign.done', player };
}
