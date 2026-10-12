// Small generated 8-bit cues (C-060): Web Audio only, no sound files. Off by default. The AudioContext is made lazily on the first play
// after sound is turned on AND the person has tapped or pressed a key (browsers block audio before that). Every call is a no-op when
// sound is off, before a gesture, or when the browser has no AudioContext. The scenes share the one `sound`.

// A cue: a blip of `dur` seconds per note; `steps` multiply the pitch of each next note (a short tune).
const CUES = {
  tap: { type: 'square', freq: 660, dur: 0.05, gain: 0.06, steps: [1] },
  step: { type: 'triangle', freq: 523, dur: 0.09, gain: 0.12, steps: [1, 1.5] },
  celebration: { type: 'square', freq: 523, dur: 0.1, gain: 0.07, steps: [1, 1.25, 1.5, 2] },
  repair: { type: 'triangle', freq: 330, dur: 0.08, gain: 0.12, steps: [1, 1, 1.5] },
};
const PITCH_SPREAD = 0.04; // each play is up to 4 percent higher or lower
const GESTURES = ['pointerdown', 'pointerup', 'keydown'];

export const CUE_NAMES = Object.keys(CUES);

// The first note of a cue, with a slight random pitch from rng() in [0, 1). Null for an unknown name.
export function cueSpec(name, rng = Math.random) {
  if (!Object.hasOwn(CUES, name)) return null;
  const { type, freq, dur, gain } = CUES[name];
  return { type, freq: Math.round(freq * (1 + (rng() * 2 - 1) * PITCH_SPREAD)), dur, gain };
}

// env: the page (window); a test passes a fake. Returns { play(name), setEnabled(bool) }.
export function createSound(env = globalThis) {
  let enabled = false;
  let touched = false; // a user gesture has happened
  let ctx = null;
  const wake = () => { if (ctx?.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {}); };
  const gesture = () => { touched = true; wake(); };
  for (const type of GESTURES) env.addEventListener?.(type, gesture, true);

  return {
    setEnabled(on) { enabled = on === true; },
    play(name) {
      const cue = enabled && touched ? cueSpec(name) : null;
      if (!cue) return;
      try {
        const Context = env.AudioContext || env.webkitAudioContext;
        if (!ctx && !Context) return;
        ctx ??= new Context();
        wake();
        const t0 = ctx.currentTime;
        CUES[name].steps.forEach((step, i) => {
          const t = t0 + i * cue.dur;
          const osc = ctx.createOscillator();
          const amp = ctx.createGain();
          osc.type = cue.type;
          osc.frequency.value = cue.freq * step;
          amp.gain.setValueAtTime(cue.gain, t);
          amp.gain.exponentialRampToValueAtTime(0.0001, t + cue.dur);
          osc.connect(amp);
          amp.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + cue.dur);
        });
      } catch { /* no audio is better than a broken game */ }
    },
  };
}

export const sound = createSound();
