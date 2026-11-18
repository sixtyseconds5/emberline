// Emberline's simulation: the ship, the enemies, the bullets, the shards, the
// waves and the upgrades. Pure state in, fixed steps forward; it knows
// nothing about the canvas, the keyboard or sound. step() returns a bitmask
// of what happened, so the shell can answer with sound and announcements.

import {
  COMBO, ENEMIES, FIELD, FINAL_WAVE, OVERDRIVE, PLAYER,
  SHARD_SCORE, UPGRADES, WAVE_CLEAR_SCORE, WAVE_TABLE,
  waveBudget, waveHpScale, waveSpeedScale,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_KILL = 2;
export const EVENT_HIT = 4;
export const EVENT_PICKUP = 8;
export const EVENT_DASH = 16;
export const EVENT_OVERDRIVE = 32;
export const EVENT_WAVE_CLEAR = 64;
export const EVENT_BOSS = 128;
export const EVENT_OVER = 256;
export const EVENT_WIN = 512;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function edgePoint(random, margin) {
  const side = random.int(0, 3);
  if (side === 0) return { x: random.range(margin, FIELD.width - margin), y: -margin };
  if (side === 1) return { x: random.range(margin, FIELD.width - margin), y: FIELD.height + margin };
  if (side === 2) return { x: -margin, y: random.range(margin, FIELD.height - margin) };
  return { x: FIELD.width + margin, y: random.range(margin, FIELD.height - margin) };
}

/** A fresh world for `random` (a seeded generator). */
export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    wave: 0,
    phase: 'title',
    kills: 0,
    shake: 0,
    flash: 0,
    upgradeChoices: [],
    player: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    shards: [],
    particles: [],
    floats: [],
    spawnQueue: [],
    spawnTimer: 0,
    bossTrickle: 0,
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
      radius: PLAYER.radius, hull: PLAYER.maxHull, maxHull: PLAYER.maxHull,
      speed: PLAYER.speed, fireInterval: PLAYER.fireInterval,
      bulletDamage: PLAYER.bulletDamage, bulletSpeed: PLAYER.bulletSpeed,
      shots: PLAYER.shots, magnet: PLAYER.magnet,
      dashCooldown: PLAYER.dashCooldown, dashCd: 0, dashTime: 0,
      fireTimer: 0, invuln: 0, overdrive: 0, overdriveTime: 0,
      shardValue: 1,
    };
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random.next() * TAU;
      const s = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(0.3, 0.7), maxLife: 0.7,
        size: random.range(1.5, 3.5), color,
      });
    }
    if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
  }

  function floatText(x, y, text, color) {
    state.floats.push({ x, y, text, life: 0.9, color });
    if (state.floats.length > 24) state.floats.shift();
  }

  function addScore(base, x, y) {
    const mult = 1 + Math.min(Math.floor(state.combo / COMBO.perStep), COMBO.cap - 1);
    const gained = base * mult;
    state.score += gained;
    if (x !== undefined) floatText(x, y, `+${gained}`, mult > 1 ? '#ffd166' : '#e8f6ff');
    return gained;
  }

  function bumpCombo() {
    state.combo += 1;
    state.comboTimer = COMBO.window;
  }

  function spawnEnemy(kind, x, y) {
    const def = ENEMIES[kind];
    const hpScale = waveHpScale(Math.max(1, state.wave));
    const spScale = waveSpeedScale(Math.max(1, state.wave));
    const at = x !== undefined ? { x, y } : edgePoint(random, 30);
    const enemy = {
      kind, x: at.x, y: at.y, vx: 0, vy: 0,
      hp: Math.round(def.hp * hpScale), maxHp: Math.round(def.hp * hpScale),
      radius: def.radius, angle: random.next() * TAU,
      speed: def.speed * spScale, shootTimer: random.range(1, def.shootEvery ?? 2),
      mode: 'stalk', modeTimer: random.range(0.6, 1.4), lx: 0, ly: 0,
    };
    if (kind === 'mine') {
      enemy.vx = random.range(-14, 14);
      enemy.vy = random.range(-14, 14);
    }
    state.enemies.push(enemy);
    return enemy;
  }

  function buildQueue(wave) {
    const table = WAVE_TABLE[wave - 1];
    const budget = waveBudget(wave);
    const queue = [];
    if (wave >= FINAL_WAVE) {
      queue.push('maw');
      return queue;
    }
    const kinds = Object.keys(table);
    for (let i = 0; i < budget; i += 1) {
      let roll = random.next();
      let kind = kinds[0];
      for (const k of kinds) {
        if (roll < table[k]) { kind = k; break; }
        roll -= table[k];
      }
      queue.push(kind);
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildQueue(wave);
    state.spawnTimer = 0.6;
    state.bossTrickle = 8;
    if (wave === FINAL_WAVE) return EVENT_BOSS;
    return 0;
  }

  function dropShards(enemy) {
    const def = ENEMIES[enemy.kind];
    for (let i = 0; i < def.shards; i += 1) {
      const a = random.next() * TAU;
      state.shards.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(a) * random.range(20, 70), vy: Math.sin(a) * random.range(20, 70),
        kind: 'shard', life: 14,
      });
    }
    if (random.next() < 0.12) {
      state.shards.push({ x: enemy.x, y: enemy.y, vx: 0, vy: -20, kind: 'hull', life: 14 });
    }
  }

  function killEnemy(index, award) {
    const enemy = state.enemies[index];
    const def = ENEMIES[enemy.kind];
    state.enemies.splice(index, 1);
    state.kills += 1;
    bumpCombo();
    state.overdrive = Math.min(100, state.overdrive + OVERDRIVE.perKill);
    burst(enemy.x, enemy.y, def.color, enemy.kind === 'maw' ? 60 : 16, enemy.kind === 'maw' ? 260 : 170);
    if (enemy.kind === 'mine') {
      explodeMine(enemy, false);
    } else {
      dropShards(enemy);
    }
    if (award !== false) addScore(def.score, enemy.x, enemy.y);
    if (enemy.kind === 'maw') {
      state.shake = Math.max(state.shake, 14);
      return EVENT_WIN;
    }
    state.shake = Math.max(state.shake, 3);
    return EVENT_KILL;
  }

  function explodeMine(mine, chain) {
    const def = ENEMIES.mine;
    burst(mine.x, mine.y, '#ffd166', 26, 240);
    burst(mine.x, mine.y, '#ff5c7a', 14, 160);
    state.shake = Math.max(state.shake, 8);
    state.flash = Math.max(state.flash, 0.25);
    const p = state.player;
    if (p && p.invuln <= 0 && dist2(p.x, p.y, mine.x, mine.y) < (def.blast + PLAYER.radius) ** 2) {
      hurtPlayer(def.damage, mine.x, mine.y);
    }
    // Chain: other mines caught in the blast go off too.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const other = state.enemies[i];
      if (other.kind === 'mine' && other !== mine && dist2(other.x, other.y, mine.x, mine.y) < def.blast ** 2) {
        state.enemies.splice(i, 1);
        explodeMine(other, true);
      } else if (other.kind !== 'mine' && dist2(other.x, other.y, mine.x, mine.y) < (def.blast + other.radius) ** 2) {
        other.hp -= 2;
        if (other.hp <= 0) killEnemy(i, true);
      }
    }
    if (chain) return EVENT_KILL;
    return 0;
  }

  function hurtPlayer(damage, fromX, fromY) {
    const p = state.player;
    if (!p || p.invuln > 0 || p.dashTime > 0) return 0;
    p.hull -= damage;
    p.invuln = PLAYER.hurtInvulnerable;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.max(state.shake, 7);
    state.flash = Math.max(state.flash, 0.35);
    burst(p.x, p.y, '#ff5c7a', 12, 200);
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.vx += (dx / len) * 260;
    p.vy += (dy / len) * 260;
    if (p.hull <= 0) {
      p.hull = 0;
      state.phase = 'over';
      burst(p.x, p.y, '#e8f6ff', 50, 300);
      burst(p.x, p.y, '#ff9a5c', 30, 220);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function offerUpgrades() {
    const pool = [...UPGRADES];
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      choices.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
    }
    state.upgradeChoices = choices;
    state.phase = 'upgrade';
  }

  function stepPlayer(dt, move, aim, firing, wantDash, wantOverdrive) {
    const p = state.player;
    let events = 0;
    p.fireTimer -= dt;
    p.dashCd -= dt;
    p.invuln -= dt;
    if (p.overdriveTime > 0) {
      p.overdriveTime -= dt;
      if (p.overdriveTime <= 0) p.overdrive = 0;
    }
    if (wantOverdrive && p.overdrive >= 100 && p.overdriveTime <= 0) {
      p.overdriveTime = OVERDRIVE.duration;
      events |= EVENT_OVERDRIVE;
    }
    if (wantDash && p.dashCd <= 0 && p.dashTime <= 0) {
      const dx = move.touch ? move.touch.x - p.x : move.x;
      const dy = move.touch ? move.touch.y - p.y : move.y;
      const len = Math.hypot(dx, dy);
      const ax = len > 1 ? dx / len : Math.cos(p.angle);
      const ay = len > 1 ? dy / len : Math.sin(p.angle);
      p.vx = ax * PLAYER.dashSpeed;
      p.vy = ay * PLAYER.dashSpeed;
      p.dashTime = PLAYER.dashTime;
      p.dashCd = p.dashCooldown;
      p.invuln = Math.max(p.invuln, PLAYER.dashInvulnerable);
      burst(p.x, p.y, '#7dd8ff', 8, 120);
      events |= EVENT_DASH;
    }
    if (p.dashTime > 0) {
      p.dashTime -= dt;
    } else if (move.touch) {
      const dx = move.touch.x - p.x;
      const dy = move.touch.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        p.vx += (dx / len) * PLAYER.accel * dt;
        p.vy += (dy / len) * PLAYER.accel * dt;
      }
    } else {
      p.vx += move.x * PLAYER.accel * dt;
      p.vy += move.y * PLAYER.accel * dt;
    }
    const drag = Math.exp(-PLAYER.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
    const speed = Math.hypot(p.vx, p.vy);
    const max = p.speed * (p.overdriveTime > 0 ? OVERDRIVE.speedScale : 1) * (p.dashTime > 0 ? 2.4 : 1);
    if (speed > max) {
      p.vx = (p.vx / speed) * max;
      p.vy = (p.vy / speed) * max;
    }
    p.x = Math.min(FIELD.width - p.radius, Math.max(p.radius, p.x + p.vx * dt));
    p.y = Math.min(FIELD.height - p.radius, Math.max(p.radius, p.y + p.vy * dt));
    // Aim: the mouse when it moved, else the nearest enemy, else travel.
    let target = null;
    if (aim) target = aim;
    else if (state.enemies.length > 0) {
      let best = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        const d = dist2(p.x, p.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      target = best;
    }
    if (target) p.angle = Math.atan2(target.y - p.y, target.x - p.x);
    else if (speed > 20) p.angle = Math.atan2(p.vy, p.vx);
    // Fire.
    if (firing && p.fireTimer <= 0) {
      const interval = p.fireInterval * (p.overdriveTime > 0 ? OVERDRIVE.fireScale : 1);
      p.fireTimer = interval;
      const spread = 0.14;
      for (let i = 0; i < p.shots; i += 1) {
        const off = (i - (p.shots - 1) / 2) * spread;
        const a = p.angle + off;
        state.bullets.push({
          x: p.x + Math.cos(a) * (p.radius + 6), y: p.y + Math.sin(a) * (p.radius + 6),
          vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed,
          damage: p.bulletDamage, radius: PLAYER.bulletRadius, life: 1.1,
        });
      }
      events |= EVENT_SHOOT;
    }
    return events;
  }

  function stepEnemies(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const def = ENEMIES[e.kind];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.modeTimer -= dt;
      if (e.kind === 'drifter') {
        e.vx += (dx / d) * e.speed * 2.4 * dt;
        e.vy += (dy / d) * e.speed * 2.4 * dt;
        const s = Math.hypot(e.vx, e.vy);
        if (s > e.speed) { e.vx = (e.vx / s) * e.speed; e.vy = (e.vy / s) * e.speed; }
        e.angle = Math.atan2(e.vy, e.vx);
      } else if (e.kind === 'dart') {
        if (e.mode === 'stalk') {
          e.vx += (dx / d) * e.speed * dt;
          e.vy += (dy / d) * e.speed * dt;
          if (e.modeTimer <= 0) { e.mode = 'aim'; e.modeTimer = 0.45; }
        } else if (e.mode === 'aim') {
          e.vx *= 0.9; e.vy *= 0.9;
          e.lx = dx / d; e.ly = dy / d;
          if (e.modeTimer <= 0) {
            e.mode = 'lunge'; e.modeTimer = 0.5;
            e.vx = e.lx * def.lungeSpeed; e.vy = e.ly * def.lungeSpeed;
          }
        } else if (e.mode === 'lunge') {
          if (e.modeTimer <= 0) { e.mode = 'recover'; e.modeTimer = 0.7; }
        } else {
          e.vx *= 0.92; e.vy *= 0.92;
          if (e.modeTimer <= 0) { e.mode = 'stalk'; e.modeTimer = random.range(0.8, 1.4); }
        }
        e.angle = Math.atan2(e.vy, e.vx);
      } else if (e.kind === 'spinner') {
        const want = 230;
        const toward = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
        e.vx += (dx / d) * toward * e.speed * 2 * dt;
        e.vy += (dy / d) * toward * e.speed * 2 * dt;
        const s = Math.hypot(e.vx, e.vy);
        if (s > e.speed) { e.vx = (e.vx / s) * e.speed; e.vy = (e.vy / s) * e.speed; }
        e.angle += dt * 1.5;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 520) {
          e.shootTimer = def.shootEvery;
          state.ebullets.push({
            x: e.x, y: e.y, vx: (dx / d) * def.bulletSpeed, vy: (dy / d) * def.bulletSpeed,
            radius: 5, damage: def.damage, life: 4,
          });
        }
      } else if (e.kind === 'mine') {
        // Mines creep toward the ship instead of drifting at random: a lone
        // mine could otherwise stall a wave for minutes while the ship waits
        // it out at range. Slow enough (46 px/s) to outrun and outgun.
        e.vx += (dx / d) * 26 * dt;
        e.vy += (dy / d) * 26 * dt;
        const ms = Math.hypot(e.vx, e.vy);
        if (ms > 46) { e.vx = (e.vx / ms) * 46; e.vy = (e.vy / ms) * 46; }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.x < e.radius || e.x > FIELD.width - e.radius) e.vx *= -1;
        if (e.y < e.radius || e.y > FIELD.height - e.radius) e.vy *= -1;
        e.angle += dt;
        if (d < def.blast * 0.85) {
          state.enemies.splice(i, 1);
          events |= explodeMine(e, false);
          events |= EVENT_KILL;
          continue;
        }
      } else if (e.kind === 'maw') {
        e.vx += (dx / d) * e.speed * 1.6 * dt;
        e.vy += (dy / d) * e.speed * 1.6 * dt;
        const s = Math.hypot(e.vx, e.vy);
        if (s > e.speed) { e.vx = (e.vx / s) * e.speed; e.vy = (e.vy / s) * e.speed; }
        e.angle += dt * 0.8;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = e.hp < e.maxHp * 0.3 ? 1.6 : 2.2;
          const ring = 12;
          for (let k = 0; k < ring; k += 1) {
            const a = (k / ring) * TAU + e.angle;
            state.ebullets.push({
              x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
              radius: 6, damage: 14, life: 5,
            });
          }
          if (state.enemies.length < 6) {
            const at = edgePoint(random, 40);
            spawnEnemy('drifter', at.x, at.y);
          }
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Drifters and darts stay in the field; spinners and the boss too.
      e.x = Math.min(FIELD.width - e.radius, Math.max(e.radius, e.x));
      e.y = Math.min(FIELD.height - e.radius, Math.max(e.radius, e.y));
      // Touching the ship hurts.
      if (e.kind !== 'mine' && dist2(e.x, e.y, p.x, p.y) < (e.radius + PLAYER.radius - 2) ** 2) {
        events |= hurtPlayer(def.damage, e.x, e.y);
        // The enemy bounces off instead of grinding the hull down.
        e.vx = (-dx / d) * 180;
        e.vy = (-dy / d) * 180;
        if (state.phase === 'over') return events;
      }
    }
    return events;
  }

  function stepBullets(dt) {
    let events = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (dist2(b.x, b.y, e.x, e.y) < (e.radius + b.radius) ** 2) {
          e.hp -= b.damage;
          burst(b.x, b.y, '#9fe8ff', 3, 90);
          state.bullets.splice(i, 1);
          if (e.hp <= 0) {
            const won = killEnemy(j, true);
            events |= won;
            if (won & EVENT_WIN) return events;
          } else {
            events |= EVENT_HIT;
          }
          break;
        }
      }
    }
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.ebullets.splice(i, 1);
        continue;
      }
      const p = state.player;
      if (p && dist2(b.x, b.y, p.x, p.y) < (b.radius + PLAYER.radius - 2) ** 2) {
        state.ebullets.splice(i, 1);
        events |= hurtPlayer(b.damage, b.x - b.vx * 0.1, b.y - b.vy * 0.1);
        if (state.phase === 'over') return events;
      }
    }
    return events;
  }

  function stepShards(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const s = state.shards[i];
      s.life -= dt;
      if (s.life <= 0) { state.shards.splice(i, 1); continue; }
      const d = Math.hypot(p.x - s.x, p.y - s.y) || 1;
      if (d < p.magnet) {
        s.vx += ((p.x - s.x) / d) * 900 * dt;
        s.vy += ((p.y - s.y) / d) * 900 * dt;
      } else {
        s.vx *= Math.exp(-1.5 * dt);
        s.vy *= Math.exp(-1.5 * dt);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (d < PLAYER.radius + 12) {
        state.shards.splice(i, 1);
        if (s.kind === 'hull') {
          p.hull = Math.min(p.maxHull, p.hull + 20);
          floatText(p.x, p.y - 24, '+20 HULL', '#7dffa8');
        } else {
          bumpCombo();
          state.overdrive = Math.min(100, state.overdrive + OVERDRIVE.perShard);
          addScore(SHARD_SCORE * p.shardValue, s.x, s.y);
          burst(s.x, s.y, '#ffd166', 4, 80);
        }
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { state.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2 * dt);
      pt.vy *= Math.exp(-2 * dt);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 1.4);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  }

  return {
    state,
    /** Begin a fresh run. */
    reset() {
      state.time = 0;
      state.score = 0;
      state.combo = 0;
      state.comboTimer = 0;
      state.wave = 0;
      state.phase = 'play';
      state.kills = 0;
      state.shake = 0;
      state.flash = 0;
      state.upgradeChoices = [];
      state.player = freshPlayer();
      state.enemies = [];
      state.bullets = [];
      state.ebullets = [];
      state.shards = [];
      state.particles = [];
      state.floats = [];
      state.spawnQueue = [];
      state.spawnTimer = 0;
      state.bossTrickle = 0;
      return startWave(1);
    },
    /** Advance one fixed step. `move` is {x, y} (or {touch}), `aim` a point or null. */
    step(dt, move, aim, firing, wantDash, wantOverdrive) {
      if (state.phase !== 'play') return 0;
      state.time += dt;
      let events = 0;
      events |= stepPlayer(dt, move, aim, firing, wantDash, wantOverdrive);
      if (state.phase === 'over') return events | EVENT_OVER;
      // Spawn the wave's queue over time.
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = 0.7;
          spawnEnemy(state.spawnQueue.shift());
        }
      } else if (state.wave === FINAL_WAVE) {
        state.bossTrickle -= dt;
        if (state.bossTrickle <= 0 && state.enemies.length < 5) {
          state.bossTrickle = 7;
          const at = edgePoint(random, 40);
          spawnEnemy('drifter', at.x, at.y);
        }
      }
      events |= stepEnemies(dt);
      if (state.phase === 'over') return events | EVENT_OVER;
      events |= stepBullets(dt);
      if (events & EVENT_WIN) {
        state.phase = 'win';
        state.score += 1000;
        return events;
      }
      if (state.phase === 'over') return events | EVENT_OVER;
      events |= stepShards(dt);
      stepFx(dt);
      // Wave cleared: bonus, then the upgrade choice (or the next wave).
      if (state.spawnQueue.length === 0 && state.enemies.length === 0 && state.phase === 'play') {
        state.score += WAVE_CLEAR_SCORE * state.wave;
        events |= EVENT_WAVE_CLEAR;
        if (state.wave >= FINAL_WAVE) {
          state.phase = 'win';
          return events | EVENT_WIN;
        }
        offerUpgrades();
      }
      return events;
    },
    /** Take one of the offered upgrades (0, 1 or 2) and start the next wave. */
    applyUpgrade(index) {
      const choice = state.upgradeChoices[index];
      if (!choice) return null;
      choice.apply(state.player);
      state.upgradeChoices = [];
      state.phase = 'play';
      startWave(state.wave + 1);
      return choice;
    },
    /** Skip the upgrade screen (kept for the autopilot): take the first. */
    applyFirstUpgrade() {
      return this.applyUpgrade(0);
    },
    /** Start the named wave at once (used by the screenshot stager). */
    startWave,
    /** How many hostiles are still standing or queued. */
    hostilesLeft() {
      return state.enemies.length + state.spawnQueue.length;
    },
  };
}
