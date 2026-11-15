// Cloth: takes a flat texture (the flag as it would lie on a table, alpha =
// where there is cloth) and hangs it in the picture — rippled by a height
// field, warped by the same ripples, and lit from one side so that whatever is
// painted on the cloth folds and shades with it.
//
//   const cloth = makeCloth({ tex, origin, uAxis, vAxis, height, shift, ... });
//   cloth.draw(ctx);                 // paint it
//   cloth.project(u, v) -> [x, y]    // where a cloth point landed on screen
//
// Cloth coordinates: u runs 0..1 from hoist to fly, v 0..1 from head to foot.
// `origin` is the screen position of (0, 0); `uAxis` / `vAxis` are the screen
// vectors of a full unit of u and v. `height(u, v)` is the out-of-plane ripple
// in pixels, `shift(u, v)` an extra in-plane [dx, dy] (droop, taper, flutter).
import { layer, clamp, rng, smoothPath } from './core.js';

const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function makeCloth(o) {
  const {
    tex, origin, uAxis, vAxis,
    height = () => 0, shift = () => [0, 0],
    texRect = [0, 0, 1, 1],          // cloth-space rectangle the texture covers
    parallax = [0.5, -0.2],          // screen shift per pixel of height
    cell = 6,                        // grid step for the ripple fields, px
    slope = 1,                       // exaggeration of the folds for lighting
    key = { dir: [-0.8, -0.35, 0.5], color: [1, 1, 1] },
    fill = { dir: [0.7, 0.3, 0.6], color: [0, 0, 0] },
    ambient = [0.2, 0.2, 0.2],
    sheen = { color: [0, 0, 0], power: 2 },
    shadow = { strength: 0.8, reach: 40, soft: 14 },
    occlusion = 0.5,
    weave = null,                    // { nu, nv, amp, seed }
    exposure = 1,
  } = o;
  const [tu0, tv0, tu1, tv1] = texRect;
  const [ox, oy] = origin, [ux, uy] = uAxis, [vx, vy] = vAxis;
  const lenU = Math.hypot(ux, uy), lenV = Math.hypot(vx, vy);
  const nu = Math.max(6, Math.ceil((lenU * (tu1 - tu0)) / cell)) + 1;
  const nv = Math.max(6, Math.ceil((lenV * (tv1 - tv0)) / cell)) + 1;
  const su = (lenU * (tu1 - tu0)) / (nu - 1), sv = (lenV * (tv1 - tv0)) / (nv - 1);  // px per grid step
  const Z = new Float32Array(nu * nv), DX = new Float32Array(nu * nv), DY = new Float32Array(nu * nv);
  for (let j = 0, k = 0; j < nv; j++) {
    const v = tv0 + ((tv1 - tv0) * j) / (nv - 1);
    for (let i = 0; i < nu; i++, k++) {
      const u = tu0 + ((tu1 - tu0) * i) / (nu - 1);
      const z = height(u, v), s = shift(u, v);
      Z[k] = z; DX[k] = s[0] + parallax[0] * z; DY[k] = s[1] + parallax[1] * z;
    }
  }

  // --- lighting fields on the same grid ---------------------------------
  const eu = [ux / lenU, uy / lenU], ev = [vx / lenV, vy / lenV];
  const toCloth = d => { const n = norm3(d); return [n[0] * eu[0] + n[1] * eu[1], n[0] * ev[0] + n[1] * ev[1], n[2]]; };
  const Lk = toCloth(key.dir), Lf = toCloth(fill.dir);
  const KEY = new Float32Array(nu * nv), FIL = new Float32Array(nu * nv), OCC = new Float32Array(nu * nv);
  const at = (i, j) => Z[clamp(j, 0, nv - 1) * nu + clamp(i, 0, nu - 1)];
  // shadow march: step toward the light across the height field
  const lh = Math.hypot(Lk[0], Lk[1]) || 1e-6, tanEl = Lk[2] / lh;
  const stepPx = Math.max(su, sv), steps = Math.max(1, Math.round(shadow.reach / stepPx));
  const mdi = ((Lk[0] / lh) * stepPx) / su, mdj = ((Lk[1] / lh) * stepPx) / sv;
  const zb = (fi, fj) => {            // bilinear height
    const i0 = Math.floor(fi), j0 = Math.floor(fj), a = fi - i0, b = fj - j0;
    return (at(i0, j0) * (1 - a) + at(i0 + 1, j0) * a) * (1 - b) + (at(i0, j0 + 1) * (1 - a) + at(i0 + 1, j0 + 1) * a) * b;
  };
  const SH = new Float32Array(nu * nv);
  for (let j = 0, k = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++, k++) {
      const zu = ((at(i + 1, j) - at(i - 1, j)) / (2 * su)) * slope, zv = ((at(i, j + 1) - at(i, j - 1)) / (2 * sv)) * slope;
      const il = 1 / Math.hypot(zu, zv, 1), n = [-zu * il, -zv * il, il];
      const kd = n[0] * Lk[0] + n[1] * Lk[1] + n[2] * Lk[2];
      const fd = n[0] * Lf[0] + n[1] * Lf[1] + n[2] * Lf[2];
      let sh = 0;
      if (shadow.strength > 0) {
        const z0 = Z[k] * slope;
        for (let s = 2; s <= steps; s += 2) {
          const over = zb(i + mdi * s, j + mdj * s) * slope - (z0 + s * stepPx * tanEl);
          if (over > 0) sh = Math.max(sh, Math.min(1, over / shadow.soft));
        }
      }
      SH[k] = sh;
      KEY[k] = Math.pow(Math.max(0, kd), key.gamma || 1);
      FIL[k] = Math.max(0, fd);
      // valleys gather less light than crests
      const lap = (at(i + 3, j) + at(i - 3, j) - 2 * Z[k]) / (9 * su * su) + (at(i, j + 3) + at(i, j - 3) - 2 * Z[k]) / (9 * sv * sv);
      OCC[k] = clamp(1 - occlusion * lap * 260 * slope, 0.45, 1.25);
    }
  }
  // soften the cast shadows into penumbra (separable box blur, twice)
  if (shadow.strength > 0) {
    const R = Math.max(1, Math.round((shadow.blur ?? 18) / stepPx)), tmp = new Float32Array(nu * nv);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < nv; j++) {
        let acc = 0;
        for (let i = -R; i <= R; i++) acc += SH[j * nu + clamp(i, 0, nu - 1)];
        for (let i = 0; i < nu; i++) {
          tmp[j * nu + i] = acc / (2 * R + 1);
          acc += SH[j * nu + clamp(i + R + 1, 0, nu - 1)] - SH[j * nu + clamp(i - R, 0, nu - 1)];
        }
      }
      for (let i = 0; i < nu; i++) {
        let acc = 0;
        for (let j = -R; j <= R; j++) acc += tmp[clamp(j, 0, nv - 1) * nu + i];
        for (let j = 0; j < nv; j++) {
          SH[j * nu + i] = acc / (2 * R + 1);
          acc += tmp[clamp(j + R + 1, 0, nv - 1) * nu + i] - tmp[clamp(j - R, 0, nv - 1) * nu + i];
        }
      }
    }
    for (let k = 0; k < nu * nv; k++) KEY[k] *= 1 - SH[k] * shadow.strength;
  }

  // --- helpers ----------------------------------------------------------
  const det = ux * vy - uy * vx;
  const gi = u => ((u - tu0) / (tu1 - tu0)) * (nu - 1), gj = v => ((v - tv0) / (tv1 - tv0)) * (nv - 1);
  const sample = (A, fi, fj) => {
    fi = clamp(fi, 0, nu - 1.001); fj = clamp(fj, 0, nv - 1.001);
    const i0 = fi | 0, j0 = fj | 0, a = fi - i0, b = fj - j0, k = j0 * nu + i0;
    return (A[k] * (1 - a) + A[k + 1] * a) * (1 - b) + (A[k + nu] * (1 - a) + A[k + nu + 1] * a) * b;
  };
  const project = (u, v) => {
    const fi = gi(u), fj = gj(v);
    return [ox + u * ux + v * vx + sample(DX, fi, fj), oy + u * uy + v * vy + sample(DY, fi, fj)];
  };
  const heightAt = (u, v) => sample(Z, gi(u), gj(v));

  function draw(ctx) {
    const CW = ctx.canvas.width, CH = ctx.canvas.height;
    // screen bounds of the warped cloth
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let j = 0; j < nv; j += 2) for (let i = 0; i < nu; i += 2) {
      const u = tu0 + ((tu1 - tu0) * i) / (nu - 1), v = tv0 + ((tv1 - tv0) * j) / (nv - 1), k = j * nu + i;
      const x = ox + u * ux + v * vx + DX[k], y = oy + u * uy + v * vy + DY[k];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    x0 = Math.max(0, Math.floor(x0 - 3)); y0 = Math.max(0, Math.floor(y0 - 3));
    x1 = Math.min(CW, Math.ceil(x1 + 3)); y1 = Math.min(CH, Math.ceil(y1 + 3));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;

    const TW = tex.width, TH = tex.height;
    const T = tex.getContext('2d').getImageData(0, 0, TW, TH).data;
    const [lc, lx] = layer(bw, bh);
    const img = lx.createImageData(bw, bh), d = img.data;

    // weave: thread-level brightness
    let wv = null;
    if (weave) {
      const r = rng(weave.seed || 11);
      const mk = n => { const a = new Float32Array(n + 2); for (let i = 0; i < a.length; i++) a[i] = r.gauss(); return a; };
      const pitch = Math.min(lenU / weave.nu, lenV / weave.nv);   // px per thread
      wv = { nu: weave.nu, nv: weave.nv, hu: mk(Math.ceil(weave.nu * 1.2)), hv: mk(Math.ceil(weave.nv * 1.2)),
        fine: weave.amp * clamp((pitch - 1.6) / 2.2), slub: weave.amp * (weave.slub ?? 0.5) };
    }
    const kc = key.color, fc = fill.color, sc = sheen.color, sp = sheen.power;
    const idu = (nu - 1) / (tu1 - tu0), idv = (nv - 1) / (tv1 - tv0);
    const itu = TW / (tu1 - tu0), itv = TH / (tv1 - tv0);
    const PI = Math.PI;

    for (let py = 0; py < bh; py++) {
      const sy = y0 + py + 0.5 - oy;
      for (let px = 0; px < bw; px++) {
        const sx = x0 + px + 0.5 - ox;
        // invert the warp by fixed-point iteration
        let u = (sx * vy - sy * vx) / det, v = (sy * ux - sx * uy) / det;
        if (u < tu0 - 0.2 || u > tu1 + 0.2 || v < tv0 - 0.2 || v > tv1 + 0.2) continue;
        let fi = 0, fj = 0, i0 = 0, j0 = 0, a = 0, b = 0, k = 0;
        for (let it = 0; it < 5; it++) {
          fi = (u - tu0) * idu; fj = (v - tv0) * idv;
          if (fi < 0) fi = 0; else if (fi > nu - 1.001) fi = nu - 1.001;
          if (fj < 0) fj = 0; else if (fj > nv - 1.001) fj = nv - 1.001;
          i0 = fi | 0; j0 = fj | 0; a = fi - i0; b = fj - j0; k = j0 * nu + i0;
          const ddx = (DX[k] * (1 - a) + DX[k + 1] * a) * (1 - b) + (DX[k + nu] * (1 - a) + DX[k + nu + 1] * a) * b;
          const ddy = (DY[k] * (1 - a) + DY[k + 1] * a) * (1 - b) + (DY[k + nu] * (1 - a) + DY[k + nu + 1] * a) * b;
          const qx = sx - ddx, qy = sy - ddy;
          u = (qx * vy - qy * vx) / det; v = (qy * ux - qx * uy) / det;
        }
        if (u <= tu0 || u >= tu1 || v <= tv0 || v >= tv1) continue;
        // texture, bilinear on premultiplied colour
        const tx = (u - tu0) * itu - 0.5, ty = (v - tv0) * itv - 0.5;
        let xi = Math.floor(tx), yi = Math.floor(ty);
        const fx = tx - xi, fy = ty - yi;
        const xa = xi < 0 ? 0 : xi, xb = xi + 1 >= TW ? TW - 1 : xi + 1, ya = yi < 0 ? 0 : yi, yb = yi + 1 >= TH ? TH - 1 : yi + 1;
        const p00 = (ya * TW + xa) * 4, p10 = (ya * TW + xb) * 4, p01 = (yb * TW + xa) * 4, p11 = (yb * TW + xb) * 4;
        const w00 = (1 - fx) * (1 - fy) * T[p00 + 3], w10 = fx * (1 - fy) * T[p10 + 3], w01 = (1 - fx) * fy * T[p01 + 3], w11 = fx * fy * T[p11 + 3];
        const wa = w00 + w10 + w01 + w11;
        if (wa < 1) continue;
        let r = (T[p00] * w00 + T[p10] * w10 + T[p01] * w01 + T[p11] * w11) / wa;
        let g = (T[p00 + 1] * w00 + T[p10 + 1] * w10 + T[p01 + 1] * w01 + T[p11 + 1] * w11) / wa;
        let bl = (T[p00 + 2] * w00 + T[p10 + 2] * w10 + T[p01 + 2] * w01 + T[p11 + 2] * w11) / wa;
        // light (fields were last sampled at the converged u, v on the previous pass — resample)
        fi = (u - tu0) * idu; fj = (v - tv0) * idv;
        if (fi > nu - 1.001) fi = nu - 1.001; if (fj > nv - 1.001) fj = nv - 1.001;
        i0 = fi | 0; j0 = fj | 0; a = fi - i0; b = fj - j0; k = j0 * nu + i0;
        const w0 = (1 - a) * (1 - b), w1 = a * (1 - b), w2 = (1 - a) * b, w3 = a * b;
        let kd = KEY[k] * w0 + KEY[k + 1] * w1 + KEY[k + nu] * w2 + KEY[k + nu + 1] * w3;
        const fd = FIL[k] * w0 + FIL[k + 1] * w1 + FIL[k + nu] * w2 + FIL[k + nu + 1] * w3;
        const oc = OCC[k] * w0 + OCC[k + 1] * w1 + OCC[k + nu] * w2 + OCC[k + nu + 1] * w3;
        let wm = 1;
        if (wv) {
          // threads wander a little, so the grid never looks machine-ruled
          const U0 = u * wv.nu, V0 = v * wv.nv;
          const iu0 = U0 < 0 ? 0 : U0 | 0, iv0 = V0 < 0 ? 0 : V0 | 0;
          const U = U0 + wv.hv[iv0] * 0.11, V = V0 + wv.hu[iu0] * 0.11;
          const su2 = Math.sin(PI * U), sv2 = Math.sin(PI * V);
          const over = su2 * sv2;                                         // over-and-under of a plain weave
          const gaps = 0.55 * (su2 < 0 ? -su2 : su2) + 1.45 * (sv2 < 0 ? -sv2 : sv2) - 1.27;   // dark lines between threads, the weft showing most
          const irr = 0.65 + 0.35 * wv.hu[(iu0 * 7 + iv0 * 3) % wv.hu.length];
          wm = 1 + wv.fine * (0.5 * over + 0.6 * gaps) * irr + wv.slub * (wv.hu[iu0] + wv.hv[iv0]) * 0.2;
        }
        const sh = sp === 2 ? kd * kd : Math.pow(kd, sp);
        const m = oc * wm * exposure;
        r = r * (ambient[0] + kc[0] * kd + fc[0] * fd) * m + sc[0] * sh * wm;
        g = g * (ambient[1] + kc[1] * kd + fc[1] * fd) * m + sc[1] * sh * wm;
        bl = bl * (ambient[2] + kc[2] * kd + fc[2] * fd) * m + sc[2] * sh * wm;
        // soft shoulder so lit bone does not clip
        if (r > 190) r = 190 + (r - 190) / (1 + (r - 190) / 62);
        if (g > 190) g = 190 + (g - 190) / (1 + (g - 190) / 62);
        if (bl > 190) bl = 190 + (bl - 190) / (1 + (bl - 190) / 62);
        const q = (py * bw + px) * 4;
        d[q] = r; d[q + 1] = g; d[q + 2] = bl; d[q + 3] = wa > 255 ? 255 : wa;
      }
    }
    lx.putImageData(img, 0, 0);
    ctx.drawImage(lc, x0, y0);
  }

  return { draw, project, heightAt, nu, nv };
}

// A laid rope: a dark core with slanted strand highlights.
export function drawRope(ctx, pts, w, col, hi) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = w * 1.5;
  ctx.beginPath(); smoothPath(ctx, pts); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); smoothPath(ctx, pts); ctx.stroke();
  // strands
  ctx.strokeStyle = hi; ctx.lineWidth = w * 0.3;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), tx = (x1 - x0) / L, ty = (y1 - y0) / L;
    for (let s = acc; s < L; s += w * 1.05) {
      const x = x0 + tx * s, y = y0 + ty * s;
      ctx.beginPath();
      ctx.moveTo(x - ty * w * 0.4 - tx * w * 0.35, y + tx * w * 0.4 - ty * w * 0.35);
      ctx.lineTo(x + ty * w * 0.4 + tx * w * 0.35, y - tx * w * 0.4 + ty * w * 0.35);
      ctx.stroke();
    }
    acc = (acc + Math.ceil((L - acc) / (w * 1.05)) * w * 1.05) - L;
  }
  ctx.restore();
}
