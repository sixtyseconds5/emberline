// Emberline's renderer: the world state in, a canvas frame out. It owns the
// look — the ember nebula, the starfield, the ship, each enemy kind, the HUD
// and the title / pause / upgrade / end screens — and nothing else. The canvas
// backing store is the field itself (960x540); the shell scales it to the
// window, so mouse coordinates map one to one.

import { ENEMIES, FIELD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make the renderer for `canvas` (backing store set to the field size). */
export function createRenderer(canvas) {
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  const rng = mulberry(20261115);
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, r: 0.5 + rng() * 1.4, p: rng() * TAU, s: 0.6 + rng() * 1.8 });
  }
  const embers = [];
  for (let i = 0; i < 26; i += 1) {
    embers.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, r: 1 + rng() * 2.2, drift: 6 + rng() * 14, p: rng() * TAU });
  }

  function background(time) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, '#0a1030');
    g.addColorStop(0.6, '#0a0c20');
    g.addColorStop(1, '#05070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const blobs = [
      [FIELD.width * 0.18, FIELD.height * 0.2, 260, 'rgba(45, 212, 191, 0.10)'],
      [FIELD.width * 0.85, FIELD.height * 0.3, 300, 'rgba(129, 140, 248, 0.10)'],
      [FIELD.width * 0.6, FIELD.height * 0.9, 280, 'rgba(244, 114, 182, 0.07)'],
    ];
    for (const [x, y, r, color] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.s + s.p));
      ctx.fillStyle = '#dbeafe';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const e of embers) {
      const y = (e.y - time * e.drift + FIELD.height) % FIELD.height;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 0.9 + e.p);
      ctx.fillStyle = '#ff9a5c';
      ctx.beginPath();
      ctx.arc(e.x, y, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShard(s, time) {
    const pulse = 1 + 0.18 * Math.sin(time * 5 + s.x);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(time * 1.5);
    if (s.kind === 'hull') {
      ctx.fillStyle = '#7dffa8';
      ctx.beginPath();
      ctx.arc(0, 0, 11 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#052e16';
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
    } else {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(0, -10 * pulse);
      ctx.lineTo(7 * pulse, 0);
      ctx.lineTo(0, 10 * pulse);
      ctx.lineTo(-7 * pulse, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.moveTo(0, -4 * pulse);
      ctx.lineTo(3 * pulse, 0);
      ctx.lineTo(0, 4 * pulse);
      ctx.lineTo(-3 * pulse, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(e, time, player) {
    const def = ENEMIES[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === 'drifter') {
      ctx.rotate(e.angle);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        const r = i % 2 === 0 ? e.radius + 5 : e.radius - 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7c2d12';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.45, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'dart') {
      ctx.rotate(e.angle);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(e.radius + 8, 0);
      ctx.lineTo(-e.radius, -e.radius * 0.7);
      ctx.lineTo(-e.radius * 0.4, 0);
      ctx.lineTo(-e.radius, e.radius * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff1f2';
      ctx.beginPath();
      ctx.arc(e.radius * 0.3, 0, 3, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'spinner') {
      ctx.rotate(e.angle);
      ctx.fillStyle = def.color;
      ctx.fillRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
      ctx.rotate(-e.angle * 2);
      ctx.fillStyle = '#2e1065';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.45, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'mine') {
      const pulse = 1 + 0.12 * Math.sin(time * 6 + e.x);
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 78, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU + time;
        const r = i % 2 === 0 ? e.radius * pulse + 4 : e.radius * pulse - 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.arc(0, 0, 4 * pulse, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'maw') {
      ctx.rotate(e.angle);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.arc(e.radius * 0.25, 0, e.radius * 0.55, -0.9, 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fecdd3';
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(e.radius * 0.25 + Math.cos(i * 0.36) * e.radius * 0.5, Math.sin(i * 0.36) * e.radius * 0.5, 4, 0, TAU);
        ctx.fill();
      }
      ctx.rotate(-e.angle);
      ctx.fillStyle = '#fff1f2';
      ctx.beginPath();
      ctx.arc(-e.radius * 0.45, -e.radius * 0.4, 5, 0, TAU);
      ctx.arc(-e.radius * 0.45, e.radius * 0.4, 5, 0, TAU);
      ctx.fill();
      // Boss health bar.
      const w = 120;
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(5, 7, 15, 0.7)';
      ctx.fillRect(-w / 2, -e.radius - 22, w, 8);
      ctx.fillStyle = pct > 0.3 ? '#f87171' : '#ef4444';
      ctx.fillRect(-w / 2, -e.radius - 22, w * pct, 8);
    }
    ctx.restore();
    void player;
  }

  function drawPlayer(p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    if (p.overdriveTime > 0) {
      ctx.shadowColor = '#ff9a5c';
      ctx.shadowBlur = 22;
    }
    ctx.rotate(p.angle);
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 40) {
      const flick = 10 + 6 * Math.sin(time * 40);
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.lineTo(-12 - flick, 0);
      ctx.lineTo(-12, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8f6ff';
    ctx.strokeStyle = '#7dd8ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(125, 216, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, 0, TAU);
      ctx.stroke();
    }
  }

  function text(str, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, pct, color, bg) {
    ctx.fillStyle = bg || 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, Math.min(1, pct)) * w, h);
  }

  function drawHud(state, best) {
    const p = state.player;
    text(`SCORE ${state.score.toLocaleString('en-US')}`, 16, 30, 20, '#e6ecf5', 'left', 700);
    text(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}`, 16, 50, 12, '#93a3bd');
    const mult = 1 + Math.min(Math.floor(state.combo / 8), 4);
    if (state.combo >= 8) {
      text(`COMBO x${mult}  (${state.combo})`, 16, 70, 13, '#ffd166', 'left', 700);
    }
    text(`WAVE ${Math.max(1, state.wave)} / 10`, FIELD.width / 2, 30, 16, '#e6ecf5', 'center', 700);
    const left = state.enemies.length + state.spawnQueue.length;
    text(left > 0 ? `${left} HOSTILE${left === 1 ? '' : 'S'} LEFT` : 'WAVE CLEAR', FIELD.width / 2, 50, 12, '#93a3bd', 'center');
    if (p) {
      const pct = p.hull / p.maxHull;
      const color = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#f87171';
      text('HULL', FIELD.width - 196, 26, 12, '#93a3bd', 'left', 700);
      bar(FIELD.width - 196, 32, 180, 10, pct, color);
      text(`${Math.ceil(p.hull)} / ${p.maxHull}`, FIELD.width - 16, 26, 12, '#e6ecf5', 'right');
      const od = p.overdrive / 100;
      text(p.overdrive >= 100 ? 'OVERDRIVE READY — E' : 'OVERDRIVE', FIELD.width - 196, 60, 12, p.overdrive >= 100 ? '#ff9a5c' : '#93a3bd', 'left', 700);
      bar(FIELD.width - 196, 66, 180, 8, od, '#ff9a5c');
      if (p.dashCd > 0) {
        text(`DASH ${p.dashCd.toFixed(1)}s`, FIELD.width - 16, 60, 12, '#64748b', 'right');
      } else {
        text('DASH READY — SHIFT', FIELD.width - 16, 60, 12, '#7dd8ff', 'right');
      }
    }
  }

  function overlay(alpha) {
    ctx.fillStyle = `rgba(5, 7, 15, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function drawTitle(state, best) {
    overlay(0.55);
    text('EMBERLINE', FIELD.width / 2, 168, 64, '#e6ecf5', 'center', 800);
    text('Hold the line. Ten waves. One ship. The Maw waits at the end.', FIELD.width / 2, 202, 16, '#93a3bd', 'center');
    const lines = [
      ['WASD / Arrows', 'fly the ship'],
      ['Mouse — hold click / Space', 'aim and fire'],
      ['Shift', 'dash through danger'],
      ['E', 'overdrive when the meter is full'],
      ['1 / 2 / 3', 'pick an upgrade between waves'],
      ['P pause · M mute · R restart', ''],
    ];
    let y = 250;
    for (const [key, desc] of lines) {
      text(key, FIELD.width / 2 - 150, y, 14, '#7dd8ff', 'right', 700);
      if (desc) text(desc, FIELD.width / 2 - 130, y, 14, '#e6ecf5', 'left');
      y += 24;
    }
    text('Press Enter or click to launch', FIELD.width / 2, 420, 18, '#ffd166', 'center', 700);
    if (best > 0) text(`BEST ${best.toLocaleString('en-US')}`, FIELD.width / 2, 448, 13, '#93a3bd', 'center');
    void state;
  }

  function drawUpgrade(state) {
    overlay(0.6);
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 96, 30, '#4ade80', 'center', 800);
    text('Choose an upgrade — press 1, 2 or 3', FIELD.width / 2, 126, 15, '#93a3bd', 'center');
    const w = 260;
    const gap = 20;
    const total = w * 3 + gap * 2;
    let x = (FIELD.width - total) / 2;
    state.upgradeChoices.forEach((choice, i) => {
      ctx.fillStyle = '#101a2e';
      ctx.strokeStyle = '#22304d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, 160, w, 150, 10);
      ctx.fill();
      ctx.stroke();
      text(`${i + 1}`, x + 16, 196, 22, '#ffd166', 'left', 800);
      text(choice.name, x + 16, 226, 17, '#e6ecf5', 'left', 700);
      ctx.fillStyle = '#93a3bd';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const words = choice.text.split(' ');
      let line = '';
      let ly = 254;
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 26) {
          ctx.fillText(line.trim(), x + 16, ly);
          line = word;
          ly += 20;
        } else {
          line += ' ' + word;
        }
      }
      if (line.trim()) ctx.fillText(line.trim(), x + 16, ly);
      x += w + gap;
    });
    text(`Score ${state.score.toLocaleString('en-US')}  ·  Wave ${state.wave + 1} of 10 next`, FIELD.width / 2, 350, 14, '#93a3bd', 'center');
  }

  function drawEnd(state, best, won) {
    overlay(0.62);
    if (won) {
      text('EMBERLINE HELD', FIELD.width / 2, 180, 52, '#2dd4bf', 'center', 800);
      text('The Maw is down. Ten waves cleared — the line holds.', FIELD.width / 2, 214, 16, '#93a3bd', 'center');
    } else {
      text('SIGNAL LOST', FIELD.width / 2, 180, 52, '#f87171', 'center', 800);
      text('The ember line breaks here — but the ship can fly again.', FIELD.width / 2, 214, 16, '#93a3bd', 'center');
    }
    text(`SCORE ${state.score.toLocaleString('en-US')}   ·   BEST ${Math.max(best, state.score).toLocaleString('en-US')}`, FIELD.width / 2, 262, 18, '#e6ecf5', 'center', 700);
    text(`WAVE ${Math.max(1, state.wave)} / 10   ·   ${state.kills} KILLS   ·   ${fmtTime(state.time)}`, FIELD.width / 2, 292, 14, '#93a3bd', 'center');
    text('Press Enter or R to fly again', FIELD.width / 2, 340, 16, '#ffd166', 'center', 700);
  }

  return {
    /** Paint `state` with `screen` over it. `best` is the stored best score. */
    draw(state, screen, best) {
      ctx.save();
      const time = state.time;
      const dx = Math.sin(time * 127.1) * state.shake * 0.5;
      const dy = Math.cos(time * 113.7) * state.shake * 0.5;
      ctx.translate(dx, dy);
      background(time);
      for (const s of state.shards) drawShard(s, time);
      for (const e of state.enemies) drawEnemy(e, time, state.player);
      for (const b of state.bullets) {
        ctx.fillStyle = '#a5f3fc';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, TAU);
        ctx.fill();
      }
      for (const b of state.ebullets) {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, TAU);
        ctx.fill();
      }
      for (const pt of state.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (state.player && screen !== SCREEN_TITLE) drawPlayer(state.player, time);
      for (const f of state.floats) {
        ctx.globalAlpha = Math.max(0, f.life / 0.9);
        text(f.text, f.x, f.y, 13, f.color, 'center', 700);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.45, state.flash * 0.7)})`;
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      }
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_UPGRADE) { drawHud(state, best); drawUpgrade(state); }
      else if (screen === SCREEN_OVER) { drawHud(state, best); drawEnd(state, best, false); }
      else if (screen === SCREEN_WIN) { drawHud(state, best); drawEnd(state, best, true); }
      else if (screen === SCREEN_PAUSED) {
        drawHud(state, best);
        overlay(0.55);
        text('PAUSED', FIELD.width / 2, 260, 44, '#e6ecf5', 'center', 800);
        text('P or Esc to resume', FIELD.width / 2, 296, 15, '#93a3bd', 'center');
      } else {
        drawHud(state, best);
      }
    },
  };
}
