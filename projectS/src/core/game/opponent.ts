/**
 * O ADVERSÁRIO — sair às cegas deixou de ser obrigatório.
 *
 * A rede de olheiros cobria jogadores e ligas, nunca a equipa que se ia
 * defrontar no sábado. O resultado era que a tática se escolhia no vazio: a
 * mesma pressão e a mesma linha contra qualquer um, porque não havia informação
 * nenhuma sobre a qual decidir.
 *
 * Duas peças aqui:
 *
 *  1. **RELATÓRIO** — o que se sabe do próximo adversário, com o detalhe a
 *     depender da REDE DE OLHEIROS. Nível 1 dá bandas grosseiras ("meio-campo
 *     forte"); nível 5 dá números e nomes. É a primeira vez que a instalação de
 *     olheiros paga alguma coisa fora do mercado.
 *
 *  2. **PLANO** — duas instruções que se ligam contra ele, e cada uma custa
 *     algo. Marcar o melhor deles apaga-o do jogo, mas tira um homem ao nosso
 *     meio-campo. Fechar as alas mata-lhes os cantos e os cruzamentos, mas
 *     encolhe o nosso próprio ataque. Sem o custo seriam dois botões de "ganhar
 *     mais", que não é uma decisão.
 *
 * Módulo puro. O plano viaja para o motor pelo `MatchContext` e vive no blob da
 * carreira — não precisa de tabela nova nem de migração.
 */
import {
  effectiveOverallFine, GameState, naturalOverall, type OppositionPlan, Player,
  sectorRatings, Tactic,
} from '../models';
import { computeTeamStrength } from '../engine/teamStrength';
import { scoutingLevel } from './scouting';
import { recentFormOf } from './advance';


/** Plano do clube gerido (vazio se nunca foi definido). */
export function gamePlan(state: GameState): OppositionPlan {
  return state.career.gamePlan ?? {};
}

/** Liga/desliga uma instrução. Muta o estado. */
export function setGamePlan(state: GameState, patch: Partial<OppositionPlan>): OppositionPlan {
  state.career.gamePlan = { ...gamePlan(state), ...patch };
  return state.career.gamePlan;
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

/** Aquilo em que o adversário é perigoso. */
export const Threat = {
  AERIAL: 'AERIAL',
  ATTACK: 'ATTACK',
  MIDFIELD: 'MIDFIELD',
  DEFENCE: 'DEFENCE',
  BALANCED: 'BALANCED',
} as const;
export type Threat = (typeof Threat)[keyof typeof Threat];

/** Banda qualitativa de uma força, para quando os olheiros não dão números. */
export const Band = {
  WEAK: 'WEAK',
  AVERAGE: 'AVERAGE',
  STRONG: 'STRONG',
} as const;
export type Band = (typeof Band)[keyof typeof Band];

export interface ReportLine {
  /** Banda, sempre disponível. */
  band: Band;
  /** Valor 0-100 — só com olheiros suficientes; null = "não se sabe ao certo". */
  value: number | null;
}

export interface OpponentReport {
  clubId: string;
  clubName: string;
  formation: Tactic['formation'];
  attack: ReportLine;
  midfield: ReportLine;
  defence: ReportLine;
  /** Forma recente do adversário, mais recente primeiro. */
  form: ('W' | 'D' | 'L')[];
  /** Onde ele faz mais estragos. */
  threat: Threat;
  /** O melhor deles — só identificado com rede de olheiros decente. */
  keyPlayer: { id: string; name: string; position: string; overall: number } | null;
  /** Perigo em bolas paradas (0-100), a partir do jogo aéreo do onze deles. */
  setPiece: ReportLine;
  /** Nível da rede de olheiros que produziu isto (1-5). */
  scoutLevel: number;
  /** A partir de que nível se veem números em vez de bandas. */
  detailed: boolean;
}

/**
 * Diferença (em pontos de 0-100) a partir da qual se considera que um setor é
 * mais forte ou mais fraco do que o nosso.
 *
 * A banda é RELATIVA À NOSSA EQUIPA, e não absoluta, por medição: os setores de
 * todo o mundo caem entre 60 e 89, com metade acima de 70. Com cortes absolutos
 * em 45/65, 82% dos setores liam "forte" e NENHUM lia "fraco" — o relatório
 * dizia sempre a mesma coisa, que é o mesmo que não dizer nada. Contra a nossa
 * própria força a leitura é imediata: "o ataque deles é melhor que o nosso".
 */
export const BAND_GAP = 4;

/** Banda de um setor deles COMPARADO com o mesmo setor nosso. */
function bandOf(theirs: number, ours: number): Band {
  const diff = theirs - ours;
  if (diff <= -BAND_GAP) return 'WEAK';
  if (diff >= BAND_GAP) return 'STRONG';
  return 'AVERAGE';
}

function line(theirs: number, ours: number, detailed: boolean): ReportLine {
  return { band: bandOf(theirs, ours), value: detailed ? Math.round(theirs) : null };
}

/**
 * Nível de olheiros a partir do qual o relatório mostra números e nomeia o
 * melhor deles. Abaixo disto fica-se pelas bandas — que já é infinitamente
 * melhor do que o nada que havia antes.
 */
export const DETAIL_SCOUT_LEVEL = 3;

/**
 * Relatório do próximo adversário. Devolve null se o clube não existir ou não
 * tiver tática (nunca deve acontecer em jogo, mas não vale a pena rebentar).
 */
export function opponentReport(state: GameState, oppClubId: string): OpponentReport | null {
  const club = state.clubs[oppClubId];
  const tactic = state.tactics[oppClubId];
  if (!club || !tactic) return null;

  const level = scoutingLevel(state);
  const detailed = level >= DETAIL_SCOUT_LEVEL;
  const s = computeTeamStrength(tactic, state.players);

  // Os números do relatório usam a MESMA régua do campo (média do overall
  // efetivo por zona) — senão dizia "meio 77" de um onze cujo melhor médio tem
  // 68, e nada batia certo com o resto do jogo.
  const sector = (v: number) => Math.max(0, Math.min(100, Math.round(v * 5)));
  const theirs = sectorRatings(tactic, state.players);
  const attack = theirs.att;
  const midfield = theirs.mid;
  const defence = theirs.def;

  // Referência: a NOSSA equipa. É contra ela que as bandas se leem.
  const ourTactic = state.tactics[state.meta.managedClubId];
  const ours = ourTactic ? sectorRatings(ourTactic, state.players) : theirs;
  const ourAerial = ourTactic
    ? sector(computeTeamStrength(ourTactic, state.players).setPiece.aerialDefence)
    : sector(s.setPiece.aerialDefence);

  let threat: Threat = 'BALANCED';
  const max = Math.max(attack, midfield, defence);
  const spread = max - Math.min(attack, midfield, defence);
  if (spread >= 6) {
    threat = max === attack ? 'ATTACK' : max === midfield ? 'MIDFIELD' : 'DEFENCE';
  }
  // O perigo aéreo passa à frente quando é mesmo desproporcionado.
  const aerial = Math.max(0, Math.min(100, Math.round(s.setPiece.aerialAttack * 5)));
  if (aerial >= attack + 8) threat = 'AERIAL';

  let keyPlayer: OpponentReport['keyPlayer'] = null;
  if (detailed) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const slot of tactic.lineup) {
      const p = state.players[slot.playerId];
      if (!p) continue;
      const score = effectiveOverallFine(p, slot.position);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) {
      const slot = tactic.lineup.find((x) => x.playerId === best!.id);
      keyPlayer = {
        id: best.id,
        name: `${best.firstName} ${best.lastName}`,
        position: slot?.position ?? best.positions[0] ?? '',
        overall: Math.round(naturalOverall(best) * 5),
      };
    }
  }

  return {
    clubId: oppClubId,
    clubName: club.name,
    formation: tactic.formation,
    // Cada setor deles compara-se com o NOSSO homólogo — mas o ataque deles
    // mede-se contra a nossa DEFESA e vice-versa, que é quem o vai enfrentar.
    attack: line(attack, ours.def, detailed),
    midfield: line(midfield, ours.mid, detailed),
    defence: line(defence, ours.att, detailed),
    form: recentFormOf(state, oppClubId, 5),
    threat,
    keyPlayer,
    setPiece: line(aerial, ourAerial, detailed),
    scoutLevel: level,
    detailed,
  };
}

/** Sugestão automática: o que faria sentido ligar contra este adversário. */
export function suggestPlan(report: OpponentReport): OppositionPlan {
  return {
    markStar: report.threat === 'ATTACK' || report.threat === 'MIDFIELD',
    blockWings: report.threat === 'AERIAL',
  };
}
