/**
 * Gerador de números pseudo-aleatórios determinístico (mulberry32).
 *
 * Porquê próprio em vez de Math.random(): a simulação tem de ser REPRODUZÍVEL.
 * Mesma seed → mesma sequência → mesmo resultado de partida. Essencial para
 * testar, reproduzir bugs e (futuro) sincronizar multiplayer.
 *
 * mulberry32: rápido, estado de 32 bits, distribuição boa para jogos. Não é
 * criptográfico — não precisa de ser.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Garante estado inteiro de 32 bits não-zero.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Float em [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max] inclusivo. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True com probabilidade p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Escolhe um elemento do array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /**
   * Escolha ponderada: retorna o índice segundo os pesos.
   * Pesos não precisam de somar 1.
   */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}

/**
 * Deriva uma seed estável a partir da seed do jogo + identificadores da partida.
 * Assim cada partida da época tem a sua seed própria, mas tudo continua
 * determinado pela seed-mãe guardada no GameState.
 */
export function deriveSeed(base: number, ...parts: (string | number)[]): number {
  let h = base >>> 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}
