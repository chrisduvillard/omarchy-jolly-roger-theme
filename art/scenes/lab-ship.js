import { P, rgba, linearFill } from '../lib/core.js';
import { drawShip, drawShipBowOn } from '../lib/ship.js';
export const size = [3840, 2160];
export function render(ctx, W, H) {
  ctx.fillStyle = linearFill(ctx, 0, 0, 0, H, [[0, '#33526b'], [1, '#9fb4bf']]);
  ctx.fillRect(0, 0, W, H);
  const y = H * 0.56;
  drawShip(ctx, { x: W * 0.3, y, scale: W * 0.3, lights: 1 });
  drawShipBowOn(ctx, { x: W * 0.76, y, scale: H * 0.5, lights: 1 });
  drawShip(ctx, { x: W * 0.25, y: H * 0.95, scale: W * 0.2, tatter: 0.8, flip: true, seed: 4, sail: '#1c2a33' });
  drawShipBowOn(ctx, { x: W * 0.6, y: H * 0.95, scale: H * 0.24, tatter: 0.8, sail: '#1c2a33', yaw: -0.4 });
  ctx.fillStyle = rgba('#0b1219', 0.35); ctx.fillRect(0, y, W, 4);
}
