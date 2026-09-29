import { PositionGroup } from '../core/models';

/**
 * Tema visual — Football Manager clássico.
 *
 * Filosofia: informação primeiro, decoração depois. Fundo cinzento-escuro,
 * painéis ligeiramente mais claros, cores APENAS para indicar estado:
 *  verde = positivo/lucro · vermelho = perda/lesão/alerta · amarelo = aviso/cartão
 *  azul = seleção/navegação. Cantos discretos (6-8px), grelha de 8px, uma fonte.
 */
export const theme = {
  colors: {
    bg: '#080B10',
    surface: '#0E131E',
    surfaceAlt: '#141C2A',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#F1F5F9',
    textDim: '#94A3B8',

    // Cores de ESTADO e Destaque
    green: '#00F59B', // positivo: confirmar, lucro, vitória (esmeralda néon)
    red: '#FF3366', // negativo: perda, lesão, derrota, alerta (carmesim vívido)
    yellow: '#FFB800', // aviso: cartões, atenção, capitão (ouro champanhe)
    starOff: '#2D3748', // estrela por preencher
    blue: '#00D2FF', // seleção e navegação (ciano elétrico)

    // Aliases usados pelo código existente
    primary: '#00F59B',
    primaryDim: '#059669',
    accent: '#FFB800',
    danger: '#FF3366',
    info: '#00D2FF',
    win: '#00F59B',
    draw: '#94A3B8',
    loss: '#FF3366',
    borderLight: 'rgba(255, 255, 255, 0.14)',
    pitch: '#133824', // campo tático com relvado moderno
    pitchStripe: '#18442C', // risca alternada
    pitchLine: 'rgba(255, 255, 255, 0.28)',
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 8, md: 14, lg: 20, pill: 9999 },
  font: {
    h1: 22,
    h2: 17,
    h3: 15,
    body: 14,
    small: 12,
    score: 32,
  },
} as const;

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
