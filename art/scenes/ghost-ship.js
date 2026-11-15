// Ghost Ship — a derelict under rags of canvas, coming out of a fog bank on a
// flat, windless sea. Cold slate and sea-green; the lanterns are the only warmth.
import { TAU, clamp, lerp, smooth, P, rng, makeNoise, hexToRgb, rgba, ramp, layer, glow, field, grain, vignette } from '../lib/core.js';
import { drawShip, drawShipBowOn, shipLayer } from '../lib/ship.js';

export const size = [3840, 2160];
export const seed = 23;

// Luminance -> fog colour: near-black slate, through sea-green grey, to pale moonlit mist.
const FOG = [[0, '#04080b'], [0.16, '#091318'], [0.32, '#11222a'], [0.5, '#20373c'], [0.66, '#395355'], [0.8, '#5f7a76'], [0.91, '#93aba0'], [1, '#d3decb']];
const css = a => `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})`;
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---- air and water ----------------------------------------------------------
function makeAir(W, H, nz) {
  const yh = 0.612 * H;
  const moon = { x: 0.405 * W, y: 0.215 * H }, back = { x: 0.615 * W, y: yh - 0.16 * H };
  function sky(x, y) {
    const v = (yh - y) / H, nx = x / H, ny = y / H, vp = Math.max(0, v);
    const n = nz.fbm(nx * 0.8 + 2.3, ny * 3.0 + 1.1, 5), n2 = nz.fbm(nx * 2.4 - 5, ny * 6.5 + 7, 4);
    let l = 0.115 + 0.53 * Math.exp(-Math.pow(vp / 0.30, 1.5));                    // the bank is brightest low down
    l += n * 0.20 * (0.35 + smooth(0.5, 0.0, v)) + n2 * 0.05;
    l += 0.15 * smooth(0.42, 0.95, x / W) * Math.exp(-Math.pow(vp / 0.45, 2)) * (0.7 + 0.9 * n);   // the bank she came out of
    l += 0.105 * Math.exp(-Math.pow((x - back.x) / (0.30 * H), 2) - Math.pow((y - back.y) / (0.27 * H), 2)) * (0.8 + 0.6 * n2);
    const md = Math.hypot(x - moon.x, y - moon.y) / H;
    const veil = clamp(0.70 + 0.60 * nz.fbm(nx * 1.5 + 8, ny * 4.2 - 3, 4), 0.2, 1.3);
    l += (0.24 * Math.exp(-Math.pow(md / 0.38, 2)) + 0.16 * Math.exp(-Math.pow(md / 0.13, 2))) * veil;
    if (md < 0.05) l += 0.19 * smooth(0.040, 0.022, md) * clamp(veil) * (0.45 + 0.55 * smooth(-0.35, 0.3, nz.fbm(nx * 2.6 + 31, ny * 17 + 5, 3)));   // the disc, barred by drifting vapour
    return l;
  }
  function lum(x, y) {
    if (y <= yh) return sky(x, y);
    const d = (y - yh) / H;
    // still water: a mirror, barely creased by a long slow swell
    const sw = nz.fbm((x / H) * 0.45 + 4, d * 26 + 2, 3) * 0.010 * (0.25 + d * 7);
    const dx = nz.n2((x / H) * 1.3, d * 46) * 0.006 * H * (0.2 + d * 4);
    let l = sky(x + dx, yh - (d * 1.30 + sw) * H) * lerp(1, 0.84, smooth(0, 0.06, d));
    l += nz.fbm((x / H) * 0.7 + 11, d * 70, 3) * 0.022 * smooth(0.0, 0.12, d);
    return l * lerp(1, 0.30, smooth(0.0, 0.40, d));
  }
  return { yh, moon, sky, lum };
}

// ---- the derelict ---------------------------------------------------------------
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Ship space: X along the keel (bow +), Y athwart (+ is the side we see), Z up;
// 1 unit = mainmast height. Drawn through a weak-perspective three-quarter view,
// so `mirror` (Z -> -Z) gives the true reflection in the water.
function derelict(c, o) {
  const S = o.S, zs = o.mirror ? -1 : 1, r = rng(o.seed);
  const sn = Math.sin(o.yaw), cs = Math.cos(o.yaw);
  const pr = (X, Y, Z) => {
    const lat = -X * sn + Y * cs, dep = -X * cs - Y * sn, p = 1 / (1 + dep * 0.27);
    return [o.x + lat * p * S, o.y - (zs * Z * p + dep * 0.034) * S, dep, p];
  };
  const haze = dep => clamp(0.03 + (dep + 0.55) * 0.32) * o.haze;
  const tone = (dep, base = o.dark) => css(mixA(base, o.fog, haze(dep)));
  const poly = pts => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
  c.save();
  c.translate(o.x, o.y); c.rotate(zs * o.heel); c.translate(-o.x, -o.y);          // she lists a little
  c.lineCap = 'round'; c.lineJoin = 'round';

  // --- hull
  const hLow = X => 0.1176 * (1 + 0.26 * Math.pow(Math.abs(X) / 0.53, 2.2));                // the sheer of the main planking
  const hDeck = X => Math.max(hLow(X), 1.2 * (X > 0.30 ? 0.128 + 0.014 * smooth(0.3, 0.5, X) : X > -0.15 ? 0.098 : X > -0.37 ? 0.130 : 0.162));
  const bDeck = X => 1.12 * (X > 0.08 ? 0.135 * Math.pow(Math.max(0, 1 - Math.pow((X - 0.08) / 0.43, 2.6)), 0.5) : lerp(0.135, 0.096, smooth(0.0, -0.53, X)));
  const bWl = X => 1.12 * (X > 0.02 ? 0.128 * Math.pow(Math.max(0, 1 - Math.pow((X - 0.02) / 0.455, 1.9)), 0.62) : 0.128 * Math.pow(Math.max(0, 1 - Math.pow((0.02 - X) / 0.535, 2.6)), 0.6));
  const section = X => {
    const bw = bWl(X), bd = bDeck(X), bm = Math.max(bw, bd) * 1.045, h = hDeck(X);
    return [pr(X, bw, 0), pr(X, bm, 0.05), pr(X, bd, h), pr(X, -bd, h), pr(X, -bm, 0.05), pr(X, -bw, 0)];
  };
  let prev = section(-0.53);
  for (let X = -0.52; X <= 0.512; X += 0.008) {
    const cur = section(X);
    c.fillStyle = tone(cur[0][2]);
    poly(convexHull(prev.concat(cur))); c.fill();
    prev = cur;
  }
  // the planking as a lofted surface, lit faintly from the moon side so the turn of the bow reads
  const breadth = (X, f) => { const bw = bWl(X), bd = bDeck(X), bm = Math.max(bw, bd) * 1.05; return f < 0.4 ? lerp(bw, bm, smooth(0, 0.4, f)) : lerp(bm, bd * 0.97, smooth(0.4, 1, f)); };
  {
    const NX = 200, NL = 8, NZ = NL + 1, quads = [], Lk = [-0.80, 0.30, -0.52];
    const P3 = (i, j, sgn) => { const X = lerp(-0.53, 0.512, i / NX), f = Math.min(1, j / NL); return [X, sgn * breadth(X, f), j > NL ? hDeck(X) : f * hLow(X)]; };
    for (const sgn of [1, -1]) for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const A = P3(i, j, sgn), B = P3(i + 1, j, sgn), D = P3(i, j + 1, sgn), E = P3(i + 1, j + 1, sgn);
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (sgn > 0) n = n.map(v => -v);
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-9) continue;
      const nv = [(-n[0] * sn + n[1] * cs) / nl, n[2] / nl, (-n[0] * cs - n[1] * sn) / nl];   // across, up, away
      if (nv[2] > 0.03) continue;
      const q = [pr(...A), pr(...B), pr(...E), pr(...D)];
      const I = clamp(0.04 + 0.40 * Math.max(0, nv[0] * Lk[0] + nv[1] * Lk[1] + nv[2] * Lk[2]) + 0.06 * Math.max(0, nv[1]));
      quads.push({ q, dep: (q[0][2] + q[2][2]) / 2, I, j });
    }
    quads.sort((A, B) => B.dep - A.dep);
    for (const k of quads) {
      const col = css(mixA(mixA(o.dark, o.fog, haze(k.dep)), o.lit, k.I * 0.8));
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1; poly(k.q); c.fill(); c.stroke();
    }
    for (const k of quads) {
      const wale = k.j === 3 || k.j === 6;
      c.strokeStyle = rgba('#010305', wale ? 0.5 : 0.2); c.lineWidth = (wale ? 0.0030 : 0.0011) * S;
      c.beginPath(); c.moveTo(k.q[0][0], k.q[0][1]); c.lineTo(k.q[1][0], k.q[1][1]); c.stroke();
      if (k.j === NZ - 1 && Math.abs(k.q[2][0] - k.q[3][0]) > Math.abs(k.q[2][1] - k.q[3][1]) * 1.5) { c.strokeStyle = rgba('#93aba0', 0.08 + 0.2 * k.I); c.lineWidth = 0.0022 * S; c.beginPath(); c.moveTo(k.q[3][0], k.q[3][1]); c.lineTo(k.q[2][0], k.q[2][1]); c.stroke(); }
    }
  }
  // knee of the head and cutwater, dark against the lit cheek
  c.fillStyle = tone(pr(0.52, 0, 0)[2]);
  poly([[0.468, 0], [0.512, 0.03], [0.555, 0.09], [0.60, 0.175], [0.585, 0.193], [0.54, 0.176], [0.505, 0.168], [0.498, 0.10], [0.482, 0.04]].map(([X, Z]) => pr(X, 0, Z))); c.fill();
  // gunports along the side we can see; a couple still show a light
  const ports = [];
  for (let i = 0; i < 9; i++) {
    const X = -0.36 + i * 0.082, b = breadth(X, 0.07 / hLow(X)) * 1.003, lit = o.litPorts.includes(i);
    const q = [pr(X - 0.012, b, 0.058), pr(X + 0.012, b, 0.058), pr(X + 0.012, b, 0.082), pr(X - 0.012, b, 0.082)];
    c.fillStyle = lit ? rgba(o.light, 0.55) : rgba('#010305', 0.75); poly(q); c.fill();
    if (lit) ports.push({ x: (q[0][0] + q[2][0]) / 2, y: (q[0][1] + q[2][1]) / 2, k: 0.26 });
  }
  // taffrail, stern lantern and its post
  const lan = pr(-0.545, 0, 0.255);
  c.strokeStyle = tone(lan[2]); c.lineWidth = 0.006 * S;
  c.beginPath(); c.moveTo(...pr(-0.53, 0, 0.19)); c.lineTo(lan[0], lan[1] + zs * 0.012 * S); c.stroke();
  c.fillStyle = tone(lan[2]); c.beginPath(); c.ellipse(lan[0], lan[1], 0.008 * S, 0.012 * S, 0, 0, TAU); c.fill();
  // poop and forecastle rails
  c.lineWidth = 0.0022 * S;
  for (const [x0, x1, rail] of [[-0.53, -0.38, 0.03], [0.31, 0.47, 0.022]]) for (const side of [-1, 1]) {
    c.strokeStyle = tone(pr((x0 + x1) / 2, side * 0.1, 0)[2]);
    c.beginPath(); c.moveTo(...pr(x0, side * bDeck(x0), hDeck(x0) + rail)); c.lineTo(...pr(x1, side * bDeck(x1), hDeck(x1) + rail)); c.stroke();
    for (let X = x0; X <= x1 + 0.001; X += 0.025) { c.beginPath(); c.moveTo(...pr(X, side * bDeck(X), hDeck(X))); c.lineTo(...pr(X, side * bDeck(X), hDeck(X) + rail)); c.stroke(); }
  }

  // --- spars and rigging
  const line = (a, b, w = 0.0015, al = 0.8) => { c.globalAlpha = al; c.lineWidth = Math.max(0.6, w * S * (a[3] + b[3]) / 2); c.strokeStyle = tone((a[2] + b[2]) / 2); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.globalAlpha = 1; };
  const slack = (a, b, sag, w = 0.0014, al = 0.75) => { c.globalAlpha = al; c.lineWidth = Math.max(0.6, w * S); c.strokeStyle = tone((a[2] + b[2]) / 2); c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + zs * sag * S * 2, b[0], b[1]); c.stroke(); c.globalAlpha = 1; };
  const dangle = (a, len, sway = 0, w = 0.0014, al = 0.75) => { c.globalAlpha = al; c.lineWidth = Math.max(0.6, w * S); c.strokeStyle = tone(a[2]); c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(a[0] + sway * S * 0.2, a[1] + zs * len * S * 0.6, a[0] + sway * S, a[1] + zs * len * S); c.stroke(); c.globalAlpha = 1; };
  const spar = (a, b, w0, w1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ha = (w0 * S * a[3]) / 2, hb = (w1 * S * b[3]) / 2;
    c.fillStyle = tone((a[2] + b[2]) / 2);
    poly([[a[0] + nx * ha, a[1] + ny * ha], [b[0] + nx * hb, b[1] + ny * hb], [b[0] - nx * hb, b[1] - ny * hb], [a[0] - nx * ha, a[1] - ny * ha]]); c.fill();
  };

  const MASTS = [
    { n: 'mizzen', X: -0.315, h: 0.80, k: 0.74, cut: 1 },
    { n: 'main', X: -0.035, h: 1.0, k: 1.0, cut: 1 },
    { n: 'fore', X: 0.275, h: 0.90, k: 0.9, cut: 0.775 },          // topgallant mast gone by the board
  ];
  const ROWS = [[0.115, 0.36, 0.60, 0.56], [0.385, 0.65, 0.53, 0.41], [0.675, 0.85, 0.385, 0.285], [0.87, 0.975, 0.265, 0.19]];
  const mX = (m, f) => m.X - 0.035 * f * m.h;                          // rake
  const mAt = (m, f, Y = 0) => pr(mX(m, f), Y, m.h * f);
  const deckAt = m => pr(m.X, 0, hDeck(m.X));

  // bowsprit and head gear
  const bs0 = [0.455, 0.168], bs1 = [0.800, 0.318], bs2 = [0.955, 0.376];
  const bsAt = t => (t <= 1 ? pr(lerp(bs0[0], bs1[0], t), 0, lerp(bs0[1], bs1[1], t)) : pr(lerp(bs1[0], bs2[0], t - 1), 0, lerp(bs1[1], bs2[1], t - 1)));
  spar(bsAt(0), bsAt(1), 0.017, 0.011); spar(bsAt(0.8), bsAt(2), 0.008, 0.004);
  const striker = pr(0.80, 0, 0.225);
  line(bsAt(1), striker, 0.003); line(striker, pr(0.535, 0, 0.06), 0.0016); line(striker, bsAt(2), 0.0013); line(bsAt(0.55), pr(0.53, 0, 0.08), 0.0018);

  const lights = [];
  const [sl, sx] = o.sailLayer;
  MASTS.forEach((m, mi) => {
    const fore = MASTS[mi + 1];
    const top = mAt(m, 0.395), xt = mAt(m, 0.675), tg = mAt(m, Math.min(0.88, m.cut));
    // shrouds and ratlines, both sides
    for (const side of [1, -1]) {
      const ends = [];
      for (let i = 0; i < 5; i++) { const X = m.X - 0.012 - i * 0.022 * m.k; ends.push(pr(X, side * bDeck(X), hDeck(X) + 0.004)); }
      ends.forEach((e, i) => { if (!(side < 0 && i === 3 && mi === 1)) line(top, e, 0.0017, 0.8); });
      for (let j = 1; j < 12; j++) { const u = j / 12, a = [lerp(top[0], ends[0][0], u), lerp(top[1], ends[0][1], u), top[2], top[3]], b = [lerp(top[0], ends[4][0], u), lerp(top[1], ends[4][1], u), top[2], top[3]]; line(a, b, 0.0009, 0.6); }
      // topmast shrouds to the edge of the top, and backstays
      for (let i = 0; i < 3; i++) line(xt, pr(mX(m, 0.395) - i * 0.012 * m.k, side * 0.034 * m.k, m.h * 0.395), 0.0011, 0.7);
      if (r.chance(0.8)) line(xt, pr(m.X - 0.15 * m.k, side * bDeck(m.X - 0.15), hDeck(m.X - 0.15)), 0.0012, 0.65);
      if (m.cut >= 1 && r.chance(0.7)) line(tg, pr(m.X - 0.19 * m.k, side * bDeck(m.X - 0.19), hDeck(m.X - 0.19)), 0.0011, 0.6);
    }
    // stays running forward; the dead ones hang slack
    const fwd = fore ? [fore.X + 0.01, hDeck(fore.X)] : null;
    const stayTo = [
      fore ? pr(fwd[0], 0, fwd[1]) : bsAt(0.45),
      fore ? mAt(fore, 0.395) : bsAt(1.0),
      fore ? mAt(fore, 0.675) : bsAt(2.0),
    ];
    [[top, 0], [xt, 1], [tg, 2]].forEach(([from, i]) => {
      if (i === 2 && m.cut < 1) { dangle(from, 0.20, -0.03); return; }
      if (r.chance(0.72)) line(from, stayTo[i], 0.0016, 0.75); else slack(from, stayTo[i], r.range(0.03, 0.07));
    });

    // the mast itself, in three diminishing lengths
    const segs = [[0, 0.41, 0.018, 0.013], [0.37, 0.69, 0.011, 0.008], [0.655, 1.0, 0.0072, 0.0035]];
    for (const [f0, f1, w0, w1] of segs) {
      if (f0 >= m.cut) continue;
      const fe = Math.min(f1, m.cut);
      spar(f0 === 0 ? deckAt(m) : mAt(m, f0), mAt(m, fe), w0 * m.k, lerp(w0, w1, (fe - f0) / (f1 - f0)) * m.k);
    }
    if (m.cut < 1) {
      // splintered stump, and the lost topgallant yard hanging by its lift
      const s = mAt(m, m.cut), w = 0.006 * S * m.k;
      c.fillStyle = tone(s[2]); poly([[s[0] - w, s[1] + zs * w], [s[0] - w * 0.4, s[1] - zs * w * 3.2], [s[0] + w * 0.1, s[1] - zs * w * 1.1], [s[0] + w * 0.8, s[1] - zs * w * 2.2], [s[0] + w, s[1] + zs * w]]); c.fill();
    } else { const t = mAt(m, 1); c.fillStyle = tone(t[2]); c.beginPath(); c.arc(t[0], t[1] - zs * 0.004 * S, 0.0048 * S, 0, TAU); c.fill(); }
    // tops and crosstrees
    for (const [f, hw] of [[0.395, 0.036], [0.675, 0.020]]) { if (f < m.cut) spar(pr(mX(m, f), -hw * m.k, m.h * f), pr(mX(m, f), hw * m.k, m.h * f), 0.007, 0.007); }

    // yards and what is left of the canvas
    sx.clearRect(0, 0, sl.width, sl.height);
    const sailCol = css(mixA(o.sail, o.fog, haze(top[2]) * 0.9));
    ROWS.forEach((row, i) => {
      if (m.n === 'mizzen' && (i === 0 || i === 3)) return;
      const [f0, f1, wf, wh] = row;
      if (f1 > m.cut) return;
      const st = o.state[`${m.n}${i}`] ?? {};
      const beta = (st.brace ?? 0) + o.trim + r.range(-0.07, 0.07), gam = st.tilt ?? r.range(-0.035, 0.035);
      const hw = (wh * m.k * 1.12) / 2, Zy = m.h * f1 - (st.drop ?? 0), Xm = mX(m, f1);
      const yAt = t => pr(Xm + t * Math.sin(beta) * Math.cos(gam), t * Math.cos(beta) * Math.cos(gam), Zy + t * Math.sin(gam));
      const A = yAt(-hw), B = yAt(hw);
      spar(yAt(-hw), yAt(0), 0.0042 * m.k, 0.0075 * m.k); spar(yAt(0), yAt(hw), 0.0075 * m.k, 0.0042 * m.k);
      // lifts from the yardarms up to the mast
      const up = mAt(m, Math.min(m.cut, f1 + 0.13));
      for (const e of [A, B]) { if (r.chance(0.7)) line(e, up, 0.0011, 0.6); else dangle(e, r.range(0.04, 0.16), r.range(-0.01, 0.01)); }
      // what canvas is left hangs limp from the yard: one cloth, rent upward from the foot
      const drop = (f1 - f0) * m.h * S * A[3], wpx = B[0] - A[0];
      const amount = st.bare ? 0.16 : st.amount ?? 1, ph = r() * 40, n1 = x => o.nz.n2(x, ph);
      const tears = [];
      for (let q = r.int(6, 11); q > 0; q--) tears.push({ t: r.range(-0.95, 0.95), w: r.range(0.02, 0.13), d: r.chance(0.5) ? r.range(0.86, 1.06) : r.range(0.2, 0.75) });
      if (!st.gaps && r.chance(0.6)) tears.push({ t: r.range(-0.7, 0.7), w: r.range(0.14, 0.30), d: 1.1 });
      for (const g of st.gaps ?? []) tears.push({ t: g[0], w: g[1], d: 1.1 });                 // whole cloths carried away
      const lenAt = t => {
        let base = lerp(0.42, 1.0, clamp(0.5 + 0.75 * n1(t * 1.9 + 3))) * amount;
        if (st.side) base *= lerp(0.28, 1.08, clamp(0.5 + st.side * t * 0.9));
        let cut = 0;
        for (const k of tears) cut = Math.max(cut, k.d * Math.pow(Math.max(0, 1 - Math.abs(t - k.t) / k.w), 0.75));
        const left = Math.max(0, base * (1 - Math.min(1, cut)));
        return Math.max(0.012, left + (0.045 * n1(t * 21 + 7) + 0.025 * n1(t * 57)) * Math.min(1, left * 4));
      };
      const NS = Math.max(24, Math.round(Math.abs(wpx) / (0.0035 * S))), pts = [yAt(-0.97 * hw), yAt(0.97 * hw)], foot = [];
      for (let q = NS; q >= 0; q--) {
        const t = lerp(-0.97, 0.97, q / NS), top = yAt(t * hw), len = lenAt(t), f = Math.min(1, len);
        const px = top[0] - t * 0.045 * Math.abs(wpx) * f + Math.sin(ph + t * 6.5) * 0.005 * S * f, py = top[1] + zs * len * drop;
        pts.push([px, py]); foot.push([px, py, len, top]);
      }
      sx.fillStyle = sailCol;
      sx.beginPath(); pts.forEach((q, k) => (k ? sx.lineTo(q[0], q[1]) : sx.moveTo(q[0], q[1]))); sx.closePath(); sx.fill();
      // folds: the cloth hangs in soft vertical pleats
      sx.save(); sx.globalCompositeOperation = 'source-atop';
      for (let q = Math.round(Math.abs(wpx) / (0.022 * S)); q > 0; q--) {
        const k = foot[r.int(1, foot.length - 2)], fw = r.range(0.004, 0.009) * S, dark = r.chance(0.6);
        const g = sx.createLinearGradient(k[3][0] - fw, 0, k[3][0] + fw, 0), cc = dark ? '2,6,8' : '170,196,184';
        g.addColorStop(0, `rgba(${cc},0)`); g.addColorStop(0.5, `rgba(${cc},${dark ? 0.20 : 0.07})`); g.addColorStop(1, `rgba(${cc},0)`);
        const y0 = k[3][1], y1 = k[1] + zs * 0.02 * S;
        sx.fillStyle = g; sx.fillRect(k[3][0] - fw, Math.min(y0, y1), fw * 2, Math.abs(y1 - y0));
      }
      sx.restore();
      // rents and holes
      sx.save(); sx.globalCompositeOperation = 'destination-out';
      for (let q = r.int(1, 4); q > 0; q--) {
        const k = foot[r.int(1, foot.length - 2)];
        if (k[2] < 0.3) continue;
        sx.beginPath(); sx.ellipse(k[3][0] + r.range(-0.01, 0.01) * S, k[3][1] + zs * k[2] * drop * r.range(0.22, 0.8), r.range(0.003, 0.010) * S, r.range(0.014, 0.07) * S, r.range(-0.14, 0.14), 0, TAU); sx.fill();
      }
      sx.restore();
      for (let q = r.int(1, 3); q > 0; q--) { const k = foot[r.int(1, foot.length - 2)]; dangle([k[0], k[1], A[2], A[3]], r.range(0.02, 0.09), r.range(-0.006, 0.006), 0.001, 0.55); }
    });
    c.save(); c.globalAlpha = o.sailAlpha; c.drawImage(sl, 0, 0); c.restore();
    if (m.n === 'fore') {
      // the lost topgallant yard, hanging askew by one lift
      const hang = mAt(m, 0.675, 0.02), e0 = [hang[0] + 0.035 * S, hang[1] + zs * 0.06 * S, hang[2], hang[3]], e1 = [e0[0] + 0.05 * S, e0[1] + zs * 0.19 * S, hang[2], hang[3]];
      line(hang, e0, 0.0012, 0.7); spar(e0, e1, 0.005, 0.004);
      c.fillStyle = sailCol; c.globalAlpha = o.sailAlpha;
      poly([[e0[0] + 0.004 * S, e0[1] + zs * 0.03 * S], [e1[0], e1[1]], [e1[0] - 0.012 * S, e1[1] + zs * 0.07 * S], [e0[0] + 0.02 * S, e0[1] + zs * 0.15 * S], [e0[0] + 0.012 * S, e0[1] + zs * 0.10 * S], [e0[0] - 0.006 * S, e0[1] + zs * 0.12 * S]]); c.fill(); c.globalAlpha = 1;
    }
    if (m.n === 'main') {
      // a pennant, limp at the truck
      const t = mAt(m, 1);
      c.fillStyle = sailCol; c.globalAlpha = o.sailAlpha;
      poly([[t[0], t[1]], [t[0] + 0.012 * S, t[1] + zs * 0.012 * S], [t[0] + 0.020 * S, t[1] + zs * 0.07 * S], [t[0] + 0.011 * S, t[1] + zs * 0.115 * S], [t[0] + 0.013 * S, t[1] + zs * 0.07 * S], [t[0] + 0.004 * S, t[1] + zs * 0.03 * S]]); c.fill(); c.globalAlpha = 1;
    }
  });
  // a rag of jib still bent to the fore topmast stay
  {
    const fm = MASTS[2], a = mAt(fm, 0.675), b = bsAt(1.0), pts = [], N = 14;
    for (let i = 0; i <= N; i++) { const f = lerp(0.22, 0.80, i / N); pts.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]); }
    for (let i = N; i >= 0; i--) { const f = lerp(0.22, 0.80, i / N), e = i / N, len = Math.sin(e * Math.PI) ** 0.7 * (0.10 + 0.07 * r()) * (i % 2 ? 1 : 0.62) * S; pts.push([lerp(a[0], b[0], f) + 0.01 * S * e, lerp(a[1], b[1], f) + zs * len]); }
    c.fillStyle = css(mixA(o.sail, o.fog, haze(a[2]) * 0.9)); c.globalAlpha = o.sailAlpha; poly(pts); c.fill(); c.globalAlpha = 1;
  }
  // loose ends everywhere
  for (let i = 0; i < 9; i++) { const m = r.pick(MASTS), f = r.range(0.3, Math.min(0.9, m.cut)); dangle(mAt(m, f, r.range(-0.03, 0.03)), r.range(0.06, 0.24), r.range(-0.02, 0.02), 0.0012, 0.6); }
  dangle(bsAt(2), 0.11, 0.004); dangle(bsAt(1.45), 0.07, -0.004); slack(bsAt(1.9), bsAt(0.7), 0.035);

  // anchor, a-cockbill under the cathead
  {
    const X = 0.385, b = bDeck(X), ch = pr(X, b + 0.028, hDeck(X) + 0.004), root = pr(X, b * 0.9, hDeck(X) + 0.004);
    spar(root, ch, 0.008, 0.007);
    const ax = ch[0], ay = ch[1] + zs * 0.058 * S, a = 0.050 * S * ch[3];
    c.strokeStyle = tone(ch[2]); c.fillStyle = tone(ch[2]);
    c.lineWidth = 0.0016 * S; c.beginPath(); c.moveTo(ch[0], ch[1]); c.lineTo(ax, ay); c.stroke();
    c.save(); c.translate(ax, ay); c.rotate(zs * 0.10); c.scale(1, zs);
    c.lineWidth = a * 0.085; c.beginPath(); c.arc(0, a * 0.05, a * 0.05, 0, TAU); c.stroke();
    c.lineWidth = a * 0.10; c.beginPath(); c.moveTo(0, a * 0.1); c.lineTo(0, a); c.stroke();
    c.lineWidth = a * 0.075; c.beginPath(); c.moveTo(-a * 0.24, a * 0.2); c.lineTo(a * 0.24, a * 0.2); c.stroke();
    c.lineWidth = a * 0.10; c.beginPath(); c.moveTo(-a * 0.36, a * 0.70); c.quadraticCurveTo(-a * 0.30, a * 1.0, 0, a); c.quadraticCurveTo(a * 0.30, a * 1.0, a * 0.36, a * 0.70); c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * a * 0.36, a * 0.60); c.lineTo(s * a * 0.45, a * 0.76); c.lineTo(s * a * 0.28, a * 0.78); c.closePath(); c.fill(); }
    c.restore();
  }
  // lanterns: one slung in the fore shrouds, one on the taffrail
  const fl = pr(0.262, 0.095, 0.292);
  line(pr(0.262, 0.078, 0.33), [fl[0], fl[1] - zs * 0.012 * S, fl[2], fl[3]], 0.0014, 0.8);
  c.fillStyle = tone(fl[2]); c.beginPath(); c.ellipse(fl[0], fl[1], 0.0075 * S, 0.012 * S, 0, 0, TAU); c.fill();
  lights.push({ x: fl[0], y: fl[1], k: 1, dep: fl[2] }, { x: lan[0], y: lan[1], k: 0.6, dep: lan[2] }, ...ports);
  c.restore();
  const ca = Math.cos(zs * o.heel), sa = Math.sin(zs * o.heel);
  return lights.map(l => ({ ...l, x: o.x + (l.x - o.x) * ca - (l.y - o.y) * sa, y: o.y + (l.x - o.x) * sa + (l.y - o.y) * ca }));
}

function lanterns(ctx, lights, S, col, core, k = 1, sy = 1) {
  for (const l of lights) {
    ctx.save(); ctx.translate(l.x, l.y); ctx.scale(1, sy);
    glow(ctx, 0, 0, 0.30 * S * l.k, col, 0.22 * k * l.k);
    glow(ctx, 0, 0, 0.085 * S * l.k, col, 0.55 * k * l.k);
    glow(ctx, 0, 0, 0.020 * S * Math.sqrt(l.k), core, 0.95 * k);
    ctx.restore();
  }
}

// ---- far things ---------------------------------------------------------------------
function rocks(c, W, H, nz, yb, x0, x1, hgt, seedX, col) {
  c.beginPath(); c.moveTo(x0, yb);
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = lerp(x0, x1, f);
    const env = Math.pow(Math.sin(f * Math.PI), 0.55) * (0.55 + 0.45 * Math.sin(f * 2.6 + 0.6) ** 2);
    const h = hgt * env * (0.45 + 0.55 * nz.ridged(f * 3.2 + seedX, 2.2, 4)) + hgt * 0.05 * nz.n2(f * 40, seedX);
    c.lineTo(x, yb - Math.max(0, h));
  }
  c.lineTo(x1, yb); c.closePath(); c.fillStyle = col; c.fill();
}

// grain() works in overlay, which fades to nothing in near-black; this adds a
// little additive noise so the darkest gradients stay dithered after encoding.
function darkDither(ctx, W, H, amp, sd) {
  const r = rng(sd + 1234), T = 384, [c, cx] = layer(T, T), img = cx.createImageData(T, T), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const g = Math.max(0, amp + r.gauss() * amp); d[k] = d[k + 1] = d[k + 2] = g; d[k + 3] = 255; }
  cx.putImageData(img, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = ctx.createPattern(c, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}

// ---- the picture ----------------------------------------------------------------------
export function render(ctx, W, H, opts = {}) {
  const u = W / 3840, sd = opts.seed ?? seed;
  const nz = makeNoise(sd * 5 + 3), air = makeAir(W, H, nz), { yh, moon } = air;
  const light = opts.light ?? '#d2a844', core = '#f6e6ad';

  // 1. fog and still water
  const dr = rng(sd + 77);
  field(ctx, W, H, (fu, fv) => { const c = ramp(FOG, air.lum(fu * W, fv * H)), n = (dr() - 0.5) * 1.6; return [c[0] + n, c[1] + n, c[2] + n, 255]; }, { down: 2 });

  // 2. shapes far back in the bank, with their reflections
  const far = (fn, o, alpha, blur) => {
    const L = shipLayer(fn, o);
    ctx.save(); ctx.filter = `blur(${(blur * u).toFixed(2)}px)`;
    ctx.globalAlpha = alpha; ctx.drawImage(L.canvas, o.px - L.ox, o.py - L.oy);
    ctx.globalAlpha = alpha * 0.5; ctx.translate(0, 2 * o.py); ctx.scale(1, -1); ctx.drawImage(L.canvas, o.px - L.ox, o.py - L.oy);
    ctx.restore();
  };
  {
    const [rl, rx] = layer(W, H);
    rocks(rx, W, H, nz, yh + 0.012 * H, 0.03 * W, 0.17 * W, 0.115 * H, 3.7, '#0f1f24');
    rocks(rx, W, H, nz, yh + 0.016 * H, -0.04 * W, 0.06 * W, 0.20 * H, 9.2, '#0f1f24');
    ctx.save(); ctx.filter = `blur(${(3 * u).toFixed(2)}px)`; ctx.globalAlpha = 0.42; ctx.drawImage(rl, 0, 0);
    ctx.globalAlpha = 0.20; ctx.translate(0, 2 * (yh + 0.014 * H)); ctx.scale(1, -1); ctx.drawImage(rl, 0, 0); ctx.restore();
  }
  far(drawShip, { px: 0.285 * W, py: yh + 0.012 * H, scale: 0.105 * W, tatter: 0.75, hull: '#0f1f24', sail: '#0f1f24', sailAlpha: 0.8, flip: true, seed: 9, pennant: false, ensign: false }, 0.40, 3.5);
  far(drawShipBowOn, { px: 0.875 * W, py: yh + 0.022 * H, scale: 0.20 * H, tatter: 0.85, hull: '#0f1f24', sail: '#0f1f24', sailAlpha: 0.8, yaw: -0.5, seed: 14 }, 0.34, 3);

  // 3. a veil of fog in front of them
  field(ctx, W, H, (fu, fv) => {
    const x = fu * W, y = fv * H, v = (y - yh) / H;
    const n = nz.fbm((x / H) * 0.9 + 21, (y / H) * 4.2 + 5, 4);
    const band = Math.exp(-Math.pow((v + 0.03) / 0.13, 2));
    const c = ramp(FOG, 0.50 + 0.2 * n);
    return [c[0], c[1], c[2], clamp(band * (0.36 + 0.5 * n)) * 255];
  }, { down: 4 });

  // 4. the derelict and her reflection
  const S = 0.680 * H, sx0 = 0.600 * W, sy0 = yh + 0.120 * H;
  const fogC = hexToRgb('#2c4549');
  const base = {
    x: sx0, y: sy0, S, heel: 0.030, yaw: 0.36, seed: sd, trim: 0.10, haze: 1, dark: hexToRgb('#04090c'), sail: hexToRgb('#101c1f'), fog: fogC, sailAlpha: 0.90,
    light, litPorts: [5], nz, lit: hexToRgb('#48625f'),
    state: { main2: { tilt: -0.20, brace: 0.25, side: -0.8 }, main3: { bare: true, tilt: 0.10 }, mizzen1: { tilt: 0.12, gaps: [[0.3, 0.3]] }, fore1: { side: 0.7, tilt: -0.05 }, main0: { gone: 0.3 }, fore0: { amount: 0.85 }, mizzen2: { amount: 0.6, tilt: -0.08 } },
  };
  const [shipL, shipX] = layer(W, H), [reflL, reflX] = layer(W, H), sailLayer = layer(W, H);
  const lights = derelict(shipX, { ...base, sailLayer });
  const rl = derelict(reflX, { ...base, sailLayer, mirror: true });
  // lantern-light falling on the ship itself
  shipX.save(); shipX.globalCompositeOperation = 'source-atop';
  for (const l of lights) { glow(shipX, l.x, l.y, 0.16 * S * l.k, light, 0.34 * l.k, 'source-atop'); glow(shipX, l.x, l.y, 0.05 * S * l.k, light, 0.5 * l.k, 'source-atop'); }
  shipX.restore();
  {
    // smear the reflection down the water, then break it with slow ripples
    const k = Math.max(2, 13 * u), [t1, t1x] = layer(W, H / k), [t2, t2x] = layer(W, H), [t3, t3x] = layer(W, H);
    t1x.imageSmoothingQuality = 'high'; t1x.drawImage(reflL, 0, 0, W, H / k);
    t2x.imageSmoothingQuality = 'high'; t2x.drawImage(t1, 0, 0, W, H);
    lanterns(t2x, rl, S, light, core, 0.9, 2.6);
    const y0 = Math.floor(sy0 - 0.03 * H), hs = Math.max(1, Math.round(2 * u));
    for (let y = y0; y < H; y += hs) {
      const d = Math.max(0, (y - sy0) / H);
      const dx = (nz.n2(y / (26 * u), 3.3) * (1.5 + 30 * d) + nz.n2(y / (7 * u), 8.1) * (0.5 + 9 * d)) * u;
      t3x.drawImage(t2, 0, y, W, hs, dx, y, W, hs);
    }
    const g = t3x.createLinearGradient(0, sy0, 0, sy0 + 0.40 * H);
    g.addColorStop(0, 'rgba(0,0,0,0.80)'); g.addColorStop(0.5, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    t3x.globalCompositeOperation = 'destination-in'; t3x.fillStyle = g; t3x.fillRect(0, 0, W, H);
    ctx.drawImage(t3, 0, 0);
  }
  ctx.drawImage(shipL, 0, 0);
  lanterns(ctx, lights, S, light, core, 1);

  // 5. fog drifting low across the water, thicker astern where she came from
  field(ctx, W, H, (fu, fv) => {
    const x = fu * W, y = fv * H, v = (y - yh) / H;
    const n = nz.fbm((x / H) * 0.7 + 3, (y / H) * 6.0 + 40, 5), n2 = nz.fbm((x / H) * 1.9 + 13, (y / H) * 9.0 - 6, 3);
    const wisp = Math.pow(smooth(-0.05, 0.55, n), 1.6);
    const clear = 1 - 0.7 * Math.exp(-Math.pow((x - sx0 - 0.02 * W) / (0.13 * W), 2));        // thinner right in front of her
    const low = Math.exp(-Math.pow((v - 0.075) / 0.085, 2)) * (0.12 + 0.95 * wisp) * clear;
    const bank = smooth(0.62, 1.0, fu) * Math.exp(-Math.pow((v + 0.05) / 0.36, 2)) * (0.42 + 0.5 * n2);
    const c = ramp(FOG, 0.58 + 0.18 * n);
    return [c[0], c[1], c[2], clamp(low * 0.60 + bank * 0.75) * 255];
  }, { down: 4 });

  // 6. the sheen of flat water: long faint streaks
  {
    const r = rng(sd + 31);
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 230; i++) {
      const d = Math.pow(r(), 1.5), y = yh + (0.030 + d * 0.37) * H, x = r() * W, len = r.range(60, 420) * u * (0.4 + d * 2.2);
      if (y < sy0 + 0.035 * S && x + len / 2 > sx0 - 0.27 * S && x - len / 2 < sx0 + 0.38 * S) continue;   // not across her hull
      const l = air.lum(x, y), lightS = r.chance(0.55);
      const col = lightS ? '#a9c2b6' : '#02070a', al = lightS ? clamp(0.03 + l * 0.22) * r.range(0.3, 1) : r.range(0.06, 0.2);
      const g = ctx.createLinearGradient(x - len / 2, 0, x + len / 2, 0);                  // tapering away at both ends
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.3, rgba(col, al)); g.addColorStop(0.7, rgba(col, al)); g.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(0.6, (0.8 + d * 2.4) * u * r.range(0.6, 1.3));
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.quadraticCurveTo(x, y + r.range(-1.5, 1.5) * u, x + len / 2, y); ctx.stroke();
    }
    ctx.restore();
  }

  vignette(ctx, W, H, 0.5, '#020507', 0.5);
  grain(ctx, W, H, 5, sd);
  darkDither(ctx, W, H, opts.dither ?? 2.4, sd);
}
