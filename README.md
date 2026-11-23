# Day One, Day Seven — ORBIT BREAKER

Entry repository for the `make.fun` TikTok bounty **`post-tiktok-day-one-day-seven-20261123-0327`**.

## Video Concept

**ORBIT BREAKER** is a tiny vertical top-down arcade shooter simulated and rendered in two builds on the **exact same map**, **exact same starting spawn**, and a **100% static camera**:

- **Day 1 (`BUILD V0.1`)**: Flat charcoal grid, plain white square player, basic red enemy squares, slow single-shot pellet, minimal score counter, and sparse 8-bit square beeps.
- **Day 7 (`BUILD V1.7`)**: Neon cosmic arena, glowing energy pillars, sculpted chevron starfighter with shield aura & thruster ribbon, twin orbital homing drones, triple plasma blasters, periodic overdrive shockwave novas, multi-class enemies + Wave 3 Boss Core, floating combo score popups, Shield/Nova HUD, and driving synthwave + SFX audio.
- **Official `make.fun` Branding**: Unmodified 9:16 brand badge (`makefun-badge-9x16.png`) inside TikTok's safe zone (`0.0s–15.0s`), followed by the unmodified 9:16 transparent referral end card (`makefun-card-9x16-transparent.webm`) over blurred & desaturated Day 7 gameplay (`15.0s–17.5s`) with the referral code rendered in JetBrains Mono Bold (`#191419`) at `rest_s = 1.433s`.

## Repository Layout

- `main.ts` — Node 22+ (stdlib-only) entry program that validates and writes `VIDEO.json` to `/output/VIDEO.json`.
- `VIDEO.json` — Holds the canonical public TikTok video URL (`https://www.tiktok.com/@<handle>/video/<id>`).
- `CAPTION.txt` — Ready-to-paste TikTok caption containing the mandatory `$20 bounty` & `make.fun` line plus play code slot.
- `docs/creative-brief.md` — Creative concept, cut sheet, and TikTok safe-zone notes.
- `assets/press/` — Official unmodified 9:16 assets downloaded from `https://make.fun/press/manifest.json` + verified SHA-256 spec (`card-spec.json`).
- `scripts/verify_prereqs.mjs` — Verifies Node >= 22.18, `ffmpeg` capabilities, JetBrains Mono Bold, and exact SHA-256 of press assets.
- `scripts/game_sim.mjs` — Deterministic Day 1 & Day 7 game simulation (identical map, start, and player path).
- `scripts/generate_frames.mjs` — Pure Node.js software renderer + procedural WAV audio synthesizer producing `build/day1.mp4` and `build/day7.mp4`.
- `scripts/compose_video.mjs` — Cuts identical timestamps between Day 1 & Day 7, adds safe-zone text, mixes audio, applies brand badge & official referral end card, and writes `video/day-one-day-seven.mp4`.
- `video/day-one-day-seven.mp4` — Final 1080×1920 60fps H.264/AAC vertical video ready to upload to TikTok.

## Re-render With Your Personal Referral Code

Before uploading to TikTok, stamp your own 8-character `make.fun` referral code (from `GET /api/me/referrals` or `https://make.fun/profile?tab=referrals`):

```bash
node scripts/verify_prereqs.mjs
node scripts/generate_frames.mjs
MAKEFUN_REFERRAL_CODE=<your8ch> node scripts/compose_video.mjs
```

## Publish on TikTok & Finalize `VIDEO.json`

1. Upload `video/day-one-day-seven.mp4` as a **public video** (not a photo post, visible to Everyone including US visitors) from a **public TikTok account**, without editing or trimming in TikTok's editor.
2. Paste the caption from `CAPTION.txt`, replacing `<word1>-<word2>-<word3>` with one of your bounty play codes (`GET /api/competitions/post-tiktok-day-one-day-seven-20261123-0327/play-code`) and `<your-8-char-code>` with your referral code.
3. Open the published video in a browser to get its canonical URL (`https://www.tiktok.com/@<handle>/video/<id>`, digits-only ID, never a `vm.tiktok.com` / `vt.tiktok.com` short link) and write it into `VIDEO.json`.

## Local Grader Verification

```bash
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
cmp -s VIDEO.json out/VIDEO.json && echo "OK"
```

## License

MIT — see [LICENSE](LICENSE).
