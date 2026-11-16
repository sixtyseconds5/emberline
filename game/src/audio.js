// Sound, all synthesized with WebAudio: short effects for every action and
// a quiet bass loop under play. Nothing is loaded; the first user gesture
// unlocks the audio context, and M or the mute button silences it.

/** Build the sound player; call `unlock()` from a user gesture. */
export function createAudio() {
  let context = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  // A minor-key bass walk, one note per beat, looped quietly.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const BEAT = 0.42;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, gain, lowpass) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(now);
  }

  function startMusic() {
    if (musicTimer || muted) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      tone(BASS[musicStep % BASS.length], BEAT * 0.9, 'triangle', 0.05);
      if (musicStep % 4 === 2) tone(BASS[musicStep % BASS.length] * 2, BEAT * 0.5, 'sine', 0.025);
      musicStep += 1;
    }, BEAT * 1000);
  }

  return {
    /** Unlock audio from a gesture and start the music loop. */
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      startMusic();
    },
    toggleMute() {
      muted = !muted;
      if (!muted) startMusic();
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone(720, 0.07, 'square', 0.045, 320);
    },
    hit() {
      noise(0.08, 0.09, 2400);
    },
    explode(big) {
      noise(big ? 0.5 : 0.28, big ? 0.22 : 0.13, big ? 900 : 1400);
      tone(big ? 90 : 120, big ? 0.4 : 0.2, 'sawtooth', 0.1, 40);
    },
    pickup(combo) {
      const step = Math.min(combo, 12);
      tone(520 * Math.pow(1.059, step), 0.12, 'sine', 0.07, 780 * Math.pow(1.059, step));
    },
    hurt() {
      tone(160, 0.25, 'sawtooth', 0.12, 60);
      noise(0.15, 0.1, 800);
    },
    dash() {
      noise(0.12, 0.06, 3200);
    },
    overdrive() {
      tone(440, 0.12, 'sine', 0.08, 880);
      tone(660, 0.18, 'sine', 0.06, 990);
    },
    wave() {
      tone(196, 0.35, 'triangle', 0.09, 392);
      tone(294, 0.3, 'triangle', 0.06, 392);
    },
    upgrade() {
      [523, 659, 784].forEach((f, i) => window.setTimeout(() => tone(f, 0.16, 'sine', 0.07), i * 70));
    },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'triangle', 0.08), i * 110));
    },
    defeat() {
      [392, 330, 262, 196].forEach((f, i) => window.setTimeout(() => tone(f, 0.35, 'sawtooth', 0.06), i * 160));
    },
  };
}
