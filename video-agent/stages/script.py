"""Stage 2: write the narration line by line, plus a scene plan for every line."""
import json

from agent import ask_json
from log import log

TONE = {
    "classic": "- Tone: serious, gripping news storytelling.",
    "doodle": """- Tone: deadpan dark comedy, like a dry web-comic narrator. Every 2-3 lines land a short
  ironic punchline or understatement, built ONLY from true, sourced facts (e.g. "Then Nvidia made a
  record $115.8 billion. Without him. Awkward."). Jokes target the absurd numbers, markets and
  situation; never mock a real person's looks, private life, family or the accused woman; no slurs.
  Each scene's "action" describes one visual gag that matches the line.""",
}

CAMERAS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "shake", "still"]


def run(cfg, story, out):
    words = int(cfg["seconds"] * 2.5)
    lines = max(6, round(cfg["seconds"] / 4.5))
    language = {"en": "English", "hi": "Hindi (Devanagari script, simple spoken Hindi)"}[cfg["lang"]]
    prompt = f"""Write a {cfg['seconds']}-second narration for a faceless cartoon money-news video.
Language: {language}. About {words} words in about {lines} lines (one sentence per line).

Story research (only use these facts; every line must be backed by one of them):
{json.dumps(story, ensure_ascii=False, indent=1)}

Rules:
- Line 1 is the hook and says the huge number.
- Short punchy sentences a 12-year-old understands. Build curiosity; end with a strong last line.
{TONE[cfg.get('style', 'classic')]}
- Say "reportedly"/"alleged" exactly where the sources do. No claims beyond the facts.
- Every line gets a scene. Real people appear as friendly cartoons (never ugly). Anyone
  accused=true appears only as a dark faceless silhouette.
- big_text is 1-4 words or a number shown huge on screen (e.g. "-$192B"), or "" for none.
- camera is one of {CAMERAS}.
- mood is one of: "red_alarm", "green_money", "blue_tech", "gold_luxury", "dark_mystery".

JSON shape:
{{"lines": [{{"text": "...", "fact_ids": [1],
   "scene": {{"setting": "where we are, simple background description",
             "characters": ["cast ids on screen"],
             "props": ["simple objects: money bills, falling chart, chip, stamp, phone..."],
             "action": "what moves: e.g. bills fall and burn, chart line crashes",
             "big_text": "-$192B", "camera": "zoom_in", "mood": "red_alarm"}}}}],
 "cast": [{{"id": "snake_case_id", "name": "...", "silhouette": false,
            "look": "friendly cartoon description, colors, clothes"}}]}}"""
    script = ask_json(prompt, timeout=600)
    for ln in script["lines"]:
        sc = ln.setdefault("scene", {})
        if sc.get("camera") not in CAMERAS:
            sc["camera"] = "zoom_in"
    (out / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=2))

    facts = {f["id"]: f for f in story.get("facts", [])}
    md = [f"# {story.get('title')}\n"]
    for i, ln in enumerate(script["lines"], 1):
        md.append(f"{i}. {ln['text']}")
        for fid in ln.get("fact_ids", []):
            f = facts.get(fid)
            if f:
                md.append(f"   - source: {f['source_name']} <{f['source_url']}>")
    (out / "script.md").write_text("\n".join(md) + "\n")
    log(f"  {len(script['lines'])} lines, {sum(len(l['text'].split()) for l in script['lines'])} words, cast={[c['id'] for c in script['cast']]}")
    return script
