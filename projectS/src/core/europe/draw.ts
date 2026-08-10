/**
 * SORTEIO da fase de liga (modelo suíço). 36 equipas, tabela única, cada uma
 * joga `rounds` jogos (8 UCL/UEL, 6 UECL) contra adversários DIFERENTES, com o
 * mando aproximadamente equilibrado (metade casa/metade fora) e a evitar, na
 * medida do possível, adversários do MESMO país.
 *
 * Base: 1-fatorização por método do círculo (garante adversários distintos entre
 * jornadas) sobre uma ordenação por POTES; depois um passo GLOBAL de reparação do
 * mesmo-país que só troca pares se o resultado não duplicar nenhum confronto do
 * torneio; por fim o mando é atribuído de forma gulosa. Determinístico (Rng).
 */
import { Rng } from '../engine/rng';
import { EuroComp, EuroEntry, EuroFixture } from './types';

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Gera os jogos da fase de liga de UMA prova (EuroFixture[], todas as jornadas). */
export function drawLeaguePhase(
  entries: EuroEntry[], comp: EuroComp, rounds: number, rng: Rng,
): EuroFixture[] {
  const countryOf = new Map(entries.map((e) => [e.clubId, e.country]));

  // Ordenação por potes (cada pote baralhado) → adversários espalhados pelos potes.
  const byPot: string[][] = [[], [], [], []];
  for (const e of entries) byPot[Math.min(3, e.pot - 1)]!.push(e.clubId);
  const order = byPot.flatMap((p) => shuffle(p, rng));

  const n = order.length; // 36 (par)
  const fixed = order[0]!;
  let rot = order.slice(1);

  // 1) Método do círculo → `rounds` rondas de pares (confrontos únicos garantidos).
  const roundsPairs: [string, string][][] = [];
  const used = new Set<string>();
  for (let r = 0; r < rounds; r++) {
    const arr = [fixed, ...rot];
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const p: [string, string] = [arr[i]!, arr[n - 1 - i]!];
      pairs.push(p);
      used.add(pairKey(...p));
    }
    roundsPairs.push(pairs);
    rot = [rot[rot.length - 1]!, ...rot.slice(0, -1)];
  }

  // 2) Reparação GLOBAL do mesmo-país: troca parceiros dentro da ronda só se
  //    nenhum dos novos pares já existir no torneio (mantém adversários distintos).
  const sameCountry = (a: string, b: string) => countryOf.get(a) === countryOf.get(b);
  for (const pairs of roundsPairs) {
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i]!;
      if (!sameCountry(a, b)) continue;
      for (let j = 0; j < pairs.length; j++) {
        if (j === i) continue;
        const [c, d] = pairs[j]!;
        if (sameCountry(a, d) || sameCountry(c, b)) continue;
        const k1 = pairKey(a, d), k2 = pairKey(c, b);
        if (used.has(k1) || used.has(k2) || k1 === k2) continue;
        used.delete(pairKey(a, b)); used.delete(pairKey(c, d));
        used.add(k1); used.add(k2);
        pairs[i] = [a, d]; pairs[j] = [c, b];
        break;
      }
    }
  }

  // 3) Mando: cada equipa ~metade casa/metade fora (guloso).
  const homeCount = new Map<string, number>();
  const fixtures: EuroFixture[] = [];
  roundsPairs.forEach((pairs, r) => {
    for (const [a, b] of pairs) {
      const home = chooseHome(a, b, homeCount, rounds);
      const away = home === a ? b : a;
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
      fixtures.push({
        id: `${comp}_L${r + 1}_${pairKey(a, b)}`, comp, matchday: r + 1,
        homeId: home, awayId: away, result: null,
      });
    }
  });
  return fixtures;
}

/** Escolhe quem joga em casa para equilibrar (menos jogos em casa até agora). */
function chooseHome(a: string, b: string, homeCount: Map<string, number>, rounds: number): string {
  const ha = homeCount.get(a) ?? 0;
  const hb = homeCount.get(b) ?? 0;
  const target = rounds / 2;
  if (ha >= target && hb < target) return b;
  if (hb >= target && ha < target) return a;
  if (ha !== hb) return ha < hb ? a : b;
  return a < b ? a : b; // determinístico no empate
}
