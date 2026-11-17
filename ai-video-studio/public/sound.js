// Sound engine: Kokoro voiceover, procedural music beds and sound effects, mixed into one
// soundtrack. Runs entirely in the browser.
//
// The sound-effect and plucked-string recipes are adapted from Lemo-Opuscar's core/audio/sfx.py and
// core/audio/pluck.py (https://github.com/lemomo-ai/lemo-opuscar), MIT License,
// Copyright (c) 2026 Lemomo (LemoLab). Ported from Python/NumPy to JavaScript and simplified.

export const SR = 44100;

// ---------- Kokoro voiceover (runs in a worker, in the browser) ----------
// [id, label]. The browser build of Kokoro speaks English (US and UK accents).
export const VOICES = [
  ["af_heart", "Heart (US, female, warm)"], ["af_bella", "Bella (US, female)"], ["af_nicole", "Nicole (US, female, soft)"],
  ["af_sarah", "Sarah (US, female)"], ["af_sky", "Sky (US, female)"], ["af_nova", "Nova (US, female)"], ["af_alloy", "Alloy (US, female)"],
  ["af_aoede", "Aoede (US, female)"], ["af_jessica", "Jessica (US, female)"], ["af_kore", "Kore (US, female)"], ["af_river", "River (US, female)"],
  ["am_michael", "Michael (US, male)"], ["am_adam", "Adam (US, male)"], ["am_eric", "Eric (US, male)"], ["am_liam", "Liam (US, male)"],
  ["am_onyx", "Onyx (US, male, deep)"], ["am_puck", "Puck (US, male, lively)"], ["am_echo", "Echo (US, male)"], ["am_fenrir", "Fenrir (US, male)"],
  ["bf_emma", "Emma (UK, female)"], ["bf_isabella", "Isabella (UK, female)"], ["bf_alice", "Alice (UK, female)"], ["bf_lily", "Lily (UK, female)"],
  ["bm_george", "George (UK, male)"], ["bm_lewis", "Lewis (UK, male)"], ["bm_daniel", "Daniel (UK, male)"], ["bm_fable", "Fable (UK, male)"],
];

let worker = null;
let jobId = 0;
// onProgress receives { stage: "download", loaded, total } or { stage: "speak", done, total }.
export function generateVoice({ text, voice = "af_heart", speed = 1, onProgress = () => {} }) {
  if (!text.trim()) return Promise.reject(new Error("Write the narration first."));
  worker ??= new Worker(new URL("./kokoro-worker.js", import.meta.url), { type: "module" });
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const m = e.data;
      if (m.type === "progress") return onProgress(m);
      if (m.id !== id) return;
      worker.removeEventListener("message", onMsg);
      if (m.type === "done") resolve(encodeWavMono(m.audio, m.rate));
      else reject(new Error(m.message));
    };
    worker.addEventListener("message", onMsg);
    worker.onerror = (e) => { worker.removeEventListener("message", onMsg); worker = null; reject(new Error(e.message || "The voice engine failed to start.")); };
    worker.postMessage({ id, text, voice, speed });
  });
}

// ---------- DSP helpers ----------
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rand(); return (s - 3) / 1.2; };
const len = (d) => Math.round(d * SR);
const noise = (d) => Float32Array.from({ length: len(d) }, gauss);
const envExp = (i, tau) => Math.exp(-i / SR / tau);
function normalize(x, peak = 1) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}
// RBJ biquad, filtered in place; `freqAt(i)` may vary over time (recomputed every 128 samples).
function biquad(x, type, freqAt, q = 0.707) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  const coeffs = (f) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let B0, B1, B2;
    if (type === "lp") { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; }
    else if (type === "hp") { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; }
    else { B0 = al; B1 = 0; B2 = -al; }
    const A0 = 1 + al;
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * c) / A0; a2 = (1 - al) / A0;
  };
  for (let i = 0; i < x.length; i++) {
    if (i % 128 === 0) coeffs(typeof freqAt === "function" ? freqAt(i) : freqAt);
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
const sine = (f, i, ph = 0) => Math.sin(2 * Math.PI * f * (i / SR) + ph);

// ---------- sound effects (after Lemo-Opuscar sfx.py) ----------
export const SFX = {
  whoosh(d = 0.4) {
    const n = noise(d);
    biquad(n, "bp", (i) => 600 + 2600 * Math.sin((Math.PI * i) / n.length), 1.2);
    for (let i = 0; i < n.length; i++) n[i] *= Math.sin((Math.PI * i) / n.length) ** 2;
    return normalize(n, 0.7);
  },
  pop() {
    const d = 0.18, out = new Float32Array(len(d));
    let ph = 0;
    for (let i = 0; i < out.length; i++) { ph += (2 * Math.PI * (500 + 1400 * (i / out.length))) / SR; out[i] = Math.sin(ph) * envExp(i, 0.05); }
    return normalize(out, 0.6);
  },
  click(pitch = 1) {
    const d = 0.06, tr = biquad(noise(d), "hp", 2500), out = new Float32Array(tr.length);
    const parts = [[2900, 0.6, 0.012], [4600, 0.4, 0.008], [1500, 0.35, 0.018]];
    for (let i = 0; i < out.length; i++) {
      let r = 0;
      for (const [f, a, tau] of parts) r += a * sine(f * pitch, i, f) * envExp(i, tau);
      out[i] = tr[i] * envExp(i, 0.0015) * 0.8 + r + sine(190 * pitch, i) * envExp(i, 0.01) * 0.5;
    }
    return normalize(out, 0.5);
  },
  ding() {
    const d = 1.6, out = new Float32Array(len(d));
    const parts = [[1318, 1, 0.6], [2637, 0.5, 0.35], [3951, 0.3, 0.2], [1976, 0.25, 0.5], [5274, 0.15, 0.1]];
    for (let i = 0; i < out.length; i++) { let v = 0; for (const [f, a, tau] of parts) v += a * sine(f, i) * envExp(i, tau); out[i] = v; }
    return normalize(out, 0.45);
  },
  thump(f = 70) {
    const d = 0.35, n = biquad(noise(d), "lp", 300), out = new Float32Array(n.length);
    for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = Math.sin(2 * Math.PI * f * t * (1 - 0.3 * t)) * envExp(i, 0.07) + n[i] * envExp(i, 0.02) * 0.5; }
    return normalize(out, 0.8);
  },
  tick() {
    const d = 0.05, n = biquad(noise(d), "hp", 1800), out = new Float32Array(n.length);
    for (let i = 0; i < out.length; i++) out[i] = n[i] * envExp(i, 0.004) + sine(2200, i) * envExp(i, 0.006) * 0.5;
    return normalize(out, 0.35);
  },
};

// ---------- music (Karplus-Strong plucks after Lemo-Opuscar pluck.py, plus simple keys/pads) ----------
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const pluckCache = new Map();
function pluck(midi, dur = 1.6, bright = 0.5) {
  const k = `${midi}|${dur}|${bright}`;
  if (pluckCache.has(k)) return pluckCache.get(k);
  const N = Math.max(2, Math.round(SR / hz(midi)));
  const buf = Float32Array.from({ length: N }, () => rand() * 2 - 1);
  biquad(buf, "lp", 1500 + bright * 6000);
  const out = new Float32Array(len(dur));
  const loss = 0.996 - (midi - 48) * 0.0004;
  for (let i = 0, idx = 0; i < out.length; i++) {
    const nx = (idx + 1) % N;
    out[i] = buf[idx];
    buf[idx] = loss * 0.5 * (buf[idx] + buf[nx]);
    idx = nx;
  }
  for (let i = out.length - 400; i < out.length; i++) if (i >= 0) out[i] *= (out.length - i) / 400;
  normalize(out, 0.5);
  pluckCache.set(k, out);
  return out;
}
function keyNote(midi, dur, soft = 0.6) {
  const out = new Float32Array(len(dur)), f = hz(midi);
  for (let i = 0; i < out.length; i++) {
    const a = Math.min(1, i / (SR * 0.01)) * envExp(i, dur * 0.45);
    out[i] = (sine(f, i) + 0.35 * sine(2 * f, i) + 0.12 * sine(3 * f, i)) * a * soft;
  }
  return out;
}
function padNote(midi, dur) {
  const out = new Float32Array(len(dur)), f = hz(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, a = Math.min(1, t / 0.8) * Math.min(1, (dur - t) / 0.8);
    out[i] = (sine(f * 0.998, i) + sine(f * 1.003, i, 1) + 0.3 * sine(f * 2, i)) * a * 0.25;
  }
  return out;
}
function add(dst, src, at, gain = 1) {
  const s = Math.round(at * SR);
  for (let i = 0; i < src.length && s + i < dst.length; i++) if (s + i >= 0) dst[s + i] += src[i] * gain;
}

// Chords (MIDI) for I–V–vi–IV in C and a calmer vi–IV–I–V.
const PROG = { pop: [[48, 52, 55, 60], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]], calm: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 52, 55, 60], [43, 50, 55, 59]] };

export const MUSIC_MOODS = { none: "No music", upbeat: "Upbeat pluck", calm: "Calm pad", lofi: "Lo-fi beat", tension: "Mystery / tension" };

export function makeMusic(mood, duration) {
  seed = 7;
  const out = new Float32Array(len(duration + 0.5));
  if (mood === "none" || !mood) return out;
  const bpm = { upbeat: 112, calm: 76, lofi: 84, tension: 70 }[mood];
  const beat = 60 / bpm, bar = beat * 4;
  const prog = mood === "calm" || mood === "tension" ? PROG.calm : PROG.pop;
  const kick = SFX.thump(58), hat = SFX.tick();
  for (let b = 0, t = 0; t < duration; b++, t += bar) {
    let chord = prog[b % prog.length];
    if (mood === "tension") chord = chord.map((n, i) => (i === 2 ? n - 1 : n) - 3); // darker, minor-ish colour
    if (mood === "upbeat") {
      add(out, keyNote(chord[0] - 12, bar, 0.5), t, 0.6);
      const arp = [chord[1], chord[2], chord[3], chord[2] + 12, chord[3], chord[2], chord[1] + 12, chord[3]];
      arp.forEach((n, i) => add(out, pluck(n + 12, 1.2, 0.6), t + (i * beat) / 2, 0.55));
      for (let i = 0; i < 4; i++) add(out, hat, t + i * beat + beat / 2, 0.25);
    } else if (mood === "calm") {
      chord.forEach((n) => add(out, padNote(n, bar + 0.8), t, 0.5));
      [0, 1.5, 2.5].forEach((k, i) => add(out, pluck(chord[(i + 1) % 4] + 12, 1.8, 0.3), t + k * beat, 0.35));
    } else if (mood === "lofi") {
      add(out, kick, t, 0.7); add(out, kick, t + 2.5 * beat, 0.6);
      for (let i = 0; i < 8; i++) add(out, hat, t + (i * beat) / 2 + (i % 2 ? 0.03 : 0), i % 2 ? 0.15 : 0.22);
      chord.forEach((n) => add(out, keyNote(n, beat * 2.2, 0.35), t, 0.55));
      chord.forEach((n) => add(out, keyNote(n, beat * 1.8, 0.3), t + 2.5 * beat, 0.45));
    } else if (mood === "tension") {
      chord.slice(0, 3).forEach((n) => add(out, padNote(n - 12, bar + 0.8), t, 0.55));
      add(out, kick, t, 0.5); add(out, kick, t + beat * 0.6, 0.35);
      add(out, pluck(chord[3] + 12, 2, 0.2), t + beat * 2, 0.3);
    }
  }
  if (mood === "lofi") biquad(out, "lp", 3500);
  // fades
  const fi = len(0.6), fo = len(1.5), end = len(duration);
  for (let i = 0; i < out.length; i++) {
    const g = Math.min(1, i / fi) * Math.min(1, Math.max(0, (end - i) / fo));
    out[i] *= g;
  }
  return normalize(out, 0.8);
}

// ---------- mixing ----------
// events: [{ t, type }] where type is a key of SFX
export function mixSoundtrack({ duration, events = [], music = "none", musicVolume = 0.5, sfxVolume = 0.6, voice = null, voiceStart = 0.3, voiceVolume = 1 }) {
  const n = len(duration);
  const mix = new Float32Array(n);
  // voice first, so we can duck the music under it
  const env = new Float32Array(n);
  if (voice) {
    add(mix, voice, voiceStart, voiceVolume);
    const s = Math.round(voiceStart * SR);
    let e = 0;
    for (let i = 0; i < n; i++) {
      const v = i >= s && i - s < voice.length ? Math.abs(voice[i - s]) : 0;
      e = v > e ? e + (v - e) * 0.01 : e * 0.9997;
      env[i] = e;
    }
  }
  if (music !== "none" && musicVolume > 0) {
    const m = makeMusic(music, duration);
    for (let i = 0; i < n; i++) {
      const duck = voice ? 1 - Math.min(0.7, env[i] * 4) : 1;
      mix[i] += m[i] * musicVolume * 0.6 * duck;
    }
  }
  if (sfxVolume > 0) {
    const cache = {};
    for (const ev of events) {
      if (!SFX[ev.type] || ev.t >= duration) continue;
      cache[ev.type] ??= SFX[ev.type]();
      add(mix, cache[ev.type], ev.t, sfxVolume * (ev.gain ?? 1));
    }
  }
  for (let i = 0; i < n; i++) mix[i] = Math.tanh(mix[i] * 1.1) * 0.95; // soft limiter
  return mix;
}

// ---------- WAV ----------
export function encodeWavMono(samples, rate = SR) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return buf;
}

let ctx = null;
export function audioContext() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export async function decodeToMono(wavBytes) {
  const ab = await audioContext().decodeAudioData(wavBytes.slice(0));
  return ab.getChannelData(0).slice();
}

export function toAudioBuffer(samples) {
  const ab = audioContext().createBuffer(1, samples.length, SR);
  ab.copyToChannel(samples, 0);
  return ab;
}
