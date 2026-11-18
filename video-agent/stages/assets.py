"""Stage 4: the agent draws every asset as code (SVG): a reusable cartoon cast + props,
then one animated scene per narration line."""
import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from agent import ask, extract_block
from log import log

SVG_NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
ANIMS = ("a-pop a-stamp a-left a-right a-rise a-drop a-fade (entrances, play once) | "
         "a-float a-bob a-wobble a-shake a-pulse a-spin a-fall a-flicker a-blink (loops) | "
         "a-draw (stroke draws on; the path needs pathLength=\"1\") | a-crash (falls in and tilts) | "
         "a-grow a-shrink (bars grow / collapse from the bottom)")

STYLE = """Art style: modern flat 2D explainer cartoon. Thick dark outlines (stroke #141414, 6-8px),
bold flat colors, one soft shadow tone, simple rounded shapes, big friendly heads, expressive eyes.
Real people are recognizable by hair, glasses, clothes and colors, always drawn kindly, never ugly.
Silhouette characters are solid dark shapes (#0b0b0f) with a thin colored rim light and NO face."""


def _check(xml_text):
    ET.fromstring(f"<svg {SVG_NS}>{xml_text}</svg>")


def _clean(svg):
    svg = re.sub(r"<\?xml.*?\?>", "", svg, flags=re.S)
    m = re.match(r"\s*<svg[^>]*>(.*)</svg>\s*$", svg, re.S)
    if m:
        svg = m.group(1)
    svg = re.sub(r"<script.*?</script>", "", svg, flags=re.S | re.I)
    return svg.replace("&nbsp;", " ")


def cast(cfg, story, script, out):
    props = sorted({p for ln in script["lines"] for p in ln["scene"].get("props", [])})
    prompt = f"""Draw the reusable cartoon library for a money-news explainer video as SVG <symbol>s.

{STYLE}

Cast (one symbol each, id = the cast id, viewBox="0 0 400 700", full body standing, centered,
feet touching y=690):
{json.dumps(script['cast'], ensure_ascii=False, indent=1)}

Props needed by the scenes (merge similar ones; make at most 14 prop symbols, ids start with
"prop_", viewBox="0 0 300 300", centered): {json.dumps(props, ensure_ascii=False)}
Always include: prop_bill (a cash bill), prop_coin, prop_chart_down (red line chart falling),
prop_chart_up (green rising chart), prop_flame.

Rules: valid XML only, no <script>, no external images or fonts, no <text> inside characters.
Give gradients/filters ids that start with the symbol id. Characters should be detailed enough
to look professional (hair shapes, face, hands, clothes folds, shoes), about 40-90 elements each.

Reply with one ```svg block that contains only <defs>...</defs> with all the symbols."""
    for attempt in range(3):
        defs = _clean(extract_block(ask(prompt, timeout=1200), "svg"))
        if not defs.lstrip().startswith("<defs"):
            defs = f"<defs>{defs}</defs>"
        try:
            _check(defs)
            break
        except ET.ParseError as e:
            log(f"  cast SVG invalid ({e}), redrawing")
    else:
        raise RuntimeError("could not draw a valid cast")
    root = ET.fromstring(f"<svg {SVG_NS}>{defs}</svg>")
    symbols = {}
    for el in root.iter():
        if el.tag.endswith("symbol") and el.get("id"):
            symbols[el.get("id")] = el.get("viewBox", "0 0 400 700")
    (out / "assets").mkdir(exist_ok=True)
    (out / "assets" / "cast_defs.svg").write_text(defs)
    log(f"  drew {len(symbols)} symbols: {', '.join(symbols)}")
    return defs, symbols


def scene(cfg, i, line, symbols, defs, feedback=None):
    sc = line["scene"]
    prompt = f"""Draw scene {i + 1} of an animated cartoon money-news video as SVG markup for a
1920x1080 canvas (viewBox 0 0 1920 1080). The page already paints a mood gradient behind
your drawing ("{sc.get('mood')}"), shows the big text "{sc.get('big_text', '')}" at the top
(y 40-240) and captions at the bottom (y 930-1080). Keep the main action in y 230-920.

Narration for this scene: "{line['text']}"
Plan: {json.dumps(sc, ensure_ascii=False)}

{STYLE}

Available symbols (place them with <use href="#id" x=".." y=".." width=".." height=".."/>;
keep the symbol's aspect ratio from its viewBox):
{json.dumps(symbols)}

Animation classes you MUST use (put class on a <g> wrapper; use style="animation-delay:0.4s"
to stagger, and negative delays to desync loops): {ANIMS}
Make it feel alive: 1-2 entrances at the start, at least 2 looping motions, and an
action that matches the narration (falling bills use many small <g class="a-fall"> with
different x and negative delays; crashing charts use a-draw on a polyline with pathLength="1").

Build a real setting behind the characters: e.g. office walls/windows, a city skyline, a trading
floor with screens, a stage — 15-40 shapes, using the mood colors, darker than the foreground
so characters pop. Add a soft ellipse shadow under every character. You may add short labels
with <text> (font-family Inter, font-weight 800), e.g. a ticker "NVDA ▼17%".
Valid XML only. No <script>, no external images, no <svg> wrapper, no width/height on root.
{("Fix these problems found in review: " + feedback) if feedback else ""}
Reply with one ```svg block containing only the scene markup."""
    for attempt in range(3):
        svg = _clean(extract_block(ask(prompt, timeout=900), "svg"))
        try:
            _check(defs + svg)
            missing = set(re.findall(r'href="#([\w-]+)"', svg)) - set(symbols) - set(re.findall(r'id="([\w-]+)"', svg))
            for m in missing:  # drop references to symbols that do not exist
                svg = re.sub(rf'<use[^>]*href="#{m}"[^>]*/>', "", svg)
            return svg
        except ET.ParseError as e:
            log(f"  scene {i + 1} SVG invalid ({e}), redrawing")
    return '<g class="a-pulse"><use href="#prop_bill" x="760" y="340" width="400" height="400"/></g>'


def run(cfg, story, script, out):
    defs, symbols = cast(cfg, story, script, out)
    lines = script["lines"]
    with ThreadPoolExecutor(cfg.get("workers", 4)) as ex:
        svgs = list(ex.map(lambda a: scene(cfg, a[0], a[1], symbols, defs), enumerate(lines)))
    for i, s in enumerate(svgs):
        (out / "assets" / f"scene{i:02d}.svg").write_text(s)
    log(f"  drew {len(svgs)} scenes")
    return {"defs": defs, "symbols": symbols, "scenes": svgs}
