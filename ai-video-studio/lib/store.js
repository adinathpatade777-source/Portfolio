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


// Ready-made workflows for an "AI tools for everyday life" channel.
function channelStep(id, name, provider, system, prompt, extra = {}) {
  return { id, name, provider, model: provider === "claude" ? "claude-opus-5-5" : "", system, prompt, ...extra };
}

const RESEARCH_PROMPT =
  "Video topic: {{topic}}\nChannel: faceless YouTube channel about free AI tools for everyday life " +
  "(students, workers, people who want to save time or earn money).\n\n" +
  "Give me, briefly:\n1. The exact viewer this is for and the problem they have.\n" +
  "2. The specific AI tools to show (real, currently available, say which are free).\n" +
  "3. 3-5 key points, each with one concrete example or step.\n" +
  "4. Three scroll-stopping hook lines for the first 2 seconds.\n" +
  "5. One honest limitation or warning about the tools, so the video stays trustworthy.";

const PACKAGING_PROMPT =
  "Video topic: {{topic}}\nLanguage: {{language}}\n\nResearch:\n{{step:Research}}\n\n" +
  "Write the YouTube packaging in {{language}}:\n" +
  "TITLES: 5 options, under 60 characters, curiosity-driven but not misleading.\n" +
  "DESCRIPTION: 3 short lines summarising the video, then 'Tools mentioned:' with each tool on its own line " +
  "followed by [your link], then a one-line call to subscribe.\n" +
  "HASHTAGS: 8-10 relevant hashtags.\nPINNED COMMENT: one question that invites replies.";


const ANIMATION_PROMPT =
  "Video topic: {{topic}}\nLanguage for all on-screen words: {{language}}\n\nResearch:\n{{step:Research}}\n\n" +
  "Storyboard a 20-40 second flat 2D motion-graphics video (solid colour backgrounds, simple icons, pop-in " +
  "animation, very few words per scene). Reply with ONLY a JSON object, no explanation, in exactly this shape:\n" +
  '{"format":"portrait","palette":"purple","scenes":[{"visual":"title","duration":3,"headline":"...","subtext":"...","icons":["..."],"items":["..."],"value":"...","caption":"...","button":"..."}]}\n\n' +
  "Rules:\n" +
  "- format: portrait (Shorts/Reels), landscape or square.\n" +
  "- palette: purple, clean, warm, night or sky. Pick the one that suits the topic.\n" +
  "- 6-9 scenes, duration 2.5-4 seconds each.\n" +
  "- visual must be one of: title, character, icons, phone, laptop, bar-chart, stat, checklist, timeline, network, cta. " +
  "Use a variety; never the same visual twice in a row. First scene is a strong hook (title or stat); last scene is cta.\n" +
  "- headline: max 6 words. subtext and caption: optional, max 8 words.\n" +
  "- icons: 1-4 simple words from: coin, rupee, check, phone, laptop, doc, idea, gear, chart, heart, star, clock, " +
  "wallet, mail, user, lock, calendar, search, play, home, food, gift, rocket, ai.\n" +
  "- items: for checklist and timeline (2-4 short labels); for bar-chart, 4-7 numbers.\n" +
  "- value: only for stat, e.g. \"5 hrs/week\" or \"90%\". button: only for cta.\n" +
  "- Leave out fields a scene doesn't use. Keep facts accurate.";

export function channelTemplates() {
  return [
    {
      id: "ai-tools-short",
      name: "AI Tools channel: Short (45-60s)",
      topic: "3 free AI tools every student should use",
      language: "Hinglish (Hindi written in English letters)",
      schedule: "",
      exportToVids: true,
      steps: [
        channelStep("ai-short-research", "Research", "openai", "You are a YouTube strategist for a fast-growing AI tools channel.", RESEARCH_PROMPT),
        channelStep("ai-short-packaging", "Title & description", "openai", "You write YouTube titles and descriptions that get clicks honestly.", PACKAGING_PROMPT),
        channelStep(
          "ai-short-script",
          "Script for Vids",
          "claude",
          "You write vertical YouTube Shorts scripts that Google Vids 'Help me create' can turn into a video.",
          "Video topic: {{topic}}\nLanguage: {{language}}\n\nResearch:\n{{step:Research}}\n\nChosen packaging:\n{{step:Title & description}}\n\n" +
            "Write a 45-60 second vertical (9:16) YouTube Short in {{language}}. Start with the best hook from the research, " +
            "spoken in the first 2 seconds. Then 4-6 numbered scenes, each with: Duration, On-screen text (max 6 words), " +
            "Narration, and Visuals (prefer screen recordings of the tool being used). Add a personal tip or opinion in one scene. " +
            "End with a 1-line call to follow for more AI tools. Plain text only, no tables.",
          { effort: "medium" },
        ),
      ],
    },
    {
      id: "ai-tools-long",
      name: "AI Tools channel: Long video (5-8 min)",
      topic: "How to use AI to save 5 hours every week",
      language: "Hinglish (Hindi written in English letters)",
      schedule: "",
      exportToVids: true,
      steps: [
        channelStep("ai-long-research", "Research", "openai", "You are a YouTube strategist for a fast-growing AI tools channel.", RESEARCH_PROMPT),
        channelStep("ai-long-packaging", "Title & description", "openai", "You write YouTube titles and descriptions that get clicks honestly.",
          PACKAGING_PROMPT + "\nCHAPTERS: timestamps (0:00 Intro, ...) matching a 5-8 minute video."),
        channelStep(
          "ai-long-script",
          "Script for Vids",
          "claude",
          "You write YouTube video scripts that Google Vids 'Help me create' can turn into a video.",
          "Video topic: {{topic}}\nLanguage: {{language}}\n\nResearch:\n{{step:Research}}\n\nChosen packaging:\n{{step:Title & description}}\n\n" +
            "Write a 5-8 minute landscape (16:9) YouTube video script in {{language}}. Open with a hook and a promise of " +
            "what the viewer will get (first 15 seconds). Then numbered scenes that follow the chapters, each with: Duration, " +
            "On-screen text (max 8 words), Narration, and Visuals (screen recordings of each tool, step by step). " +
            "Include one honest limitation, one personal tip, and a mid-video reminder to subscribe. End with a recap and " +
            "a question for the comments. Plain text only, no tables.",
          { effort: "medium" },
        ),
      ],
    },
    {
      id: "flat-animation",
      name: "Flat animation video (motion graphics)",
      topic: "3 free AI tools every student should use",
      language: "Hinglish (Hindi written in English letters)",
      schedule: "",
      exportToVids: false,
      steps: [
        channelStep("anim-research", "Research", "openai", "You are a YouTube strategist for a fast-growing AI tools channel.", RESEARCH_PROMPT),
        channelStep(
          "anim-script",
          "Animation script",
          "claude",
          "You storyboard short flat 2D motion-graphics explainer videos and output only valid JSON.",
          ANIMATION_PROMPT,
          { effort: "medium" },
        ),
      ],
    },
  ];
}

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
  let changed = false;
  if (!workflows) {
    workflows = [defaultWorkflow()];
    changed = true;
  }
  // Add any built-in channel templates that are missing (e.g. after an update).
  for (const template of channelTemplates().reverse()) {
    if (!workflows.some((w) => w.id === template.id)) {
      workflows.unshift(template);
      changed = true;
    }
  }
  if (changed) await writeJson(WORKFLOWS, workflows);
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
