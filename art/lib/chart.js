// Chart-making helpers shared by the two map wallpapers (dead-reckoning and
// treasure-map): a procedural archipelago, contour extraction, and the pieces
// of a sea chart — coast shading, rhumb lines, compass roses, a graduated
// neatline, soundings, a course line, sea monsters and landmarks.
//
// Everything is drawn in "design units": the scene scales its context by
// W / 3840 once, so a draft render matches the full-size one exactly.
//
// Ink is drawn opaque onto its own layer through a "pen". A pen maps a strength
// (0 = no ink, 1 = full, >1 = highlight) to a colour, so faint lines are not
// translucent and overlapping strokes never double up. The gilt pen fades to
// black (the layer is added to the paper); the sepia pen fades to white (the
// layer is multiplied into it).
import { TAU, clamp, lerp, smooth, rng, makeNoise, hexToRgb, layer } from './core.js';

export const DW = 3840, DH = 2160;
const D2R = Math.PI / 180;
const css = c => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

// ---- pens ---------------------------------------------------------------
function rampFn(stops) {
  const S = stops.map(([p, c]) => [p, hexToRgb(c)]);
  return s => {
    if (s <= S[0][0]) return css(S[0][1]);
    for (let i = 1; i < S.length; i++) {
      if (s <= S[i][0]) { const k = (s - S[i - 1][0]) / (S[i][0] - S[i - 1][0]); return css(S[i - 1][1].map((v, q) => lerp(v, S[i][1][q], k))); }
    }
    return css(S[S.length - 1][1]);
  };
}
// Gold, brass and copper leaf on a dark sheet.
export const giltPen = () => ({
  a: rampFn([[0, '#000000'], [0.35, '#4b3212'], [1, '#d9a441'], [1.4, '#f8e3a0']]),
  b: rampFn([[0, '#000000'], [0.35, '#3b3220'], [1, '#bfa873'], [1.4, '#efe3bd']]),
  c: rampFn([[0, '#000000'], [0.35, '#4f2014'], [1, '#d2643c'], [1.4, '#f39b6e']]),
  blank: '#000000', wob: 0, dark: true,
});
// Iron-gall ink, a browner bistre wash and a red for the X.
export const sepiaPen = () => ({
  a: rampFn([[0, '#ffffff'], [0.4, '#b9a184'], [1, '#38261a'], [1.4, '#1f140c']]),
  b: rampFn([[0, '#ffffff'], [0.4, '#cbb08c'], [1, '#70482a'], [1.4, '#4a2c17']]),
  c: rampFn([[0, '#ffffff'], [0.4, '#e2a591'], [1, '#9c2a22'], [1.4, '#74161a']]),
  blank: '#ffffff', wob: 1, dark: false,
});

// ---- per-pixel texture in design coordinates ----------------------------
// fn(X, Y) -> [r, g, b, a]; evaluated at W/down x H/down device pixels.
export function tex(ctx, W, H, fn, { down = 2, mode = 'source-over', alpha = 1 } = {}) {
  const fw = Math.max(1, Math.ceil(W / down)), fh = Math.max(1, Math.ceil(H / down));
  const [c, cx] = layer(fw, fh);
  const img = cx.createImageData(fw, fh), d = img.data, sx = DW / fw, sy = DH / fh;
  for (let j = 0, k = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++, k += 4) {
      const px = fn((i + 0.5) * sx, (j + 0.5) * sy);
      d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = px[3] ?? 255;
    }
  }
  cx.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, W, H);
  ctx.restore();
}

// Tiled per-device-pixel speckle, values lo..hi (grey), for multiply/screen passes.
export function speckle(ctx, W, H, lo, hi, seed = 5, mode = 'multiply') {
  const r = rng(seed), T = 256, [c, cx] = layer(T, T);
  const img = cx.createImageData(T, T), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const g = 255 * lerp(lo, hi, r()); d[k] = d[k + 1] = d[k + 2] = g; d[k + 3] = 255; }
  cx.putImageData(img, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = mode; ctx.fillStyle = ctx.createPattern(c, 'repeat'); ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Paper fibres: short, slightly curved hairs, some light and some dark.
export function fibres(ctx, r, { count = 2500, x = 0, y = 0, w = DW, h = DH, len = [18, 90], light = 'rgba(255,255,255,0.03)', dark = 'rgba(0,0,0,0.08)', width = 1 } = {}) {
  ctx.save(); ctx.lineCap = 'round';
  for (const [style, n] of [[dark, count * 0.5], [light, count * 0.5]]) {
    ctx.strokeStyle = style; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + r() * w, py = y + r() * h, a = r() * TAU, l = r.range(len[0], len[1]), b = r.range(-0.6, 0.6);
      const ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l;
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo((px + ex) / 2 - Math.sin(a) * l * b * 0.4, (py + ey) / 2 + Math.cos(a) * l * b * 0.4, ex, ey);
    }
    ctx.lineWidth = width; ctx.stroke();
  }
  ctx.restore();
}

// ---- the world ----------------------------------------------------------
// Islands are noisy cones of uniform slope (height ~ distance inland / `slope`),
// so the same noise crinkles a big island and a small one alike:
//   islands = [{ x, y, r | rx+ry, rot, peak, lift, cut }]
// `cut` blobs carve bays; a blob with a low `peak` and negative `lift` never
// breaks the surface and becomes a shoal.
export function makeWorld(o) {
  const { seed = 1, x0 = 0, y0 = 0, w, h, cell = 3 } = o;
  const N = makeNoise(seed * 7919 + 13);
  const S = o.slope ?? 320;
  const isl = o.islands.map(s => { const q = { rx: s.r, ry: s.r, rot: 0, peak: 1, lift: 0, ...s }; q.c = Math.cos(q.rot); q.s = Math.sin(q.rot); q.k = q.peak * Math.sqrt(q.rx * q.ry) / S; return q; });
  const warp = o.warp ?? 120, ws = o.warpScale ?? 300, rough = o.rough ?? 0.34, rs = o.roughScale ?? 190;
  const mid = o.mid ?? 0.1, ms = o.midScale ?? 62, fine = o.fine ?? 0.035, fs = o.fineScale ?? 19, sea = o.sea ?? 0.06;
  const height = (x, y) => {
    const wx = x + warp * N.fbm(x / ws + 31.7, y / ws + 4.1, 3), wy = y + warp * N.fbm(x / ws - 12.3, y / ws + 57.9, 3);
    let v = -1, cut = 0;
    for (const s of isl) {
      const dx = wx - s.x, dy = wy - s.y;
      const ex = (dx * s.c + dy * s.s) / s.rx, ey = (-dx * s.s + dy * s.c) / s.ry;
      const b = s.k * (1 - Math.sqrt(ex * ex + ey * ey));
      if (s.cut) { if (b > 0) cut += b * s.cut; } else if (b + s.lift > v) v = b + s.lift;
    }
    if (v < -0.9) return v;
    return v - cut + rough * N.fbm(x / rs, y / rs, 4) + mid * N.fbm(x / ms + 5.1, y / ms + 1.7, 3) + fine * N.fbm(x / fs + 9.2, y / fs - 3.3, 3) - sea;
  };
  const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1;
  const g = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    g[j * nx + i] = (i < 2 || j < 2 || i > nx - 3 || j > ny - 3) ? -1 : Math.max(-1, height(x0 + i * cell, y0 + j * cell));
  }
  // signed distance to the coast (design px): negative at sea, positive ashore
  const INF = 1e20, land = new Float64Array(nx * ny), water = new Float64Array(nx * ny);
  for (let k = 0; k < g.length; k++) { land[k] = g[k] > 0 ? 0 : INF; water[k] = g[k] > 0 ? INF : 0; }
  edt2d(land, nx, ny); edt2d(water, nx, ny);
  const sdf = new Float32Array(nx * ny);
  for (let k = 0; k < g.length; k++) sdf[k] = (g[k] > 0 ? Math.sqrt(water[k]) - 0.5 : -(Math.sqrt(land[k]) - 0.5)) * cell;
  const bil = arr => (x, y) => {
    const fx = clamp((x - x0) / cell, 0, nx - 1.001), fy = clamp((y - y0) / cell, 0, ny - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * nx + i;
    return lerp(lerp(arr[k], arr[k + 1], tx), lerp(arr[k + nx], arr[k + nx + 1], tx), ty);
  };
  const H = bil(g), D = bil(sdf);
  const level = (lv, minLen = 0) => marchingSquares(g, nx, ny, lv)
    .map(p => ({ closed: p.closed, pts: p.pts.map(q => [x0 + q[0] * cell, y0 + q[1] * cell]) }))
    .map(p => ({ ...p, len: polyLength(p.pts, p.closed) }))
    .filter(p => p.len >= minLen);
  const world = {
    x0, y0, w, h, cell, nx, ny, N, islands: isl,
    elev: H, d: D, level,
    grad: (x, y, e = cell * 1.5) => [(H(x + e, y) - H(x - e, y)) / (2 * e), (H(x, y + e) - H(x, y - e)) / (2 * e)],
    dgrad: (x, y, e = cell * 2) => { const gx = D(x + e, y) - D(x - e, y), gy = D(x, y + e) - D(x, y - e), l = Math.hypot(gx, gy) || 1; return [gx / l, gy / l]; },
  };
  world.coast = level(0, o.minCoast ?? 14);
  world.land = c => { for (const p of world.coast) tracePoly(c, p.pts, p.closed); };
  return world;
}

// Felzenszwalb squared Euclidean distance transform, in place.
function edt2d(f, nx, ny) {
  const n = Math.max(nx, ny), col = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = len => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) { const p = v[k]; s = ((col[q] + q * q) - (col[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; out[q] = (q - p) * (q - p) + col[p]; }
  };
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) col[j] = f[j * nx + i]; pass(ny); for (let j = 0; j < ny; j++) f[j * nx + i] = out[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) col[i] = f[j * nx + i]; pass(nx); for (let i = 0; i < nx; i++) f[j * nx + i] = out[i]; }
}

// Iso-lines of a grid as chained polylines (grid coordinates).
function marchingSquares(g, nx, ny, level) {
  const segA = [], segB = [], px = new Map();
  const ept = (key, i0, j0, i1, j1) => {
    if (!px.has(key)) { const a = g[j0 * nx + i0], b = g[j1 * nx + i1], t = (level - a) / (b - a); px.set(key, [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t]); }
    return key;
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const o = j * nx + i;
    const k = (g[o] > level ? 1 : 0) | (g[o + 1] > level ? 2 : 0) | (g[o + nx + 1] > level ? 4 : 0) | (g[o + nx] > level ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const T = () => ept(2 * o, i, j, i + 1, j), B = () => ept(2 * (o + nx), i, j + 1, i + 1, j + 1);
    const L = () => ept(2 * o + 1, i, j, i, j + 1), R = () => ept(2 * (o + 1) + 1, i + 1, j, i + 1, j + 1);
    const add = (p, q) => { segA.push(p); segB.push(q); };
    switch (k) {
      case 1: case 14: add(L(), T()); break;
      case 2: case 13: add(T(), R()); break;
      case 3: case 12: add(L(), R()); break;
      case 4: case 11: add(R(), B()); break;
      case 6: case 9: add(T(), B()); break;
      case 7: case 8: add(L(), B()); break;
      case 5: add(L(), T()); add(R(), B()); break;
      case 10: add(T(), R()); add(L(), B()); break;
    }
  }
  const adj = new Map();
  for (let s = 0; s < segA.length; s++) for (const k of [segA[s], segB[s]]) { let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(s); }
  const used = new Uint8Array(segA.length), out = [];
  const walk = (start, keys) => {
    let cur = start;
    for (;;) {
      let nxt = -1;
      for (const t of adj.get(cur)) if (!used[t]) { nxt = t; break; }
      if (nxt < 0) break;
      used[nxt] = 1; cur = segA[nxt] === cur ? segB[nxt] : segA[nxt]; keys.push(cur);
    }
  };
  for (let s = 0; s < segA.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const fwd = [segB[s]], back = [segA[s]];
    walk(segB[s], fwd); walk(segA[s], back);
    const keys = back.reverse().concat(fwd);
    const closed = keys.length > 3 && keys[0] === keys[keys.length - 1];
    const pts = keys.map(k => px.get(k));
    if (closed) pts.pop();
    out.push({ pts, closed });
  }
  return out;
}

// ---- polyline utilities -------------------------------------------------
export function polyLength(pts, closed) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 1) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return l;
}
// Points every `step` along a polyline, with the unit tangent: [x, y, tx, ty].
export function resample(pts, closed, step, r = null) {
  const out = [], n = pts.length, m = closed ? n : n - 1;
  let need = r ? step * r() : step / 2;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    let t = need;
    while (t <= l) { out.push([a[0] + dx * t / l, a[1] + dy * t / l, dx / l, dy / l]); t += r ? step * r.range(0.6, 1.4) : step; }
    need = t - l;
  }
  return out;
}
// Add a closed/open polyline to the current path, rounded through midpoints.
export function tracePoly(ctx, pts, closed = true) {
  const n = pts.length;
  if (n < 2) return;
  if (!closed || n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    return;
  }
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath();
}
// A straight line that a hand drew: a little bowed and shaky when pen.wob > 0.
export function handLine(ctx, pen, x0, y0, x1, y1, r) {
  if (!pen.wob || !r) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); return; }
  const l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(l / 46)), nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
  const bow = r.range(-1, 1) * Math.min(5, l * 0.006) * pen.wob;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = Math.sin(t * Math.PI) * bow + (i && i < n ? r.range(-1, 1) * 0.9 * pen.wob : 0);
    pts.push([lerp(x0, x1, t) + nx * o, lerp(y0, y1, t) + ny * o]);
  }
  tracePoly(ctx, pts, false);
}

// Stroke a polyline with a width that varies along it: widthAt(i) per point.
export function strokeVar(ctx, pts, closed, widthAt, chunk = 4) {
  const n = pts.length, m = closed ? n : n - 1;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < m; i += chunk) {
    const e = Math.min(m, i + chunk);
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]);
    let w = 0;
    for (let k = i + 1; k <= e; k++) { const p = pts[k % n]; ctx.lineTo(p[0], p[1]); w += widthAt(k % n); }
    ctx.lineWidth = w / (e - i); ctx.stroke();
  }
  ctx.restore();
}

// ---- land ---------------------------------------------------------------
// Coastline with an engraver's shadow: heavier where the shore faces away from
// the light (top-left), finer where it faces it.
export function coastline(ctx, world, { color, base = 1.6, extra = 2.2, light = [-0.6, -0.8], jitter = 0, r = null } = {}) {
  ctx.save(); ctx.strokeStyle = color;
  for (const p of world.coast) {
    const n = p.pts.length, wd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = p.pts[(i - 2 + n) % n], b = p.pts[(i + 2) % n], q = p.pts[i];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (world.elev(q[0] + nx * 6, q[1] + ny * 6) > world.elev(q[0] - nx * 6, q[1] - ny * 6)) { nx = -nx; ny = -ny; }   // now points seaward
      wd[i] = clamp(-(nx * light[0] + ny * light[1]) * 0.7 + 0.35);
    }
    const sm = new Float32Array(n), K = 5;   // smooth the shading along the shore
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -K; k <= K; k++) s += wd[(i + k + n * K) % n]; sm[i] = s / (2 * K + 1); }
    strokeVar(ctx, p.pts, p.closed, i => base + extra * sm[i] + (jitter && r ? r.range(-jitter, jitter) : 0));
  }
  ctx.restore();
}

// Short hachures running inland from the shore.
export function coastHachures(ctx, world, r, { color, step = 4.2, gap = 3, len = [5, 15], width = 1, light = [-0.6, -0.8], scale = 90 } = {}) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
  for (const p of world.coast) {
    if (p.len < 60) continue;
    for (const [x, y, tx, ty] of resample(p.pts, p.closed, step, r)) {
      let nx = -ty, ny = tx;
      if (world.elev(x + nx * 6, y + ny * 6) < world.elev(x - nx * 6, y - ny * 6)) { nx = -nx; ny = -ny; }   // points inland
      const shade = clamp((nx * light[0] + ny * light[1]) * 0.6 + 0.6);        // long on the shadowed shores
      const k = 0.5 + 0.5 * world.N.n2(x / scale + 40, y / scale - 17);
      let L = lerp(len[0], len[1], clamp(k * 0.75 + r() * 0.35)) * (0.45 + 0.75 * shade);
      const a = r.range(-0.22, 0.22), c = Math.cos(a), s = Math.sin(a), dx = nx * c - ny * s, dy = nx * s + ny * c;
      while (L > 2 && world.elev(x + dx * (gap + L), y + dy * (gap + L)) <= 0.01) L *= 0.6;
      if (L <= 2) continue;
      ctx.moveTo(x + dx * gap, y + dy * gap); ctx.lineTo(x + dx * (gap + L), y + dy * (gap + L));
    }
  }
  ctx.stroke(); ctx.restore();
}

// Hill hachures: ticks running downhill from a few height contours, heavier
// on the slopes that face away from the light.
export function reliefHachures(ctx, world, r, { color, levels = [0.2, 0.36, 0.54], step = 5, len = [4, 12], width = 1, light = [-0.6, -0.8], minLen = 50 } = {}) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
  for (const lv of levels) {
    for (const p of world.level(lv, minLen)) {
      for (const [x, y] of resample(p.pts, p.closed, step, r)) {
        const [gx, gy] = world.grad(x, y), l = Math.hypot(gx, gy);
        if (l < 1e-6) continue;
        const dx = -gx / l, dy = -gy / l, shade = -(dx * light[0] + dy * light[1]);
        if (shade < 0.12 || world.d(x, y) < 14) continue;          // only the slopes in shadow
        const L = lerp(len[0], len[1], clamp(shade)) * r.range(0.7, 1.2);
        ctx.moveTo(x, y); ctx.lineTo(x + dx * L, y + dy * L);
      }
    }
  }
  ctx.stroke(); ctx.restore();
}

// Lines parallel to the shore, `specs` = [{ d, w, color }], on the sea side
// (waterlining) or the land side. Uses the canvas stroker as an exact offsetter.
export function offsetLines(ctx, W, H, world, specs, side = 'sea', xf = null) {
  const u = W / DW, [c, t] = layer(W, H);
  if (xf) xf(t); else t.scale(u, u);
  t.lineJoin = 'round'; t.lineCap = 'round';
  for (const s of [...specs].sort((a, b) => b.d - a.d)) {
    t.globalCompositeOperation = 'source-over'; t.strokeStyle = s.color; t.lineWidth = 2 * s.d + s.w;
    t.beginPath(); world.land(t); t.stroke();
    t.globalCompositeOperation = 'destination-out'; t.lineWidth = Math.max(0.01, 2 * s.d - s.w);
    t.beginPath(); world.land(t); t.stroke();
  }
  t.globalCompositeOperation = side === 'sea' ? 'destination-out' : 'destination-in';
  t.fillStyle = '#000'; t.beginPath(); world.land(t); t.fill('evenodd');
  if (specs.breaks) {            // a hand lifts the pen now and then: rub gaps into the lines
    const { noise, scale = 26, amount = 0.3 } = specs.breaks;
    tex(t, W, H, (X, Y) => [0, 0, 0, 255 * smooth(1 - amount * 2, 1 - amount * 2 + 0.16, 0.5 + 0.5 * noise.n2(X / scale, Y / scale) + 0.25 * noise.n2(X / 7, Y / 7))], { down: 2, mode: 'destination-out' });
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore();
}

// ---- rhumb lines --------------------------------------------------------
// 32 winds from a centre; strengths for the 8 principal, 8 half and 16 quarter winds.
export function rhumbs(ctx, pen, cx, cy, { inks, width = 1.2, far = 6000, r0 = 0, rot = 0, r = null }) {
  ctx.save(); ctx.lineWidth = width; ctx.lineCap = 'butt';
  for (let cls = 2; cls >= 0; cls--) {
    if (!inks[cls]) continue;
    ctx.strokeStyle = inks[cls]; ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const c = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
      if (c !== cls) continue;
      const a = i * TAU / 32 + rot, dx = Math.sin(a), dy = -Math.cos(a);
      handLine(ctx, pen, cx + dx * r0, cy + dy * r0, cx + dx * far, cy + dy * far, r);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---- compass roses ------------------------------------------------------
const polar = (cx, cy, rot) => (deg, rad) => { const a = deg * D2R + rot; return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]; };
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }

// One tier of star points: n points, first at `off` degrees, tips at L, shoulders at s.
function starTier(ctx, pen, cx, cy, rot, n, off, L, s, half, o) {
  const P = polar(cx, cy, rot), step = 360 / n;
  for (let i = 0; i < n; i++) {
    const a = off + i * step, tip = P(a, L), l = P(a - half, s), rgt = P(a + half, s), c = [cx, cy];
    ctx.fillStyle = pen.blank; poly(ctx, [c, l, tip, rgt]); ctx.fill();
    // the lit half: solid leaf, brightest at the tip
    const g = ctx.createLinearGradient(cx, cy, tip[0], tip[1]);
    g.addColorStop(0, o.fill0); g.addColorStop(1, o.fill1);
    ctx.fillStyle = g; poly(ctx, [c, tip, rgt]); ctx.fill();
    // the shaded half: engraved with lines parallel to its outer edge
    if (o.hatch) {
      ctx.save(); poly(ctx, [c, l, tip]); ctx.clip();
      ctx.strokeStyle = o.hatch; ctx.lineWidth = o.hatchW || 1; ctx.beginPath();
      const ex = tip[0] - l[0], ey = tip[1] - l[1], el = Math.hypot(ex, ey);
      let nx = -ey / el, ny = ex / el;
      if ((cx - l[0]) * nx + (cy - l[1]) * ny < 0) { nx = -nx; ny = -ny; }
      for (let d = o.hatchGap; d < s * 1.2; d += o.hatchGap) { ctx.moveTo(l[0] + nx * d - ex, l[1] + ny * d - ey); ctx.lineTo(tip[0] + nx * d + ex, tip[1] + ny * d + ey); }
      ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = o.line; ctx.lineWidth = o.lineW; ctx.lineJoin = 'miter'; ctx.miterLimit = 12;
    poly(ctx, [c, l, tip, rgt]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
  }
}

// The fleur-de-lis, in a unit box: tip at (0,-1), band at y = 0..0.09, tail to y = 0.42.
function fleurPaths(c) {
  const petal = s => {       // a side petal, s = +1 right / -1 left
    c.moveTo(0.085 * s, 0.0);
    c.bezierCurveTo(0.10 * s, -0.24, 0.17 * s, -0.53, 0.36 * s, -0.61);
    c.bezierCurveTo(0.53 * s, -0.67, 0.68 * s, -0.53, 0.635 * s, -0.36);
    c.bezierCurveTo(0.61 * s, -0.26, 0.52 * s, -0.20, 0.44 * s, -0.245);
    c.bezierCurveTo(0.52 * s, -0.29, 0.545 * s, -0.40, 0.47 * s, -0.45);
    c.bezierCurveTo(0.385 * s, -0.51, 0.285 * s, -0.40, 0.245 * s, -0.24);
    c.bezierCurveTo(0.225 * s, -0.14, 0.215 * s, -0.06, 0.21 * s, 0.0);
    c.closePath();
  };
  const tail = s => {
    c.moveTo(0.085 * s, 0.09);
    c.bezierCurveTo(0.10 * s, 0.17, 0.20 * s, 0.26, 0.35 * s, 0.235);
    c.bezierCurveTo(0.27 * s, 0.215, 0.215 * s, 0.155, 0.205 * s, 0.09);
    c.closePath();
  };
  // centre petal
  c.moveTo(0, -1.0);
  c.bezierCurveTo(0.045, -0.86, 0.205, -0.66, 0.19, -0.44);
  c.bezierCurveTo(0.178, -0.27, 0.085, -0.13, 0.062, 0.0);
  c.lineTo(-0.062, 0.0);
  c.bezierCurveTo(-0.085, -0.13, -0.178, -0.27, -0.19, -0.44);
  c.bezierCurveTo(-0.205, -0.66, -0.045, -0.86, 0, -1.0);
  c.closePath();
  petal(1); petal(-1); tail(1); tail(-1);
  // band
  c.rect(-0.275, 0.0, 0.55, 0.09);
  // centre tail
  c.moveTo(-0.06, 0.09); c.bezierCurveTo(-0.07, 0.2, -0.03, 0.33, 0, 0.42); c.bezierCurveTo(0.03, 0.33, 0.07, 0.2, 0.06, 0.09); c.closePath();
}
export function fleurDeLis(ctx, pen, x, y, size, { rot = 0, fill, line, lineW = 1.4, vein, knock = true } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(size, size);
  ctx.lineJoin = 'round';
  if (knock) { ctx.fillStyle = pen.blank; ctx.strokeStyle = pen.blank; ctx.lineWidth = 7 / size; ctx.beginPath(); fleurPaths(ctx); ctx.fill(); ctx.stroke(); }
  if (fill) { ctx.fillStyle = fill; ctx.beginPath(); fleurPaths(ctx); ctx.fill(); }
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = lineW / size; ctx.beginPath(); fleurPaths(ctx); ctx.stroke(); }
  if (vein) {                 // a dark spine down each petal, as if chased into the leaf
    ctx.strokeStyle = vein; ctx.lineWidth = 1.5 / size; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(0, -0.84); ctx.lineTo(0, -0.05);
    for (const s of [1, -1]) { ctx.moveTo(0.15 * s, -0.05); ctx.bezierCurveTo(0.16 * s, -0.3, 0.27 * s, -0.52, 0.42 * s, -0.535); ctx.bezierCurveTo(0.52 * s, -0.54, 0.585 * s, -0.47, 0.575 * s, -0.385); }
    ctx.stroke();
  }
  ctx.restore();
}

// The large rose: graduated ring, lettered band, 32-point star, fleur-de-lis north.
export function compassRose(ctx, pen, cx, cy, R, o = {}) {
  const rot = o.rot ?? 0, P = polar(cx, cy, rot), ink = o.ink || pen.a, k = R / 440;
  const circle = (rad, w, col) => { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); };
  ctx.save();
  ctx.fillStyle = pen.blank; ctx.beginPath(); ctx.arc(cx, cy, R * 1.012, 0, TAU); ctx.fill();
  if (o.tint) { ctx.fillStyle = o.tint; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); }
  // graduated ring
  circle(R, 3.4 * k, ink(1)); circle(R * 0.982, 1.1 * k, ink(0.8));
  ctx.strokeStyle = ink(0.8); ctx.lineCap = 'butt';
  for (const [every, r1, w] of [[1, 0.964, 1], [5, 0.952, 1.2], [10, 0.94, 1.5]]) {
    ctx.beginPath();
    for (let d = 0; d < 360; d += every) { if (every === 1 && d % 5 === 0) continue; if (every === 5 && d % 10 === 0) continue; const a = P(d, R * 0.982), b = P(d, R * r1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.lineWidth = w * k; ctx.stroke();
  }
  circle(R * 0.934, 1.1 * k, ink(0.8));
  ctx.fillStyle = ink(0.86);
  for (let d = 0; d < 360; d += 10) {           // chequered band
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.934, (d - 90) * D2R + rot, (d + 5 - 90) * D2R + rot); ctx.arc(cx, cy, R * 0.908, (d + 5 - 90) * D2R + rot, (d - 90) * D2R + rot, true); ctx.closePath(); ctx.fill();
  }
  circle(R * 0.908, 1.1 * k, ink(0.8));
  // lettered band
  circle(R * 0.80, 1.6 * k, ink(0.9)); circle(R * 0.786, 1 * k, ink(0.7));
  const names = o.names || ['', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.fillStyle = ink(0.95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 16; i++) {
    const d = i * 22.5, p = P(d, R * 0.853);
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(d * D2R + rot);
    if (i % 2 === 0 && names[i / 2]) {
      const big = i % 4 === 0;
      ctx.font = `${big ? '' : 'italic '}${(big ? 0.082 : 0.058) * R}px "${o.font || 'C059'}"`;
      ctx.fillText(names[i / 2], 0, R * 0.004);
    } else if (i % 2 === 1) {                     // a small lozenge on the half-winds
      const s = R * 0.017; poly(ctx, [[0, -s * 1.5], [s, 0], [0, s * 1.5], [-s, 0]]); ctx.fill();
    }
    ctx.restore();
  }
  // guide circles behind the star
  const Rs = R * 0.786;
  circle(Rs * 0.62, 1 * k, ink(0.5)); circle(Rs * 0.60, 1 * k, ink(0.34)); circle(Rs * 0.36, 1 * k, ink(0.45));
  // faint spokes for the 32 winds, out to the ring
  ctx.strokeStyle = ink(0.34); ctx.lineWidth = 1 * k; ctx.beginPath();
  for (let i = 0; i < 32; i++) { const a = P(i * 11.25, Rs * 0.3), b = P(i * 11.25, Rs); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  // the star, smallest points first
  const T = (n, off, L, s, half, f0, f1, hatch, gap) => starTier(ctx, pen, cx, cy, rot, n, off, Rs * L, Rs * s, half,
    { fill0: ink(f0), fill1: ink(f1), line: ink(0.95), lineW: 1.3 * k, hatch: hatch ? ink(hatch) : null, hatchGap: gap * k, hatchW: 1 * k });
  T(16, 11.25, 0.47, 0.30, 5.625, 0.42, 0.7, 0, 0);
  T(8, 22.5, 0.64, 0.27, 11.25, 0.5, 0.85, 0, 0);
  T(4, 45, 0.82, 0.22, 22.5, 0.6, 1.02, 0.5, 5.5);
  T(4, 0, 1.0, 0.17, 45, 0.7, 1.22, 0.55, 5);
  // hub
  ctx.fillStyle = pen.blank; ctx.beginPath(); ctx.arc(cx, cy, Rs * 0.062, 0, TAU); ctx.fill();
  circle(Rs * 0.062, 1.6 * k, ink(1)); circle(Rs * 0.036, 1 * k, ink(0.8));
  ctx.fillStyle = ink(1.2); ctx.beginPath(); ctx.arc(cx, cy, Rs * 0.014, 0, TAU); ctx.fill();
  // north: fleur-de-lis standing on the ring; east: a small cross
  const n = P(0, R * 1.068);
  fleurDeLis(ctx, pen, n[0], n[1], R * 0.27, { rot, fill: ink(1.12), line: ink(1.3), lineW: 1.2 * k, vein: ink(0.3) });
  const e = P(90, R * 1.075), s = R * 0.03;
  ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(rot); ctx.fillStyle = ink(1);
  ctx.beginPath();
  for (let q = 0; q < 4; q++) { ctx.rotate(TAU / 4); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.42, -s * 1.5); ctx.lineTo(s * 0.42, -s * 1.5); ctx.closePath(); }
  ctx.fill(); ctx.restore();
  ctx.restore();
}

// A small wind rose for the secondary rhumb centres.
export function windRose(ctx, pen, cx, cy, R, o = {}) {
  const rot = o.rot ?? 0, ink = o.ink || pen.a, k = R / 100, P = polar(cx, cy, rot);
  ctx.save();
  ctx.fillStyle = pen.blank; ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, TAU); ctx.fill();
  for (const [rad, w, s] of [[1, 2.2, 0.95], [0.93, 1, 0.7], [0.56, 1, 0.5]]) { ctx.beginPath(); ctx.arc(cx, cy, R * rad, 0, TAU); ctx.lineWidth = w * k; ctx.strokeStyle = ink(s); ctx.stroke(); }
  ctx.strokeStyle = ink(0.7); ctx.lineWidth = 1 * k; ctx.beginPath();
  for (let i = 0; i < 32; i++) { const a = P(i * 11.25, R * 0.93), b = P(i * 11.25, R * (i % 2 ? 0.87 : 0.82)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  const T = (n, off, L, s, half, f0, f1) => starTier(ctx, pen, cx, cy, rot, n, off, R * L, R * s, half, { fill0: ink(f0), fill1: ink(f1), line: ink(0.9), lineW: 1.1 * k });
  T(8, 22.5, 0.5, 0.2, 11.25, 0.4, 0.7);
  T(4, 45, 0.64, 0.18, 22.5, 0.5, 0.85);
  T(4, 0, 0.82, 0.14, 45, 0.6, 1.1);
  if (o.fleur) { const n = P(0, R * 1.07); fleurDeLis(ctx, pen, n[0], n[1], R * o.fleur, { rot, fill: ink(0.95), line: ink(1.1), lineW: 1.2, vein: pen.dark ? ink(0.3) : pen.blank }); }
  else { ctx.fillStyle = ink(1.1); poly(ctx, [P(0, R * 1.3), P(6.5, R * 1.02), P(0, R * 1.08), P(-6.5, R * 1.02)]); ctx.fill(); }
  ctx.restore();
}

// ---- neatline -----------------------------------------------------------
// A double border with a graduated scale: alternating blocks every `sub` of a
// degree, numerals on the whole degrees. (x, y, w, h) is the map area.
export function neatline(ctx, pen, x, y, w, h, o = {}) {
  const ink = o.ink || pen.a, band = o.band ?? 18, margin = o.margin ?? 40, deg = o.deg ?? 236, sub = o.sub ?? 6;
  const lon0 = o.lon0 ?? 74.37, lat0 = o.lat0 ?? 21.3, font = o.font || 'C059', fs = o.fontSize ?? 23, r = o.r;
  const line = (x0, y0, x1, y1) => handLine(ctx, pen, x0, y0, x1, y1, r);
  const rect = (g, lw, s) => { ctx.strokeStyle = ink(s); ctx.lineWidth = lw; ctx.beginPath(); line(x - g, y - g, x + w + g, y - g); line(x + w + g, y - g, x + w + g, y + h + g); line(x + w + g, y + h + g, x - g, y + h + g); line(x - g, y + h + g, x - g, y - g); ctx.stroke(); };
  ctx.save(); ctx.lineCap = 'square';
  rect(0, 1.6, 0.9); rect(band, 1.3, 0.85); rect(band + margin, 4.6, 1); rect(band + margin - 9, 1.2, 0.8);
  // scale blocks + ticks. t: 0..len along a side; pos(t, g) -> point at offset g outward
  const side = (len, pos, v0, dir, vertical) => {
    // the value at t is v0 + dir * t / deg; blocks align to whole sub-degrees
    const vAt = t => v0 + dir * t / deg, tOf = v => (v - v0) * deg / dir;
    const vA = vAt(0), vB = vAt(len), lo = Math.min(vA, vB), hi = Math.max(vA, vB);
    ctx.fillStyle = ink(o.fill ?? 0.82);
    for (let q = Math.floor(lo * sub); q <= Math.ceil(hi * sub); q++) {
      const t0 = clamp(tOf(q / sub), 0, len), t1 = clamp(tOf((q + 1) / sub), 0, len);
      if (Math.abs(t1 - t0) < 0.5) continue;
      if (((q % 2) + 2) % 2 === 0) { const a = pos(Math.min(t0, t1), 0), b = pos(Math.max(t0, t1), band); ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
    }
    ctx.strokeStyle = ink(0.8); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let q = Math.ceil(lo * sub); q <= Math.floor(hi * sub); q++) {
      const t = tOf(q / sub); if (t < 1 || t > len - 1) continue;
      const whole = ((q % sub) + sub) % sub === 0, a = pos(t, 0), b = pos(t, band + (whole ? 9 : 0));
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.fillStyle = ink(0.9); ctx.font = `${fs}px "${font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
      const t = tOf(d); if (t < 46 || t > len - 46) continue;
      const p = pos(t, band + margin * 0.5 - 2);
      ctx.save(); ctx.translate(p[0], p[1]); if (vertical) ctx.rotate(vertical); ctx.fillText(`${d}°`, 0, 1); ctx.restore();
    }
  };
  side(w, (t, g) => [x + t, y - g], lon0, -1, 0);
  side(w, (t, g) => [x + t, y + h + g], lon0, -1, 0);
  side(h, (t, g) => [x - g, y + t], lat0, -1, -Math.PI / 2);
  side(h, (t, g) => [x + w + g, y + t], lat0, -1, Math.PI / 2);
  // corner blocks
  for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x + w, y + h, 1, 1], [x, y + h, -1, 1]]) {
    ctx.fillStyle = pen.blank; ctx.fillRect(Math.min(cx, cx + sx * band), Math.min(cy, cy + sy * band), band, band);
    ctx.strokeStyle = ink(0.85); ctx.lineWidth = 1.3; ctx.strokeRect(Math.min(cx, cx + sx * band), Math.min(cy, cy + sy * band), band, band);
    ctx.fillStyle = ink(0.9); ctx.beginPath(); ctx.arc(cx + sx * band / 2, cy + sy * band / 2, band * 0.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---- lettering ----------------------------------------------------------
export function text(ctx, str, x, y, { size = 34, font = 'P052', style = 'italic', spacing = 0, align = 'center', rot = 0, color, base = 'alphabetic', halo = null, haloW = 7 } = {}) {
  ctx.save();
  ctx.font = `${style} ${size}px "${font}"`;
  ctx.letterSpacing = `${spacing}px`; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.translate(x, y); ctx.rotate(rot);
  if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = haloW; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(str, 0, 0);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}
// Lettering along a circular arc centred on (cx, cy); `mid` is the bearing (deg,
// 0 = up) of the middle of the text. Negative radius sets it along the inside.
export function arcText(ctx, str, cx, cy, rad, mid, { size = 34, font = 'P052', style = 'italic', spacing = 0, color, halo = null, haloW = 7 } = {}) {
  ctx.save();
  ctx.font = `${style} ${size}px "${font}"`; ctx.letterSpacing = '0px'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  const chars = [...str], ws = chars.map(c => ctx.measureText(c).width + spacing), total = ws.reduce((a, b) => a + b, 0) - spacing;
  const R = Math.abs(rad), sgn = rad < 0 ? -1 : 1;
  let s = -total / 2;
  chars.forEach((c, i) => {
    const mid_s = s + (ws[i] - spacing) / 2, a = mid * D2R + sgn * mid_s / R;
    ctx.save(); ctx.translate(cx + R * Math.sin(a), cy - R * Math.cos(a)); ctx.rotate(a + (sgn < 0 ? Math.PI : 0));
    if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = haloW; ctx.lineJoin = 'round'; ctx.strokeText(c, 0, 0); }
    ctx.fillText(c, 0, 0); ctx.restore();
    s += ws[i];
  });
  ctx.restore();
}

// ---- soundings ----------------------------------------------------------
// Scatter depth figures over the near-shore sea. `free(x, y, r)` vetoes spots.
export function soundings(ctx, world, r, { color, size = 21, font = 'C059', style = 'italic', count = 260, near = 26, far = 300, sep = 62, free = () => true, extra = [] } = {}) {
  const placed = [];
  const fr = ['', '', '¼', '½', '¾'];
  const fathoms = (x, y) => {
    const d = -world.d(x, y), v = 1.2 + Math.pow(d / 11, 1.12) * (0.8 + 0.4 * (0.5 + 0.5 * world.N.n2(x / 140 + 3, y / 140 + 8)));
    if (v < 6) { const whole = Math.max(1, Math.floor(v)); return `${whole}${r.pick(fr)}`; }
    return `${Math.round(v)}`;
  };
  const tryAt = (x, y) => {
    const d = world.d(x, y);
    if (d > -near || !free(x, y, size)) return false;
    for (const p of placed) if (Math.hypot(p[0] - x, p[1] - y) < sep) return false;
    placed.push([x, y]); return true;
  };
  for (const p of extra) tryAt(p[0], p[1]);
  for (let i = 0, tries = 0; placed.length < count && tries < count * 60; tries++) {
    const x = world.x0 + r() * world.w, y = world.y0 + r() * world.h, d = world.d(x, y);
    if (d < -far) continue;
    // denser close inshore, thinning out to sea
    if (r() > 1 - smooth(near, far, -d) * 0.86 && tryAt(x, y)) i++;
  }
  ctx.save(); ctx.fillStyle = color; ctx.font = `${style} ${size}px "${font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [x, y] of placed) ctx.fillText(fathoms(x, y), x, y);
  ctx.restore();
  return placed;
}

// Shoal lines (dotted iso-line just below the surface) and rocks awash (+).
export function shoals(ctx, world, r, { color, rock, level = -0.085, dot = 2.2, gap = 8.5, minLen = 40, crosses = 0.011, crossSize = 5 } = {}) {
  const loops = world.level(level, minLen);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = dot; ctx.lineCap = 'round'; ctx.setLineDash([0.01, gap]);
  ctx.beginPath(); for (const p of loops) tracePoly(ctx, p.pts, p.closed); ctx.stroke();
  ctx.setLineDash([]);
  // rocks: little crosses on the shallowest water, sown along the shoal lines
  ctx.strokeStyle = rock || color; ctx.lineWidth = 1.3; ctx.beginPath();
  for (const p of loops) {
    for (const [x, y] of resample(p.pts, p.closed, 1 / crosses, r)) {
      // step toward the shallows
      const [gx, gy] = world.grad(x, y), l = Math.hypot(gx, gy) || 1, q = r.range(4, 16);
      const cx = x + gx / l * q + r.range(-5, 5), cy = y + gy / l * q + r.range(-5, 5);
      if (world.elev(cx, cy) > -0.01) continue;
      const s = crossSize * r.range(0.75, 1.2);
      ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
    }
  }
  ctx.stroke(); ctx.restore();
  return loops;
}

// ---- course -------------------------------------------------------------
// A* over a coarse grid, then pulled taut into straight legs that keep `clear`
// px off the land and out of the `avoid` circles: a dead-reckoning track.
export function findCourse(world, a, b, { clear = 34, avoid = [], cell = 18, hug = 0 } = {}) {
  const nx = Math.floor(world.w / cell), ny = Math.floor(world.h / cell);
  const X = i => world.x0 + (i + 0.5) * cell, Y = j => world.y0 + (j + 0.5) * cell;
  const blocked = (x, y) => {
    if (x < world.x0 + 30 || y < world.y0 + 30 || x > world.x0 + world.w - 30 || y > world.y0 + world.h - 30) return true;
    if (world.d(x, y) > -clear) return true;
    for (const c of avoid) if (Math.hypot(x - c[0], y - c[1]) < c[2]) return true;
    return false;
  };
  const bl = new Uint8Array(nx * ny), pen = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    bl[j * nx + i] = blocked(X(i), Y(j)) ? 1 : 0;
    pen[j * nx + i] = hug ? hug * smooth(-clear * 4, -clear, world.d(X(i), Y(j))) : 0;
  }
  const nearest = p => { let best = -1, bd = 1e9; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (bl[j * nx + i]) continue; const d = Math.hypot(X(i) - p[0], Y(j) - p[1]); if (d < bd) { bd = d; best = j * nx + i; } } return best; };
  const s = nearest(a), t = nearest(b);
  const gs = new Float32Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1), done = new Uint8Array(nx * ny);
  const open = [[0, s]]; gs[s] = 0;                              // small binary heap on f
  const push = e => { open.push(e); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (rr < open.length && open[rr][0] < open[m][0]) m = rr; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  const ti = t % nx, tj = Math.floor(t / nx);
  while (open.length) {
    const [, cur] = pop();
    if (done[cur]) continue; done[cur] = 1;
    if (cur === t) break;
    const ci = cur % nx, cj = Math.floor(cur / nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const k = j * nx + i; if (bl[k] || done[k]) continue;
      const g = gs[cur] + Math.hypot(di, dj) * (1 + pen[k]);
      if (g < gs[k]) { gs[k] = g; from[k] = cur; push([g + Math.hypot(i - ti, j - tj), k]); }
    }
  }
  if (from[t] < 0 && t !== s) return [a, b];
  const path = [];
  for (let k = t; k >= 0; k = from[k]) path.push([X(k % nx), Y(Math.floor(k / nx))]);
  path.reverse();
  const los = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(l / 7); for (let i = 1; i < n; i++) if (blocked(lerp(p[0], q[0], i / n), lerp(p[1], q[1], i / n))) return false; return true; };
  const legs = [path[0]];
  for (let i = 0; i < path.length - 1;) {
    let j = path.length - 1;
    while (j > i + 1 && !los(path[i], path[j])) j--;
    legs.push(path[j]); i = j;
  }
  return [a, ...legs, b];
}

// Draw a course: dashed legs, a small circled fix at each turn, and an X at the end.
export function course(ctx, pen, legs, { color, mark, width = 2.2, dash = [15, 10], fix = 6.5, xSize = 22, xWidth = 5, r = null } = {}) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.setLineDash(dash); ctx.beginPath();
  for (let i = 1; i < legs.length; i++) {
    const p = legs[i - 1], q = legs[i], l = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / l, uy = (q[1] - p[1]) / l;
    const g0 = i === 1 ? 4 : fix + 4, g1 = i === legs.length - 1 ? xSize * 0.9 : fix + 4;
    if (l <= g0 + g1) continue;
    handLine(ctx, pen, p[0] + ux * g0, p[1] + uy * g0, q[0] - ux * g1, q[1] - uy * g1, r);
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 1.5; ctx.fillStyle = color;
  for (let i = 1; i < legs.length - 1; i++) {
    ctx.beginPath(); ctx.arc(legs[i][0], legs[i][1], fix, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(legs[i][0], legs[i][1], 1.7, 0, TAU); ctx.fill();
  }
  const e = legs[legs.length - 1];
  ctx.strokeStyle = mark || color; ctx.lineWidth = xWidth; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(e[0] - xSize, e[1] - xSize * 0.9); ctx.lineTo(e[0] + xSize, e[1] + xSize * 0.9);
  ctx.moveTo(e[0] + xSize * 0.95, e[1] - xSize); ctx.lineTo(e[0] - xSize * 0.95, e[1] + xSize);
  ctx.stroke(); ctx.restore();
}

// ---- cartouche + scale bar ----------------------------------------------
// A plaque with scooped corners and a double rule. Text is set by the caller.
export function cartouche(ctx, pen, x, y, w, h, { ink = pen.a, c = 30, inset = 11 } = {}) {
  const frame = (g, rad) => {
    const X = x + g, Y = y + g, Wd = w - 2 * g, Hd = h - 2 * g;
    ctx.beginPath();
    ctx.moveTo(X + rad, Y); ctx.lineTo(X + Wd - rad, Y); ctx.arc(X + Wd, Y, rad, Math.PI, Math.PI / 2, true);
    ctx.lineTo(X + Wd, Y + Hd - rad); ctx.arc(X + Wd, Y + Hd, rad, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(X + rad, Y + Hd); ctx.arc(X, Y + Hd, rad, 0, -Math.PI / 2, true);
    ctx.lineTo(X, Y + rad); ctx.arc(X, Y, rad, Math.PI / 2, 0, true); ctx.closePath();
  };
  ctx.save(); ctx.lineJoin = 'round';
  ctx.fillStyle = pen.blank; ctx.strokeStyle = pen.blank; ctx.lineWidth = 16; frame(0, c); ctx.fill(); ctx.stroke();
  if (pen.dark) { ctx.fillStyle = ink(0.045); frame(0, c); ctx.fill(); }
  ctx.strokeStyle = ink(1); ctx.lineWidth = 2.8; frame(0, c); ctx.stroke();
  ctx.strokeStyle = ink(0.75); ctx.lineWidth = 1.1; frame(inset, c); ctx.stroke();
  ctx.fillStyle = ink(1);
  for (const [px, py] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) {      // a bead in each scoop
    ctx.beginPath(); ctx.arc(px + (px > x ? -1 : 1) * c * 0.36, py + (py > y ? -1 : 1) * c * 0.36, 3.6, 0, TAU); ctx.fill();
  }
  for (const py of [y, y + h]) {                                                 // lozenge finials top and bottom
    const s = py === y ? -1 : 1;
    poly(ctx, [[x + w / 2, py + s * 20], [x + w / 2 + 9, py + s * 0], [x + w / 2, py - s * 20], [x + w / 2 - 9, py + s * 0]]);
    ctx.fillStyle = pen.blank; ctx.fill(); ctx.fillStyle = ink(1); poly(ctx, [[x + w / 2, py + s * 14], [x + w / 2 + 6, py], [x + w / 2, py - s * 14], [x + w / 2 - 6, py]]); ctx.fill();
  }
  ctx.restore();
}
// A divided scale: `marks` are the labelled values; the first interval is subdivided.
export function scaleBar(ctx, pen, x, y, w, { ink = pen.a, marks = [0, 5, 10, 20, 30], hgt = 9, font = 'C059', size = 20, label = 'Leagues', labelFont = 'P052' } = {}) {
  const max = marks[marks.length - 1], X = v => x + w * v / max;
  ctx.save();
  ctx.strokeStyle = ink(0.9); ctx.lineWidth = 1.3; ctx.strokeRect(x, y, w, hgt);
  ctx.fillStyle = ink(0.9);
  const sub = marks[1] - marks[0];
  for (let i = 0; i < sub; i += 2) ctx.fillRect(X(i), y, X(i + 1) - X(i), hgt / 2);
  for (let i = 1; i < sub; i += 2) ctx.fillRect(X(i), y + hgt / 2, X(i + 1) - X(i), hgt / 2);
  for (let i = 1; i < marks.length - 1; i++) { if (i % 2 === 1) ctx.fillRect(X(marks[i]), y, X(marks[i + 1]) - X(marks[i]), hgt); }
  ctx.font = `${size}px "${font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.beginPath();
  for (const m of marks) { ctx.moveTo(X(m), y); ctx.lineTo(X(m), y - 6); ctx.fillText(`${m}`, X(m), y - 11); }
  ctx.stroke();
  if (label) { ctx.font = `italic ${size + 2}px "${labelFont}"`; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + hgt + size + 8); }
  ctx.restore();
}

// ---- sea serpent --------------------------------------------------------
export function spline(ctrl, per = 12) {
  const out = [], n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(q => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3)));
    }
  }
  out.push(ctrl[n - 1].slice());
  return out;
}
// Offset both sides of a centre line: returns [belly side (+n), back side (-n), frames].
function ribbon(pts, wAt) {
  const n = pts.length, A = [], B = [], F = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = wAt(i / (n - 1)) / 2;
    A.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); B.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    F.push([tx, ty, w]);
  }
  return [A, B, F];
}
// A serpent in loops, head to the left (flip to face right). (x, y) is where the
// neck meets the water; s scales the ~780 x 230 design.
export function serpent(ctx, pen, x, y, s, o = {}) {
  const ink = o.ink || pen.a, flip = o.flip ? -1 : 1, lw = w => w / s, humps = o.humps ?? 3;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const arch = (cx, a, b) => { const p = [[cx - a - 2, 30]]; for (let i = 0; i <= 30; i++) { const th = Math.PI * (1 - i / 30); p.push([cx + a * Math.cos(th), -b * Math.sin(th) + 4]); } p.push([cx + a + 2, 30]); return spline(p, 2); };
  const secs = [{ pts: spline([[-112, -166], [-70, -183], [-26, -160], [6, -104], [16, -40], [6, 30]], 16), w: [31, 47], head: true }];
  const H = [[182, 80, 84, 45, 41], [352, 62, 60, 37, 33], [486, 46, 38, 28, 24]].slice(0, humps);
  for (const [cx, a, b, w0, w1] of H) secs.push({ pts: arch(cx, a, b), w: [w0, w1] });
  const tx0 = H.length ? H[H.length - 1][0] + H[H.length - 1][1] + 52 : 110;
  secs.push({ pts: spline([[tx0, 28], [tx0 - 2, -14], [tx0 + 10, -50], [tx0 + 40, -66], [tx0 + 70, -58], [tx0 + 92, -76]], 14), w: [19, 2.5], tail: true });

  // ripples where the body breaks the surface (behind the body)
  const entries = [];
  for (const sc of secs) {
    const n = sc.pts.length;
    for (const i of sc.head ? [n - 1] : sc.tail ? [0] : [0, n - 1]) entries.push([sc.pts[i][0], lerp(sc.w[0], sc.w[1], i / (n - 1))]);
  }
  ctx.strokeStyle = ink(0.62); ctx.lineWidth = lw(1.15);
  const ripple = (front) => {
    ctx.beginPath();
    for (const [ex, w] of entries) {
      for (const [k, e] of [[0.95, 0.24], [1.5, 0.3], [2.15, 0.34]]) {
        const rx = w * k, ry = w * k * e;
        if (front) { ctx.moveTo(ex + rx, 0); ctx.ellipse(ex, 0, rx, ry, 0, 0, Math.PI); }
        else { ctx.moveTo(ex - rx * 0.86, -ry * 0.5); ctx.ellipse(ex, 0, rx, ry, 0, Math.PI * 1.17, Math.PI * 1.83); }
      }
    }
    ctx.stroke();
  };
  ripple(false);

  for (const sc of secs) {
    const wAt = t => lerp(sc.w[0], sc.w[1], sc.tail ? Math.pow(t, 0.8) : t);
    const [A, B, F] = ribbon(sc.pts, wAt), n = sc.pts.length;
    let outline = A.concat(B.slice().reverse());
    let HP = null;
    if (sc.head) {
      const O = sc.pts[0], f = [-F[0][0], -F[0][1]], up = [F[0][1], -F[0][0]];
      HP = (a, b) => [O[0] + f[0] * a + up[0] * b, O[1] + f[1] * a + up[1] * b];
      const head = [[6, 21], [20, 27], [36, 24], [52, 18], [68, 14], [80, 16], [90, 12], [97, 3], [97, 3], [90, -2], [70, -3.5], [50, -5], [33, -8], [33, -8], [52, -14], [72, -19], [87, -21], [87, -21], [80, -27], [60, -29], [38, -28], [18, -23]].map(p => HP(p[0], p[1]));
      outline = A.concat(B.slice().reverse(), head);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(-400, -400, 1600, 400 + 2.5); ctx.clip();
    ctx.fillStyle = pen.blank; ctx.beginPath(); tracePoly(ctx, outline, true); ctx.fill();
    if (pen.dark) { ctx.fillStyle = ink(0.06); ctx.beginPath(); tracePoly(ctx, outline, true); ctx.fill(); }
    ctx.save(); ctx.beginPath(); tracePoly(ctx, outline, true); ctx.clip();
    // belly plates
    const belly = sc.pts.map((p, i) => [p[0] - F[i][1] * F[i][2] * 0.36, p[1] + F[i][0] * F[i][2] * 0.36]);
    ctx.strokeStyle = ink(0.7); ctx.lineWidth = lw(1.1);
    ctx.beginPath(); tracePoly(ctx, belly, false); ctx.stroke();
    ctx.beginPath();
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += Math.hypot(sc.pts[i][0] - sc.pts[i - 1][0], sc.pts[i][1] - sc.pts[i - 1][1]);
      if (acc > 6.5) { acc = 0; ctx.moveTo(belly[i][0], belly[i][1]); ctx.lineTo(A[i][0], A[i][1]); }
    }
    ctx.stroke();
    // scales: two staggered rows of small arcs on the back
    ctx.strokeStyle = ink(0.6); ctx.lineWidth = lw(1); ctx.beginPath();
    for (const [row, off] of [[0.02, 0], [0.5, 0.5]]) {
      let a2 = off * 10;
      for (let i = 2; i < n - 1; i++) {
        a2 += Math.hypot(sc.pts[i][0] - sc.pts[i - 1][0], sc.pts[i][1] - sc.pts[i - 1][1]);
        if (a2 < 10) continue; a2 = 0;
        const w = F[i][2]; if (w < 9) continue;
        const cx = sc.pts[i][0] + F[i][1] * w * row, cy = sc.pts[i][1] - F[i][0] * w * row, ang = Math.atan2(F[i][1], F[i][0]);
        ctx.moveTo(cx + Math.cos(ang - 1.25) * 4.2, cy + Math.sin(ang - 1.25) * 4.2); ctx.arc(cx, cy, 4.2, ang - 1.25, ang + 1.25);
      }
    }
    ctx.stroke();
    ctx.restore();
    // dorsal spines along the back, raked toward the tail
    if (!sc.tail) {
      ctx.fillStyle = ink(0.95); ctx.beginPath();
      let a3 = 12;
      for (let i = sc.head ? 5 : 2; i < n - 3; i++) {
        a3 += Math.hypot(sc.pts[i][0] - sc.pts[i - 1][0], sc.pts[i][1] - sc.pts[i - 1][1]);
        if (a3 < 19) continue; a3 = 0;
        const [tx, ty, w] = F[i], hgt = w * 0.5 + 4, bx = B[i][0], by = B[i][1];
        ctx.moveTo(bx - tx * 5.5, by - ty * 5.5); ctx.lineTo(bx + ty * hgt + tx * 9, by - tx * hgt + ty * 9); ctx.lineTo(bx + tx * 5.5, by + ty * 5.5); ctx.closePath();
      }
      ctx.fill();
    }
    // outline
    ctx.strokeStyle = ink(1); ctx.lineWidth = lw(1.9);
    if (sc.head) { ctx.beginPath(); tracePoly(ctx, outline, true); ctx.stroke(); } else { ctx.beginPath(); tracePoly(ctx, A, false); ctx.stroke(); ctx.beginPath(); tracePoly(ctx, B, false); ctx.stroke(); }
    if (sc.tail) {            // a small spade at the tip
      const e = sc.pts[n - 1], [tx, ty] = F[n - 1], nx = -ty, ny = tx;
      const q = (a, b) => [e[0] + tx * a + nx * b, e[1] + ty * a + ny * b];
      ctx.fillStyle = ink(0.95); ctx.beginPath(); tracePoly(ctx, [q(-6, 0), q(2, 9), q(14, 6), q(28, 0), q(14, -6), q(2, -9)], true); ctx.fill();
    }
    if (HP) {
      const P2 = (a, b) => HP(a, b);
      // crest swept back from the skull, and a barbel under the jaw
      ctx.fillStyle = ink(0.95); ctx.beginPath(); tracePoly(ctx, [P2(20, 26), P2(2, 40), P2(-30, 50), P2(-10, 33), P2(-34, 34), P2(-8, 22), P2(4, 19)], true); ctx.fill();
      ctx.strokeStyle = ink(0.9); ctx.lineWidth = lw(1.5); ctx.beginPath(); tracePoly(ctx, [P2(26, -26), P2(18, -40), P2(2, -50), P2(-12, -48)], false); ctx.stroke();
      // eye, brow, nostril
      const e = P2(36, 13); ctx.fillStyle = pen.blank; ctx.beginPath(); ctx.arc(e[0], e[1], 5, 0, TAU); ctx.fill();
      ctx.lineWidth = lw(1.3); ctx.beginPath(); ctx.arc(e[0], e[1], 4.6, 0, TAU); ctx.stroke();
      ctx.fillStyle = ink(1.1); ctx.beginPath(); ctx.arc(e[0] - 1, e[1], 2, 0, TAU); ctx.fill();
      ctx.beginPath(); tracePoly(ctx, [P2(24, 19), P2(36, 21.5), P2(50, 15)], false); ctx.stroke();
      const nn = P2(86, 9); ctx.beginPath(); ctx.arc(nn[0], nn[1], 1.5, 0, TAU); ctx.fill();
      // teeth and a forked tongue
      ctx.beginPath();
      for (const a of [86, 77, 68, 59, 50]) { const v = -2.2 - (90 - a) * 0.075; const p = P2(a - 3, v), q = P2(a + 3, v - 0.4), t = P2(a, v - 6.5); ctx.moveTo(p[0], p[1]); ctx.lineTo(t[0], t[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); }
      for (const a of [80, 70, 60, 50]) { const v = -20 + (87 - a) * 0.24; const p = P2(a - 3, v), q = P2(a + 3, v + 0.6), t = P2(a, v + 6); ctx.moveTo(p[0], p[1]); ctx.lineTo(t[0], t[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); }
      ctx.fill();
      ctx.strokeStyle = (o.tongue || ink)(1); ctx.lineWidth = lw(1.6);
      ctx.beginPath(); tracePoly(ctx, [P2(44, -10.5), P2(70, -12), P2(96, -9), P2(112, -13)], false); ctx.stroke();
      ctx.beginPath(); tracePoly(ctx, [P2(112, -13), P2(120, -9), P2(128, -9)], false); ctx.stroke();
      ctx.beginPath(); tracePoly(ctx, [P2(112, -13), P2(120, -18), P2(127, -20)], false); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = ink(0.75); ctx.lineWidth = lw(1.2);
  ripple(true);
  // a few loose wavelets around the beast
  ctx.strokeStyle = ink(0.5); ctx.lineWidth = lw(1.1); ctx.beginPath();
  const rr = o.r || rng(21);
  for (let i = 0; i < 16; i++) {
    const wx = rr.range(-190, tx0 + 150), wy = rr.range(16, 62) * (rr.chance(0.75) ? 1 : -0.35), l = rr.range(14, 30);
    if (wy < 0 && wx > -40 && wx < tx0 + 60) continue;
    ctx.moveTo(wx - l, wy); ctx.quadraticCurveTo(wx - l / 2, wy - 5, wx, wy); ctx.quadraticCurveTo(wx + l / 2, wy + 5, wx + l, wy);
  }
  ctx.stroke();
  ctx.restore();
  return { x0: x + (flip > 0 ? -210 : -(tx0 + 110)) * s, x1: x + (flip > 0 ? tx0 + 110 : 210) * s, y0: y - 215 * s, y1: y + 75 * s };
}

// ---- small glyphs -------------------------------------------------------
// An anchor, for an anchorage. (x, y) is the crown; s the overall height.
export function anchor(ctx, pen, x, y, s, { ink = pen.a, rot = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const draw = () => {
    ctx.beginPath();
    ctx.moveTo(0, -0.78); ctx.lineTo(0, 0);                               // shank
    ctx.moveTo(-0.22, -0.66); ctx.lineTo(0.22, -0.66);                    // stock
    ctx.moveTo(-0.42, -0.34); ctx.quadraticCurveTo(-0.36, 0.0, 0, 0); ctx.quadraticCurveTo(0.36, 0.0, 0.42, -0.34);   // arms
    ctx.moveTo(-0.5, -0.24); ctx.lineTo(-0.42, -0.4); ctx.lineTo(-0.31, -0.27);
    ctx.moveTo(0.5, -0.24); ctx.lineTo(0.42, -0.4); ctx.lineTo(0.31, -0.27);
    ctx.moveTo(0.085, -0.87); ctx.arc(0, -0.87, 0.085, 0, TAU);          // ring
    ctx.stroke();
  };
  ctx.strokeStyle = pen.blank; ctx.lineWidth = 0.3; draw();
  ctx.strokeStyle = ink(1); ctx.lineWidth = 0.075; draw();
  ctx.restore();
}

// Like tex(), but fn returns [r, g, b, a, m]: an RGBA overlay plus a separate
// mask alpha. Returns [overlayCanvas, maskCanvas] at W/down x H/down.
export function texPair(W, H, fn, down = 1) {
  const fw = Math.max(1, Math.ceil(W / down)), fh = Math.max(1, Math.ceil(H / down));
  const [c1, x1] = layer(fw, fh), [c2, x2] = layer(fw, fh);
  const i1 = x1.createImageData(fw, fh), i2 = x2.createImageData(fw, fh), d1 = i1.data, d2 = i2.data, sx = DW / fw, sy = DH / fh;
  for (let j = 0, k = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++, k += 4) {
      const px = fn((i + 0.5) * sx, (j + 0.5) * sy);
      d1[k] = px[0]; d1[k + 1] = px[1]; d1[k + 2] = px[2]; d1[k + 3] = px[3]; d2[k + 3] = px[4];
    }
  }
  x1.putImageData(i1, 0, 0); x2.putImageData(i2, 0, 0);
  return [c1, c2];
}

// ---- hand-drawn landmarks -----------------------------------------------
// Little wave strokes in the near-shore sea.
export function waveMarks(ctx, world, r, { color, count = 120, near = 44, far = 260, free = () => true, len = [14, 30], width = 1.2, sep = 70 } = {}) {
  const placed = [];
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
  for (let tries = 0; placed.length < count && tries < count * 50; tries++) {
    const x = world.x0 + r() * world.w, y = world.y0 + r() * world.h, d = -world.d(x, y);
    if (d < near || d > far || !free(x, y, 30)) continue;
    if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < sep)) continue;
    placed.push([x, y]);
    const l = r.range(len[0], len[1]), n = r.chance(0.45) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const ox = x + k * l * 0.45 - (n - 1) * l * 0.2, oy = y + k * 9, a = r.range(3, 5.5);
      ctx.moveTo(ox - l / 2, oy); ctx.quadraticCurveTo(ox - l / 4, oy - a, ox, oy); ctx.quadraticCurveTo(ox + l / 4, oy + a, ox + l / 2, oy);
    }
  }
  ctx.stroke(); ctx.restore();
}

// A hill in profile, base centre at (x, y): hollow slopes, a broken ridge line,
// and hatching that falls away down the shaded face.
export function mountain(ctx, pen, x, y, w, h, r, { ink = pen.a, lineW = 1.9 } = {}) {
  const j = a => r.range(-a, a), px = x + r.range(-0.07, 0.1) * w, py = y - h, lx = x - w / 2, rx = x + w / 2;
  const L = [[lx, y], [lerp(lx, px, 0.3) + j(3), y - h * 0.15 + j(3)], [lerp(lx, px, 0.62) + j(3), y - h * 0.48 + j(4)], [lerp(lx, px, 0.88), y - h * 0.83 + j(2)], [px, py]];
  const R = [[px, py], [lerp(px, rx, 0.13), y - h * 0.8 + j(2)], [lerp(px, rx, 0.4) + j(3), y - h * 0.44 + j(4)], [lerp(px, rx, 0.72) + j(3), y - h * 0.14 + j(3)], [rx, y]];
  const ridge = [[px, py], [px + w * 0.05 + j(2), y - h * 0.7], [px - w * 0.035 + j(2), y - h * 0.47], [px + w * 0.06 + j(3), y - h * 0.23], [px + w * 0.015 + j(3), y - h * 0.02]];
  const body = c => { tracePoly(c, L, false); for (const p of R.slice(1)) c.lineTo(p[0], p[1]); c.lineTo(rx, y + 5); c.lineTo(lx, y + 5); c.closePath(); };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = pen.blank; ctx.beginPath(); body(ctx); ctx.fill();
  // shaded face: strokes parallel to the right slope, hanging from the ridge
  ctx.save(); ctx.beginPath(); tracePoly(ctx, L.slice(-1).concat(R), false); ctx.lineTo(rx, y + 5); ctx.lineTo(px - w * 0.1, y + 5); ctx.closePath(); ctx.clip();
  const dl = Math.hypot(rx - px, y - py), dx = (rx - px) / dl, dy = (y - py) / dl;
  ctx.strokeStyle = ink(0.8); ctx.lineWidth = 1.15; ctx.beginPath();
  const rs = spline(ridge, 8);
  for (let i = 1; i < rs.length; i++) {
    const s = rs[i], run = (y - s[1]) / dy;
    if (run < 6) continue;
    const L2 = run * r.range(0.45, 0.98);
    ctx.moveTo(s[0] + dx * 2, s[1] + dy * 2); ctx.lineTo(s[0] + dx * L2 + j(1.5), s[1] + dy * L2);
  }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = ink(1); ctx.lineWidth = lineW;
  ctx.beginPath(); tracePoly(ctx, L, false); ctx.stroke(); ctx.beginPath(); tracePoly(ctx, R, false); ctx.stroke();
  ctx.lineWidth = lineW * 0.6; ctx.beginPath(); tracePoly(ctx, ridge, false); ctx.stroke();
  // a few light strokes on the lit face, and scree at the foot
  ctx.strokeStyle = ink(0.62); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 4; i++) { const t = r.range(0.2, 0.85), bx = lerp(lx, px, t) + w * r.range(0.07, 0.16), by = lerp(y, py, t) + h * r.range(0.14, 0.24); ctx.moveTo(bx, by); ctx.lineTo(bx - w * 0.05, by + h * 0.11); }
  for (let i = 0; i < 3; i++) { const bx = lerp(lx, rx, r.range(0.1, 0.9)), by = y + r.range(3, 9); ctx.moveTo(bx - 6, by); ctx.lineTo(bx + 6, by); }
  ctx.stroke(); ctx.restore();
}

// A palm, base at (x, y), height h, leaning `lean` (fraction of h) to the right.
export function palm(ctx, pen, x, y, h, r, { ink = pen.a, lean = 0.22, fronds = 7 } = {}) {
  const top = [x + lean * h, y - h];
  const trunk = spline([[x, y], [x + lean * h * 0.18, y - h * 0.34], [x + lean * h * 0.55, y - h * 0.7], top], 8);
  const [A, B, F] = ribbon(trunk, t => lerp(h * 0.085, h * 0.04, t));
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = pen.blank; ctx.beginPath(); tracePoly(ctx, A.concat(B.slice().reverse()), true); ctx.fill();
  ctx.strokeStyle = ink(1); ctx.lineWidth = 1.5; ctx.beginPath(); tracePoly(ctx, A, false); ctx.stroke(); ctx.beginPath(); tracePoly(ctx, B, false); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = ink(0.8); ctx.beginPath();
  for (let i = 2; i < trunk.length - 1; i += 2) { ctx.moveTo(A[i][0], A[i][1]); ctx.lineTo(B[i][0] + F[i][0] * 1.5, B[i][1] + F[i][1] * 1.5); }
  ctx.stroke();
  // fronds: drooping crescents with a blank midrib and leaflet cuts
  const L = h * 0.56;
  for (let i = 0; i < fronds; i++) {
    const a = lerp(-Math.PI * 1.08, Math.PI * 0.08, (i + 0.5) / fronds) + r.range(-0.1, 0.1), l = L * r.range(0.82, 1.1);
    const ex = top[0] + Math.cos(a) * l, ey = top[1] + Math.sin(a) * l * 0.62 + l * 0.34, mx = top[0] + Math.cos(a) * l * 0.55, my = top[1] + Math.sin(a) * l * 0.75 - l * 0.12;
    const spine = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, q = 1 - t; spine.push([q * q * top[0] + 2 * q * t * mx + t * t * ex, q * q * top[1] + 2 * q * t * my + t * t * ey]); }
    const [U, D] = ribbon(spine, t => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.6) * h * 0.13 + 0.6);
    ctx.fillStyle = ink(0.92); ctx.beginPath(); tracePoly(ctx, U.concat(D.slice().reverse()), true); ctx.fill();
    ctx.strokeStyle = pen.blank; ctx.lineWidth = 1.1; ctx.beginPath(); tracePoly(ctx, spine.slice(1), false);
    for (let k = 2; k < 12; k += 1) { const s = spine[k], dx = spine[k + 1 > 12 ? 12 : k + 1][0] - spine[k - 1][0], dy = spine[k + 1 > 12 ? 12 : k + 1][1] - spine[k - 1][1], dl = Math.hypot(dx, dy) || 1; for (const sg of [1, -1]) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[0] + (dx / dl * 0.5 - sg * dy / dl) * h * 0.07, s[1] + (dy / dl * 0.5 + sg * dx / dl) * h * 0.07); } }
    ctx.stroke();
  }
  // coconuts and a tuft at the foot
  ctx.fillStyle = ink(1.1);
  for (const [dx, dy] of [[-0.03, 0.035], [0.03, 0.045], [0.0, 0.07]]) { ctx.beginPath(); ctx.arc(top[0] + dx * h, top[1] + dy * h, h * 0.028, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = ink(0.8); ctx.lineWidth = 1.1; ctx.beginPath();
  for (const dx of [-0.16, -0.09, 0.08, 0.15]) { ctx.moveTo(x + dx * h, y + 2); ctx.lineTo(x + dx * h * 1.25, y - h * 0.07); }
  ctx.moveTo(x - h * 0.24, y + 3); ctx.lineTo(x + h * 0.26, y + 3);
  ctx.stroke(); ctx.restore();
}

// A rock that looks back at you. Base centre (x, y), width s.
export function skullRock(ctx, pen, x, y, s, r, { ink = pen.a } = {}) {
  const j = () => r.range(-0.016, 0.016);
  const out = [[-0.40, 0.0], [-0.5, -0.16], [-0.485, -0.42], [-0.44, -0.64], [-0.31, -0.84], [-0.12, -0.95], [0.08, -0.97], [0.28, -0.88], [0.43, -0.68], [0.49, -0.44], [0.5, -0.2], [0.41, 0.0], [0.3, 0.02], [0, 0.03], [-0.3, 0.02]].map(p => [p[0] + j(), p[1] + j()]);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lw = w => w / s;
  ctx.fillStyle = pen.blank; ctx.beginPath(); tracePoly(ctx, out, true); ctx.fill();
  // shading on the right cheek and under the brow
  ctx.save(); ctx.beginPath(); tracePoly(ctx, out, true); ctx.clip();
  ctx.strokeStyle = ink(0.72); ctx.lineWidth = lw(1.1); ctx.beginPath();
  for (let i = 0; i < 13; i++) { const yy = -0.86 + i * 0.07; ctx.moveTo(0.56, yy); ctx.quadraticCurveTo(0.42, yy + 0.02, 0.33 + Math.abs(i - 6) * 0.012, yy + 0.07); }
  for (let i = 0; i < 6; i++) { const xx = -0.36 + i * 0.035; ctx.moveTo(xx, -0.05); ctx.lineTo(xx - 0.05, -0.22); }
  ctx.stroke(); ctx.restore();
  // sockets, nose
  ctx.fillStyle = ink(1.05);
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0.2 * sg + 0.005, -0.47, 0.125, 0.145, 0.22 * sg, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(0.005, -0.33); ctx.quadraticCurveTo(0.085, -0.2, 0.06, -0.15); ctx.lineTo(0.005, -0.19); ctx.lineTo(-0.05, -0.15); ctx.quadraticCurveTo(-0.075, -0.2, 0.005, -0.33); ctx.fill();
  ctx.strokeStyle = pen.blank; ctx.lineWidth = lw(1.2); ctx.beginPath();       // a glint in each socket
  for (const sg of [-1, 1]) { ctx.moveTo(0.2 * sg - 0.07, -0.5); ctx.quadraticCurveTo(0.2 * sg - 0.05, -0.57, 0.2 * sg, -0.58); }
  ctx.stroke();
  // teeth
  ctx.strokeStyle = ink(1); ctx.lineWidth = lw(1.3); ctx.beginPath();
  ctx.moveTo(-0.3, -0.1); ctx.quadraticCurveTo(0, -0.075, 0.3, -0.1);
  for (let i = -3; i <= 3; i++) { ctx.moveTo(i * 0.085, -0.088); ctx.lineTo(i * 0.085, 0.012); }
  // cracks
  ctx.moveTo(0.1, -0.96); ctx.lineTo(0.13, -0.86); ctx.lineTo(0.09, -0.8); ctx.lineTo(0.15, -0.7);
  ctx.moveTo(-0.3, -0.84); ctx.lineTo(-0.26, -0.74); ctx.lineTo(-0.3, -0.68);
  ctx.stroke();
  ctx.lineWidth = lw(2); ctx.beginPath(); tracePoly(ctx, out.slice(0, 12), false); ctx.stroke();
  // rubble and grass at the foot
  ctx.lineWidth = lw(1.3); ctx.beginPath();
  for (const [bx, bw] of [[-0.62, 0.1], [0.6, 0.12], [0.76, 0.07]]) { ctx.moveTo(bx - bw, 0.03); ctx.quadraticCurveTo(bx - bw * 0.7, -bw * 1.2, bx, -bw * 1.1); ctx.quadraticCurveTo(bx + bw * 0.8, -bw * 1.1, bx + bw, 0.03); }
  for (const tx of [-0.8, -0.74, 0.9, 0.96]) { ctx.moveTo(tx, 0.03); ctx.lineTo(tx + r.range(-0.03, 0.03), -0.09); }
  ctx.moveTo(-0.9, 0.035); ctx.lineTo(1.02, 0.035);
  ctx.stroke(); ctx.restore();
}

// A little tree: a scribbled crown on a stalk.
export function tree(ctx, pen, x, y, s, r, { ink = pen.a } = {}) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cx = x + r.range(-1, 1), cy = y - s * 0.95;
  ctx.fillStyle = pen.blank; ctx.beginPath(); ctx.arc(cx, cy, s * 0.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = ink(0.95); ctx.lineWidth = 1.25; ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.5);
  for (let i = 0; i < 5; i++) { const a0 = -Math.PI * 1.2 + i * Math.PI * 0.36, bx = cx + Math.cos(a0 + 0.3) * s * 0.36, by = cy + Math.sin(a0 + 0.3) * s * 0.3; ctx.moveTo(bx + s * 0.27 * Math.cos(a0 - 0.75), by + s * 0.27 * Math.sin(a0 - 0.75)); ctx.arc(bx, by, s * 0.27, a0 - 0.75, a0 + 1.25); }
  ctx.moveTo(cx - s * 0.5, cy + s * 0.34); ctx.quadraticCurveTo(cx, cy + s * 0.5, cx + s * 0.52, cy + s * 0.3);
  ctx.stroke();
  ctx.strokeStyle = ink(0.7); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 3; i++) { ctx.moveTo(cx + s * (0.12 + i * 0.13), cy - s * 0.1 + i * s * 0.1); ctx.lineTo(cx + s * (0.05 + i * 0.13), cy + s * 0.32); }
  ctx.stroke(); ctx.restore();
}

// A trail of short dashes along a smooth path through `pts`.
export function trail(ctx, pen, pts, r, { color, dash = 15, gap = 13, width = 3 } = {}) {
  const path = spline(pts, 14);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath();
  for (const [x, y, tx, ty] of resample(path, false, dash + gap)) {
    const a = Math.atan2(ty, tx) + r.range(-0.16, 0.16), l = dash * r.range(0.8, 1.15) / 2, ox = r.range(-1.6, 1.6), oy = r.range(-1.6, 1.6);
    ctx.moveTo(x + ox - Math.cos(a) * l, y + oy - Math.sin(a) * l); ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
  }
  ctx.stroke(); ctx.restore();
  return path;
}

// X marks the spot: two loaded brush strokes with dry streaks.
export function bigX(ctx, pen, x, y, s, r, { color, streak = pen.blank } = {}) {
  ctx.save(); ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-1, -0.92, 1, 0.95], [0.96, -1, -0.9, 1.02]]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, b = Math.sin(t * Math.PI) * 0.08; pts.push([x + s * (lerp(x0, x1, t) + b * (y1 - y0) * 0.5), y + s * (lerp(y0, y1, t) - b * (x1 - x0) * 0.5)]); }
    const [A, B] = ribbon(pts, t => s * (0.2 + 0.2 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) - 0.2 * smooth(0.55, 1, t)) * r.range(0.9, 1.1));
    ctx.fillStyle = color; ctx.beginPath(); tracePoly(ctx, A.concat(B.slice().reverse()), true); ctx.fill();
    ctx.strokeStyle = streak; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const o of [-0.045, 0.02, 0.06]) { const t0 = r.range(0.45, 0.62); ctx.moveTo(lerp(pts[0][0], pts[12][0], t0) + o * s, lerp(pts[0][1], pts[12][1], t0) - o * s * 0.6); ctx.lineTo(lerp(pts[0][0], pts[12][0], 0.97) + o * s * 0.6, lerp(pts[0][1], pts[12][1], 0.97) - o * s * 0.4); }
    ctx.stroke();
  }
  ctx.restore();
}
