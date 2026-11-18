"""Stage 3: voiceover.

Default: free Microsoft neural voices through edge-tts (no account, no key), one clip per
line so every line's start time and every word's timing is exact.
Alternative: --voice-file my_vo.mp3 (made on any voice website). Lines are then matched to
the pauses in the recording.
"""
import asyncio
import json
import os
import re
import subprocess

import certifi

from log import log

VOICES = {"en": "en-US-AndrewMultilingualNeural", "hi": "hi-IN-MadhurNeural"}
PAUSE = 0.35  # seconds of silence between lines (where the scene cuts)


def _ca_fix():
    bundle = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(bundle):
        certifi.where = lambda: bundle


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
    return float(r.stdout.strip())


async def _tts_line(text, voice, path, rate):
    import edge_tts
    proxy = os.environ.get("HTTPS_PROXY") or None
    c = edge_tts.Communicate(text, voice, rate=rate, proxy=proxy, boundary="WordBoundary")
    words = []
    with open(path, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"w": ch["text"], "t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
    return words


def _even_words(text, dur):
    toks = text.split()
    total = sum(len(t) + 2 for t in toks) or 1
    t, words = 0.0, []
    for tok in toks:
        d = dur * (len(tok) + 2) / total
        words.append({"w": tok, "t": t, "d": d})
        t += d
    return words


def _from_file(cfg, lines, vdir):
    src = cfg["voice_file"]
    total = duration(src)
    r = subprocess.run(["ffmpeg", "-i", src, "-af", "silencedetect=n=-35dB:d=0.25", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    gaps = [(e - s, (s + e) / 2) for s, e in zip(starts, ends) if 0.5 < (s + e) / 2 < total - 0.5]
    n = len(lines)
    if len(gaps) >= n - 1:
        cuts = sorted(m for _, m in sorted(gaps, reverse=True)[: n - 1])
        log("  matched lines to pauses in your recording")
    else:
        wc = [len(l["text"].split()) for l in lines]
        acc, cuts = 0, []
        for w in wc[:-1]:
            acc += w
            cuts.append(total * acc / sum(wc))
        log("  not enough pauses found; split lines by word count")
    bounds = [0.0] + cuts + [total]
    timeline = []
    for i, ln in enumerate(lines):
        s, e = bounds[i], bounds[i + 1]
        timeline.append({"start": s, "dur": e - s, "words": _even_words(ln["text"], e - s)})
    out = vdir / "voice.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ar", "44100", "-ac", "1", str(out)], check=True)
    return out, timeline, total


def run(cfg, script, out):
    vdir = out / "voice"
    vdir.mkdir(exist_ok=True)
    lines = script["lines"]
    if cfg.get("voice_file"):
        wav, timeline, total = _from_file(cfg, lines, vdir)
    else:
        _ca_fix()
        voice = cfg.get("voice") or VOICES[cfg["lang"]]
        timeline, parts, t = [], [], 0.0
        silence = vdir / "pause.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                        "-t", str(PAUSE), str(silence)], check=True)
        for i, ln in enumerate(lines):
            mp3 = vdir / f"line{i:02d}.mp3"
            words = asyncio.run(_tts_line(ln["text"], voice, mp3, cfg.get("rate", "+8%")))
            wav = vdir / f"line{i:02d}.wav"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ar", "44100", "-ac", "1", str(wav)], check=True)
            d = duration(wav)
            if not words:
                words = _even_words(ln["text"], d)
            timeline.append({"start": t, "dur": d + PAUSE, "words": words})
            parts += [wav, silence]
            t += d + PAUSE
        lst = vdir / "concat.txt"
        lst.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
        wav = vdir / "voice.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c", "pcm_s16le", str(wav)], check=True)
        total = t
        log(f"  voice: {voice}")
    (out / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
    log(f"  voiceover length {total:.1f}s")
    return {"wav": wav, "timeline": timeline, "total": total}
