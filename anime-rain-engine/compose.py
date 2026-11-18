#!/usr/bin/env python3
"""Compose a rainy-anime Short from real-looking sources.

Shots can be:
  {"clip":  "veo_r1.mp4", "in": 0.4, "dur": 2.0, "speed": 0.9}   # Google Vids / Veo / any video
  {"image": "r2.png", "dur": 1.6, "live": {...}}                  # painted still, brought to life
  {"scene": "PuddleSteps", "dur": 2.0}                            # code-drawn scene from engine/scenes.py

Every shot is landscape 1920x1080, gets the same style pass (rain overlay, wet teal
grade, glow, grain), then the whole film is turned sideways to 9:16 like rainy anime
wallpaper edits ("orientation": "sideways"), or kept "landscape".

  python3 compose.py project.json --preview
  python3 compose.py project.json --out short.mp4
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
import cv2

from engine.core import W, H, smooth
from engine.fx import Rain, GlassDrops
from engine.live import LivingImage, ClipSource
from engine.post import wet_anime_look, grain, Captions, mux
from engine import scenes as SC

ap = argparse.ArgumentParser()
ap.add_argument('project')
ap.add_argument('--out', default='short.mp4')
ap.add_argument('--preview', action='store_true')
ap.add_argument('--range', nargs=2, type=float)
A = ap.parse_args()
P = json.load(open(A.project))
BASE = os.path.dirname(os.path.abspath(A.project))
path = lambda p: p if os.path.isabs(p) else os.path.join(BASE, p)
FPS = P.get('fps', 30)
STYLE = {'rain': 0.6, 'haze': 0.35, 'grade': 1.0, 'grain': 3.0, **P.get('style', {})}
ORIENT = P.get('orientation', 'sideways')
OW, OH = (H, W) if ORIENT == 'sideways' else (W, H)
FONT = P.get('font', '/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf')

# timeline
SHOTS, t = [], 0.0
for i, s in enumerate(P['shots']):
    s = dict(s); s['start'] = t
    if 'clip' in s and 'dur' not in s:
        s['dur'] = ClipSource(path(s['clip']), s.get('in', 0), None, s.get('speed', 1.0)).duration
    t += s['dur']; s['end'] = t
    SHOTS.append(s)
TOTAL = t
CAPS = Captions(P.get('captions', []), path(FONT) if not os.path.isabs(FONT) else FONT, OW)
_src, _fx = {}, {}


def source(i):
    if i not in _src:
        s = SHOTS[i]
        if 'clip' in s:
            _src[i] = ClipSource(path(s['clip']), s.get('in', 0), s['dur'], s.get('speed', 1.0), FPS)
        elif 'image' in s:
            _src[i] = LivingImage(path(s['image']), s.get('live', {}), seed=i * 17)
        else:
            _src[i] = getattr(SC, s['scene'])()
        _fx[i] = (Rain(100 + i, density=s.get('rain', STYLE['rain'])) if s.get('rain', STYLE['rain']) > 0 else None,
                  GlassDrops(200 + i, (0, 0, W, H), n=s.get('glass_drops', 70)) if s.get('glass') else None)
        for k in [k for k in _src if abs(k - i) > 1]:
            del _src[k]; _fx.pop(k, None)
    return _src[i], _fx[i]


def shot_frame(i, t):
    s = SHOTS[i]; tl = min(max(0.0, t - s['start']), s['dur'] - 1e-3)
    src, (rain, glass) = source(i)
    fr = src.frame(tl) if 'scene' in s else src.frame(tl, s['dur'])
    fr = np.ascontiguousarray(fr, dtype=np.float32)
    if glass is not None:
        g = fr.copy(); glass.draw(fr, g, tl)
    if rain is not None:
        rain.draw(fr, tl, strength=s.get('rain_strength', 1.0))
    return fr


def frame_at(t):
    i = max(k for k, s in enumerate(SHOTS) if s['start'] <= t)
    s = SHOTS[i]; tl = t - s['start']; tr = s.get('transition', 'cut')
    fr = shot_frame(i, t)
    if i > 0 and tr == 'whip' and tl < 0.3:
        prev = shot_frame(i - 1, t); k = smooth(tl / 0.3); sh = int(W * 0.9)
        a = np.roll(prev, -int(sh * k), axis=1); b = np.roll(fr, int(sh * (1 - k)), axis=1)
        L = int(150 * math.sin(k * math.pi)) + 1
        fr = cv2.blur(a * (1 - k) + b * k, (L, 1))
    elif i > 0 and tr == 'fade' and tl < s.get('xfade', 0.6):
        prev = shot_frame(i - 1, t); k = smooth(tl / s.get('xfade', 0.6)); fr = prev * (1 - k) + fr * k
    elif i > 0 and tr == 'flash' and tl < 0.25:
        fr = fr + (255 - fr) * (1 - tl / 0.25)
    fr = wet_anime_look(fr, STYLE['grade'], STYLE['haze'])
    fr = grain(fr, int(t * 1000), STYLE['grain'])
    if t < 0.3:
        fr *= t / 0.3
    if t > TOTAL - 0.5:
        fr *= max(0.0, (TOTAL - t) / 0.5)
    fr = np.clip(fr, 0, 255)
    if ORIENT == 'sideways':
        fr = cv2.rotate(fr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    fr = CAPS.draw(np.ascontiguousarray(fr), t)
    return np.clip(fr, 0, 255).astype(np.uint8)


if A.preview:
    tiles = []
    for s in SHOTS:
        for k in (0.25, 0.75):
            tt = s['start'] + s['dur'] * k
            f = frame_at(tt)
            f = cv2.resize(f, (270, 480) if ORIENT == 'sideways' else (480, 270))
            cv2.putText(f, f'{tt:.1f}s', (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            tiles.append(f)
    cols = 8 if ORIENT == 'sideways' else 4
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    out = os.path.join(BASE, 'preview.jpg')
    cv2.imwrite(out, np.vstack([np.hstack(tiles[r:r + cols]) for r in range(0, len(tiles), cols)]))
    print('wrote', out); sys.exit()

t0, t1 = A.range if A.range else (0, TOTAL)
silent = A.out + '.silent.mp4'
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
for n in range(int(round(t0 * FPS)), int(round(t1 * FPS))):
    p.stdin.write(frame_at(n / FPS).tobytes())
    if n % (FPS * 2) == 0:
        print(f'{n / FPS:.1f}s / {t1:.1f}s', flush=True)
p.stdin.close(); p.wait()
au = P.get('audio', {})
mux(silent, A.out, t1 - t0, voice=path(au['voice']) if au.get('voice') else None, voice_delay=au.get('voice_delay', 0.0),
    ambience=au.get('rain_ambience', True), music=path(au['music']) if au.get('music') else None, music_vol=au.get('music_vol', 0.10))
os.remove(silent)
print('done', A.out)
