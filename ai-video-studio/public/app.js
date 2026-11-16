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
  $("#wf-schedule").value = current.schedule || "";
  $("#wf-export").checked = Boolean(current.exportToVids);
  $("#wf-webhook").value = `${location.origin}/api/hooks/${current.id}?token=YOUR_WEBHOOK_TOKEN`;
  $("#save-state").textContent = "";
  renderSteps();
}

function readEditor() {
  current.name = $("#wf-name").value.trim() || "Untitled";
  current.topic = $("#wf-topic").value;
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
