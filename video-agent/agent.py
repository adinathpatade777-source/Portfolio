"""The agent brain: runs Claude Code headless (`claude -p`).

No API key is needed: it uses the Claude Code login that is already on this
machine. Every stage of the pipeline calls `ask()` with a prompt and gets text back.
"""
import json
import re
import subprocess
import time

from log import log


class AgentError(RuntimeError):
    pass


def ask(prompt, tools=None, timeout=900, cwd=None, retries=2):
    """Run one agent task. `tools` is a list like ["WebSearch", "WebFetch", "Read"]."""
    cmd = ["claude", "-p", prompt, "--output-format", "json"]
    cmd += ["--allowedTools", ",".join(tools)] if tools else ["--allowedTools", ""]
    last = None
    for attempt in range(retries + 1):
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
            out = json.loads(p.stdout)
            if out.get("is_error"):
                raise AgentError(out.get("result") or "agent error")
            return out.get("result", "")
        except (subprocess.TimeoutExpired, json.JSONDecodeError, AgentError) as e:
            last = e
            log(f"  agent retry {attempt + 1}: {str(e)[:160]}")
            time.sleep(3)
    raise AgentError(f"agent failed: {last}")


def extract_json(text):
    m = re.findall(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.S)
    candidates = m[::-1] if m else []
    i, j = text.find("{"), text.rfind("}")
    if i != -1 and j > i:
        candidates.append(text[i : j + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
    raise AgentError("no JSON in agent reply")


def ask_json(prompt, tools=None, timeout=900, cwd=None):
    text = ask(prompt + "\n\nReply with ONE ```json fenced block and nothing else.", tools, timeout, cwd)
    try:
        return extract_json(text)
    except AgentError:
        fix = ask("Turn this into one valid JSON object. Reply with only a ```json block.\n\n" + text, None, 300, cwd)
        return extract_json(fix)


def extract_block(text, lang):
    m = re.findall(rf"```{lang}\s*(.*?)```", text, re.S)
    if m:
        return max(m, key=len).strip()
    m = re.findall(r"```\w*\s*(.*?)```", text, re.S)
    return max(m, key=len).strip() if m else text.strip()
