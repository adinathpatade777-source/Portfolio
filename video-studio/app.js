import { Client, handle_file } from "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.2/dist/browser.js";

// Free, public Hugging Face Space running the open LTX-Video (distilled) model.
const SPACE = "https://lightricks-ltx-video-distilled.hf.space";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const STYLES = {
  "Cinematic": "cinematic film still, anamorphic lens, 35mm film grain, dramatic lighting",
  "Documentary": "documentary footage, natural light, handheld camera, realistic",
  "Drone": "aerial drone shot, smooth slow flyover, wide establishing view",
  "Golden hour": "golden hour sunlight, warm backlight, long soft shadows",
  "Macro": "macro close-up, extreme detail, shallow depth of field, bokeh",
  "Night city": "night, neon reflections, wet streets, moody city lights",
  "Slow motion": "slow motion, 120fps, smooth fluid motion",
  "Studio": "professional studio lighting, softbox, clean background, product shot",
};
const REALISM = "photorealistic, ultra-detailed, natural skin and textures, realistic physics, shot on a professional cinema camera, 4k";
const IDEAS = [
  "A barista pours latte art in a cozy café, steam rising, morning light through the window",
  "Ocean waves crash against black volcanic rocks at sunset, spray glowing in the light",
  "A red vintage car drives along a winding coastal road, camera tracking alongside",
  "Close-up of a woman's face as she smiles and turns toward the camera, wind in her hair",
  "A hummingbird hovers by a pink flower, wings blurring, garden background softly out of focus",
  "Snow falls gently on a quiet mountain cabin at dusk, warm light in the windows",
  "A chef flips vegetables in a flaming wok in a busy restaurant kitchen",
  "Time-lapse of clouds rolling over a green valley with sunlight breaking through",
];

let mode = "text";
let imageFile = null;
let lastBlob = null, lastPrompt = "";
let client = null, clientToken = null;
const picked = new Set();

// ---------- UI wiring ----------
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  mode = b.dataset.mode;
  $("imageCard").hidden = mode !== "image";
  $("prompt").placeholder = mode === "image"
    ? "Describe the motion: the person slowly turns and smiles, hair moving in the breeze"
    : "A golden retriever running through a sunlit wheat field, slow motion, shallow depth of field";
});

for (const name of Object.keys(STYLES)) {
  const c = document.createElement("button");
  c.className = "chip"; c.textContent = name;
  c.onclick = () => { picked.has(name) ? picked.delete(name) : picked.add(name); c.classList.toggle("on"); };
  $("styles").append(c);
}

document.querySelectorAll("#aspect button").forEach((b) => b.onclick = () =>
  document.querySelectorAll("#aspect button").forEach((x) => x.classList.toggle("on", x === b)));

const bindRange = (id, out, fmt) => { const f = () => $(out).textContent = fmt($(id).value); $(id).oninput = f; f(); };
bindRange("dur", "durVal", (v) => v + "s");
bindRange("cfg", "cfgVal", (v) => v);
$("prompt").oninput = () => $("count").textContent = $("prompt").value.length + " chars";
$("surprise").onclick = () => { $("prompt").value = IDEAS[Math.floor(Math.random() * IDEAS.length)]; $("prompt").oninput(); };

$("token").value = store.get("hf_token", "");
$("token").onchange = () => store.set("hf_token", $("token").value.trim());

$("file").onchange = () => {
  const f = $("file").files[0]; if (!f) return;
  imageFile = f;
  $("preview").src = URL.createObjectURL(f); $("preview").hidden = false; $("dropText").hidden = true;
  // Match the output format to the photo's orientation.
  const img = new Image();
  img.onload = () => {
    const r = img.width / img.height;
    const idx = r < 0.85 ? 0 : r > 1.2 ? 2 : 1;
    document.querySelectorAll("#aspect button")[idx].click();
  };
  img.src = $("preview").src;
};

// ---------- Generation ----------
function buildPrompt() {
  const parts = [$("prompt").value.trim()];
  for (const s of picked) parts.push(STYLES[s]);
  if ($("realism").checked) parts.push(REALISM);
  return parts.filter(Boolean).join(", ");
}

async function getClient() {
  const token = $("token").value.trim() || null;
  if (!client || clientToken !== token) {
    const opts = { events: ["data", "status"] };
    if (token) { opts.token = token; opts.hf_token = token; }
    client = await Client.connect(SPACE, opts);
    clientToken = token;
  }
  return client;
}

let timer = null;
function setStatus(text, { pct = null, error = false } = {}) {
  $("status").classList.add("show");
  $("statusText").textContent = text;
  $("statusText").classList.toggle("err", error);
  $("bar").classList.toggle("indet", pct === null && !error);
  $("bar").querySelector("span").style.width = (pct ?? 0) + "%";
  $("bar").hidden = error;
}

function friendlyError(e) {
  const msg = String(e?.message || e || "");
  if (/quota|ZeroGPU|exceeded/i.test(msg))
    return "Free GPU quota reached for now. Wait a bit and retry, or add a free Hugging Face token under Advanced for more.";
  if (/queue.*full|too many/i.test(msg)) return "The free server is busy. Please try again in a minute.";
  if (/fetch|network/i.test(msg)) return "Network problem — check your connection and try again.";
  return "Generation failed: " + (msg || "unknown error") + ". Try a shorter clip or retry.";
}

async function generate() {
  const userPrompt = $("prompt").value.trim();
  if (!userPrompt) { $("prompt").focus(); return setStatus("Write a short description first.", { error: true }); }
  if (mode === "image" && !imageFile) return setStatus("Pick a start photo first.", { error: true });

  const a = document.querySelector("#aspect button.on");
  const prompt = buildPrompt();
  const dur = parseFloat($("dur").value);
  const est = Math.round(25 + dur * 12 * ($("hd").checked ? 1.6 : 1));

  $("go").disabled = true; $("go").textContent = "Generating…";
  const t0 = Date.now();
  clearInterval(timer);
  timer = setInterval(() => {
    const s = Math.round((Date.now() - t0) / 1000);
    $("elapsed").textContent = `${s}s elapsed · usually ~${est}s`;
  }, 500);
  setStatus("Connecting to free GPU…");

  try {
    const c = await getClient();
    const endpoint = mode === "image" ? "/image_to_video" : "/text_to_video";
    const job = c.submit(endpoint, {
      prompt,
      negative_prompt: $("neg").value,
      input_image_filepath: mode === "image" ? handle_file(imageFile) : null,
      input_video_filepath: null,
      height_ui: +a.dataset.h,
      width_ui: +a.dataset.w,
      mode: mode === "image" ? "image-to-video" : "text-to-video",
      duration_ui: dur,
      ui_frames_to_use: 9,
      seed_ui: parseInt($("seed").value) || 42,
      randomize_seed: $("rand").checked,
      ui_guidance_scale: parseFloat($("cfg").value),
      improve_texture_flag: $("hd").checked,
    });

    let result = null;
    for await (const ev of job) {
      if (ev.type === "status") {
        if (ev.stage === "error" || /quota exceeded/i.test(ev.title || "")) throw new Error(ev.message || ev.title || "error");
        if (ev.stage === "pending") {
          const pos = ev.position ?? ev.queue_position;
          setStatus(pos > 0 ? `In line · ${pos} ahead of you` : "Starting GPU…");
        } else if (ev.stage === "generating" || ev.stage === "processing") {
          const p = ev.progress_data?.[0];
          const pct = p?.length ? Math.round((p.index / p.length) * 100) : null;
          setStatus(pct !== null ? `Rendering ${pct}%` : "Rendering your video…", { pct });
        }
      } else if (ev.type === "data") {
        result = ev.data; break;
      }
    }
    if (!result) throw new Error("no result returned");

    const v = result[0];
    const url = v?.video?.url || v?.url || (typeof v === "string" ? v : null);
    if (!url) throw new Error("unexpected response");
    if (Array.isArray(result) && result[1] != null) $("seed").value = result[1];

    setStatus("Downloading…", { pct: 100 });
    const blob = await (await fetch(url)).blob();
    showResult(blob, userPrompt);
    await saveToGallery(blob, userPrompt);
    setStatus(`Done in ${Math.round((Date.now() - t0) / 1000)}s ✓`, { pct: 100 });
  } catch (e) {
    console.error(e);
    setStatus(friendlyError(e), { error: true });
  } finally {
    clearInterval(timer);
    $("go").disabled = false; $("go").textContent = "Generate video";
  }
}
$("go").onclick = generate;
$("again").onclick = () => { $("rand").checked = true; generate(); };

function showResult(blob, p) {
  lastBlob = blob; lastPrompt = p;
  $("out").src = URL.createObjectURL(blob);
  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fileName(p) { return "frame-" + (p || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".mp4"; }
function download(blob, p) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = fileName(p);
  document.body.append(a); a.click(); a.remove();
}
async function share(blob, p) {
  const file = new File([blob], fileName(p), { type: "video/mp4" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Made with Frame", text: p }); } catch {}
  } else download(blob, p);
}
$("save").onclick = () => lastBlob && download(lastBlob, lastPrompt);
$("share").onclick = () => lastBlob && share(lastBlob, lastPrompt);

// ---------- On-device gallery (IndexedDB) ----------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("frame", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(modeRW, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("videos", modeRW); const s = t.objectStore("videos");
    const out = fn(s); t.oncomplete = () => res(out.result ?? out); t.onerror = () => rej(t.error);
  });
}
async function saveToGallery(blob, prompt) {
  try {
    await tx("readwrite", (s) => s.add({ blob, prompt, at: Date.now() }));
    const all = await tx("readonly", (s) => s.getAll());
    for (const old of all.slice(0, Math.max(0, all.length - 24))) await tx("readwrite", (s) => s.delete(old.id));
  } catch (e) { console.warn("gallery save failed", e); }
  renderGallery();
}
async function renderGallery() {
  let items = [];
  try { items = (await tx("readonly", (s) => s.getAll())).reverse(); } catch {}
  $("gallery").innerHTML = "";
  $("emptyG").hidden = items.length > 0;
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "item";
    const v = document.createElement("video");
    v.src = URL.createObjectURL(it.blob); v.muted = true; v.playsInline = true; v.preload = "metadata";
    b.append(v);
    b.onclick = () => openSheet(it);
    $("gallery").append(b);
  }
}
let sheetItem = null;
function openSheet(it) {
  sheetItem = it;
  $("sheetVid").src = URL.createObjectURL(it.blob);
  $("sheetPrompt").textContent = it.prompt;
  $("sheet").classList.add("show");
}
function closeSheet() { $("sheet").classList.remove("show"); $("sheetVid").pause(); }
$("sheetClose").onclick = closeSheet;
$("sheet").onclick = (e) => { if (e.target === $("sheet")) closeSheet(); };
$("sheetSave").onclick = () => sheetItem && share(sheetItem.blob, sheetItem.prompt);
$("sheetDel").onclick = async () => {
  if (!sheetItem) return;
  await tx("readwrite", (s) => s.delete(sheetItem.id));
  closeSheet(); renderGallery();
};
renderGallery();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
