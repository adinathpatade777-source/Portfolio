"""Finishing pass shared by every shot: rainy-anime look, captions, audio mix."""
import math
import subprocess
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from .core import W, H, vignette

VIG = vignette(H, W, 0.30)


def wet_anime_look(img, strength=1.0, haze=0.35, sat=1.12):
    """Teal/emerald grade with soft glow, the look of rainy-day anime films."""
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    hsv = cv2.cvtColor(u8, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * (1 + (sat - 1) * strength), 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    lum = out.mean(2, keepdims=True) / 255
    out += strength * ((1 - lum) ** 2 * np.array([16, 8, -6], np.float32) + lum ** 2 * np.array([-4, 4, 6], np.float32))
    if haze:
        small = cv2.resize(out, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        glow = cv2.resize(cv2.GaussianBlur(small, (0, 0), 4), (W, H))
        out = out * (1 - haze * 0.5) + glow * haze * 0.55 + np.clip(glow - 170, 0, None) * haze
    return out * VIG


def grain(img, seed, amt=3.0):
    r = np.random.default_rng(seed)
    n = r.normal(0, amt, (img.shape[0] // 2, img.shape[1] // 2)).astype(np.float32)
    return img + cv2.resize(n, (img.shape[1], img.shape[0]))[..., None]


class Captions:
    def __init__(self, caps, font, frame_w):
        self.caps, self.font, self.fw, self.cache = caps or [], font, frame_w, {}

    def _img(self, text, size):
        key = (text, size)
        if key in self.cache:
            return self.cache[key]
        f = ImageFont.truetype(self.font, size)
        d = ImageDraw.Draw(Image.new('L', (8, 8)))
        lines, cur = [], ''
        for w_ in text.split():
            tst = (cur + ' ' + w_).strip()
            if d.textlength(tst, font=f) > self.fw * 0.86 and cur:
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
        a = np.asarray(Image.alpha_composite(sh, im)).astype(np.float32)
        self.cache[key] = (a[..., [2, 1, 0]], a[..., 3] / 255)
        return self.cache[key]

    def draw(self, fr, t):
        fh, fw = fr.shape[:2]
        for c in self.caps:
            if not (c['t0'] <= t <= c['t1']):
                continue
            rgb, a = self._img(c['text'], c.get('size', 60))
            al = min(1, (t - c['t0']) / 0.5, (c['t1'] - t) / 0.4)
            h, w = a.shape
            x0 = (fw - w) // 2; y0 = int(fh * c.get('y', 0.8) - h / 2)
            reg = fr[y0:y0 + h, x0:x0 + w]
            m = a[:reg.shape[0], :reg.shape[1], None] * al
            reg[:] = reg * (1 - m) + rgb[:reg.shape[0], :reg.shape[1]] * m
        return fr


def mux(silent, out, total, voice=None, voice_delay=0.0, ambience=True, clip_audio=None, music=None, music_vol=0.10):
    """Mix voice (+ delay), synthesized rain ambience and optional music; music/rain duck under the voice."""
    ins = ['-i', silent]
    parts, mixes = [], []
    idx = 1
    if ambience:
        parts.append(f'anoisesrc=color=pink:amplitude=0.6:d={total},highpass=f=300,lowpass=f=7000,volume=0.20[rn];'
                     f'anoisesrc=color=white:amplitude=0.9:d={total},highpass=f=2500,volume=0.05,apulsator=hz=7:amount=0.9[tk];'
                     '[rn][tk]amix=inputs=2:normalize=0,aresample=44100[amb]')
        mixes.append('[amb]')
    if music:
        ins += ['-stream_loop', '-1', '-i', music]
        parts.append(f'[{idx}:a]aresample=44100,volume={music_vol}[mus]'); mixes.append('[mus]'); idx += 1
    if voice:
        ins += ['-i', voice]
        ms = int(voice_delay * 1000)
        parts.append(f'[{idx}:a]aresample=44100,adelay={ms}|{ms},apad,asplit=2[v][key]'); idx += 1
        if mixes:
            parts.append(f'{"".join(mixes)}amix=inputs={len(mixes)}:normalize=0[bed];[bed][key]sidechaincompress=threshold=0.03:ratio=4:attack=30:release=500[duck]')
            parts.append('[v][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]')
        else:
            parts.append('[key]anullsink;[v]loudnorm=I=-14:TP=-1.5[a]')
    elif mixes:
        parts.append(f'{"".join(mixes)}amix=inputs={len(mixes)}:normalize=0,loudnorm=I=-20:TP=-2[a]')
    else:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', silent, '-c', 'copy', out], check=True)
        return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(parts), '-map', '0:v', '-map', '[a]',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(total), '-movflags', '+faststart', out], check=True)
