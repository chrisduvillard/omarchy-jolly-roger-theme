// "Jolly Roger" — the black flag itself: heavy wool bunting streaming from its
// halyard at night, lit from the hoist side, the skull and crossed cutlasses
// rippling with the cloth.
import { P, TAU, rng, makeNoise, clamp, lerp, smooth, layer, field, glow, grain, vignette, stars, linearFill } from '../lib/core.js';
import { drawEmblem } from '../lib/emblem.js';
import { makeCloth, drawRope as rope } from '../lib/cloth.js';

export const size = [3840, 2160];

const THREADS_U = 640, THREADS_V = 356;   // weave count across the flag
const M = 0.04;                           // texture margin around the cloth (cloth units)

// ---- the flag as it would lie on a table ----------------------------------
function buildFlag(Wf, Hf, S, seed) {
  const TW = Math.round(Wf * (1 + 2 * M)), TH = Math.round(Hf * (1 + 2 * M));
  const [tc, t] = layer(TW, TH);
  const X = u => (u + M) * Wf, Y = v => (v + M) * Hf;
  const nz = makeNoise(seed + 40), r = rng(seed + 41);

  // black wool: never one flat black — sun-faded, salt-stained, patchy dye
  field(t, TW, TH, (a, b) => {
    const u = a * (1 + 2 * M) - M, v = b * (1 + 2 * M) - M;
    const blot = nz.fbm(u * 3.2, v * 2.2, 4), fine = nz.fbm(u * 26, v * 15, 3);
    const fade = smooth(0.55, 1.02, u) * 0.16 + Math.max(0, nz.fbm(u * 1.4 + 7, v * 1.4, 2)) * 0.2;   // greyer toward the fly
    const k = 1 + 0.2 * blot + 0.1 * fine + fade;
    const warm = 0.5 + 0.5 * nz.fbm(u * 2 + 30, v * 2 + 11, 2);                                         // rusty vs. blue-black
    return [26 * k * (1 + 0.07 * warm), 28 * k, 32 * k * (1.04 - 0.08 * warm), 255];
  }, { down: 3 });

  // emblem: painted on by hand, so the edge wanders with the threads; the
  // paint is mottled and worn thin where the cloth has chafed
  const E = Math.round(Hf * 0.84);
  const [e0, e0x] = layer(E, E);
  drawEmblem(e0x, { x: E / 2, y: E / 2, size: E, color: '#ffffff' });
  const [ec, e] = layer(E, E);
  e.filter = `blur(${(2.2 * S).toFixed(2)}px)`;
  e.drawImage(e0, 0, 0);
  e.filter = 'none';
  {
    const img = e.getImageData(0, 0, E, E), d = img.data, pitchV = Hf / THREADS_V, pitchU = Wf / THREADS_U;
    const rowJit = new Float32Array(Math.ceil(E / pitchV) + 2).map(() => r.gauss());
    const colJit = new Float32Array(Math.ceil(E / pitchU) + 2).map(() => r.gauss());
    const rowWear = new Float32Array(rowJit.length).map(() => r());
    const [br, bg, bb] = [233, 223, 198];
    for (let y = 0, k = 0; y < E; y++) {
      const b = y / E, j = (y / pitchV) | 0;
      for (let x = 0; x < E; x++, k += 4) {
        const al = d[k + 3] / 255;
        if (al < 0.004) continue;
        const a = x / E, i = (x / pitchU) | 0;
        // edge: threshold the blurred shape with thread-aligned noise
        const wob = 0.2 * nz.n2(a * 46 + 3, b * 46 + 7) + 0.1 * rowJit[j] + 0.07 * colJit[i];
        let cov = smooth(0.38, 0.62, al + wob * (1 - Math.abs(al - 0.5) * 2) * 1.4);
        // wear: gathered in patches, running along the weft
        const patch = smooth(0.0, 0.42, nz.fbm(a * 3.1 + 50, b * 3.1 + 20, 3));
        const streak = smooth(0.18, 0.5, nz.n2(a * 26 + j * 3.7, j * 0.37)) * (rowWear[j] > 0.45 ? 1 : 0.25);
        const speck = smooth(0.2, 0.46, nz.fbm(a * 80 + 5, b * 80 + 8, 2));
        const wear = clamp(patch * (0.62 * streak + 0.5 * speck) + 0.1 * speck);
        cov *= 1 - 0.8 * wear;
        // grime: tea-brown mottling
        const g = clamp(0.1 + 0.2 * nz.fbm(a * 5 + 3, b * 5 + 9, 3) + 0.09 * nz.fbm(a * 30, b * 30 + 5, 2), 0, 0.4);
        d[k] = lerp(br, 96, g); d[k + 1] = lerp(bg, 78, g); d[k + 2] = lerp(bb, 52, g); d[k + 3] = cov * 255;
      }
    }
    e.putImageData(img, 0, 0);
  }
  t.drawImage(ec, X(0.43) - E / 2, Y(0.5) - E / 2);        // a little toward the hoist of centre

  // seams between the breadths of bunting, and the hems
  const stitch = (x0, y0, x1, y1, col, lw, dash) => {
    t.save(); t.strokeStyle = col; t.lineWidth = lw; t.setLineDash(dash); t.lineCap = 'butt';
    t.beginPath(); t.moveTo(x0, y0); t.lineTo(x1, y1); t.stroke(); t.restore();
  };
  for (const v of [0.2, 0.402, 0.598, 0.8]) {
    const y = Y(v);
    t.fillStyle = 'rgba(0,0,0,0.3)'; t.fillRect(X(0), y - 5 * S, Wf, 4 * S);
    t.fillStyle = 'rgba(120,128,140,0.07)'; t.fillRect(X(0), y - 1 * S, Wf, 7 * S);
    stitch(X(0), y + 2.5 * S, X(1), y + 2.5 * S, 'rgba(150,150,140,0.2)', 1.6 * S, [7 * S, 6 * S]);
    stitch(X(0), y + 10 * S, X(1), y + 10 * S, 'rgba(0,0,0,0.3)', 1.6 * S, [7 * S, 6 * S]);
  }
  for (const [v, d] of [[0.0115, 1], [0.9885, -1]]) {
    const y = Y(v);
    t.fillStyle = 'rgba(125,132,145,0.1)'; t.fillRect(X(0), Math.min(Y(v - d * 0.0115), y), Wf, 0.0115 * Hf);
    t.fillStyle = 'rgba(0,0,0,0.4)'; t.fillRect(X(0), y - 1.5 * S, Wf, 3.5 * S);
    stitch(X(0), y - d * 7 * S, X(1), y - d * 7 * S, 'rgba(150,150,140,0.25)', 1.6 * S, [7 * S, 6 * S]);
  }

  // canvas heading along the hoist, with the rope sewn into it
  const hw = 0.0165;
  field(t, TW, TH, (a, b) => {
    const n = nz.fbm(a * 8, b * 30, 3), n2 = nz.fbm(a * 60, b * 220 + 4, 2);
    const k = 0.74 + 0.16 * n + 0.07 * n2;
    return [176 * k, 160 * k, 126 * k, 255];
  }, { down: 2, x: X(0), y: Y(0), w: hw * Wf, h: Hf });
  t.fillStyle = 'rgba(0,0,0,0.5)'; t.fillRect(X(hw) - 1.5 * S, Y(0), 4 * S, Hf);
  stitch(X(hw) - 9 * S, Y(0), X(hw) - 9 * S, Y(1), 'rgba(60,48,30,0.55)', 1.8 * S, [8 * S, 6 * S]);
  stitch(X(0) + 24 * S, Y(0), X(0) + 24 * S, Y(1), 'rgba(60,48,30,0.4)', 1.8 * S, [8 * S, 6 * S]);
  t.fillStyle = linearFill(t, X(0), 0, X(0) + 22 * S, 0, [[0, 'rgba(255,240,210,0.0)'], [0.45, 'rgba(255,240,210,0.16)'], [1, 'rgba(0,0,0,0.2)']]);
  t.fillRect(X(0), Y(0), 22 * S, Hf);                      // the roll of the rope inside the tabling

  // ---- coverage: where there is still cloth ------------------------------
  const [mc, m] = layer(TW, TH);
  m.fillStyle = '#fff';
  m.fillRect(X(0), Y(0), Wf, Hf);
  m.globalCompositeOperation = 'destination-out';
  const pitch = Hf / THREADS_V;
  const tears = [                                          // rips running in from the fly along the weft
    { v: 0.232, len: 0.075, open: 0.02 },
    { v: 0.566, len: 0.15, open: 0.034 },
    { v: 0.79, len: 0.055, open: 0.016 },
  ];
  // how far the solid cloth has retreated from the fly edge at height v
  const edgeAt = v => {
    let f = 0.012 + 0.03 * Math.pow(Math.abs(nz.fbm(v * 7 + 3, 1.5, 3)), 1.3) + 0.004 * nz.n2(v * 60, 9);
    f += 0.1 * Math.pow(smooth(0.86, 1.0, v), 1.4) + 0.03 * Math.pow(smooth(0.1, 0, v), 2);   // the foot corner is gone
    for (const tr of tears) {
      const dv = Math.abs(v - tr.v - 0.004 * nz.n2(v * 30, tr.v * 40)) / tr.open;
      if (dv < 1) f = Math.max(f, tr.len * Math.pow(1 - dv, 2.1) + 0.012);
    }
    return f;
  };
  const sub = 3;                                           // mask rows per thread, so edges are not stair-stepped
  for (let j = -2 * sub; j < (THREADS_V + 2) * sub; j++) {
    const v = (j + 0.5) / (THREADS_V * sub);
    m.fillRect(X(1 - edgeAt(v)) + r.range(-1.5, 1.5) * S, Y(v) - pitch / sub * 0.5 - 0.3, TW, pitch / sub + 0.6);
  }
  // worn nicks along head and foot
  for (let i = 0; i < 46; i++) {
    const u = Math.pow(r(), 0.6), top = r.chance(0.5), w = r.range(0.003, 0.012) * Wf, h = r.range(0.002, 0.007) * Hf * (0.4 + u);
    m.beginPath(); m.ellipse(X(u), top ? Y(0) : Y(1), w, h, 0, 0, TAU); m.fill();
  }
  // holes: shot and wear
  const ragged = (cx, cy, rx, ry, rot, jag = 0.35) => {
    m.beginPath();
    const n = 40, ph = r() * 100;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, k = 1 + jag * nz.fbm(Math.cos(a) * 2.2 + ph, Math.sin(a) * 2.2, 3) + 0.1 * (r() - 0.5);
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      m.lineTo(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot));
    }
    m.closePath(); m.fill();
  };
  const holes = [
    [0.765, 0.335, 0.0105, 0.016, 0.3], [0.118, 0.842, 0.0066, 0.009, 1.0], [0.905, 0.66, 0.012, 0.01, 0.2],
    [0.69, 0.895, 0.02, 0.0065, -0.12], [0.842, 0.12, 0.022, 0.005, 0.1], [0.56, 0.085, 0.0045, 0.006, 0],
  ];
  for (const [u, v, a, b, rot] of holes) ragged(X(u), Y(v), a * Wf, b * Hf * (Wf / Hf), rot);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(mc, 0, 0);
  t.globalCompositeOperation = 'source-over';

  // fringe: every weft thread ends somewhere past the solid edge, a few trail
  t.lineCap = 'round';
  for (let j = 0; j < THREADS_V; j++) {
    for (let rep = 0; rep < 2; rep++) {
      const v = (j + 0.25 + 0.5 * rep) / THREADS_V, x0 = X(1 - edgeAt(v)) - 5 * S;
      const long = r.chance(0.07), len = (long ? r.range(40, 150) : 4 + 34 * Math.pow(r(), 1.8)) * S;
      const y0 = Y(v), sag = long ? r.range(-0.25, 0.55) * len : r.range(-0.08, 0.14) * len;
      const g = 0.75 + 0.5 * r();
      t.strokeStyle = `rgba(${Math.round(29 * g)},${Math.round(31 * g)},${Math.round(36 * g)},${r.range(0.75, 1)})`;
      t.lineWidth = pitch * r.range(0.26, 0.42);
      t.beginPath(); t.moveTo(x0, y0);
      t.bezierCurveTo(x0 + len * 0.4, y0 + sag * 0.08, x0 + len * 0.75, y0 + sag * 0.45, x0 + len + 5 * S, y0 + sag);
      t.stroke();
    }
  }
  for (const [u, v, a, b] of holes) {
    for (let i = 0; i < 22; i++) {
      const ang = r() * TAU, rx = a * Wf, ry = b * Wf, x0 = X(u) + Math.cos(ang) * rx * 1.15, y0 = Y(v) + Math.sin(ang) * ry * 1.15;
      const len = r.range(0.3, 1.1) * Math.max(rx, ry), dir = r.chance(0.6) ? (Math.cos(ang) > 0 ? Math.PI : 0) : (Math.sin(ang) > 0 ? -Math.PI / 2 : Math.PI / 2);
      const g = 34 + r() * 26;
      t.strokeStyle = `rgba(${g},${g + 2},${g + 6},0.85)`; t.lineWidth = r.range(0.9, 1.7) * S;
      t.beginPath(); t.moveTo(x0, y0);
      t.quadraticCurveTo(x0 + Math.cos(dir) * len * 0.5 + r.range(-3, 3) * S, y0 + Math.sin(dir) * len * 0.5 + r.range(-3, 3) * S, x0 + Math.cos(dir) * len, y0 + Math.sin(dir) * len + r.range(-4, 4) * S);
      t.stroke();
    }
  }
  return tc;
}

export function render(ctx, W, H, opts = {}) {
  const S = W / 3840, seed = opts.seed ?? 1;
  if (opts.mode === 'emblem') {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    drawEmblem(ctx, { x: W * 0.36, y: H * 0.5, size: H * 0.92, color: P.bone });
    drawEmblem(ctx, { x: W * 0.8, y: H * 0.3, size: (400 / 2160) * H * 1, color: P.bone });
    drawEmblem(ctx, { x: W * 0.8, y: H * 0.72, size: (160 / 2160) * H, color: P.gold });
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.36 - H * 0.46, H * 0.04, H * 0.92, H * 0.92);
    return;
  }
  const nz = makeNoise(seed + 7);

  // ---- night sky ----------------------------------------------------------
  ctx.fillStyle = linearFill(ctx, 0, 0, W * 0.25, H, [[0, P.bgDark], [0.45, P.bg], [1, '#0e1b28']]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 1.02, H * 0.82, W * 0.62, '#1f425f', 0.5);
  glow(ctx, W * 0.98, H * 0.2, W * 0.3, '#16304a', 0.3);
  field(ctx, W, H, (u, v) => {                                   // thin moonlit cloud
    const c = smooth(0.05, 0.6, nz.fbm(u * 3.2 + 4, v * 5.5 + 2, 5)) * smooth(0.25, 1, u);
    return [70, 104, 134, c * 70];
  }, { down: 6 });
  stars(ctx, W, H, { seed: seed + 3, count: 2600, yMax: 1.45, alpha: 0.85 });

  // ---- flag ---------------------------------------------------------------
  const origin = [W * 0.052, H * 0.052], uAxis = [W * 0.872, H * 0.058], vAxis = [-W * 0.006, H * 0.86];
  const Wf = Math.hypot(...uAxis), Hf = Math.hypot(...vAxis);
  const tex = buildFlag(Wf, Hf, S, seed);

  const fz = makeNoise(seed + 90);
  const height = (u, v) => {
    const env = 0.2 + 0.8 * smooth(-0.05, 0.55, u);
    // s runs across the folds, q along them
    const w1 = fz.fbm(u * 1.1 + 3.1, v * 1.1 + 1.7, 2);
    const s = u * 2.1 - v * 0.72 + 0.42 * w1, q = u * 0.72 + v * 2.1;
    const p1 = TAU * s + 0.9;
    const big = Math.sin(p1 + 0.25 * Math.sin(p1));
    const w2 = fz.fbm(u * 1.6 + 9.2, v * 1.6 + 4.4, 2);
    const p2 = TAU * (u * 3.9 - v * 1.25 + 0.45 * w2);
    const amp2 = 0.25 + 0.75 * smooth(-0.4, 0.5, fz.n2(u * 1.5 + 20, v * 1.5 + 7));
    const med = Math.sin(p2) * amp2;
    const small = fz.fbm(s * 3.6 + 40, q * 0.8 + 13, 2) * smooth(0.25, 0.95, u);   // ripples stretched along the folds
    // drape: folds fanning out from the head of the hoist, where the halyard takes the weight
    const ax = u * Wf, ay = (v + 0.05) * Hf, rad = Math.hypot(ax, ay) / Wf;
    const drape = Math.sin(Math.atan2(ay, ax) * 12.5 + 2.4 * fz.n2(u * 1.8 + 5, v * 1.8 + 9) + 0.6)
      * smooth(0.03, 0.3, rad) * (1 - smooth(0.4, 0.9, rad));
    return S * (env * (104 * big + 30 * med + 12 * small) + 17 * drape);
  };
  const shift = (u, v) => {
    const droop = 0.03 * Hf * u * u + 0.022 * Hf * Math.sin(TAU * (u * 0.85 + 0.05)) * u;
    const taper = (v - 0.5) * -0.08 * Hf * u;
    const flut = S * 34 * fz.fbm(v * 3 + 50, u * 2, 2) * u * u;
    return [flut, droop + taper];
  };
  const clay = opts.mode === 'clay';
  let ftex = tex;
  if (clay) {                                             // lighting study: plain grey cloth
    const [cc, c2] = layer(tex.width, tex.height);
    c2.fillStyle = '#5a5a5a'; c2.fillRect(0, 0, tex.width, tex.height);
    c2.globalCompositeOperation = 'destination-in'; c2.drawImage(tex, 0, 0);
    ftex = cc;
  }
  const cloth = makeCloth({
    tex: ftex, origin, uAxis, vAxis, height, shift,
    texRect: [-M, -M, 1 + M, 1 + M],
    parallax: [0.55, -0.46], cell: 5 * S, slope: 0.9,
    key: { dir: [-0.8, -0.3, 0.55], color: [2.0, 1.74, 1.4], gamma: 1.95 },
    fill: { dir: [0.85, 0.25, 0.45], color: [0.09, 0.16, 0.27] },
    ambient: [0.08, 0.1, 0.14],
    sheen: { color: [26, 25, 25], power: 3 },
    shadow: { strength: 0.45, reach: 300 * S, soft: 110 * S, blur: 50 * S },
    occlusion: 0.5,
    weave: { nu: THREADS_U, nv: THREADS_V, amp: 0.17, slub: 0.3, seed: seed + 5 },
  });

  // mast: just a sliver of it at the edge of the frame, behind the cloth
  ctx.save();
  const mx = W * 0.0105, mw = W * 0.0215, lean = W * 0.007;
  const mastPath = () => { ctx.beginPath(); ctx.moveTo(mx - lean / 2, -5); ctx.lineTo(mx + mw - lean / 2, -5); ctx.lineTo(mx + mw + lean / 2, H + 5); ctx.lineTo(mx + lean / 2, H + 5); ctx.closePath(); };
  mastPath();
  ctx.fillStyle = linearFill(ctx, mx, 0, mx + mw, 0, [[0, '#191b1d'], [0.28, '#25231f'], [0.6, '#100f0e'], [1, '#040506']]);
  ctx.fill();
  ctx.clip();
  const mr = rng(seed + 60);
  for (let i = 0; i < 70; i++) {                              // grain of the spar
    const x = mx + mr() * mw, y = mr() * H, l = mr.range(0.06, 0.3) * H;
    ctx.strokeStyle = mr.chance(0.5) ? 'rgba(0,0,0,0.22)' : 'rgba(120,104,80,0.05)'; ctx.lineWidth = mr.range(1, 2.6) * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (lean * l) / H + mr.range(-2, 2) * S, y + l); ctx.stroke();
  }
  for (const by of [0.275, 0.84]) {                           // iron hoops
    ctx.fillStyle = linearFill(ctx, mx, 0, mx + mw, 0, [[0, '#2b2d30'], [0.3, '#3a3b3c'], [0.7, '#141516'], [1, '#050607']]);
    ctx.fillRect(0, by * H, W * 0.05, 26 * S);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, by * H + 26 * S, W * 0.05, 5 * S);
  }
  ctx.restore();

  cloth.draw(ctx);

  // halyard: up to the truck and down to the deck from the two ends of the hoist
  const top = cloth.project(0.0075, 0.0), bot = cloth.project(0.0075, 1.0);
  const ropeCol = '#75674a', ropeDark = 'rgba(22,17,10,0.6)';
  rope(ctx, [[top[0] + 2 * S, top[1] + 26 * S], [top[0] - 3 * S, top[1] - 60 * S], [top[0] - 10 * S, top[1] - 130 * S], [top[0] - 30 * S, -20 * S]], 10 * S, ropeCol, ropeDark);
  rope(ctx, [[bot[0] + 2 * S, bot[1] - 26 * S], [bot[0] + 2 * S, bot[1] + 40 * S], [bot[0] - 8 * S, bot[1] + 120 * S], [bot[0] - 34 * S, H + 20 * S]], 10 * S, '#62563f', ropeDark);
  // whipping where the rope leaves the tabling, and the wooden toggle at the head
  for (const [p, d] of [[top, -1], [bot, 1]]) {
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? '#8d7f60' : '#6b5f47'; ctx.lineWidth = 3.4 * S; ctx.lineCap = 'round';
      const y = p[1] + d * (6 + i * 4.2) * S;
      ctx.beginPath(); ctx.moveTo(p[0] - 8 * S, y + 1.5 * S); ctx.lineTo(p[0] + 9 * S, y - 1.5 * S); ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(top[0] - 6 * S, top[1] - 62 * S); ctx.rotate(-0.22);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(-33 * S, -8 * S, 70 * S, 22 * S, 10 * S); ctx.fill();
  ctx.fillStyle = linearFill(ctx, 0, -10 * S, 0, 10 * S, [[0, '#8a6c44'], [0.45, '#6a4f30'], [1, '#2c2014']]);
  ctx.beginPath(); ctx.roundRect(-34 * S, -10 * S, 68 * S, 20 * S, 9 * S); ctx.fill();
  ctx.fillStyle = 'rgba(20,14,8,0.55)';
  for (const tx of [-6, 6]) ctx.fillRect(tx * S - 1.5 * S, -10 * S, 3 * S, 20 * S);
  ctx.restore();

  vignette(ctx, W, H, 0.5, '#000000', 0.5);
  grain(ctx, W, H, 6, seed + 9);
}
