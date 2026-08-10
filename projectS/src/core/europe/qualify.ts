/**
 * QUALIFICAÇÃO (abstraída) — quem entra em cada prova na próxima época.
 *
 * Fontes: classificação FINAL do tier-1 do país ativo (state.standings) +
 * vencedor da Taça (recompensa Europa League) + tabelas de fundo (bgTableSorted)
 * de todos os outros países. As vagas por país saem do ranking de força
 * (countriesByStrength) — poucos países fortes com 4 vagas na Champions, os
 * restantes 1–2 — somando EXATAMENTE 36 por prova. Determinístico.
 *
 * SEM pré-eliminatórias, coeficientes de 5 épocas nem "descidas" entre provas
 * (decisão de âmbito): um clube só nunca vê esse encanamento.
 */
import { GameState } from '../models';
import { sortStandings } from '../season';
import { bgTableSorted } from '../game/background';
import { activeCountrySlug } from '../game/activeCountry';
import { WORLD_TEAMS } from '../data/world/worldTeams';
import { baseRanking, isUefaSlug } from './coefficient';
import {
  EuroComp, EuroEntry, EURO_COMPS, LEAGUE_PHASE_TEAMS, POT_COUNT, euroClubId, teamIdOf,
} from './types';

const forcaOf = (() => {
  const m = new Map<number, number>();
  for (const t of WORLD_TEAMS) m.set(t.id, t.forca);
  return (teamId: number) => m.get(teamId) ?? 60;
})();

interface Slots { UCL: number; UEL: number; UECL: number; }

/**
 * Vagas por país segundo a posição no ranking de coeficiente (0 = mais forte).
 *
 * A Conference League é a casa dos países PEQUENOS: a banda foi movida de
 * 6..41 para 16..51, porque os países do meio já têm vagas na Champions e na
 * Europa League e os pequenos ficavam de fora de tudo. Assim o campeão de
 * Andorra vai à Conference — e um 4º classificado de Andorra continua, como
 * deve ser, sem Europa nenhuma.
 */
function slotsForRank(rank: number): Slots {
  const UCL = rank <= 3 ? 4 : rank <= 5 ? 3 : rank <= 10 ? 2 : rank <= 14 ? 1 : 0;
  const UEL = rank <= 10 ? 2 : rank <= 24 ? 1 : 0;
  const UECL = rank >= 16 && rank <= 51 ? 1 : 0;
  return { UCL, UEL, UECL };
} // somas: UCL 36, UEL 36, UECL 36

/** Lista ORDENADA (melhor→pior) dos clubes do tier-1 de um país, como candidatos. */
function tier1Ranked(state: GameState, slug: string): { clubId: string; teamId: number }[] {
  const activeSlug = activeCountrySlug(state);
  if (slug === activeSlug) {
    const league = Object.values(state.leagues).find((l) => l.country === slug && l.tier === 1);
    if (league && state.standings[league.id]) {
      return sortStandings(state.standings[league.id]!, (id) => state.clubs[id]?.name ?? id)
        .map((r) => ({ clubId: r.clubId, teamId: teamIdOf(r.clubId) }));
    }
    return [];
  }
  const lg = state.background?.leagues.find((l) => l.slug === slug && l.tier === 1);
  if (!lg) return [];
  return bgTableSorted(lg).map((r) => ({ clubId: euroClubId(r.id, false), teamId: r.id }));
}

/** Divide os 36 de uma prova em 4 potes de 9 por força (pot 1 = mais forte). */
function assignPots(entries: EuroEntry[]): EuroEntry[] {
  const sorted = [...entries].sort((a, b) => forcaOf(b.teamId) - forcaOf(a.teamId) || a.teamId - b.teamId);
  const per = Math.ceil(sorted.length / POT_COUNT);
  sorted.forEach((e, i) => { e.pot = Math.min(POT_COUNT, Math.floor(i / per) + 1); });
  return sorted;
}

export interface QualifyResult {
  byComp: Record<EuroComp, EuroEntry[]>; // 36 cada, com potes atribuídos
  managedComp: EuroComp | null;
}

/**
 * Constrói os inscritos das 3 provas para a época QUE VAI COMEÇAR, a partir do
 * estado no fim da época atual (standings finais + Taça + tabelas de fundo).
 *
 * `ranking` = países UEFA ordenados por coeficiente (0 = mais forte). Omitido usa
 * o ranking BASE (1ª campanha). Argentina/Brasil nunca entram (não são UEFA).
 */
export function qualifyNextSeason(state: GameState, ranking?: string[]): QualifyResult {
  const order = (ranking ?? baseRanking()).filter(isUefaSlug);
  const byComp: Record<EuroComp, EuroEntry[]> = { UCL: [], UEL: [], UECL: [] };
  const activeSlug = activeCountrySlug(state); // 'PRT' de saves antigos → 'portugal'

  order.forEach((slug, rank) => {
    const slots = slotsForRank(rank);
    const ranked = tier1Ranked(state, slug);
    let cursor = 0;
    const take = (comp: EuroComp, n: number) => {
      for (let i = 0; i < n && cursor < ranked.length; i++, cursor++) {
        const r = ranked[cursor]!;
        byComp[comp].push({ clubId: r.clubId, teamId: r.teamId, country: slug, pot: 0 });
      }
    };
    take('UCL', slots.UCL);
    take('UEL', slots.UEL);
    take('UECL', slots.UECL);
  });

  // Recompensa da Taça (país ativo): o vencedor entra na Europa League se ainda
  // não estiver em prova nenhuma — substitui a entrada mais fraca do país ativo na
  // UEL (ou a mais fraca global) para manter 36.
  const cupWinner = state.cup.winnerClubId;
  if (cupWinner && state.clubs[cupWinner] && isUefaSlug(activeSlug)) {
    const already = EURO_COMPS.some((c) => byComp[c].some((e) => e.clubId === cupWinner));
    if (!already) {
      // A prova depende do ESTATUTO do país: o vencedor da taça de um país
      // pequeno vai à Conference, não à Europa League. E a vaga sai sempre de
      // uma entrada do PRÓPRIO país (ou, em último caso, da mais fraca dessa
      // prova) — antes um campeão da taça de Andorra roubava o lugar a um clube
      // de uma liga grande na Europa League.
      const activeRank = order.indexOf(activeSlug);
      const comp: EuroComp = activeRank >= 0 && activeRank <= 24 ? 'UEL' : 'UECL';
      const pool = byComp[comp];
      let idx = lastIndexWhere(pool, (e) => e.country === activeSlug);
      if (idx < 0) idx = weakestIndex(pool);
      if (idx >= 0) {
        pool[idx] = { clubId: cupWinner, teamId: teamIdOf(cupWinner), country: activeSlug, pot: 0 };
      }
    }
  }

  for (const c of EURO_COMPS) byComp[c] = assignPots(byComp[c]).slice(0, LEAGUE_PHASE_TEAMS);

  const managedId = state.meta.managedClubId;
  let managedComp: EuroComp | null = null;
  for (const c of EURO_COMPS) {
    if (byComp[c].some((e) => e.clubId === managedId)) { managedComp = c; break; }
  }

  return { byComp, managedComp };
}

const lastIndexWhere = <T,>(arr: T[], pred: (t: T) => boolean): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return i;
  return -1;
};
const weakestIndex = (entries: EuroEntry[]): number => {
  let idx = -1, min = Infinity;
  entries.forEach((e, i) => { const f = forcaOf(e.teamId); if (f < min) { min = f; idx = i; } });
  return idx;
};
