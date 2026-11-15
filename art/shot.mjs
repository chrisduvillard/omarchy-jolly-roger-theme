#!/usr/bin/env node
// Screenshot an HTML file from art/ with headless Chromium.
//   node art/shot.mjs <file.html> <out.png> [width] [height]
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ART = path.dirname(fileURLToPath(import.meta.url));
const [file, out, w = '2560', h = '1440'] = process.argv.slice(2);
if (!file || !out) { console.error('usage: shot.mjs <file.html> <out.png> [width] [height]'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error(`[page error] ${e.message}`));
await page.goto(pathToFileURL(path.resolve(ART, file)).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: path.resolve(out), omitBackground: process.argv.includes('--transparent') });
await browser.close();
console.log(`${file} -> ${out}`);
