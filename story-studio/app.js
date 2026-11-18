// Story Studio – script → ChatGPT images → Kokoro voiceover → animated video / Google Vids pack.
// Everything runs in the browser. No API keys.

const $ = (s) => document.querySelector(s);
const state = { scenes: [], selected: 0, tts: null, ttsDtype: null, playing: null };
const ASPECTS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] };
let audioCtx;
const ctxAudio = () => (audioCtx ||= new AudioContext());

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- Persistence of text settings ----------
const FIELDS = ["script", "style", "characters", "aspect", "voice", "speed", "dtype", "motion", "transition", "subs"];
function saveSettings() {
  try {
    const o = {};
    FIELDS.forEach((id) => (o[id] = $("#" + id).value));
    o.narrations = state.scenes.map((s) => s.text);
    localStorage.setItem("storyStudio", JSON.stringify(o));
  } catch {}
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem("storyStudio") || "null");
    if (!o) return;
    FIELDS.forEach((id) => o[id] != null && ($("#" + id).value = o[id]));
    if (o.narrations?.length) {
      state.scenes = o.narrations.map(newScene);
      renderScenes();
    }
  } catch {}
}

// ---------- Step 1: scenes ----------
function splitScript(text) {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (paras.length > 1) return paras;
  const sentences = (paras[0] || "").match(/[^.!?।]+[.!?।]+["')\]]*|[^.!?।]+$/g) || [];
  const out = [];
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(" ").trim());
  return out.filter(Boolean);
}
function newScene(text) {
  return { text, img: null, imgURL: null, audio: null, audioURL: null, audioSource: null };
}
function buildPrompt(scene, i) {
  const style = $("#style").value.trim();
  const chars = $("#characters").value.trim();
  const aspect = $("#aspect").value;
  return [
    `Create an image for scene ${i + 1} of a story.`,
    `Scene: ${scene.text}`,
    chars && `Characters (keep consistent): ${chars}.`,
    style && `Style: ${style}.`,
    `Aspect ratio ${aspect}${aspect === "16:9" ? " (wide/landscape)" : aspect === "9:16" ? " (tall/portrait)" : " (square)"}.`,
    `No text, letters or watermarks in the image.`,
  ].filter(Boolean).join("\n");
}

$("#buildScenes").onclick = () => {
  const parts = splitScript($("#script").value);
  if (!parts.length) return toast("Write a script first.");
  const old = state.scenes;
  state.scenes = parts.map((t, i) => {
    const s = newScene(t);
    if (old[i]) { s.img = old[i].img; s.imgURL = old[i].imgURL; } // keep collected images
    return s;
  });
  renderScenes();
  saveSettings();
  toast(`${parts.length} scenes created.`);
  $("#s2").scrollIntoView({ behavior: "smooth" });
};

// ---------- Step 2: images ----------
function renderScenes() {
  const box = $("#scenes");
  box.innerHTML = "";
  if (!state.scenes.length) { box.innerHTML = '<p class="empty">Build scenes in step 1 first.</p>'; updateCount(); return; }
  const [w, h] = ASPECTS[$("#aspect").value];
  state.scenes.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "scene" + (i === state.selected ? " selected" : "");
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="drop" style="aspect-ratio:${w}/${h}">
        ${s.imgURL ? `<img src="${s.imgURL}" alt="Scene ${i + 1}"><button class="x" title="Remove">✕</button>` : "Drop / paste / click<br>to add image"}
        <input type="file" accept="image/*" hidden>
      </div>
      <div>
        <h3>Scene ${i + 1} ${s.audio ? `<span class="badge">● VO ${s.audio.duration.toFixed(1)}s</span>` : ""}</h3>
        <textarea class="narr" rows="2"></textarea>
        <div class="tools">
          <button data-a="open">Open in ChatGPT ↗</button>
          <button data-a="copy">Copy prompt</button>
          <label class="btn">Upload own VO<input type="file" accept="audio/*" hidden data-a="audio"></label>
          ${s.audioURL ? `<audio controls src="${s.audioURL}"></audio>` : ""}
        </div>
        <details><summary class="prompt">Show image prompt</summary><pre class="prompt" style="white-space:pre-wrap"></pre></details>
      </div>`;
    el.querySelector(".narr").value = s.text;
    el.querySelector("pre").textContent = buildPrompt(s, i);
    el.querySelector(".narr").oninput = (e) => {
      s.text = e.target.value;
      el.querySelector("pre").textContent = buildPrompt(s, i);
      saveSettings();
    };
    el.addEventListener("focusin", () => select(i));
    el.addEventListener("click", () => select(i));

    const drop = el.querySelector(".drop");
    const fileIn = drop.querySelector("input");
    drop.onclick = (e) => { if (!e.target.classList.contains("x")) fileIn.click(); };
    fileIn.onchange = () => fileIn.files[0] && setImage(i, fileIn.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => {
      e.preventDefault(); drop.classList.remove("over");
      const f = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
      if (f) setImage(i, f);
    };
    const x = drop.querySelector(".x");
    if (x) x.onclick = (e) => { e.stopPropagation(); s.img = null; s.imgURL = null; renderScenes(); };

    el.querySelector('[data-a="open"]').onclick = () => {
      window.open("https://chatgpt.com/?q=" + encodeURIComponent(buildPrompt(s, i)), "_blank", "noopener");
    };
    el.querySelector('[data-a="copy"]').onclick = () => copy(buildPrompt(s, i), "Prompt copied – paste it into ChatGPT.");
    el.querySelector('[data-a="audio"]').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        s.audio = await ctxAudio().decodeAudioData(await f.arrayBuffer());
        s.audioURL = URL.createObjectURL(f);
        s.audioSource = "upload";
        renderScenes();
      } catch { toast("Could not read that audio file."); }
    };
    box.appendChild(el);
  });
  updateCount();
}
function select(i) {
  if (state.selected === i) return;
  state.selected = i;
  document.querySelectorAll(".scene").forEach((el, k) => el.classList.toggle("selected", k === i));
}
function updateCount() {
  const n = state.scenes.filter((s) => s.img).length;
  $("#imgCount").textContent = `${n} / ${state.scenes.length} images`;
}
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
async function setImage(i, file) {
  const s = state.scenes[i];
  if (!s) return;
  const url = URL.createObjectURL(file);
  try {
    s.img = await loadImage(url);
    s.imgURL = url;
    s.imgFile = file;
    renderScenes();
    drawFrameAt(sceneStart(i) + 0.01);
  } catch { toast("That file is not a readable image."); }
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt("Copy this:", text); }
}

$("#copyAll").onclick = () => {
  if (!state.scenes.length) return toast("Build scenes first.");
  const all =
    `I will need ${state.scenes.length} images for a story. Generate them ONE AT A TIME, in order. ` +
    `After each image, wait for me to say "next".\n\n` +
    state.scenes.map((s, i) => `--- IMAGE ${i + 1} ---\n${buildPrompt(s, i)}`).join("\n\n");
  copy(all, "All prompts copied – paste into one ChatGPT chat for consistent characters.");
};
$("#bulk").onchange = async (e) => {
  const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let k = 0;
  for (let i = 0; i < state.scenes.length && k < files.length; i++) if (!state.scenes[i].img) await setImage(i, files[k++]);
  toast(k ? `${k} images placed.` : "No empty scenes to fill.");
  e.target.value = "";
};
document.addEventListener("paste", (e) => {
  if (!state.scenes.length) return;
  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
  if (!item) return;
  e.preventDefault();
  setImage(state.selected, item.getAsFile());
  toast(`Image pasted into scene ${state.selected + 1}.`);
  if (state.selected < state.scenes.length - 1) state.selected++;
});

// ---------- Step 3: Kokoro voiceover ----------
$("#speed").oninput = () => ($("#speedVal").textContent = (+$("#speed").value).toFixed(2) + "×");

async function getTTS() {
  const dtype = $("#dtype").value;
  if (state.tts && state.ttsDtype === dtype) return state.tts;
  $("#voStatus").textContent = "Loading Kokoro voice model (first time only)…";
  const { KokoroTTS } = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm");
  const device = "gpu" in navigator && dtype === "fp32" ? "webgpu" : "wasm";
  state.tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype, device,
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        $("#voBar").style.width = ((p.loaded / p.total) * 100).toFixed(0) + "%";
        $("#voStatus").textContent = `Downloading model… ${((p.loaded / p.total) * 100).toFixed(0)}%`;
      }
    },
  });
  state.ttsDtype = dtype;
  return state.tts;
}
async function speak(text) {
  const tts = await getTTS();
  const out = await tts.generate(text, { voice: $("#voice").value, speed: +$("#speed").value });
  const buf = ctxAudio().createBuffer(1, out.audio.length, out.sampling_rate);
  buf.copyToChannel(out.audio, 0);
  return buf;
}
function playBuffer(buf) {
  const src = ctxAudio().createBufferSource();
  src.buffer = buf; src.connect(ctxAudio().destination); src.start();
}

$("#previewVoice").onclick = async () => {
  const btn = $("#previewVoice"); btn.disabled = true;
  try {
    const buf = await speak(state.scenes[0]?.text || "Hello! This is how your story will sound.");
    $("#voStatus").textContent = "Playing test.";
    playBuffer(buf);
  } catch (err) { console.error(err); $("#voStatus").textContent = "Voice failed: " + err.message; }
  btn.disabled = false;
};
$("#genVO").onclick = async () => {
  if (!state.scenes.length) return toast("Build scenes first.");
  const btn = $("#genVO"); btn.disabled = true;
  try {
    await getTTS();
    for (let i = 0; i < state.scenes.length; i++) {
      const s = state.scenes[i];
      if (s.audioSource === "upload") continue; // keep user recordings
      $("#voStatus").textContent = `Speaking scene ${i + 1} / ${state.scenes.length}…`;
      $("#voBar").style.width = ((i / state.scenes.length) * 100).toFixed(0) + "%";
      s.audio = await speak(s.text);
      s.audioURL = URL.createObjectURL(new Blob([wavBytes(s.audio)], { type: "audio/wav" }));
      s.audioSource = "kokoro";
    }
    $("#voBar").style.width = "100%";
    $("#voStatus").textContent = `Done – total ${totalDuration().toFixed(1)} s of voiceover.`;
    renderScenes();
  } catch (err) { console.error(err); $("#voStatus").textContent = "Voiceover failed: " + err.message; }
  btn.disabled = false;
  saveSettings();
};

// ---------- WAV encoding ----------
function wavBytes(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => [...s].forEach((c, k) => data.setUint8(o + k, c.charCodeAt(0)));
  str(0, "RIFF"); data.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, len * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return data.buffer;
}

// ---------- Timeline ----------
const PAD = 0.5, DEFAULT_DUR = 4, FADE = 0.6;
const sceneDur = (s) => (s.audio ? s.audio.duration + PAD : DEFAULT_DUR);
function sceneStart(i) { let t = 0; for (let k = 0; k < i; k++) t += sceneDur(state.scenes[k]); return t; }
function totalDuration() { return state.scenes.reduce((t, s) => t + sceneDur(s), 0); }
function fullVoiceover() {
  const sr = 24000, total = Math.ceil(totalDuration() * sr) + 1;
  const out = ctxAudio().createBuffer(1, total, sr);
  const ch = out.getChannelData(0);
  state.scenes.forEach((s, i) => {
    if (!s.audio) return;
    const src = resample(s.audio, sr), off = Math.floor((sceneStart(i) + PAD / 2) * sr);
    ch.set(src.subarray(0, Math.max(0, total - off)), off);
  });
  return out;
}
function resample(buf, sr) {
  const data = buf.getChannelData(0);
  if (buf.sampleRate === sr) return data;
  const ratio = buf.sampleRate / sr, out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = data[Math.floor(i * ratio)];
  return out;
}

// ---------- Step 4: rendering ----------
const canvas = $("#canvas"), g = canvas.getContext("2d");
function sizeCanvas() {
  const [w, h] = ASPECTS[$("#aspect").value];
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
const MOTIONS = ["zoomin", "panright", "zoomout", "panleft"];
function motionFor(i) {
  const m = $("#motion").value;
  if (m === "mix") return MOTIONS[i % 4];
  if (m === "pan") return i % 2 ? "panleft" : "panright";
  return m;
}
const ease = (x) => x * x * (3 - 2 * x);
function drawScene(i, p, alpha) {
  const s = state.scenes[i], W = canvas.width, H = canvas.height;
  g.globalAlpha = alpha;
  if (!s?.img) {
    g.fillStyle = "#1a1d27"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#555"; g.font = `${H / 18}px system-ui`; g.textAlign = "center";
    g.fillText(`Scene ${i + 1} – no image yet`, W / 2, H / 2);
  } else {
    const img = s.img, base = Math.max(W / img.width, H / img.height);
    let z = 1, dx = 0; const e = ease(p);
    switch (motionFor(i)) {
      case "zoomin": z = 1 + 0.15 * e; break;
      case "zoomout": z = 1.15 - 0.15 * e; break;
      case "panright": z = 1.12; dx = -0.05 + 0.1 * e; break;
      case "panleft": z = 1.12; dx = 0.05 - 0.1 * e; break;
    }
    const w = img.width * base * z, h = img.height * base * z;
    g.drawImage(img, (W - w) / 2 + dx * W, (H - h) / 2, w, h);
  }
  g.globalAlpha = 1;
}
function drawSubtitle(text) {
  const W = canvas.width, H = canvas.height, fs = Math.round(Math.min(W, H) / 20);
  g.font = `600 ${fs}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const maxW = W * 0.86, words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const shown = lines.slice(-3), lh = fs * 1.3, y0 = H * 0.88 - (shown.length - 1) * lh;
  shown.forEach((l, k) => {
    const y = y0 + k * lh, tw = g.measureText(l).width;
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W / 2 - tw / 2 - fs * 0.4, y - lh / 2, tw + fs * 0.8, lh);
    g.fillStyle = "#fff"; g.fillText(l, W / 2, y);
  });
}
function sceneAt(t) {
  let acc = 0;
  for (let i = 0; i < state.scenes.length; i++) {
    const d = sceneDur(state.scenes[i]);
    if (t < acc + d) return { i, local: t - acc, d };
    acc += d;
  }
  const last = state.scenes.length - 1;
  return { i: last, local: sceneDur(state.scenes[last]), d: sceneDur(state.scenes[last]) };
}
function drawFrameAt(t) {
  sizeCanvas();
  g.fillStyle = "#000"; g.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.scenes.length) return;
  const { i, local, d } = sceneAt(t), tr = $("#transition").value;
  const remaining = d - local, next = i + 1 < state.scenes.length;
  drawScene(i, local / d, 1);
  if (next && remaining < FADE && tr === "fade") {
    const nd = sceneDur(state.scenes[i + 1]);
    drawScene(i + 1, (FADE - remaining) / nd, 1 - remaining / FADE);
  }
  if (tr === "black") {
    const a = Math.max(next && remaining < FADE / 2 ? 1 - remaining / (FADE / 2) : 0, i > 0 && local < FADE / 2 ? 1 - local / (FADE / 2) : 0);
    if (a > 0) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, canvas.width, canvas.height); }
  }
  if ($("#subs").value === "on") drawSubtitle(state.scenes[i].text);
}

function play({ record = false } = {}) {
  if (!state.scenes.length) return toast("Build scenes first.");
  stop();
  const ac = ctxAudio(); ac.resume();
  const total = totalDuration();
  const src = ac.createBufferSource();
  src.buffer = fullVoiceover();
  src.connect(ac.destination);
  let recorder, chunks = [];
  if (record) {
    const dest = ac.createMediaStreamDestination();
    src.connect(dest);
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      download(new Blob(chunks, { type: mime.split(";")[0] }), `story.${ext}`);
      $("#renderStatus").textContent = `Exported story.${ext}`;
    };
    drawFrameAt(0);
    recorder.start(500);
  }
  const t0 = ac.currentTime + 0.1;
  src.start(t0);
  const tick = () => {
    const t = ac.currentTime - t0;
    if (t >= total) { finish(); return; }
    drawFrameAt(Math.max(0, t));
    if (record) $("#renderStatus").textContent = `Recording… ${Math.max(0, t).toFixed(1)} / ${total.toFixed(1)} s (keep this tab visible)`;
    state.playing.raf = requestAnimationFrame(tick);
  };
  const finish = () => {
    cancelAnimationFrame(state.playing?.raf);
    try { src.stop(); } catch {}
    if (recorder && recorder.state !== "inactive") recorder.stop();
    state.playing = null;
  };
  state.playing = { raf: requestAnimationFrame(tick), finish };
}
function stop() {
  state.playing?.finish();
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

$("#play").onclick = () => play();
$("#stop").onclick = () => { stop(); $("#renderStatus").textContent = "Stopped."; };
$("#exportVideo").onclick = () => {
  if (state.scenes.some((s) => !s.img) && !confirm("Some scenes have no image. Export anyway?")) return;
  play({ record: true });
};

// ---------- Google Vids pack ----------
$("#exportVids").onclick = async () => {
  if (!state.scenes.length) return toast("Build scenes first.");
  if (!window.JSZip) return toast("Zip library failed to load – check your connection.");
  $("#renderStatus").textContent = "Building Google Vids pack…";
  const zip = new JSZip(), pad = (i) => String(i + 1).padStart(2, "0");
  const tl = [];
  for (let i = 0; i < state.scenes.length; i++) {
    const s = state.scenes[i];
    if (s.imgFile) {
      const ext = (s.imgFile.name.split(".").pop() || "png").toLowerCase();
      zip.file(`images/scene-${pad(i)}.${ext.length <= 4 ? ext : "png"}`, s.imgFile);
    }
    if (s.audio) zip.file(`voiceover/scene-${pad(i)}.wav`, wavBytes(s.audio));
    tl.push(`Scene ${pad(i)}  start ${sceneStart(i).toFixed(1)}s  duration ${sceneDur(s).toFixed(1)}s  motion: ${motionFor(i)}\n  ${s.text}`);
  }
  if (state.scenes.some((s) => s.audio)) zip.file("voiceover/full-voiceover.wav", wavBytes(fullVoiceover()));
  zip.file("timeline.txt", tl.join("\n\n") + `\n\nTotal: ${totalDuration().toFixed(1)}s\n`);
  zip.file("script.txt", state.scenes.map((s) => s.text).join("\n\n"));
  zip.file("prompts.txt", state.scenes.map((s, i) => `--- Scene ${pad(i)} ---\n${buildPrompt(s, i)}`).join("\n\n"));
  zip.file("HOW-TO-GOOGLE-VIDS.txt",
    "1. Open https://vids.google.com and create a blank video.\n" +
    "2. Upload the files in images/ – one scene per image, in number order.\n" +
    "3. Select each image > Animate (zoom/pan/fade). Set durations from timeline.txt.\n" +
    "4. Upload voiceover/full-voiceover.wav as audio (starts at 0:00), or each scene WAV on its scene.\n" +
    "5. Add captions from script.txt if wanted, then Export / Download.\n");
  download(await zip.generateAsync({ type: "blob" }), "google-vids-pack.zip");
  $("#renderStatus").textContent = "Google Vids pack downloaded.";
};

// ---------- init ----------
["style", "characters", "aspect", "voice", "speed", "dtype", "motion", "transition", "subs", "script"].forEach((id) =>
  $("#" + id).addEventListener("change", () => { saveSettings(); if (id === "aspect" || id === "style" || id === "characters") renderScenes(); drawFrameAt(0); })
);
loadSettings();
drawFrameAt(0);
