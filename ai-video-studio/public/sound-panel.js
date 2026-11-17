// Sound panel UI shared by the Animator and the Style Library.
import {
  VOICES, MUSIC_MOODS, generateVoice, decodeToMono, mixSoundtrack, toAudioBuffer, encodeWavMono, audioContext, SR,
} from "./sound.js";

const PANEL_HTML = `
  <h3 class="snd-title">🔊 Sound</h3>
  <label>Voiceover script <span class="hint">(what the voice says)</span>
    <textarea class="snd-text" rows="4" placeholder="Write the narration, or tap Fill from scenes"></textarea>
  </label>
  <div class="row">
    <button class="btn small ghost snd-fill hidden">Fill from scenes</button>
  </div>
  <div class="row">
    <label class="grow">Voice<select class="snd-voice"></select></label>
    <label class="grow">Speed
      <select class="snd-speed">
        <option value="0.85">Slow</option><option value="0.95">Relaxed</option><option value="1" selected>Normal</option>
        <option value="1.1">Fast</option><option value="1.2">Very fast</option>
      </select>
    </label>
  </div>
  <div class="row">
    <button class="btn primary grow snd-gen">🎙 Generate voiceover</button>
  </div>
  <p class="hint">Free voice by Kokoro, made on your phone: no account, no key, no limits. The first time, the voice
    model downloads once (about 90 MB; use Wi-Fi), then it's saved for next time. English voices only.</p>
  <audio class="snd-preview hidden" controls></audio>
  <p class="hint snd-vstatus"></p>
  <label class="toggle snd-fitwrap"><input type="checkbox" class="snd-fit" checked /> Stretch the video to fit the voiceover</label>
  <div class="row">
    <label class="grow">Music<select class="snd-music"></select></label>
    <label class="grow">Music volume<input type="range" class="snd-mvol" min="0" max="100" value="45" /></label>
  </div>
  <div class="row">
    <label class="toggle grow"><input type="checkbox" class="snd-sfx" checked /> Sound effects (whoosh, pop, ding)</label>
    <label class="grow">Effects volume<input type="range" class="snd-svol" min="0" max="100" value="60" /></label>
  </div>
  <div class="row">
    <button class="btn small ghost snd-wav">⬇ Download soundtrack (WAV)</button>
  </div>
  <p class="credit">Voice: <a href="https://github.com/hexgrad/kokoro" target="_blank" rel="noopener">Kokoro</a> (Apache-2.0).
    Music and sound effects are generated in your browser with recipes adapted from
    <a href="https://github.com/lemomo-ai/lemo-opuscar" target="_blank" rel="noopener">Lemo-Opuscar</a> (MIT).</p>
`;

const PANEL_CSS = `
  .snd { display: flex; flex-direction: column; gap: 10px; }
  .snd-title { margin: 0; font-size: 14px; }
  .snd audio { width: 100%; }
  .snd input[type=range] { padding: 0; accent-color: var(--accent); }
  .snd .credit { color: var(--muted); font-size: 11px; margin: 0; }
  .snd .credit a, .snd .hint a { color: var(--accent); }
`;

export function createSoundPanel(container, { getScenes = null, fitOption = true, onChange = () => {} } = {}) {
  if (!document.getElementById("snd-css")) {
    const st = document.createElement("style");
    st.id = "snd-css";
    st.textContent = PANEL_CSS;
    document.head.append(st);
  }
  container.classList.add("card", "snd");
  container.innerHTML = PANEL_HTML;
  const q = (s) => container.querySelector(s);

  // saved preferences
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem("sound-prefs") || "{}"); } catch {}
  const savePrefs = () => {
    try {
      localStorage.setItem("sound-prefs", JSON.stringify({
        voice: q(".snd-voice").value, speed: q(".snd-speed").value,
        music: q(".snd-music").value, mvol: q(".snd-mvol").value, svol: q(".snd-svol").value, sfx: q(".snd-sfx").checked,
      }));
    } catch {}
  };

  for (const [id, label] of VOICES) q(".snd-voice").append(new Option(label, id));
  for (const [k, label] of Object.entries(MUSIC_MOODS)) q(".snd-music").append(new Option(label, k));
  q(".snd-voice").value = VOICES.some(([id]) => id === prefs.voice) ? prefs.voice : "af_heart";
  q(".snd-speed").value = prefs.speed || "1";
  try { localStorage.removeItem("gemini-key"); } catch {} // from the old Google voice option
  q(".snd-music").value = prefs.music || "upbeat";
  q(".snd-mvol").value = prefs.mvol ?? 45;
  q(".snd-svol").value = prefs.svol ?? 60;
  q(".snd-sfx").checked = prefs.sfx ?? true;
  if (!fitOption) q(".snd-fitwrap").classList.add("hidden");
  if (getScenes) q(".snd-fill").classList.remove("hidden");

  let voice = null; // Float32Array at SR
  let voiceWav = null;

  q(".snd-fill").onclick = () => {
    const scenes = getScenes?.() || [];
    const lines = scenes.map((s) => s.narration || [s.headline, s.subtext, s.caption].filter(Boolean).join(". ")).filter(Boolean);
    q(".snd-text").value = lines.join("\n");
  };

  q(".snd-gen").onclick = async () => {
    const btn = q(".snd-gen");
    const status = q(".snd-vstatus");
    savePrefs();
    if (!q(".snd-text").value.trim() && getScenes) q(".snd-fill").onclick();
    btn.disabled = true;
    status.textContent = "Starting the voice engine…";
    try {
      audioContext(); // unlock audio inside the tap
      voiceWav = await generateVoice({
        text: q(".snd-text").value, voice: q(".snd-voice").value, speed: Number(q(".snd-speed").value),
        onProgress: (p) => {
          if (p.stage === "download") status.textContent = `Downloading the voice model (first time only): ${Math.round((p.loaded / p.total) * 100)}% of ${p.file.split("/").pop()}`;
          else status.textContent = `Speaking line ${p.done + 1} of ${p.total}…`;
        },
      });
      voice = await decodeToMono(voiceWav);
      const audio = q(".snd-preview");
      audio.src = URL.createObjectURL(new Blob([voiceWav], { type: "audio/wav" }));
      audio.classList.remove("hidden");
      status.textContent = `Voiceover ready: ${(voice.length / SR).toFixed(1)} seconds.`;
      onChange();
    } catch (err) {
      status.textContent = `Voiceover failed: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  };

  for (const sel of [".snd-music", ".snd-mvol", ".snd-svol", ".snd-sfx", ".snd-voice", ".snd-speed", ".snd-fit"]) {
    q(sel).addEventListener("change", () => { savePrefs(); onChange(); });
  }

  const api = {
    voiceSeconds: () => (voice ? voice.length / SR : 0),
    fitToVoice: () => fitOption && q(".snd-fit").checked && Boolean(voice),
    // Returns mono samples for the whole video.
    mix(duration, events = []) {
      return mixSoundtrack({
        duration,
        events: q(".snd-sfx").checked ? events : [],
        music: q(".snd-music").value,
        musicVolume: q(".snd-mvol").value / 100,
        sfxVolume: q(".snd-sfx").checked ? q(".snd-svol").value / 100 : 0,
        voice,
      });
    },
    hasSound: () => Boolean(voice) || q(".snd-music").value !== "none" || q(".snd-sfx").checked,
    audioBuffer(duration, events) { return toAudioBuffer(api.mix(duration, events)); },
    wav(duration, events) { return encodeWavMono(api.mix(duration, events)); },
    onWavDownload: null,
    setText(text) { if (!q(".snd-text").value.trim()) q(".snd-text").value = text; },
  };
  q(".snd-wav").onclick = () => api.onWavDownload?.();
  return api;
}

// Plays a soundtrack in sync with a preview; returns a stop() function.
export function playBuffer(buffer, offset, extraDestination = null) {
  const ctx = audioContext();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  if (extraDestination) src.connect(extraDestination);
  src.start(0, Math.max(0, Math.min(offset, buffer.duration)));
  return () => { try { src.stop(); } catch {} };
}

export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
