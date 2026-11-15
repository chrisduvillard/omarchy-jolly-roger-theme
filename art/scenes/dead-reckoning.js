// Dead Reckoning — a night chart of an imaginary pirate archipelago, printed in
// gold, brass and copper leaf on midnight-blue vellum.
import { TAU, clamp, lerp, smooth, rng, makeNoise, layer, grain, vignette } from '../lib/core.js';
import { drawShip } from '../lib/ship.js';
import * as C from '../lib/chart.js';

export const size = [3840, 2160];
export const seed = 11;

const MAP = { x: 150, y: 150, w: 3540, h: 1860 };       // inside the neatline
const ROSE = { x: 2745, y: 1150, R: 440 };
const CART = { x: 236, y: 1632, w: 700, h: 322 };

const ISLANDS = [
  { x: 1180, y: 770, rx: 430, ry: 285, rot: -0.3 },        // the great island: three lobes and a harbour bay
  { x: 1520, y: 900, rx: 300, ry: 215, rot: 0.4 },
  { x: 900, y: 950, r: 200 },
  { x: 1290, y: 1085, r: 120, cut: 2.2 },
  { x: 500, y: 790, rx: 170, ry: 235, rot: 0.15 },          // western island
  { x: 1570, y: 1490, r: 135 }, { x: 1850, y: 1650, r: 112 }, { x: 2090, y: 1800, r: 88 },   // the chain
  { x: 1730, y: 1370, r: 58 }, { x: 2290, y: 1905, r: 52 },
  { x: 3280, y: 450, rx: 285, ry: 190, rot: 0.3 },          // north-east
  { x: 2380, y: 340, r: 118 }, { x: 2960, y: 300, r: 60 },
  { x: 3430, y: 1810, r: 135 },                             // the island with the X
  { x: 2010, y: 1120, rx: 170, ry: 110, rot: -0.5, peak: 0.42, lift: -0.2 },   // shoals
  { x: 640, y: 1330, rx: 150, ry: 95, rot: 0.2, peak: 0.42, lift: -0.2 },
  { x: 3160, y: 1790, rx: 95, ry: 140, rot: 0.3, peak: 0.42, lift: -0.2 },
];

export function render(ctx, W, H, opts) {
  const u = W / C.DW, sd = opts.seed ?? seed, r = rng(sd * 101 + 7), N = makeNoise(sd + 400);
  const pen = C.giltPen();

  // ---- vellum ----
  C.tex(ctx, W, H, (X, Y) => {
    const dx = (X - 1920) / 1920, dy = (Y - 1080) / 1080, e = Math.sqrt(dx * dx * 0.8 + dy * dy);
    const m = 0.6 * N.fbm(X / 700, Y / 700, 4) + 0.3 * N.fbm(X / 140 + 9, Y / 140, 4) + 0.12 * N.fbm(X / 22, Y / 22 + 5, 2);
    const k = 1 - 0.34 * smooth(0.25, 1.25, e) + m * 0.24;
    return [12 * k + m * 2, 21 * k + m * 3, 31 * k + m * 5, 255];
  }, { down: 3 });
  ctx.save(); ctx.scale(u, u);
  C.fibres(ctx, rng(sd + 5), { count: 6000, len: [14, 110], light: 'rgba(150,180,210,0.045)', dark: 'rgba(0,0,0,0.14)', width: 1.1 });
  ctx.restore();

  // ---- ink layer (black = bare vellum) ----
  const [inkC, ink] = layer(W, H);
  ink.fillStyle = '#000'; ink.fillRect(0, 0, W, H);
  ink.scale(u, u);

  const world = C.makeWorld({ seed: sd, x0: MAP.x, y0: MAP.y, w: MAP.w, h: MAP.h, islands: ISLANDS });
  const P = (deg, d) => [ROSE.x + d * Math.sin(deg * Math.PI / 180), ROSE.y - d * Math.cos(deg * Math.PI / 180)];
  const roses = [P(-112.5, 1750), P(-45, 1100)];

  // things the soundings and the course must keep clear of
  const circles = [[ROSE.x, ROSE.y, ROSE.R * 1.2], [ROSE.x, ROSE.y - ROSE.R * 1.15, 110], ...roses.map(p => [p[0], p[1], 118])];
  const rects = [[CART.x - 30, CART.y - 40, CART.x + CART.w + 30, CART.y + CART.h + 40]];
  const free = (x, y, pad = 0) => {
    for (const c of circles) if (Math.hypot(x - c[0], y - c[1]) < c[2] + pad) return false;
    for (const q of rects) if (x > q[0] - pad && x < q[2] + pad && y > q[1] - pad && y < q[3] + pad) return false;
    return x > MAP.x + 34 && x < MAP.x + MAP.w - 34 && y > MAP.y + 30 && y < MAP.y + MAP.h - 30;
  };

  // the course: out of the harbour bay, down the chain, east to the X
  let hy = 1150; while (world.d(1290, hy) < 0 && hy > 800) hy -= 2;
  const harbour = [1290, hy + 4], goal = [3436, 1806];
  const legs = C.findCourse(world, harbour, goal, { clear: 40, avoid: circles.map(c => [c[0], c[1], c[2] + 30]) });
  const along = f => {       // point + heading at fraction f of the track
    const ls = []; let tot = 0;
    for (let i = 1; i < legs.length; i++) { const l = Math.hypot(legs[i][0] - legs[i - 1][0], legs[i][1] - legs[i - 1][1]); ls.push(l); tot += l; }
    let d = f * tot;
    for (let i = 0; i < ls.length; i++) { if (d <= ls[i] || i === ls.length - 1) { const t = d / ls[i]; return [lerp(legs[i][0], legs[i + 1][0], t), lerp(legs[i][1], legs[i + 1][1], t), (legs[i + 1][0] - legs[i][0]) / ls[i], (legs[i + 1][1] - legs[i][1]) / ls[i]]; } d -= ls[i]; }
  };

  // furniture positions
  const SERP = { x: 800, y: 372, s: 0.7 };
  const ship1 = along(0.79), ship2 = [1500, 372];
  const s1 = [ship1[0], ship1[1] - 40];
  rects.push([SERP.x - 520, SERP.y - 170, SERP.x + 190, SERP.y + 95]);
  circles.push([s1[0], s1[1] - 40, 100], [ship2[0], ship2[1] - 50, 105]);

  // rhumb network
  ink.save(); ink.beginPath(); ink.rect(MAP.x, MAP.y, MAP.w, MAP.h); ink.clip();
  for (const [x, y] of roses) C.rhumbs(ink, pen, x, y, { inks: [pen.b(0.33), pen.b(0.24), null], width: 1.2 });
  C.rhumbs(ink, pen, ROSE.x, ROSE.y, { inks: [pen.b(0.44), pen.b(0.33), pen.b(0.22)], width: 1.3 });

  // sea: waterlines, shoals, soundings
  C.offsetLines(ink, W, H, world, [{ d: 7, w: 1.3, color: pen.a(0.5) }, { d: 16, w: 1.2, color: pen.a(0.36) }, { d: 27, w: 1.1, color: pen.a(0.25) }]);
  C.shoals(ink, world, r, { color: pen.a(0.72), rock: pen.a(0.8) });
  const labels = [];          // [x0, y0, x1, y1] of lettering, reserved before the soundings go down
  const reserve = (x, y, w, h) => { labels.push([x - w / 2, y - h, x + w / 2, y + h * 0.4]); rects.push([x - w / 2 - 14, y - h - 8, x + w / 2 + 14, y + h * 0.4 + 8]); };
  reserve(1290, hy + 118, 230, 40); reserve(520, 1128, 240, 40); reserve(3330, 742, 250, 40); reserve(2615, 262, 230, 40);
  reserve(3395, 1608, 360, 40); reserve(2020, 1262, 330, 34); reserve(1010, 1440, 840, 60); reserve(820, 478, 330, 34);
  for (let k = -3; k <= 3; k++) circles.push([1670 + Math.cos(0.5) * k * 46, 1860 + Math.sin(0.5) * k * 46, 34]);   // the slanted Knucklebones label
  const trackSoundings = [];
  for (let f = 0.08; f < 0.97; f += 0.052) { const [x, y, tx, ty] = along(f), sgn = Math.round(f * 100) % 2 ? 1 : -1; trackSoundings.push([x - ty * 44 * sgn, y + tx * 44 * sgn]); }
  C.soundings(ink, world, r, { color: pen.b(0.74), size: 21, count: 150, free, extra: trackSoundings, far: 190, sep: 70 });

  // land
  ink.fillStyle = pen.blank; ink.beginPath(); world.land(ink); ink.fill('evenodd');
  ink.fillStyle = pen.a(0.075); ink.beginPath(); world.land(ink); ink.fill('evenodd');
  C.reliefHachures(ink, world, r, { color: pen.a(0.36), width: 1, levels: [0.16, 0.235, 0.31, 0.385, 0.46, 0.535, 0.61, 0.685, 0.76, 0.835, 0.91, 0.985, 1.06], step: 4.6, len: [3, 9.5] });
  C.coastHachures(ink, world, r, { color: pen.a(0.66), width: 1.05 });
  C.coastline(ink, world, { color: pen.a(1), base: 1.5, extra: 2.4 });

  // the track, in copper
  C.course(ink, pen, legs, { color: pen.c(0.95), mark: pen.c(1.25), width: 2.3 });
  C.anchor(ink, pen, harbour[0] - 46, harbour[1] + 58, 40, { ink: pen.a });

  // ships and the serpent
  const ship = (x, y, scale, flip, sd2) => {
    ink.fillStyle = pen.blank; ink.beginPath(); ink.ellipse(x, y - scale * 0.36, scale * 0.6, scale * 0.52, 0, 0, TAU); ink.fill();
    drawShip(ink, { x, y, scale, flip, hull: pen.a(1), sail: pen.a(0.62), rigAlpha: 0.7, seed: sd2, pennant: true, ensign: true });
    ink.strokeStyle = pen.a(0.62); ink.lineWidth = 1.2; ink.lineCap = 'round'; ink.beginPath();
    for (const [dx, dy, l] of [[-0.42, 0.1, 0.2], [0.05, 0.12, 0.26], [0.42, 0.09, 0.16], [-0.16, 0.19, 0.18], [0.3, 0.2, 0.14]]) {
      const wx = x + dx * scale, wy = y + dy * scale, wl = l * scale;
      ink.moveTo(wx - wl / 2, wy); ink.quadraticCurveTo(wx - wl / 4, wy - 4, wx, wy); ink.quadraticCurveTo(wx + wl / 4, wy + 4, wx + wl / 2, wy);
    }
    ink.stroke();
  };
  ship(s1[0], s1[1], 132, ship1[2] < 0, 4);
  ship(ship2[0], ship2[1], 146, true, 9);
  C.serpent(ink, pen, SERP.x, SERP.y, SERP.s, { flip: true, r: rng(sd + 77), tongue: pen.c });

  for (const [x, y] of roses) C.windRose(ink, pen, x, y, 78);
  C.compassRose(ink, pen, ROSE.x, ROSE.y, ROSE.R, {});

  // lettering
  const name = (str, x, y, o = {}) => C.text(ink, str, x, y, { size: 38, font: 'P052', color: pen.a(0.92), halo: pen.blank, haloW: 8, ...o });
  name('Gallowmere', 1150, 760, { size: 54, spacing: 14, halo: null, color: pen.a(0.8) });
  name('Port Mercy', 1290, hy + 118, { size: 34 });
  name('Widow’s Key', 520, 1128);
  name('Isla Sombra', 3330, 742);
  name('Hob’s Tooth', 2615, 262, { size: 34 });
  name('Last Farthing Cay', 3395, 1608);
  name('Drowned Bell Shoal', 2020, 1262, { size: 31, color: pen.a(0.8) });
  name('The Knucklebones', 1670, 1872, { rot: 0.5, size: 36 });
  name('Hic sunt serpentes', 820, 478, { size: 30, color: pen.a(0.74) });
  C.arcText(ink, 'SEA OF LANTERNS', 1010, 3350, 1930, 0, { size: 44, font: 'C059', style: '', spacing: 22, color: pen.b(0.7), halo: pen.blank, haloW: 9 });
  ink.restore();

  // cartouche
  C.cartouche(ink, pen, CART.x, CART.y, CART.w, CART.h);
  const cx = CART.x + CART.w / 2, T = (str, dy, o) => C.text(ink, str, cx, CART.y + dy, { color: pen.a(0.95), ...o });
  T('A New & Exact Chart of the', 62, { size: 31 });
  T('BRAZEN ISLES', 132, { size: 66, font: 'C059', style: '', spacing: 13, color: pen.a(1.12) });
  T('in the Sea of Lanterns', 180, { size: 34 });
  ink.strokeStyle = pen.a(0.7); ink.lineWidth = 1.1; ink.beginPath(); ink.moveTo(cx - 230, CART.y + 203); ink.lineTo(cx - 14, CART.y + 203); ink.moveTo(cx + 14, CART.y + 203); ink.lineTo(cx + 230, CART.y + 203); ink.stroke();
  ink.fillStyle = pen.a(1); ink.beginPath(); ink.moveTo(cx, CART.y + 196); ink.lineTo(cx + 7, CART.y + 203); ink.lineTo(cx, CART.y + 210); ink.lineTo(cx - 7, CART.y + 203); ink.fill();
  T('laid down by Dead Reckoning · MDCCXVIII', 240, { size: 25, color: pen.a(0.85) });
  C.scaleBar(ink, pen, cx - 190, CART.y + 282, 380, { ink: pen.a, label: '', size: 18 });

  C.neatline(ink, pen, MAP.x, MAP.y, MAP.w, MAP.h, { band: 15, fill: 0.6 });

  // ---- gilt finish: uneven leaf, fine sparkle, then lay it on the vellum ----
  C.tex(ink, W, H, (X, Y) => {
    const a = 0.5 + 0.5 * N.fbm(X / 90 + 50, Y / 90, 4), b = 0.5 + 0.5 * N.fbm(X / 900, Y / 900 + 30, 3);
    const v = 255 * clamp(0.62 + 0.38 * smooth(0.25, 0.7, a)) * lerp(0.8, 1, smooth(0.3, 0.7, b));
    return [v, v, v, 255];
  }, { down: 3, mode: 'multiply' });
  C.speckle(ink, W, H, 0.74, 1, sd + 3);
  // a slow sheen across the leaf, as if the sheet were tilted to a lamp
  ink.save(); ink.globalCompositeOperation = 'overlay';
  const sheen = ink.createLinearGradient(700, 0, 3300, 2160);
  for (const [p, c] of [[0, '#6e6a62'], [0.3, '#8f8a7c'], [0.52, '#d8cfb4'], [0.66, '#a39c8a'], [1, '#6a665f']]) sheen.addColorStop(p, c);
  ink.fillStyle = sheen; ink.fillRect(0, 0, C.DW, C.DH); ink.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${9 * u}px)`; ctx.globalAlpha = 0.3; ctx.drawImage(inkC, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.drawImage(inkC, 0, 0);
  ctx.restore();

  vignette(ctx, W, H, 0.42, '#02050a', 0.5);
  grain(ctx, W, H, 6, sd + 9);
}
