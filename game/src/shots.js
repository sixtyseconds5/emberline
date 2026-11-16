// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the
// real rules forward from a fresh world for a fixed stretch, steered by a
// simple autopilot (keep clear of enemies, chase the nearest shard, fire at
// the nearest enemy, dash out of a close call, overdrive when full), so the
// frame is what a real run looks like and the same seed always gives the same
// frame. The end scene's pilot is deliberately weak — it never fires — so it
// is caught out, as a hurried player is.

import { FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const PLAY_SECONDS = 34;
const END_LIMIT_SECONDS = 300;
const WIN_LIMIT_SECONDS = 600;

/** The autopilot's input for this step: move, aim (null: nearest enemy), fire, dash, overdrive. */
function autopilot(state, strong) {
  const p = state.player;
  if (!p) return { move: { x: 0, y: 0 }, aim: null, firing: false, dash: false, overdrive: false };
  let mx = 0;
  let my = 0;
  let nearest = null;
  let nearestD = Infinity;
  // Keep clear of each kind at its own distance: mines detonate up close,
  // spinners shoot from afar, darts lunge.
  const FLEE = { mine: 170, spinner: 280, dart: 210, drifter: 190, maw: 220 };
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestD) { nearestD = d; nearest = e; }
    const radius = FLEE[e.kind] ?? 190;
    if (d < radius) {
      const w = (radius - d) / radius;
      mx += ((p.x - e.x) / (d || 1)) * w;
      my += ((p.y - e.y) / (d || 1)) * w;
    }
  }
  // Dodge incoming enemy bullets, hard.
  for (const b of state.ebullets) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < 130) {
      const w = (130 - d) / 130;
      mx += ((p.x - b.x) / (d || 1)) * w * 1.6;
      my += ((p.y - b.y) / (d || 1)) * w * 1.6;
    }
  }
  if (strong) {
    // Hurt: a hull shard is worth more than any other pickup.
    let shard = null;
    let shardD = Infinity;
    const wantHull = p.hull < 45;
    for (const s of state.shards) {
      if (wantHull && s.kind !== 'hull') continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < shardD) { shardD = d; shard = s; }
    }
    if (!shard && wantHull) {
      for (const s of state.shards) {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < shardD) { shardD = d; shard = s; }
      }
    }
    if (shard && shardD < 300 && nearestD > 110) {
      mx += ((shard.x - p.x) / (shardD || 1)) * 0.6;
      my += ((shard.y - p.y) / (shardD || 1)) * 0.6;
    }
    // Drift back toward the middle when the field is empty.
    if (!nearest && !shard) {
      mx += (FIELD.width / 2 - p.x) / FIELD.width;
      my += (FIELD.height / 2 - p.y) / FIELD.height;
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  return {
    move: { x: mx, y: my },
    aim: null,
    firing: strong,
    dash: strong && nearest !== null && nearestD < 70 && p.dashCd <= 0,
    overdrive: strong && p.overdrive >= 100,
  };
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world, seed) {
  const state = world.state;
  if (name === 'play' || name === 'win' || name === 'end') {
    world.reset();
  }
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    // Title: a decorative field behind the menu, placed deterministically.
    const rng = createRandom((seed ?? 11) * 7919 + 13);
    state.enemies = [];
    state.shards = [];
    const kinds = ['drifter', 'dart', 'spinner'];
    for (let i = 0; i < 5; i += 1) {
      state.enemies.push({
        kind: kinds[i % kinds.length], x: rng.range(60, FIELD.width - 60), y: rng.range(60, FIELD.height - 60),
        vx: 0, vy: 0, hp: 3, maxHp: 3, radius: 14, angle: rng.range(0, Math.PI * 2),
        speed: 0, shootTimer: 2, mode: 'stalk', modeTimer: 1, lx: 0, ly: 0,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      state.shards.push({ x: rng.range(60, FIELD.width - 60), y: rng.range(60, FIELD.height - 60), vx: 0, vy: 0, kind: 'shard', life: 14 });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const strong = name !== 'end';
  const limit = name === 'win' ? WIN_LIMIT_SECONDS : name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    if (state.phase === 'upgrade') world.applyFirstUpgrade();
    if (state.phase !== 'play') break;
    const input = autopilot(state, strong);
    const events = world.step(STEP, input.move, input.aim, input.firing, input.dash, input.overdrive);
    if (events & EVENT_WIN) break;
    if (events & EVENT_OVER) break;
  }
  if (state.phase === 'win') return { screen: SCREEN_WIN, best: state.score };
  if (state.phase === 'over') return { screen: SCREEN_OVER, best: state.score };
  return { screen: SCREEN_PLAY, best: state.score };
}
