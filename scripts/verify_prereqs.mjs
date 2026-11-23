#!/usr/bin/env node
/**
 * Prerequisite and official press-asset verifier for:
 *   post-tiktok-day-one-day-seven-20261123-0327 ("Day one, day seven")
 *
 * Uses Node.js standard library only.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = join(ROOT_DIR, 'assets', 'press', 'card-spec.json');

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const ok = major > 22 || (major === 22 && minor >= 18);
  return {
    name: 'Node.js >= 22.18',
    ok,
    detail: `v${process.versions.node}`,
  };
}

function checkFfmpegCapabilities() {
  try {
    const versionOut = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    const firstLine = versionOut.split('\n')[0]?.trim() ?? 'ffmpeg found';
    const decoders = execFileSync('ffmpeg', ['-hide_banner', '-decoders'], { encoding: 'utf8' });
    const filters = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
    const hasVp9 = /\blibvpx-vp9\b/.test(decoders);
    const hasDrawtext = /\bdrawtext\b/.test(filters);
    const hasGblur = /\bgblur\b/.test(filters);
    const ok = hasVp9 && hasDrawtext && hasGblur;
    return {
      name: 'ffmpeg (libvpx-vp9, drawtext, gblur)',
      ok,
      detail: `${firstLine} | vp9=${hasVp9} drawtext=${hasDrawtext} gblur=${hasGblur}`,
    };
  } catch (err) {
    return {
      name: 'ffmpeg (libvpx-vp9, drawtext, gblur)',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function findJetBrainsMonoBold() {
  const candidates = [
    '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf',
    '/usr/share/fonts/truetype/jetbrains/JetBrainsMono-Bold.ttf',
    '/usr/share/fonts/opentype/jetbrains-mono/JetBrainsMono-Bold.ttf',
    '/usr/local/share/fonts/JetBrainsMono-Bold.ttf',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const out = execFileSync('fc-list', [':', 'file'], { encoding: 'utf8' });
    const match = out
      .split('\n')
      .map((line) => line.split(':')[0]?.trim())
      .find((p) => p && /JetBrainsMono-Bold\.ttf$/i.test(p));
    if (match && existsSync(match)) {
      return match;
    }
  } catch {
    // Ignore fc-list failure and fall through.
  }
  return null;
}

function verifyPressAsset(label, relativePath, expectedBytes, expectedSha256) {
  const fullPath = join(ROOT_DIR, relativePath);
  if (!existsSync(fullPath)) {
    return { name: label, ok: false, detail: `missing: ${relativePath}` };
  }
  const actualBytes = statSync(fullPath).size;
  const actualSha256 = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
  const ok = actualBytes === expectedBytes && actualSha256 === expectedSha256;
  return {
    name: label,
    ok,
    detail: ok
      ? `${actualBytes} bytes, sha256 verified`
      : `mismatch: bytes=${actualBytes}/${expectedBytes}, sha256=${actualSha256}`,
  };
}

function main() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const fontPath = findJetBrainsMonoBold();
  const checks = [
    checkNodeVersion(),
    checkFfmpegCapabilities(),
    {
      name: 'JetBrains Mono Bold font',
      ok: Boolean(fontPath),
      detail: fontPath ?? 'JetBrainsMono-Bold.ttf not found',
    },
    verifyPressAsset(
      'Official 9:16 referral end card (transparent WebM)',
      spec.referralCard.transparentWebm.file,
      spec.referralCard.transparentWebm.bytes,
      spec.referralCard.transparentWebm.sha256,
    ),
    verifyPressAsset(
      'Official 9:16 referral end card (opaque MP4)',
      spec.referralCard.opaqueMp4.file,
      spec.referralCard.opaqueMp4.bytes,
      spec.referralCard.opaqueMp4.sha256,
    ),
    verifyPressAsset(
      'Official 9:16 brand badge (transparent PNG)',
      spec.brandBadge.file,
      spec.brandBadge.bytes,
      spec.brandBadge.sha256,
    ),
  ];

  let allOk = true;
  for (const item of checks) {
    const icon = item.ok ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${item.name}: ${item.detail}`);
    if (!item.ok) allOk = false;
  }

  if (!allOk) {
    process.exit(1);
  }
}

main();
