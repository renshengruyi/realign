// Sounds are synthesized, so the page ships no audio files. Browsers only allow
// audio after the person has interacted, so the context starts on first tap.
import { settings } from '../platform/store';

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio);
}

type Kind = 'bell' | 'chime' | 'tick' | 'stamp' | 'night' | 'done';

function tone(c: AudioContext, out: AudioNode, freq: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

export function play(kind: Kind, opts: { force?: boolean } = {}) {
  if (!opts.force && !settings.value.sound) return;
  unlockAudio();
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  const out = c.createGain();
  out.gain.value = 0.6;
  out.connect(c.destination);
  switch (kind) {
    case 'bell': {
      // a small singing bowl: inharmonic partials with long decays
      const base = 196;
      [1, 2.71, 5.18, 8.4].forEach((m, i) => tone(c, out, base * m, t, 5.5 - i, 0.22 / (i + 1)));
      break;
    }
    case 'chime':
      tone(c, out, 659.3, t, 1.2, 0.18);
      tone(c, out, 987.8, t + 0.16, 1.5, 0.14);
      break;
    case 'done':
      tone(c, out, 523.3, t, 0.9, 0.16);
      tone(c, out, 659.3, t + 0.12, 0.9, 0.14);
      tone(c, out, 784, t + 0.24, 1.4, 0.14);
      break;
    case 'tick':
      tone(c, out, 1320, t, 0.08, 0.08, 'triangle');
      break;
    case 'stamp': {
      tone(c, out, 110, t, 0.18, 0.35);
      tone(c, out, 220, t, 0.08, 0.12, 'triangle');
      break;
    }
    case 'night':
      tone(c, out, 261.6, t, 2.4, 0.05);
      break;
  }
}
