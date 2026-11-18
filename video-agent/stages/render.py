"""Stage 5: render the animation, build a music + sound-effects bed, and mix with the voice."""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

from log import log

HERE = Path(__file__).resolve().parent.parent
SR = 44100


def _write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def music_bed(total, cuts, path, seed=7):
    """Original background music (dark pulse + pad) and a whoosh/hit at every scene cut."""
    rng = np.random.default_rng(seed)
    n = int(total * SR) + SR
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    bpm = 100
    beat = 60 / bpm
    chords = [[110, 130.81, 164.81], [87.31, 110, 130.81], [98, 123.47, 146.83], [82.41, 103.83, 123.47]]
    bar = beat * 4
    pad = np.zeros(n)
    for k in range(int(total / bar) + 2):
        s, e = int(k * bar * SR), min(n, int((k + 1) * bar * SR))
        if s >= n:
            break
        tt = t[s:e] - k * bar
        env = np.minimum(1, tt / 0.6) * np.minimum(1, (bar - tt) / 0.4)
        for f in chords[k % 4]:
            pad[s:e] += env * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt + 0.3))
    pad *= 0.045
    # pulse bass on every beat + soft hats on off-beats
    bass = np.zeros(n)
    hats = np.zeros(n)
    for k in range(int(total / beat) + 2):
        s = int(k * beat * SR)
        if s >= n:
            break
        L = min(int(0.35 * SR), n - s)
        tt = np.arange(L) / SR
        f = chords[int(k * beat / bar) % 4][0] / 2
        bass[s:s + L] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 9) * 0.22
        s2 = int((k + 0.5) * beat * SR)
        if s2 < n:
            L2 = min(int(0.05 * SR), n - s2)
            hats[s2:s2 + L2] += rng.normal(0, 1, L2) * np.exp(-np.arange(L2) / SR * 90) * 0.035
    mono = pad + bass + hats
    out[:, 0] = mono
    out[:, 1] = mono
    # whoosh + low hit on every cut
    for c in cuts:
        s = int(max(0, c - 0.25) * SR)
        L = min(int(0.6 * SR), n - s)
        if L <= 0:
            continue
        tt = np.arange(L) / SR
        noise = rng.normal(0, 1, L)
        k = 40  # crude band shaping via moving average difference
        smooth = np.convolve(noise, np.ones(k) / k, mode="same")
        wh = (noise - smooth) * np.sin(np.pi * np.minimum(tt / 0.3, 1)) * np.exp(-np.maximum(tt - 0.25, 0) * 10) * 0.10
        hit = np.sin(2 * np.pi * 55 * tt * (1 - 0.3 * tt)) * np.exp(-np.maximum(tt - 0.25, 0) * 8) * (tt > 0.25) * 0.35
        out[s:s + L, 0] += wh + hit
        out[s:s + L, 1] += wh * 0.8 + hit
    fade = np.minimum(1, (n / SR - t) / 1.5)[:, None]
    _write_wav(path, out * fade)


def run(cfg, script, voice, art, out, tag="final"):
    scenes = []
    tl = voice["timeline"]
    for i, (ln, svg) in enumerate(zip(script["lines"], art["scenes"])):
        sc = ln["scene"]
        dur = tl[i]["dur"] + (1.0 if i == len(tl) - 1 else 0)  # hold the last frame a moment
        scenes.append({"defs": art["defs"], "svg": svg, "mood": sc.get("mood"),
                       "big_text": sc.get("big_text", ""), "camera": sc.get("camera"),
                       "dur": dur, "words": tl[i]["words"], "flash": i > 0,
                       "theme": "light" if cfg.get("style") == "doodle" else "dark"})
    work = out / "work"
    work.mkdir(exist_ok=True)
    silent = work / f"video_{tag}.mp4"
    job = {"template": str(HERE / "template.html"), "fps": cfg.get("fps", 24), "scenes": scenes,
           "out_video": str(silent), "snap_dir": str(out / "review" / tag)}
    (work / "job.json").write_text(json.dumps(job, ensure_ascii=False))
    subprocess.run(["node", str(HERE / "render.js"), str(work / "job.json")], check=True)

    total = sum(s["dur"] for s in scenes)
    cuts = [tl[i]["start"] for i in range(1, len(tl))]
    bed = work / "music.wav"
    music_bed(total, cuts, bed)
    final = out / f"video_{tag}.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", str(silent), "-i", str(voice["wav"]), "-i", str(bed),
        "-filter_complex",
        "[1:a]aresample=44100,pan=stereo|c0=c0|c1=c0,acompressor=threshold=-18dB:ratio=3,volume=1.6,asplit=2[v][vs];"
        "[2:a]volume=0.9[m];[m][vs]sidechaincompress=threshold=0.05:ratio=6:release=300[md];"
        "[v][md]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(final)],
        check=True)
    log(f"  video: {final.name} ({total:.1f}s)")
    return final
