// Voice chat client: record -> transcribe -> GPT -> speak, with optional hands-free looping.
const $ = (id) => document.getElementById(id);
const log = $("log"), statusEl = $("status"), micBtn = $("mic"), stopBtn = $("stop");
const voiceSel = $("voice"), handsfree = $("handsfree");

const SILENCE_MS = 1300;      // stop after this much quiet (hands-free)
const SPEECH_LEVEL = 0.02;    // RMS threshold that counts as "talking"
const MAX_RECORD_MS = 60000;

const OPENAI = "https://api.openai.com/v1";
const MODELS = { chat: "gpt-4o-mini", stt: "gpt-4o-mini-transcribe", tts: "gpt-4o-mini-tts" };
const SYSTEM_PROMPT = "You are a friendly voice assistant. Keep answers short and conversational (1-3 sentences) because they will be spoken aloud. Avoid markdown, lists and emojis.";

let messages = [];
let mode = null;              // "server" (Node proxy) or "direct" (browser -> OpenAI with your key)
let state = "idle";           // idle | listening | thinking | speaking
let stream, recorder, chunks = [], audioCtx, analyser, rafId, currentAudio;


const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const getKey = () => store.get("openai_key");

$("keyForm").onsubmit = (e) => {
  e.preventDefault();
  const k = $("keyInput").value.trim();
  if (!k.startsWith("sk-")) return showError("That doesn't look like an OpenAI key (it should start with sk-).");
  store.set("openai_key", k);
  $("keyInput").value = "";
  $("keyForm").hidden = true;
  setState("idle", "Key saved. Tap the mic and start talking.");
};
$("keyBtn").onclick = () => { $("keyForm").hidden = !$("keyForm").hidden; };

voiceSel.value = store.get("voice") || "alloy";
voiceSel.onchange = () => store.set("voice", voiceSel.value);
handsfree.checked = store.get("handsfree") === "1";
handsfree.onchange = () => store.set("handsfree", handsfree.checked ? "1" : "0");

// Use the Node server if it's running; otherwise talk to OpenAI straight from the browser.
(async function detectMode() {
  try {
    if (location.protocol.startsWith("http")) {
      const r = await fetch("api/health", { cache: "no-store" });
      if (r.ok && (await r.json()).ok) { mode = "server"; return; }
    }
  } catch {}
  mode = "direct";
  $("keyBtn").hidden = false;
  if (!getKey()) { $("keyForm").hidden = false; setState("idle", "Add your OpenAI API key to begin"); }
})();

function needKey() {
  if (mode === "direct" && !getKey()) { $("keyForm").hidden = false; $("keyInput").focus(); return true; }
  return false;
}

async function openai(path, init) {
  const r = await fetch(OPENAI + path, { ...init, headers: { Authorization: `Bearer ${getKey()}`, ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = await r.text();
    try { msg = JSON.parse(msg).error.message; } catch {}
    if (r.status === 401) { store.set("openai_key", null); $("keyForm").hidden = false; }
    throw new Error(`OpenAI error (${r.status}): ${msg}`);
  }
  return r;
}

async function apiTranscribe(blob) {
  if (mode === "server") {
    const r = await fetch("api/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.text;
  }
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", blob, `speech.${ext}`);
  form.append("model", MODELS.stt);
  return ((await (await openai("/audio/transcriptions", { method: "POST", body: form })).json()).text || "").trim();
}

async function apiChat(history) {
  if (mode === "server") {
    const r = await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.reply;
  }
  const r = await openai("/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELS.chat, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-20)] }),
  });
  return (await r.json()).choices?.[0]?.message?.content?.trim() || "";
}

async function apiSpeak(text, voice) {
  if (mode === "server") {
    const r = await fetch("api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
    if (!r.ok) throw new Error((await r.json()).error); return r.blob();
  }
  const r = await openai("/audio/speech", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELS.tts, voice, input: text.slice(0, 4000), response_format: "mp3" }),
  });
  return r.blob();
}

micBtn.onclick = () => {
  if (!mode) return;
  if (needKey()) return;
  if (state === "idle") startListening();
  else if (state === "listening") stopListening();
  else if (state === "speaking") { stopSpeaking(); startListening(); } // interrupt and talk
};
stopBtn.onclick = () => stopSpeaking();
$("clear").onclick = () => { stopSpeaking(); messages = []; log.innerHTML = '<p class="empty">New chat. Tap the microphone and start talking.</p>'; };
$("textForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("textInput").value.trim();
  if (!text || state === "thinking" || !mode || needKey()) return;
  $("textInput").value = "";
  stopSpeaking();
  handleUserText(text);
};

function setState(s, msg) {
  state = s;
  micBtn.className = "mic " + ({ listening: "listening", thinking: "busy", speaking: "speaking" }[s] || "");
  micBtn.setAttribute("aria-label", s === "listening" ? "Stop and send" : "Start talking");
  stopBtn.hidden = s !== "speaking";
  statusEl.textContent = msg || { idle: "Ready", listening: "Listening… tap to send", thinking: "Thinking…", speaking: "Speaking… tap mic to interrupt" }[s];
}

function addMsg(role, text) {
  log.querySelector(".empty")?.remove();
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function startListening() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return showError("This browser can't record audio here. Use Chrome, Edge, Firefox or Safari over https:// or http://localhost — or type below.");
  }
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    return showError(err.name === "NotFoundError" ? "No microphone found." : "Microphone access was blocked. Allow it in your browser's site settings, then try again.");
  }
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = onRecordingDone;
  recorder.start();
  setState("listening");
  monitorLevel();
}

function stopListening() {
  cancelAnimationFrame(rafId);
  micBtn.style.removeProperty("--level");
  if (recorder?.state === "recording") recorder.stop();
}

// Drives the mic ring animation and hands-free silence detection.
function monitorLevel() {
  audioCtx ??= new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const started = performance.now();
  let heardSpeech = false, lastLoud = performance.now();

  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    micBtn.style.setProperty("--level", Math.min(rms * 6, 0.5).toFixed(3));
    const now = performance.now();
    if (rms > SPEECH_LEVEL) { heardSpeech = true; lastLoud = now; }
    if (now - started > MAX_RECORD_MS) return stopListening();
    if (handsfree.checked && heardSpeech && now - lastLoud > SILENCE_MS) return stopListening();
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

async function onRecordingDone() {
  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  if (blob.size < 2000) { setState("idle", "Didn't catch that — try again."); return; }
  setState("thinking", "Transcribing…");
  try {
    const text = await apiTranscribe(blob);
    if (!text) { setState("idle", "Didn't catch that — try again."); return maybeRelisten(); }
    await handleUserText(text);
  } catch (err) {
    showError(err.message);
  }
}

async function handleUserText(text) {
  addMsg("user", text);
  messages.push({ role: "user", content: text });
  setState("thinking");
  const pending = addMsg("assistant pending", "…");
  try {
    const reply = await apiChat(messages);
    pending.className = "msg assistant";
    pending.textContent = reply;
    messages.push({ role: "assistant", content: reply });
  } catch (err) {
    pending.remove();
    messages.pop();
    return showError(err.message);
  }
  try { await speak(messages[messages.length - 1].content); }
  catch (err) { showError("Couldn't play the reply: " + err.message); }
}

async function speak(text) {
  const url = URL.createObjectURL(await apiSpeak(text, voiceSel.value));
  currentAudio = new Audio(url);
  setState("speaking");
  currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; setState("idle"); maybeRelisten(); };
  try { await currentAudio.play(); }
  catch { setState("idle", "Autoplay blocked — tap the mic to continue."); }
}

function stopSpeaking() {
  if (!currentAudio) return;
  currentAudio.onended = null;
  currentAudio.pause();
  currentAudio = null;
  setState("idle");
}

function maybeRelisten() {
  if (handsfree.checked && state === "idle") setTimeout(() => state === "idle" && startListening(), 250);
}

function showError(msg) {
  addMsg("error", msg || "Something went wrong.");
  setState("idle", "Error — see above");
}
