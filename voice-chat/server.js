// Voice chat with GPT — zero-dependency Node server (Node 18+).
// Keeps your OpenAI API key on the server and proxies three calls:
//   POST /api/transcribe  audio -> text      (speech-to-text)
//   POST /api/chat        messages -> reply  (GPT)
//   POST /api/speak       text -> mp3        (text-to-speech)
const http = require("http");
const fs = require("fs");
const path = require("path");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = process.env.PORT || 3000;
const KEY = process.env.OPENAI_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const STT_MODEL = process.env.STT_MODEL || "gpt-4o-mini-transcribe";
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are a friendly voice assistant. Keep answers short and conversational (1-3 sentences) because they will be spoken aloud. Avoid markdown, lists and emojis.";
const OPENAI = "https://api.openai.com/v1";
const PUBLIC = path.join(__dirname, "public");
const MAX_BODY = 25 * 1024 * 1024;

if (!KEY) {
  console.warn("No OPENAI_API_KEY in .env — the page will ask for your key in the browser instead.");
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/api/health") return send(res, 200, { ok: Boolean(KEY) });
      if (req.method === "POST" && req.url === "/api/transcribe") return await transcribe(req, res);
      if (req.method === "POST" && req.url === "/api/chat") return await chat(req, res);
      if (req.method === "POST" && req.url === "/api/speak") return await speak(req, res);
      if (req.method === "GET") return serveStatic(req, res);
      send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      send(res, err.status || 500, { error: err.message || "Server error" });
    }
  })
  .listen(PORT, () => console.log(`Voice chat running at http://localhost:${PORT}`))
  .on("error", (err) => {
    console.error(err.code === "EADDRINUSE" ? `Port ${PORT} is busy. Try: PORT=3001 npm start` : err.message);
    process.exit(1);
  });

async function transcribe(req, res) {
  const audio = await readBody(req);
  if (!audio.length) return send(res, 400, { error: "No audio received" });
  const type = req.headers["content-type"] || "audio/webm";
  const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([audio], { type }), `speech.${ext}`);
  form.append("model", STT_MODEL);
  const data = await openai("/audio/transcriptions", { method: "POST", body: form });
  send(res, 200, { text: (data.text || "").trim() });
}

async function chat(req, res) {
  const { messages } = JSON.parse((await readBody(req)).toString() || "{}");
  if (!Array.isArray(messages)) return send(res, 400, { error: "messages must be an array" });
  const history = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);
  const data = await openai("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
    }),
  });
  send(res, 200, { reply: data.choices?.[0]?.message?.content?.trim() || "" });
}

async function speak(req, res) {
  const { text, voice } = JSON.parse((await readBody(req)).toString() || "{}");
  if (!text) return send(res, 400, { error: "text is required" });
  const r = await fetch(`${OPENAI}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, voice: voice || "alloy", input: text.slice(0, 4000), response_format: "mp3" }),
  });
  if (!r.ok) throw apiError(r.status, await r.text());
  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  res.end(Buffer.from(await r.arrayBuffer()));
}

async function openai(endpoint, init) {
  const r = await fetch(OPENAI + endpoint, { ...init, headers: { Authorization: `Bearer ${KEY}`, ...(init.headers || {}) } });
  const body = await r.text();
  if (!r.ok) throw apiError(r.status, body);
  return JSON.parse(body);
}

function apiError(status, body) {
  let msg = body;
  try { msg = JSON.parse(body).error.message; } catch {}
  const e = new Error(`OpenAI error (${status}): ${msg}`);
  e.status = 502;
  return e;
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, { error: "Not found" });
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Request too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
