// A procedural full-rigged ship, drawn as a silhouette in two views:
//   drawShip()      — broadside profile, bow to the right (set flip to face left)
//   drawShipBowOn() — coming straight at the viewer
//
// Units: the profile is defined on a hull of waterline length 1, y up-negative,
// origin on the waterline amidships; `scale` is the hull length in pixels.
import { rng, lerp, clamp, rgba, glow, TAU, layer } from './core.js';

const MASTS = [
  // name, base x, deck y, top x, top y, sail scale
  { name: 'fore', bx: 0.265, by: -0.112, tx: 0.25, ty: -0.90, k: 0.9 },
  { name: 'main', bx: 0.02, by: -0.092, tx: 0.0, ty: -1.0, k: 1.0 },
  { name: 'mizzen', bx: -0.275, by: -0.13, tx: -0.30, ty: -0.80, k: 0.76 },
];
// Square sails as fractions of mast height: [foot, head, footWidth, headWidth]
const SQUARE = [
  [0.085, 0.365, 0.40, 0.37],   // course
  [0.385, 0.655, 0.36, 0.275],  // topsail
  [0.675, 0.855, 0.265, 0.195], // topgallant
  [0.872, 0.975, 0.185, 0.135], // royal
];

const mastX = (m, y) => lerp(m.bx, m.tx, clamp((y - m.by) / (m.ty - m.by)));
const mastY = (m, f) => lerp(m.by, m.ty, f);

function hullPath(c) {
  c.beginPath();
  c.moveTo(-0.535, -0.185);                                // taffrail
  c.lineTo(-0.365, -0.170); c.lineTo(-0.36, -0.140);        // poop -> quarterdeck
  c.lineTo(-0.165, -0.128); c.lineTo(-0.16, -0.098);        // quarterdeck -> waist
  c.quadraticCurveTo(0.03, -0.086, 0.215, -0.094);          // waist sheer
  c.lineTo(0.22, -0.116); c.lineTo(0.435, -0.128);          // forecastle
  c.quadraticCurveTo(0.50, -0.132, 0.552, -0.112);          // beakhead
  c.quadraticCurveTo(0.515, -0.085, 0.492, -0.045);         // stem, sweeping back
  c.quadraticCurveTo(0.478, -0.012, 0.462, 0.012);
  c.quadraticCurveTo(0.43, 0.058, 0.36, 0.062);             // forefoot
  c.lineTo(-0.44, 0.062);                                   // keel
  c.quadraticCurveTo(-0.492, 0.05, -0.498, 0.0);            // sternpost
  c.quadraticCurveTo(-0.515, -0.05, -0.552, -0.085);        // counter
  c.lineTo(-0.548, -0.150);                                 // transom / gallery
  c.closePath();
}

// One square sail; returns nothing, fills on ctx `c`.
function squareSail(c, m, spec, o, r, idx) {
  const [f0, f1, wf, wh] = spec;
  const brace = o.brace, belly = o.belly * m.k;
  const yf = mastY(m, f0), yh = mastY(m, f1), h = yf - yh;
  const xh = mastX(m, yh), xf = mastX(m, yf) + belly * 0.35;
  const hw = (wh * m.k * brace) / 2, fw = (wf * m.k * brace) / 2;
  const furl = o.furled.includes(`${m.name}${idx}`);
  // yard
  c.save();
  c.fillStyle = o.hull; c.strokeStyle = o.hull; c.lineWidth = 0.0055 * m.k; c.lineCap = 'round';
  c.beginPath(); c.moveTo(xh - hw * 1.08, yh); c.lineTo(xh + hw * 1.08, yh); c.stroke();
  c.restore();
  if (furl) {
    c.beginPath(); c.ellipse(xh, yh + 0.006, hw, 0.011 * m.k, 0, 0, TAU); c.fill();
    return;
  }
  const t = o.tatter;
  c.beginPath();
  c.moveTo(xh - hw, yh + 0.004);
  c.lineTo(xh + hw, yh + 0.004);
  // leeward leech, bellying toward the bow
  c.quadraticCurveTo(xh + hw + belly * 1.25 + (fw - hw) * 0.6, yh + h * 0.55, xf + fw, yf);
  // foot: arched roach, or ragged when tattered
  const N = 14, roach = h * 0.16;
  for (let i = 1; i <= N; i++) {
    const u = i / N, x = lerp(xf + fw, xf - fw, u);
    let y = yf - Math.sin(u * Math.PI) * roach;
    if (t > 0 && i < N) y -= Math.pow(r(), 1.6) * h * 0.55 * t * (r.chance(0.55) ? 1 : 0.15);
    c.lineTo(x, y);
  }
  // windward leech, hollowed
  c.quadraticCurveTo(xh - hw + belly * 0.95, yh + h * 0.5, xh - hw, yh + 0.004);
  c.closePath();
  c.fill();
  if (t > 0) {
    c.save(); c.globalCompositeOperation = 'destination-out';
    const holes = Math.round(t * 3.2 * r());
    for (let i = 0; i < holes; i++) {
      const hx = xh + r.range(-0.7, 0.7) * hw + belly * 0.6, hy = lerp(yh, yf, r.range(0.25, 0.9));
      c.beginPath(); c.ellipse(hx, hy, r.range(0.004, 0.016) * m.k, r.range(0.02, 0.075) * m.k, r.range(-0.35, 0.35), 0, TAU); c.fill();
    }
    c.restore();
  }
}

function flag(c, x, y, len, hgt, color, r, dir = 1, waves = 2.2) {
  c.save(); c.fillStyle = color;
  const N = 18, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, w = Math.sin(u * waves * TAU + r() * 0.2) * hgt * 0.16 * u;
    top.push([x + dir * u * len, y + w - u * hgt * 0.1]);
    bot.push([x + dir * u * len, y + hgt * (1 - u * 0.12) + w * 1.1]);
  }
  c.beginPath(); c.moveTo(top[0][0], top[0][1]);
  for (const p of top) c.lineTo(p[0], p[1]);
  for (const p of bot.reverse()) c.lineTo(p[0], p[1]);
  c.closePath(); c.fill(); c.restore();
}

/**
 * Broadside profile.
 * o: x, y (waterline centre, px), scale (hull length, px), flip, heel (deg),
 *    hull, sail (fill styles), sailAlpha, rigAlpha, brace (0.5..0.8 foreshortening),
 *    belly, tatter (0..1), furled (['main3', ...]), lights (0..1), lightColor,
 *    pennant, ensign, jibs, spanker, royals, seed
 */
export function drawShip(ctx, opts = {}) {
  const o = { x: 0, y: 0, scale: 1000, flip: false, heel: 0, hull: '#04070b', sail: '#0a1118', sailAlpha: 1, rigAlpha: 0.75,
    brace: 0.64, belly: 0.05, tatter: 0, furled: [], lights: 0, lightColor: '#f0a04a', pennant: true, ensign: true,
    jibs: 3, spanker: true, royals: true, seed: 11, ...opts };
  const r = rng(o.seed);
  const c = ctx;
  c.save();
  c.translate(o.x, o.y);
  c.rotate((o.heel * Math.PI) / 180);
  c.scale(o.flip ? -o.scale : o.scale, o.scale);
  c.lineJoin = 'round'; c.lineCap = 'round';

  // --- standing rigging (behind sails)
  c.save();
  c.strokeStyle = o.hull; c.globalAlpha = o.rigAlpha;
  const line = (x0, y0, x1, y1, w = 0.0016) => { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const [fore, main, miz] = MASTS;
  const bs0 = [0.455, -0.128], bs1 = [0.86, -0.262];             // bowsprit + jib-boom
  const bsAt = t => [lerp(bs0[0], bs1[0], t), lerp(bs0[1], bs1[1], t)];
  // stays
  for (const [m, f, tx, ty] of [
    [fore, 0.40, ...bsAt(0.42)], [fore, 0.68, ...bsAt(0.74)], [fore, 0.88, ...bsAt(1)], [fore, 1.0, ...bsAt(1)],
    [main, 0.40, fore.bx + 0.01, fore.by], [main, 0.68, mastX(fore, mastY(fore, 0.42)), mastY(fore, 0.42)],
    [main, 0.88, mastX(fore, mastY(fore, 0.70)), mastY(fore, 0.70)],
    [miz, 0.42, main.bx + 0.01, main.by], [miz, 0.72, mastX(main, mastY(main, 0.42)), mastY(main, 0.42)],
  ]) line(mastX(m, mastY(m, f)), mastY(m, f), tx, ty, 0.0015);
  // shrouds + ratlines, backstays
  for (const m of MASTS) {
    const topY = mastY(m, 0.395), topX = mastX(m, topY), n = 5;
    for (let i = 0; i < n; i++) line(topX, topY, m.bx - 0.012 - i * 0.021 * m.k, m.by + 0.012, 0.0017);
    for (let i = 0; i < n; i++) line(topX, topY, m.bx + 0.012 + i * 0.008 * m.k, m.by + 0.012, 0.0010);
    c.lineWidth = 0.0008;
    for (let j = 1; j < 11; j++) {
      const u = j / 11, yy = lerp(topY, m.by + 0.012, u);
      c.beginPath(); c.moveTo(lerp(topX, m.bx - 0.012, u), yy); c.lineTo(lerp(topX, m.bx - 0.012 - (n - 1) * 0.021 * m.k, u), yy); c.stroke();
    }
    const tmY = mastY(m, 0.675), tmX = mastX(m, tmY);
    for (let i = 0; i < 3; i++) line(tmX, tmY, topX - 0.02 * m.k - i * 0.012 * m.k, topY, 0.0011);
    line(mastX(m, mastY(m, 0.68)), mastY(m, 0.68), m.bx - 0.14 * m.k, m.by + 0.012, 0.0012);
    line(mastX(m, mastY(m, 0.88)), mastY(m, 0.88), m.bx - 0.17 * m.k, m.by + 0.012, 0.0011);
  }
  c.restore();

  // --- spars: masts, tops, bowsprit
  c.fillStyle = o.hull; c.strokeStyle = o.hull;
  for (const m of MASTS) {
    c.beginPath();
    c.moveTo(m.bx - 0.0075 * m.k, m.by + 0.02); c.lineTo(m.tx - 0.0018, m.ty); c.lineTo(m.tx + 0.0018, m.ty); c.lineTo(m.bx + 0.0075 * m.k, m.by + 0.02);
    c.closePath(); c.fill();
    for (const f of [0.395, 0.675]) {           // fighting top + crosstrees
      const y = mastY(m, f), x = mastX(m, y), w = (f < 0.5 ? 0.03 : 0.018) * m.k;
      c.fillRect(x - w, y - 0.004, w * 2, 0.006);
    }
    c.beginPath(); c.arc(m.tx, m.ty - 0.004, 0.0045, 0, TAU); c.fill();   // truck
  }
  c.lineWidth = 0.0095; c.beginPath(); c.moveTo(bs0[0] - 0.05, bs0[1] + 0.012); c.lineTo(...bsAt(0.62)); c.stroke();
  c.lineWidth = 0.005; c.beginPath(); c.moveTo(...bsAt(0.5)); c.lineTo(...bs1); c.stroke();
  c.lineWidth = 0.0022; c.beginPath(); c.moveTo(...bsAt(0.5)); c.lineTo(0.585, -0.062); c.lineTo(0.50, -0.07); c.stroke(); // dolphin striker + bobstay

  // --- sails (own layer so alpha/tatter never touch the hull)
  const pad = 0.12, lw = 1.6 + pad * 2, lh = 1.25 + pad * 2;
  const [sc, sx] = layer(lw * o.scale, lh * o.scale);
  sx.scale(o.scale, o.scale); sx.translate(0.72 + pad, 1.08 + pad);
  sx.fillStyle = o.sail;
  MASTS.forEach(m => {
    SQUARE.forEach((spec, i) => {
      if (i === 3 && (!o.royals || m.name === 'mizzen')) return;
      if (m.name === 'mizzen' && i === 0) return;       // crossjack yard carries no sail
      squareSail(sx, m, spec, o, r, i);
    });
  });
  // headsails: slim triangles hung on the stays, with sky between them
  const headF = [0.47, 0.66, 0.85], tackT = [0.30, 0.64, 0.98];
  for (let i = 0; i < o.jibs; i++) {
    const hy = mastY(fore, headF[i]), hx = mastX(fore, hy) + 0.006, [tx, ty] = bsAt(tackT[i]);
    const hx2 = lerp(tx, hx, 0.90), hy2 = lerp(ty, hy, 0.90);          // head stops short of the mast
    const luff = Math.hypot(hx2 - tx, hy2 - ty), dx = (hx2 - tx) / luff, dy = (hy2 - ty) / luff;
    // clew: a little way up the luff, pushed aft and down, so the sail stays narrow
    const cx = tx + dx * luff * 0.20 - 0.115 - i * 0.012, cy = ty + dy * luff * 0.20 + 0.058 + i * 0.004;
    sx.beginPath(); sx.moveTo(hx2, hy2);
    sx.quadraticCurveTo(lerp(hx2, tx, 0.5) + 0.006, lerp(hy2, ty, 0.5) + 0.012, tx, ty);     // luff, sagging on the stay
    sx.quadraticCurveTo(lerp(tx, cx, 0.5) + 0.006, lerp(ty, cy, 0.5) + 0.016, cx, cy);       // foot
    sx.quadraticCurveTo(lerp(cx, hx2, 0.5) + 0.030, lerp(cy, hy2, 0.5) + 0.020, hx2, hy2);   // hollow leech
    sx.closePath(); sx.fill();
  }
  if (o.spanker) {
    const gy = mastY(miz, 0.50), by = mastY(miz, 0.10), gx = mastX(miz, gy), bx = mastX(miz, by);
    const peak = [gx - 0.215, gy - 0.115], boomEnd = [bx - 0.30, by - 0.012];
    sx.strokeStyle = o.hull; sx.lineWidth = 0.005; sx.lineCap = 'round';
    sx.beginPath(); sx.moveTo(gx, gy); sx.lineTo(...peak); sx.moveTo(bx, by); sx.lineTo(...boomEnd); sx.stroke();
    sx.beginPath(); sx.moveTo(gx - 0.004, gy + 0.004); sx.lineTo(peak[0] + 0.004, peak[1] + 0.006);
    sx.quadraticCurveTo(lerp(peak[0], boomEnd[0], 0.5) - 0.012, lerp(peak[1], boomEnd[1], 0.5), boomEnd[0] + 0.01, boomEnd[1] - 0.006);
    sx.lineTo(bx - 0.004, by - 0.006); sx.closePath(); sx.fill();
    if (o.ensign) flag(sx, peak[0], peak[1] - 0.004, 0.105, 0.062, o.flagColor || o.hull, r, 1, 1.6);
  }
  c.save(); c.globalAlpha = o.sailAlpha;
  c.drawImage(sc, -(0.72 + pad), -(1.08 + pad), lw, lh);
  c.restore();

  // --- hull on top, with stern lantern and pennant
  c.fillStyle = o.hull;
  hullPath(c); c.fill();
  c.fillRect(-0.545, -0.185, 0.012, -0.03);                      // lantern post
  c.beginPath(); c.arc(-0.539, -0.224, 0.0085, 0, TAU); c.fill();
  // rails / stanchion texture
  for (let x = -0.52; x < -0.37; x += 0.012) c.fillRect(x, -0.196, 0.003, 0.02);
  if (o.pennant) flag(c, main.tx, main.ty - 0.004, 0.16, 0.014, o.flagColor || o.hull, r, 1, 2.6);
  if (o.jolly) flag(c, main.tx, main.ty + 0.012, 0.085, 0.05, o.flagColor || o.hull, r, 1, 1.5);

  // --- lights: stern windows, lantern, a few gunports
  if (o.lights > 0) {
    const L = (x, y, rad, a) => glow(c, x, y, rad, o.lightColor, a * o.lights);
    c.save();
    c.fillStyle = rgba(o.lightColor, 0.95 * o.lights);
    for (let i = 0; i < 4; i++) c.fillRect(-0.528 + i * 0.019, -0.128, 0.011, 0.016);
    for (let i = 0; i < 3; i++) c.fillRect(-0.47 + i * 0.03, -0.108, 0.008, 0.01);
    c.fillStyle = rgba(o.lightColor, 0.55 * o.lights);
    for (let i = 0; i < 9; i++) if (r.chance(o.portChance ?? 0.5)) c.fillRect(-0.30 + i * 0.062, -0.052, 0.012, 0.012);
    c.restore();
    L(-0.50, -0.12, 0.085, 0.5); L(-0.539, -0.224, 0.06, 0.85); L(-0.539, -0.224, 0.015, 1);
    L(mastX(fore, mastY(fore, 0.395)), mastY(fore, 0.395) - 0.01, 0.03, 0.5);
  }
  c.restore();
}

/**
 * Bow-on view: the ship sailing straight toward the viewer.
 * Units: mainmast height above the waterline = 1; `scale` is that height in px.
 * o: x, y (waterline centre), scale, yaw (-1..1 slight turn), hull, sail, sailAlpha, tatter, lights, seed
 */
export function drawShipBowOn(ctx, opts = {}) {
  const o = { x: 0, y: 0, scale: 1000, yaw: 0.25, heel: 0, hull: '#04070b', sail: '#0a1118', sailAlpha: 1, rigAlpha: 0.7,
    tatter: 0, lights: 0, lightColor: '#f0a04a', studding: false, seed: 5, ...opts };
  const r = rng(o.seed), c = ctx;
  c.save();
  c.translate(o.x, o.y); c.rotate((o.heel * Math.PI) / 180); c.scale(o.scale, o.scale);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const masts = [
    { x: -0.085 * o.yaw * 2, h: 0.80, k: 0.74, z: 0 },  // mizzen (furthest)
    { x: 0, h: 1.0, k: 1.0, z: 1 },                     // main
    { x: 0.075 * o.yaw * 2, h: 0.90, k: 0.9, z: 2 },    // fore (nearest)
  ];
  const rows = [[0.115, 0.36, 0.60, 0.56], [0.385, 0.65, 0.53, 0.41], [0.675, 0.85, 0.385, 0.285], [0.87, 0.975, 0.265, 0.19]];
  const [sc, sx] = layer(1.5 * o.scale, 1.3 * o.scale);
  sx.scale(o.scale, o.scale); sx.translate(0.75, 1.15);
  for (const m of masts) {
    // rigging fan
    sx.strokeStyle = o.hull; sx.globalAlpha = o.rigAlpha;
    for (const f of [0.39, 0.67]) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      sx.lineWidth = 0.0016; sx.beginPath(); sx.moveTo(m.x, -m.h * f); sx.lineTo(m.x + s * (0.105 + i * 0.012) * m.k, f < 0.5 ? -0.085 : -m.h * 0.39); sx.stroke();
    }
    sx.globalAlpha = 1;
    sx.fillStyle = o.hull;
    sx.beginPath(); sx.moveTo(m.x - 0.008 * m.k, -0.06); sx.lineTo(m.x - 0.002, -m.h); sx.lineTo(m.x + 0.002, -m.h); sx.lineTo(m.x + 0.008 * m.k, -0.06); sx.closePath(); sx.fill();
    // sails: shade the further masts slightly so the stack reads in depth
    rows.forEach((row, i) => {
      if (i === 3 && m.z === 0) return;
      if (i === 0 && m.z === 0) return;
      const [f0, f1, wf, wh] = row;
      const yf = -m.h * f0, yh = -m.h * f1, h = yf - yh, hw = (wh * m.k) / 2, fw = (wf * m.k) / 2;
      sx.strokeStyle = o.hull; sx.lineWidth = 0.006 * m.k;
      sx.beginPath(); sx.moveTo(m.x - hw * 1.1, yh); sx.lineTo(m.x + hw * 1.1, yh); sx.stroke();
      sx.fillStyle = o.sail;
      sx.beginPath(); sx.moveTo(m.x - hw, yh + 0.004); sx.lineTo(m.x + hw, yh + 0.004);
      sx.quadraticCurveTo(m.x + lerp(hw, fw, 0.5) - 0.012 * m.k, yh + h * 0.5, m.x + fw, yf);
      const N = 16, roach = h * 0.17;
      for (let j = 1; j <= N; j++) {
        const u = j / N; let y = yf - Math.sin(u * Math.PI) * roach;
        if (o.tatter > 0 && j < N) y -= Math.pow(r(), 1.6) * h * 0.6 * o.tatter * (r.chance(0.55) ? 1 : 0.12);
        sx.lineTo(lerp(m.x + fw, m.x - fw, u), y);
      }
      sx.quadraticCurveTo(m.x - lerp(hw, fw, 0.5) + 0.012 * m.k, yh + h * 0.5, m.x - hw, yh + 0.004);
      sx.closePath(); sx.fill();
      if (o.tatter > 0) {
        sx.save(); sx.globalCompositeOperation = 'destination-out';
        const holes = Math.round(o.tatter * 3.5 * r());
        for (let q = 0; q < holes; q++) {
          sx.beginPath(); sx.ellipse(m.x + r.range(-0.8, 0.8) * hw, lerp(yh, yf, r.range(0.25, 0.9)), r.range(0.005, 0.02) * m.k, r.range(0.025, 0.085) * m.k, r.range(-0.3, 0.3), 0, TAU); sx.fill();
        }
        sx.restore();
      }
      // a faint separation shadow under each yard so stacked masts stay legible
      if (m.z < 2) { sx.save(); sx.globalCompositeOperation = 'source-atop'; sx.fillStyle = rgba('#000000', 0.22); sx.fillRect(m.x - fw, yh, fw * 2, h); sx.restore(); }
    });
    sx.fillStyle = o.hull; sx.beginPath(); sx.arc(m.x, -m.h - 0.004, 0.005, 0, TAU); sx.fill();
  }
  // jibs, seen nearly edge-on, leaning to leeward
  const fm = masts[2], tip = [fm.x + 0.11 + 0.12 * o.yaw, -0.215];
  sx.fillStyle = o.sail;
  [[0.52, 0.5], [0.70, 0.78], [0.86, 1]].forEach(([f, t]) => {
    const hx = fm.x + 0.004, hy = -fm.h * f, tx = lerp(fm.x + 0.02, tip[0], t), ty = lerp(-0.14, tip[1], t);
    sx.beginPath(); sx.moveTo(hx, hy); sx.lineTo(tx, ty);
    sx.quadraticCurveTo(lerp(tx, fm.x, 0.5) + 0.03, ty + 0.03, fm.x + 0.035, -0.17);
    sx.quadraticCurveTo(fm.x + 0.05, lerp(hy, -0.17, 0.5), hx, hy); sx.closePath(); sx.fill();
  });
  sx.strokeStyle = o.hull; sx.lineWidth = 0.008; sx.beginPath(); sx.moveTo(fm.x + 0.015, -0.115); sx.lineTo(...tip); sx.stroke();
  // pennant
  sx.fillStyle = o.hull;
  const mm = masts[1];
  sx.beginPath(); sx.moveTo(mm.x, -mm.h - 0.004);
  for (let i = 0; i <= 12; i++) sx.lineTo(mm.x + (i / 12) * 0.13, -mm.h - 0.004 + Math.sin(i * 0.9) * 0.006 * (i / 12));
  for (let i = 12; i >= 0; i--) sx.lineTo(mm.x + (i / 12) * 0.13, -mm.h + 0.012 * (1 - i / 14) + Math.sin(i * 0.9) * 0.007 * (i / 12));
  sx.closePath(); sx.fill();
  c.save(); c.globalAlpha = o.sailAlpha; c.drawImage(sc, -0.75, -1.15, 1.5, 1.3); c.restore();

  // hull: a tall, tumblehome bow with a cutwater
  c.fillStyle = o.hull;
  const hx = fm.x * 0.7;
  c.beginPath();
  c.moveTo(hx - 0.118, -0.118);
  c.bezierCurveTo(hx - 0.15, -0.06, hx - 0.12, 0.02, hx - 0.03, 0.06);
  c.lineTo(hx + 0.03, 0.06);
  c.bezierCurveTo(hx + 0.12, 0.02, hx + 0.15, -0.06, hx + 0.118, -0.118);
  c.quadraticCurveTo(hx, -0.105, hx - 0.118, -0.118);
  c.closePath(); c.fill();
  c.beginPath(); c.moveTo(hx - 0.118, -0.118); c.lineTo(hx - 0.122, -0.142); c.quadraticCurveTo(hx, -0.126, hx + 0.122, -0.142); c.lineTo(hx + 0.118, -0.118); c.closePath(); c.fill();
  if (o.lights > 0) {
    for (const s of [-1, 1]) { glow(c, hx + s * 0.128, -0.158, 0.05, o.lightColor, 0.8 * o.lights); glow(c, hx + s * 0.128, -0.158, 0.012, o.lightColor, o.lights); }
    c.fillStyle = rgba(o.lightColor, 0.5 * o.lights);
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) c.fillRect(hx + s * (0.045 + i * 0.04) - 0.006, -0.062 + i * 0.012, 0.012, 0.011);
  }
  c.restore();
}

// Render a ship into its own transparent layer (for reflections, fog, blur).
// Returns { canvas, ox, oy }: draw with ctx.drawImage(canvas, x - ox, y - oy).
export function shipLayer(fn, opts) {
  const s = opts.scale, w = Math.ceil(s * 2.2), h = Math.ceil(s * 1.7);
  const [c, cx] = layer(w, h);
  const ox = w / 2, oy = Math.round(s * 1.35);
  fn(cx, { ...opts, x: ox, y: oy });
  return { canvas: c, ox, oy };
}
