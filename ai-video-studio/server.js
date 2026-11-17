import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cron from "node-cron";
import { providerStatus } from "./lib/providers.js";
import * as google from "./lib/google.js";
import * as store from "./lib/store.js";
import { runWorkflow } from "./lib/pipeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true);

// Password protection. Required when deployed so strangers can't spend your API credits.
// The webhook (token-protected) and Google's OAuth callback (state-checked) are exempt.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
// Without API keys or Google set up there is nothing to spend or leak, so the no-key
// copy-and-paste mode may run without a password. Add any key and a password becomes required.
const HAS_SECRETS = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_CLIENT_ID,
);
const LOCKED = process.env.NODE_ENV === "production" && !APP_PASSWORD && HAS_SECRETS;
if (LOCKED) console.warn("APP_PASSWORD is not set; the app is locked until it is.");
app.use((req, res, next) => {
  if (req.path === "/healthz") return res.send("ok");
  if (LOCKED) {
    // Stay up (so the deploy succeeds) but refuse to do anything until a password is set.
    return res.status(503).type("html").send(
      `<body style="font-family:system-ui;background:#0f1117;color:#e7e9ef;padding:24px;line-height:1.5">
       <h2>Almost there: set a password</h2>
       <p>In Render, open <b>ai-video-studio → Environment</b>, add <code>APP_PASSWORD</code> with a password
       of your choice, and tap <b>Save</b>. The app restarts in about a minute; then reload this page.</p></body>`,
    );
  }
  if (!APP_PASSWORD || req.path.startsWith("/api/hooks/") || req.path === "/auth/google/callback") return next();
  const [scheme, encoded] = (req.get("authorization") || "").split(" ");
  const password = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
  const a = Buffer.from(password);
  const b = Buffer.from(APP_PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.set("WWW-Authenticate", 'Basic realm="AI Video Studio"').status(401).send("Password required.");
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "public")));

// ---------- Scheduling ----------
const scheduled = new Map(); // workflowId -> cron task

async function refreshSchedules() {
  for (const task of scheduled.values()) task.stop();
  scheduled.clear();
  for (const wf of await store.listWorkflows()) {
    if (!wf.schedule) continue;
    if (!cron.validate(wf.schedule)) {
      console.warn(`Skipping invalid schedule "${wf.schedule}" on workflow ${wf.name}`);
      continue;
    }
    scheduled.set(
      wf.id,
      cron.schedule(wf.schedule, async () => {
        const fresh = await store.getWorkflow(wf.id);
        if (!fresh) return;
        console.log(`[schedule] running "${fresh.name}"`);
        const run = await runWorkflow(fresh, { trigger: "schedule" });
        console.log(`[schedule] "${fresh.name}" finished: ${run.status}`);
      }),
    );
  }
}

// ---------- Status & Google ----------
app.get("/api/status", async (_req, res) => {
  res.json({
    providers: providerStatus(),
    google: { configured: google.googleConfigured(), connected: await google.googleConnected() },
  });
});

app.get("/auth/google", (_req, res) => {
  if (!google.googleConfigured()) return res.status(400).send("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  res.redirect(google.authUrl());
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error));
    await google.handleCallback(String(req.query.code), String(req.query.state));
    res.redirect("/?google=connected");
  } catch (err) {
    res.status(400).send(`Google connection failed: ${err.message}. <a href="/">Back</a>`);
  }
});

app.post("/api/google/disconnect", async (_req, res) => {
  await google.disconnectGoogle();
  res.json({ ok: true });
});

// ---------- Workflows ----------
app.get("/api/workflows", async (_req, res) => res.json(await store.listWorkflows()));

app.post("/api/workflows", async (req, res) => {
  const wf = req.body;
  if (wf.schedule && !cron.validate(wf.schedule)) {
    return res.status(400).json({ error: `"${wf.schedule}" is not a valid cron schedule.` });
  }
  const saved = await store.saveWorkflow(wf);
  await refreshSchedules();
  res.json(saved);
});

app.delete("/api/workflows/:id", async (req, res) => {
  await store.deleteWorkflow(req.params.id);
  await refreshSchedules();
  res.json({ ok: true });
});

app.get("/api/workflows/new", (_req, res) => res.json(store.defaultWorkflow()));

// ---------- Runs ----------
// Save text as a Google Doc (used by the no-key mode's final step).
app.post("/api/vids/doc", async (req, res) => {
  try {
    const { title, text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text is required" });
    const doc = await google.createDoc(title || "Vids storyboard", text);
    res.json({ docUrl: doc.url, vidsUrl: google.VIDS_URL });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/runs", async (_req, res) => res.json(await store.listRuns()));

// Runs a workflow and streams progress as newline-delimited JSON.
app.post("/api/run", async (req, res) => {
  const { workflow, topic } = req.body;
  if (!workflow) return res.status(400).json({ error: "workflow is required" });
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  await runWorkflow(workflow, { topic, trigger: "manual" }, (event) => res.write(JSON.stringify(event) + "\n"));
  res.end();
});

// Webhook trigger for Zapier, Make, n8n, Apps Script, etc.
//   POST /api/hooks/:workflowId?token=WEBHOOK_TOKEN   body: { "topic": "..." }
app.post("/api/hooks/:workflowId", async (req, res) => {
  const expected = process.env.WEBHOOK_TOKEN;
  const given = req.query.token || req.get("x-webhook-token");
  if (!expected || expected === "change-me" || given !== expected) {
    return res.status(401).json({ error: "Invalid or unset webhook token." });
  }
  const wf = await store.getWorkflow(req.params.workflowId);
  if (!wf) return res.status(404).json({ error: "Workflow not found." });
  const run = await runWorkflow(wf, { topic: req.body?.topic, trigger: "webhook" });
  res.status(run.status === "done" ? 200 : 500).json({
    runId: run.id,
    status: run.status,
    error: run.error,
    vids: run.vids,
    output: run.steps.at(-1)?.output,
  });
});

const port = Number(process.env.PORT) || 3000;
await refreshSchedules();
app.listen(port, () => console.log(`AI Video Studio running at http://localhost:${port}`));
