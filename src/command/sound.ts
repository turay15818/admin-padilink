/**
 * The siren, made in the browser — no file to ship, nothing to fetch.
 *
 * It is synthesised, not beeped: a critical report plays a real emergency wail (a continuous
 * sweep from about 650 Hz up to 1.4 kHz and back, rich in harmonics and driven hard so it carries
 * across a room); an urgent one plays a two-tone hi-lo; a new one plays a soft two-note chime.
 *
 * Browsers will not make a sound until the person has touched the page, and Safari is the
 * strictest: it also suspends or "interrupts" an audio context on its own, and refuses to resume
 * one outside a click. So two independent paths are kept ready — Web Audio and a plain audio
 * element — both are unlocked on EVERY click, key press or touch (not only the first), and a
 * sound goes through whichever is open. If neither is, `soundState()` says "blocked" and the
 * screen asks for one click, rather than pretending.
 */
type Ctor = typeof AudioContext;
export type SoundKind = 'critical' | 'high' | 'new';
export type SoundState = 'ready' | 'blocked' | 'unsupported';

const RATE = 22050;
let ctx: AudioContext | null = null;
let ctxOpened = false;
let elementsOpened = false;
const samples = new Map<SoundKind, Float32Array>();
const elements = new Map<SoundKind, HTMLAudioElement>();
let playing: AudioBufferSourceNode | null = null;
let playingElement: HTMLAudioElement | null = null;

const make = (): AudioContext | null => {
  if (ctx) return ctx;
  const C: Ctor | undefined = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
  if (!C) return null;
  try { ctx = new C(); } catch { ctx = null; }
  return ctx;
};

/* ---------------------------------------------------------------- the sounds themselves */

/** A harmonic-rich voice, driven into a soft clip so it is loud without harsh digital edges. */
function voice(phase: number): number {
  const x = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.33 * Math.sin(3 * phase) + 0.22 * Math.sin(4 * phase) + 0.12 * Math.sin(5 * phase);
  return Math.tanh(1.4 * x) * 0.92;
}

function build(kind: SoundKind): Float32Array {
  const hit = samples.get(kind);
  if (hit) return hit;
  let out: Float32Array;
  if (kind === 'critical') {
    // Six seconds of wail: up over 1.5 s, down over 1.5 s, twice. A smooth sweep, because a real siren glides.
    const n = RATE * 6;
    out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const cycle = (t % 3) / 3; // 0..1 across one rise and fall
      const sweep = 0.5 - 0.5 * Math.cos(2 * Math.PI * cycle);
      const f = 650 + 750 * sweep;
      phase += (2 * Math.PI * f) / RATE;
      const edge = Math.min(1, t / 0.04, (6 - t) / 0.08);
      out[i] = voice(phase) * edge;
    }
  } else if (kind === 'high') {
    // hi-lo, three times: 960 Hz then 770 Hz, a European two-tone
    const beat = 0.42;
    const n = Math.round(RATE * beat * 6);
    out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const step = Math.floor(t / beat);
      const within = t - step * beat;
      const f = step % 2 === 0 ? 960 : 770;
      phase += (2 * Math.PI * f) / RATE;
      const edge = Math.min(1, within / 0.02, (beat - within) / 0.03);
      out[i] = voice(phase) * 0.85 * Math.max(0, edge);
    }
  } else {
    // two soft notes, a fifth apart, each fading out
    const n = Math.round(RATE * 1.1);
    out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const a = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 4.2);
      const t2 = t - 0.22;
      const b = t2 > 0 ? Math.sin(2 * Math.PI * 1320 * t2) * Math.exp(-t2 * 4.2) : 0;
      out[i] = (a + b) * 0.5;
    }
  }
  samples.set(kind, out);
  return out;
}

/** 16-bit mono PCM in a WAV container, for the audio element. */
function wavUrl(kind: SoundKind): string {
  const pcm = build(kind);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function element(kind: SoundKind): HTMLAudioElement | null {
  const have = elements.get(kind);
  if (have) return have;
  if (typeof Audio === 'undefined') return null;
  try {
    const a = new Audio(wavUrl(kind));
    a.preload = 'auto';
    elements.set(kind, a);
    return a;
  } catch { return null; }
}

/* ---------------------------------------------------------------- unlocking */

/** Open both paths. Must run inside a click, key press or touch. Safe to run again and again. */
function open() {
  const c = make();
  if (c) {
    const done = () => { ctxOpened = c.state === 'running'; };
    if (c.state !== 'running') void c.resume().then(done).catch(() => undefined);
    done();
    try { // the old iOS/Safari trick: a silent one-sample buffer, started inside the gesture, settles the context
      const b = c.createBuffer(1, 1, RATE); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    } catch { /* fine */ }
  }
  if (!elementsOpened) {
    // an element that has been played once from a gesture may be played again later by the page; do it silently now
    const a = element('critical');
    if (a) {
      a.volume = 0;
      void a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; elementsOpened = true; }).catch(() => { a.volume = 1; });
    }
  }
}

/** Call once at start: every click, key press and touch re-opens sound for the session. */
export function unlockOnGesture() {
  if (typeof window === 'undefined') return () => undefined;
  const events: (keyof WindowEventMap)[] = ['pointerdown', 'click', 'keydown', 'touchstart', 'touchend'];
  events.forEach(e => window.addEventListener(e, open, { passive: true, capture: true }));
  // Safari interrupts a context when the tab is hidden; it can only be woken by a gesture, so note it was lost.
  const lost = () => { if (ctx && ctx.state !== 'running') ctxOpened = false; };
  document.addEventListener('visibilitychange', lost);
  return () => { events.forEach(e => window.removeEventListener(e, open, { capture: true } as EventListenerOptions)); document.removeEventListener('visibilitychange', lost); };
}

/** Open sound from inside a click handler of our own (the "arm" button and the test buttons). */
export function openNow() { open(); }

export function soundState(): SoundState {
  const c = ctx ?? make();
  if (!c && typeof Audio === 'undefined') return 'unsupported';
  if (c && c.state === 'running') { ctxOpened = true; return 'ready'; }
  if (c && c.state !== 'running') ctxOpened = false;
  return ctxOpened || elementsOpened ? 'ready' : 'blocked';
}

/* ---------------------------------------------------------------- playing */

function stopPrevious() {
  try { playing?.stop(); } catch { /* already over */ }
  playing = null;
  if (playingElement) { try { playingElement.pause(); playingElement.currentTime = 0; } catch { /* fine */ } playingElement = null; }
}

/** Play a sound. Returns true when one of the two paths took it. */
export function play(kind: SoundKind): boolean {
  stopPrevious();
  const c = ctx ?? make();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
  if (c && c.state === 'running') {
    try {
      const pcm = build(kind);
      const buffer = c.createBuffer(1, pcm.length, RATE);
      buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = 1;
      src.buffer = buffer;
      src.connect(gain).connect(c.destination);
      src.onended = () => { if (playing === src) playing = null; };
      src.start();
      playing = src;
      return true;
    } catch { /* fall through to the element */ }
  }
  const a = element(kind);
  if (a && (elementsOpened || !c)) {
    try {
      a.currentTime = 0; a.volume = 1;
      const p = a.play();
      if (p) void p.catch(() => { elementsOpened = false; });
      playingElement = a;
      return true;
    } catch { return false; }
  }
  return false;
}

/** How long a sound lasts, in milliseconds — the scheduler uses it so a siren never overlaps itself. */
export const lengthOf = (kind: SoundKind): number => (kind === 'critical' ? 6000 : kind === 'high' ? 2520 : 1100);
