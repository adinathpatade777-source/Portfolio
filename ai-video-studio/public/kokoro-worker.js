// Kokoro text-to-speech in a background worker (runs fully in the browser, no account or key).
// Model: hexgrad/Kokoro-82M (Apache-2.0) via kokoro-js (Apache-2.0); downloaded once from Hugging Face, then cached.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
let ttsPromise = null;

function load() {
  ttsPromise ??= KokoroTTS.from_pretrained(MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        self.postMessage({ type: "progress", stage: "download", file: p.file, loaded: p.loaded, total: p.total });
      }
    },
  }).catch((err) => { ttsPromise = null; throw err; });
  return ttsPromise;
}

// Kokoro handles about a paragraph at a time, so speak sentence by sentence and join them.
function chunks(text) {
  const parts = [];
  for (const line of text.split(/\n+/)) {
    const sentences = line.match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > 300 && cur) { parts.push(cur.trim()); cur = ""; }
      cur += s;
    }
    if (cur.trim()) parts.push(cur.trim());
  }
  return parts;
}

self.onmessage = async (e) => {
  const { id, text, voice, speed } = e.data;
  try {
    const tts = await load();
    const list = chunks(text);
    const pieces = [];
    let rate = 24000;
    for (let i = 0; i < list.length; i++) {
      self.postMessage({ type: "progress", stage: "speak", done: i, total: list.length });
      const audio = await tts.generate(list[i], { voice, speed });
      rate = audio.sampling_rate;
      pieces.push(audio.audio, new Float32Array(Math.round(rate * 0.22))); // short pause between sentences
    }
    const total = pieces.reduce((n, p) => n + p.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const p of pieces) { out.set(p, o); o += p.length; }
    self.postMessage({ id, type: "done", audio: out, rate }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, type: "error", message: err?.message || String(err) });
  }
};
