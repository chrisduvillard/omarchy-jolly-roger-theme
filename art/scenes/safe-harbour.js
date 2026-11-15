// Safe Harbour — a ship at anchor off a palm-fringed cay as the sun goes down.
import { P, rng, makeNoise, lerp, clamp, smooth, rgba, mix, ramp, layer, field, glow, grain, vignette, stars, linearFill, TAU } from '../lib/core.js';
import { drawShip, shipLayer } from '../lib/ship.js';

export const size = [3840, 2160];
export const seed = 21;

const SKY = [[0, '#0a1422'], [0.22, '#1a2238'], [0.42, '#47304a'], [0.60, '#93483f'], [0.76, '#d8763a'], [0.90, '#eeb154'], [1, '#f6d88a']];

// A coconut palm in silhouette: tapered leaning trunk, a crown of drooping fronds.
function palm(ctx, x, y, h, lean, r, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tx = x + lean * h, ty = y - h, cx = x + lean * h * 0.2, cy = y - h * 0.6;
  const q = (t, p0, p1, p2) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  // trunk as one smooth tapered ribbon
  const L = [], R = [], N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N, px = q(t, x, cx, tx), py = q(t, y, cy, ty);
    const dx = 2 * (1 - t) * (cx - x) + 2 * t * (tx - cx), dy = 2 * (1 - t) * (cy - y) + 2 * t * (ty - cy), d = Math.hypot(dx, dy) || 1;
    const w = lerp(h * 0.030, h * 0.0105, Math.pow(t, 0.7)) * (1 + 0.05 * Math.sin(i * 2.4));
    L.push([px - (dy / d) * w, py + (dx / d) * w]); R.push([px + (dy / d) * w, py - (dx / d) * w]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  for (const p of R.reverse()) ctx.lineTo(p[0], p[1]);
  ctx.closePath(); ctx.fill();
  // fronds: a spine that arcs out and droops; leaflets sweep toward the tip and hang
  const fronds = r.int(13, 16);
  for (let i = 0; i < fronds; i++) {
    const f = i / (fronds - 1), ang = -Math.PI / 2 + lerp(-2.25, 2.25, f) + r.range(-0.13, 0.13);
    const len = h * r.range(0.40, 0.55) * (0.78 + 0.22 * Math.abs(Math.sin(ang))), up = Math.max(0, -Math.sin(ang));
    const mx = tx + Math.cos(ang) * len * 0.5, my = ty + Math.sin(ang) * len * 0.42 - len * (0.10 + 0.16 * up);
    const ex = tx + Math.cos(ang) * len * 0.98, ey = ty + Math.sin(ang) * len * 0.30 + len * r.range(0.30, 0.52);
    ctx.lineWidth = h * 0.0062;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    const leaf = 46;
    for (let k = 1; k < leaf; k++) {
      const t = k / leaf, px = q(t, tx, mx, ex), py = q(t, ty, my, ey);
      const dx = 2 * (1 - t) * (mx - tx) + 2 * t * (ex - mx), dy = 2 * (1 - t) * (my - ty) + 2 * t * (ey - my), ta = Math.atan2(dy, dx);
      const ll = len * (0.045 + 0.215 * Math.pow(Math.sin(Math.pow(t, 0.8) * Math.PI), 0.8)) * r.range(0.8, 1.12);
      for (const sgn of [-1, 1]) {
        const la = ta + sgn * lerp(1.05, 0.5, t) + r.range(-0.07, 0.07);
        const lx = px + Math.cos(la) * ll, ly = py + Math.sin(la) * ll + ll * 0.55;       // gravity
        ctx.lineWidth = h * 0.0034;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.cos(la) * ll * 0.6, py + Math.sin(la) * ll * 0.6 + ll * 0.1, lx, ly); ctx.stroke();
      }
    }
  }
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(tx + r.range(-1, 1) * h * 0.02, ty + h * 0.02 + r() * h * 0.014, h * 0.0125, 0, TAU); ctx.fill(); }
  ctx.restore();
}

export function render(ctx, W, H, o) {
  const u = W / 3840, r = rng(o.seed), noise = makeNoise(o.seed + 5);
  const horizon = H * 0.64, sun = { x: W * 0.335, y: horizon - H * 0.012, r: H * 0.058 };

  // ---- sky
  ctx.fillStyle = linearFill(ctx, 0, 0, 0, horizon, SKY.map(([p, c]) => [p, c]));
  ctx.fillRect(0, 0, W, horizon + 2);
  stars(ctx, W, horizon, { seed: o.seed, count: 700, yMax: 0.42, alpha: 0.8 });
  glow(ctx, sun.x, sun.y, H * 0.95, '#f2a24a', 0.42);
  glow(ctx, sun.x, sun.y, H * 0.30, '#ffdf9c', 0.34);
  // clouds: streaks lit from below
  field(ctx, W, H, (a, b) => {
    const n = noise.fbm(a * 2.6 + 3, b * 10 + 1, 6) + 0.2 * noise.fbm(a * 12, b * 34, 3);
    const band = Math.exp(-Math.pow((b - 0.52) / 0.2, 2)) + 0.6 * Math.exp(-Math.pow((b - 0.86) / 0.08, 2));
    const d = smooth(0.06, 0.48, n + band * 0.42 - 0.34);
    const dx = (a * W - sun.x) / W, near = Math.exp(-dx * dx * 5) * smooth(0.1, 1, b);
    const under = smooth(0.25, 0.9, d);
    const c = ramp([[0, '#f7c56c'], [0.35, '#d96a3c'], [0.7, '#5a2f47'], [1, '#1d1b30']], clamp(under * 0.9 + (1 - near) * 0.45));
    return [c[0], c[1], c[2], d * 225];
  }, { down: 3, h: horizon });
  // sun disc
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip();
  ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r, 0, TAU); ctx.fill();
  glow(ctx, sun.x, sun.y, sun.r * 2.4, '#ffe9b0', 0.5);
  ctx.restore();

  // ---- far islands, receding in haze
  const ridge = (base, amp, f, color, seedOff, x0 = 0, x1 = W) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x0, horizon + 2);
    for (let x = x0; x <= x1; x += 6 * u) {
      const t = (x - x0) / (x1 - x0), env = Math.pow(Math.sin(t * Math.PI), 0.7);
      ctx.lineTo(x, horizon - (base + amp * (0.5 + 0.5 * noise.fbm(x / W * f + seedOff, seedOff, 5))) * env * H);
    }
    ctx.lineTo(x1, horizon + 2); ctx.closePath(); ctx.fill();
  };
  ridge(0.012, 0.060, 5, '#7d4750', 2.2, W * 0.50, W * 0.86);
  ridge(0.006, 0.038, 9, '#5d3445', 7.1, W * 0.02, W * 0.26);

  // ---- sea
  ctx.fillStyle = linearFill(ctx, 0, horizon, 0, H, [[0, '#c9783f'], [0.05, '#8b4b3d'], [0.22, '#3c2b3f'], [0.55, '#151c2b'], [1, '#070c14']]);
  ctx.fillRect(0, horizon, W, H - horizon);
  const rows = 170;
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1), y = horizon + (H - horizon) * Math.pow(v, 1.7) + 1.5 * u;
    const sc = lerp(0.1, 1, Math.pow(v, 1.15)), n = Math.round(lerp(150, 24, v)), pathW = W * (0.03 + 0.17 * Math.pow(v, 0.9));
    for (let k = 0; k < n; k++) {
      const inPath = r.chance(0.45), x = inPath ? sun.x + r.gauss() * pathW * 0.9 : r() * W;
      const g = Math.exp(-Math.pow((x - sun.x) / pathW, 2));
      const len = r.range(26, 200) * sc * u * (inPath ? 0.8 : 1.3), th = lerp(0.9, 5.4, v) * u * r.range(0.6, 1.25);
      const a = g * lerp(0.95, 0.55, v) * r.range(0.35, 1) + (1 - g) * r.range(0.04, 0.16);
      const base = ramp([[0, '#b56a45'], [0.3, '#6b4257'], [1, '#2a3550']], v);
      const cr = ramp([[0, '#ffe7a6'], [1, '#f3a65a']], v);
      ctx.fillStyle = `rgba(${lerp(base[0], cr[0], g) | 0},${lerp(base[1], cr[1], g) | 0},${lerp(base[2], cr[2], g) | 0},${a})`;
      ctx.beginPath(); ctx.ellipse(x, y + r.range(-2, 2) * sc * u, len / 2, th / 2, 0, 0, TAU); ctx.fill();
    }
  }
  glow(ctx, sun.x, horizon + H * 0.01, W * 0.2, '#ffd58a', 0.35);

  // ---- the ship at anchor, sails furled
  const furled = ['fore0', 'fore1', 'fore2', 'fore3', 'main0', 'main1', 'main2', 'main3', 'mizzen1', 'mizzen2'];
  const ship = { scale: W * 0.185, hull: '#0c0a10', sail: '#0c0a10', rigAlpha: 0.85, furled, jibs: 0, spanker: false, lights: 0.9, seed: 4, flip: true, pennant: true };
  const sx = W * 0.515, sy = horizon + H * 0.03;
  const L = shipLayer(drawShip, { ...ship, lights: 0 });
  const [rc, rx] = layer(L.canvas.width, L.canvas.height);
  rx.translate(0, L.canvas.height); rx.scale(1, -1); rx.drawImage(L.canvas, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, sy, W, H - sy); ctx.clip();
  const slices = 80, rh = L.canvas.height * 0.7;
  for (let i = 0; i < slices; i++) {
    const t = i / slices, wob = Math.sin(i * 1.3 + r() * 2) * (3 + t * 34) * u;
    ctx.globalAlpha = 0.72 * Math.pow(1 - t, 1.3);
    ctx.drawImage(rc, 0, L.canvas.height - L.oy + t * rh, rc.width, rh / slices + 1, sx - L.ox + wob, sy + t * rh * 0.5, rc.width, (rh * 0.5) / slices + 1.5);
  }
  ctx.restore();
  drawShip(ctx, { ...ship, x: sx, y: sy });
  // anchor cable
  ctx.strokeStyle = rgba('#0c0a10', 0.8); ctx.lineWidth = 2.2 * u;
  ctx.beginPath(); ctx.moveTo(sx - ship.scale * 0.47, sy - ship.scale * 0.06); ctx.quadraticCurveTo(sx - ship.scale * 0.58, sy - ship.scale * 0.01, sx - ship.scale * 0.66, sy + ship.scale * 0.02); ctx.stroke();
  // a ship's boat pulling for the beach
  ctx.fillStyle = '#0c0a10';
  const bx = W * 0.665, by = horizon + H * 0.085;
  ctx.beginPath(); ctx.moveTo(bx - 46 * u, by - 9 * u); ctx.quadraticCurveTo(bx, by + 12 * u, bx + 50 * u, by - 11 * u); ctx.lineTo(bx + 40 * u, by + 5 * u); ctx.quadraticCurveTo(bx, by + 13 * u, bx - 38 * u, by + 5 * u); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(bx - 26 * u + i * 17 * u, by - 14 * u, 5.5 * u, 0, TAU); ctx.fill(); ctx.fillRect(bx - 30 * u + i * 17 * u, by - 12 * u, 8 * u, 12 * u); }
  ctx.lineWidth = 2 * u; ctx.strokeStyle = '#0c0a10';
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(bx - 14 * u + i * 30 * u, by - 6 * u); ctx.lineTo(bx - 34 * u + i * 30 * u, by + 15 * u); ctx.stroke(); }

  // ---- foreground cay with palms, right side
  const dark = '#07080d';
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(W * 0.60, H + 2);
  for (let x = W * 0.60; x <= W + 4; x += 8 * u) {
    const t = (x - W * 0.60) / (W * 0.40);
    ctx.lineTo(x, H - (Math.pow(t, 1.25) * 0.245 + 0.012 * noise.fbm(t * 9, 3.3, 4) + 0.01) * H);
  }
  ctx.lineTo(W + 4, H + 2); ctx.closePath(); ctx.fill();
  // grass tufts along the crest
  ctx.strokeStyle = dark; ctx.lineCap = 'round';
  for (let k = 0; k < 520; k++) {
    const t = r.range(0.12, 1), x = W * 0.60 + t * W * 0.40, y = H - (Math.pow(t, 1.25) * 0.245 + 0.012 * noise.fbm(t * 9, 3.3, 4) + 0.01) * H;
    ctx.lineWidth = r.range(1.5, 3.5) * u; ctx.beginPath(); ctx.moveTo(x, y + 4 * u);
    ctx.quadraticCurveTo(x + r.range(-10, 10) * u, y - r.range(14, 40) * u, x + r.range(-26, 26) * u, y - r.range(20, 70) * u); ctx.stroke();
  }
  const pr = rng(o.seed + 40);
  palm(ctx, W * 0.872, H * 0.84, H * 0.58, -0.17, pr, dark);
  palm(ctx, W * 0.948, H * 0.80, H * 0.46, 0.08, pr, dark);
  palm(ctx, W * 0.80, H * 0.905, H * 0.33, -0.30, pr, dark);
  // warm rim of sunlight skimming the water at the cay's foot
  ctx.fillStyle = linearFill(ctx, 0, H * 0.86, 0, H, [[0, rgba('#000000', 0)], [1, rgba('#000000', 0.35)]]);
  ctx.fillRect(0, H * 0.86, W, H * 0.14);

  // gulls
  ctx.strokeStyle = rgba('#141019', 0.85); ctx.lineWidth = 2.6 * u;
  for (const [gx, gy, gs] of [[0.46, 0.30, 1], [0.49, 0.27, 0.7], [0.435, 0.335, 0.55], [0.22, 0.41, 0.6]]) {
    const s = 26 * u * gs, x = W * gx, y = H * gy;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y); ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y + s * 0.05); ctx.stroke();
  }

  vignette(ctx, W, H, 0.55, '#05060c', 0.5);
  grain(ctx, W, H, 5, o.seed + 1);
}
