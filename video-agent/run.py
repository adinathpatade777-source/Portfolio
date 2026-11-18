#!/usr/bin/env python3
"""Video Agent: research -> script -> voiceover -> assets -> video -> review -> fix -> package.

    python3 run.py                         # agent finds this week's biggest money story
    python3 run.py --topic "Nvidia stock"  # your own topic
    python3 run.py --lang hi --seconds 60  # Hindi
    python3 run.py --voice-file my_vo.mp3 --resume output/<folder>   # use a voice from any website
"""
import argparse
import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from log import log  # noqa: E402
from stages import research, script as script_stage, voice as voice_stage, assets, render, review  # noqa: E402


def cached(path, fn):
    if path.exists():
        log(f"  reusing {path.name}")
        return json.loads(path.read_text())
    return fn()


def main():
    ap = argparse.ArgumentParser(description="Faceless cartoon money-news video agent")
    ap.add_argument("--topic", default="")
    ap.add_argument("--lang", choices=["en", "hi"], default="en")
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--voice", default="", help="edge-tts voice name, e.g. en-US-GuyNeural")
    ap.add_argument("--voice-file", default="", help="your own voiceover recording (mp3/wav)")
    ap.add_argument("--resume", default="", help="output folder of an earlier run to continue")
    ap.add_argument("--no-review", action="store_true")
    ap.add_argument("--review-rounds", type=int, default=2)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    cfg = {"topic": a.topic, "lang": a.lang, "seconds": a.seconds, "voice": a.voice,
           "voice_file": a.voice_file, "workers": a.workers, "today": dt.date.today().isoformat()}
    if a.resume:
        out = Path(a.resume).resolve()
    else:
        slug = re.sub(r"[^a-z0-9]+", "-", (a.topic or "auto").lower()).strip("-")[:30]
        out = HERE / "output" / f"{dt.datetime.now():%Y%m%d-%H%M}-{slug}"
    out.mkdir(parents=True, exist_ok=True)
    log(f"output folder: {out}")

    log("1/6 research")
    story = cached(out / "research.json", lambda: research.run(cfg, out))
    log("2/6 script")
    script = cached(out / "script.json", lambda: script_stage.run(cfg, story, out))
    log("3/6 voiceover")
    vo = voice_stage.run(cfg, script, out)
    log("4/6 assets")
    if (out / "assets" / "cast_defs.svg").exists() and len(list((out / "assets").glob("scene*.svg"))) == len(script["lines"]):
        log("  reusing drawn assets")
        defs = (out / "assets" / "cast_defs.svg").read_text()
        import xml.etree.ElementTree as ET
        root = ET.fromstring(f"<svg {assets.SVG_NS}>{defs}</svg>")
        syms = {e.get("id"): e.get("viewBox") for e in root.iter() if e.tag.endswith("symbol")}
        art = {"defs": defs, "symbols": syms,
               "scenes": [(out / "assets" / f"scene{i:02d}.svg").read_text() for i in range(len(script["lines"]))]}
    else:
        art = assets.run(cfg, story, script, out)

    log("5/6 video (draft)")
    video = render.run(cfg, script, vo, art, out, tag="draft")

    tag = "draft"
    for rnd in range(1, 0 if a.no_review else a.review_rounds + 1):
        log(f"6/6 review round {rnd}")
        rep = review.review(cfg, story, script, out, tag)
        if rep.get("verdict") == "publish":
            log("  reviewer approved the video")
            break
        n = len(script["lines"])
        changed_lines = set()
        for f in rep.get("fact_issues", []):
            i = int(f.get("line", 0) or 0) - 1
            new = re.sub(r"\s*\([^)]*\)\s*$", "", (f.get("new_text") or "").strip())
            if 0 <= i < n and new and new != script["lines"][i]["text"] and len(new.split()) >= 3:
                script["lines"][i]["text"] = new
                changed_lines.add(i)
        if changed_lines and not cfg["voice_file"]:
            (out / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=2))
            log(f"  re-voicing corrected lines {sorted(i + 1 for i in changed_lines)}")
            vo = voice_stage.run(cfg, script, out)
        notes = {}
        for s in rep.get("scene_issues", []):
            i = int(s.get("scene", 0) or 0) - 1
            if 0 <= i < n:
                notes.setdefault(i, []).append(f"{s.get('problem')} FIX: {s.get('fix')}")
        for i in changed_lines:
            notes.setdefault(i, []).append("The narration line changed; make the picture match it.")
        if not notes and not changed_lines:
            break
        if notes:
            log(f"  redrawing scenes {sorted(i + 1 for i in notes)}")
            from concurrent.futures import ThreadPoolExecutor

            def redo(item):
                i, fb = item
                art["scenes"][i] = assets.scene(cfg, i, script["lines"][i], art["symbols"], art["defs"],
                                                feedback=" | ".join(fb))
                (out / "assets" / f"scene{i:02d}.svg").write_text(art["scenes"][i])
            with ThreadPoolExecutor(cfg["workers"]) as ex:
                list(ex.map(redo, notes.items()))
        tag = f"round{rnd}"
        log("  rendering fixed video")
        video = render.run(cfg, script, vo, art, out, tag=tag)
    final = out / "video_final.mp4"
    if video != final:
        shutil.copy(video, final)
    video = final

    log("package: titles, description, thumbnail")
    review.package(cfg, story, script, art, out)
    log(f"DONE -> {video}")


if __name__ == "__main__":
    main()
