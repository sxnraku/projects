/**
 * Gera os assets da app (icon, adaptive-icon, splash) sem dependências:
 * desenha por pixel e codifica PNG à mão (zlib nativo do Node + CRC32).
 * Correr: node scripts/gen-assets.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Codificador PNG mínimo (RGBA, sem filtros) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Desenho ----------
const BG = [0x20, 0x24, 0x2a, 255];
const PITCH = [0x2f, 0x8a, 0x3b, 255];
const PITCH_DARK = [0x27, 0x74, 0x32, 255];
const LINE = [255, 255, 255, 235];
const GOLD = [0xe3, 0xb3, 0x41, 255];

function makeCanvas(w, h, fill) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) buf.set(fill, i * 4);
  return buf;
}
function px(buf, w, x, y, c) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  const a = c[3] / 255;
  buf[i] = Math.round(c[0] * a + buf[i] * (1 - a));
  buf[i + 1] = Math.round(c[1] * a + buf[i + 1] * (1 - a));
  buf[i + 2] = Math.round(c[2] * a + buf[i + 2] * (1 - a));
  buf[i + 3] = 255;
}
/** Disco com anti-aliasing simples na borda. */
function disc(buf, w, h, cx, cy, r, c) {
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(h - 1, cy + r + 2); y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r - 0.5) px(buf, w, x, y, c);
      else if (d <= r + 0.5) px(buf, w, x, y, [c[0], c[1], c[2], Math.round(c[3] * (r + 0.5 - d))]);
    }
  }
}
function ring(buf, w, h, cx, cy, r, thickness, c) {
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(h - 1, cy + r + 2); y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const inner = r - thickness / 2, outer = r + thickness / 2;
      if (d >= inner && d <= outer) px(buf, w, x, y, c);
    }
  }
}
function rect(buf, w, h, x0, y0, x1, y1, c) {
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = x0; x <= x1; x++) px(buf, w, x, y, c);
  }
}
/** Estrela de 5 pontas preenchida (ray-casting simples). */
function star(buf, w, h, cx, cy, rOuter, c) {
  const rInner = rOuter * 0.45;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  for (let y = Math.round(cy - rOuter); y <= Math.round(cy + rOuter); y++) {
    for (let x = Math.round(cx - rOuter); x <= Math.round(cx + rOuter); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) px(buf, w, x, y, c);
    }
  }
}

/** Emblema do jogo: campo circular verde com linhas + estrela dourada. */
function drawBadge(buf, w, h, cx, cy, R) {
  disc(buf, w, h, cx, cy, R, PITCH);
  // riscas de relvado (metades alternadas ligeiramente mais escuras)
  for (let band = 0; band < 6; band++) {
    if (band % 2 === 0) continue;
    const y0 = Math.round(cy - R + (band * 2 * R) / 6);
    const y1 = Math.round(cy - R + ((band + 1) * 2 * R) / 6);
    for (let y = y0; y < y1; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (Math.hypot(x - cx, y - cy) <= R - 1) px(buf, w, x, y, [PITCH_DARK[0], PITCH_DARK[1], PITCH_DARK[2], 255]);
      }
    }
  }
  const t = Math.max(3, Math.round(R * 0.035));
  ring(buf, w, h, cx, cy, R - t, t, LINE); // linha exterior
  rect(buf, w, h, cx - R + t, cy - Math.round(t / 2), cx + R - t, cy + Math.round(t / 2), LINE); // meio-campo
  ring(buf, w, h, cx, cy, Math.round(R * 0.32), t, LINE); // círculo central
  star(buf, w, h, cx, cy - Math.round(R * 0.62), Math.round(R * 0.16), GOLD); // estrela
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

// icon.png — 1024×1024, fundo escuro
{
  const S = 1024;
  const buf = makeCanvas(S, S, BG);
  drawBadge(buf, S, S, S / 2, S / 2 + 30, 380);
  fs.writeFileSync(path.join(out, 'icon.png'), encodePng(S, S, buf));
}
// adaptive-icon.png — foreground transparente, emblema na zona segura (66%)
{
  const S = 1024;
  const buf = makeCanvas(S, S, [0, 0, 0, 0]);
  drawBadge(buf, S, S, S / 2, S / 2, 300);
  fs.writeFileSync(path.join(out, 'adaptive-icon.png'), encodePng(S, S, buf));
}
// splash.png — 1284×2778, emblema pequeno centrado
{
  const W = 1284, H = 2778;
  const buf = makeCanvas(W, H, BG);
  drawBadge(buf, W, H, W / 2, Math.round(H * 0.45), 260);
  fs.writeFileSync(path.join(out, 'splash.png'), encodePng(W, H, buf));
}

console.log('✓ assets/icon.png, assets/adaptive-icon.png, assets/splash.png gerados');
