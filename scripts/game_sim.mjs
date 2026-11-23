/**
 * Deterministic game simulation for "ORBIT BREAKER" — Day 1 vs Day 7.
 *
 * Both Day 1 and Day 7 run on the exact same logical arena (540x960 internal
 * canvas, scaled 2x cleanly to 1080x1920), identical 4 tactical pillars,
 * identical starting spawn, and identical scripted player movement path.
 * The camera is 100% static so the 7-day evolution is the entire visual story.
 */

export const CANVAS_W = 540;
export const CANVAS_H = 960;
export const FPS = 60;
export const TOTAL_DURATION_S = 17.5;
export const TOTAL_FRAMES = Math.round(TOTAL_DURATION_S * FPS);

// Shared arena bounds (fits cleanly inside vertical 9:16 framing)
export const ARENA = {
  left: 55,
  right: 485,
  top: 215,
  bottom: 765,
  cx: 270,
  cy: 490,
};

// Exact same 4 symmetric map pillars on Day 1 and Day 7
export const PILLARS = [
  { x: 162, y: 355, r: 22 },
  { x: 378, y: 355, r: 22 },
  { x: 162, y: 625, r: 22 },
  { x: 378, y: 625, r: 22 },
];

// Deterministic PRNG (Mulberry32)
export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shared deterministic player position & facing vector at time t (seconds).
 * Both Day 1 and Day 7 start at exact (270, 630) and follow the identical path.
 */
export function getPlayerPose(t) {
  const startX = 270;
  const startY = 630;
  // Smooth figure-8 + tactical weave around the 4 pillars, starting still for 0.35s
  const moveT = Math.max(0, t - 0.35);
  const ramp = Math.min(1, moveT / 0.8);
  const smooth = ramp * ramp * (3 - 2 * ramp);

  const rawX =
    startX +
    smooth * (118 * Math.sin(moveT * 1.15) + 34 * Math.sin(moveT * 2.75));
  const rawY =
    startY -
    smooth * 135 +
    smooth * (105 * Math.cos(moveT * 0.95) - 28 * Math.sin(moveT * 2.1));

  // Keep comfortably clear of pillars and arena walls
  let x = Math.max(ARENA.left + 26, Math.min(ARENA.right - 26, rawX));
  let y = Math.max(ARENA.top + 30, Math.min(ARENA.bottom - 30, rawY));

  for (const p of PILLARS) {
    const dx = x - p.x;
    const dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    const minDist = p.r + 20;
    if (dist < minDist && dist > 0.001) {
      x = p.x + (dx / dist) * minDist;
      y = p.y + (dy / dist) * minDist;
    }
  }

  return { x, y };
}

/**
 * Simulate all frames for either 'day1' or 'day7' deterministically.
 * Returns { frames, soundEvents } where soundEvents drive procedural WAV audio.
 */
export function simulateMode(mode) {
  const isDay7 = mode === 'day7';
  const rng = createRng(20261123);
  const dt = 1 / FPS;

  const enemies = [];
  const bullets = [];
  const enemyBullets = [];
  const particles = [];
  const shockwaves = [];
  const popups = [];
  const trail = [];
  const soundEvents = [];

  let score = 0;
  let combo = 1;
  let comboTimer = 0;
  let shield = 100;
  let overdrive = 25;
  let wave = 1;
  let boss = null;
  let fireCooldown = 0.25;
  let spawnCooldown = 0.3;
  let novaCooldown = 2.6;
  let flashIntensity = 0;
  let shakeMag = 0;

  // Seed initial wave at identical opening coordinates so frame 0 aligns visually
  const initialSpawns = [
    { x: 140, y: 265, kind: 'drifter' },
    { x: 270, y: 250, kind: 'drifter' },
    { x: 400, y: 265, kind: 'drifter' },
  ];
  for (const sp of initialSpawns) {
    enemies.push({
      id: enemies.length + 1,
      x: sp.x,
      y: sp.y,
      vx: 0,
      vy: 38,
      hp: isDay7 ? 2 : 1,
      maxHp: isDay7 ? 2 : 1,
      r: 13,
      kind: sp.kind,
      hitFlash: 0,
      phase: rng() * Math.PI * 2,
      shootTimer: 1.2 + rng() * 0.8,
    });
  }

  let nextEnemyId = 10;
  let prevPose = getPlayerPose(0);
  const frames = [];

  for (let frameIdx = 0; frameIdx < TOTAL_FRAMES; frameIdx++) {
    const t = frameIdx / FPS;
    const pose = getPlayerPose(t);
    const pvx = (pose.x - prevPose.x) * FPS;
    const pvy = (pose.y - prevPose.y) * FPS;
    const facingAngle =
      Math.hypot(pvx, pvy) > 15 ? Math.atan2(pvy, pvx) : -Math.PI / 2;
    prevPose = pose;

    // Trail history for Day 7 thruster ribbon
    trail.push({ x: pose.x, y: pose.y, life: 1.0 });
    if (trail.length > 22) trail.shift();
    for (const tr of trail) tr.life = Math.max(0, tr.life - dt * 2.8);

    // Wave progression
    wave = t < 4.5 ? 1 : t < 9.5 ? 2 : 3;

    // Spawn enemies
    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      const targetCount = isDay7 ? (wave === 1 ? 8 : wave === 2 ? 12 : 14) : 4;
      if (enemies.length < targetCount) {
        const edge = Math.floor(rng() * 3);
        let sx = ARENA.left + 30 + rng() * (ARENA.right - ARENA.left - 60);
        let sy = ARENA.top + 22;
        if (edge === 1 && isDay7) {
          sx = ARENA.left + 20;
          sy = ARENA.top + 40 + rng() * 240;
        } else if (edge === 2 && isDay7) {
          sx = ARENA.right - 20;
          sy = ARENA.top + 40 + rng() * 240;
        }
        const kindRoll = rng();
        const kind = !isDay7
          ? 'drifter'
          : kindRoll < 0.45
            ? 'chaser'
            : kindRoll < 0.78
              ? 'striker'
              : 'orbiter';
        enemies.push({
          id: nextEnemyId++,
          x: sx,
          y: sy,
          vx: 0,
          vy: 42,
          hp: !isDay7 ? 1 : kind === 'orbiter' ? 4 : kind === 'striker' ? 3 : 2,
          maxHp: !isDay7 ? 1 : kind === 'orbiter' ? 4 : kind === 'striker' ? 3 : 2,
          r: kind === 'orbiter' ? 16 : kind === 'striker' ? 14 : 12,
          kind,
          hitFlash: 0,
          phase: rng() * Math.PI * 2,
          shootTimer: 0.9 + rng() * 1.1,
        });
      }
      spawnCooldown = isDay7 ? 0.36 : 1.35;
    }

    // Spawn Day 7 Boss Core at t >= 10.2s for big climax
    if (isDay7 && !boss && t >= 10.2) {
      boss = {
        x: ARENA.cx,
        y: ARENA.top + 78,
        hp: 46,
        maxHp: 46,
        r: 34,
        phase: 0,
        shootTimer: 0.55,
        hitFlash: 0,
        alive: true,
      };
      shockwaves.push({ x: boss.x, y: boss.y, r: 10, maxR: 150, life: 1, color: [255, 65, 165] });
      soundEvents.push({ t, type: 'boss_enter' });
    }

    // Find nearest target for aiming
    let targetX = ARENA.cx;
    let targetY = ARENA.top + 60;
    let bestD = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - pose.x, e.y - pose.y);
      if (d < bestD) {
        bestD = d;
        targetX = e.x;
        targetY = e.y;
      }
    }
    if (boss && boss.alive) {
      const bd = Math.hypot(boss.x - pose.x, boss.y - pose.y);
      if (bd < bestD * 1.35) {
        targetX = boss.x;
        targetY = boss.y;
      }
    }
    const aimAngle = Math.atan2(targetY - pose.y, targetX - pose.x);

    // Player firing
    fireCooldown -= dt;
    if (fireCooldown <= 0 && t >= 0.45) {
      if (!isDay7) {
        // Day 1: single slow white square pellet upward
        bullets.push({
          x: pose.x,
          y: pose.y - 14,
          vx: Math.cos(-Math.PI / 2) * 320,
          vy: Math.sin(-Math.PI / 2) * 320,
          r: 3.5,
          life: 1.8,
          kind: 'basic',
        });
        soundEvents.push({ t, type: 'd1_shoot' });
        fireCooldown = 0.55;
      } else {
        // Day 7: triple plasma spread + twin orbital drone homing bolts
        const spread = [-0.14, 0, 0.14];
        for (const off of spread) {
          const a = aimAngle + off;
          bullets.push({
            x: pose.x + Math.cos(a) * 14,
            y: pose.y + Math.sin(a) * 14,
            vx: Math.cos(a) * 560,
            vy: Math.sin(a) * 560,
            r: 4.5,
            life: 1.4,
            kind: 'plasma',
          });
        }
        // Orbital drones fire periodically
        if (frameIdx % 18 === 0) {
          for (const side of [-1, 1]) {
            const droneAngle = t * 3.4 + (side === 1 ? 0 : Math.PI);
            const dx = pose.x + Math.cos(droneAngle) * 34;
            const dy = pose.y + Math.sin(droneAngle) * 34;
            const da = Math.atan2(targetY - dy, targetX - dx);
            bullets.push({
              x: dx,
              y: dy,
              vx: Math.cos(da) * 490,
              vy: Math.sin(da) * 490,
              r: 3.5,
              life: 1.4,
              kind: 'drone',
            });
          }
        }
        soundEvents.push({ t, type: 'd7_shoot' });
        fireCooldown = 0.14;
      }
    }

    // Day 7 periodic Overdrive Shockwave Nova (spectacular bursts at key cut moments!)
    if (isDay7) {
      novaCooldown -= dt;
      if (novaCooldown <= 0 && (t >= 3.2)) {
        shockwaves.push({
          x: pose.x,
          y: pose.y,
          r: 12,
          maxR: 195,
          life: 1.0,
          color: [56, 232, 255],
        });
        overdrive = Math.min(100, overdrive + 18);
        shakeMag = Math.max(shakeMag, 4.5);
        flashIntensity = Math.max(flashIntensity, 0.22);
        soundEvents.push({ t, type: 'nova' });
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const spd = 110 + rng() * 140;
          particles.push({
            x: pose.x,
            y: pose.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            life: 0.55 + rng() * 0.25,
            maxLife: 0.8,
            size: 2.5 + rng() * 2.5,
            color: k % 2 === 0 ? [56, 232, 255] : [255, 84, 194],
          });
        }
        // Damage nearby enemies
        for (const e of enemies) {
          if (Math.hypot(e.x - pose.x, e.y - pose.y) < 175) {
            e.hp -= 2;
            e.hitFlash = 0.2;
          }
        }
        novaCooldown = 3.85;
      }
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let remove =
        b.life <= 0 ||
        b.x < ARENA.left ||
        b.x > ARENA.right ||
        b.y < ARENA.top ||
        b.y > ARENA.bottom;

      if (!remove) {
        for (const p of PILLARS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + b.r) {
            remove = true;
            if (isDay7) {
              for (let k = 0; k < 3; k++) {
                const a = rng() * Math.PI * 2;
                particles.push({
                  x: b.x,
                  y: b.y,
                  vx: Math.cos(a) * 80,
                  vy: Math.sin(a) * 80,
                  life: 0.2,
                  maxLife: 0.2,
                  size: 2,
                  color: [120, 240, 255],
                });
              }
            }
            break;
          }
        }
      }

      // Check hit against boss
      if (!remove && boss && boss.alive) {
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + b.r) {
          remove = true;
          boss.hp -= 1;
          boss.hitFlash = 0.12;
          score += 35;
          for (let k = 0; k < 5; k++) {
            const a = rng() * Math.PI * 2;
            particles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(a) * (90 + rng() * 90),
              vy: Math.sin(a) * (90 + rng() * 90),
              life: 0.3,
              maxLife: 0.3,
              size: 2.5,
              color: [255, 220, 90],
            });
          }
          if (boss.hp <= 0) {
            boss.alive = false;
            score += 2500;
            combo = Math.min(9, combo + 2);
            comboTimer = 3.0;
            shakeMag = 7;
            flashIntensity = 0.45;
            shockwaves.push({
              x: boss.x,
              y: boss.y,
              r: 14,
              maxR: 230,
              life: 1.0,
              color: [255, 200, 60],
            });
            popups.push({
              x: boss.x,
              y: boss.y - 10,
              text: '+2500 BOSS',
              life: 1.2,
              maxLife: 1.2,
              color: [255, 230, 95],
            });
            soundEvents.push({ t, type: 'boss_explode' });
            for (let k = 0; k < 48; k++) {
              const a = rng() * Math.PI * 2;
              const spd = 60 + rng() * 240;
              particles.push({
                x: boss.x,
                y: boss.y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                life: 0.5 + rng() * 0.55,
                maxLife: 1.05,
                size: 3 + rng() * 4,
                color:
                  k % 3 === 0
                    ? [255, 235, 110]
                    : k % 3 === 1
                      ? [255, 70, 175]
                      : [60, 235, 255],
              });
            }
          }
        }
      }

      // Check hit against enemies
      if (!remove) {
        for (const e of enemies) {
          if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
            remove = true;
            e.hp -= 1;
            e.hitFlash = 0.14;
            if (isDay7) {
              for (let k = 0; k < 4; k++) {
                const a = rng() * Math.PI * 2;
                particles.push({
                  x: b.x,
                  y: b.y,
                  vx: Math.cos(a) * 100,
                  vy: Math.sin(a) * 100,
                  life: 0.25,
                  maxLife: 0.25,
                  size: 2,
                  color: [255, 190, 80],
                });
              }
            }
            break;
          }
        }
      }

      if (remove) bullets.splice(i, 1);
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.phase += dt * 3;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      const dx = pose.x - e.x;
      const dy = pose.y - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));

      if (!isDay7) {
        // Day 1: slow linear drift toward player
        e.vx = (dx / d) * 42;
        e.vy = (dy / d) * 42;
      } else if (e.kind === 'chaser') {
        e.vx = (dx / d) * 86 + Math.cos(e.phase) * 18;
        e.vy = (dy / d) * 86 + Math.sin(e.phase) * 18;
      } else if (e.kind === 'striker') {
        const desired = d > 170 ? 68 : -25;
        e.vx = (dx / d) * desired + Math.cos(e.phase * 0.9) * 35;
        e.vy = (dy / d) * desired + Math.sin(e.phase * 0.9) * 35;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          const a = Math.atan2(dy, dx);
          enemyBullets.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 195,
            vy: Math.sin(a) * 195,
            r: 4,
            life: 2.2,
            color: [255, 92, 130],
          });
          e.shootTimer = 1.65;
        }
      } else {
        // Orbiter: circles around arena mid-field
        const tangX = -dy / d;
        const tangY = dx / d;
        e.vx = tangX * 72 + (dx / d) * 24;
        e.vy = tangY * 72 + (dy / d) * 24;
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Soft keep away from player so demo never stalls/dies
      const nd = Math.hypot(e.x - pose.x, e.y - pose.y);
      if (nd < 32 && nd > 0.001) {
        e.x = pose.x + ((e.x - pose.x) / nd) * 32;
        e.y = pose.y + ((e.y - pose.y) / nd) * 32;
        if (isDay7 && shield > 48) shield = Math.max(48, shield - 0.5);
      }
      e.x = Math.max(ARENA.left + 16, Math.min(ARENA.right - 16, e.x));
      e.y = Math.max(ARENA.top + 16, Math.min(ARENA.bottom - 16, e.y));

      if (e.hp <= 0) {
        if (!isDay7) {
          score += 10;
          soundEvents.push({ t, type: 'd1_hit' });
        } else {
          const pts = 50 * combo;
          score += pts;
          combo = Math.min(8, combo + 1);
          comboTimer = 2.4;
          overdrive = Math.min(100, overdrive + 6);
          shakeMag = Math.max(shakeMag, 2.2);
          shockwaves.push({
            x: e.x,
            y: e.y,
            r: 5,
            maxR: 48,
            life: 0.7,
            color: [255, 95, 195],
          });
          popups.push({
            x: e.x,
            y: e.y - 8,
            text: `+${pts}`,
            life: 0.75,
            maxLife: 0.75,
            color: combo >= 4 ? [255, 228, 92] : [110, 245, 255],
          });
          soundEvents.push({ t, type: 'd7_explode' });
          for (let k = 0; k < 14; k++) {
            const a = rng() * Math.PI * 2;
            const spd = 45 + rng() * 145;
            particles.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * spd,
              vy: Math.sin(a) * spd,
              life: 0.35 + rng() * 0.3,
              maxLife: 0.65,
              size: 2 + rng() * 3,
              color: k % 2 === 0 ? [255, 95, 190] : [255, 215, 85],
            });
          }
        }
        enemies.splice(i, 1);
      }
    }

    // Update boss
    if (boss && boss.alive) {
      boss.phase += dt * 1.9;
      boss.hitFlash = Math.max(0, boss.hitFlash - dt);
      boss.x = ARENA.cx + Math.sin(boss.phase) * 115;
      boss.y = ARENA.top + 86 + Math.cos(boss.phase * 1.4) * 20;
      boss.shootTimer -= dt;
      if (boss.shootTimer <= 0) {
        const ringCount = 10;
        const baseA = boss.phase * 1.7;
        for (let k = 0; k < ringCount; k++) {
          const a = baseA + (k / ringCount) * Math.PI * 2;
          enemyBullets.push({
            x: boss.x + Math.cos(a) * boss.r,
            y: boss.y + Math.sin(a) * boss.r,
            vx: Math.cos(a) * 165,
            vy: Math.sin(a) * 165,
            r: 4.5,
            life: 2.8,
            color: [255, 68, 178],
          });
        }
        boss.shootTimer = 0.85;
      }
    }

    // Update enemy bullets (graze-dodge near player)
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      eb.life -= dt;
      const hitPlayer = Math.hypot(eb.x - pose.x, eb.y - pose.y) < 22;
      if (
        hitPlayer ||
        eb.life <= 0 ||
        eb.x < ARENA.left ||
        eb.x > ARENA.right ||
        eb.y < ARENA.top ||
        eb.y > ARENA.bottom
      ) {
        if (hitPlayer && isDay7) {
          // Shield deflect spark
          for (let k = 0; k < 5; k++) {
            const a = rng() * Math.PI * 2;
            particles.push({
              x: eb.x,
              y: eb.y,
              vx: Math.cos(a) * 90,
              vy: Math.sin(a) * 90,
              life: 0.25,
              maxLife: 0.25,
              size: 2,
              color: [80, 235, 255],
            });
          }
        }
        enemyBullets.splice(i, 1);
      }
    }

    // Update particles, shockwaves, popups
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.life -= dt * 1.9;
      sw.r = sw.maxR * (1 - Math.max(0, sw.life));
      if (sw.life <= 0) shockwaves.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const pop = popups[i];
      pop.y -= 28 * dt;
      pop.life -= dt;
      if (pop.life <= 0) popups.splice(i, 1);
    }

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 1;
    }
    shield = Math.min(100, shield + dt * 3.5);
    flashIntensity = Math.max(0, flashIntensity - dt * 1.8);
    shakeMag = Math.max(0, shakeMag - dt * 18);

    // Snapshot lightweight immutable frame state
    frames.push({
      t,
      mode,
      player: { x: pose.x, y: pose.y, angle: facingAngle, aimAngle },
      trail: trail.map((tr) => ({ x: tr.x, y: tr.y, life: tr.life })),
      enemies: enemies.map((e) => ({
        x: e.x,
        y: e.y,
        r: e.r,
        kind: e.kind,
        hp: e.hp,
        maxHp: e.maxHp,
        hitFlash: e.hitFlash,
        phase: e.phase,
      })),
      boss: boss
        ? {
            x: boss.x,
            y: boss.y,
            r: boss.r,
            hp: boss.hp,
            maxHp: boss.maxHp,
            phase: boss.phase,
            hitFlash: boss.hitFlash,
            alive: boss.alive,
          }
        : null,
      bullets: bullets.map((b) => ({ x: b.x, y: b.y, r: b.r, kind: b.kind })),
      enemyBullets: enemyBullets.map((b) => ({
        x: b.x,
        y: b.y,
        r: b.r,
        color: b.color,
      })),
      particles: particles.map((p) => ({
        x: p.x,
        y: p.y,
        size: p.size,
        alpha: Math.max(0, p.life / p.maxLife),
        color: p.color,
      })),
      shockwaves: shockwaves.map((sw) => ({
        x: sw.x,
        y: sw.y,
        r: sw.r,
        alpha: Math.max(0, sw.life),
        color: sw.color,
      })),
      popups: popups.map((pop) => ({
        x: pop.x,
        y: pop.y,
        text: pop.text,
        alpha: Math.max(0, pop.life / pop.maxLife),
        color: pop.color,
      })),
      hud: {
        score,
        combo,
        shield: Math.round(shield),
        overdrive: Math.round(overdrive),
        wave,
      },
      fx: {
        flash: flashIntensity,
        shakeX: isDay7 ? (rng() - 0.5) * shakeMag : 0,
        shakeY: isDay7 ? (rng() - 0.5) * shakeMag : 0,
      },
    });
  }

  return { frames, soundEvents };
}
