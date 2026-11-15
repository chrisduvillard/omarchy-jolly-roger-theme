// Black Sails — a ship running under a huge low moon, a pursuer hull-down astern.
import { P, rng, makeNoise, lerp, clamp, smooth, rgba, mix, ramp, layer, field, glow, grain, vignette, stars, linearFill, radialFill, TAU } from '../lib/core.js';
import { drawShip, shipLayer } from '../lib/ship.js';

export const size = [3840, 2160];
export const seed = 7;

export function render(ctx, W, H, o) {
  const u = W / 3840, r = rng(o.seed), noise = makeNoise(o.seed + 3);
  const horizon = H * 0.672;
  const moon = { x: W * 0.628, y: H * 0.405, r: H * 0.235 };
  const cream = '#f3e7c6';

  // Intro animation. t runs 0 -> 1 and every offset below vanishes at t = 1, so
  // the last frame of the intro is exactly the still wallpaper: the moon rises
  // out of the sea, the ship sails in to cross it, the water shimmers.
  const t = o.t ?? 1, tau = 1 - t, secs = tau * 6;
  const rise = 1 - Math.pow(tau, 2.2), lum = 0.15 + 0.85 * rise;
  const r2 = rng(o.seed + 77);                       // shimmer phases, on their own stream
  moon.y += (horizon + moon.r * 0.8 - moon.y) * Math.pow(tau, 2.2);

  // ---- sky
  ctx.fillStyle = linearFill(ctx, 0, 0, 0, horizon, [[0, '#04080e'], [0.45, '#08131e'], [0.8, '#0d2030'], [1, '#143042']]);
  ctx.fillRect(0, 0, W, horizon + 2);
  glow(ctx, moon.x, moon.y, moon.r * 5.2, '#2c5670', 0.55 * lum);
  glow(ctx, moon.x, moon.y, moon.r * 2.6, '#7f9aa3', 0.38 * lum);
  stars(ctx, W, horizon, { seed: o.seed + 9, count: 2200, yMax: 0.97, mask: (x, y) => smooth(moon.r * 1.25, moon.r * 3.4, Math.hypot(x - moon.x, y - moon.y)) });

  // ---- moon
  ctx.save();
  glow(ctx, moon.x, moon.y, moon.r * 1.55, cream, 0.42 * lum);
  ctx.beginPath(); ctx.arc(moon.x, moon.y, moon.r, 0, TAU); ctx.clip();
  ctx.fillStyle = radialFill(ctx, moon.x - moon.r * 0.25, moon.y - moon.r * 0.3, moon.r * 0.1, moon.r * 1.25, [[0, '#fbf3da'], [0.6, '#efe2bd'], [1, '#cdbd94']]);
  ctx.fillRect(moon.x - moon.r, moon.y - moon.r, moon.r * 2, moon.r * 2);
  field(ctx, W, H, (a, b) => {
    const m = noise.fbm(a * 3.1 + 4, b * 3.1 + 9, 5), c = noise.fbm(a * 11 + 2, b * 11, 3);
    const d = smooth(0.02, 0.42, m) * 0.5 + smooth(0.15, 0.5, c) * 0.12;
    return [92, 96, 92, d * 255];
  }, { down: 2, x: moon.x - moon.r, y: moon.y - moon.r, w: moon.r * 2, h: moon.r * 2, mode: 'multiply' });
  ctx.restore();

  // ---- clouds: long torn bands, rim-lit where they cross the moon
  field(ctx, W, H, (a, b) => {
    const x = a * W, y = b * horizon;
    const n = noise.fbm(a * 3.4 + 1.7 + tau * 0.2, b * 8.5 + 3.1, 6) + 0.22 * noise.fbm(a * 14 + tau * 0.8, b * 30, 3);
    const band = Math.exp(-Math.pow((b - 0.60) / 0.17, 2)) * 1.0 + Math.exp(-Math.pow((b - 0.22) / 0.09, 2)) * 0.55 + Math.exp(-Math.pow((b - 0.93) / 0.07, 2)) * 0.8;
    const d = smooth(0.02, 0.46, n * 1.0 + band * 0.52 - 0.33);
    const md = Math.hypot(x - moon.x, y - moon.y) / moon.r;
    const lit = Math.exp(-md * 0.55) * lum, edge = smooth(0.0, 0.45, d) * (1 - smooth(0.35, 1, d));
    const c = ramp([[0, '#091420'], [0.45, '#33505f'], [0.8, '#9fb0a8'], [1, '#efe6c6']], clamp(lit * (0.30 + edge * 1.9)));
    return [c[0], c[1], c[2], d * 238];
  }, { down: 3, h: horizon });

  // ---- sea
  ctx.fillStyle = linearFill(ctx, 0, horizon, 0, H, [[0, '#122c3c'], [0.12, '#0b1e2b'], [0.6, '#07131c'], [1, '#040a10']]);
  ctx.fillRect(0, horizon, W, H - horizon);
  // haze on the horizon line
  ctx.fillStyle = linearFill(ctx, 0, horizon - H * 0.03, 0, horizon + H * 0.012, [[0, rgba('#5f8794', 0)], [0.72, rgba('#5f8794', 0.22)], [1, rgba('#5f8794', 0)]]);
  ctx.fillRect(0, horizon - H * 0.03, W, H * 0.045);

  // the distant pursuer, hull-down on the horizon
  drawShip(ctx, { x: W * (0.115 - 0.045 * tau), y: horizon + H * 0.002, scale: W * 0.036, hull: '#0a1a25', sail: '#102533', rigAlpha: 0.35, flip: false, seed: 3, lights: 0.9, portChance: 0 });

  // wave strokes: lens-shaped dashes that grow with nearness; brightest in the moon's path
  const rows = 190;
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1), y = horizon + (H - horizon) * Math.pow(v, 1.75) + 1.5 * u;
    const sc = lerp(0.10, 1, Math.pow(v, 1.15)), n = Math.round(lerp(150, 26, v));
    const pathW = W * (0.022 + 0.135 * Math.pow(v, 0.9));
    for (let k = 0; k < n; k++) {
      const inPath = r.chance(0.42);
      const x = inPath ? moon.x + r.gauss() * pathW * 0.9 : r() * W;
      const g = Math.exp(-Math.pow((x - moon.x) / pathW, 2));
      const len = r.range(26, 190) * sc * u * (inPath ? 0.8 : 1.25), th = lerp(0.9, 5.2, v) * u * r.range(0.6, 1.25);
      const ph = r2() * TAU, om = 1.2 + r2() * 2.6;
      const shimmer = 1 + 0.55 * (Math.sin(ph + om * secs) - Math.sin(ph));
      const drift = (Math.sin(ph * 1.7 + secs * 0.9) - Math.sin(ph * 1.7)) * len * 0.3;
      const a = (g * lerp(1.0, 0.62, v) * r.range(0.4, 1) * rise + (1 - g) * r.range(0.03, 0.13)) * shimmer;
      ctx.fillStyle = rgba(mix('#4d7284', cream, clamp(g * 1.15 * rise)), clamp(a));
      ctx.beginPath(); ctx.ellipse(x + drift, y + r.range(-2, 2) * sc * u, len / 2, th / 2, 0, 0, TAU); ctx.fill();
    }
  }
  // sparkle: a scatter of hard glints down the moon path
  for (let k = 0; k < 420; k++) {
    const v = Math.pow(r(), 1.6), y = horizon + (H - horizon) * v * 0.9 + 3 * u, pw = W * (0.018 + 0.11 * v);
    const x = moon.x + r.gauss() * pw * 0.7, s = lerp(1.2, 3.4, v) * u * r.range(0.6, 1.3);
    const ph = r2() * TAU, twinkle = clamp(1 + 0.95 * (Math.sin(ph + secs * 4.2) - Math.sin(ph)), 0, 1.3);
    ctx.fillStyle = rgba('#fff8e2', clamp(r.range(0.45, 1) * rise * twinkle));
    ctx.beginPath(); ctx.ellipse(x, y, s * r.range(2, 7), s * 0.55, 0, 0, TAU); ctx.fill();
  }
  glow(ctx, moon.x, horizon + H * 0.02, W * 0.17, cream, 0.26 * rise);

  // ---- the ship, with its reflection breaking the moon path
  const ship = { scale: W * 0.232, hull: '#03070b', sail: '#070f17', sailAlpha: 0.96, rigAlpha: 0.8, lights: 1, seed: 11, jolly: true, heel: -1.2 + Math.sin(secs * 1.15) * 0.9 };
  const sx = W * (0.565 - 0.44 * Math.pow(tau, 1.5)), sy = horizon + H * (0.014 + 0.0016 * Math.sin(secs * 1.5));
  const L = shipLayer(drawShip, { ...ship, lights: 0 });
  const [rc, rx] = layer(L.canvas.width, L.canvas.height);
  rx.translate(0, L.canvas.height); rx.scale(1, -1); rx.drawImage(L.canvas, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, sy, W, H - sy); ctx.clip();
  const slices = 70, rh = L.canvas.height * 0.62;
  for (let i = 0; i < slices; i++) {
    const t = i / slices, y0 = sy + t * rh * 0.42;
    const srcY = L.canvas.height - L.oy + t * rh, wob = Math.sin(i * 1.7 + r() * 2) * (4 + t * 42) * u;
    ctx.globalAlpha = 0.78 * Math.pow(1 - t, 1.5);
    ctx.drawImage(rc, 0, srcY, rc.width, rh / slices + 1, sx - L.ox + wob, y0, rc.width, (rh * 0.42) / slices + 1.5);
  }
  ctx.restore();
  drawShip(ctx, { ...ship, x: sx, y: sy });
  // foam at the waterline and a short wake
  for (let k = 0; k < 150; k++) {
    const t = r(), x = sx + lerp(-0.5, 0.52, t) * ship.scale + r.gauss() * 6 * u, y = sy + r.range(-2, 9) * u;
    ctx.fillStyle = rgba('#b9c8c8', r.range(0.12, 0.5));
    ctx.beginPath(); ctx.ellipse(x, y, r.range(6, 30) * u, r.range(1, 3) * u, 0, 0, TAU); ctx.fill();
  }
  for (let k = 0; k < 90; k++) {
    const t = Math.pow(r(), 0.7), x = sx - ship.scale * (0.5 + t * 0.55) + r.gauss() * 10 * u, y = sy + (2 + t * 26 + r.range(-3, 3)) * u;
    ctx.fillStyle = rgba('#9fb4b8', (1 - t) * r.range(0.1, 0.42));
    ctx.beginPath(); ctx.ellipse(x, y, r.range(8, 46) * u, r.range(1, 3.2) * u, 0, 0, TAU); ctx.fill();
  }
  // lantern light on the water
  for (let k = 0; k < 26; k++) {
    const t = r(), x = sx - ship.scale * 0.52 + r.gauss() * (8 + t * 40) * u, y = sy + (10 + t * 150) * u;
    ctx.fillStyle = rgba('#f0a04a', (1 - t) * r.range(0.15, 0.6));
    ctx.beginPath(); ctx.ellipse(x, y, r.range(6, 28) * u, r.range(1, 3) * u, 0, 0, TAU); ctx.fill();
  }

  vignette(ctx, W, H, 0.62, '#02050a', 0.5);
  grain(ctx, W, H, 6.5, o.seed + 1);
}
