import { GameState, naturalOverall, Player, Tactic } from '../models';

/**
 * SISTEMA DE LIDERANÇA & CAPITÃES
 *
 * O Capitão e o Sub-Capitão não são apenas cosméticos: são a âncora emocional
 * da equipa dentro e fora de campo.
 *
 * Um capitão com alta liderança:
 *  - Amortece quedas de moral do plantel após derrotas difíceis.
 *  - Fornece resiliência e compostura em campo quando a equipa está a perder ou sob pressão em dérbis.
 *  - Ajuda a conter revoltas no balneário e a acalmar jogadores que vêm ao gabinete pedir minutos.
 */

/**
 * Calcula a Liderança (1..100) de um jogador.
 * Baseia-se na idade, experiência/estatuto (overall), anos de casa, atributos e maturidade.
 */
export function leadershipOf(player: Player): number {
  if (!player) return 50;
  // 1. Idade / Maturidade (0..40 pts)
  let ageScore = 5;
  if (player.age >= 33) ageScore = 40;
  else if (player.age >= 29) ageScore = 34;
  else if (player.age >= 26) ageScore = 26;
  else if (player.age >= 23) ageScore = 18;
  else if (player.age >= 21) ageScore = 10;

  // 2. Estatuto / Qualidade Natural (0..25 pts)
  const ovr = naturalOverall(player);
  const ovrScore = Math.min(25, Math.round(ovr * 0.25));

  // 3. Espírito de Luta & Compostura (0..15 pts) - escala 1..20
  const composure = player.attributes?.composure ?? 10;
  const teamwork = player.attributes?.teamwork ?? 10;
  const stamina = player.attributes?.stamina ?? 10;
  const mentalScore = Math.min(15, Math.round(((composure + teamwork + stamina) / 60) * 15));

  // 4. Anos de Casa / Lealdade ao Clube (0..20 pts)
  const clubSeasons = player.condition?.history?.filter((h) => h.clubId === player.clubId).length ?? 0;
  const loyaltyScore = Math.min(20, clubSeasons * 4);

  const raw = ageScore + ovrScore + mentalScore + loyaltyScore;
  return Math.max(1, Math.min(100, raw));
}

/**
 * Determina os 2 melhores líderes naturais de um plantel.
 */
export function pickDefaultCaptains(squad: Player[]): [Player | null, Player | null] {
  if (squad.length === 0) return [null, null];
  const sorted = [...squad].sort((a, b) => leadershipOf(b) - leadershipOf(a));
  return [sorted[0] ?? null, sorted[1] ?? null];
}

/**
 * Determina quem é o capitão em campo para o onze titular.
 * Prioridade: Capitão designado -> Sub-Capitão designado -> Jogador titular com mais liderança.
 */
export function onPitchCaptain(
  tactic: Tactic,
  players: Record<string, Player>,
): { player: Player | null; isVice: boolean; leadership: number } {
  const starters = tactic.lineup.map((s) => players[s.playerId]).filter(Boolean) as Player[];
  if (starters.length === 0) return { player: null, isVice: false, leadership: 50 };

  // 1. Capitão titular no onze
  if (tactic.captainId) {
    const cap = starters.find((p) => p.id === tactic.captainId);
    if (cap) return { player: cap, isVice: false, leadership: leadershipOf(cap) };
  }

  // 2. Sub-Capitão no onze
  if (tactic.viceCaptainId) {
    const vc = starters.find((p) => p.id === tactic.viceCaptainId);
    if (vc) return { player: vc, isVice: true, leadership: leadershipOf(vc) };
  }

  // 3. Titular mais experiente/líder
  const naturalLeader = [...starters].sort((a, b) => leadershipOf(b) - leadershipOf(a))[0]!;
  return { player: naturalLeader, isVice: false, leadership: leadershipOf(naturalLeader) };
}

/**
 * Define o Capitão e Sub-Capitão do clube.
 * Se retirar a braçadeira a um líder histórico experiente sem motivo, pode haver impacto na confiança.
 */
export function setClubCaptains(
  state: GameState,
  clubId: string,
  captainId: string | null,
  viceCaptainId: string | null,
): { ok: boolean; leaderReplacedWarning?: boolean } {
  const tactic = state.tactics[clubId];
  if (!tactic) return { ok: false };

  const oldCapId = tactic.captainId;
  let leaderReplacedWarning = false;

  if (oldCapId && captainId && oldCapId !== captainId) {
    const oldCap = state.players[oldCapId];
    if (oldCap && oldCap.clubId === clubId) {
      const leaderScore = leadershipOf(oldCap);
      if (leaderScore >= 70) {
        // Líder influente perde a braçadeira: sente desrespeito
        oldCap.condition.morale = Math.max(10, oldCap.condition.morale - 8);
        if (oldCap.condition.relation) {
          oldCap.condition.relation.trust = Math.max(-100, oldCap.condition.relation.trust - 15);
        }
        leaderReplacedWarning = true;
      }
    }
  }

  tactic.captainId = captainId;
  tactic.viceCaptainId = viceCaptainId;
  return { ok: true, leaderReplacedWarning };
}
