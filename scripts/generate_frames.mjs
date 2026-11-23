#!/usr/bin/env node
/**
 * Pure Node.js software renderer + procedural audio generator for
 * "ORBIT BREAKER" — Day 1 vs Day 7.
 *
 * Pipes raw RGB24 frames (540x960 @ 60fps, scaled cleanly 2x to 1080x1920 by ffmpeg)
 * into build/day1.mp4 and build/day7.mp4, and synthesizes contrasting WAV audio
 * tracks (build/audio_day1.wav and build/audio_day7.wav).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARENA,
  CANVAS_H,
  CANVAS_W,
  FPS,
  PILLARS,
  TOTAL_DURATION_S,
  simulateMode,
} from './game_sim.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT_DIR, 'build');

// Compact 5x7 pixel bitmap font for crisp in-game HUD & combo popups
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10001', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
  }

  fill(r, g, b) {
    const buf = this.buf;
    for (let i = 0; i < buf.length; i += 3) {
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }

  blendPixel(x, y, r, g, b, alpha) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h || alpha <= 0) return;
    const idx = (y * this.w + x) * 3;
    const a = alpha >= 1 ? 1 : alpha;
    const inv = 1 - a;
    this.buf[idx] = Math.min(255, Math.round(this.buf[idx] * inv + r * a));
    this.buf[idx + 1] = Math.min(255, Math.round(this.buf[idx + 1] * inv + g * a));
    this.buf[idx + 2] = Math.min(255, Math.round(this.buf[idx + 2] * inv + b * a));
  }

  addPixel(x, y, r, g, b, alpha) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h || alpha <= 0) return;
    const idx = (y * this.w + x) * 3;
    this.buf[idx] = Math.min(255, Math.round(this.buf[idx] + r * alpha));
    this.buf[idx + 1] = Math.min(255, Math.round(this.buf[idx + 1] + g * alpha));
    this.buf[idx + 2] = Math.min(255, Math.round(this.buf[idx + 2] + b * alpha));
  }

  fillRect(x, y, w, h, r, g, b, alpha = 1) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.blendPixel(px, py, r, g, b, alpha);
      }
    }
  }

  strokeRect(x, y, w, h, thickness, r, g, b, alpha = 1) {
    this.fillRect(x, y, w, thickness, r, g, b, alpha);
    this.fillRect(x, y + h - thickness, w, thickness, r, g, b, alpha);
    this.fillRect(x, y, thickness, h, r, g, b, alpha);
    this.fillRect(x + w - thickness, y, thickness, h, r, g, b, alpha);
  }

  fillCircle(cx, cy, radius, r, g, b, alpha = 1, additive = false) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius + 1));
    const y0 = Math.max(0, Math.floor(cy - radius - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius + 1));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          if (additive) this.addPixel(x, y, r, g, b, alpha);
          else this.blendPixel(x, y, r, g, b, alpha);
        }
      }
    }
  }

  glowCircle(cx, cy, radius, r, g, b, peakAlpha = 0.45) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius));
    const invR = 1 / Math.max(1, radius);
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy) * invR;
        if (dist < 1) {
          const falloff = (1 - dist) * (1 - dist) * peakAlpha;
          this.addPixel(x, y, r, g, b, falloff);
        }
      }
    }
  }

  strokeCircle(cx, cy, radius, thickness, r, g, b, alpha = 1, additive = false) {
    const outer = radius + thickness * 0.5;
    const inner = Math.max(0, radius - thickness * 0.5);
    const o2 = outer * outer;
    const i2 = inner * inner;
    const x0 = Math.max(0, Math.floor(cx - outer - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + outer + 1));
    const y0 = Math.max(0, Math.floor(cy - outer - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + outer + 1));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= o2 && d2 >= i2) {
          if (additive) this.addPixel(x, y, r, g, b, alpha);
          else this.blendPixel(x, y, r, g, b, alpha);
        }
      }
    }
  }

  drawLine(x0, y0, x1, y1, thickness, r, g, b, alpha = 1, additive = false) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = x0 + (x1 - x0) * u;
      const py = y0 + (y1 - y0) * u;
      if (thickness <= 1.2) {
        if (additive) this.addPixel(Math.round(px), Math.round(py), r, g, b, alpha);
        else this.blendPixel(Math.round(px), Math.round(py), r, g, b, alpha);
      } else {
        this.fillCircle(px, py, thickness * 0.5, r, g, b, alpha, additive);
      }
    }
  }

  drawText(text, x, y, scale, r, g, b, alpha = 1) {
    const upper = String(text).toUpperCase();
    let cx = Math.round(x);
    const cy = Math.round(y);
    for (const ch of upper) {
      const rows = GLYPHS[ch] ?? GLYPHS[' '];
      for (let ry = 0; ry < rows.length; ry++) {
        const row = rows[ry];
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '1') {
            this.fillRect(cx + rx * scale, cy + ry * scale, scale, scale, r, g, b, alpha);
          }
        }
      }
      cx += 6 * scale;
    }
  }
}

function buildStaticBackground(mode) {
  const bg = new Raster(CANVAS_W, CANVAS_H);
  if (mode === 'day1') {
    // Stark barebones prototype look
    bg.fill(20, 22, 27);
    bg.fillRect(
      ARENA.left,
      ARENA.top,
      ARENA.right - ARENA.left,
      ARENA.bottom - ARENA.top,
      27,
      30,
      36,
      1,
    );
    // Faint plain prototype grid
    for (let gx = ARENA.left + 43; gx < ARENA.right; gx += 43) {
      bg.fillRect(gx, ARENA.top, 1, ARENA.bottom - ARENA.top, 38, 42, 50, 1);
    }
    for (let gy = ARENA.top + 46; gy < ARENA.bottom; gy += 46) {
      bg.fillRect(ARENA.left, gy, ARENA.right - ARENA.left, 1, 38, 42, 50, 1);
    }
    bg.strokeRect(
      ARENA.left,
      ARENA.top,
      ARENA.right - ARENA.left,
      ARENA.bottom - ARENA.top,
      2,
      128,
      136,
      148,
      1,
    );
    for (const p of PILLARS) {
      bg.fillCircle(p.x, p.y, p.r, 52, 58, 68, 1);
      bg.strokeCircle(p.x, p.y, p.r, 2, 118, 126, 138, 1);
    }
    return bg.buf;
  }

  // Day 7: Deep neon cosmic arena with radial ambiance, cyber-grid, energy pillars
  for (let y = 0; y < CANVAS_H; y++) {
    const ny = y / CANVAS_H;
    const baseR = Math.round(10 + 14 * Math.sin(ny * Math.PI));
    const baseG = Math.round(8 + 10 * ny);
    const baseB = Math.round(28 + 26 * Math.sin(ny * Math.PI));
    for (let x = 0; x < CANVAS_W; x++) {
      const idx = (y * CANVAS_W + x) * 3;
      bg.buf[idx] = baseR;
      bg.buf[idx + 1] = baseG;
      bg.buf[idx + 2] = baseB;
    }
  }
  // Subtle distant stars outside the arena
  for (let i = 0; i < 90; i++) {
    const sx = (i * 197 + 31) % CANVAS_W;
    const sy = (i * 353 + 73) % CANVAS_H;
    bg.addPixel(sx, sy, 140, 170, 255, 0.35);
  }
  // Arena floor fill + atmospheric center nebula glow
  bg.fillRect(
    ARENA.left,
    ARENA.top,
    ARENA.right - ARENA.left,
    ARENA.bottom - ARENA.top,
    13,
    15,
    34,
    0.92,
  );
  bg.glowCircle(ARENA.cx, ARENA.cy, 250, 120, 35, 195, 0.24);
  bg.glowCircle(ARENA.cx, ARENA.top + 110, 180, 25, 165, 240, 0.16);
  // Crisp neon tactical grid
  for (let gx = ARENA.left + 43; gx < ARENA.right; gx += 43) {
    bg.fillRect(gx, ARENA.top, 1, ARENA.bottom - ARENA.top, 38, 66, 128, 0.45);
  }
  for (let gy = ARENA.top + 46; gy < ARENA.bottom; gy += 46) {
    bg.fillRect(ARENA.left, gy, ARENA.right - ARENA.left, 1, 38, 66, 128, 0.45);
  }
  // Subtle concentric tactical rings in center of map
  bg.strokeCircle(ARENA.cx, ARENA.cy, 95, 1.5, 56, 200, 255, 0.22);
  bg.strokeCircle(ARENA.cx, ARENA.cy, 165, 1.2, 235, 65, 185, 0.16);

  // Glowing arena perimeter walls
  bg.strokeRect(
    ARENA.left - 3,
    ARENA.top - 3,
    ARENA.right - ARENA.left + 6,
    ARENA.bottom - ARENA.top + 6,
    4,
    38,
    210,
    255,
    0.25,
  );
  bg.strokeRect(
    ARENA.left,
    ARENA.top,
    ARENA.right - ARENA.left,
    ARENA.bottom - ARENA.top,
    2,
    88,
    238,
    255,
    0.95,
  );

  // Upgraded glowing energy pillars (exact same coordinates as Day 1!)
  for (const p of PILLARS) {
    bg.glowCircle(p.x, p.y, p.r + 22, 48, 210, 255, 0.24);
    bg.fillCircle(p.x, p.y, p.r, 20, 34, 68, 1);
    bg.strokeCircle(p.x, p.y, p.r, 2.5, 80, 232, 255, 0.95);
    bg.strokeCircle(p.x, p.y, p.r - 7, 1.5, 255, 86, 194, 0.7);
    bg.fillCircle(p.x, p.y, 4, 210, 250, 255, 0.9);
  }

  return bg.buf;
}

function renderFrame(raster, staticBg, frame) {
  staticBg.copy(raster.buf);
  const ox = frame.fx.shakeX;
  const oy = frame.fx.shakeY;

  if (frame.mode === 'day1') {
    // Day 1: plain white square player, basic red squares for enemies, tiny white bullets
    for (const b of frame.bullets) {
      raster.fillRect(b.x - 3, b.y - 3, 6, 6, 235, 238, 245, 1);
    }
    for (const e of frame.enemies) {
      raster.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, 215, 72, 72, 1);
      raster.strokeRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, 1.5, 245, 145, 145, 1);
    }
    const px = frame.player.x;
    const py = frame.player.y;
    raster.fillRect(px - 11, py - 11, 22, 22, 240, 244, 248, 1);

    // Minimalist Day 1 HUD
    raster.drawText(`SCORE ${frame.hud.score}`, ARENA.left + 8, ARENA.bottom + 18, 2, 195, 202, 214, 1);
    raster.drawText('BUILD V0.1', ARENA.right - 124, ARENA.bottom + 18, 2, 128, 136, 148, 1);
    return;
  }

  // Day 7: Rich neon combat visuals
  // 1. Shockwaves
  for (const sw of frame.shockwaves) {
    const [r, g, b] = sw.color;
    raster.strokeCircle(sw.x + ox, sw.y + oy, sw.r, 3.5, r, g, b, sw.alpha * 0.85, true);
    raster.strokeCircle(sw.x + ox, sw.y + oy, Math.max(2, sw.r - 5), 1.5, 255, 255, 255, sw.alpha * 0.45, true);
  }

  // 2. Player thruster ribbon trail
  for (let i = 1; i < frame.trail.length; i++) {
    const prev = frame.trail[i - 1];
    const curr = frame.trail[i];
    const u = i / frame.trail.length;
    raster.drawLine(
      prev.x + ox,
      prev.y + oy,
      curr.x + ox,
      curr.y + oy,
      2 + u * 6,
      46,
      215,
      255,
      u * 0.45,
      true,
    );
  }

  // 3. Enemy projectiles
  for (const eb of frame.enemyBullets) {
    const [r, g, b] = eb.color;
    raster.glowCircle(eb.x + ox, eb.y + oy, eb.r * 2.5, r, g, b, 0.35);
    raster.fillCircle(eb.x + ox, eb.y + oy, eb.r, r, g, b, 0.95);
    raster.fillCircle(eb.x + ox, eb.y + oy, eb.r * 0.48, 255, 240, 248, 1);
  }

  // 4. Player plasma & drone bullets
  for (const b of frame.bullets) {
    const isDrone = b.kind === 'drone';
    const col = isDrone ? [255, 212, 72] : [64, 240, 255];
    raster.glowCircle(b.x + ox, b.y + oy, b.r * 3.1, col[0], col[1], col[2], 0.4);
    raster.fillCircle(b.x + ox, b.y + oy, b.r, col[0], col[1], col[2], 1);
    raster.fillCircle(b.x + ox, b.y + oy, b.r * 0.45, 255, 255, 255, 1);
  }

  // 5. Enemies with class silhouettes, glowing cores & health pips
  for (const e of frame.enemies) {
    const ex = e.x + ox;
    const ey = e.y + oy;
    const flash = e.hitFlash > 0;
    const col =
      e.kind === 'orbiter'
        ? [196, 86, 255]
        : e.kind === 'striker'
          ? [255, 118, 56]
          : [255, 58, 134];
    raster.glowCircle(ex, ey, e.r * 2.1, col[0], col[1], col[2], 0.32);
    raster.fillCircle(ex, ey, e.r, flash ? 255 : col[0], flash ? 255 : col[1], flash ? 255 : col[2], 0.95);
    raster.strokeCircle(ex, ey, e.r + 2, 1.5, 255, 220, 240, 0.7);
    // Rotating armor ticks
    for (let k = 0; k < 3; k++) {
      const a = e.phase + (k * Math.PI * 2) / 3;
      raster.fillCircle(ex + Math.cos(a) * (e.r - 3), ey + Math.sin(a) * (e.r - 3), 2.5, 255, 255, 255, 0.9);
    }
    // Mini HP bar when damaged
    if (e.hp < e.maxHp) {
      const bw = 24;
      const ratio = Math.max(0, e.hp / e.maxHp);
      raster.fillRect(ex - bw / 2, ey - e.r - 8, bw, 3, 25, 25, 42, 0.9);
      raster.fillRect(ex - bw / 2, ey - e.r - 8, bw * ratio, 3, 255, 225, 85, 1);
    }
  }

  // 6. Boss Core (Day 7 Wave 3 climax)
  if (frame.boss && frame.boss.alive) {
    const b = frame.boss;
    const bx = b.x + ox;
    const by = b.y + oy;
    const flash = b.hitFlash > 0;
    raster.glowCircle(bx, by, b.r * 2.5, 255, 46, 158, 0.42);
    raster.strokeCircle(bx, by, b.r + 9, 2.5, 255, 92, 198, 0.75, true);
    raster.fillCircle(bx, by, b.r, flash ? 255 : 44, flash ? 255 : 18, flash ? 255 : 64, 1);
    raster.strokeCircle(bx, by, b.r, 3.5, 255, 72, 180, 1);
    raster.fillCircle(bx, by, 14, 255, 210, 75, 0.95);
    // Orbiting boss nodes
    for (let k = 0; k < 6; k++) {
      const a = b.phase * 1.6 + (k / 6) * Math.PI * 2;
      raster.fillCircle(bx + Math.cos(a) * (b.r + 4), by + Math.sin(a) * (b.r + 4), 4.5, 65, 238, 255, 1);
    }
    // Boss health bar at top of arena
    const barW = 240;
    const barX = ARENA.cx - barW / 2;
    const barY = ARENA.top + 12;
    raster.fillRect(barX - 2, barY - 2, barW + 4, 12, 14, 16, 36, 0.9);
    raster.fillRect(barX, barY, barW * Math.max(0, b.hp / b.maxHp), 8, 255, 64, 168, 1);
    raster.strokeRect(barX - 2, barY - 2, barW + 4, 12, 1.5, 255, 145, 215, 0.85);
  }

  // 7. Day 7 Player Starfighter + Shield Aura + Twin Orbital Drones
  const px = frame.player.x + ox;
  const py = frame.player.y + oy;
  const aim = frame.player.aimAngle;
  raster.glowCircle(px, py, 34, 48, 224, 255, 0.35);
  raster.strokeCircle(px, py, 21, 1.8, 72, 236, 255, 0.65, true);

  // Sculpted chevron starfighter oriented toward aim
  const noseX = px + Math.cos(aim) * 16;
  const noseY = py + Math.sin(aim) * 16;
  const leftX = px + Math.cos(aim + 2.35) * 14;
  const leftY = py + Math.sin(aim + 2.35) * 14;
  const rightX = px + Math.cos(aim - 2.35) * 14;
  const rightY = py + Math.sin(aim - 2.35) * 14;
  raster.drawLine(noseX, noseY, leftX, leftY, 3.5, 240, 252, 255, 1);
  raster.drawLine(noseX, noseY, rightX, rightY, 3.5, 240, 252, 255, 1);
  raster.drawLine(leftX, leftY, px, py, 3, 66, 232, 255, 1);
  raster.drawLine(rightX, rightY, px, py, 3, 66, 232, 255, 1);
  raster.fillCircle(px, py, 6.5, 255, 255, 255, 1);
  raster.fillCircle(px, py, 3.5, 255, 78, 190, 1);

  // Twin orbiting drones
  for (const side of [-1, 1]) {
    const da = frame.t * 3.4 + (side === 1 ? 0 : Math.PI);
    const dx = px + Math.cos(da) * 34;
    const dy = py + Math.sin(da) * 34;
    raster.glowCircle(dx, dy, 12, 255, 214, 72, 0.45);
    raster.fillCircle(dx, dy, 4.5, 255, 228, 115, 1);
  }

  // 8. Particles
  for (const p of frame.particles) {
    const [r, g, b] = p.color;
    raster.fillCircle(p.x + ox, p.y + oy, p.size, r, g, b, p.alpha, true);
  }

  // 9. Floating combo & score popups
  for (const pop of frame.popups) {
    const [r, g, b] = pop.color;
    raster.drawText(pop.text, pop.x + ox - 18, pop.y + oy, 2, r, g, b, pop.alpha);
  }

  // 10. Sleek Day 7 HUD Panel below arena
  const hudY = ARENA.bottom + 12;
  raster.fillRect(ARENA.left, hudY, ARENA.right - ARENA.left, 72, 16, 20, 46, 0.88);
  raster.strokeRect(ARENA.left, hudY, ARENA.right - ARENA.left, 72, 1.5, 76, 228, 255, 0.75);

  raster.drawText(`SCORE ${frame.hud.score}`, ARENA.left + 12, hudY + 12, 2, 240, 250, 255, 1);
  raster.drawText(
    `X${frame.hud.combo} COMBO`,
    ARENA.right - 118,
    hudY + 12,
    2,
    255,
    224,
    82,
    1,
  );

  // Shield & Overdrive gauges
  raster.drawText('SHIELD', ARENA.left + 12, hudY + 38, 1, 120, 225, 255, 1);
  raster.fillRect(ARENA.left + 62, hudY + 38, 130, 8, 28, 36, 68, 1);
  raster.fillRect(ARENA.left + 62, hudY + 38, (130 * frame.hud.shield) / 100, 8, 56, 232, 255, 1);

  raster.drawText('NOVA', ARENA.left + 218, hudY + 38, 1, 255, 125, 210, 1);
  raster.fillRect(ARENA.left + 258, hudY + 38, 155, 8, 42, 24, 58, 1);
  raster.fillRect(ARENA.left + 258, hudY + 38, (155 * frame.hud.overdrive) / 100, 8, 255, 72, 184, 1);

  raster.drawText(`WAVE ${frame.hud.wave}`, ARENA.left + 12, hudY + 54, 1, 185, 200, 240, 0.9);
  raster.drawText('BUILD V1.7  DRONES+NOVA', ARENA.right - 166, hudY + 54, 1, 135, 235, 255, 0.9);

  // Subtle overdrive screen flash
  if (frame.fx.flash > 0.01) {
    raster.fillRect(
      ARENA.left,
      ARENA.top,
      ARENA.right - ARENA.left,
      ARENA.bottom - ARENA.top,
      140,
      235,
      255,
      frame.fx.flash * 0.45,
    );
  }
}

/**
 * Synthesize 16-bit PCM mono WAV audio contrasting Day 1 (minimalist 8-bit)
 * vs Day 7 (energetic synthwave pulse + bassline + plasma + explosion SFX).
 */
function synthesizeAudioWav(mode, soundEvents, outPath) {
  const sampleRate = 48000;
  const totalSamples = Math.round(TOTAL_DURATION_S * sampleRate);
  const mix = new Float32Array(totalSamples);

  const isDay7 = mode === 'day7';

  // Background musical bed
  if (!isDay7) {
    // Day 1: sparse minimal ticking pulse (very quiet & plain)
    const notes = [220, 0, 261.63, 0, 220, 0, 196, 0];
    const stepLen = 0.5;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const stepIdx = Math.floor(t / stepLen) % notes.length;
      const localT = t % stepLen;
      const freq = notes[stepIdx];
      if (freq > 0 && localT < 0.12) {
        const env = Math.exp(-localT * 24);
        const sq = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
        mix[i] += sq * env * 0.08;
      }
    }
  } else {
    // Day 7: driving 128 BPM synthwave bass + sparkling arpeggio + kick pulse
    const bpm = 128;
    const sixteenth = 60 / bpm / 4;
    const bassSeq = [110, 110, 110, 110, 87.31, 87.31, 98.0, 98.0];
    const arpSeq = [440, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 880];
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const step = Math.floor(t / sixteenth);
      const localT = t - step * sixteenth;
      const barStep = Math.floor(step / 4) % bassSeq.length;

      // Sawtooth-ish driving bass
      const bassFreq = bassSeq[barStep];
      const bassPhase = (t * bassFreq) % 1;
      const bassEnv = Math.exp(-localT * 9.5);
      mix[i] += (2 * bassPhase - 1) * bassEnv * 0.15;

      // Sparkling high arpeggio
      const arpFreq = arpSeq[step % arpSeq.length];
      const arpEnv = Math.exp(-localT * 16);
      mix[i] += Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.09;

      // Four-on-the-floor punchy synth kick on every quarter beat
      if (step % 4 === 0 && localT < 0.11) {
        const kickFreq = 135 * Math.exp(-localT * 28) + 42;
        const kickEnv = Math.exp(-localT * 24);
        mix[i] += Math.sin(2 * Math.PI * kickFreq * localT) * kickEnv * 0.24;
      }
    }
  }

  // Layer game SFX events
  for (const ev of soundEvents) {
    const startSample = Math.floor(ev.t * sampleRate);
    let dur = 0.08;
    if (ev.type === 'd7_explode') dur = 0.14;
    if (ev.type === 'nova' || ev.type === 'boss_enter') dur = 0.34;
    if (ev.type === 'boss_explode') dur = 0.55;
    const len = Math.floor(dur * sampleRate);

    for (let j = 0; j < len; j++) {
      const idx = startSample + j;
      if (idx >= totalSamples) break;
      const lt = j / sampleRate;
      let sample = 0;

      if (ev.type === 'd1_shoot') {
        const f = 540 - lt * 1800;
        sample = (Math.sin(2 * Math.PI * Math.max(120, f) * lt) >= 0 ? 1 : -1) * Math.exp(-lt * 38) * 0.12;
      } else if (ev.type === 'd1_hit') {
        sample = (Math.sin(2 * Math.PI * 310 * lt) >= 0 ? 1 : -1) * Math.exp(-lt * 26) * 0.14;
      } else if (ev.type === 'd7_shoot') {
        const f = 920 * Math.exp(-lt * 22);
        sample = Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt * 42) * 0.09;
      } else if (ev.type === 'd7_explode') {
        const noise = Math.sin(idx * 12.9898) * 43758.5453;
        const n = (noise - Math.floor(noise)) * 2 - 1;
        sample = (n * 0.5 + Math.sin(2 * Math.PI * 95 * lt) * 0.5) * Math.exp(-lt * 22) * 0.22;
      } else if (ev.type === 'nova' || ev.type === 'boss_enter') {
        const f = ev.type === 'nova' ? 180 + lt * 640 : 140 - lt * 90;
        sample = Math.sin(2 * Math.PI * Math.max(45, f) * lt) * Math.exp(-lt * 7.5) * 0.26;
      } else if (ev.type === 'boss_explode') {
        const noise = Math.sin(idx * 78.233) * 19341.123;
        const n = (noise - Math.floor(noise)) * 2 - 1;
        sample = (n * 0.65 + Math.sin(2 * Math.PI * 62 * lt) * 0.35) * Math.exp(-lt * 5.2) * 0.34;
      }

      mix[idx] += sample;
    }
  }

  // Soft limiter + encode standard PCM WAV header
  const dataSize = totalSamples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // Mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const clamped = Math.tanh(mix[i] * 1.15);
    wav.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(outPath, wav);
}

function encodeModeVideo(mode, frames, outMp4) {
  return new Promise((resolvePromise, rejectPromise) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${CANVAS_W}x${CANVAS_H}`,
        '-r',
        String(FPS),
        '-i',
        'pipe:0',
        '-vf',
        'scale=1080:1920:flags=lanczos',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        outMp4,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    ff.on('error', rejectPromise);
    ff.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg exited with code ${code} for ${mode}`));
    });

    const raster = new Raster(CANVAS_W, CANVAS_H);
    const staticBg = buildStaticBackground(mode);
    let idx = 0;

    function pushNext() {
      while (idx < frames.length) {
        renderFrame(raster, staticBg, frames[idx]);
        idx++;
        const ok = ff.stdin.write(Buffer.from(raster.buf));
        if (!ok) {
          ff.stdin.once('drain', pushNext);
          return;
        }
      }
      ff.stdin.end();
    }

    pushNext();
  });
}

async function main() {
  mkdirSync(BUILD_DIR, { recursive: true });
  for (const mode of ['day1', 'day7']) {
    const t0 = Date.now();
    console.log(`[sim] Simulating ${mode} (${TOTAL_DURATION_S}s @ ${FPS}fps)...`);
    const { frames, soundEvents } = simulateMode(mode);
    const wavPath = join(BUILD_DIR, `audio_${mode}.wav`);
    const mp4Path = join(BUILD_DIR, `${mode}.mp4`);
    synthesizeAudioWav(mode, soundEvents, wavPath);
    await encodeModeVideo(mode, frames, mp4Path);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const lastHud = frames[frames.length - 1].hud;
    console.log(
      `[ok] Rendered ${mode}: ${mp4Path} + ${wavPath} in ${elapsed}s (final score=${lastHud.score}, wave=${lastHud.wave})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
