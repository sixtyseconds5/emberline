// Emberline: every number that tunes the game lives here, so the feel of a
// wave, a weapon or an enemy can be changed in one place.

/** Logical playfield size in pixels; the canvas scales it to the window. */
export const FIELD = { width: 960, height: 540 };

/** Fixed simulation step, seconds. */
export const STEP = 1 / 60;

/** How many waves a run lasts; wave 10 ends with the boss. */
export const FINAL_WAVE = 10;

/** localStorage key for the best score. */
export const BEST_KEY = 'emberline.best';

/** Player ship tuning. */
export const PLAYER = {
  radius: 14,
  speed: 270,
  accel: 2400,
  drag: 4.2,
  maxHull: 100,
  fireInterval: 0.22,
  bulletSpeed: 560,
  bulletDamage: 1,
  bulletRadius: 4,
  shots: 1,
  magnet: 90,
  dashSpeed: 720,
  dashTime: 0.16,
  dashCooldown: 2.4,
  dashInvulnerable: 0.3,
  hurtInvulnerable: 0.9,
};

/** Combo: each kill or shard inside the window adds one; the multiplier is
 *  1 + floor(combo / 8), capped at 5. */
export const COMBO = { window: 3.0, perStep: 8, cap: 5 };

/** Overdrive: kills fill the meter; E spends a full meter for a burst. */
export const OVERDRIVE = { perKill: 9, perShard: 2, duration: 6, fireScale: 0.45, speedScale: 1.2 };

/** Enemy kinds, keyed by the id the world spawns. */
export const ENEMIES = {
  drifter: { hp: 3, speed: 58, radius: 15, damage: 10, score: 50, shards: 2, color: '#ff9a5c' },
  dart: { hp: 2, speed: 120, lungeSpeed: 330, radius: 11, damage: 12, score: 80, shards: 2, color: '#ff5c7a' },
  spinner: { hp: 5, speed: 42, radius: 16, damage: 10, score: 120, shards: 3, color: '#c77dff', shootEvery: 2.4, bulletSpeed: 170 },
  mine: { hp: 2, speed: 0, radius: 13, damage: 18, blast: 78, score: 60, shards: 1, color: '#ffd166' },
  maw: { hp: 240, speed: 34, radius: 46, damage: 22, score: 2000, shards: 12, color: '#ff3d5e' },
};

/** Which kinds a wave may spawn, and how many of the wave's budget they take. */
export const WAVE_TABLE = [
  { drifter: 1 },
  { drifter: 0.8, dart: 0.2 },
  { drifter: 0.6, dart: 0.3, mine: 0.1 },
  { drifter: 0.5, dart: 0.3, spinner: 0.1, mine: 0.1 },
  { drifter: 0.45, dart: 0.3, spinner: 0.15, mine: 0.1 },
  { drifter: 0.4, dart: 0.3, spinner: 0.2, mine: 0.1 },
  { drifter: 0.35, dart: 0.3, spinner: 0.2, mine: 0.15 },
  { drifter: 0.3, dart: 0.3, spinner: 0.25, mine: 0.15 },
  { drifter: 0.3, dart: 0.3, spinner: 0.25, mine: 0.15 },
  { maw: 1 },
];

/** Enemies per wave: budget grows, and each wave's table splits it. */
export function waveBudget(wave) {
  return wave >= FINAL_WAVE ? 1 : 7 + wave * 3;
}

/** Enemy toughness grows a little every wave. */
export function waveHpScale(wave) {
  return 1 + (wave - 1) * 0.09;
}
export function waveSpeedScale(wave) {
  return 1 + (wave - 1) * 0.03;
}

/** The three-upgrade choice offered between waves. */
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Cycler', text: 'Fire 20% faster.', apply: (p) => { p.fireInterval *= 0.8; } },
  { id: 'heavy', name: 'Heavy Rounds', text: '+30% bullet damage.', apply: (p) => { p.bulletDamage *= 1.3; } },
  { id: 'hull', name: 'Reinforced Hull', text: '+25 max hull and repair 25.', apply: (p) => { p.maxHull += 25; p.hull = Math.min(p.maxHull, p.hull + 25); } },
  { id: 'swift', name: 'Swift Thrusters', text: '+12% ship speed.', apply: (p) => { p.speed *= 1.12; } },
  { id: 'magnet', name: 'Magnet Array', text: '+70% shard pickup range.', apply: (p) => { p.magnet *= 1.7; } },
  { id: 'split', name: 'Split Shot', text: '+1 projectile, −10% damage.', apply: (p) => { p.shots += 1; p.bulletDamage *= 0.9; } },
  { id: 'dash', name: 'Dash Capacitor', text: 'Dash recharges 35% faster.', apply: (p) => { p.dashCooldown *= 0.65; } },
  { id: 'greed', name: 'Shard Greed', text: 'Shards are worth double.', apply: (p) => { p.shardValue *= 2; } },
];

/** Points: a shard is worth this times the combo multiplier. */
export const SHARD_SCORE = 25;
/** Clearing a wave pays this times the wave number. */
export const WAVE_CLEAR_SCORE = 100;
