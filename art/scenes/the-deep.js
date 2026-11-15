// The Deep — the kraken's view. Far below a moonlit surface, looking up: the
// bright window of the sky, a small hull in silhouette, and arms rising from
// the dark toward it.
import { TAU, clamp, lerp, smooth, P, rng, makeNoise, hexToRgb, rgba, ramp, layer, glow, field, grain, vignette } from '../lib/core.js';

export const size = [3840, 2160];
export const seed = 11;

// Luminance -> water colour. Abyssal blue-black, through teal, to pale moonlit green.
const WATER = [[0, '#02050a'], [0.07, '#040b12'], [0.17, '#07161f'], [0.30, '#0b2836'], [0.44, '#11434f'],
  [0.58, '#1f686b'], [0.72, '#4a9c92'], [0.85, '#9fd2c1'], [0.94, '#d9eedb'], [1, '#f3f8e6']];

// ---- the water column ------------------------------------------------------
function makeWater(W, H, nz) {
  const D = { x: 0.548 * W, y: 0.192 * H, rx: 0.270 * W, ry: 0.150 * H };       // the surface window
  const S = { x: D.x - 0.015 * W, y: D.y - 0.60 * H };                           // virtual light source above it
  const hull = { x: D.x + 0.052 * W, y: D.y + 0.002 * H, len: 0.112 * W, psi: -0.17 };
  const aH = Math.atan2(hull.x - S.x, hull.y - S.y), dH = Math.atan2(hull.len * 0.40, hull.y - S.y);
  const moon = { x: -0.42, y: -0.12 };
  const hullShade = (a, y) => smooth(dH * 1.6, dH * 0.4, Math.abs(a - aH)) * smooth(hull.y, hull.y + 0.03 * H, y) * Math.exp(-Math.max(0, y - hull.y) / (0.5 * H));

  // Shafts of light fanning down from the window; returns 0..1.
  function shafts(x, y) {
    const d = (y - D.y) / H;
    const below = smooth(0.02, 0.16, d);
    if (below <= 0) return 0;
    const a = Math.atan2(x - S.x, y - S.y);
    const q = (S.x + Math.tan(a) * (D.y - S.y) - D.x) / D.rx;                    // where the ray pierces the surface
    const dist = Math.hypot(x - S.x, y - S.y) / H;
    const fine = Math.exp(-d / 0.30);
    const n1 = nz.n2(a * 9 + 5.2, dist * 0.07), n2 = nz.n2(a * 25 + 1.3, dist * 0.11 + 4), n3 = nz.n2(a * 66 - 3, dist * 0.14 + 9);
    let s = (0.5 + 0.5 * n1) * 0.62 + (0.5 + 0.5 * n2) * 0.30 * (0.4 + 0.6 * fine) + (0.5 + 0.5 * n3) * 0.14 * fine;
    s = Math.pow(clamp(s), 1.7) * 1.55;
    s *= smooth(1.6, 0.4, Math.abs(q)) * below * Math.exp(-d / 0.40);
    return s * (1 - 0.4 * hullShade(a, y));
  }

  function lum(x, y) {
    const px = (x - D.x) / D.rx, py = (y - D.y) / D.ry;
    const wob = nz.fbm(px * 1.5 + 3.1, py * 1.5 - 1.7, 3) * 0.11 + nz.n2(px * 5.5, py * 5.5) * 0.03;
    const r = Math.hypot(px, py) + wob;
    const d = (y - D.y) / H;
    let amb = 0.35 * Math.exp(-Math.max(0, d) / 0.47);
    if (d < 0) amb *= lerp(0.42, 1, smooth(-0.2, 0, d));
    const a = Math.atan2(x - S.x, y - S.y);
    const q = (S.x + Math.tan(a) * (D.y - S.y) - D.x) / D.rx;
    const below = smooth(0.0, 0.12, d);
    const cone = Math.exp(-q * q * 0.75) * 0.25 * Math.exp(-Math.max(0, d) / 0.50) * below;
    let l = amb + cone * (1 - 0.3 * hullShade(a, y)) + shafts(x, y) * 0.30;
    l += 0.20 * Math.exp(-Math.max(0, r - 1) * 2.4);                              // bloom around the window
    // faint reflected ripples on the dark underside of the surface, outside the window
    if (r > 0.95 && d < 0.12) {
      const k = nz.ridged(px * 2.6 + 11, py * 5.2 - 3, 3);
      l += 0.07 * Math.pow(smooth(0.6, 0.98, k), 2) * Math.exp(-(r - 1) * 1.3) * smooth(0.14, -0.02, d);
    }
    const inside = smooth(1.03, 0.88, r);
    if (inside > 0) {
      const comp = 1 + 1.5 * r * r;
      const sx = px * comp * 2.1, sy = py * comp * 2.1;
      const wx = nz.fbm(sx * 0.6 + 9, sy * 0.6, 3) * 1.0, wy = nz.fbm(sx * 0.6 - 4, sy * 0.6 + 7, 3) * 1.0;
      const c1 = nz.ridged(sx + wx, sy + wy, 4);
      const c2 = nz.ridged(sx * 2.7 + wx * 1.6 + 31, sy * 2.7 + wy * 1.6 - 17, 3);                 // finer ripples riding on the swell
      const caust = Math.pow(smooth(0.52, 0.97, c1), 1.5) * 0.78 + Math.pow(smooth(0.60, 0.98, c2), 2) * 0.36;
      const mdx = px - moon.x + wx * 0.10, mdy = py - moon.y + wy * 0.10;
      const mg = Math.exp(-(mdx * mdx + mdy * mdy) / 0.085);
      let dl = 0.50 + 0.18 * (1 - r * r) + caust * (0.20 + 0.28 * mg) + mg * 0.30;
      dl *= lerp(0.74, 1, smooth(1.0, 0.55, r));
      l = lerp(l, dl, inside);
    }
    return l * lerp(1, 0.5, smooth(0.64, 1.0, y / H));
  }
  return { D, S, hull, lum, shafts };
}

// ---- the ship, seen from underneath -------------------------------------------
// X along the keel (bow +), Y athwart, Z depth below the waterline. We look up
// from almost beneath, so the waterplane reads as an almond with the keel as a
// ridge down its length.
function drawHull(c, u, h) {
  const len = h.len, B = len * (h.beam ?? 0.31), dk = len * 0.13, squash = 0.62;
  const cs = Math.cos(h.psi), sn = Math.sin(h.psi);
  const proj = (X, Y, Z) => { const xr = X * cs - Y * sn, yr = X * sn + Y * cs; return [h.x + xr - Z * 0.06, h.y + yr * squash + Z * 0.24]; };
  const half = t => (B / 2) * (t > 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 1.75)), 0.80) : Math.pow(Math.max(0, 1 - Math.pow(-t, 4.5)), 0.5) * lerp(1, 0.66, Math.pow(-t, 1.6)));
  const keel = t => dk * (t > 0.5 ? Math.pow(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2)), 0.5) : 1) * smooth(-1.0, -0.9, t);
  const N = 72, port = [], stbd = [], kl = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N, X = (t * len) / 2;
    port.push(proj(X, half(t), 0)); stbd.push(proj(X, -half(t), 0)); kl.push(proj(X, 0, keel(t)));
  }
  const path = (a, b) => { c.beginPath(); a.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); for (let i = b.length - 1; i >= 0; i--) c.lineTo(b[i][0], b[i][1]); c.closePath(); };
  const line = (pts, i0 = 0, i1 = pts.length - 1) => { c.beginPath(); for (let i = i0; i <= i1; i++) (i > i0 ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1])); };
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  // the bright seam where the surface meets the planking
  path(port, stbd); c.strokeStyle = rgba('#e6f5e2', 0.30); c.lineWidth = 5 * u; c.stroke();
  // two bottom faces meeting at the keel: the one turned to the moon is a shade lighter
  c.fillStyle = h.dark; path(port, stbd); c.fill(); path(port, kl); c.fill();
  path(stbd, kl); c.fillStyle = h.lit; c.fill();
  // strakes: the run of the planking, just visible
  if (h.strakes) {
    c.lineWidth = Math.max(0.6, 1.1 * u);
    for (const [side, col] of [[stbd, rgba('#02090d', 0.32)], [port, rgba('#0d2c34', 0.4)]]) {
      c.strokeStyle = col;
      for (const f of [0.36, 0.70]) { line(side.map((p, i) => [lerp(kl[i][0], p[0], f), lerp(kl[i][1], p[1], f)]), 3, N - 2); c.stroke(); }
    }
  }
  // keel, sternpost and rudder
  c.strokeStyle = h.keel; c.lineWidth = Math.max(1, 3 * u);
  line(kl, 3, N - 2); c.stroke();
  const xs = (-0.90 * len) / 2;
  c.fillStyle = h.keel;
  c.beginPath();
  [[xs + len * 0.012, 0, dk * 0.2], [xs - len * 0.034, len * 0.006, dk * 0.25], [xs - len * 0.082, len * 0.020, dk * 0.80], [xs - len * 0.068, len * 0.018, dk * 1.15], [xs + len * 0.012, 0, dk * 1.10]].forEach(([X, Y, Z], i) => { const p = proj(X, Y, Z); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
  c.closePath(); c.fill();
  c.restore();
  return { proj, half, len };
}

// ---- tentacles ----------------------------------------------------------------
const crPoint = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t, f = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  return [f(0), f(1)];
};

// Spine = a Catmull-Rom path through the control points, continued by a curl
// whose radius follows the local thickness (so the tip winds into a spiral).
function buildSpine(spec, W, H, u, nz) {
  const ctrl = spec.path.map(([a, b]) => [a * W, b * H]);
  const n = ctrl.length;
  const ext0 = [2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1]], ext1 = [2 * ctrl[n - 1][0] - ctrl[n - 2][0], 2 * ctrl[n - 1][1] - ctrl[n - 2][1]];
  const Pp = [ext0, ...ctrl, ext1], dense = [];
  for (let i = 0; i + 3 < Pp.length; i++) for (let j = 0; j < 64; j++) dense.push(crPoint(Pp[i], Pp[i + 1], Pp[i + 2], Pp[i + 3], j / 64));
  dense.push(ctrl[n - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const pathLen = cum[cum.length - 1], curlLen = pathLen * spec.curl, L = pathLen + curlLen;
  const w0 = spec.w0 * W, tipF = spec.tip ?? 0.02, pw = spec.taper ?? 0.9, persp = spec.persp ?? 0;
  // taper, with an extra hyperbolic falloff for arms that start close to the eye
  const width = s => { const t = s / L; return w0 * (tipF + (1 - tipF) * Math.pow(Math.max(0, 1 - t), pw) / (1 + persp * t)); };
  const ds = Math.max(0.9, 1.5 * u);
  const pts = [];
  let j = 1;
  for (let s = 0; s < pathLen; s += ds) {
    while (j < cum.length - 1 && cum[j] < s) j++;
    const k = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    pts.push({ x: lerp(dense[j - 1][0], dense[j][0], k), y: lerp(dense[j - 1][1], dense[j][1], k), s });
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    pts[i].th = Math.atan2(b.y - a.y, b.x - a.x);
  }
  // the curl
  let { x, y, th } = pts[pts.length - 1];
  const tight = spec.tight ?? 1.3, turns = spec.maxTurn ?? 99;
  let turned = 0;
  for (let s = pathLen + ds; s < L; s += ds) {
    const e = (s - pathLen) / curlLen;
    let k = (spec.dir * smooth(0, 0.25, e)) / (tight * width(s));
    if (turned > turns) k *= 0.12;
    th += k * ds; turned += Math.abs(k * ds); x += Math.cos(th) * ds; y += Math.sin(th) * ds;
    pts.push({ x, y, s, th });
  }
  for (const p of pts) {
    const sn = p.s / L;
    p.sn = sn;
    p.w = width(p.s) * (1 + 0.02 * nz.n2(p.s / (w0 * 0.2) + spec.seed * 7.1, 1.7) + 0.04 * nz.n2(p.s / (w0 * 1.3), spec.seed * 3.3));
    p.nx = -Math.sin(p.th); p.ny = Math.cos(p.th);
    // roll: which way the sucker face points (0 = at the viewer, +-PI/2 = an edge)
    const inCurl = smooth(pathLen - 0.12 * L, pathLen + 0.35 * curlLen, p.s);
    const rl = spec.roll, f = sn * (rl.length - 1), i0 = Math.min(rl.length - 2, Math.floor(f));
    const base = lerp(rl[i0], rl[i0 + 1], smooth(0, 1, f - i0)) + 0.16 * nz.n2(sn * 3.1 + spec.seed, 4.4);
    p.phi = lerp(base, spec.dir * 1.18, inCurl);
  }
  return { pts, L, pathLen, w0, ds };
}

const VS = [1, 0.985, 0.95, 0.89, 0.8, 0.66, 0.45, 0.2, -0.05, -0.3, -0.52, -0.7, -0.84, -0.93, -0.98, -1];
const DEEP = hexToRgb('#02060a'), SKIN = hexToRgb('#0a2a33'), SKINLIT = hexToRgb('#1c5d60'), BELLY = hexToRgb('#2f6c6b'), RIM = hexToRgb('#c2f0d9');
const SB = 0.44, CB = Math.sqrt(1 - SB * SB);           // back-lighting: the light is above and behind the arm

function drawTentacle(c, sp, spec, env) {
  const { H, u, D, nz } = env;
  const { pts, w0 } = sp;
  // per-point lighting terms
  for (const p of pts) {
    const lx = D.x - p.x, ly = D.y - p.y, ld = Math.hypot(lx, ly) || 1;
    p.lx = lx / ld; p.ly = ly / ld;
    p.NL = p.nx * p.lx + p.ny * p.ly;
    p.att = Math.exp(-ld / (1.0 * H)) * 1.3 * smooth(1.15, 0.6, p.y / H);
    p.amb = clamp(1.05 - (p.y / H) * 1.0) * (0.5 + 0.5 * Math.exp(-ld / (0.8 * H)));
    p.tex = 0.74 + 0.40 * nz.n2(p.s / (w0 * 0.16) + spec.seed * 2.3, 9.1) + 0.12 * nz.n2(p.s / (w0 * 0.035), spec.seed);
  }
  const shade = (p, v) => {
    const nzv = Math.sqrt(Math.max(0, 1 - v * v));
    const ndl = v * p.NL * CB - nzv * SB;
    const rim = Math.pow(Math.max(0, ndl), 1.35) * 1.5 * p.tex + Math.pow(Math.abs(v), 5) * 0.13;
    const sky = Math.pow(clamp(v * p.NL * 0.85 + 0.16), 1.25);                        // soft light from above, wrapping round
    const vc = Math.sin(p.phi), vis = Math.max(0, Math.cos(p.phi));
    const band = Math.exp(-Math.pow((v - vc) / 0.42, 2)) * (0.25 + 0.75 * vis);
    const mot = 0.82 + 0.34 * nz.n2(p.s / (w0 * 0.11) + 3.3, v * 2.4 + spec.seed * 1.9);
    const I = clamp(p.att * rim);
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let col = DEEP[k] + (SKIN[k] - DEEP[k]) * p.amb * (0.22 + 0.42 * nzv) * mot + (SKINLIT[k] - DEEP[k]) * p.att * sky * 0.80 * mot + (BELLY[k] - DEEP[k]) * band * p.amb * 0.26;
      col += (RIM[k] - col) * I;
      out[k] = Math.round(clamp(col, 0, 255));
    }
    return out;
  };
  const css = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  const edge = (p, v) => [p.x + p.nx * (v * p.w) / 2, p.y + p.ny * (v * p.w) / 2];

  // --- suckers: two staggered rows on the oral face
  const suckers = [];
  {
    let s = sp.L * 0.006;
    while (s < sp.L * 0.99) {
      const p = pts[Math.min(pts.length - 1, Math.round(s / sp.ds))];
      const rs = p.w * 0.112;
      if (rs < 0.85 * u) break;
      for (const side of [-1, 1]) {
        const q = pts[Math.min(pts.length - 1, Math.round((s + (side > 0 ? rs * 1.05 : 0)) / sp.ds))];
        const th = q.phi + side * 0.29, facing = Math.cos(th);
        if (facing < -0.30) continue;
        suckers.push({ p: q, th, facing, vc: Math.sin(th), rs: q.w * 0.112 });
      }
      s += rs * 2.12;
    }
  }
  const drawSucker = k => {
    const { p, facing, vc, rs } = k;
    const edgeOn = 1 - Math.abs(facing);
    const off = vc * (p.w / 2) * 0.965 + Math.sign(vc) * rs * 0.34 * edgeOn;       // stands proud of the skin when seen edge-on
    const cx = p.x + p.nx * off, cy = p.y + p.ny * off;
    const ra = rs, rb = rs * Math.max(0.30, Math.abs(facing));
    const ndl = vc * p.NL * CB - Math.max(0, facing) * SB;
    // how much of the glow this sucker catches: a lot on the lit limb, a little face-on
    const lit = clamp(p.att * (Math.pow(Math.max(0, ndl + 0.1), 1.3) * 1.7 + 0.16 + 0.10 * Math.max(0, facing)));
    const here = shade(p, clamp(vc, -0.97, 0.97));
    const la = Math.atan2(p.ly, p.lx) - p.th;                                         // light direction in the sucker's own frame
    c.save();
    c.translate(cx, cy); c.rotate(p.th);
    if (rs > 3 * u && facing > 0.2) {
      // seat it on the skin: a soft dark crescent on the side away from the light
      c.fillStyle = `rgba(${DEEP[0]},${DEEP[1]},${DEEP[2]},0.5)`;
      c.beginPath(); c.ellipse(-Math.cos(la) * ra * 0.16, -Math.sin(la) * rb * 0.16, ra * 1.12, rb * 1.12, 0, 0, TAU); c.fill();
    }
    // collar: skin tone, slightly paler, brighter on its lit side
    const lift = 0.10 + 0.22 * p.amb + 0.5 * lit;
    const g = c.createLinearGradient(Math.cos(la) * ra, Math.sin(la) * rb, -Math.cos(la) * ra, -Math.sin(la) * rb);
    g.addColorStop(0, css(here.map((h, i) => Math.round(lerp(h, RIM[i], clamp(lift * 0.85))))));
    g.addColorStop(0.45, css(here.map((h, i) => Math.round(lerp(h, BELLY[i], clamp(lift * 0.55))))));
    g.addColorStop(1, css(here.map((h, i) => Math.round(lerp(h, DEEP[i], 0.25)))));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, ra, rb, 0, 0, TAU); c.fill();
    if (rs > 1.8 * u && facing > 0.12) {
      // the cup, sliding toward the far lip as the sucker turns away
      const sh = -Math.sign(vc) * rb * 0.16 * edgeOn;
      c.fillStyle = css(here.map((h, i) => Math.round(lerp(h, DEEP[i], 0.72))));
      c.beginPath(); c.ellipse(0, sh, ra * 0.58, rb * 0.58, 0, 0, TAU); c.fill();
      if (rs > 4.5 * u) {
        // light falling into the cup lands on its far wall
        c.strokeStyle = `rgba(${BELLY[0]},${BELLY[1]},${BELLY[2]},${(0.12 + 0.5 * lit).toFixed(3)})`;
        c.lineWidth = rs * 0.10; c.lineCap = 'round';
        c.beginPath(); c.ellipse(0, sh, ra * 0.46, rb * 0.46, 0, la + Math.PI - 0.9, la + Math.PI + 0.9); c.stroke();
        c.fillStyle = css(DEEP);
        c.beginPath(); c.ellipse(0, sh, ra * 0.2, rb * 0.2, 0, 0, TAU); c.fill();
      }
    }
    if (rs > 2.4 * u) {
      // the lip catching the glow
      c.strokeStyle = `rgba(${RIM[0]},${RIM[1]},${RIM[2]},${clamp(lit * 1.05).toFixed(3)})`;
      c.lineWidth = Math.max(0.8 * u, rs * 0.085); c.lineCap = 'round';
      c.beginPath(); c.ellipse(0, 0, ra * 0.94, rb * 0.94, 0, la - 1.05, la + 1.05); c.stroke();
    }
    c.restore();
  };

  // edge-on suckers first, so the arm overlaps their inner halves
  for (const k of suckers) if (k.facing < 0.34) drawSucker(k);

  // --- the arm: short overlapping quads, each with a cross-section gradient
  const stride = Math.max(1, Math.round((2.2 * u) / sp.ds));
  for (let i = 0; i < pts.length - 1; i += stride) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + stride + 1)];
    const a = edge(p, 1), b = edge(p, -1), a2 = edge(q, 1), b2 = edge(q, -1);
    const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
    for (const v of VS) g.addColorStop((1 - v) / 2, css(shade(p, v)));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a2[0], a2[1]); c.lineTo(b2[0], b2[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fill();
  }
  const t = pts[pts.length - 1];
  c.fillStyle = css(shade(t, 0)); c.beginPath(); c.arc(t.x, t.y, t.w / 2, 0, TAU); c.fill();

  for (const k of suckers) if (k.facing >= 0.34) drawSucker(k);
}

// ---- small things ---------------------------------------------------------------
function motes(c, W, H, u, r, water, { count, zMin, zMax, alpha = 1 }) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = Math.pow(r(), 0.8) * H, z = r.range(zMin, zMax);
    const l = water.lum(x, y), sh = water.shafts(x, y);
    const rad = (0.7 + z * z * 5.5) * u * r.range(0.6, 1.4);
    const a = clamp((l * 0.55 + sh * 0.9 + 0.02) * r.range(0.25, 1) * alpha * (z > 0.7 ? 0.32 : 1) * smooth(0.02, 0.2, (y - water.D.y) / H + 0.1));
    if (a < 0.012) continue;
    if (z > 0.55) glow(c, x, y, rad * 2.2, '#bfe9da', a * 0.5);
    else { c.fillStyle = rgba('#cdeedd', a); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); }
  }
  c.restore();
}

function bubbleTrail(c, u, r, x0, y0, rise, { n = 26, size = 1, drift = 0, alpha = 1 } = {}) {
  c.save();
  const ph = r() * TAU, ph2 = r() * TAU;
  let f = 0;
  for (let i = 0; i < n; i++) {
    f += (1 / n) * r.range(0.3, 1.7) * (0.55 + f);                 // bubbles string out as they rise
    if (f > 1) break;
    const sway = (Math.sin(ph + f * 7) * 16 + Math.sin(ph2 + f * 17) * 6) * u * size * (0.3 + f);
    const cnt = r.chance(0.25) ? r.int(2, 3) : 1;
    for (let j = 0; j < cnt; j++) {
      const x = x0 + drift * f * rise + sway + r.range(-9, 9) * u * size * (j ? 1.6 : 1), y = y0 - f * rise + (j ? r.range(-14, 14) * u * size : 0);
      const rad = r.range(1.4, 4.6) * u * size * (0.6 + 1.1 * f) * (r.chance(0.1) ? 1.8 : 1) * (j ? 0.6 : 1);
      const a = alpha * r.range(0.35, 0.9) * (1 - f * 0.35);
      c.strokeStyle = rgba('#bfe6d8', 0.5 * a); c.lineWidth = Math.max(0.6 * u, rad * 0.15);
      c.beginPath(); c.ellipse(x, y, rad, rad * r.range(0.82, 1), 0, 0, TAU); c.stroke();
      c.fillStyle = rgba('#9fd6c8', 0.06 * a); c.fill();
      c.strokeStyle = rgba('#f3f8e6', 0.8 * a); c.lineWidth = Math.max(0.6 * u, rad * 0.2); c.lineCap = 'round';
      c.beginPath(); c.arc(x, y, rad * 0.62, -2.4, -1.5); c.stroke();
    }
  }
  c.restore();
}

// grain() works in overlay, which fades to nothing in near-black; this adds a
// little additive noise so the darkest gradients stay dithered after encoding.
function darkDither(ctx, W, H, amp, sd) {
  const r = rng(sd + 1234), T = 384, [c, cx] = layer(T, T), img = cx.createImageData(T, T), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const g = Math.max(0, amp + r.gauss() * amp); d[k] = d[k + 1] = d[k + 2] = g; d[k + 3] = 255; }
  cx.putImageData(img, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = ctx.createPattern(c, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}

// ---- the picture ------------------------------------------------------------------
// Arms start at the edges of the frame, close to the eye, and converge on the
// ship. z: 0 near .. 1 far (haze). roll: sucker-face direction along the arm.
const ARMS = [
  // far and thin: it has found the anchor cable
  { z: 0.90, w0: 0.050, persp: 0.8, curl: 0.34, dir: -1, tight: 1.35, roll: [2.2, 1.2, 0.7], seed: 3, path: [[0.560, 1.10], [0.602, 0.86], [0.578, 0.68], [0.598, 0.53], [0.628, 0.435]] },
  // middle distance
  { z: 0.55, w0: 0.094, persp: 1.2, curl: 0.42, dir: 1, tight: 1.18, roll: [-2.4, -1.0, -0.2, -0.6], seed: 5, path: [[0.185, 1.14], [0.268, 0.93], [0.300, 0.78], [0.318, 0.66], [0.352, 0.575]] },
  { z: 0.40, w0: 0.110, persp: 1.4, curl: 0.27, dir: -1, tight: 1.45, roll: [2.5, 1.3, 0.5, 0.8], seed: 6, path: [[0.760, 1.140], [0.705, 0.900], [0.742, 0.730], [0.722, 0.590], [0.690, 0.500]] },
  // near: the great arms that frame the picture
  { z: 0.10, w0: 0.200, persp: 2.2, curl: 0.30, dir: 1, tight: 1.5, roll: [-2.6, -1.5, -0.5, -0.2, -0.7], seed: 7, path: [[-0.090, 0.960], [0.030, 0.800], [0.075, 0.600], [0.125, 0.430], [0.215, 0.325]] },
  { z: 0.0, w0: 0.235, persp: 2.5, curl: 0.13, dir: -1, tight: 2.3, roll: [2.4, 1.6, 0.7, 0.35, 0.8], seed: 8, path: [[1.040, 1.100], [0.945, 0.860], [0.915, 0.640], [0.868, 0.470], [0.812, 0.352]] },
];

export function render(ctx, W, H, opts = {}) {
  const u = W / 3840, sd = opts.seed ?? seed;
  const r = rng(sd), nz = makeNoise(sd * 7 + 1);
  const water = makeWater(W, H, nz);
  const { D } = water;

  // 1. the water column
  const dr = rng(sd + 99);
  field(ctx, W, H, (fu, fv) => {
    const l = water.lum(fu * W, fv * H);
    const c = ramp(WATER, l), n = (dr() - 0.5) * 1.6;
    return [c[0] + n, c[1] + n, c[2] + n, 255];
  }, { down: 2 });
  // moon bloom through the surface
  glow(ctx, D.x - 0.42 * D.rx, D.y - 0.12 * D.ry, 0.19 * W, '#cfeedd', 0.15);

  // 2. the ship, her boat towing astern, and the anchor cable
  glow(ctx, water.hull.x, water.hull.y, water.hull.len * 0.9, '#d9eedb', 0.10);
  const hull = drawHull(ctx, u, { ...water.hull, dark: '#041117', lit: '#0a252d', keel: '#01070b', strakes: true });
  const st = hull.proj(-hull.len * 0.50, 0, 0);
  const bt = { x: st[0] - 0.036 * W, y: st[1] + 0.016 * H, len: 0.023 * W, psi: -0.40, beam: 0.38 };
  ctx.save(); ctx.strokeStyle = rgba('#051319', 0.7); ctx.lineWidth = 1.3 * u;
  ctx.beginPath(); ctx.moveTo(st[0], st[1]); ctx.quadraticCurveTo((st[0] + bt.x) / 2, st[1] + 0.016 * H, bt.x + bt.len * 0.45, bt.y - bt.len * 0.14); ctx.stroke(); ctx.restore();
  drawHull(ctx, u * 0.5, { ...bt, dark: '#06171d', lit: '#0b2830', keel: '#041015' });
  // stern lantern: a smear of gold on the ripples beside the quarter
  const lp = hull.proj(-hull.len * 0.455, -hull.half(-0.9) * 1.9, 0);
  ctx.save(); ctx.translate(lp[0], lp[1]); ctx.rotate(water.hull.psi); ctx.scale(1.8, 0.8);
  glow(ctx, 0, 0, 40 * u, P.gold, 0.85, 'source-over'); glow(ctx, 0, 0, 13 * u, P.paleGold, 1, 'source-over');
  ctx.restore();
  const drawCable = () => {
    const a = hull.proj(hull.len * 0.37, hull.half(0.74) * 0.8, hull.len * 0.03);
    const b = [a[0] - 0.004 * W, a[1] + 0.20 * H], e = [a[0] - 0.046 * W, a[1] + 0.50 * H];
    const g = ctx.createLinearGradient(a[0], a[1], e[0], e[1]);
    g.addColorStop(0, rgba('#041117', 0.95)); g.addColorStop(0.45, rgba('#051219', 0.75)); g.addColorStop(1, rgba('#040c12', 0));
    ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 2.8 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], e[0], e[1]); ctx.stroke(); ctx.restore();
  };

  // 3. far motes, then the arms from far to near
  motes(ctx, W, H, u, rng(sd + 5), water, { count: 900, zMin: 0, zMax: 0.4, alpha: 0.8 });
  const [tl, tc] = layer(W, H);
  const [sl, sc] = layer(W, H);
  field(sc, W, H, (fu, fv) => { const s = water.shafts(fu * W, fv * H); return [150, 214, 196, clamp(s * 0.55) * 255]; }, { down: 3 });
  const env = { W, H, u, D, nz };
  const only = opts.only !== undefined ? String(opts.only).split(',').map(Number) : null;
  ARMS.forEach((spec, i) => {
    if (only && !only.includes(i)) return;
    tc.clearRect(0, 0, W, H);
    const sp = buildSpine(spec, W, H, u, nz);
    drawTentacle(tc, sp, spec, env);
    ctx.save();
    ctx.globalAlpha = lerp(1, 0.40, spec.z);
    if (spec.z > 0.3) ctx.filter = `blur(${(spec.z * 2.2 * u).toFixed(2)}px)`;
    ctx.drawImage(tl, 0, 0);
    ctx.restore();
    // water between this arm and the next: shafts pass in front of it
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.20 * spec.z + 0.03; ctx.drawImage(sl, 0, 0); ctx.restore();
    if (i === 0) drawCable();
    if (i === 2) motes(ctx, W, H, u, rng(sd + 6), water, { count: 500, zMin: 0.2, zMax: 0.6, alpha: 0.9 });
  });

  // 4. near motes and bubbles
  motes(ctx, W, H, u, rng(sd + 7), water, { count: 240, zMin: 0.5, zMax: 1, alpha: 1 });
  bubbleTrail(ctx, u, r, 0.318 * W, 0.70 * H, 0.44 * H, { n: 30, size: 1.0, drift: 0.03 });
  bubbleTrail(ctx, u, r, 0.746 * W, 0.74 * H, 0.40 * H, { n: 24, size: 0.85, drift: -0.03, alpha: 0.85 });
  bubbleTrail(ctx, u, r, 0.145 * W, 0.50 * H, 0.26 * H, { n: 16, size: 1.25, drift: 0.05, alpha: 0.7 });
  bubbleTrail(ctx, u, r, 0.592 * W, 0.56 * H, 0.22 * H, { n: 14, size: 0.5, alpha: 0.6 });

  vignette(ctx, W, H, 0.55, '#01040a', 0.5);
  grain(ctx, W, H, 5, sd);
  darkDither(ctx, W, H, opts.dither ?? 2.4, sd);
}
