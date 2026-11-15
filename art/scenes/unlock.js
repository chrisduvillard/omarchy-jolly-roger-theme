// unlock.png — the boot / unlock-screen logo: the emblem over the Omarchy
// wordmark, in doubloon gold on a transparent background.
import { P } from '../lib/core.js';
import { drawEmblem } from '../lib/emblem.js';
import { drawWordmark } from '../lib/wordmark.js';

export const size = [560, 520];

export function render(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  drawEmblem(ctx, { x: W / 2, y: H * 0.385, size: H * 0.74, color: P.gold });
  drawWordmark(ctx, { x: W / 2, y: H * 0.80, width: W * 0.74, color: P.gold });
}
