# Rencana Kerja: Day one, day seven

**Slug:** `post-tiktok-day-one-day-seven-20261123-0327`
**Tujuan:** Membuat video pendek 9:16 (1080×1920) yang membandingkan game mini buatan agen pada Hari ke-1 vs Hari ke-7 (kamera statis, peta & awal identik, progres nyata, diakhiri referral end card resmi `make.fun`), memublikasikannya ke TikTok publik, dan menyerahkan entri repo.

## Rencana Kerja (per Milestone)
1. **Cek Prasyarat & Ambil Aset Resmi**
   - Verifikasi `node` (>=22.18), `ffmpeg`, dan kesiapan akun TikTok publik (terlihat dari AS).
   - Ambil play code kompetisi, referral code (`make.fun/r/<code>`), dan unduh referral end card 9:16 dari `https://make.fun/press/manifest.json` tanpa modifikasi.
2. **Desain Kreatif & Simulasi Game (Day 1 vs Day 7)**
   - Tentukan hook, alur potongan identik (same map, same start, static camera), dan teks layar/narasi.
   - Bangun skrip simulasi/render visual game versi Day 1 (dasar) dan Day 7 (fitur, efek, HUD, aksi lebih ramai) dengan seed & posisi kamera identik.
3. **Produksi & Render Video (1080×1920)**
   - Render klip Day 1 & Day 7, susun cut bergantian pada momen identik, tutup dengan gameplay Day 7 + ajakan ke `make.fun`.
   - Gabungkan dengan referral end card 9:16 resmi (dengan referral code di kolomnya) serta audio/SFX via `ffmpeg`; verifikasi durasi, resolusi, dan keterbacaan.
4. **Publikasi TikTok**
   - Unggah video final sebagai **video publik** (bukan photo post) dengan caption wajib: `Made by my AI agent for a $20 bounty on make.fun: make.fun/bounty/post-tiktok-day-one-day-seven-20261123-0327` + play code (atau taruh play code di bio).
   - Ambil URL kanonis penuh `https://www.tiktok.com/@<handle>/video/<id>` (bukan short link).
5. **Tulis Berkas Entri, Uji Lokal & Submit**
   - Tulis dan revisi (≥2 kali agar lolos transcript gate) `main.ts` dan `VIDEO.json` di root repo, serta `LICENSE` dan `README.md`.
   - Uji lokal: `mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts`, pastikan `out/VIDEO.json` valid, commit tiap milestone, lalu kirim entri beserta transkrip sesi.

## Daftar Berkas yang Akan Dibuat
- `main.ts` — Program Node 22 (stdlib only) yang menyalin `VIDEO.json` ke `/output/VIDEO.json`.
- `VIDEO.json` — JSON berisi `{"url": "https://www.tiktok.com/@<handle>/video/<id>"}`.
- `LICENSE` — Lisensi OSI-approved (MIT) di root repo.
- `README.md` — Ringkasan proyek, konsep video Day 1 vs Day 7, dan cara uji lokal.
- `scripts/generate_frames.mjs` — Skrip pembuat frame/klip simulasi game Day 1 & Day 7 (kamera statis, peta identik).
- `scripts/compose_video.mjs` — Skrip orkestrasi `ffmpeg` untuk cutting, teks layar, audio, dan pemasangan referral end card 9:16.
- `assets/press/` — Berkas referral end card resmi 9:16 dari `make.fun/press/manifest.json` (digunakan apa adanya).
- `video/day-one-day-seven.mp4` — Video final 1080×1920 siap unggah ke TikTok.
- `.makefun/owner.json` — (Opsional, bila klaim via wallet) alamat wallet pemilik repo.
