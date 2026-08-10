/**
 * PROVAS EUROPEIAS — modelo suíço 2024/25 (Champions/Europa/Conference League).
 *
 * Tipos puros + constantes. A lógica vive em qualify.ts (quem entra), draw.ts
 * (sorteio da fase de liga) e europe.ts (simulação, eliminatórias, prémios).
 *
 * IDENTIDADE DOS CLUBES nas estruturas europeias — usamos sempre uma STRING clubId:
 *  - clube do PAÍS ATIVO (existe em state.clubs)      → `club_<teamId>`
 *  - clube de FUNDO (não está no estado; materializado
 *    só quando o clube gerido o enfrenta)              → `eu_<teamId>`
 * `teamId` é o id numérico de WORLD_TEAMS, de onde saem nome/força/país/cor.
 */
import { MatchResult } from '../models';
import { WORLD_TEAMS, WorldTeam } from '../data/world/worldTeams';

export type EuroComp = 'UCL' | 'UEL' | 'UECL';
export const EURO_COMPS: EuroComp[] = ['UCL', 'UEL', 'UECL'];

export const LEAGUE_PHASE_TEAMS = 36;
export const POT_COUNT = 4;
/** Jornadas da fase de liga por prova (Conference joga menos). */
export const leaguePhaseRounds = (comp: EuroComp): number => (comp === 'UECL' ? 6 : 8);

/**
 * Jornadas europeias de uma campanha COMPLETA (o pior caso, UCL/UEL):
 * 8 de fase de liga + play-off (2 mãos) + 8avos + quartos + meias (2 mãos cada)
 * + final a 1 jogo = 17. É por isto que a cadência se calcula dividindo o
 * calendário doméstico por 17 — dividir por 19 (como estava) dava cadência 1 num
 * campeonato de 34 jornadas e despachava a Europa toda até à jornada 17, ficando
 * meia época sem nada.
 */
export const EURO_MATCHDAYS = 17;

/** Uma equipa inscrita numa prova. */
export interface EuroEntry {
  clubId: string; // `club_<teamId>` (ativo) ou `eu_<teamId>` (fundo)
  teamId: number; // id em WORLD_TEAMS
  country: string; // slug
  pot: number; // 1 (mais forte) .. 4
}

/** Linha da tabela ÚNICA de 36 equipas. */
export interface EuroRow {
  clubId: string;
  P: number; W: number; D: number; L: number; GF: number; GA: number; Pts: number;
}

/** Um jogo europeu (fase de liga OU uma mão de eliminatória). */
export interface EuroFixture {
  id: string;
  comp: EuroComp;
  matchday: number; // jornada da fase de liga; nas eliminatórias = nº de ordem global
  homeId: string;
  awayId: string;
  result: MatchResult | null;
  tieId?: string; // eliminatória a que pertence (se aplicável)
  leg?: 1 | 2; // mão da eliminatória
}

export type EuroStage = 'LEAGUE' | 'PLAYOFF' | 'R16' | 'QF' | 'SF' | 'FINAL' | 'DONE';

/** Uma eliminatória a duas mãos (final = uma só mão em legs[0]). */
export interface EuroTie {
  tieId: string;
  comp: EuroComp;
  stage: EuroStage;
  homeSeedId: string; // cabeça de série (joga a 2ª mão em casa)
  awaySeedId: string;
  legs: EuroFixture[]; // 1 (final) ou 2
  winnerId: string | null;
}

/** Estado de UMA prova numa época. */
export interface EuroCompetitionState {
  comp: EuroComp;
  entries: EuroEntry[]; // 36
  table: EuroRow[]; // tabela única
  fixtures: EuroFixture[]; // fase de liga
  rounds: number; // 8 ou 6
  matchday: number; // próxima jornada da fase de liga a jogar (0-based)
  stage: EuroStage;
  ties: EuroTie[]; // eliminatórias da fase corrente
  seedOrder?: string[]; // classificação final da fase de liga (1..36) — semente do KO
  bracket?: string[]; // participantes da ronda de KO corrente, em ordem de quadro
  winnerClubId: string | null;
}

/** Supertaça: campeão CL vs campeão EL da época anterior (jogo único). */
export interface EuroSuperCup {
  fixture: EuroFixture;
  winnerId: string | null;
}

/** Raiz do estado europeu (uma época). */
export interface EuropeState {
  season: number;
  managedComp: EuroComp | null; // prova do clube gerido (null se não se qualificou)
  competitions: Record<EuroComp, EuroCompetitionState>;
  superCup: EuroSuperCup | null;
  cadence: number; // jornadas de liga entre jornadas europeias
  euroRound: number; // nº de jornadas europeias já jogadas (fase de liga + eliminatórias)
  /** Coeficiente tipo-UEFA por país (só UEFA) que decidiu as vagas desta época e
   *  evolui com o desempenho europeu. Ver europe/coefficient.ts. */
  coefficients: Record<string, number>;
}

// ---------- Prémios (afináveis; escalados à economia por escalão) ----------
export interface EuroPrize {
  entry: number; win: number; draw: number;
  r16: number; qf: number; sf: number; finalist: number; champion: number;
}
export const EURO_PRIZES: Record<EuroComp, EuroPrize> = {
  UCL: { entry: 8_000_000, win: 1_500_000, draw: 500_000, r16: 4_000_000, qf: 6_000_000, sf: 9_000_000, finalist: 12_000_000, champion: 25_000_000 },
  UEL: { entry: 3_500_000, win: 700_000, draw: 250_000, r16: 1_800_000, qf: 2_800_000, sf: 4_000_000, finalist: 5_500_000, champion: 11_000_000 },
  UECL: { entry: 1_500_000, win: 300_000, draw: 120_000, r16: 800_000, qf: 1_300_000, sf: 1_900_000, finalist: 2_600_000, champion: 5_000_000 },
};
export const SUPERCUP_PRIZE = 4_000_000;

// ---------- Helpers de identidade ----------
const _worldById = new Map<number, WorldTeam>();
for (const t of WORLD_TEAMS) _worldById.set(t.id, t);

/** clubId europeu a partir do id do mundo (ativo → club_, fundo → eu_). */
export const euroClubId = (teamId: number, inState: boolean): string =>
  `${inState ? 'club_' : 'eu_'}${teamId}`;

/** Extrai o id de WORLD_TEAMS de um clubId europeu (`club_123`/`eu_123`). */
export const teamIdOf = (clubId: string): number =>
  Number(clubId.replace(/^(club_|eu_)/, ''));

/** True se o clubId é de um clube do país ativo (existe/existirá em state.clubs). */
export const isActiveClubId = (clubId: string): boolean => clubId.startsWith('club_');

/** Equipa do mundo por clubId europeu (nome/força/país/cor). */
export const worldTeamOfClub = (clubId: string): WorldTeam | undefined =>
  _worldById.get(teamIdOf(clubId));

export const emptyEuroRow = (clubId: string): EuroRow =>
  ({ clubId, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 });
