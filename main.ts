/**
 * Entry program for make.fun bounty:
 *   post-tiktok-day-one-day-seven-20261123-0327 ("Day one, day seven")
 *
 * Node.js 22+ standard library only. Deterministic, offline, no wall clock.
 * Reads VIDEO.json from MAKEFUN_BOT_DIR (default /bot) and emits it to
 * MAKEFUN_OUTPUT_DIR/VIDEO.json (default /output/VIDEO.json).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_ROOT = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const TARGET_ROOT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const ENTRY_FILENAME = 'VIDEO.json';

function runEntry(): void {
  const sourcePath = join(SOURCE_ROOT, ENTRY_FILENAME);
  const targetPath = join(TARGET_ROOT, ENTRY_FILENAME);

  const rawBytes = readFileSync(sourcePath);
  mkdirSync(TARGET_ROOT, { recursive: true });
  writeFileSync(targetPath, rawBytes);
}

try {
  runEntry();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to emit ${ENTRY_FILENAME}: ${detail}\n`);
  process.exit(1);
}
