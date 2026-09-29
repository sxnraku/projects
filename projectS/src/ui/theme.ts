import { PositionGroup } from '../core/models';

/**
 * Tema visual — Premium escuro + dourado.
 *
 * Filosofia: informação primeiro, decoração depois. Fundo cinzento-escuro,
 * painéis ligeiramente mais claros, cores APENAS para indicar estado:
 *  verde = positivo/lucro · vermelho = perda/lesão/alerta · amarelo = aviso/cartão
 *  azul = seleção/navegação. Cantos discretos (6-8px), grelha de 8px, uma fonte.
 */
export const theme = {
  colors: {
    bg: '#0B1119',
    surface: '#131C28',
    surfaceAlt: '#1A2637',
    border: '#243247',
    text: '#F1F4F8',
    textDim: '#8E9BAE',

    // Dourado premium: destaque de marca, recompensas, VIP (não é cor de estado)
    gold: '#F5C542',
    goldDim: '#B8891A',
    goldSoft: 'rgba(245,197,66,0.14)',

    // Cores de ESTADO (nunca decorativas)
    green: '#3FB950', // positivo: confirmar, lucro, vitória
    red: '#F85149', // negativo: perda, lesão, derrota, alerta
    yellow: '#E3B341', // aviso: cartões, atenção
    starOff: '#4A5058', // estrela por preencher (fundo das meias estrelas)
    blue: '#4A9EFF', // seleção e navegação

    // Aliases usados pelo código existente
    primary: '#3FB950',
    primaryDim: '#2E7D3B',
    accent: '#F5C542',
    danger: '#F85149',
    info: '#4A9EFF',
    win: '#3FB950',
    draw: '#9AA3AD',
    loss: '#F85149',
    borderLight: '#34445B',
    pitch: '#2F6B3F', // campo tático — verde dessaturado, não gritante
    pitchStripe: '#357B48', // risca de relvado (banda alternada, mais clara)
    pitchLine: 'rgba(255,255,255,0.22)',
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 10, md: 12, lg: 16, pill: 999 },
  font: {
    h1: 22,
    h2: 17,
    h3: 15,
    body: 14,
    small: 12,
    score: 32,
  },
} as const;

/** Sombra suave para cartões/botões (iOS shadow* + Android elevation). */
export function elevation(level: 1 | 2 | 3 = 1) {
  const o = { 1: 0.25, 2: 0.35, 3: 0.5 }[level];
  return {
    shadowColor: '#000', shadowOpacity: o, shadowRadius: level * 6, shadowOffset: { width: 0, height: level * 2 },
    elevation: level * 3,
  } as const;
}

/** Cor do TEXTO da posição (estado informativo, sem fundos coloridos). */
export const POS_COLORS: Record<PositionGroup, string> = {
  GOALKEEPER: theme.colors.yellow,
  DEFENCE: theme.colors.blue,
  MIDFIELD: theme.colors.green,
  ATTACK: theme.colors.red,
};

/** Cor associada a um valor de atributo/overall (1..20) — estado, não decoração. */
export function attrColor(value: number): string {
  if (value >= 16) return theme.colors.green;
  if (value >= 13) return theme.colors.yellow;
  if (value >= 9) return theme.colors.textDim;
  return theme.colors.red;
}

/** Faixa da tabela classificativa: campeão/subida = verde, descida = vermelho. */
export function zoneColor(position: number, totalClubs: number): string | null {
  if (position <= 2) return theme.colors.green;
  if (position > totalClubs - 2) return theme.colors.red;
  return null;
}

/** Cor de condição física (0..100). */
export function fitnessColor(v: number): string {
  if (v >= 75) return theme.colors.green;
  if (v >= 45) return theme.colors.yellow;
  return theme.colors.red;
}

/**
 * Reputação → 0.5..5 estrelas (meias incluídas).
 *
 * A escala NÃO é `rep/100*5`: nenhum clube do mundo chega perto de 100 de
 * reputação (o topo mundial anda nos 82), por isso as 5 estrelas eram
 * inalcançáveis e um campeão nacional ficava-se pelas 4. A banda real do jogo
 * vai de ~25 (fundo da 3ª divisão) a ~82 (elite europeia) e é essa que se
 * estica para 1..5 estrelas.
 */
export const REP_STARS_FLOOR = 25;
export const REP_STARS_CEIL = 82;
export function reputationStars(rep: number): number {
  const raw = 1 + ((rep - REP_STARS_FLOOR) * 4) / (REP_STARS_CEIL - REP_STARS_FLOOR);
  return Math.min(5, Math.max(0.5, Math.round(raw * 2) / 2));
}
