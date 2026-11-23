#!/usr/bin/env node
/**
 * End-to-end verification suite for the "Day one, day seven" bounty repo.
 * Checks prerequisites, press-pack integrity, deterministic game simulation,
 * rendered video specs, caption requirements, license, and main.ts double-run
 * byte-for-byte determinism.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOTAL_FRAMES, simulateMode } from './game_sim.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runCheck(name, fn) {
  try {
    const detail = fn();
    console.log(`[PASS] ${name}: ${detail}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FAIL] ${name}: ${msg}`);
    return false;
  }
}

function main() {
  const results = [];

  results.push(
    runCheck('Prerequisites & press assets SHA-256', () => {
      execFileSync(process.execPath, [join(ROOT_DIR, 'scripts', 'verify_prereqs.mjs')], {
        stdio: 'pipe',
      });
      return 'Node, ffmpeg, JetBrains Mono Bold, and all press assets verified';
    }),
  );

  results.push(
    runCheck('Deterministic Day 1 vs Day 7 static-camera path', () => {
      const d1 = simulateMode('day1');
      const d7 = simulateMode('day7');
      if (d1.frames.length !== TOTAL_FRAMES || d7.frames.length !== TOTAL_FRAMES) {
        throw new Error(`Expected ${TOTAL_FRAMES} frames`);
      }
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        if (
          d1.frames[i].player.x !== d7.frames[i].player.x ||
          d1.frames[i].player.y !== d7.frames[i].player.y
        ) {
          throw new Error(`Player path diverged at frame ${i}`);
        }
      }
      const s1 = d1.frames[TOTAL_FRAMES - 1].hud.score;
      const s7 = d7.frames[TOTAL_FRAMES - 1].hud.score;
      if (s7 <= s1 * 10) {
        throw new Error(`Expected Day 7 progression > 10x Day 1 (got ${s1} vs ${s7})`);
      }
      return `${TOTAL_FRAMES} identical-path frames | score Day 1=${s1} vs Day 7=${s7}`;
    }),
  );

  results.push(
    runCheck('Rendered 9:16 video metadata (ffprobe)', () => {
      const videoPath = join(ROOT_DIR, 'video', 'day-one-day-seven.mp4');
      if (!existsSync(videoPath)) throw new Error('video/day-one-day-seven.mp4 missing');
      const raw = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate',
          '-of',
          'json',
          videoPath,
        ],
        { encoding: 'utf8' },
      );
      const info = JSON.parse(raw);
      const v = info.streams.find((s) => s.codec_type === 'video');
      const a = info.streams.find((s) => s.codec_type === 'audio');
      if (!v || !a) throw new Error('Missing video or audio stream');
      if (v.codec_name !== 'h264' || v.width !== 1080 || v.height !== 1920 || v.pix_fmt !== 'yuv420p') {
        throw new Error(`Unexpected video stream: ${JSON.stringify(v)}`);
      }
      if (a.codec_name !== 'aac') {
        throw new Error(`Unexpected audio codec: ${a.codec_name}`);
      }
      const dur = Number(info.format.duration);
      if (Math.abs(dur - 17.5) > 0.15) {
        throw new Error(`Unexpected duration: ${dur}s`);
      }
      const mb = (statSync(videoPath).size / (1024 * 1024)).toFixed(2);
      return `${v.width}x${v.height} ${v.codec_name}/${a.codec_name} ${v.r_frame_rate}fps ${dur.toFixed(2)}s (${mb} MB)`;
    }),
  );

  results.push(
    runCheck('main.ts grader double-run determinism', () => {
      const tmpRoot = mkdtempSync(join(tmpdir(), 'makefun-day17-'));
      try {
        const out1 = join(tmpRoot, 'out1');
        const out2 = join(tmpRoot, 'out2');
        const stdout1 = execFileSync(process.execPath, [join(ROOT_DIR, 'main.ts')], {
          env: { ...process.env, MAKEFUN_BOT_DIR: ROOT_DIR, MAKEFUN_OUTPUT_DIR: out1 },
          encoding: 'utf8',
        });
        const stdout2 = execFileSync(process.execPath, [join(ROOT_DIR, 'main.ts')], {
          env: { ...process.env, MAKEFUN_BOT_DIR: ROOT_DIR, MAKEFUN_OUTPUT_DIR: out2 },
          encoding: 'utf8',
        });
        if (stdout1.length !== 0 || stdout2.length !== 0) {
          throw new Error('Expected empty stdout on success');
        }
        const src = readFileSync(join(ROOT_DIR, 'VIDEO.json'));
        const b1 = readFileSync(join(out1, 'VIDEO.json'));
        const b2 = readFileSync(join(out2, 'VIDEO.json'));
        if (!src.equals(b1) || !b1.equals(b2)) {
          throw new Error('Output VIDEO.json does not match byte-for-byte across runs');
        }
        if (b1.byteLength > 16384) {
          throw new Error(`VIDEO.json exceeds 16384 bytes (${b1.byteLength})`);
        }
        return `${b1.byteLength} bytes, byte-identical across 2 runs, silent stdout`;
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    }),
  );

  results.push(
    runCheck('CAPTION.txt required bounty text', () => {
      const caption = readFileSync(join(ROOT_DIR, 'CAPTION.txt'), 'utf8');
      if (!/\$20 bounty\b/i.test(caption)) {
        throw new Error('Missing "$20 bounty" as whole word');
      }
      if (!caption.includes('make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327')) {
        throw new Error('Missing official bounty URL on make.fun');
      }
      return 'Contains "$20 bounty" and official make.fun bounty URL';
    }),
  );

  results.push(
    runCheck('OSI-approved LICENSE present', () => {
      const lic = readFileSync(join(ROOT_DIR, 'LICENSE'), 'utf8');
      if (!lic.includes('MIT License')) {
        throw new Error('LICENSE does not appear to be MIT License');
      }
      return 'MIT License verified at repo root';
    }),
  );

  if (!results.every(Boolean)) {
    process.exit(1);
  }
}

main();
