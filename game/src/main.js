// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, upgrade and game over / win.
//
// ?seed=N fixes the run. ?shot=start|play|win|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS,
  EVENT_DASH,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_OVER,
  EVENT_OVERDRIVE,
  EVENT_PICKUP,
  EVENT_SHOOT,
  EVENT_WAVE_CLEAR,
  EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_MUTE,
  ACTION_OVERDRIVE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Fit the 960x540 canvas into the window, keeping its shape. */
function fit() {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
  canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
}
window.addEventListener('resize', fit);
fit();

function runShot(name) {
  const scene = stageShot(name, world, seed);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let wantDash = false;
  let wantOverdrive = false;
  // When the upgrade screen opened; a player that never picks (a bot that
  // only knows the stick and the trigger, or a distracted human) gets the
  // best upgrade after 8 s instead of stalling the run there forever.
  let upgradeSince = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1 of 10.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.victory();
      announce(`Victory. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.defeat();
      announce(`Game over on wave ${world.state.wave}. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_DASH) wantDash = true;
    if (actions & ACTION_OVERDRIVE) wantOverdrive = true;
    const pick = input.takePick();
    if (screen === SCREEN_UPGRADE && pick >= 1 && pick <= 3) {
      const choice = world.applyUpgrade(pick - 1);
      if (choice) {
        audio.upgrade();
        screen = SCREEN_PLAY;
        announce(`${choice.name}. Wave ${world.state.wave}.`);
      }
      return;
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_PAUSED)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    const dash = wantDash;
    const overdrive = wantOverdrive;
    wantDash = false;
    wantOverdrive = false;
    const beforeHull = world.state.player ? world.state.player.hull : 0;
    const events = world.step(STEP, input.direction(), input.aim(), input.firing(), dash, overdrive);
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.explode(false);
    if (events & EVENT_PICKUP) audio.pickup(world.state.combo);
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_OVERDRIVE) audio.overdrive();
    if (events & EVENT_WAVE_CLEAR) {
      audio.wave();
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    }
    if (events & EVENT_BOSS) announce('The Maw approaches. Wave 10.');
    if (world.state.player && world.state.player.hull < beforeHull) {
      audio.hurt();
      announce(`Hit. Hull ${Math.ceil(world.state.player.hull)}.`);
    } else if (events & EVENT_HIT) {
      audio.hit();
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER || world.state.phase === 'over') endGame(false);
    else if (world.state.phase === 'upgrade') screen = SCREEN_UPGRADE;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // Auto-pick the best upgrade if nobody picks within 8 s.
    if (screen === SCREEN_UPGRADE) {
      if (!upgradeSince) upgradeSince = now;
      else if (now - upgradeSince > 8000) {
        const rank = { heavy: 5, rapid: 4, split: 4, hull: 3, swift: 2, magnet: 2, dash: 2, greed: 1 };
        const choices = world.state.upgradeChoices;
        const p = world.state.player;
        const scored = (c) => (rank[c.id] ?? 0) + (c.id === 'hull' && p && p.hull < p.maxHull * 0.6 ? 2 : 0);
        let best = 0;
        for (let i = 1; i < choices.length; i += 1) if (scored(choices[i]) > scored(choices[best])) best = i;
        const choice = world.applyUpgrade(best);
        if (choice) {
          audio.upgrade();
          screen = SCREEN_PLAY;
          announce(`Auto-picked ${choice.name}. Wave ${world.state.wave}.`);
        }
        upgradeSince = 0;
      }
    } else upgradeSince = 0;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
        if (world.state.phase === 'upgrade') break;
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting enemies close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberline. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
