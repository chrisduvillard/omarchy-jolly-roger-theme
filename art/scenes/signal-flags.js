// "Signal flags" — O·M·A·R·C·H·Y in International Code of Signals flags,
// bent onto a line that sweeps down from the masthead across a night sky.
// The flags are the only colour in the picture; mast, yard and rigging are
// silhouettes against a low moon glow.
import { P, TAU, rng, makeNoise, clamp, lerp, smooth, rgba, layer, field, glow, grain, vignette, stars, linearFill, radialFill } from '../lib/core.js';
import { makeCloth, drawRope } from '../lib/cloth.js';
import { drawShip } from '../lib/ship.js';

export const size = [3840, 2160];

// dyed-wool versions of the code colours
const RED = '#c9483e', YEL = '#e3bb5e', BLU = '#2f5f9e', WHT = '#e6d9ba';
const M = 0.07;                    // texture margin (cloth units)
const FLY = 1.24;                  // fly length as a multiple of the hoist

// ---- flag designs ---------------------------------------------------------
// Panels in flag coordinates: a = 0..1 from hoist to fly, b = 0..1 from head
// to foot. Each is [colour, [[a, b], ...]].
const rect = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
function stripeY(c0, c1) {         // the part of the flag between the diagonals a + b = c0 and a + b = c1
  const top = c => (c <= 1 ? [c, 0] : [1, c - 1]), left = c => (c <= 1 ? [0, c] : [c - 1, 1]);
  const pts = [top(c0)];
  if (c0 < 1 && c1 > 1) pts.push([1, 0]);
  pts.push(top(c1), left(c1));
  if (c0 < 1 && c1 > 1) pts.push([0, 1]);
  pts.push(left(c0));
  return pts;
}
const DESIGNS = {
  // Oscar: divided diagonally — yellow in the lower hoist, red in the upper fly
  O: () => [[YEL, [[0, 0], [1, 1], [0, 1]]], [RED, [[0, 0], [1, 0], [1, 1]]]],
  // Mike: blue with a white saltire
  M: () => {
    const d = 0.15, e = 0.185;
    return [[BLU, rect(0, 0, 1, 1)],
      [WHT, [[0, 0], [d, 0], [1, 1 - e], [1, 1], [1 - d, 1], [0, e]]],
      [WHT, [[1, 0], [1, e], [d, 1], [0, 1], [0, 1 - e], [1 - d, 0]]]];
  },
  // Alfa: swallow-tailed, white at the hoist, blue in the fly
  A: () => [[WHT, rect(0, 0, 0.5, 1)], [BLU, [[0.5, 0], [1, 0], [0.68, 0.5], [1, 1], [0.5, 1]]]],
  // Romeo: red with a yellow cross
  R: () => [[RED, rect(0, 0, 1, 1)], [YEL, rect(0.4, 0, 0.6, 1)], [YEL, rect(0, 0.39, 1, 0.61)]],
  // Charlie: five horizontal stripes — blue, white, red, white, blue
  C: () => [BLU, WHT, RED, WHT, BLU].map((c, i) => [c, rect(0, i / 5, 1, (i + 1) / 5)]),
  // Hotel: white at the hoist, red in the fly
  H: () => [[WHT, rect(0, 0, 0.5, 1)], [RED, rect(0.5, 0, 1, 1)]],
  // Yankee: ten diagonal stripes, yellow and red, yellow at the upper hoist
  Y: () => Array.from({ length: 10 }, (_, k) => [k % 2 ? RED : YEL, stripeY(k / 5, (k + 1) / 5)]),
};
const OUTLINE = { A: [[0, 0], [1, 0], [0.68, 0.5], [1, 1], [0, 1]] };

// The flag as it would lie flat: x along the fly, y down the hoist.
function flagTexture(letter, Lf, h, S, seed) {
  const TW = Math.round(Lf * (1 + 2 * M)), TH = Math.round(h * (1 + 2 * M));
  const [tc, t] = layer(TW, TH);
  const X = a => (a + M) * Lf, Y = b => (b + M) * h;
  const nz = makeNoise(seed), r = rng(seed + 1);
  const poly = pts => { t.beginPath(); pts.forEach(([a, b], i) => (i ? t.lineTo(X(a), Y(b)) : t.moveTo(X(a), Y(b)))); t.closePath(); };
  const panels = DESIGNS[letter]();
  for (const [col, pts] of panels) { t.fillStyle = col; poly(pts); t.fill(); t.strokeStyle = col; t.lineWidth = 1; t.stroke(); }
  // seams where the panels are sewn together
  t.lineJoin = 'round';
  for (const [, pts] of panels) {
    poly(pts); t.strokeStyle = 'rgba(30,20,14,0.3)'; t.lineWidth = 2.6 * S; t.stroke();
    t.save(); t.setLineDash([5 * S, 4 * S]); t.strokeStyle = 'rgba(255,245,220,0.12)'; t.lineWidth = 1.2 * S; t.translate(2.4 * S, 2.4 * S); poly(pts); t.stroke(); t.restore();
  }
  // uneven dye, a little sun-fade toward the fly
  field(t, TW, TH, (a, b) => {
    const n = nz.fbm(a * 3.5, b * 3.5, 4), f = nz.fbm(a * 22 + 3, b * 22, 2);
    const k = 0.5 + 0.34 * n + 0.14 * f + 0.1 * smooth(0.6, 1, a);
    return k > 0.5 ? [255, 244, 222, (k - 0.5) * 70] : [20, 14, 10, (0.5 - k) * 105];
  }, { down: 2 });
  // canvas tabling along the hoist with the rope inside it
  const tw = 0.052;
  t.fillStyle = linearFill(t, X(0), 0, X(tw), 0, [[0, '#8e8266'], [0.35, '#b7a987'], [0.8, '#a39574'], [1, '#85795e']]);
  t.fillRect(X(0), Y(0), tw * Lf, h);
  t.fillStyle = 'rgba(30,22,12,0.4)'; t.fillRect(X(tw) - 1 * S, Y(0), 2.4 * S, h);
  t.save(); t.setLineDash([5 * S, 4 * S]); t.strokeStyle = 'rgba(60,46,28,0.5)'; t.lineWidth = 1.3 * S;
  t.beginPath(); t.moveTo(X(tw) - 5 * S, Y(0)); t.lineTo(X(tw) - 5 * S, Y(1)); t.stroke(); t.restore();
  // hems on the three free sides
  t.strokeStyle = 'rgba(20,14,10,0.22)'; t.lineWidth = 1.6 * S;
  poly((OUTLINE[letter] || rect(0, 0, 1, 1)).map(([a, b]) => [lerp(0.5, a, 0.955) + (a < 0.01 ? -0.02 : 0), lerp(0.5, b, 0.94)])); t.stroke();
  // coverage: the outline, with the fly edge worn slightly ragged
  const [mc, m] = layer(TW, TH);
  m.fillStyle = '#fff';
  const out = OUTLINE[letter] || rect(0, 0, 1, 1);
  m.beginPath();
  for (let i = 0; i < out.length; i++) {
    const [a0, b0] = out[i], [a1, b1] = out[(i + 1) % out.length], n = 26;
    for (let k = 0; k < n; k++) {
      const q = k / n, a = lerp(a0, a1, q), b = lerp(b0, b1, q);
      const wear = a > 0.3 ? 1 : 0.2, j = nz.fbm(a * 9 + i * 7, b * 9, 2) * 0.012 * wear + (r() - 0.5) * 0.006 * wear;
      m.lineTo(X(a - Math.abs(j) * (a > 0.6 ? 1 : 0)), Y(b + (b < 0.5 ? 1 : -1) * Math.abs(j) * 0.6));
    }
  }
  m.closePath(); m.fill();
  t.globalCompositeOperation = 'destination-in'; t.drawImage(mc, 0, 0);
  t.globalCompositeOperation = 'source-over';
  return tc;
}

// ---- mast, yard and rigging, in silhouette --------------------------------
function rigging(ctx, W, H, S, seed) {
  const ink = '#03060a', r = rng(seed);
  ctx.save();
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round';
  const mastX = y => W * 0.064 - (y / H) * W * 0.009;           // slight rake
  const line = (x0, y0, x1, y1, w, sag = 0) => {
    ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * S, x1, y1); ctx.stroke();
  };
  const spar = (x0, y0, w0, x1, y1, w1) => {                    // a tapered spar with a faint moonlit edge
    ctx.beginPath(); ctx.moveTo(x0 - w0 / 2, y0); ctx.lineTo(x0 + w0 / 2, y0); ctx.lineTo(x1 + w1 / 2, y1); ctx.lineTo(x1 - w1 / 2, y1); ctx.closePath();
    ctx.fillStyle = ink; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(70,110,140,0.2)'; ctx.lineWidth = 5 * S;
    ctx.beginPath(); ctx.moveTo(x0 + w0 / 2 - 2 * S, y0); ctx.lineTo(x1 + w1 / 2 - 2 * S, y1); ctx.stroke();
    ctx.restore();
  };
  const capY = H * 0.5, topY = capY, headY = capY - 190 * S;
  // lower mast up to its head; topmast stepped just forward of it
  spar(mastX(headY) - 8 * S, headY, 62 * S, mastX(H) - 14 * S, H + 10, 86 * S);
  spar(mastX(-10) + 22 * S, -10, 34 * S, mastX(topY) + 26 * S, topY + 40 * S, 50 * S);
  // hoops on the lower mast
  for (const by of [0.66, 0.84]) { ctx.fillStyle = ink; ctx.fillRect(mastX(by * H) - 60 * S, by * H, 96 * S, 20 * S); }
  // cap, and the top with its rim
  ctx.fillStyle = ink;
  ctx.fillRect(mastX(headY) - 44 * S, headY - 4 * S, 104 * S, 30 * S);
  ctx.beginPath(); ctx.moveTo(mastX(topY) - 190 * S, topY - 4 * S); ctx.lineTo(mastX(topY) + 236 * S, topY - 4 * S);
  ctx.lineTo(mastX(topY) + 228 * S, topY + 18 * S); ctx.lineTo(mastX(topY) - 182 * S, topY + 18 * S); ctx.closePath(); ctx.fill();
  ctx.fillRect(mastX(topY) - 120 * S, topY + 18 * S, 250 * S, 16 * S);
  // topmast shrouds: from the rim of the top up to the hounds, with ratlines
  const hx = mastX(H * 0.13) + 30 * S, hy = H * 0.13;
  const feet = [170, 196, 222].map(d => [mastX(topY) + d * S, topY - 4 * S]);
  for (const [fx, fy] of feet) line(fx, fy, hx, hy, 5.5);
  for (let y = topY - 64 * S; y > hy + 110 * S; y -= 52 * S) {
    const k = (topY - 4 * S - y) / (topY - 4 * S - hy);
    line(lerp(feet[0][0], hx, k) - 2 * S, y, lerp(feet[2][0], hx, k) + 2 * S, y + 1 * S, 2.8, 3);
  }
  // futtock shrouds under the top, lower shrouds fanning down to the rail
  for (const d of [170, 196, 222]) line(mastX(topY) + d * S, topY + 18 * S, mastX(topY + 230 * S) + 30 * S, topY + 240 * S, 5);
  const low = [0.132, 0.156, 0.18, 0.204, 0.228].map(x => [W * x, H + 10]);
  const lx = mastX(topY) + 36 * S, ly = topY + 34 * S;
  for (const [fx, fy] of low) line(lx, ly, fx, fy, 6.5);
  for (let y = ly + 170 * S; y < H; y += 56 * S) {
    const k = (y - ly) / (H + 10 - ly);
    line(lerp(lx, low[0][0], k) - 2 * S, y, lerp(lx, low[4][0], k) + 2 * S, y + 2 * S, 3, 4);
  }
  // topsail yard, slightly cock-billed, with its sail furled along it
  const yy = H * 0.292, yx0 = -W * 0.03, yx1 = W * 0.262, tilt = -H * 0.03;
  const yardY = x => yy + ((x - yx0) / (yx1 - yx0)) * tilt;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(yx0, yardY(yx0) - 17 * S); ctx.lineTo(yx1 - 80 * S, yardY(yx1 - 80 * S) - 12 * S); ctx.lineTo(yx1, yardY(yx1) - 7 * S);
  ctx.lineTo(yx1, yardY(yx1) + 7 * S); ctx.lineTo(yx1 - 80 * S, yardY(yx1 - 80 * S) + 12 * S); ctx.lineTo(yx0, yardY(yx0) + 17 * S); ctx.closePath(); ctx.fill();
  ctx.beginPath();                                              // the furled sail: a lumpy roll gathered by gaskets
  ctx.moveTo(yx0, yardY(yx0) + 4 * S);
  const n = 15, x1f = yx1 - 120 * S;
  let px = yx0, py = yardY(yx0) - 40 * S;
  ctx.lineTo(px, py);
  for (let i = 1; i <= n; i++) {
    const x = lerp(yx0, x1f, i / n), fat = (36 + 8 * Math.sin(i * 2.3) + 7 * r()) * S * (1 - 0.6 * Math.pow(i / n, 2.5));
    const y = yardY(x) - fat * 0.72;
    ctx.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 13 * S, x, y);
    px = x; py = y;
  }
  ctx.lineTo(x1f + 30 * S, yardY(x1f + 30 * S) + 4 * S); ctx.closePath(); ctx.fill();
  // lift, and the footrope with its stirrups
  line(yx1 - 16 * S, yardY(yx1) - 5 * S, mastX(H * 0.11) + 30 * S, H * 0.11, 3.4);
  const fr = [yx1 - 36 * S, yardY(yx1) + 8 * S, mastX(yy) + 70 * S, yardY(mastX(yy) + 70 * S) + 16 * S];
  line(fr[0], fr[1], fr[2], fr[3], 3.2, 84);
  for (const q of [0.22, 0.48, 0.74]) {
    const x = lerp(fr[0], fr[2], q), yb = lerp(fr[1], fr[3], q) + 84 * S * 2 * q * (1 - q);
    line(x, yardY(x) + 10 * S, x, yb, 2.4);
  }
  // a block at the masthead for the flag line
  const bx = mastX(H * 0.07) + 50 * S, by = H * 0.074;
  line(mastX(H * 0.05) + 26 * S, H * 0.05, bx, by, 3.4);
  ctx.beginPath(); ctx.ellipse(bx, by + 8 * S, 12 * S, 18 * S, 0.5, 0, TAU); ctx.fill();
  ctx.restore();
  return [bx + 4 * S, by + 22 * S];
}

export function render(ctx, W, H, opts = {}) {
  const S = W / 3840, seed = opts.seed ?? 1;
  const nz = makeNoise(seed + 3);

  // ---- sky ----------------------------------------------------------------
  ctx.fillStyle = linearFill(ctx, 0, 0, 0, H, [[0, '#070b11'], [0.5, P.bg], [1, '#0f1d2b']]);
  ctx.fillRect(0, 0, W, H);
  const moon = [W * 0.214, H * 0.895], mr = W * 0.0155;
  glow(ctx, moon[0], moon[1], W * 0.7, '#1c3d59', 0.62);
  glow(ctx, moon[0], moon[1], W * 0.26, '#3f6883', 0.38);
  ctx.fillStyle = linearFill(ctx, 0, 0, W * 0.5, 0, [[0, 'rgba(34,66,94,0.26)'], [1, 'rgba(34,66,94,0)']]);   // haze up the left side, so the spars read
  ctx.fillRect(0, 0, W * 0.5, H);
  stars(ctx, W, H, { seed: seed + 11, count: 2300, yMax: 1.25, alpha: 0.9,
    mask: (x, y) => clamp(Math.hypot(x - moon[0], (y - moon[1]) * 1.2) / (W * 0.42) - 0.12) });
  // long bars of cloud along the horizon, darker than the glow behind them
  field(ctx, W, H, (u, v) => {
    const band = smooth(0.6, 0.93, v);
    const c = smooth(-0.05, 0.42, nz.fbm(u * 2.6 + 1.3, v * 15 + 4, 5)) * band;
    const lit = clamp(1 - Math.hypot(u - 0.214, (v - 0.895) * 1.6) / 0.42);
    return [lerp(9, 30, lit * 0.6), lerp(15, 44, lit * 0.6), lerp(22, 58, lit * 0.6), c * 205];
  }, { down: 5 });
  // the moon itself: low, soft-edged, with a bar of cloud drifting across it
  glow(ctx, moon[0], moon[1], W * 0.075, '#d6dfda', 0.3);
  const [mc, m] = layer(mr * 3, mr * 3);
  m.translate(mr * 1.5, mr * 1.5);
  m.fillStyle = radialFill(m, -mr * 0.25, -mr * 0.3, 0, mr * 1.25, [[0, '#f1ead2'], [0.6, '#dcd5bd'], [1, '#b9b7a6']]);
  m.beginPath(); m.arc(0, 0, mr, 0, TAU); m.fill();
  m.globalCompositeOperation = 'source-atop';
  const mz = makeNoise(seed + 5);
  for (let i = 0; i < 9; i++) {                                 // faint maria
    const a = i * 2.4, d = mr * (0.15 + 0.5 * Math.abs(mz.n2(i * 1.7, 3)));
    m.fillStyle = 'rgba(120,128,128,0.16)';
    m.beginPath(); m.ellipse(Math.cos(a) * d, Math.sin(a) * d, mr * (0.2 + 0.14 * Math.abs(mz.n2(i, 9))), mr * 0.16, a, 0, TAU); m.fill();
  }
  m.fillStyle = linearFill(m, 0, -mr * 0.1, 0, mr * 1.0, [[0, 'rgba(24,44,62,0)'], [0.5, 'rgba(24,44,62,0.6)'], [0.78, 'rgba(24,44,62,0.42)'], [1, 'rgba(24,44,62,0.55)']]);
  m.fillRect(-mr * 1.5, -mr * 0.1, mr * 3, mr * 1.2);
  ctx.save(); ctx.globalAlpha = 0.86; ctx.filter = `blur(${(1.6 * S).toFixed(2)}px)`;
  ctx.drawImage(mc, moon[0] - mr * 1.5, moon[1] - mr * 1.5); ctx.restore();

  // ---- a strip of sea, the moon's path on it, and a consort on the horizon --
  const hz = H * 0.94, sr = rng(seed + 17);
  ctx.fillStyle = linearFill(ctx, 0, hz, 0, H, [[0, '#0b1823'], [0.3, '#070f17'], [1, '#04080d']]);
  ctx.fillRect(0, hz, W, H - hz);
  ctx.fillStyle = linearFill(ctx, 0, hz - 14 * S, 0, hz + 3 * S, [[0, 'rgba(70,110,138,0)'], [0.8, 'rgba(70,110,138,0.2)'], [1, 'rgba(70,110,138,0)']]);
  ctx.fillRect(0, hz - 14 * S, W, 17 * S);
  for (let i = 0; i < 420; i++) {
    const d = Math.pow(sr(), 1.5), y = hz + 2 * S + d * (H - hz), x = moon[0] + sr.gauss() * (0.012 + 0.07 * d) * W;
    const len = sr.range(10, 46) * S * (0.5 + 1.4 * d);
    ctx.fillStyle = rgba('#a9c0c8', sr.range(0.05, 0.3) * (1 - 0.55 * d));
    ctx.fillRect(x - len / 2, y, len, sr.range(1.4, 2.6) * S);
  }
  drawShip(ctx, { x: W * 0.812, y: hz + 3 * S, scale: W * 0.043, hull: '#04080d', sail: '#070d14', flip: true, lights: 1, seed: 6, pennant: false });

  // ---- rigging and the flag line ------------------------------------------
  const head = rigging(ctx, W, H, S, seed + 21);
  const A = head, B = [W * 1.04, H * 0.615], sag = H * 0.075;
  const curve = q => [lerp(A[0], B[0], q), lerp(A[1], B[1], q) + sag * 4 * q * (1 - q)];
  // arc-length table
  const N = 400, tab = [[0, ...curve(0)]];
  for (let i = 1; i <= N; i++) { const p = curve(i / N), q = tab[i - 1]; tab.push([q[0] + Math.hypot(p[0] - q[1], p[1] - q[2]), p[0], p[1]]); }
  const at = s => {
    let i = 1; while (i < N && tab[i][0] < s) i++;
    const a = tab[i - 1], b = tab[i], k = clamp((s - a[0]) / (b[0] - a[0] || 1));
    return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  };
  const word = 'OMARCHY', h = W * 0.092, gap = W * 0.021, s0 = W * 0.128;
  const spots = [...word].map((ch, i) => { const s = s0 + i * (h + gap); return { ch, p: at(s), q: at(s + h) }; });

  // the line: taut between the flags, so it runs straight along each hoist
  const pts = [A];
  for (let s = 40 * S; s < s0 - 30 * S; s += 60 * S) pts.push(at(s));
  for (const f of spots) pts.push(f.p, [lerp(f.p[0], f.q[0], 0.5), lerp(f.p[1], f.q[1], 0.5)], f.q);
  for (let s = s0 + 7 * (h + gap) + 30 * S; s < tab[N][0]; s += 60 * S) pts.push(at(s));
  pts.push(B);
  drawRope(ctx, pts, 5.5 * S, '#4d4636', 'rgba(10,8,5,0.6)');

  // ---- the flags ----------------------------------------------------------
  const fr = rng(seed + 31), fz = makeNoise(seed + 33);
  spots.forEach((f, i) => {
    const Lf = h * FLY;
    const tex = flagTexture(f.ch, Lf, h, S, seed + 100 + i * 7);
    const tx = (f.q[0] - f.p[0]) / h, ty = (f.q[1] - f.p[1]) / h;
    // the fly hangs away from the line: mostly square to it, pulled toward
    // the vertical by its own weight and nudged by the breeze
    const swallow = f.ch === 'A';
    const lean = (swallow ? 2 : -6 + 14 * fr()) * Math.PI / 180;
    const dir = [-ty * 0.62 + Math.sin(lean) * 0.38, tx * 0.62 + Math.cos(lean) * 0.38], dl = Math.hypot(...dir);
    const fore = swallow ? 1.04 : 0.9 + 0.09 * fr();             // a little foreshortened as it bellies
    const uAxis = [(dir[0] / dl) * Lf * fore, (dir[1] / dl) * Lf * fore], vAxis = [f.q[0] - f.p[0], f.q[1] - f.p[1]];
    const ph = fr() * 10, ph2 = fr() * 10, ph3 = fr() * 10, amp = lerp(13, 19, fr()), sway = swallow ? 0.015 : lerp(-0.05, 0.09, fr());
    const height = (u, v) => {
      const env = 0.1 + 0.9 * smooth(0, 0.65, u);
      const wave = Math.sin(TAU * (u * 1.45 - ph + 0.13 * Math.sin(TAU * (v * 0.7 + ph2)) + 0.18 * fz.n2(u * 1.3 + ph, v * 1.3 + i)));
      const curtain = Math.sin(TAU * (v * 1.45 + u * 0.55 + ph3 + 0.22 * fz.n2(v * 2 + ph3, u * 0.7))) * (0.36 + 0.34 * u);
      return S * amp * env * (0.62 * wave + 1.25 * curtain);
    };
    const shift = (u, v) => {
      const k = Math.pow(clamp(u), 1.7), k2 = k * clamp(u);
      return [k * Lf * sway + S * 10 * Math.sin(TAU * (v * 1.1 + ph2)) * k, -k * Lf * 0.02 + S * 20 * Math.sin(TAU * (v * 1.15 + ph)) * k2];
    };
    const cloth = makeCloth({
      tex, origin: f.p, uAxis, vAxis, height, shift,
      texRect: [-M, -M, 1 + M, 1 + M],
      parallax: [0.34, -0.3], cell: 3 * S, slope: 1.0,
      key: { dir: [-0.5, -0.38, 0.78], color: [0.84, 0.84, 0.82], gamma: 1.5 },
      fill: { dir: [0.7, 0.4, 0.5], color: [0.06, 0.09, 0.14] },
      ambient: [0.2, 0.225, 0.285],
      sheen: { color: [0, 0, 0], power: 2 },
      shadow: { strength: 0.08, reach: 90 * S, soft: 70 * S, blur: 30 * S },
      occlusion: 0.1,
      weave: { nu: Math.round(Lf / (3.6 * S)), nv: Math.round(h / (3.6 * S)), amp: 0.085, slub: 0.3, seed: seed + i },
    });
    cloth.draw(ctx);
    // clips where each flag is bent onto the line
    for (const [u, v] of [[0.004, -0.012], [0.004, 1.012]]) {
      const c = cloth.project(u, v);
      ctx.fillStyle = '#0a0d10'; ctx.beginPath(); ctx.arc(c[0], c[1], 6.5 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(P.gold, 0.55); ctx.beginPath(); ctx.arc(c[0] - 1 * S, c[1] - 1 * S, 3.2 * S, 0, TAU); ctx.fill();
    }
  });

  vignette(ctx, W, H, 0.5, '#000000', 0.5);
  grain(ctx, W, H, 6, seed + 9);
}
