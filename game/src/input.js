// Keyboard and mouse (and basic touch) input, read once a frame as a plain
// state object: which way the ship should move, where it aims, and the
// one-shot actions pressed since the last frame.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_OVERDRIVE = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

/** Track input on `canvas` (keyboard on the window) and return its reader. */
export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseSeen = false;
  let touchX = 0;
  let touchY = 0;
  let touchActive = false;

  function keyName(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  window.addEventListener('keydown', (event) => {
    const key = keyName(event);
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    if (key === ' ' || key === 'enter') actions |= ACTION_CONFIRM;
    if (key === 'p' || key === 'escape') actions |= ACTION_PAUSE;
    if (key === 'shift') actions |= ACTION_DASH;
    if (key === 'e') actions |= ACTION_OVERDRIVE;
    if (key === 'm') actions |= ACTION_MUTE;
    if (key === 'r') actions |= ACTION_RESTART;
    if (key === '1' || key === '2' || key === '3') actions |= ACTION_CONFIRM << (Number(key) - 1 + 6);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(keyName(event));
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  }

  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPoint(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseSeen = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = canvasPoint(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseSeen = true;
    mouseDown = true;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const point = canvasPoint(event.touches[0].clientX, event.touches[0].clientY);
    touchX = point.x;
    touchY = point.y;
    touchActive = true;
    actions |= ACTION_CONFIRM;
  }, { passive: false });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const point = canvasPoint(event.touches[0].clientX, event.touches[0].clientY);
    touchX = point.x;
    touchY = point.y;
  }, { passive: false });
  canvas.addEventListener('touchend', (event) => {
    event.preventDefault();
    touchActive = false;
  }, { passive: false });

  // Upgrade picks 1/2/3 ride on bits above ACTION_RESTART; takeActions()
  // leaves them alone so takePick() can read them on its own time.
  const PICK_BASE = ACTION_CONFIRM << 6;
  const PICK_MASK = PICK_BASE | (PICK_BASE << 1) | (PICK_BASE << 2);

  return {
    /** Move direction from keys, as {x, y} of length 0 or 1. */
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      if (x === 0 && y === 0 && touchActive) {
        // Touch drags the ship toward the finger.
        return { x: 0, y: 0, touch: { x: touchX, y: touchY } };
      }
      if (x !== 0 && y !== 0) {
        const len = Math.hypot(x, y);
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    /** Whether the fire button (mouse, Space or touch) is held. */
    firing() {
      return mouseDown || keys.has(' ') || touchActive;
    },
    /** Aim point in canvas pixels, or null when the mouse never moved. */
    aim() {
      return mouseSeen ? { x: mouseX, y: mouseY } : null;
    },
    /** True while touch is steering the ship. */
    touchActive() {
      return touchActive;
    },
    /** The upgrade pick (1, 2 or 3) pressed since the last call, else 0. */
    takePick() {
      for (let n = 1; n <= 3; n += 1) {
        if (actions & (PICK_BASE << (n - 1))) {
          actions &= ~(PICK_BASE << (n - 1));
          return n;
        }
      }
      return 0;
    },
    /** One-shot actions pressed since the last call, then cleared (picks kept). */
    takeActions() {
      const taken = actions & ~PICK_MASK;
      actions &= PICK_MASK;
      return taken;
    },
  };
}
