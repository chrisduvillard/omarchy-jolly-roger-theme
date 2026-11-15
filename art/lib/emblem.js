// The Jolly Roger emblem: a skull over two crossed cutlasses, as a flat
// single-colour vector mark with transparent cut-outs (sockets, nasal cavity,
// tooth gaps, the groove of each blade). No shading: scenes that need it on
// cloth render the emblem into a layer and light it themselves.
//
//   drawEmblem(ctx, { x, y, size, color })
//
// The mark is centred on (x, y) and fits inside a size × size box.
import { layer } from './core.js';

const TAU = Math.PI * 2;

// ---- path helpers ---------------------------------------------------------
// A closed outline that is symmetric about x = 0: `segs` are cubic segments
// [c1x, c1y, c2x, c2y, x, y] down the right-hand side from `start` (on the
// axis) to a last point on the axis; the left side is the mirror image.
function symPath(c, start, segs) {
  c.moveTo(start[0], start[1]);
  for (const s of segs) c.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], p = i ? segs[i - 1] : [0, 0, 0, 0, start[0], start[1]];
    c.bezierCurveTo(-s[2], s[3], -s[0], s[1], -p[4], p[5]);
  }
  c.closePath();
}
// A closed blob from cubic segments, mirrored by sx (±1).
function blob(c, sx, start, segs) {
  c.moveTo(start[0] * sx, start[1]);
  for (const s of segs) c.bezierCurveTo(s[0] * sx, s[1], s[2] * sx, s[3], s[4] * sx, s[5]);
  c.closePath();
}

// ---- skull ----------------------------------------------------------------
// Skull units: about 0.95 wide (x in ±0.475), crown at y = -0.60, chin at 0.735.
const SKULL_OUTLINE = [
  [0.27, -0.60, 0.478, -0.47, 0.478, -0.225],     // dome to the widest point
  [0.478, -0.11, 0.456, -0.045, 0.416, 0.004],    // down to the temple
  [0.403, 0.02, 0.41, 0.038, 0.43, 0.05],         // step out onto the cheekbone
  [0.468, 0.073, 0.47, 0.15, 0.432, 0.196],       // zygomatic arch
  [0.412, 0.22, 0.392, 0.228, 0.387, 0.258],      // tuck in to the ramus of the jaw
  [0.382, 0.33, 0.372, 0.43, 0.347, 0.498],       // ramus down to the angle
  [0.337, 0.528, 0.322, 0.545, 0.302, 0.565],     // round the angle
  [0.252, 0.62, 0.205, 0.672, 0.158, 0.704],      // jawline
  [0.122, 0.728, 0.06, 0.735, 0, 0.735],          // chin
];
const mouthY = x => 0.456 - 0.18 * x * x;         // line where the teeth meet

function skullSilhouette(c) {
  c.beginPath();
  symPath(c, [0, -0.60], SKULL_OUTLINE);
}

// Everything that is cut out of the skull.
function skullHoles(c) {
  c.beginPath();
  for (const sx of [1, -1]) {
    // orbit: heavy brow that lifts toward the temple, then droops to the outside
    blob(c, sx, [0.064, -0.018], [
      [0.057, -0.088, 0.104, -0.13, 0.182, -0.141],
      [0.278, -0.154, 0.369, -0.122, 0.375, -0.032],
      [0.381, 0.05, 0.328, 0.121, 0.247, 0.125],
      [0.16, 0.129, 0.072, 0.074, 0.064, -0.018],
    ]);
    // one side of the nasal aperture, split by the septum
    blob(c, sx, [0.0105, 0.128], [
      [0.03, 0.108, 0.054, 0.132, 0.072, 0.182],
      [0.092, 0.234, 0.112, 0.268, 0.102, 0.296],
      [0.092, 0.322, 0.054, 0.328, 0.032, 0.312],
      [0.018, 0.302, 0.0105, 0.288, 0.0105, 0.268],
    ]);
    // hollow of the cheek: under the cheekbone, between upper jaw and ramus
    blob(c, sx, [0.376, 0.23], [
      [0.356, 0.272, 0.356, 0.362, 0.336, 0.43],
      [0.326, 0.462, 0.298, 0.466, 0.27, 0.456],
      [0.264, 0.40, 0.268, 0.335, 0.258, 0.282],
      [0.252, 0.238, 0.335, 0.196, 0.376, 0.23],
    ]);
  }
  c.fill();

  // the dark line between the upper and lower teeth
  c.beginPath();
  const N = 24, x1 = 0.272, th = 0.0105;
  for (let i = 0; i <= N; i++) { const x = -x1 + (2 * x1 * i) / N; c.lineTo(x, mouthY(x) - th); }
  for (let i = N; i >= 0; i--) { const x = -x1 + (2 * x1 * i) / N; c.lineTo(x, mouthY(x) + th); }
  c.closePath(); c.fill();

  // gaps between the teeth: each one flares at the biting edge (so the crowns
  // have rounded corners), pinches where the crowns touch, then opens into a
  // dark teardrop between the roots
  const gap = (x, y0, len, w, dir) => {
    const lean = -x * 0.06 * dir, Y = k => y0 + len * k * dir, X = k => x + lean * k;
    const wf = w * 1.9, wn = w * 0.42, wr = w;
    c.beginPath();
    c.moveTo(x - wf, y0);
    c.bezierCurveTo(X(0.05) - wn * 1.3, Y(0.06), X(0.1) - wn, Y(0.1), X(0.2) - wn, Y(0.2));
    c.bezierCurveTo(X(0.35) - wn, Y(0.36), X(0.5) - wr, Y(0.5), X(0.72) - wr, Y(0.74));
    c.bezierCurveTo(X(0.88) - wr, Y(0.92), X(1) - wr * 0.55, Y(1), X(1), Y(1));
    c.bezierCurveTo(X(1) + wr * 0.55, Y(1), X(0.88) + wr, Y(0.92), X(0.72) + wr, Y(0.74));
    c.bezierCurveTo(X(0.5) + wr, Y(0.5), X(0.35) + wn, Y(0.36), X(0.2) + wn, Y(0.2));
    c.bezierCurveTo(X(0.1) + wn, Y(0.1), X(0.05) + wn * 1.3, Y(0.06), x + wf, y0);
    c.closePath(); c.fill();
  };
  const upper = [0, 0.063, 0.118, 0.166, 0.207], lower = [0, 0.054, 0.103, 0.147, 0.187];
  for (const x of upper) for (const sx of x ? [1, -1] : [1]) {
    const X = x * sx, k = 1 - Math.abs(x) * 1.7;
    gap(X, mouthY(X) - th * 0.5, 0.092 * k + 0.014, 0.0105 * (0.78 + 0.22 * k), -1);
  }
  for (const x of lower) for (const sx of x ? [1, -1] : [1]) {
    const X = x * sx, k = 1 - Math.abs(x) * 2.0;
    gap(X, mouthY(X) + th * 0.5, 0.074 * k + 0.014, 0.0095 * (0.78 + 0.22 * k), 1);
  }

  // a weathering crack running down from the crown
  c.beginPath();
  const crack = [[0.215, -0.562], [0.236, -0.49], [0.208, -0.432], [0.24, -0.37], [0.224, -0.316], [0.248, -0.262]];
  const cw = [0.0095, 0.009, 0.008, 0.0062, 0.004, 0];
  for (let i = 0; i < crack.length; i++) c.lineTo(crack[i][0] + cw[i], crack[i][1]);
  for (let i = crack.length - 1; i >= 0; i--) c.lineTo(crack[i][0] - cw[i], crack[i][1]);
  c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(0.214, -0.426); c.lineTo(0.17, -0.39); c.lineTo(0.174, -0.384); c.lineTo(0.22, -0.416);
  c.closePath(); c.fill();
}

// ---- cutlass --------------------------------------------------------------
// Local units: pommel at the origin, blade along +x to the point at x = 1;
// +y is the cutting-edge side. Adds sub-paths to `c`.
const B0 = 0.2;                        // where the blade leaves the guard
const TIP = 0.87;                      // where the clipped point begins
const spine0 = t => -0.03 - 0.15 * Math.pow(t, 1.8);
const tipY = spine0(1) + 0.022;
const spineY = t => (t < TIP ? spine0(t) : spine0(t) + (tipY - spine0(1)) * Math.pow((t - TIP) / (1 - TIP), 1.6));
const edgeY = t => {
  const w = 0.056 + 0.036 * Math.pow(t, 1.25), E = 0.6, y0 = spine0(t) + w;
  if (t < E) return y0;
  return y0 + (tipY - y0) * Math.pow((t - E) / (1 - E), 2.6);   // the edge sweeps up to a sharp point
};
// Each part is its own sub-path; `paint` is called after each so overlapping
// parts never cancel one another out.
function cutlassSolid(c, paint) {
  const N = 60;
  // blade
  c.beginPath();
  c.moveTo(B0, spineY(0));
  for (let i = 1; i <= N; i++) { const t = i / N; c.lineTo(B0 + t * (1 - B0), spineY(t)); }
  for (let i = N - 1; i >= 0; i--) { const t = i / N; c.lineTo(B0 + t * (1 - B0), edgeY(t)); }
  c.closePath(); paint();
  // cross-guard with an up-curled quillon on the spine side
  c.beginPath();
  c.moveTo(0.166, 0.04);
  c.lineTo(0.166, -0.05);
  c.bezierCurveTo(0.166, -0.084, 0.198, -0.104, 0.228, -0.092);
  c.bezierCurveTo(0.242, -0.086, 0.242, -0.066, 0.228, -0.063);
  c.bezierCurveTo(0.212, -0.065, 0.204, -0.058, 0.204, -0.044);
  c.lineTo(0.204, 0.04);
  c.closePath(); paint();
  // grip, swelling in the middle, and the pommel cap
  c.beginPath();
  c.moveTo(0.036, -0.019);
  c.bezierCurveTo(0.08, -0.027, 0.13, -0.027, 0.17, -0.02);
  c.lineTo(0.17, 0.022);
  c.bezierCurveTo(0.13, 0.028, 0.08, 0.028, 0.036, 0.02);
  c.closePath(); paint();
  c.beginPath();
  c.moveTo(0.05, -0.032);
  c.bezierCurveTo(0.02, -0.043, -0.012, -0.028, -0.012, 0);
  c.bezierCurveTo(-0.012, 0.028, 0.02, 0.043, 0.05, 0.032);
  c.closePath(); paint();
  // shell guard: a broad knuckle-bow sweeping from the cross to the pommel
  c.beginPath();
  c.moveTo(0.204, 0.024);
  c.bezierCurveTo(0.228, 0.1, 0.184, 0.136, 0.118, 0.126);
  c.bezierCurveTo(0.062, 0.117, 0.014, 0.086, -0.004, 0.022);
  c.lineTo(0.03, 0.012);
  c.lineTo(0.198, 0.016);
  c.closePath(); paint();
}
function cutlassHoles(c, side) {
  // window between grip and knuckle-bow
  c.moveTo(0.164, 0.04);
  c.bezierCurveTo(0.172, 0.084, 0.148, 0.098, 0.114, 0.091);
  c.bezierCurveTo(0.086, 0.085, 0.066, 0.07, 0.058, 0.04);
  c.closePath();
  // fuller: a groove under the spine
  const N = 30, t0 = 0.06, t1 = 0.68;
  const fy = t => spine0(t) + 0.0165 + 0.005 * t;
  const fw = t => 0.0062 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) ** 0.4;
  c.moveTo(B0 + t0 * (1 - B0), fy(t0));
  for (let i = 1; i <= N; i++) { const t = t0 + ((t1 - t0) * i) / N; c.lineTo(B0 + t * (1 - B0), fy(t) - fw(t)); }
  for (let i = N; i >= 0; i--) { const t = t0 + ((t1 - t0) * i) / N; c.lineTo(B0 + t * (1 - B0), fy(t) + fw(t)); }
  c.closePath();
  // bands on the grip
  for (const gx of [0.082, 0.126]) { c.moveTo(gx - 0.0045, -0.04); c.lineTo(gx + 0.0045, -0.04); c.lineTo(gx + 0.0045, 0.04); c.lineTo(gx - 0.0045, 0.04); c.closePath(); }
  // nicks in the cutting edge: each blade has seen different work
  for (const t of side > 0 ? [0.34, 0.585] : [0.47]) {
    const x = B0 + t * (1 - B0), y = edgeY(t);
    c.moveTo(x - 0.008, y + 0.004); c.lineTo(x + 0.001, y - 0.012); c.lineTo(x + 0.007, y + 0.004); c.closePath();
  }
}

// Layout inside the unit box (x, y in ±0.5).
const SK = { s: 0.5, y: -0.19 };                 // skull scale and centre offset
const CUT = { px: 0.37, py: 0.41, len: 0.88, ang: 24.5 * Math.PI / 180 };

function withCutlass(c, side, fn) {
  // side = +1: hilt lower right, blade rising to the upper left.
  c.save();
  c.scale(side, 1);
  c.translate(CUT.px, CUT.py);
  c.rotate(Math.PI + CUT.ang);           // +x now points up and to the left
  c.scale(CUT.len, -CUT.len);            // flip so +y (edge, guard) faces down/out
  fn();
  c.restore();
}
function withSkull(c, fn) {
  c.save();
  c.translate(0, SK.y); c.scale(SK.s, SK.s);
  fn();
  c.restore();
}

/**
 * Draw the emblem. `color` is the single fill colour; `gap` is the width of
 * the knock-out halo that separates overlapping pieces (fraction of size).
 */
export function drawEmblem(ctx, { x = 0, y = 0, size = 400, color = '#e9dfc6', gap = 0.011 } = {}) {
  const px = Math.max(8, Math.ceil(size));
  const [cv, c] = layer(px, px);
  c.translate(px / 2, px / 2);
  c.scale(px, px);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';

  const knock = pathFn => {            // erase a halo where the next piece goes
    c.save();
    c.globalCompositeOperation = 'destination-out';
    pathFn(true);
    c.restore();
  };
  const cutlass = side => {
    knock(() => withCutlass(c, side, () => { c.lineWidth = (gap * 2) / CUT.len; cutlassSolid(c, () => { c.fill(); c.stroke(); }); }));
    withCutlass(c, side, () => cutlassSolid(c, () => c.fill()));
    c.save(); c.globalCompositeOperation = 'destination-out';
    withCutlass(c, side, () => { c.beginPath(); cutlassHoles(c, side); c.fill(); });
    c.restore();
  };
  cutlass(-1);
  cutlass(1);

  // skull, knocked out of the blades behind it, then drawn with its own holes
  knock(() => withSkull(c, () => { skullSilhouette(c); c.lineWidth = (gap * 2) / SK.s; c.fill(); c.stroke(); }));
  const [sv, s] = layer(px, px);
  s.translate(px / 2, px / 2); s.scale(px, px);
  s.fillStyle = '#fff';
  withSkull(s, () => {
    skullSilhouette(s); s.fill();
    s.globalCompositeOperation = 'destination-out';
    skullHoles(s);
  });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(sv, 0, 0);

  // tint, then place
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, px, px);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, x - size / 2, y - size / 2, size, size);
  ctx.restore();
  return cv;
}
