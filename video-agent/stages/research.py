"""Stage 1: find a real, fresh money story with one huge number, and fact-check it."""
import json
import urllib.parse
import xml.etree.ElementTree as ET

import requests

from agent import ask_json
from log import log

DEFAULT_QUERIES = [
    "billion lost shares plunge",
    "stock market crash",
    "biggest IPO",
    "company fraud billion",
    "CEO resigns shares fall",
    "market value wiped out",
]


def google_news(query, days=7, lang="en"):
    hl, gl = ("hi", "IN") if lang == "hi" else ("en-US", "US")
    q = urllib.parse.quote(f"{query} when:{days}d")
    url = f"https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={gl}:{hl.split('-')[0]}"
    try:
        r = requests.get(url, timeout=20)
        root = ET.fromstring(r.content)
    except Exception as e:  # network or parse failure: research still works via web search
        log(f"  news feed failed for '{query}': {e}")
        return []
    items = []
    for it in root.iter("item"):
        items.append({
            "title": it.findtext("title"),
            "source": it.findtext("source"),
            "date": it.findtext("pubDate"),
        })
    return items[:12]


def run(cfg, out):
    queries = [cfg["topic"]] if cfg.get("topic") else DEFAULT_QUERIES
    headlines = []
    for q in queries:
        headlines += google_news(q, lang=cfg["lang"])
    seen, uniq = set(), []
    for h in headlines:
        if h["title"] and h["title"] not in seen:
            seen.add(h["title"])
            uniq.append(h)
    log(f"  {len(uniq)} fresh headlines collected")

    prompt = f"""You are the research desk of a faceless YouTube channel that explains this week's
biggest money stories as friendly cartoons. Today is {cfg['today']}.

{"The user wants this topic: " + cfg['topic'] if cfg.get('topic') else "Pick the best story yourself."}

Fresh headlines from Google News (last 7 days):
{json.dumps(uniq[:60], ensure_ascii=False, indent=1)}

Task:
1. Choose ONE real story from the last 7 days that has ONE huge, specific number (for example
   "$192 billion gone in one day"). Prefer stories people are still searching for.
2. Use WebSearch and WebFetch to verify it in at least 2 independent reputable sources.
3. Collect 8-14 short facts. Every fact must have a source URL that actually says it.
   Never invent numbers. If something is only alleged, say "alleged" or "reportedly".
4. List the real people involved. Mark anyone who is only accused of wrongdoing as accused=true.

JSON shape:
{{"title": "short story title",
  "hook_number": "the one huge number, e.g. -$192 billion",
  "hook_line": "one sentence hook using the number",
  "why_now": "why people are searching for it now",
  "facts": [{{"id": 1, "fact": "...", "source_name": "...", "source_url": "https://..."}}],
  "people": [{{"name": "...", "role": "...", "accused": false, "look": "short friendly cartoon description: age, hair, clothes"}}],
  "cautions": ["anything still developing or legally sensitive"]}}"""
    story = ask_json(prompt, tools=["WebSearch", "WebFetch"], timeout=1200)
    (out / "research.json").write_text(json.dumps(story, ensure_ascii=False, indent=2))
    log(f"  story: {story.get('title')}  [{story.get('hook_number')}]  facts={len(story.get('facts', []))}")
    return story
