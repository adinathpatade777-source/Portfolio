// Tiny JSON-file storage for workflows and run history.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, "..", "data");
const WORKFLOWS = path.join(DATA_DIR, "workflows.json");
const RUNS = path.join(DATA_DIR, "runs.json");
const MAX_RUNS = 100;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

export const newId = () => crypto.randomUUID().slice(0, 8);

export function defaultWorkflow() {
  return {
    id: newId(),
    name: "Topic → Google Vids",
    topic: "3 tips for staying productive while working from home",
    schedule: "",
    exportToVids: true,
    steps: [
      {
        id: newId(),
        name: "Research & angle",
        provider: "openai",
        model: "",
        system: "You are a sharp video strategist.",
        prompt:
          "Topic: {{topic}}\n\nPick the target audience, a strong hook for the first 5 seconds, " +
          "and 4-6 key points worth covering in a 60-90 second video. Be concise; use bullet points.",
      },
      {
        id: newId(),
        name: "Storyboard for Vids",
        provider: "claude",
        model: "claude-opus-5-5",
        effort: "medium",
        system: "You write video storyboards that Google Vids 'Help me create' can turn into a video.",
        prompt:
          "Topic: {{topic}}\n\nResearch notes:\n{{previous}}\n\n" +
          "Write a storyboard for a 60-90 second video. Start with a one-line title and a one-paragraph " +
          "summary, then number each scene and give: Duration, On-screen text (max 8 words), " +
          "Narration (voiceover script), and Visuals (stock footage or image ideas). Plain text only, no markdown tables.",
      },
      {
        id: newId(),
        name: "Polish narration",
        provider: "openai",
        model: "",
        system: "You are an editor for spoken scripts.",
        prompt:
          "Tighten the narration in this storyboard so it sounds natural when spoken aloud. " +
          "Keep the exact same structure and scene numbering; return the full storyboard.\n\n{{previous}}",
      },
    ],
  };
}

export async function listWorkflows() {
  let workflows = await readJson(WORKFLOWS, null);
  if (!workflows) {
    workflows = [defaultWorkflow()];
    await writeJson(WORKFLOWS, workflows);
  }
  return workflows;
}

export async function getWorkflow(id) {
  return (await listWorkflows()).find((w) => w.id === id) || null;
}

export async function saveWorkflow(workflow) {
  const workflows = await listWorkflows();
  if (!workflow.id) workflow.id = newId();
  for (const step of workflow.steps || []) step.id ||= newId();
  const index = workflows.findIndex((w) => w.id === workflow.id);
  if (index >= 0) workflows[index] = workflow;
  else workflows.push(workflow);
  await writeJson(WORKFLOWS, workflows);
  return workflow;
}

export async function deleteWorkflow(id) {
  const workflows = (await listWorkflows()).filter((w) => w.id !== id);
  await writeJson(WORKFLOWS, workflows);
}

export async function listRuns() {
  return readJson(RUNS, []);
}

export async function saveRun(run) {
  const runs = (await listRuns()).filter((r) => r.id !== run.id);
  runs.unshift(run);
  await writeJson(RUNS, runs.slice(0, MAX_RUNS));
}
