#!/usr/bin/env node
// Renders a scene module from art/scenes/ to an image with headless Chromium.
//
//   node art/render.mjs <scene> [--scale 0.5] [--out file.(webp|png|jpg)] [--quality 0.92]
//                               [--seed N] [--t 1] [--set key=value ...]
//   node art/render.mjs <scene> --frames 180 --out dir/     (animation: t = 0..1, one JPEG per frame)
//
// A scene is an ES module exporting `render(ctx, W, H, opts)` (may be async) and,
// optionally, `size = [W, H]` (default 3840x2160). `opts` carries seed, t (0..1
// animation time, 1 = the final still) and any --set values.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ART = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const scene = args[0];
if (!scene) {
  console.error('usage: render.mjs <scene> [--scale s] [--out file] [--quality q] [--seed n] [--t x] [--set k=v]');
  process.exit(1);
}
const opt = { scale: 1, quality: 0.92, out: null, seed: null, t: 1, set: {}, frames: 0 };
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--scale') opt.scale = parseFloat(args[++i]);
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--quality') opt.quality = parseFloat(args[++i]);
  else if (a === '--seed') opt.seed = parseInt(args[++i], 10);
  else if (a === '--t') opt.t = parseFloat(args[++i]);
  else if (a === '--frames') opt.frames = parseInt(args[++i], 10);
  else if (a === '--set') {
    const [k, v] = args[++i].split('=');
    opt.set[k] = isNaN(Number(v)) ? v : Number(v);
  }
}
const out = path.resolve(opt.out || path.join(ART, 'out', `${scene}.webp`));
const mime = opt.frames ? 'image/jpeg' : out.endsWith('.png') ? 'image/png' : out.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"></body>');
    return;
  }
  const file = path.join(ART, path.normalize(decodeURIComponent(url.pathname)));
  if (!file.startsWith(ART)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text'],
});
let failed = false;
try {
  const page = await browser.newPage();
  page.on('console', m => console.log(`[page] ${m.text()}`));
  page.on('pageerror', e => { failed = true; console.error(`[page error] ${e.stack || e.message}`); });
  await page.goto(`http://127.0.0.1:${port}/`);
  const t0 = Date.now();
  const renderOne = t => page.evaluate(async ({ scene, opt, mime, t }) => {
    const mod = (window.__mod ??= await import(`/scenes/${scene}.js?${Date.now()}`));
    const [BW, BH] = mod.size || [3840, 2160];
    const W = Math.round(BW * opt.scale), H = Math.round(BH * opt.scale);
    const canvas = (window.__canvas ??= document.createElement('canvas'));
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    const o = { seed: opt.seed ?? mod.seed ?? 1, t, ...opt.set };
    await mod.render(ctx, W, H, o);
    const blob = await new Promise(r => canvas.toBlob(r, mime, opt.quality));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }, { scene, opt, mime, t });
  if (opt.frames) {
    await fs.mkdir(out, { recursive: true });
    for (let i = 0; i < opt.frames; i++) {
      const dataUrl = await renderOne(i / (opt.frames - 1));
      await fs.writeFile(path.join(out, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
      if (i % 30 === 0) console.log(`frame ${i}/${opt.frames}`);
    }
    console.log(`${scene} -> ${out} (${opt.frames} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } else {
    const dataUrl = await renderOne(opt.t);
    await fs.mkdir(path.dirname(out), { recursive: true });
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    await fs.writeFile(out, buf);
    console.log(`${scene} -> ${out} (${(buf.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
} catch (e) {
  failed = true;
  console.error(e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
