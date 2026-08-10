import {
  Club, effectiveOverallFine, Formation, GameState, inboxRefersTo, naturalOverallFine,
  Player, Position, Tactic,
} from '../models';
import { deriveSeed, Rng } from '../engine/rng';
import { computeMarketValue, recalcWages, suggestedWage } from '../economy';
import { makePlayer } from './newGame';
import { FORMATION_POSITIONS } from './lineup';

/**
 * MERCADO DA IA — mantém os plantéis dos clubes não geridos ao nível do seu
 * estatuto, época após época.
 *
 * Sem isto os clubes da IA só PERDEM qualidade: reformas e fins de contrato
 * levam titulares, e as únicas entradas são jovens de academia (nível muito
 * abaixo do onze). Ao fim de 2-3 épocas a 1ª divisão inteira decai e a ordem
 * deixa de bater certo com a reputação — o campeão histórico cai para meio da
 * tabela e um clube pequeno lidera, sem que nada o justifique. Era exatamente
 * a queixa do playtest ("1ª divisão desequilibrada").
 *
 * O modelo é simples de propósito: cada clube tem um NÍVEL-ALVO de onze dado
 * pela reputação; se o ONZE (não o plantel em geral) estiver abaixo, o clube
 * contrata para as posições em falta e liberta os dispensáveis. Se estiver
 * acima, não faz nada — o envelhecimento natural trata de o puxar para baixo,
 * o que dá o arco realista do clube que desce de divisão e vai perdendo o
 * plantel de outrora ao longo de algumas épocas.
 */

/** Plantel-tipo: acima disto, contratar implica libertar. */
export const SQUAD_TARGET_SIZE = 22;
/** Margem aceite abaixo do alvo (evita contratações cosméticas todas as épocas). */
const TOLERANCE = 0.25;
/** Teto de contratações por clube e por época — o mercado não é infinito. */
const MAX_SIGNINGS = 8;
/** Idade das contratações da IA: gente na força da vida, não miúdos nem veteranos. */
const SIGNING_AGE = [21, 29] as const;

/**
 * Nível-alvo do onze (escala interna 0..20) para um clube com esta reputação.
 *
 * Regressão linear sobre o estado inicial de 378 clubes reais (8 países, todos
 * os escalões), medindo o ONZE que `autoPickLineup` escolhe. O alvo é
 * literalmente "o que um clube com esta reputação tem no arranque do jogo" —
 * assim a IA converge para os valores do dataset e não para um número inventado.
 */
export function squadTargetOverall(reputation: number): number {
  return Math.max(4, Math.min(19, LINEUP_INTERCEPT + LINEUP_SLOPE * reputation));
}
const LINEUP_INTERCEPT = 9.61;
const LINEUP_SLOPE = 0.0757;

/**
 * O onze que o clube consegue montar AGORA e a média por slot. Medir o onze (e
 * não os 11 melhores do plantel) é o que evita o buraco por setor: um clube com
 * 11 defesas excelentes tem "top-11" alto mas ataque nulo, e era assim que a IA
 * ficava com ATA 45 e DEF 92.
 */
export function lineupSlots(
  club: Club, players: Record<string, Player>, formation: Formation,
): Array<{ position: Position; rating: number }> {
  const used = new Set<string>();
  const out: Array<{ position: Position; rating: number }> = [];
  for (const position of FORMATION_POSITIONS[formation]) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const id of club.squad) {
      const p = players[id];
      if (!p || used.has(id)) continue;
      const score = effectiveOverallFine(p, position);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { used.add(best.id); out.push({ position, rating: bestScore }); }
  }
  return out;
}

/** Média do onze montável (0 se o plantel nem 11 jogadores tiver). */
export function lineupAverage(club: Club, players: Record<string, Player>, formation: Formation): number {
  const slots = lineupSlots(club, players, formation);
  if (slots.length < 11) return 0;
  return slots.reduce((s, x) => s + x.rating, 0) / slots.length;
}

/**
 * Quão dispensável é um jogador: baixo overall pesa, e a idade pesa mais ainda
 * — assim quem é libertado é o veterano fraco (que se reforma em breve) e não
 * um jovem com margem de evolução. Menor = mais dispensável.
 */
function keepScore(p: Player): number {
  return naturalOverallFine(p) - Math.max(0, p.age - 28) * 0.6 + Math.max(0, 23 - p.age) * 0.3;
}

/** Contrata UM reforço para o clube, na posição pedida e ao nível-alvo. */
function signReinforcement(
  state: GameState, club: Club, position: Position, level: number, idx: number, rng: Rng,
): Player {
  const id = `ai_${state.meta.season}_${club.id}_${idx}`;
  // +1 sobre o alvo porque `makePlayer` aplica um viés para baixo (-2..+1).
  const player = makePlayer(id, club.id, position, Math.round(level) + 1, state.meta.season, rng);
  player.age = rng.int(SIGNING_AGE[0], SIGNING_AGE[1]);
  player.contractUntil = state.meta.season + rng.int(2, 5);
  player.wage = suggestedWage(player, state.meta.season);
  player.marketValue = computeMarketValue(player, state.meta.season);
  state.players[id] = player;
  club.squad.push(id);
  return player;
}

/**
 * Corre o mercado da IA para todos os clubes não geridos. Chamar no rollover,
 * DEPOIS de reformas/fins de contrato/`ensureMinimumSquad` (para o alvo ser
 * medido no plantel já desfalcado) e ANTES de repor os onzes.
 *
 * Determinístico: a seed de cada clube deriva da seed-mãe + época + clubId.
 * Devolve o total de contratações feitas (para diagnóstico/testes).
 */
export function rebuildAiSquads(state: GameState): number {
  let total = 0;

  for (const club of Object.values(state.clubs)) {
    if (club.id === state.meta.managedClubId) continue; // o utilizador faz o seu mercado
    if (club.european) continue; // clubes europeus temporários não têm época própria

    const target = squadTargetOverall(club.reputation);
    const formation = (state.tactics[club.id] as Tactic | undefined)?.formation ?? Formation.F_4_3_3;
    const rng = new Rng(deriveSeed(state.meta.rngSeed, 'aimarket', state.meta.season, club.id));

    for (let i = 0; i < MAX_SIGNINGS; i++) {
      const slots = lineupSlots(club, state.players, formation);
      if (slots.length < 11) break; // `ensureMinimumSquad` trata dos plantéis curtos

      const avg = slots.reduce((s, x) => s + x.rating, 0) / slots.length;
      if (avg >= target - TOLERANCE) break;

      // Reforça o SLOT mais fraco do onze — é ele que está a puxar a média.
      const weakest = slots.reduce((a, b) => (b.rating < a.rating ? b : a));
      signReinforcement(state, club, weakest.position, target, i, rng);
      total++;

      // Plantel cheio: liberta o mais dispensável (fica agente livre, como no
      // fim de contrato — nunca apagamos jogadores, para não deixar referências
      // penduradas no inbox/olheiros/empréstimos).
      if (club.squad.length > SQUAD_TARGET_SIZE) {
        const out = club.squad
          .map((id) => state.players[id])
          .filter((p): p is Player => !!p)
          .sort((a, b) => keepScore(a) - keepScore(b))[0];
        if (out) {
          club.squad = club.squad.filter((id) => id !== out.id);
          out.clubId = null;
          out.contractUntil = null;
        }
      }
    }

    const fin = state.finances[club.id];
    if (fin) recalcWages(club, fin, state.players);
  }

  return total;
}

/**
 * Teto do mercado de livres. Sem isto o mercado da IA despeja ~200 jogadores por
 * época no limbo (cada reforço liberta um dispensável) e ao fim de 10 épocas o
 * save carregava ~2000 jogadores sem clube — memória, tamanho do save e listas
 * de mercado intermináveis, tudo por nada.
 */
export const MAX_FREE_AGENTS = 120;

/** O jogador está referenciado fora do plantel? (nunca apagar estes.) */
function isReferenced(state: GameState, playerId: string): boolean {
  if (state.inbox.some((it) => inboxRefersTo(it, playerId))) return true;
  const sc = state.career.scouting;
  if (sc && (sc.known.includes(playerId) || sc.prospects.includes(playerId)
    || sc.missions.some((m) => m.targetId === playerId))) return true;
  for (const tactic of Object.values(state.tactics)) {
    if (tactic.lineup.some((s) => s.playerId === playerId)) return true;
    if (tactic.bench.includes(playerId)) return true;
  }
  return false;
}

/**
 * Escalões de qualidade do mercado de livres (overall interno 0-20) e quanto do
 * teto cabe a cada um.
 *
 * Antes o corte era só "apaga os piores", e o resultado era um mercado de livres
 * com 120 jogadores todos acima de OVR 80: inútil para quem mais precisa dele,
 * porque o estatuto faz um clube da 3ª divisão ser recusado por todos. Agora
 * cada faixa tem quota, e há sempre alguém assinável em qualquer divisão.
 */
const FREE_AGENT_BANDS: { max: number; share: number }[] = [
  { max: 10, share: 0.30 }, // até OVR 50 — 3ª divisão
  { max: 12, share: 0.28 }, // até OVR 60 — 2ª divisão
  { max: 14, share: 0.24 }, // até OVR 70 — 1ª divisão modesta
  { max: 99, share: 0.18 }, // acima disso — os que fazem manchete
];

/**
 * Corta o mercado de livres ao teto, mantendo uma AMOSTRA DE TODAS AS FAIXAS de
 * qualidade em vez de só os melhores. Dentro de cada faixa sobrevivem os
 * melhores. Só apaga quem ninguém referencia (inbox, olheiros, onzes) e quem
 * não está emprestado — um id pendurado noutra estrutura dava um "jogador
 * fantasma" na UI.
 *
 * Chamar DEPOIS de refazer os onzes: enquanto as táticas ainda tiverem no banco
 * quem acabou de ser libertado, `isReferenced` protege-os e o corte não faz nada.
 */
export function pruneFreeAgents(state: GameState): number {
  const free = Object.values(state.players).filter(
    (p) => p.clubId === null && !p.condition.loanOwnerId && !isReferenced(state, p.id),
  );
  if (free.length <= MAX_FREE_AGENTS) return 0;

  // Reparte por faixa; o que sobrar de uma quota passa à faixa seguinte, para o
  // teto ser sempre aproveitado mesmo quando uma faixa está vazia.
  const keep = new Set<string>();
  let carry = 0;
  let lower = -Infinity;
  for (const band of FREE_AGENT_BANDS) {
    const inBand = free
      .filter((p) => {
        const o = naturalOverallFine(p);
        return o > lower && o <= band.max;
      })
      .sort((a, b) => naturalOverallFine(b) - naturalOverallFine(a)); // melhor primeiro
    const quota = Math.floor(MAX_FREE_AGENTS * band.share) + carry;
    for (const p of inBand.slice(0, quota)) keep.add(p.id);
    carry = Math.max(0, quota - inBand.length);
    lower = band.max;
  }

  let dropped = 0;
  for (const p of free) {
    if (keep.has(p.id)) continue;
    delete state.players[p.id];
    dropped++;
  }
  return dropped;
}
