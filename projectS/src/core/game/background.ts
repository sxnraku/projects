/**
 * LIGAS DE FUNDO — o mundo inteiro (todos os países EXCETO o ativo) simulado de
 * forma BARATA, ao estilo New Star Soccer: sem o motor pesado de 22 jogadores e
 * SEM jogadores no estado. Cada liga guarda só metadados leves + uma classificação
 * (números) + um calendário round-robin determinístico. Os resultados saem da
 * FORÇA das equipas (WORLD_TEAMS.forca). Assim há centenas de ligas "vivas" com
 * tabelas que evoluem, a custo quase nulo de CPU e de save.
 */
import { Rng, deriveSeed } from '../engine/rng';
import { WORLD_TEAMS } from '../data/world/worldTeams';

/** Linha de classificação leve (metadados vêm de WORLD_TEAMS pelo id). */
export interface BgRow { id: number; P: number; W: number; D: number; L: number; GF: number; GA: number; Pts: number }

/** Uma liga de fundo: metadados + tabela + calendário + ronda atual. */
export interface BgLeague {
  key: string; // `${slug}_${tier}`
  slug: string;
  country: string;
  name: string;
  tier: number;
  fixtures: [number, number][][]; // rondas → pares [casaId, foraId]
  table: BgRow[];
  round: number; // próxima ronda a jogar
}

export interface BackgroundWorld { leagues: BgLeague[] }

// Força por id (memo — WORLD_TEAMS é estático).
let _forca: Map<number, number> | null = null;
function forcaOf(id: number): number {
  if (!_forca) { _forca = new Map(); for (const t of WORLD_TEAMS) _forca.set(t.id, t.forca); }
  return _forca.get(id) ?? 60;
}

/** Calendário round-robin duplo (casa/fora) pelo método do círculo. */
function roundRobin(ids: number[]): [number, number][][] {
  const a = ids.slice();
  if (a.length % 2 === 1) a.push(-1); // bye
  const n = a.length, half = n / 2, rounds = n - 1;
  const fixed = a[0]!;
  let rot = a.slice(1);
  const first: [number, number][][] = [];
  for (let r = 0; r < rounds; r++) {
    const arr = [fixed, ...rot];
    const rnd: [number, number][] = [];
    for (let i = 0; i < half; i++) {
      const h = arr[i]!, aw = arr[n - 1 - i]!;
      if (h !== -1 && aw !== -1) rnd.push(r % 2 ? [aw, h] : [h, aw]); // alterna mando por ronda
    }
    first.push(rnd);
    rot = [rot[rot.length - 1]!, ...rot.slice(0, -1)];
  }
  const second = first.map((rnd) => rnd.map(([h, aw]) => [aw, h] as [number, number]));
  return [...first, ...second];
}

const emptyRow = (id: number): BgRow => ({ id, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 });

/** Constrói o mundo de fundo: todas as ligas cujo país NÃO é o ativo. */
export function buildBackgroundWorld(activeCountry: string, seed: number): BackgroundWorld {
  const byKey = new Map<string, { slug: string; country: string; name: string; tier: number; ids: number[] }>();
  for (const t of WORLD_TEAMS) {
    if (t.slug === activeCountry) continue;
    const key = `${t.slug}_${t.tier}`;
    if (!byKey.has(key)) byKey.set(key, { slug: t.slug, country: t.country, name: t.league, tier: t.tier, ids: [] });
    byKey.get(key)!.ids.push(t.id);
  }
  const leagues: BgLeague[] = [];
  for (const [key, g] of byKey) {
    const rng = new Rng(deriveSeed(seed, 'bgfix', key));
    const ids = shuffle(g.ids, rng); // ordem do calendário varia por liga/seed
    leagues.push({
      key, slug: g.slug, country: g.country, name: g.name, tier: g.tier,
      fixtures: roundRobin(ids), table: ids.map(emptyRow), round: 0,
    });
  }
  return { leagues };
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Placar barato a partir das forças (Poisson por golos esperados; vantagem de casa). */
function bgScore(fH: number, fA: number, rng: Rng): [number, number] {
  const diff = fH + 4 - fA; // +4 = vantagem de casa
  const lamH = Math.max(0.2, Math.min(4.5, 1.35 + diff * 0.03));
  const lamA = Math.max(0.2, Math.min(4.5, 1.35 - diff * 0.03));
  return [poisson(lamH, rng), poisson(lamA, rng)];
}
function poisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

function apply(table: BgRow[], byId: Map<number, BgRow>, h: number, a: number, gh: number, ga: number): void {
  const rh = byId.get(h), ra = byId.get(a);
  if (!rh || !ra) return;
  rh.P++; ra.P++; rh.GF += gh; rh.GA += ga; ra.GF += ga; ra.GA += gh;
  if (gh > ga) { rh.W++; rh.Pts += 3; ra.L++; }
  else if (gh < ga) { ra.W++; ra.Pts += 3; rh.L++; }
  else { rh.D++; ra.D++; rh.Pts++; ra.Pts++; }
}

/** Joga UMA ronda em cada liga de fundo (chamado 1×/semana). Determinístico. */
export function simulateBgWeek(bg: BackgroundWorld, rngSeed: number, season: number): void {
  for (const lg of bg.leagues) {
    if (lg.round >= lg.fixtures.length) continue;
    const rng = new Rng(deriveSeed(rngSeed, 'bg', lg.key, season, lg.round));
    const byId = new Map(lg.table.map((r) => [r.id, r]));
    for (const [h, a] of lg.fixtures[lg.round]!) apply(lg.table, byId, h, a, ...bgScore(forcaOf(h), forcaOf(a), rng));
    lg.round++;
  }
}

/** Reinicia as ligas de fundo para uma nova época (tabelas a zero, ronda 0). */
export function resetBgSeason(bg: BackgroundWorld): void {
  for (const lg of bg.leagues) { lg.table = lg.table.map((r) => emptyRow(r.id)); lg.round = 0; }
}

/** Classificação ordenada (Pts, diferença de golos, GF) — para a UI. */
export function bgTableSorted(lg: BgLeague): BgRow[] {
  return lg.table.slice().sort((a, b) => b.Pts - a.Pts || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF);
}
