// Voice chat client: record -> transcribe -> GPT -> speak, with optional hands-free looping.
const $ = (id) => document.getElementById(id);
const log = $("log"), statusEl = $("status"), micBtn = $("mic"), stopBtn = $("stop");
const voiceSel = $("voice"), handsfree = $("handsfree");

const SILENCE_MS = 1300;      // stop after this much quiet (hands-free)
const SPEECH_LEVEL = 0.02;    // RMS threshold that counts as "talking"
const MAX_RECORD_MS = 60000;

let messages = [];
let state = "idle";           // idle | listening | thinking | speaking
let stream, recorder, chunks = [], audioCtx, analyser, rafId, currentAudio;

voiceSel.value = localStorage.getItem("voice") || "alloy";
voiceSel.onchange = () => localStorage.setItem("voice", voiceSel.value);
handsfree.checked = localStorage.getItem("handsfree") === "1";
handsfree.onchange = () => localStorage.setItem("handsfree", handsfree.checked ? "1" : "0");

micBtn.onclick = () => {
  if (state === "idle") startListening();
  else if (state === "listening") stopListening();
  else if (state === "speaking") { stopSpeaking(); startListening(); } // interrupt and talk
};
stopBtn.onclick = () => stopSpeaking();
$("clear").onclick = () => { stopSpeaking(); messages = []; log.innerHTML = '<p class="empty">New chat. Tap the microphone and start talking.</p>'; };
$("textForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("textInput").value.trim();
  if (!text || state === "thinking") return;
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
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return showError("Microphone access was blocked. Allow it in your browser settings.");
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
    const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    if (!data.text) { setState("idle", "Didn't catch that — try again."); return maybeRelisten(); }
    await handleUserText(data.text);
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
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    pending.className = "msg assistant";
    pending.textContent = data.reply;
    messages.push({ role: "assistant", content: data.reply });
    await speak(data.reply);
  } catch (err) {
    pending.remove();
    messages.pop();
    showError(err.message);
  }
}

async function speak(text) {
  const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: voiceSel.value }) });
  if (!r.ok) throw new Error((await r.json()).error);
  const url = URL.createObjectURL(await r.blob());
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
