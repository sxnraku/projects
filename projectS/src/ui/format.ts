/** Helpers de formatação partilhados pela UI. TS puro e testável. */

/**
 * Converte um valor da escala INTERNA do motor (0–20) para a escala de DISPLAY
 * 0–100, mais intuitiva (estilo FIFA/FM). O motor mantém 0–20 por dentro — isto
 * é só para mostrar ao jogador. Ex.: overall 12 → 60, overall 17 → 85.
 */
export function to100(v: number): number {
  return Math.round(Math.max(0, Math.min(20, v)) * 5);
}

/** Formata dinheiro em estilo compacto: 1 350 000 → "1,35M €". */
export function money(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace('.', ',')}M €`;
  if (abs >= 1_000) return `${Math.round(v / 1000)}k €`;
  return `${v} €`;
}

/** Salário semanal → "5,0k €/sem". */
export function wage(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k €/sem`;
  return `${v} €/sem`;
}

/** Data ISO "2026-08-01" → "01 Ago 2026". */
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** Resultado "2-1" a partir dos golos. */
export function scoreline(home: number, away: number): string {
  return `${home}-${away}`;
}
