// Model providers: Claude (Anthropic SDK) and ChatGPT (OpenAI SDK).
// Each `generate` call streams text deltas through onDelta and resolves to the full text.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

// Models that accept the server-side refusal fallback parameter.
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);

let anthropic;
let openai;

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  anthropic ??= new Anthropic();
  return anthropic;
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set in .env");
  openai ??= new OpenAI();
  return openai;
}

export function providerStatus() {
  return {
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
}

async function generateWithClaude({ model, system, prompt, effort, onDelta }) {
  const client = getAnthropic();
  const chosen = model || DEFAULT_CLAUDE_MODEL;
  const params = {
    model: chosen,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: effort || "medium" },
    system: system || undefined,
    messages: [{ role: "user", content: prompt }],
  };
  if (FALLBACK_MODELS.has(chosen)) {
    // If the model declines, the API retries on a fallback model in the same call.
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  const stream = client.beta.messages.stream(params);
  stream.on("text", (delta) => onDelta?.(delta));
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    const reason = message.stop_details?.explanation || message.stop_details?.category || "no details";
    throw new Error(`Claude declined this step (${reason}).`);
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (message.stop_reason === "max_tokens") {
    return text + "\n\n[Output was cut off at the token limit.]";
  }
  return text;
}

async function generateWithOpenAI({ model, system, prompt, onDelta }) {
  const client = getOpenAI();
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const stream = await client.chat.completions.create({
    model: model || process.env.OPENAI_MODEL || "gpt-5",
    messages,
    stream: true,
  });
  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      text += delta;
      onDelta?.(delta);
    }
  }
  return text;
}

export async function generate(step, prompt, onDelta) {
  const args = { model: step.model, system: step.system, effort: step.effort, prompt, onDelta };
  if (step.provider === "claude") return generateWithClaude(args);
  if (step.provider === "openai") return generateWithOpenAI(args);
  throw new Error(`Unknown provider "${step.provider}"`);
}
