#!/usr/bin/env node
/**
 * Video composition pipeline for "Day one, day seven" (ORBIT BREAKER).
 *
 * Cuts deterministically between identical timestamps of build/day1.mp4 and
 * build/day7.mp4 (same map, same start, locked static camera), mixes matching
 * Day 1 / Day 7 procedural audio, adds TikTok-safe-zone typography, overlays
 * the official unmodified make.fun 9:16 brand badge and 9:16 transparent
 * referral end card (with referral code typed into the field at rest_s=1.433s),
 * and outputs video/day-one-day-seven.mp4 (1080x1920, 60fps, H.264, AAC).
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT_DIR, 'build');
const VIDEO_DIR = join(ROOT_DIR, 'video');
const SPEC_PATH = join(ROOT_DIR, 'assets', 'press', 'card-spec.json');

// Cut sheet: every cut jumps at the exact same simulation timestamp t so
// map geometry, player position, and static camera match frame-for-frame.
const SEGMENTS = [
  { mode: 'day1', start: 0.0, end: 2.4 },
  { mode: 'day7', start: 2.4, end: 5.2 },
  { mode: 'day1', start: 5.2, end: 6.8 },
  { mode: 'day7', start: 6.8, end: 9.0 },
  { mode: 'day1', start: 9.0, end: 10.4 },
  { mode: 'day7', start: 10.4, end: 17.5 },
];

const TOTAL_DURATION = 17.5;
const CARD_LEN = 2.5;
const CARD_START = Number((TOTAL_DURATION - CARD_LEN).toFixed(3)); // 15.0s

function resolveReferralCode() {
  const argIdx = process.argv.indexOf('--code');
  const cliCode = argIdx >= 0 ? process.argv[argIdx + 1] : undefined;
  const raw = (cliCode ?? process.env.MAKEFUN_REFERRAL_CODE ?? '').trim().toLowerCase();
  if (!raw) {
    console.warn(
      '[warn] MAKEFUN_REFERRAL_CODE not set; rendering preview with placeholder "make2026".\n' +
        '       Re-run with MAKEFUN_REFERRAL_CODE=<your-8-char-code> node scripts/compose_video.mjs before posting!',
    );
    return { code: 'make2026', isPlaceholder: true };
  }
  if (!/^[0-9a-hjkmnp-tv-z]{8}$/.test(raw)) {
    throw new Error(
      `Invalid referral code "${raw}". Expected 8 chars of 0-9 and a-z excluding i, l, o, u.`,
    );
  }
  return { code: raw, isPlaceholder: false };
}

function findFont(candidates) {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Required font not found. Checked: ${candidates.join(', ')}`);
}

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\'");
}

function buildFilterGraph({ spec, fontBold, fontExtraBold, referralCode }) {
  const parts = [];
  const vInputs = [];
  const aInputs = [];

  // Inputs:
  // 0: build/day1.mp4
  // 1: build/day7.mp4
  // 2: build/audio_day1.wav
  // 3: build/audio_day7.wav
  // 4: assets/press/makefun-badge-9x16.png
  // 5: assets/press/makefun-card-9x16-transparent.webm (decoded with libvpx-vp9)

  SEGMENTS.forEach((seg, idx) => {
    const vin = seg.mode === 'day1' ? '0:v' : '1:v';
    const ain = seg.mode === 'day1' ? '2:a' : '3:a';
    const dur = Number((seg.end - seg.start).toFixed(3));
    const vLabel = `vseg${idx}`;
    const aLabel = `aseg${idx}`;

    parts.push(
      `[${vin}]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,fps=60,setsar=1[${vLabel}]`,
    );
    // Tiny 12ms audio fade in/out per cut prevents click artifacts on hard switches
    const fadeOutSt = Math.max(0, Number((dur - 0.012).toFixed(3)));
    parts.push(
      `[${ain}]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=0.012,afade=t=out:st=${fadeOutSt}:d=0.012[${aLabel}]`,
    );
    vInputs.push(`[${vLabel}]`);
    aInputs.push(`[${aLabel}]`);
  });

  parts.push(`${vInputs.join('')}concat=n=${SEGMENTS.length}:v=1:a=0[vconcat]`);
  parts.push(
    `${aInputs.join('')}concat=n=${SEGMENTS.length}:v=0:a=1,` +
      `afade=t=out:st=17.05:d=0.45[aout]`,
  );

  // Build Day 1 / Day 7 status pill expressions (top-right inside TikTok safe zone)
  const day1Enable = SEGMENTS.filter((s) => s.mode === 'day1')
    .map((s) => `between(t,${s.start},${s.end - 0.005})`)
    .join('+');
  const day7Enable = SEGMENTS.filter((s) => s.mode === 'day7')
    .map((s) => `between(t,${s.start},${Math.min(s.end, CARD_START) - 0.005})`)
    .join('+');

  const overlays = [
    // DAY 1 badge pill (top right, clear of make.fun badge at x=120..450, y=272..400)
    `drawbox=x=690:y=292:w=266:h=86:color=0x1e222b@0.92:t=fill:enable='${day1Enable}'`,
    `drawbox=x=690:y=292:w=266:h=86:color=0xb8c0cc@0.95:t=4:enable='${day1Enable}'`,
    `drawtext=fontfile='${fontExtraBold}':text='DAY 1':fontsize=46:fontcolor=0xf0f4f8:x=746:y=314:enable='${day1Enable}'`,

    // DAY 7 badge pill (bright make.fun magenta + cyan border)
    `drawbox=x=690:y=292:w=266:h=86:color=0xe6187b@0.94:t=fill:enable='${day7Enable}'`,
    `drawbox=x=690:y=292:w=266:h=86:color=0x58eeff@0.98:t=4:enable='${day7Enable}'`,
    `drawtext=fontfile='${fontExtraBold}':text='DAY 7':fontsize=46:fontcolor=0xffffff:x=746:y=314:enable='${day7Enable}'`,

    // Segment 1 hook caption (0.10s - 2.35s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('MY AI AGENT BUILT A GAME')}':fontsize=50:fontcolor=0xffffff:borderw=4:bordercolor=0x0d1018:x=(w-text_w)/2:y=466:enable='between(t,0.10,2.35)'`,
    `drawtext=fontfile='${fontBold}':text='${escapeDrawtext('DAY 1  ·  STATIC CAMERA')}':fontsize=34:fontcolor=0xc8d2e0:borderw=3:bordercolor=0x0d1018:x=(w-text_w)/2:y=534:enable='between(t,0.10,2.35)'`,

    // Segment 2 shock-cut caption (2.45s - 5.10s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('SAME MAP. SAME START.')}':fontsize=52:fontcolor=0x58eeff:borderw=5:bordercolor=0x120b24:x=(w-text_w)/2:y=466:enable='between(t,2.45,5.10)'`,
    `drawtext=fontfile='${fontBold}':text='${escapeDrawtext('7 DAYS OF AI UPDATES')}':fontsize=36:fontcolor=0xffe052:borderw=3:bordercolor=0x120b24:x=(w-text_w)/2:y=536:enable='between(t,2.45,5.10)'`,

    // Segment 3 back to Day 1 (5.25s - 6.75s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('DAY 1: 1 SHOT, 4 BLOCKS')}':fontsize=44:fontcolor=0xe4eaf2:borderw=4:bordercolor=0x0d1018:x=(w-text_w)/2:y=470:enable='between(t,5.25,6.75)'`,

    // Segment 4 back to Day 7 (6.85s - 8.95s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('DAY 7: DRONES + NOVA')}':fontsize=48:fontcolor=0xff5ec4:borderw=5:bordercolor=0x120b24:x=(w-text_w)/2:y=468:enable='between(t,6.85,8.95)'`,

    // Segment 5 quick Day 1 reminder (9.05s - 10.35s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('STILL DAY 1...')}':fontsize=48:fontcolor=0xdce4ee:borderw=4:bordercolor=0x0d1018:x=(w-text_w)/2:y=470:enable='between(t,9.05,10.35)'`,

    // Segment 6 Day 7 climax + make.fun invitation (10.45s - 14.95s)
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('DAY 7: BOSS + COMBOS')}':fontsize=48:fontcolor=0xffe052:borderw=5:bordercolor=0x120b24:x=(w-text_w)/2:y=468:enable='between(t,10.45,12.65)'`,
    `drawbox=x=124:y=986:w=832:h=168:color=0x0e0a1f@0.78:t=fill:enable='between(t,12.75,14.95)'`,
    `drawbox=x=124:y=986:w=832:h=168:color=0xff40a8@0.95:t=4:enable='between(t,12.75,14.95)'`,
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('1 WEEK. SAME CAMERA.')}':fontsize=46:fontcolor=0xffffff:x=(w-text_w)/2:y=1010:enable='between(t,12.75,14.95)'`,
    `drawtext=fontfile='${fontExtraBold}':text='${escapeDrawtext('START YOURS AT MAKE.FUN')}':fontsize=46:fontcolor=0x58eeff:x=(w-text_w)/2:y=1078:enable='between(t,12.75,14.95)'`,
  ];

  // Apply text overlays onto concatenated gameplay video
  parts.push(`[vconcat]${overlays.join(',')}[vtext]`);

  // Overlay official unmodified make.fun 9:16 brand badge from 0s until end card starts
  parts.push(
    `[vtext][4:v]overlay=0:0:enable='lt(t,${CARD_START})',format=yuva420p,split[clip][soft]`,
  );

  // Official make.fun end card blur + desaturation ease-in over 0.8s starting at CARD_START
  parts.push(
    `[soft]gblur=sigma=28,eq=saturation=0.35,fade=t=in:st=${CARD_START}:d=0.8:alpha=1[softblur]`,
  );
  parts.push(`[clip][softblur]overlay[bg]`);

  // Official unmodified 9:16 transparent WebM end card overlaid at CARD_START
  parts.push(`[5:v]format=yuva420p,setpts=PTS-STARTPTS+${CARD_START}/TB[card]`);

  const { cover, code, transparentWebm } = spec.referralCard;
  const codeStart = Number((CARD_START + transparentWebm.restSeconds).toFixed(3)); // 16.433s
  if (!Number.isFinite(codeStart)) {
    throw new Error(`Invalid end-card code start timestamp: ${codeStart}`);
  }

  parts.push(
    `[bg][card]overlay=eof_action=pass,` +
      `drawbox=x=${cover.x}:y=${cover.y}:w=${cover.width}:h=${cover.height}:color=white:t=fill:enable='gte(t,${codeStart})',` +
      `drawtext=fontfile='${fontBold}':text='${escapeDrawtext(referralCode)}':fontsize=${code.fontSizePx}:fontcolor=0x191419:x=${code.x}:y=${code.centreY}-(ascent-descent)/2:enable='gte(t,${codeStart})'[vout]`,
  );

  return parts.join(';\n');
}

function main() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const { code: referralCode } = resolveReferralCode();

  const day1Mp4 = join(BUILD_DIR, 'day1.mp4');
  const day7Mp4 = join(BUILD_DIR, 'day7.mp4');
  const day1Wav = join(BUILD_DIR, 'audio_day1.wav');
  const day7Wav = join(BUILD_DIR, 'audio_day7.wav');
  const badgePng = join(ROOT_DIR, spec.brandBadge.file);
  const cardWebm = join(ROOT_DIR, spec.referralCard.transparentWebm.file);

  for (const required of [day1Mp4, day7Mp4, day1Wav, day7Wav, badgePng, cardWebm]) {
    if (!existsSync(required)) {
      throw new Error(`Missing required input: ${required}. Run scripts/generate_frames.mjs first.`);
    }
  }

  const fontBold = findFont([
    '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
  ]);
  const fontExtraBold = findFont([
    '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-ExtraBold.ttf',
    fontBold,
  ]);

  mkdirSync(VIDEO_DIR, { recursive: true });
  const outMp4 = join(VIDEO_DIR, 'day-one-day-seven.mp4');
  const filterComplex = buildFilterGraph({
    spec,
    fontBold,
    fontExtraBold,
    referralCode,
  });

  console.log(`[compose] Rendering final 9:16 TikTok video -> ${outMp4}`);
  console.log(`[compose] Referral code rendered in end card: ${referralCode}`);

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'warning',
      '-i',
      day1Mp4,
      '-i',
      day7Mp4,
      '-i',
      day1Wav,
      '-i',
      day7Wav,
      '-i',
      badgePng,
      '-c:v',
      'libvpx-vp9',
      '-i',
      cardWebm,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '60',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-movflags',
      '+faststart',
      outMp4,
    ],
    { stdio: 'inherit' },
  );

  const sizeMb = (statSync(outMp4).size / (1024 * 1024)).toFixed(2);
  console.log(`[ok] Final video ready: ${outMp4} (${sizeMb} MB)`);
}

main();
