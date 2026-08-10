/**
 * Coreografia dos LANCES DE GOLO (opção "highlights").
 *
 * Lógica pura, sem React nem SDKs. Reproduz a mesma matemática do mockup
 * aprovado e "assa" (bake) as posições em keyframes densos (amostragem), para
 * que o componente RN as reproduza com `Animated.interpolate` no DRIVER NATIVO —
 * uma animação de duração fixa, à mesma velocidade em qualquer telemóvel e
 * independente da velocidade da repetição (1x/2x/4x).
 *
 * Coordenadas virtuais: campo VW×VH (retrato, baliza em cima). O componente
 * multiplica por `width/VW` para o ecrã.
 */

export const VW = 360;
export const VH = 780;
const GOALX = 180;
const GOAL_Y = 86;
const NET_TOP = 30;

/** Geometria estática do campo (para o componente desenhar as linhas). */
export const PITCH = (() => {
  const boxW = 210, boxH = 196, bx = GOALX - boxW / 2, by = GOAL_Y;
  const sixW = 110, sixH = 74, sixX = GOALX - sixW / 2;
  const gw = 150, gx = GOALX - gw / 2;
  const spotY = by + (boxH * 12) / 18; // marca de grande penalidade
  const arcR = (boxH * 10) / 18; // raio de 10 jardas
  const dEdge = by + boxH - spotY; // distância da marca à linha da área
  const halfChord = Math.sqrt(Math.max(0, arcR * arcR - dEdge * dEdge)); // meia-corda do "D"
  const depth = arcR - dEdge; // profundidade do "D" fora da área
  return {
    GOALX, GOAL_Y, NET_TOP,
    box: { x: bx, y: by, w: boxW, h: boxH },
    six: { x: sixX, y: by, w: sixW, h: sixH },
    goal: { x: gx, y: GOAL_Y, w: gw, top: NET_TOP },
    spot: { x: GOALX, y: spotY },
    dArc: { cx: GOALX, edgeY: by + boxH, halfChord, depth },
    standsY: GOAL_Y - 30,
  };
})();

// ---------- easing (iguais ao mockup) ----------
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const eoc = (t: number) => { t = clamp01(t); return 1 - Math.pow(1 - t, 3); };
const eic = (t: number) => { t = clamp01(t); return t * t * t; };
const eio = (t: number) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eob = (t: number) => { t = clamp01(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export type Team = 'H' | 'A';
interface Pt { x: number; y: number; z?: number }
interface Actor { x: number; y: number; team: Team; role: string; hero?: boolean }
interface Frame { ball: Pt; players: Actor[]; gk: { x: number; y: number }; goalT: number; netHit: { x: number; y: number }; label: TemplateId }

export type TemplateId = 'counter' | 'screamer' | 'header' | 'solo' | 'rebound' | 'chip';

/** Contra-ataque: passe em profundidade para o avançado em corrida → finalização. */
function tplCounter(t: number): Frame {
  const passT = [0.9, 1.12], carry = [1.12, 2.15], shot = [2.15, 2.5], DONE = 2.5;
  const stX = lerp(120, 196, eio(seg(t, 0, carry[1])));
  const stY = lerp(560, 150, eio(seg(t, 0, carry[1])));
  let ball: Pt;
  if (t < passT[0]) ball = { x: 172, y: 612, z: 0 };
  else if (t < passT[1]) { const k = eoc(seg(t, passT[0], passT[1])); ball = { x: lerp(172, stX, k), y: lerp(612, stY + 8, k), z: Math.sin(k * Math.PI) * 10 }; }
  else if (t < shot[0]) ball = { x: stX, y: stY + 9, z: 0 };
  else { const k = eic(seg(t, shot[0], shot[1])); ball = { x: lerp(stX, 208, k) + Math.sin(k * Math.PI) * 11, y: lerp(stY + 9, GOAL_Y - 6, k), z: Math.sin(k * Math.PI) * 6 }; }
  const players: Actor[] = [
    { x: 172, y: lerp(618, 626, eoc(seg(t, 0, 1.2))), team: 'H', role: 'MID' },
    { x: stX, y: stY, team: 'H', role: 'ST', hero: true },
    { x: lerp(250, 236, eio(seg(t, 0, carry[1]))), y: lerp(520, 230, eio(seg(t, 0, carry[1]))), team: 'H', role: 'W' },
    { x: lerp(150, 182, eio(seg(t, carry[0], carry[1]))), y: lerp(300, 200, eio(seg(t, carry[0], carry[1]))), team: 'A', role: 'D' },
    { x: 210, y: 250, team: 'A', role: 'D' },
  ];
  const k = eoc(seg(t, shot[0], DONE));
  // GR mergulha para o lado ERRADO (bola vai à direita, ele vai à esquerda) → batido.
  const gk = { x: lerp(GOALX, 150, k), y: lerp(GOAL_Y - 16, GOAL_Y - 1, k) };
  return { ball, players, gk, goalT: DONE, netHit: { x: 210, y: GOAL_Y }, label: 'counter' };
}

/** Golaço de longe: recebe fora da área, primeiro toque, remate no ângulo. */
function tplScreamer(t: number): Frame {
  const recv = [0.0, 0.8], plant = [0.8, 1.12], shot = [1.12, 1.55], DONE = 1.55;
  const stX = 178, stY = 340;
  let ball: Pt;
  if (t < recv[1]) { const k = eoc(seg(t, recv[0], recv[1])); ball = { x: lerp(120, stX, k), y: lerp(470, stY + 8, k), z: Math.sin(k * Math.PI) * 8 }; }
  else if (t < shot[0]) ball = { x: stX, y: stY + 8, z: 0 };
  else { const k = eic(seg(t, shot[0], shot[1])); const cx = lerp(stX, 150, k), cy = lerp(stY + 8, GOAL_Y - 4, k); ball = { x: cx - Math.sin(k * Math.PI) * 14, y: cy, z: Math.sin(k * Math.PI) * 7 }; }
  const kickLunge = eob(seg(t, plant[0], plant[1])) - eic(seg(t, shot[0], shot[1])) * 0.4;
  const players: Actor[] = [
    { x: stX, y: stY - kickLunge * 6, team: 'H', role: 'ST', hero: true },
    { x: lerp(250, 232, eio(seg(t, 0, 1.4))), y: lerp(430, 300, eio(seg(t, 0, 1.4))), team: 'H', role: 'W' },
    { x: lerp(196, 186, eio(seg(t, recv[1], shot[0]))), y: lerp(300, 326, eio(seg(t, recv[1], shot[0]))), team: 'A', role: 'D' },
    { x: 150, y: 250, team: 'A', role: 'D' },
  ];
  const k = eoc(seg(t, shot[0], DONE));
  // A bola curva para a esquerda; o GR mergulha para a DIREITA → desengonçado.
  const gk = { x: lerp(GOALX, 212, k), y: lerp(GOAL_Y - 16, GOAL_Y - 5, k) };
  return { ball, players, gk, goalT: DONE, netHit: { x: 150, y: GOAL_Y }, label: 'screamer' };
}

/** Cabeceamento: cruzamento da ala, avançado cabeceia ao poste; GR sai e fica preso. */
function tplHeader(t: number): Frame {
  const cross = [0.85, 1.15], hdr = [1.15, 1.45], DONE = 1.45;
  const crX = lerp(238, 252, eio(seg(t, 0, cross[0])));
  const crY = lerp(300, 150, eio(seg(t, 0, cross[0])));
  const stX = 166, stY = 150;
  let ball: Pt;
  if (t < cross[0]) ball = { x: crX, y: crY + 6, z: 1 };
  else if (t < cross[1]) { const k = eio(seg(t, cross[0], cross[1])); ball = { x: lerp(crX, stX + 4, k), y: lerp(crY + 6, stY + 6, k), z: Math.sin(k * Math.PI) * 24 }; }
  else { const k = eic(seg(t, cross[1], hdr[1])); ball = { x: lerp(stX + 4, 138, k) - Math.sin(k * Math.PI) * 7, y: lerp(stY + 6, GOAL_Y - 3, k), z: 24 * (1 - k) * 0.4 + Math.sin(k * Math.PI) * 5 }; }
  const players: Actor[] = [
    { x: stX, y: stY - (t > cross[1] ? eob(seg(t, cross[1], hdr[0])) * 4 : 0), team: 'H', role: 'ST', hero: true },
    { x: crX, y: crY, team: 'H', role: 'W' },
    { x: lerp(150, 158, eio(seg(t, 0.85, hdr[0]))), y: lerp(196, 172, eio(seg(t, 0.85, hdr[0]))), team: 'A', role: 'D' },
    { x: 192, y: 182, team: 'A', role: 'D' },
  ];
  const k = eoc(seg(t, cross[0], DONE));
  const gk = { x: lerp(GOALX, 174, k), y: lerp(GOAL_Y - 14, GOAL_Y + 18, k) }; // sai da linha, encravado
  return { ball, players, gk, goalT: DONE, netHit: { x: 138, y: GOAL_Y }, label: 'header' };
}

/** Jogada individual: dribla e passa o guarda-redes → remata à baliza aberta. */
function tplSolo(t: number): Frame {
  const round = [1.6, 2.0], tap = [2.0, 2.35], DONE = 2.35;
  const runK = eio(seg(t, 0, round[0]));
  const stX = t < round[0] ? lerp(150, 178, runK) : lerp(178, 214, eoc(seg(t, round[0], tap[1])));
  const stY = t < round[0] ? lerp(560, 150, runK) : lerp(150, 120, eoc(seg(t, round[0], tap[1])));
  let ball: Pt;
  if (t < tap[0]) ball = { x: stX + 4, y: stY + 8, z: 0 };
  else { const k = eic(seg(t, tap[0], tap[1])); ball = { x: lerp(stX + 4, 150, k) - Math.sin(k * Math.PI) * 8, y: lerp(stY + 8, GOAL_Y - 4, k), z: Math.sin(k * Math.PI) * 3 }; }
  const players: Actor[] = [
    { x: stX, y: stY, team: 'H', role: 'ST', hero: true },
    { x: lerp(162, 150, eio(seg(t, 0.3, 1.4))), y: lerp(320, 214, eio(seg(t, 0.3, 1.4))), team: 'A', role: 'D' },
    { x: 205, y: 250, team: 'A', role: 'D' },
  ];
  const outK = eoc(seg(t, 0.9, round[1]));
  const gk = { x: lerp(GOALX, 166, outK), y: lerp(GOAL_Y - 12, 148, outK) }; // sai a fechar, é driblado
  return { ball, players, gk, goalT: DONE, netHit: { x: 150, y: GOAL_Y }, label: 'solo' };
}

/** Recarga: remate DEFENDIDO pelo GR, segundo avançado emenda para dentro. */
function tplRebound(t: number): Frame {
  const shot = [1.0, 1.3], parry = [1.3, 1.55], tap = [1.55, 1.9], DONE = 1.9;
  const shX = lerp(150, 170, eio(seg(t, 0, shot[0])));
  const shY = lerp(360, 300, eio(seg(t, 0, shot[0])));
  const heroK = eoc(seg(t, parry[0], tap[1]));
  const heroX = lerp(232, 150, heroK), heroY = lerp(340, 130, heroK);
  let ball: Pt;
  if (t < shot[0]) ball = { x: shX + 4, y: shY + 8, z: 0 };
  else if (t < shot[1]) { const k = eic(seg(t, shot[0], shot[1])); ball = { x: lerp(shX + 4, 180, k), y: lerp(shY + 8, 108, k), z: Math.sin(k * Math.PI) * 4 }; }
  else if (t < parry[1]) { const k = eoc(seg(t, shot[1], parry[1])); ball = { x: lerp(180, 150, k), y: lerp(108, 150, k), z: Math.sin(k * Math.PI) * 6 }; } // ressalta da defesa
  else { const k = eic(seg(t, tap[0], tap[1])); ball = { x: lerp(150, 134, k) - Math.sin(k * Math.PI) * 5, y: lerp(150, GOAL_Y - 4, k), z: Math.sin(k * Math.PI) * 2 }; }
  const players: Actor[] = [
    { x: heroX, y: heroY, team: 'H', role: 'ST', hero: true }, // quem emenda
    { x: shX, y: shY, team: 'H', role: 'F' }, // quem rematou
    { x: 194, y: 250, team: 'A', role: 'D' },
  ];
  const dive = eoc(seg(t, shot[0], parry[0]));
  const gk = t < parry[1]
    ? { x: lerp(GOALX, 180, dive), y: lerp(GOAL_Y - 14, GOAL_Y + 16, dive) } // VAI à bola: defende mesmo
    : { x: 172, y: GOAL_Y + 20 }; // caído, fora da recarga
  return { ball, players, gk, goalT: DONE, netHit: { x: 134, y: GOAL_Y }, label: 'rebound' };
}

/** Chapéu: avançado isolado, o GR sai a fechar o ângulo e é picado por cima. */
function tplChip(t: number): Frame {
  const carry = [0, 1.1], dink = [1.1, 1.7], DONE = 1.7;
  const runK = eio(seg(t, 0, carry[1]));
  const stX = lerp(150, 178, runK), stY = lerp(520, 224, runK);
  let ball: Pt;
  if (t < dink[0]) ball = { x: stX + 4, y: stY + 8, z: 0 };
  else { const k = eio(seg(t, dink[0], dink[1])); ball = { x: lerp(stX + 4, 180, k), y: lerp(stY + 8, GOAL_Y - 6, k), z: Math.sin(k * Math.PI) * 30 }; } // balão alto
  const players: Actor[] = [
    { x: stX, y: stY, team: 'H', role: 'ST', hero: true },
    { x: 210, y: 250, team: 'A', role: 'D' },
    { x: 150, y: 244, team: 'A', role: 'D' },
  ];
  const outK = eoc(seg(t, 0.5, dink[0]));
  const gk = { x: lerp(GOALX, 180, outK), y: lerp(GOAL_Y - 12, GOAL_Y + 88, outK) }; // sai muito, picado por cima
  return { ball, players, gk, goalT: DONE, netHit: { x: 180, y: GOAL_Y }, label: 'chip' };
}

/**
 * Figurantes comuns a todos os lances — enchem a cena (apoios a chegar de trás +
 * linha defensiva de cobertura a recuar).
 *
 * TODOS ficam nos CORREDORES LATERAIS (x < 130 ou x > 236). Antes havia
 * figurantes no corredor central e a bola passava-lhes por cima em linha reta —
 * era o efeito de "a bola atravessa dez jogadores" que o playtest apanhou. Nas
 * alas enchem a cena sem nunca cruzar a trajetória.
 */
function ambient(t: number): Actor[] {
  const e = eio(seg(t, 0, 1.6)); // deriva lenta ao longo do lance
  return [
    // apoios (equipa que ataca) a subir pelas ALAS
    { x: lerp(86, 108, e), y: lerp(612, 486, e), team: 'H', role: 'M' },
    { x: lerp(276, 254, e), y: lerp(600, 470, e), team: 'H', role: 'M' },
    { x: lerp(180, 172, e), y: lerp(700, 640, e), team: 'H', role: 'M' }, // atrás de tudo
    // cobertura defensiva a recuar, também pelas alas
    { x: lerp(92, 104, e), y: lerp(300, 330, e), team: 'A', role: 'D' },
    { x: lerp(268, 256, e), y: lerp(296, 326, e), team: 'A', role: 'D' },
    { x: lerp(248, 238, e), y: lerp(392, 424, e), team: 'A', role: 'D' },
  ];
}

/** Ordem estável dos templates — dá o `variant` do festejo. */
export const TEMPLATE_IDS: TemplateId[] = ['counter', 'screamer', 'header', 'solo', 'rebound', 'chip'];

const RAW_TEMPLATES: Record<TemplateId, (t: number) => Frame> = {
  counter: tplCounter, screamer: tplScreamer, header: tplHeader, solo: tplSolo, rebound: tplRebound, chip: tplChip,
};

// Cada lance ganha os figurantes (prepend → ficam por baixo dos protagonistas).
const TEMPLATES: Record<TemplateId, (t: number) => Frame> = Object.fromEntries(
  (Object.keys(RAW_TEMPLATES) as TemplateId[]).map((id) => [
    id,
    (t: number): Frame => { const f = RAW_TEMPLATES[id](t); return { ...f, players: [...ambient(t), ...f.players] }; },
  ]),
) as Record<TemplateId, (t: number) => Frame>;

/** Sequência de um ator ao longo do clip (keyframes prontos para interpolar). */
export interface ClipActor { team: Team; role: string; hero: boolean; xs: number[]; ys: number[] }

/** Dados "assados" de um clip: arrays de keyframes indexados por `inputRange` (0..1). */
export interface BakedClip {
  inputRange: number[];
  /** `groundYs` = y da bola SEM a elevação — é onde assenta a sombra. */
  ball: { xs: number[]; ys: number[]; groundYs: number[]; scale: number[]; shadow: number[] };
  actors: ClipActor[]; // inclui o GR (team 'A', role 'GK') no fim
  zoom: number[]; // 0..1
  flash: number[]; // 0..1
  card: number[]; // 0..1 (entrada do cartão de golo)
  net: number[]; // 0..1 (intensidade da ondulação)
  netHit: { x: number; y: number };
  label: TemplateId;
  durationMs: number;
  goalAtMs: number;
  /** Instantes em que há SOM: toques na bola, o remate e a bola na rede. */
  cues: ClipCue[];
}

/** Um som a disparar durante o lance, no instante `atMs` do clip. */
export interface ClipCue { atMs: number; kind: 'pass' | 'shot' | 'net' }

/** Ângulo mínimo (rad) de mudança de direção para contar como toque na bola. */
const TOUCH_ANGLE = 0.6;
/** Frames mínimos entre dois toques — evita rajadas numa curva suave. */
const TOUCH_GAP = 2;

/**
 * Deduz os toques na bola a partir da TRAJETÓRIA já assada.
 *
 * Em vez de anotar cada template à mão (seis templates, e mais um sempre que se
 * inventa um lance novo), lê-se o movimento: sempre que a bola muda de direção
 * de forma brusca é porque alguém lhe tocou. O último toque antes do golo é o
 * remate; o golo em si é a bola a entrar na rede.
 */
function deriveCues(xs: number[], ys: number[], totalSec: number, actionSec: number): ClipCue[] {
  const frameMs = (totalSec * 1000) / (xs.length - 1);
  const goalFrame = Math.round((actionSec / totalSec) * (xs.length - 1));
  const touches: number[] = [];

  // O ARRANQUE conta como toque: em lances que já começam com a bola lançada
  // (o contra-ataque, por exemplo) não há mudança de direção nenhuma para
  // detetar, e o lance ficava mudo até ao remate.
  for (let i = 1; i < goalFrame; i++) {
    if (Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!) > 0.5) { touches.push(i - 1); break; }
  }

  for (let i = 1; i < goalFrame - 1; i++) {
    const ax = xs[i]! - xs[i - 1]!, ay = ys[i]! - ys[i - 1]!;
    const bx = xs[i + 1]! - xs[i]!, by = ys[i + 1]! - ys[i]!;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 0.5 || lb < 0.5) continue; // bola parada: não há toque nenhum
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    const turn = Math.acos(cos);
    const accel = lb / Math.max(0.5, la);
    if (turn < TOUCH_ANGLE && accel < 1.9) continue;
    if (touches.length > 0 && i - touches[touches.length - 1]! < TOUCH_GAP) continue;
    touches.push(i);
  }

  const cues: ClipCue[] = touches.map((f, idx) => ({
    atMs: Math.round(f * frameMs),
    // O último toque antes da baliza é o remate — soa mais forte.
    kind: idx === touches.length - 1 ? 'shot' : 'pass',
  }));
  cues.push({ atMs: Math.round(actionSec * 1000), kind: 'net' });
  return cues;
}

const CELEBRATION_SEC = 2.6;
const SAMPLES = 60;

/**
 * FESTEJO — reescreve as posições depois do golo.
 *
 * Os templates saturam além de `goalT`, por isso a cena CONGELAVA no instante do
 * remate e ficavam 2.6 s de bonecos parados enquanto o cartão "GOLO!" subia.
 *
 * A primeira versão resolvia isso mas ficava mecânica, por três razões que
 * valem a pena registar porque são fáceis de reintroduzir:
 *
 *  1. **Velocidade constante.** O marcador corria em linha até bater no canto e
 *     parava a seco. Agora a corrida tem duas fases — arranque explosivo e uma
 *     travagem longa — como quem festeja e depois abranda a olhar para a bancada.
 *  2. **Ondulação sempre igual.** Era um seno fixo por cima da reta, idêntico em
 *     todos os lances. Agora o desvio é um ARCO que abre a meio e fecha na
 *     chegada, com amplitude e sentido tirados do próprio lance.
 *  3. **Todos ao mesmo ponto.** Os colegas convergiam para o mesmo sítio e
 *     sobrepunham-se. Agora param em LEQUE à volta do marcador, cada um ao seu
 *     raio e à sua velocidade.
 *
 * E o marcador corre para o canto do lado de onde marcou — antes era sempre o
 * mesmo canto, o que dava a sensação de guião.
 */

/** Cantos de festejo: escolhe-se o do lado de onde o golo saiu. */
const CORNER_LEFT = { x: 60, y: 176 };
const CORNER_RIGHT = { x: 300, y: 176 };

function applyCelebration(
  actors: ClipActor[],
  inputRange: number[],
  totalSec: number,
  actionSec: number,
  /** Índice do template — dá a cada lance um arco e um destino ligeiramente seus. */
  variant: number,
): void {
  const heroIdx = actors.findIndex((a) => a.hero);
  if (heroIdx < 0) return;
  const hero = actors[heroIdx]!;
  const start = inputRange.findIndex((p) => p * totalSec > actionSec);
  if (start <= 0) return;

  const hx0 = hero.xs[start - 1]!, hy0 = hero.ys[start - 1]!;
  const toRight = hx0 >= GOALX;
  const corner = toRight ? CORNER_RIGHT : CORNER_LEFT;
  const target = { x: corner.x, y: corner.y + (variant % 3) * 14 };
  const arcSide = toRight ? 1 : -1;
  const arcAmp = 16 + (variant % 4) * 5;

  const mates = actors
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => a.team === 'H' && i !== heroIdx);
  const foes = actors.filter((a) => a.team === 'A' && a.role !== 'GK');

  for (let i = start; i < inputRange.length; i++) {
    const dg = inputRange[i]! * totalSec - actionSec; // segundos desde o golo

    // Corrida em duas fases: 78% do caminho no arranque, 22% a travar.
    const raw = Math.min(1, dg / 1.9);
    const c = eoc(Math.min(1, raw / 0.55)) * 0.78 + eoc(Math.max(0, (raw - 0.55) / 0.45)) * 0.22;

    const bow = Math.sin(clamp01(c) * Math.PI) * arcAmp; // máximo a meio, zero nas pontas
    hero.xs[i] = lerp(hx0, target.x, c) + arcSide * bow;
    hero.ys[i] = lerp(hy0, target.y, c) - Math.sin(clamp01(c) * Math.PI) * 8;

    mates.forEach(({ a }, n) => {
      const delay = 0.18 + n * 0.26;   // cada um arranca depois do anterior
      const speed = 1.5 + (n % 3) * 0.35; // e corre à sua velocidade
      const m = eoc(clamp01((dg - delay) / speed));
      // Leque à volta do marcador: ângulos e raios distintos → ninguém se sobrepõe.
      const ang = (-0.9 + n * 0.62) * arcSide;
      const rad = 26 + (n % 3) * 11;
      a.xs[i] = lerp(a.xs[start - 1]!, hero.xs[i]! + Math.sin(ang) * rad, m);
      a.ys[i] = lerp(a.ys[start - 1]!, hero.ys[i]! + Math.cos(ang) * rad * 0.72 + 10, m);
    });

    // Adversários: o mais adiantado fica caído; os outros afastam-se devagar.
    foes.forEach((a, n) => {
      const down = n === 0;
      const k = eoc(Math.min(1, dg / (down ? 0.6 : 2.4)));
      a.ys[i] = a.ys[start - 1]! + k * (down ? 8 : 30 + n * 6);
      if (!down) a.xs[i] = a.xs[start - 1]! + k * (n % 2 ? 12 : -12);
    });
  }
}

/** Assa um clip determinístico a partir do template escolhido. */
export function bakeClip(which: TemplateId): BakedClip {
  const tpl = TEMPLATES[which];
  const meta = tpl(999); // posições finais + goalT (o template satura além da ação)
  const actionSec = meta.goalT;
  const totalSec = actionSec + CELEBRATION_SEC;

  const inputRange: number[] = [];
  const s0 = tpl(0);
  const actors: ClipActor[] = s0.players.map((p) => ({ team: p.team, role: p.role, hero: !!p.hero, xs: [], ys: [] }));
  const gk: ClipActor = { team: 'A', role: 'GK', hero: false, xs: [], ys: [] };
  const ballXs: number[] = [], ballYs: number[] = [], ballScale: number[] = [];
  const ballGroundYs: number[] = [], ballShadow: number[] = [];
  const zoom: number[] = [], flash: number[] = [], card: number[] = [], net: number[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    inputRange.push(p);
    const tSec = p * totalSec;
    const f = tpl(tSec); // satura em actionSec
    f.players.forEach((pl, idx) => { actors[idx].xs.push(pl.x); actors[idx].ys.push(pl.y); });
    gk.xs.push(f.gk.x); gk.ys.push(f.gk.y);
    const z = f.ball.z ?? 0;
    ballXs.push(f.ball.x);
    ballYs.push(f.ball.y - z * 0.6); // z como leve elevação
    ballGroundYs.push(f.ball.y); // a sombra fica no chão, por baixo
    ballScale.push(1 + Math.min(0.35, z * 0.012)); // cap: balões altos não ficam gigantes
    // Sombra: encolhe e esbate à medida que a bola sobe — é isto que dá a
    // leitura de altura. Sem ela, um cruzamento alto e um passe rasteiro eram
    // desenhados exatamente da mesma maneira.
    ballShadow.push(Math.max(0, 1 - Math.min(1, z / 30)));
    // câmara: aproxima no remate, assenta no festejo
    zoom.push(tSec <= actionSec ? eoc(seg(tSec, actionSec - 0.5, actionSec)) : lerp(1, 0.55, eoc(seg(tSec, actionSec, actionSec + 0.8))));
    const dg = tSec - actionSec;
    flash.push(dg >= 0 && dg < 0.28 ? 1 - dg / 0.28 : 0);
    card.push(tSec <= actionSec ? 0 : Math.max(0, eob((tSec - actionSec - 0.05) / 0.35))); // pop de entrada
    net.push(dg >= 0 && dg < 0.6 ? Math.max(0, 1 - dg / 0.6) : 0);
  }
  actors.push(gk);
  applyCelebration(actors, inputRange, totalSec, actionSec, TEMPLATE_IDS.indexOf(which));

  return {
    inputRange,
    ball: { xs: ballXs, ys: ballYs, groundYs: ballGroundYs, scale: ballScale, shadow: ballShadow },
    actors,
    zoom, flash, card, net,
    netHit: meta.netHit,
    label: which,
    durationMs: Math.round(totalSec * 1000),
    goalAtMs: Math.round(actionSec * 1000),
    cues: deriveCues(ballXs, ballYs, totalSec, actionSec),
  };
}

// Pool ponderado: contra-ataque e golaço mais comuns; os restantes dão variedade.
const TEMPLATE_POOL: TemplateId[] = [
  'counter', 'counter', 'screamer', 'screamer', 'header', 'solo', 'rebound', 'chip',
];

/** Escolhe o template de forma determinística a partir de uma seed. */
export function pickTemplate(seed: number): TemplateId {
  return TEMPLATE_POOL[Math.abs(Math.trunc(seed)) % TEMPLATE_POOL.length]!;
}
