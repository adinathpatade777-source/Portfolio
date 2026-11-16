// Runs a workflow: each step's prompt is filled from the topic and earlier outputs,
// sent to Claude or ChatGPT, and the final output is handed off to Google Vids.
import { generate } from "./providers.js";
import { createDoc, googleConnected, VIDS_URL } from "./google.js";
import { newId, saveRun } from "./store.js";

// Supported placeholders:
//   {{topic}}        the run's topic
//   {{previous}}     output of the step just before
//   {{step:Name}}    output of the step with that name (or id)
function fillTemplate(template, topic, outputs) {
  return template
    .replaceAll("{{topic}}", topic)
    .replaceAll("{{previous}}", outputs.at(-1)?.output ?? "")
    .replace(/\{\{step:([^}]+)\}\}/g, (_, key) => {
      const wanted = key.trim().toLowerCase();
      const hit = outputs.find((o) => o.id === key.trim() || o.name.toLowerCase() === wanted);
      return hit?.output ?? "";
    });
}

export async function runWorkflow(workflow, { topic, trigger = "manual" } = {}, emit = () => {}) {
  const run = {
    id: newId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    topic: topic || workflow.topic || "",
    trigger,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  };
  emit({ type: "run", run: { id: run.id, topic: run.topic } });

  try {
    if (!run.topic.trim()) throw new Error("Topic is empty.");
    if (!workflow.steps?.length) throw new Error("This workflow has no steps.");

    for (const step of workflow.steps) {
      const prompt = fillTemplate(step.prompt || "", run.topic, run.steps);
      emit({ type: "step-start", stepId: step.id, name: step.name, provider: step.provider });
      const output = await generate(step, prompt, (delta) => emit({ type: "delta", stepId: step.id, delta }));
      run.steps.push({ id: step.id, name: step.name, provider: step.provider, output });
      emit({ type: "step-done", stepId: step.id });
    }

    const final = run.steps.at(-1).output;
    if (workflow.exportToVids) {
      if (await googleConnected()) {
        emit({ type: "status", message: "Saving storyboard to Google Drive…" });
        const doc = await createDoc(`${run.topic} - Vids storyboard`, final);
        run.vids = { docUrl: doc.url, vidsUrl: VIDS_URL };
      } else {
        run.vids = { error: "Google not connected; storyboard not saved to Drive.", vidsUrl: VIDS_URL };
      }
      emit({ type: "vids", vids: run.vids });
    }
    run.status = "done";
  } catch (err) {
    run.status = "error";
    run.error = err.message;
    emit({ type: "error", message: err.message });
  }

  run.finishedAt = new Date().toISOString();
  await saveRun(run);
  emit({ type: "end", status: run.status });
  return run;
}
