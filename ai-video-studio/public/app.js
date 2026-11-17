const $ = (sel) => document.querySelector(sel);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
};

let workflows = [];
let current = null;

// ---------- Connections ----------
async function loadStatus() {
  const s = await api("/api/status");
  $("#chip-openai").classList.toggle("ok", s.providers.openai);
  $("#chip-claude").classList.toggle("ok", s.providers.claude);
  $("#chip-google").classList.toggle("ok", s.google.connected);
  $("#chip-openai").title = s.providers.openai ? "Connected" : "Set OPENAI_API_KEY in .env";
  $("#chip-claude").title = s.providers.claude ? "Connected" : "Set ANTHROPIC_API_KEY in .env";
  $("#chip-google").title = s.google.connected ? "Connected" : s.google.configured ? "Click Connect Google" : "Set GOOGLE_CLIENT_ID/SECRET in .env";
  $("#google-connect").classList.toggle("hidden", s.google.connected);
  $("#google-disconnect").classList.toggle("hidden", !s.google.connected);
}

$("#google-disconnect").onclick = async () => {
  await api("/api/google/disconnect", { method: "POST" });
  loadStatus();
};

// ---------- Workflow list ----------
async function loadWorkflows(selectId) {
  workflows = await api("/api/workflows");
  const pick = workflows.find((w) => w.id === (selectId || current?.id)) || workflows[0];
  if (pick) select(pick);
  renderList();
}

function renderList() {
  const list = $("#workflow-list");
  list.innerHTML = "";
  for (const wf of workflows) {
    const li = document.createElement("li");
    li.textContent = wf.name || "Untitled";
    li.classList.toggle("active", wf.id === current?.id);
    li.onclick = () => { select(structuredClone(wf)); renderList(); };
    list.appendChild(li);
  }
}

$("#new-workflow").onclick = async () => {
  const wf = await api("/api/workflows/new");
  wf.name = "New workflow";
  select(wf);
  renderList();
};

// ---------- Editor ----------
function select(wf) {
  current = structuredClone(wf);
  $("#wf-name").value = current.name || "";
  $("#wf-topic").value = current.topic || "";
  $("#wf-language").value = current.language || "English";
  $("#wf-schedule").value = current.schedule || "";
  $("#wf-export").checked = Boolean(current.exportToVids);
  $("#wf-webhook").value = `${location.origin}/api/hooks/${current.id}?token=YOUR_WEBHOOK_TOKEN`;
  $("#save-state").textContent = "";
  renderSteps();
}

function readEditor() {
  current.name = $("#wf-name").value.trim() || "Untitled";
  current.topic = $("#wf-topic").value;
  current.language = $("#wf-language").value.trim() || "English";
  current.schedule = $("#wf-schedule").value.trim();
  current.exportToVids = $("#wf-export").checked;
  return current;
}

function renderSteps() {
  const list = $("#steps");
  list.innerHTML = "";
  current.steps.forEach((step, i) => {
    const node = $("#step-template").content.firstElementChild.cloneNode(true);
    const bind = (sel, key) => {
      const el = node.querySelector(sel);
      el.value = step[key] || "";
      el.oninput = () => { step[key] = el.value; $("#save-state").textContent = "Unsaved changes"; };
      return el;
    };
    node.querySelector(".step-num").textContent = i + 1;
    node.classList.toggle("claude", step.provider === "claude");
    bind(".step-name", "name");
    bind(".step-model", "model");
    bind(".step-system", "system");
    bind(".step-prompt", "prompt");
    const provider = bind(".step-provider", "provider");
    provider.onchange = () => { step.provider = provider.value; node.classList.toggle("claude", step.provider === "claude"); };
    node.querySelector(".step-model").placeholder = step.provider === "claude" ? "claude-opus-5-5" : "default from .env";
    node.querySelectorAll("[data-move]").forEach((btn) => {
      btn.onclick = () => {
        const j = i + Number(btn.dataset.move);
        if (j < 0 || j >= current.steps.length) return;
        [current.steps[i], current.steps[j]] = [current.steps[j], current.steps[i]];
        renderSteps();
      };
    });
    node.querySelector("[data-remove]").onclick = () => { current.steps.splice(i, 1); renderSteps(); };
    list.appendChild(node);
  });
}

document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.onclick = () => {
    const provider = btn.dataset.add;
    current.steps.push({
      name: provider === "claude" ? "Claude step" : "ChatGPT step",
      provider,
      model: provider === "claude" ? "claude-opus-5-5" : "",
      system: "",
      prompt: "{{previous}}",
    });
    renderSteps();
  };
});

$("#save-workflow").onclick = async () => {
  try {
    const saved = await api("/api/workflows", { method: "POST", body: JSON.stringify(readEditor()) });
    await loadWorkflows(saved.id);
    $("#save-state").textContent = "Saved";
  } catch (err) {
    alert(err.message);
  }
};

$("#delete-workflow").onclick = async () => {
  if (!confirm(`Delete "${current.name}"?`)) return;
  await api(`/api/workflows/${current.id}`, { method: "DELETE" });
  current = null;
  await loadWorkflows();
};

// ---------- Running ----------
function outStep(stepId, name, provider) {
  const el = document.createElement("div");
  el.className = "out-step running";
  el.dataset.step = stepId;
  el.innerHTML = `<header><span></span><span class="tag"></span></header><pre></pre>`;
  el.querySelector("header span").textContent = name;
  el.querySelector(".tag").textContent = provider === "claude" ? "Claude" : "ChatGPT";
  $("#output").appendChild(el);
  return el;
}

function showVids(vids) {
  const box = document.createElement("div");
  box.className = "vids-box";
  if (vids.docUrl) {
    box.innerHTML = `<strong>Ready for Google Vids</strong>
      <ol>
        <li>Open Google Vids and choose <em>Help me create</em>.</li>
        <li>Attach the storyboard Doc from Drive (or paste its text) and generate.</li>
      </ol>
      <div class="row"></div>`;
    const row = box.querySelector(".row");
    for (const [label, href] of [["Open storyboard Doc", vids.docUrl], ["Open Google Vids", vids.vidsUrl]]) {
      const a = document.createElement("a");
      a.className = "btn small";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = label;
      row.appendChild(a);
    }
  } else {
    box.textContent = vids.error;
  }
  $("#output").appendChild(box);
}

$("#run-workflow").onclick = async () => {
  const wf = readEditor();
  const button = $("#run-workflow");
  button.disabled = true;
  $("#output").innerHTML = "";
  const steps = {};

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: wf, topic: wf.topic }),
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "step-start") steps[ev.stepId] = outStep(ev.stepId, ev.name, ev.provider);
        else if (ev.type === "delta") {
          const pre = steps[ev.stepId].querySelector("pre");
          pre.textContent += ev.delta;
          pre.scrollTop = pre.scrollHeight;
        } else if (ev.type === "step-done") steps[ev.stepId].classList.remove("running");
        else if (ev.type === "vids") showVids(ev.vids);
        else if (ev.type === "error") {
          document.querySelectorAll(".out-step.running").forEach((el) => el.classList.remove("running"));
          const box = document.createElement("div");
          box.className = "error-box";
          box.textContent = `Error: ${ev.message}`;
          $("#output").appendChild(box);
        }
      }
    }
  } catch (err) {
    alert(err.message);
  } finally {
    button.disabled = false;
    loadRuns();
  }
};

// ---------- Run history ----------
async function loadRuns() {
  const runs = await api("/api/runs");
  const list = $("#run-list");
  list.innerHTML = "";
  for (const run of runs.slice(0, 15)) {
    const li = document.createElement("li");
    li.className = `status-${run.status}`;
    li.textContent = `${new Date(run.startedAt).toLocaleString()} · ${run.trigger} · ${run.topic}`;
    li.title = run.error || run.status;
    li.onclick = () => showRun(run);
    list.appendChild(li);
  }
}

function showRun(run) {
  $("#output").innerHTML = "";
  for (const s of run.steps) {
    const el = outStep(s.id, s.name, s.provider);
    el.classList.remove("running");
    el.querySelector("pre").textContent = s.output;
  }
  if (run.vids) showVids(run.vids);
  if (run.error) {
    const box = document.createElement("div");
    box.className = "error-box";
    box.textContent = `Error: ${run.error}`;
    $("#output").appendChild(box);
  }
}

loadStatus();
loadWorkflows();
loadRuns();

// ---------- No-key mode: copy & paste with your own ChatGPT / Claude accounts ----------
function fillTemplate(template, topic, outputs, language = "English") {
  return template
    .replaceAll("{{topic}}", topic)
    .replaceAll("{{language}}", language || "English")
    .replaceAll("{{previous}}", outputs.at(-1)?.output ?? "")
    .replace(/\{\{step:([^}]+)\}\}/g, (_, key) => {
      const wanted = key.trim().toLowerCase();
      const hit = outputs.find((o) => o.id === key.trim() || (o.name || "").toLowerCase() === wanted);
      return hit?.output ?? "";
    });
}

function chatUrl(provider, prompt) {
  const base = provider === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
  const q = encodeURIComponent(prompt);
  return q.length < 6000 ? `${base}?q=${q}` : base; // very long prompts: paste from clipboard
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = old), 1500);
  } catch {
    prompt("Copy this text:", text);
  }
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (text !== undefined) node.textContent = text;
  return node;
}

function manualStep(step, index, total, promptText) {
  return new Promise((resolve) => {
    const who = step.provider === "claude" ? "Claude" : "ChatGPT";
    const box = el("div", { className: `manual ${step.provider}` });
    box.append(el("strong", {}, `Step ${index + 1} of ${total}: ${step.name} (${who})`));
    const full = step.system ? `${step.system}\n\n${promptText}` : promptText;
    box.append(el("pre", {}, full));

    const row = el("div", { className: "row" });
    const copyBtn = el("button", { className: "btn small" }, "Copy prompt");
    copyBtn.onclick = () => copyText(full, copyBtn);
    const open = el("a", { className: "btn small primary", href: chatUrl(step.provider, full), target: "_blank", rel: "noopener" }, `Open ${who}`);
    open.onclick = () => navigator.clipboard?.writeText(full).catch(() => {});
    row.append(copyBtn, open);
    box.append(row);

    box.append(el("p", { className: "hint" }, `Send it in ${who}, copy the whole reply, and paste it below.`));
    const answer = el("textarea", { rows: 6, placeholder: `Paste ${who}'s reply here` });
    const next = el("button", { className: "btn primary" }, index + 1 < total ? "Next step →" : "Finish");
    next.onclick = () => {
      if (!answer.value.trim()) return answer.focus();
      box.querySelectorAll("button, a, textarea").forEach((n) => (n.disabled = true));
      answer.readOnly = true;
      next.remove();
      resolve(answer.value.trim());
    };
    box.append(answer, next);
    $("#output").append(box);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function looksLikeAnimation(text) {
  return /"scenes"\s*:/.test(text || "");
}

function animatorBox(text) {
  const box = el("div", { className: "vids-box" });
  box.append(el("strong", {}, "Animation script ready"));
  box.append(el("p", { className: "hint" }, "Open the Animator to preview it and download the video."));
  const open = el("a", { className: "btn primary", href: "/animate.html" }, "🎬 Open in Animator");
  open.onclick = () => { try { localStorage.setItem("animator-script", text); } catch {} };
  box.append(open);
  $("#output").append(box);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function manualFinish(topic, storyboard) {
  if (looksLikeAnimation(storyboard)) return animatorBox(storyboard);
  const box = el("div", { className: "vids-box" });
  box.append(el("strong", {}, "Ready for Google Vids"));
  const steps = el("ol");
  steps.append(
    el("li", {}, "Tap Copy storyboard."),
    el("li", {}, "Open Google Vids and choose Help me create."),
    el("li", {}, "Paste the storyboard as your prompt and generate."),
  );
  box.append(steps);
  const row = el("div", { className: "row" });
  const copyBtn = el("button", { className: "btn small primary" }, "Copy storyboard");
  copyBtn.onclick = () => copyText(storyboard, copyBtn);
  const vids = el("a", { className: "btn small", href: "https://vids.google.com/", target: "_blank", rel: "noopener" }, "Open Google Vids");
  row.append(copyBtn, vids);
  if ($("#chip-google").classList.contains("ok")) {
    const save = el("button", { className: "btn small" }, "Save as Google Doc");
    save.onclick = async () => {
      save.disabled = true;
      try {
        const r = await api("/api/vids/doc", { method: "POST", body: JSON.stringify({ title: `${topic} - Vids storyboard`, text: storyboard }) });
        const link = el("a", { className: "btn small", href: r.docUrl, target: "_blank", rel: "noopener" }, "Open storyboard Doc");
        save.replaceWith(link);
      } catch (err) {
        alert(err.message);
        save.disabled = false;
      }
    };
    row.append(save);
  }
  box.append(row);
  $("#output").append(box);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#run-manual").onclick = async () => {
  const wf = readEditor();
  if (!wf.topic.trim()) return alert("Type a topic first.");
  if (!wf.steps.length) return alert("Add at least one step.");
  const button = $("#run-manual");
  button.disabled = true;
  $("#output").innerHTML = "";
  $("#output").append(el("p", { className: "hint" }, "No-key mode: each step opens ChatGPT or Claude with the prompt filled in. Paste the reply back here."));
  const outputs = [];
  try {
    for (const [i, step] of wf.steps.entries()) {
      const text = fillTemplate(step.prompt || "", wf.topic, outputs, wf.language);
      const output = await manualStep(step, i, wf.steps.length, text);
      outputs.push({ id: step.id, name: step.name, output });
    }
    manualFinish(wf.topic, outputs.at(-1).output);
  } finally {
    button.disabled = false;
  }
};
