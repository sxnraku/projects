/**
 * Gerador dos efeitos sonoros do jogo (assets/sounds/*.wav).
 *
 * Os sons são SINTETIZADOS aqui, não descarregados: ficam livres de licenças,
 * são reproduzíveis bit a bit (RNG por seed) e pesam poucos KB. Correr com
 * `node scripts/gen-sounds.js` sempre que se mexer nas receitas.
 *
 * 16 kHz mono 16-bit — chega e sobra para apitos e multidão, e mantém o APK leve.
 */
const fs = require('fs');
const path = require('path');

const SR = 16000;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

// ---------------------------------------------------------------- utilitários

/** RNG determinística (mulberry32) — o mesmo ficheiro em qualquer máquina. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const secs = (s) => Math.round(s * SR);

/** Biquad passa-banda (RBJ cookbook) aplicado em série sobre um buffer. */
function bandpass(buf, f0, q) {
  const w0 = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b1 = 0, b2 = -alpha / a0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const out = new Float64Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

/**
 * Passa-baixo de um pólo. Tira o brilho agressivo das altas frequências — é o
 * que separa um apito "de plástico" a rasgar o ouvido de um som abafado, como
 * se viesse do relvado. Todos os sons passam por aqui antes de sair.
 */
function lowpass(buf, cutoff) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  const out = new Float64Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    out[i] = y;
  }
  return out;
}

function mix(dst, src, gain, offset = 0) {
  for (let i = 0; i < src.length; i++) {
    const j = i + offset;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
}

/** Normaliza para o pico pedido e converte para PCM 16-bit com fade nas pontas. */
function toPcm(buf, peak = 0.85) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  const g = max > 0 ? peak / max : 0;
  const fade = Math.min(secs(0.006), Math.floor(buf.length / 2));
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * g;
    if (i < fade) v *= i / fade;
    const tail = buf.length - 1 - i;
    if (tail < fade) v *= tail / fade;
    const s = Math.max(-1, Math.min(1, v));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return pcm;
}

function writeWav(name, buf, peak) {
  const pcm = toPcm(buf, peak);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
  console.log(`  ${name.padEnd(16)} ${(pcm.length / 1024).toFixed(0)} KB  ${(buf.length / SR).toFixed(2)}s`);
}

// ------------------------------------------------------------------- receitas

/**
 * Apito de árbitro.
 *
 * A primeira versão soava a PÁSSARO — e soava porque era quase só um seno puro
 * com um vibrato lento, que é literalmente a receita de um canto de ave. Um
 * apito de bola real é sobretudo RUÍDO estreitamente ressonante (o ar a passar
 * pela fenda), com a bolinha lá dentro a modular depressa. Por isso agora:
 *
 *  - a base é ruído passado por um filtro MUITO estreito (Q alto) — dá o
 *    "chiado" áspero em vez de um assobio limpo;
 *  - o tom puro entra só como reforço, em minoria;
 *  - o trilo é rápido (~45 Hz) e pouco profundo, que é o que soa a mecânico e
 *    não a melódico.
 */
function whistle(duration, seed) {
  const n = secs(duration);
  const r = rng(seed);
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
  // Duas ressonâncias estreitas em série = ruído "afinado", o corpo do apito.
  const shriek = bandpass(bandpass(noise, 2750, 9), 2750, 9);

  const out = new Float64Array(n);
  const atk = secs(0.012), rel = secs(0.09);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const trill = Math.sin(2 * Math.PI * 45 * t); // a bolinha a rodar, depressa
    phase += (2 * Math.PI * (2750 + 55 * trill)) / SR;
    let env = 1;
    if (i < atk) env = i / atk;
    const tail = n - 1 - i;
    if (tail < rel) env *= Math.pow(tail / rel, 1.2);
    // Ruído em maioria: é isto que separa "apito" de "pardal".
    out[i] = env * (shriek[i] * 7 + Math.sin(phase) * 0.32);
  }
  return lowpass(out, 4200);
}

/** Ruído de multidão: banda larga passada por duas ressonâncias vocais. */
function crowd(duration, seed, lowHz, highHz) {
  const n = secs(duration);
  const r = rng(seed);
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
  const a = bandpass(noise, lowHz, 0.7);
  const b = bandpass(noise, highHz, 0.9);
  const out = new Float64Array(n);
  // Modulação lenta e irregular = vozes soltas dentro do bloco.
  const m = rng(seed ^ 0x9e3779b9);
  let wob = 0;
  for (let i = 0; i < n; i++) {
    if (i % 160 === 0) wob = wob * 0.7 + (m() * 2 - 1) * 0.3;
    out[i] = (a[i] * 0.75 + b[i] * 0.55) * (1 + wob * 0.45);
  }
  return out;
}

/** Envelope ADSR simples aplicado no sítio. */
function envelope(buf, attack, hold, release, curve = 1) {
  const n = buf.length;
  const A = secs(attack), H = secs(hold), R = secs(release);
  for (let i = 0; i < n; i++) {
    let e;
    if (i < A) e = Math.pow(i / A, curve);
    else if (i < A + H) e = 1;
    else {
      const k = (i - A - H) / Math.max(1, R);
      e = Math.max(0, Math.pow(1 - k, 1.7));
    }
    buf[i] *= e;
  }
  return buf;
}

/** Sino/campainha para a fanfarra do troféu. */
function bell(freq, duration, seed) {
  const n = secs(duration);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const decay = Math.exp(-3.2 * t);
    out[i] = decay * (
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.12 +
      Math.sin(2 * Math.PI * freq * 4.2 * t) * 0.06
    );
  }
  return out;
}

// -------------------------------------------------------------------- sons

const SOUNDS = {
  /** Apito de início de jogo — um toque curto e abafado. */
  'whistle.wav': () => whistle(0.3, 12345),

  /**
   * Apito final — dois toques, não três. Três apitos seguidos, jornada após
   * jornada, cansam; dois leem-se na mesma como "acabou".
   */
  'whistle_end.wav': () => {
    const out = new Float64Array(secs(0.95));
    mix(out, whistle(0.15, 111), 0.85, secs(0.0));
    mix(out, whistle(0.42, 333), 1.0, secs(0.26));
    return out;
  },

  /** Apito curto de falta grave / vermelho. */
  'foul.wav': () => whistle(0.18, 4242),

  /**
   * GOLO nosso — a bancada a levantar-se. Sem picos: ataque suave e queda
   * longa, para ser uma onda e não um estouro.
   */
  'goal.wav': () => {
    const n = secs(2.1);
    const out = new Float64Array(n);
    const roar = crowd(2.1, 777, 560, 1400);
    envelope(roar, 0.2, 0.45, 1.45, 0.6);
    mix(out, roar, 1.0);
    const rumble = crowd(2.1, 778, 130, 250); // graves do estádio
    envelope(rumble, 0.26, 0.45, 1.35, 0.7);
    mix(out, rumble, 0.55);
    return lowpass(out, 2600);
  },

  /** Golo SOFRIDO — o "ohhh" desiludido, mais grave e mais lento. */
  'goal_against.wav': () => {
    const n = secs(1.5);
    const out = new Float64Array(n);
    const oh = crowd(1.5, 909, 280, 640);
    envelope(oh, 0.26, 0.2, 1.05, 0.9);
    mix(out, oh, 1.0);
    return lowpass(out, 1600);
  },

  /** Ambiente curto ao arrancar a partida (bancada a encher). */
  'crowd.wav': () => {
    const c = crowd(2.0, 5150, 380, 1000);
    return lowpass(envelope(c, 0.6, 0.5, 0.9, 1), 2000);
  },

  /**
   * Toque de interface — um "tique" surdo de madeira, não um bip.
   * Este é o som que se ouve centenas de vezes por sessão: se tiver brilho ou
   * ruído a mais, é o primeiro que faz o utilizador desligar tudo.
   */
  'click.wav': () => {
    const n = secs(0.035);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const decay = Math.exp(-95 * t);
      out[i] = decay * (Math.sin(2 * Math.PI * 620 * t) * 0.8 + Math.sin(2 * Math.PI * 930 * t) * 0.2);
    }
    return lowpass(out, 1400);
  },

  /**
   * PASSE / toque na bola — o "tuc" seco de um pé a bater no couro.
   * Muito curto: durante um lance ouvem-se vários seguidos e qualquer cauda
   * transformava-os em bateria.
   */
  'pass.wav': () => {
    const n = secs(0.06);
    const out = new Float64Array(n);
    const r = rng(3131);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      // Batida: corpo grave que cai a pique + estalo de impacto.
      const body = Math.sin(2 * Math.PI * 165 * t) * Math.exp(-38 * t);
      const snap = (r() * 2 - 1) * Math.exp(-160 * t);
      out[i] = body * 0.8 + snap * 0.45;
    }
    return lowpass(out, 1800);
  },

  /**
   * REMATE — como o passe mas mais forte e mais grave (bate com tudo).
   */
  'shot.wav': () => {
    const n = secs(0.1);
    const out = new Float64Array(n);
    const r = rng(4141);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const body = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-26 * t);
      const snap = (r() * 2 - 1) * Math.exp(-110 * t);
      out[i] = body * 0.9 + snap * 0.55;
    }
    return lowpass(out, 2200);
  },

  /**
   * BOLA NA REDE — o "shhh" das malhas a abanar. Ruído agudo com queda rápida,
   * sem nenhum tom: é fricção, não é uma nota.
   */
  'net.wav': () => {
    const n = secs(0.35);
    const r = rng(5252);
    const noise = new Float64Array(n);
    for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
    const swish = bandpass(noise, 2400, 0.8);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[i] = swish[i] * Math.exp(-11 * t);
    }
    return lowpass(out, 4500);
  },

  /**
   * AMBIENTE DE ESTÁDIO — murmúrio de fundo para tocar em ciclo durante o jogo.
   * Sem picos nem eventos: é a cama sonora que faz o jogo parecer um jogo. As
   * pontas entram e saem suaves para o ciclo não dar "clique".
   */
  'ambience.wav': () => {
    const c = crowd(4.0, 6161, 300, 900);
    const n = c.length;
    const ramp = secs(0.35);
    for (let i = 0; i < n; i++) {
      const inF = Math.min(1, i / ramp);
      const outF = Math.min(1, (n - 1 - i) / ramp);
      c[i] *= Math.min(inF, outF);
    }
    return lowpass(c, 1300);
  },

  /** Troféu / conquista — arpejo em sinos suaves por cima da multidão. */
  'trophy.wav': () => {
    const n = secs(2.6);
    const out = new Float64Array(n);
    const notes = [523.25, 659.25, 783.99, 1046.5]; // dó maior a subir
    notes.forEach((f, i) => mix(out, bell(f, 2.2, 900 + i), 0.55, secs(0.15 * i)));
    const c = crowd(2.6, 4321, 500, 1300);
    envelope(c, 0.35, 0.6, 1.5, 0.8);
    mix(out, c, 0.4);
    return lowpass(out, 3200);
  },
};

fs.mkdirSync(OUT, { recursive: true });
console.log('A gerar efeitos sonoros:');
// Pico conservador: sobra espaço e nada satura no altifalante do telemóvel.
for (const [name, make] of Object.entries(SOUNDS)) writeWav(name, make(), 0.7);
console.log('Feito.');
