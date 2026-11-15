// Treasure Map — the same archipelago, zoomed in on Last Farthing Cay: a
// weathered parchment in iron-gall ink, scorched and torn, lying on a dark table.
import { TAU, clamp, lerp, smooth, rng, makeNoise, layer, grain, vignette, hexToRgb } from '../lib/core.js';
import { drawShip } from '../lib/ship.js';
import * as C from '../lib/chart.js';

export const size = [3840, 2160];
export const seed = 23;

const SH = { cx: 1915, cy: 1092, hw: 1500, hh: 860, rot: -0.042 };     // the sheet
const MW = SH.hw * 2, MH = SH.hh * 2;                                   // map space: 3000 x 1720
const FOLD_X = [-505, 498], FOLD_Y = [8];                               // creases (sheet-centred)

const ISLANDS = [
  { x: 1430, y: 850, rx: 600, ry: 380, rot: -0.12 },
  { x: 1960, y: 700, rx: 360, ry: 290, rot: 0.5 },
  { x: 1010, y: 990, rx: 320, ry: 250, rot: 0.2 },
  { x: 1340, y: 1250, r: 150, cut: 2.4 },                 // Rum Cove
  { x: 2150, y: 1050, r: 120, cut: 2 },
  { x: 530, y: 440, r: 112 }, { x: 2610, y: 1150, r: 105 }, { x: 2560, y: 330, r: 72 }, { x: 760, y: 1440, r: 60 },
  { x: 2540, y: 660, rx: 125, ry: 85, rot: 0.6, peak: 0.42, lift: -0.2 },     // the reef that took the Magpie
];
// tears: [edge, position along it, depth, half-width, skew]
const TEARS = [['t', -505, 150, 24, 0.22], ['b', -505, 96, 18, -0.2], ['t', 498, 84, 16, -0.3], ['b', 498, 132, 22, 0.25],
  ['l', 8, 104, 18, 0.2], ['r', 8, 150, 24, -0.15], ['t', 60, 60, 13, 0.4], ['r', -470, 76, 15, 0.3], ['b', 1080, 64, 14, -0.4], ['l', 520, 70, 14, -0.3]];
const HOLES = [[240, 615, 40, 1], [-1215, -590, 23, 1], [1262, 470, 15, 1],                                 // [x, y, r, burnt]: burn holes,
  [345, -892, 84, 1], [-1532, 300, 66, 1], [735, 912, 92, 1], [-905, 890, 56, 1]];                            // and bites out of the edge

export function render(ctx, W, H, opts) {
  const u = W / C.DW, sd = opts.seed ?? seed, r = rng(sd * 131 + 3), N = makeNoise(sd + 900);
  const pen = C.sepiaPen();
  const cs = Math.cos(SH.rot), sn = Math.sin(SH.rot);
  const local = (X, Y) => { const dx = X - SH.cx, dy = Y - SH.cy; return [dx * cs + dy * sn, -dx * sn + dy * cs]; };
  const setMap = c => { c.setTransform(u, 0, 0, u, 0, 0); c.translate(SH.cx, SH.cy); c.rotate(SH.rot); c.translate(-SH.hw, -SH.hh); };
  const box = (lx, ly, rad = 34) => { const qx = Math.abs(lx) - SH.hw + rad, qy = Math.abs(ly) - SH.hh + rad; return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rad; };
  const foldDist = (lx, ly) => {
    let d = 1e9;
    for (const fx of FOLD_X) d = Math.min(d, Math.abs(lx - fx - 3 * N.n2(ly / 180, fx)));
    for (const fy of FOLD_Y) d = Math.min(d, Math.abs(ly - fy - 3 * N.n2(lx / 180, fy + 9)));
    return d;
  };

  // ---- the table ----
  C.tex(ctx, W, H, (X, Y) => {
    const d = Math.hypot((X - 1920) / 1920, (Y - 1080) / 1080);
    const plank = Math.floor((Y + 140) / 432), py = ((Y + 140) % 432) / 432;
    const g = N.fbm(X / 620 + plank * 37.1, Y / 26, 4) * 0.5 + N.fbm(X / 90 + plank * 11.3, Y / 7, 2) * 0.22;
    const seam = 1 - 0.5 * smooth(0.012, 0, Math.min(py, 1 - py));
    const k = (1.42 - 0.72 * smooth(0.3, 1.3, d)) * (1 + 0.22 * g) * seam * (1 + 0.05 * Math.sin(plank * 2.7));
    return [12 * k, 18.5 * k, 25 * k, 255];
  }, { down: 2 });

  // ---- paper ----
  const [shC, sh] = layer(W, H);
  const A = hexToRgb('#735a38'), B = hexToRgb('#a98e60'), Cc = hexToRgb('#c8b185'), warm = hexToRgb('#ab7a4e');
  C.tex(sh, W, H, (X, Y) => {
    const [lx, ly] = local(X, Y), base = box(lx, ly);
    if (base > 70) return [0, 0, 0, 0];
    let v = 0.56 + 0.5 * N.fbm(lx / 560, ly / 560, 4) + 0.28 * N.fbm(lx / 120 + 11, ly / 120, 4) + 0.1 * N.fbm(lx / 19, ly / 19 + 7, 2);
    const s = N.fbm(lx / 380 + 70, ly / 380 - 20, 4), stain = smooth(0.2, 0.25, s);        // water stains with a tide line
    v -= 0.06 * stain + 0.15 * stain * (1 - smooth(0.25, 0.33, s));
    v -= 0.42 * Math.pow(smooth(-340, 0, base), 1.5);                                       // edges age darker
    for (const fx of FOLD_X) {                                                              // creases: a crack, a worn rim, a tilt of the panel
      const d = lx - fx - 3 * N.n2(ly / 180, fx);
      v += -0.34 * Math.exp(-d * d / 7) + 0.17 * Math.exp(-(d + 7) * (d + 7) / 50) + 0.15 * (d / 240) * Math.exp(-d * d / 115200);
    }
    for (const fy of FOLD_Y) {
      const d = ly - fy - 3 * N.n2(lx / 180, fy + 9);
      v += -0.34 * Math.exp(-d * d / 7) + 0.17 * Math.exp(-(d + 7) * (d + 7) / 50) + 0.15 * (d / 240) * Math.exp(-d * d / 115200);
    }
    v = clamp(v);
    const c = v < 0.5 ? A.map((a, i) => lerp(a, B[i], v * 2)) : B.map((a, i) => lerp(a, Cc[i], v * 2 - 1));
    const w = clamp(0.16 + 0.5 * N.fbm(lx / 800 + 40, ly / 800, 3)) * 0.4;
    return [lerp(c[0], warm[0], w), lerp(c[1], warm[1], w), lerp(c[2], warm[2], w), 255];
  }, { down: 2 });

  // a thin watercolour wash: sea-green along the shores, ochre on the land
  const world = C.makeWorld({ seed: sd, x0: 70, y0: 70, w: MW - 140, h: MH - 140, islands: ISLANDS, rough: 0.36, mid: 0.11 });
  const seaW = hexToRgb('#4d8088'), landW = hexToRgb('#c08e3c');
  C.tex(sh, W, H, (X, Y) => {
    const [lx, ly] = local(X, Y), mx = lx + SH.hw, my = ly + SH.hh;
    if (mx < 74 || my < 74 || mx > MW - 74 || my > MH - 74) return [255, 255, 255, 255];
    const d = world.d(mx, my), pool = 0.7 + 0.6 * N.fbm(mx / 110 + 3, my / 110, 3), reach = 150 + 70 * N.fbm(mx / 260 + 8, my / 260, 2);
    const a = d < 0 ? clamp((0.36 * Math.pow(smooth(-reach, -4, d), 1.5) + 0.05) * pool) : clamp(0.2 * smooth(0, 30, d) * pool);
    const c = d < 0 ? seaW : landW;
    return [lerp(255, c[0], a), lerp(255, c[1], a), lerp(255, c[2], a), 255];
  }, { down: 2, mode: 'multiply' });

  setMap(sh);
  C.fibres(sh, rng(sd + 5), { count: 11000, w: MW, h: MH, len: [8, 64], light: 'rgba(255,246,222,0.085)', dark: 'rgba(62,40,18,0.12)', width: 1 });
  // foxing: rusty freckles, mostly in drifts
  const fr = rng(sd + 31);
  for (let i = 0; i < 26; i++) {
    const cx = fr() * MW, cy = fr() * MH, n = fr.int(3, 16), spread = fr.range(30, 150);
    for (let k = 0; k < n; k++) {
      const x = cx + fr.gauss() * spread, y = cy + fr.gauss() * spread, rad = fr.range(1.5, 7) * (fr.chance(0.1) ? 2 : 1), a = fr.range(0.1, 0.36);
      const g = sh.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(108,62,26,${a})`); g.addColorStop(0.6, `rgba(108,62,26,${a * 0.7})`); g.addColorStop(1, 'rgba(108,62,26,0)');
      sh.fillStyle = g; sh.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // the ring left by a tankard
  const ring = (x, y, rad) => {
    sh.save(); sh.translate(x, y); sh.lineCap = 'round';
    const rr = rng(sd + 61);
    for (let i = 0; i < 46; i++) {
      const a0 = rr() * TAU, a1 = a0 + rr.range(0.3, 1.6);
      sh.strokeStyle = `rgba(86,52,24,${rr.range(0.03, 0.11)})`; sh.lineWidth = rr.range(3, 13);
      sh.beginPath(); sh.ellipse(rr.range(-2, 2), rr.range(-2, 2), rad + rr.range(-4, 4), rad * 0.985 + rr.range(-4, 4), 0.3, a0, a1); sh.stroke();
    }
    const g = sh.createRadialGradient(0, 0, rad * 0.5, 0, 0, rad); g.addColorStop(0, 'rgba(86,52,24,0.02)'); g.addColorStop(1, 'rgba(86,52,24,0.085)');
    sh.fillStyle = g; sh.beginPath(); sh.arc(0, 0, rad, 0, TAU); sh.fill();
    sh.restore();
  };
  ring(722, 1085, 150);

  // ---- ink (white = bare paper) ----
  const [inkC, ink] = layer(W, H);
  ink.fillStyle = '#fff'; ink.fillRect(0, 0, W, H);
  setMap(ink);
  const ROSE = { x: 395, y: 1310, R: 150 };
  const BORDER = { x: 62, y: 62, w: MW - 124, h: MH - 124 };

  // where things stand
  let ly0 = 1290; while (world.d(1340, ly0) < 0 && ly0 > 900) ly0 -= 2;
  const landing = [1340, ly0 - 4], XM = [2005, 700], SKULL = [1650, 915];
  const path = [landing, [1372, ly0 - 62], [1470, 1000], [1600, 968], [1730, 962], [1835, 915], [1900, 850], [1935, 790], [XM[0] - 48, XM[1] + 42]];
  const trailPts = C.spline(path, 10);
  const circles = [[ROSE.x, ROSE.y - 20, ROSE.R * 1.5], [XM[0], XM[1], 90], [SKULL[0], SKULL[1] - 50, 110]];
  const rects = [[640, 150, 1640, 330], [150, 600, 760, 850], [1470, 992, 1830, 1050]];
  const free = (x, y, pad = 0) => {
    for (const c of circles) if (Math.hypot(x - c[0], y - c[1]) < c[2] + pad) return false;
    for (const q of rects) if (x > q[0] - pad && x < q[2] + pad && y > q[1] - pad && y < q[3] + pad) return false;
    return x > BORDER.x + 40 && x < BORDER.x + BORDER.w - 40 && y > BORDER.y + 40 && y < BORDER.y + BORDER.h - 40;
  };
  const SHIP = { x: 1180, y: 1520, s: 176 }, WRECK = { x: 2540, y: 690, s: 150 }, SERP = { x: 2130, y: 1545, s: 0.6 };
  circles.push([SHIP.x, SHIP.y - 70, 150], [WRECK.x, WRECK.y - 50, 130]);
  rects.push([SERP.x - 150, SERP.y - 150, SERP.x + 440, SERP.y + 60], [1210, ly0 + 40, 1470, ly0 + 110], [2360, 760, 2760, 830]);

  // sea
  ink.save(); ink.beginPath(); ink.rect(BORDER.x, BORDER.y, BORDER.w, BORDER.h); ink.clip();
  C.rhumbs(ink, pen, ROSE.x, ROSE.y, { inks: [pen.b(0.34), pen.b(0.24), null], width: 1.3, r: rng(sd + 2) });
  ink.restore();
  const lines = [{ d: 8, w: 1.5, color: pen.a(0.62) }, { d: 19, w: 1.3, color: pen.a(0.46) }, { d: 33, w: 1.2, color: pen.a(0.34) }];
  lines.breaks = { noise: N, scale: 30, amount: 0.27 };
  C.offsetLines(ink, W, H, world, lines, 'sea', setMap);
  C.waveMarks(ink, world, r, { color: pen.a(0.56), count: 95, free, near: 60, far: 330, sep: 120 });
  C.shoals(ink, world, r, { color: pen.a(0.7), rock: pen.a(0.85), dot: 2.6, gap: 9.5, crossSize: 6 });

  // land
  ink.fillStyle = pen.blank; ink.beginPath(); world.land(ink); ink.fill('evenodd');
  ink.fillStyle = pen.b(0.085); ink.beginPath(); world.land(ink); ink.fill('evenodd');
  C.coastHachures(ink, world, r, { color: pen.a(0.7), width: 1.2, len: [5, 17], step: 4.6 });
  C.coastline(ink, world, { color: pen.a(1.05), base: 2, extra: 2.6, jitter: 0.35, r });

  // woods and hills, back to front
  const things = [], pr = rng(sd + 12);
  const offTrail = (x, y, d) => !trailPts.some(p => Math.hypot(p[0] - x, p[1] - y) < d) && free(x, y, 12);
  const hills = [{ x: XM[0] - 138, y: XM[1] + 22, w: 156, h: 150 }, { x: XM[0] + 130, y: XM[1] + 8, w: 142, h: 130 }];   // the Two Brothers
  for (let row = 0, y = 600; y < 900; y += 58, row++) for (let x = 940; x < 1880; x += 128) {
    const px = x + pr.range(-26, 26) + (row % 2) * 64, py = y + pr.range(-12, 12), e = world.elev(px, py);
    const w = pr.range(124, 168), h = pr.range(84, 122) * clamp(0.62 + e * 0.38, 0.8, 1.3);
    if (e < 0.6 || !offTrail(px, py, 74) || !offTrail(px, py - h * 0.6, 60)) continue;
    if (world.d(px, py - h - 14) < 12 || world.d(px - w / 2, py) < 26 || world.d(px + w / 2, py) < 26) continue;
    if (Math.abs(px - SKULL[0]) < 130 && py > SKULL[1] - 150) continue;
    if (hills.some(q => Math.abs(q.x - px) < 96 && Math.abs(q.y - py) < 40) || (Math.abs(px - XM[0]) < 330 && Math.abs(py - XM[1]) < 190)) continue;
    hills.push({ x: px, y: py, w, h });
  }
  for (const m of hills) things.push({ t: 'm', ...m });
  for (let y = 420; y < 1260; y += 104) for (let x = 760; x < 2380; x += 150) {      // groves
    const gx = x + pr.range(-50, 50), gy = y + pr.range(-36, 36), e = world.elev(gx, gy);
    if (e < 0.16 || e > 0.9 || N.n2(gx / 260 + 5, gy / 260) < -0.12 || !pr.chance(0.8)) continue;
    for (let k = pr.int(3, 9); k > 0; k--) {
      const tx = gx + pr.gauss() * 36, ty = gy + pr.gauss() * 24;
      if (world.d(tx, ty) < 30 || !offTrail(tx, ty, 38) || hills.some(q => Math.abs(q.x - tx) < q.w * 0.62 && ty > q.y - q.h - 16 && ty < q.y + 26)) continue;
      if (things.some(o => o.t === 't' && Math.hypot(o.x - tx, o.y - ty) < 21)) continue;
      things.push({ t: 't', x: tx, y: ty, s: pr.range(14, 20) });
    }
  }
  things.sort((a, b) => a.y - b.y);
  for (const o of things) { if (o.t === 'm') C.mountain(ink, pen, o.x, o.y, o.w, o.h, pr); else C.tree(ink, pen, o.x, o.y, o.s, pr); }

  // landmarks
  C.palm(ink, pen, 1228, ly0 - 26, 150, pr, { lean: -0.2 });
  C.palm(ink, pen, 1452, ly0 - 30, 112, pr, { lean: 0.24 });
  C.palm(ink, pen, 1140, ly0 + 4, 96, pr, { lean: 0.16 });
  for (const [x, y, hgt, lean] of [[540, 452, 92, 0.2], [2618, 1158, 86, -0.18], [770, 1442, 70, 0.15]]) if (world.d(x, y) > 6) C.palm(ink, pen, x, y, hgt, pr, { lean });
  C.skullRock(ink, pen, SKULL[0], SKULL[1], 118, pr);
  C.trail(ink, pen, path, pr, { color: pen.c(0.82), width: 3.2 });
  C.bigX(ink, pen, XM[0], XM[1], 54, pr, { color: pen.c(1.12) });

  // the wreck, heeled over on the reef
  const sunk = (o, water) => {
    ink.save(); ink.beginPath(); ink.rect(o.x - o.s, o.y - o.s * 1.2, o.s * 2, o.s * 1.2 + water); ink.clip();
    drawShip(ink, { hull: pen.a(1), sail: pen.a(0.55), rigAlpha: 0.75, ...o, scale: o.s });
    ink.restore();
    ink.strokeStyle = pen.a(0.8); ink.lineWidth = 1.3; ink.lineCap = 'round'; ink.beginPath();
    for (const [dx, dy, l] of [[-0.5, 0.05, 0.22], [-0.12, 0.08, 0.3], [0.3, 0.05, 0.24], [0.56, 0.1, 0.16], [-0.3, 0.17, 0.2], [0.12, 0.19, 0.22]]) {
      const wx = o.x + dx * o.s, wy = o.y + water + dy * o.s, wl = l * o.s;
      ink.moveTo(wx - wl / 2, wy); ink.quadraticCurveTo(wx - wl / 4, wy - 4.5, wx, wy); ink.quadraticCurveTo(wx + wl / 4, wy + 4.5, wx + wl / 2, wy);
    }
    ink.stroke();
  };
  sunk({ ...WRECK, heel: -24, tatter: 1, royals: false, jibs: 1, spanker: false, pennant: false, ensign: false, seed: 5 }, -6);
  sunk({ ...SHIP, flip: false, seed: 3, jolly: true }, 12);
  C.serpent(ink, pen, SERP.x, SERP.y, SERP.s, { r: rng(sd + 77), tongue: pen.c, humps: 2 });

  // compass
  C.windRose(ink, pen, ROSE.x, ROSE.y, ROSE.R, { fleur: 0.42 });

  // lettering, in a clerk's chancery hand
  const hand = (str, x, y, o = {}) => C.text(ink, str, x, y, { font: 'Z003', size: 50, color: pen.a(1), halo: pen.blank, haloW: 9, ...o });
  hand('Last Farthing Cay', 1140, 268, { size: 124, color: pen.a(1.1), halo: null });
  ink.strokeStyle = pen.a(0.95); ink.lineWidth = 2; ink.lineCap = 'round'; ink.beginPath();
  ink.moveTo(720, 312); ink.bezierCurveTo(960, 286, 1250, 342, 1560, 304); ink.bezierCurveTo(1600, 298, 1612, 318, 1586, 322);
  ink.stroke();
  hand('Rum Cove', 1340, ly0 + 92, { size: 46 });
  hand('the Rock that grins', SKULL[0], 1034, { size: 40 });
  hand('The Two Brothers', XM[0] + 4, XM[1] - 168, { size: 44 });
  hand('Wreck of ye Magpie', 2560, 806, { size: 42 });
  const verse = ['From Rum Cove take ye the path', 'past the Rock that grins,', '’twixt the Brothers forty paces', '— & there dig.'];
  verse.forEach((s2, i) => hand(s2, 176 + i * 16, 664 + i * 56, { size: 42, align: 'left', color: pen.a(0.9), rot: -0.012 }));

  // border
  const br = rng(sd + 40), rect = (g, w, s2) => {
    const { x, y, w: bw, h: bh } = BORDER;
    ink.strokeStyle = pen.a(s2); ink.lineWidth = w; ink.lineCap = 'round'; ink.beginPath();
    C.handLine(ink, pen, x - g, y - g, x + bw + g, y - g, br); C.handLine(ink, pen, x + bw + g, y - g, x + bw + g, y + bh + g, br);
    C.handLine(ink, pen, x + bw + g, y + bh + g, x - g, y + bh + g, br); C.handLine(ink, pen, x - g, y + bh + g, x - g, y - g, br);
    ink.stroke();
  };
  rect(0, 1.5, 0.85); rect(11, 3.4, 1);

  // the ink has had a hard life: faded in patches, rubbed off along the creases
  C.tex(ink, W, H, (X, Y) => {
    const [lx, ly] = local(X, Y), fd = foldDist(lx, ly);
    const patch = 0.42 * smooth(0.0, 0.55, N.fbm(lx / 210 + 90, ly / 210, 4)) + 0.1;
    const rub = 0.55 * smooth(13, 2, fd) * smooth(-0.35, 0.3, N.n2(lx / 9, ly / 9));
    const skip = 0.2 * smooth(0.25, 0.7, Math.abs(N.n2(lx / 3.2 + 50, ly / 3.2)));
    const v = 255 * clamp(patch + rub + skip, 0, 0.8);
    return [v, v * 0.96, v * 0.9, 255];
  }, { down: 2, mode: 'screen' });

  sh.setTransform(1, 0, 0, 1, 0, 0);
  sh.globalCompositeOperation = 'multiply'; sh.drawImage(inkC, 0, 0);
  // lamplight from the upper left
  sh.setTransform(u, 0, 0, u, 0, 0);
  const lg = sh.createRadialGradient(1250, 640, 200, 1250, 640, 2500);
  lg.addColorStop(0, '#fff6e4'); lg.addColorStop(0.45, '#e7d8bf'); lg.addColorStop(1, '#a8947c');
  sh.fillStyle = lg; sh.fillRect(0, 0, C.DW, C.DH);
  sh.globalCompositeOperation = 'source-over';

  // ---- torn, scorched edges ----
  const tearAt = (lx, ly) => {
    let g = -1e9;
    for (const [e, pos, depth, hw, skew] of TEARS) {
      let t, s;                                   // t: depth inward from the edge; s: along it
      if (e === 't') { t = ly + SH.hh; s = lx - pos; } else if (e === 'b') { t = SH.hh - ly; s = lx - pos; } else if (e === 'l') { t = lx + SH.hw; s = ly - pos; } else { t = SH.hw - lx; s = ly - pos; }
      if (t > depth + 260 || Math.abs(s) > 420) continue;
      s += skew * t + 7 * N.n2(t / 22, pos);
      g = Math.max(g, Math.min(hw * (1 - Math.max(t, -60) / depth) - Math.abs(s), depth - t));
    }
    return g;
  };
  const cl = Math.hypot(340, 430), cut = { ax: SH.hw - 430, ay: -SH.hh, nx: 340 / cl, ny: -430 / cl };       // the corner the fire took
  const [burnC, maskC] = C.texPair(W, H, (X, Y) => {
    const [lx, ly] = local(X, Y), base = box(lx, ly);
    if (base > 90) return [0, 0, 0, 0, 0];
    let hole = -1e9, heat = 0;
    for (const [hx, hy, hr] of HOLES) {
      const q = Math.hypot(lx - hx, ly - hy);
      if (q > hr + 260) continue;
      hole = Math.max(hole, hr - q + 0.5 * hr * N.fbm(lx / (hr * 1.1) + hx, ly / (hr * 1.1), 3)); heat = Math.max(heat, smooth(hr + 170, hr, q));
    }
    const corner = (lx - cut.ax) * cut.nx + (ly - cut.ay) * cut.ny;
    heat = Math.max(heat, smooth(-300, -30, corner));
    if (base < -380 && hole < -200 && corner < -320) return [0, 0, 0, 0, 255];
    const rag = 44 * N.fbm(lx / 300 + 3, ly / 300, 3) + 15 * N.fbm(lx / 64 + 17, ly / 64, 3) + 4.5 * N.fbm(lx / 13, ly / 13 + 9, 2);
    const dB = Math.max(base + rag, hole + rag * 0.4, corner + rag * 0.9);                  // scorched edges
    const tear = tearAt(lx, ly) + rag * 0.25, d = Math.max(dB, tear), t = -dB;                // tears are clean
    const n = N.fbm(lx / 430 + 21, ly / 430 + 5, 3);
    const wb = lerp(18, 120, smooth(-0.3, 0.42, n)) + 85 * heat;
    const brown = Math.pow(smooth(wb, 0, t), 1.8) * (0.8 + 0.5 * N.fbm(lx / 34, ly / 34 + 4, 3));
    const cw = lerp(3.5, 15, smooth(-0.25, 0.3, n + heat * 0.6)) + 7 * heat, char = smooth(cw, cw * 0.3, t);
    const k = clamp(char + brown * brown * 0.55), grime = 0.4 * smooth(-26, 0, tear);
    return [lerp(90, 11, k), lerp(55, 7, k), lerp(26, 5, k), 255 * clamp(brown * 0.88 + char + grime * (1 - brown)), 255 * smooth(0.9, -0.9, d)];
  }, 1);
  sh.setTransform(1, 0, 0, 1, 0, 0);
  sh.drawImage(burnC, 0, 0, W, H);
  sh.globalCompositeOperation = 'destination-in'; sh.drawImage(maskC, 0, 0, W, H);
  sh.globalCompositeOperation = 'source-over';

  // ---- lay the sheet on the table, with its shadow ----
  const [sdC, sdx] = layer(W, H);
  sdx.drawImage(maskC, 0, 0, W, H);
  ctx.save();
  ctx.filter = `blur(${46 * u}px)`; ctx.globalAlpha = 0.62; ctx.drawImage(sdC, 26 * u, 38 * u);
  ctx.filter = `blur(${9 * u}px)`; ctx.globalAlpha = 0.6; ctx.drawImage(sdC, 5 * u, 8 * u);
  ctx.restore();
  ctx.drawImage(shC, 0, 0);

  vignette(ctx, W, H, 0.5, '#03060a', 0.46);
  grain(ctx, W, H, 6, sd + 9);
}
