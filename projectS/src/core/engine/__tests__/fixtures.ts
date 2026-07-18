/**
 * Fábricas para testes — geram plantel e tática coerentes a partir de um nível médio.
 * Não fazem parte do jogo; só alimentam os testes do motor.
 */
import {
  Formation,
  LineupSlot,
  Player,
  PlayerAttributes,
  Position,
  Tactic,
} from '../../models';

const FORMATION_4_3_3: Position[] = [
  'GK',
  'RB', 'CB', 'CB', 'LB',
  'CM', 'CM', 'CM',
  'RW', 'ST', 'LW',
];

function attrs(level: number): PlayerAttributes {
  return {
    pace: level, stamina: level, strength: level, agility: level,
    finishing: level, passing: level, dribbling: level, tackling: level, heading: level, goalkeeping: level,
    positioning: level, composure: level, teamwork: level, vision: level,
  };
}

/**
 * Cria um clube completo (11 titulares) com atributos à volta de `level`.
 * Devolve o mapa de jogadores e a tática 4-3-3 pronta a simular.
 */
export function makeTeam(
  clubId: string,
  level: number,
): { players: Record<string, Player>; tactic: Tactic } {
  const players: Record<string, Player> = {};
  const lineup: LineupSlot[] = [];

  FORMATION_4_3_3.forEach((position, i) => {
    const id = `${clubId}_p${i}`;
    players[id] = {
      id, clubId,
      firstName: 'Jog', lastName: `${i}`,
      age: 25, nationality: 'PRT', foot: 'RIGHT',
      positions: [position],
      attributes: attrs(level),
      potential: Math.min(20, level + 2),
      condition: { form: 70, morale: 75, fitness: 100, status: 'AVAILABLE', injuryDaysRemaining: 0 },
      contractUntil: 2028, wage: 5000, marketValue: 1_000_000, transferListed: false,
    };
    lineup.push({ position, playerId: id });
  });

  const tactic: Tactic = {
    clubId,
    formation: Formation.F_4_3_3,
    mentality: 'BALANCED',
    tempo: 'NORMAL',
    pressing: 5,
    defensiveLine: 5,
    creativity: 5,
    lineup,
    bench: [],
    captainId: `${clubId}_p9`,
    penaltyTakerId: `${clubId}_p9`,
  };

  return { players, tactic };
}
