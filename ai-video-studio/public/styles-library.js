// Style Library: browse Lemo-Opuscar's film styles and make a code-made film in one with Claude.
// The style guides (CC BY-NC 4.0) are fetched from GitHub at the moment they are used and are
// never stored in this app. Claude's reply (one HTML file) runs in a sandboxed iframe with no
// access to this page, and is recorded to a video file inside that iframe.

const REPO = "https://github.com/lemomo-ai/lemo-opuscar";
const RAW = "https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main";
const GALLERY = "https://lemomo-ai.github.io/lemo-opuscar/";
const SIZES = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] };

const $ = (s) => document.querySelector(s);
let styles = [];
let current = null;

// ---------- catalogue ----------
async function loadCatalog() {
  try {
    const res = await fetch(`${RAW}/styleboard/catalog.json`);
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    styles = await res.json();
    const cats = [...new Set(styles.map((s) => s.cat_en))].sort();
    for (const c of cats) $("#category").append(new Option(c, c));
    render();
  } catch (err) {
    $("#status").textContent = `Couldn't load the styles from GitHub (${err.message}). Check your connection and reload.`;
    $("#status").classList.add("err");
  }
}

function render() {
  const q = $("#search").value.trim().toLowerCase();
  const cat = $("#category").value;
  const list = styles.filter(
    (s) =>
      (!cat || s.cat_en === cat) &&
      (!q || [s.en, s.cat_en, s.line, s.film, ...(s.uses || [])].join(" ").toLowerCase().includes(q)),
  );
  $("#status").textContent = `${list.length} of ${styles.length} styles`;
  const grid = $("#grid");
  grid.innerHTML = "";
  for (const s of list) {
    const card = document.createElement("button");
    card.className = "style-card";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = `${RAW}/styles/${s.slug}/poster.jpg`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("b");
    name.textContent = `${s.num}. ${s.en}`;
    const cat = document.createElement("span");
    cat.textContent = s.cat_en;
    meta.append(name, cat);
    card.append(img, meta);
    card.onclick = () => openStyle(s);
    grid.append(card);
  }
}

$("#search").oninput = render;
$("#category").onchange = render;

// ---------- detail dialog ----------
function openStyle(s) {
  current = s;
  $("#d-name").textContent = `${s.num}. ${s.en}`;
  $("#d-poster").src = `${RAW}/styles/${s.slug}/poster.jpg`;
  $("#d-line").textContent = `${s.film ? `Demo film "${s.film}": ` : ""}${s.line || ""}`;
  $("#d-uses").textContent = s.uses?.length ? `Good for: ${s.uses.join(", ")}` : "";
  $("#d-demo").href = `${GALLERY}#s${s.num}`;
  $("#d-guide").href = `${REPO}/blob/main/styles/${s.slug}/STYLE.md`;
  $("#f-status").textContent = "";
  $("#p-status").textContent = "";
  try {
    const saved = JSON.parse(localStorage.getItem("style-film-form") || "{}");
    if (saved.topic) $("#f-topic").value = saved.topic;
    if (saved.language) $("#f-language").value = saved.language;
    if (saved.format) $("#f-format").value = saved.format;
  } catch {}
  $("#dlg").showModal();
}
$("#d-close").onclick = () => $("#dlg").close();

// ---------- step 2: prompt for Claude ----------
async function fetchGuide(slug) {
  const res = await fetch(`${RAW}/styles/${slug}/STYLE.md`);
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return res.text();
}

function buildPrompt(guide, f) {
  const [w, h] = SIZES[f.format];
  return [
    `Make a short film in code, in the "${current.en}" style described in the style guide at the end.`,
    "",
    `Topic: ${f.topic}`,
    f.notes ? `Script / key points to follow:\n${f.notes}` : "Write a tight script for the topic yourself: a strong hook in the first 2 seconds, one idea per shot, a clear ending.",
    `Length: about ${f.duration} seconds. Frame: ${w}x${h} (${f.format}).`,
    `All words on screen in: ${f.language}.`,
    "",
    "Technical contract (follow exactly, the film is played by a harness):",
    "- Reply with ONE complete, self-contained HTML file inside a single ```html code block, and nothing else after it.",
    `- It contains <canvas id="film" width="${w}" height="${h}"></canvas> and draws only with the Canvas 2D API.`,
    "- No external files, images, fonts, libraries or network requests. Use system fonts (e.g. Georgia, system-ui, monospace) that fit the style.",
    "- Define window.FILM = { duration: <seconds>, render(t) { ... } }. render(t) draws the complete frame for time t in seconds.",
    "- render must be deterministic: same t, same picture. If you need randomness, use a small seeded random generator.",
    "- Do NOT start your own animation loop or timers, and do not play audio; the harness calls render(t).",
    "- Call FILM.render(0) once at load so the first frame shows.",
    "- Burn any narration into on-screen text or subtitles, since there is no sound.",
    "- Adapt the style guide to what one Canvas 2D file can do well; keep its palette, materials, type feel, motion and camera grammar. Keep the code under about 700 lines.",
    "",
    `Style guide (from Lemo-Opuscar by Lemomo, ${REPO}, CC BY-NC 4.0, used to make my own film):`,
    "",
    guide,
  ].join("\n");
}

function readForm() {
  const f = {
    topic: $("#f-topic").value.trim(),
    format: $("#f-format").value,
    duration: Number($("#f-duration").value),
    language: $("#f-language").value.trim() || "English",
    notes: $("#f-notes").value.trim(),
  };
  try { localStorage.setItem("style-film-form", JSON.stringify({ topic: f.topic, language: f.language, format: f.format })); } catch {}
  return f;
}

$("#f-build").onclick = async () => {
  const f = readForm();
  if (!f.topic) { $("#f-topic").focus(); return; }
  // Open the tab now (inside the tap) so phones don't block it as a pop-up.
  const tab = window.open("https://claude.ai/new", "_blank");
  if (tab) tab.opener = null;
  $("#f-status").textContent = "Loading the style guide from GitHub…";
  try {
    const prompt = buildPrompt(await fetchGuide(current.slug), f);
    try {
      await navigator.clipboard.writeText(prompt);
      $("#f-status").textContent = `Prompt copied (${Math.round(prompt.length / 1000)}k characters). In Claude, long-press the message box, Paste, and send. Then copy Claude's whole reply.`;
    } catch {
      $("#f-status").textContent = "Couldn't copy automatically. Select all the text below and copy it.";
      $("#f-html").value = prompt;
    }
    if (!tab) $("#f-status").textContent += " Your browser blocked the new tab, so open claude.ai yourself.";
  } catch (err) {
    $("#f-status").textContent = `Couldn't load the style guide (${err.message}).`;
  }
};

// ---------- step 3: play & record Claude's film in a sandbox ----------
function extractHtml(text) {
  const fence = text.match(/```html\s*([\s\S]*?)```/i) || text.match(/```\s*(<!doctype[\s\S]*?)```/i);
  if (fence) return fence[1];
  const start = text.search(/<!doctype html|<html/i);
  if (start >= 0) {
    const end = text.toLowerCase().lastIndexOf("</html>");
    return end > start ? text.slice(start, end + 7) : text.slice(start);
  }
  return null;
}

// Runs inside the sandboxed iframe: drives FILM.render(t), records the canvas, reports back.
const HARNESS = `
<script>
(function () {
  const send = (m) => parent.postMessage(Object.assign({ from: "film" }, m), "*");
  window.addEventListener("error", (e) => send({ type: "error", message: e.message || "Script error" }));
  function ready(cb, tries) {
    if (window.FILM && typeof FILM.render === "function" && document.getElementById("film")) return cb();
    if (tries > 50) return send({ type: "error", message: "The film did not define window.FILM.render or a canvas with id='film'." });
    setTimeout(() => ready(cb, tries + 1), 100);
  }
  ready(function () {
    const canvas = document.getElementById("film");
    document.documentElement.style.cssText = "margin:0;height:100%;background:#000";
    document.body.style.cssText = "margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden";
    canvas.style.cssText = "max-width:100%;max-height:100%;width:auto;height:auto";
    const duration = Math.max(1, Math.min(180, Number(FILM.duration) || 30));
    let t = 0, playing = false, last = 0, rec = null;
    let broken = false;
    const draw = () => {
      try { FILM.render(t); return true; }
      catch (e) { playing = false; broken = true; if (rec) { rec.stop(); rec = null; } send({ type: "error", message: "render(" + t.toFixed(2) + "): " + e.message }); return false; }
    };
    const loop = (now) => {
      if (!playing) return;
      t += (now - last) / 1000; last = now;
      if (t >= duration) { t = duration; playing = false; draw(); send({ type: "ended" }); if (rec) setTimeout(() => rec.stop(), 300); return; }
      if (!draw()) return;
      send({ type: "time", t: t, duration: duration });
      requestAnimationFrame(loop);
    };
    const play = () => { if (broken) return; if (t >= duration) t = 0; playing = true; last = performance.now(); requestAnimationFrame(loop); };
    window.addEventListener("message", (e) => {
      const m = e.data || {};
      if (m.cmd === "play") play();
      if (m.cmd === "pause") playing = false;
      if (m.cmd === "record") {
        const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
        const mime = types.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || "";
        if (!window.MediaRecorder || !canvas.captureStream) return send({ type: "error", message: "This browser can't record video. Try Chrome." });
        const chunks = [];
        rec = new MediaRecorder(canvas.captureStream(30), { mimeType: mime || undefined, videoBitsPerSecond: 8000000 });
        rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
        rec.onstop = () => {
          const type = rec.mimeType || mime || "video/webm";
          const ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
          const blob = new Blob(chunks, { type: type });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "film-" + Date.now() + "." + ext;
          document.body.appendChild(a); a.click();
          send({ type: "saved", ext: ext, size: blob.size });
          rec = null;
        };
        t = 0; draw(); rec.start(250); play();
      }
    });
    if (draw()) send({ type: "ready", duration: duration, width: canvas.width, height: canvas.height });
  }, 0);
})();
<\/script>`;

let frameReady = false;

$("#f-play").onclick = () => {
  const html = extractHtml($("#f-html").value);
  if (!html) {
    $("#p-status").textContent = "No HTML found. Paste Claude's whole reply, including the ```html block.";
    $("#p-status").classList.add("err");
    return;
  }
  $("#p-status").classList.remove("err");
  $("#p-status").textContent = "Loading film…";
  frameReady = false;
  $("#f-record").disabled = true;
  const format = $("#f-format").value;
  $("#frame").className = format === "portrait" ? "" : format;
  $("#player").classList.remove("hidden");
  const doc = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, HARNESS + "</body>") : html + HARNESS;
  $("#frame").srcdoc = doc;
};

$("#f-record").onclick = () => {
  if (!frameReady) return;
  $("#f-record").disabled = true;
  $("#p-status").textContent = "Recording… keep this screen on until the download starts.";
  $("#frame").contentWindow.postMessage({ cmd: "record" }, "*");
};

window.addEventListener("message", (e) => {
  if (e.source !== $("#frame").contentWindow) return;
  const m = e.data || {};
  if (m.from !== "film") return;
  if (m.type !== "error") $("#p-status").classList.remove("err");
  if (m.type === "ready") {
    frameReady = true;
    $("#f-record").disabled = false;
    $("#frame").className = m.width > m.height ? "landscape" : m.width === m.height ? "square" : "";
    $("#p-status").textContent = `Film loaded: ${m.duration.toFixed(1)} s, ${m.width}×${m.height}. Playing preview…`;
    $("#frame").contentWindow.postMessage({ cmd: "play" }, "*");
  } else if (m.type === "time") {
    if (!$("#p-status").textContent.startsWith("Recording")) $("#p-status").textContent = `Preview ${m.t.toFixed(1)} / ${m.duration.toFixed(1)} s`;
  } else if (m.type === "ended") {
    if (!$("#p-status").textContent.startsWith("Recording")) $("#p-status").textContent = "Preview finished. Tap Record & download to save it.";
  } else if (m.type === "saved") {
    $("#f-record").disabled = false;
    $("#p-status").textContent = `Saved ${m.ext.toUpperCase()} (${(m.size / 1e6).toFixed(1)} MB). Add music or a voiceover in CapCut, Vids or YouTube.`;
  } else if (m.type === "error") {
    $("#f-record").disabled = !frameReady;
    $("#p-status").textContent = `The film has an error: ${m.message}. Copy this message to Claude and ask it to fix the file.`;
    $("#p-status").classList.add("err");
  }
});

loadCatalog();
