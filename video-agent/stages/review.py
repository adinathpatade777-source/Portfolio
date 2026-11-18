"""Stage 6: an independent reviewer agent watches frames of the finished video, re-checks
the script against the sources, and sends scenes back for redraw. Then it writes the
YouTube package (titles, description with sources, tags) and draws the thumbnail."""
import json
import re
import subprocess
from pathlib import Path

from agent import ask_json, ask, extract_block
from log import log

HERE = Path(__file__).resolve().parent.parent


def review(cfg, story, script, out, tag):
    snaps = sorted((out / "review" / tag).glob("scene*.jpg"))
    lines = "\n".join(f"{i + 1}. {ln['text']}  (big text: {ln['scene'].get('big_text', '')})"
                      for i, ln in enumerate(script["lines"]))
    prompt = f"""You are a strict reviewer for a YouTube channel. Check a finished cartoon money-news
video before it is published.

1. Use the Read tool to look at each frame (file sceneNN.jpg is scene NN, counting from 1):
{chr(10).join(str(p) for p in snaps)}
2. Script (scene number = line number):
{lines}
3. Research with sources:
{json.dumps(story, ensure_ascii=False, indent=1)}

Check:
- Facts: every line must be supported by the research; flag anything unsupported, wrong number,
  or missing "reportedly/alleged". Flag anything defamatory.
- Visuals per frame: is it clear what is happening, does it match the narration, is anything
  broken (empty scene, characters cut off, overlapping the big text or captions, ugly or
  unflattering depiction of a real person, accused person shown with a face, unreadable text)?
Be specific and practical. Only flag a scene if a redraw would clearly improve it.

JSON shape:
{{"score": 1-10, "verdict": "publish" | "fix",
  "fact_issues": [{{"line": 3, "problem": "...", "new_text": "the full corrected narration sentence exactly as it should be spoken, or \\"\\" if the narration itself is fine"}}],
Put problems that are only in the picture (wrong on-screen number, label, drawing) in scene_issues, not fact_issues.
  "scene_issues": [{{"scene": 2, "problem": "...", "fix": "concrete drawing instruction"}}],
  "notes": "short overall comment"}}"""
    rep = ask_json(prompt, tools=["Read"], timeout=900, cwd=str(out))
    (out / f"review_{tag}.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2))
    log(f"  review: score {rep.get('score')}/10, verdict {rep.get('verdict')}, "
        f"{len(rep.get('fact_issues', []))} fact issues, {len(rep.get('scene_issues', []))} scene issues")
    for s in rep.get("scene_issues", []):
        log(f"    scene {s.get('scene')}: {s.get('problem')}")
    for f in rep.get("fact_issues", []):
        log(f"    line {f.get('line')}: {f.get('problem')}")
    return rep


def package(cfg, story, script, art, out):
    prompt = f"""Write the YouTube package for this video.
Story: {json.dumps(story, ensure_ascii=False)}
Script: {json.dumps([l['text'] for l in script['lines']], ensure_ascii=False)}
Language for title/description: {"Hindi" if cfg['lang'] == 'hi' else "English"}.

JSON shape:
{{"titles": ["3 options, under 60 characters, curiosity + the big number, no clickbait lies"],
  "description": "2 short paragraphs, then 'Sources:' with every source URL, then a short disclaimer that allegations are reported, not proven",
  "tags": ["10-15 tags"],
  "thumbnail_text": "2-4 words, e.g. -$192B IN 1 DAY"}}"""
    pkg = ask_json(prompt, timeout=600)
    md = ["# YouTube package\n", "## Titles"] + [f"- {t}" for t in pkg.get("titles", [])]
    md += ["\n## Description\n", pkg.get("description", ""), "\n## Tags\n", ", ".join(pkg.get("tags", []))]
    (out / "youtube.md").write_text("\n".join(md) + "\n")

    thumb_prompt = f"""Draw a YouTube thumbnail (1280x720, viewBox 0 0 1280 720) as SVG markup.
Style: {"minimalist doodle comic: flat light background, simple round-head characters, black outlines;" if cfg.get("style") == "doodle" else ""} flat cartoon, background with a strong {('red' if '-' in pkg.get('thumbnail_text', '') else 'green')} glow, one big
character close-up on one side, one glowing prop, and the text "{pkg.get('thumbnail_text', '')}"
HUGE (font-family Inter, font-weight 900, white or yellow with a thick black stroke, paint-order stroke).
Max 3 elements, readable on a phone. You can use these symbols with <use href="#id">: {json.dumps(art['symbols'])}
Reply with one ```svg block with only the inner markup (no <svg> wrapper, no <defs> for those symbols)."""
    svg = extract_block(ask(thumb_prompt, timeout=600), "svg")
    html = out / "work" / "thumb.html"
    html.write_text(f"""<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#000}}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="720" viewBox="0 0 1280 720">
<rect width="1280" height="720" fill="#0b0b10"/>{art['defs']}{svg}</svg></body></html>""")
    js = ("const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();"
          "const p=await b.newPage({viewport:{width:1280,height:720}});"
          f"await p.goto('file://{html}');await p.screenshot({{path:'{out / 'thumbnail.png'}'}});await b.close()}})()")
    subprocess.run(["node", "-e", js], check=True, cwd=str(HERE))
    log(f"  titles: {pkg.get('titles', [''])[0]}")
    return pkg
