// Shared helpers for every scene: seeded randomness, noise, colour, and the
// finishing passes (grain, vignette) that keep dark gradients free of banding.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));

// The theme palette (mirrors colors.toml) plus a few art-only tones.
export const P = {
  bg: '#0b1219', bgDark: '#080d13', bgDarker: '#05090d', bgLight: '#131d27', selection: '#1e3344', muted: '#62717c',
  fg: '#d8c9a7', fgDark: '#8b8f8a', fgLight: '#e6d9ba', fgBright: '#f4e9cd',
  gold: '#d9a441', brass: '#e3bb5e', paleGold: '#f2d382', red: '#dc5347', orange: '#e0803c', green: '#8fb06c',
  cyan: '#4fb5aa', blue: '#6b9bd0', magenta: '#b9779f', brown: '#8a5a36',
  ink: '#03060a', abyss: '#040a10', deepSea: '#0d2231', parchment: '#d9c79c', bone: '#e9dfc6', blood: '#8f1d21',
};

// ---- randomness ---------------------------------------------------------
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(r.range(a, b + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return r;
}

// ---- noise --------------------------------------------------------------
// Gradient (Perlin-style) noise with a seeded permutation; returns ~[-1, 1].
export function makeNoise(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = perm[perm[X] + Y], b = perm[perm[X + 1] + Y], c = perm[perm[X] + Y + 1], d = perm[perm[X + 1] + Y + 1];
    const u = fade(xf), v = fade(yf);
    const n00 = gx[a] * xf + gy[a] * yf, n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1), n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    return 1.5 * lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  };
  const fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  };
  // Ridged variant: sharp crests, good for waves and cloud edges.
  const ridged = (x, y, oct = 5, lac = 2, gain = 0.5) => {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(n2(x * f, y * f))); n += a; a *= gain; f *= lac; }
    return s / n;
  };
  return { n2, fbm, ridged };
}

// ---- colour -------------------------------------------------------------
export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a = 1) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
// Sample a multi-stop ramp: stops = [[pos, hex], ...] -> [r, g, b].
export function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
      const k = (t - p0) / (p1 - p0 || 1), A = hexToRgb(c0), B = hexToRgb(c1);
      return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)];
    }
  }
  return hexToRgb(stops[stops.length - 1][1]);
}

// ---- canvas helpers -----------------------------------------------------
export function layer(W, H) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H));
  return [c, c.getContext('2d')];
}
export function linearFill(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}
export function radialFill(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}
// A soft round glow (additive by default).
export function glow(ctx, x, y, r, color, alpha = 1, mode = 'lighter') {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = radialFill(ctx, x, y, 0, r, [[0, rgba(color, alpha)], [0.35, rgba(color, alpha * 0.42)], [0.7, rgba(color, alpha * 0.1)], [1, rgba(color, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// Paint a per-pixel field: fn(u, v, x, y) -> [r, g, b, a(0..255)] at a reduced
// resolution (`down`), then scale it up smoothly onto ctx. Use for clouds,
// water, fog and paper texture, which do not need pixel-level detail.
export function field(ctx, W, H, fn, { down = 2, x = 0, y = 0, w = W, h = H, mode = 'source-over', alpha = 1 } = {}) {
  const fw = Math.max(1, Math.ceil(w / down)), fh = Math.max(1, Math.ceil(h / down));
  const [c, cx] = layer(fw, fh);
  const img = cx.createImageData(fw, fh), d = img.data;
  for (let j = 0, k = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++, k += 4) {
      const px = fn(i / (fw - 1 || 1), j / (fh - 1 || 1), i, j);
      d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = px[3] ?? 255;
    }
  }
  cx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, x, y, w, h);
  ctx.restore();
}

// Film grain. Dithers gradients so dark skies do not band once compressed.
export function grain(ctx, W, H, amount = 7, seed = 7, mono = true) {
  const r = rng(seed);
  const T = 512, [c, cx] = layer(T, T);
  const img = cx.createImageData(T, T), d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    const g = 128 + r.gauss() * amount;
    d[k] = g; d[k + 1] = mono ? g : 128 + r.gauss() * amount; d[k + 2] = mono ? g : 128 + r.gauss() * amount; d[k + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(c, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function vignette(ctx, W, H, strength = 0.5, color = '#000000', inner = 0.45) {
  const r = Math.hypot(W, H) / 2;
  ctx.save();
  ctx.fillStyle = radialFill(ctx, W / 2, H / 2, r * inner, r, [[0, rgba(color, 0)], [1, rgba(color, strength)]]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Stars: small, mostly faint, a few bright ones with a soft halo.
export function stars(ctx, W, H, { seed = 3, count = 1400, yMax = 1, color = '#f4e9cd', size = 1, alpha = 1, mask = null } = {}) {
  const r = rng(seed), u = W / 3840;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = Math.pow(r(), 1.25) * H * yMax;
    const m = r(), big = m > 0.985, s = (big ? r.range(2.2, 3.6) : r.range(0.6, 1.9)) * u * size;
    let a = (big ? r.range(0.75, 1) : r.range(0.12, 0.7)) * alpha * (1 - smooth(yMax * 0.55, yMax, y / H));
    if (mask) a *= mask(x, y);
    if (a <= 0.01) continue;
    ctx.fillStyle = rgba(r.chance(0.2) ? '#bcd3ef' : color, a);
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    if (big) glow(ctx, x, y, s * 9, color, a * 0.35);
  }
  ctx.restore();
}

// Stroke a polyline through points with quadratic smoothing.
export function smoothPath(ctx, pts, close = false) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l[0], l[1]);
  if (close) ctx.closePath();
}
