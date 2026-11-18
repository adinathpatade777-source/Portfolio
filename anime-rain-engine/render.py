#!/usr/bin/env python3
"""Render the procedural anime rain short.

  python3 render.py --preview                 # contact sheet (preview.jpg)
  python3 render.py --out rain.mp4            # silent video + synthesized rain ambience
  python3 render.py --out rain.mp4 --voice voice.mp3 --captions captions.json

Scenes are painted landscape (1920x1080) and turned 90 degrees to fill a 9:16 phone
screen, like rainy-day anime wallpaper edits. Captions stay upright.
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from engine.core import W, H, smooth, grade, grain, vignette, bloom
from engine.scenes import PuddleSteps, RainPond, WindowDesk, SunBreak

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='anime_rain.mp4')
ap.add_argument('--preview', action='store_true')
ap.add_argument('--voice')
ap.add_argument('--captions', help='json list of {text, t0, t1, y?, size?}')
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--upright', action='store_true', help='keep 16:9 landscape instead of turning the frame sideways')
ap.add_argument('--font', default='/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf')
A = ap.parse_args()

TIMELINE = [  # (scene, start, transition into it)
    (PuddleSteps(), 0.0, 'cut'),
    (RainPond(), 2.0, 'whip'),
    (WindowDesk(), 3.5, 'cut'),
    (SunBreak(), 6.4, 'fade'),
]
TOTAL = TIMELINE[-1][1] + TIMELINE[-1][0].dur
VIG = vignette(H, W, 0.32)
OW, OH = (W, H) if A.upright else (H, W)

CAPS = json.load(open(A.captions)) if A.captions else []
_font_cache = {}


def caption_img(text, size):
    key = (text, size)
    if key in _font_cache:
        return _font_cache[key]
    f = ImageFont.truetype(A.font, size)
    d = ImageDraw.Draw(Image.new('L', (8, 8)))
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        tst = (cur + ' ' + w_).strip()
        if d.textlength(tst, font=f) > OW * 0.86 and cur:
            lines.append(cur); cur = w_
        else:
            cur = tst
    lines.append(cur)
    txt = '\n'.join(lines)
    bb = [int(round(v)) for v in d.multiline_textbbox((0, 0), txt, font=f, align='center', spacing=10)]
    pad = 30
    im = Image.new('RGBA', (bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).multiline_text((pad - bb[0], pad - bb[1]), txt, font=f, fill=(255, 255, 255, 255), align='center', spacing=10)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel('A').filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.6)))
    im = Image.alpha_composite(sh, im)
    a = np.asarray(im).astype(np.float32)
    _font_cache[key] = (a[..., [2, 1, 0]], a[..., 3] / 255)
    return _font_cache[key]


def draw_captions(fr, t):
    for c in CAPS:
        if not (c['t0'] <= t <= c['t1']):
            continue
        rgb, a = caption_img(c['text'], c.get('size', 60))
        al = min(1, (t - c['t0']) / 0.5, (c['t1'] - t) / 0.4)
        h, w = a.shape
        x0 = (OW - w) // 2; y0 = int(OH * c.get('y', 0.8) - h / 2)
        reg = fr[y0:y0 + h, x0:x0 + w]
        m = a[:reg.shape[0], :reg.shape[1], None] * al
        reg[:] = reg * (1 - m) + rgb[:reg.shape[0], :reg.shape[1]] * m
    return fr


def scene_frame(i, t):
    sc, st, _ = TIMELINE[i]
    return sc.frame(max(0.0, t - st))


def frame_at(t):
    i = max(k for k, (_, s, _) in enumerate(TIMELINE) if s <= t)
    fr = scene_frame(i, t)
    tr = TIMELINE[i][2]; tl = t - TIMELINE[i][1]
    if i > 0 and tr == 'whip' and tl < 0.32:
        prev = scene_frame(i - 1, t)
        k = smooth(tl / 0.32); sh = int(W * 0.9)
        a = np.roll(prev, -int(sh * k), axis=1); b = np.roll(fr, int(sh * (1 - k)), axis=1)
        L = int(160 * math.sin(k * math.pi)) + 1
        fr = cv2.blur(a * (1 - k) + b * k, (L, 1))
    if i > 0 and tr == 'fade' and tl < 0.6:
        prev = scene_frame(i - 1, t)
        k = smooth(tl / 0.6); fr = prev * (1 - k) + fr * k
    fr = grade(fr, 1.08) * VIG
    fr = bloom(fr, 215, 18, 0.25)
    fr = grain(fr, int(t * 1000), 3.0)
    if t < 0.3:
        fr *= t / 0.3
    if t > TOTAL - 0.5:
        fr *= max(0, (TOTAL - t) / 0.5)
    fr = np.clip(fr, 0, 255)
    if not A.upright:
        fr = cv2.rotate(fr, cv2.ROTATE_90_COUNTERCLOCKWISE)  # sky to the left, like the wallpaper edits
    fr = draw_captions(np.ascontiguousarray(fr), t)
    return np.clip(fr, 0, 255).astype(np.uint8)


if A.preview:
    times = [0.1, 0.6, 1.1, 1.6, 2.6, 3.2, 4.0, 5.0, 6.0, 7.0, 8.2, 9.4]
    tiles = []
    for t in times:
        f = frame_at(t)
        f = cv2.resize(f, (f.shape[1] * 360 // f.shape[0] if A.upright else 270, 360 if A.upright else 480))
        cv2.putText(f, f'{t:.1f}s', (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        tiles.append(f)
    cols = 6
    rows = [np.hstack(tiles[r * cols:(r + 1) * cols]) for r in range(math.ceil(len(tiles) / cols))]
    cv2.imwrite('preview.jpg', np.vstack(rows))
    print('wrote preview.jpg')
    sys.exit()

silent = A.out + '.silent.mp4'
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', str(A.fps), '-i', '-',
                      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
N = int(round(TOTAL * A.fps))
for n in range(N):
    p.stdin.write(frame_at(n / A.fps).tobytes())
    if n % (A.fps * 2) == 0:
        print(f'{n / A.fps:.1f}s / {TOTAL:.1f}s', flush=True)
p.stdin.close(); p.wait()

# rain ambience: filtered pink noise + sparse droplet ticks, ducked under the voice
amb = ('anoisesrc=color=pink:amplitude=0.6:d={d},highpass=f=300,lowpass=f=7000,volume=0.22[rn];'
       'anoisesrc=color=white:amplitude=0.9:d={d},highpass=f=2500,volume=0.05,'
       'apulsator=hz=7:amount=0.9[tk];[rn][tk]amix=inputs=2:normalize=0[amb]').format(d=TOTAL)
if A.voice:
    fc = (amb + ';[1:a]aresample=44100,asplit=2[v][k];[amb]aresample=44100[a2];'
          '[a2][k]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=500[d];[v][d]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', silent, '-i', A.voice, '-filter_complex', fc]
else:
    fc = amb + ';[amb]loudnorm=I=-20:TP=-2[a]'
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', silent, '-filter_complex', fc]
subprocess.run(cmd + ['-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(TOTAL), '-movflags', '+faststart', A.out], check=True)
os.remove(silent)
print('done', A.out)
