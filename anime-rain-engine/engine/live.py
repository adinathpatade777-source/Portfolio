"""Living images: bring a painted anime frame to life without turning it into a slideshow.

Motion happens INSIDE the frame (like real anime cuts, where the camera is nearly still):
  - water: rain ripples that refract the water (+ bright crests)
  - sway: foliage trembles (auto green mask, nearer leaves move more)
  - wiggle: looping motion of a body part (writing hand, foot tap, breathing torso)
  - rack: focus pull between depths
  - move: camera, including 'dolly' = true 2.5D depth parallax (near things move more)

All boxes are normalized [x0, y0, x1, y1] in the source image (landscape).
"""
import math
import os
import numpy as np
import cv2
from .core import W, H, smooth
from .fx import Ripples

_MIDAS = None


def estimate_depth(img, model_path=None):
    """MiDaS small (ONNX) if available, else 'lower in frame = nearer'. Returns 0..1, 1 = near."""
    global _MIDAS
    path = model_path or os.environ.get('MIDAS_ONNX') or os.path.join(os.path.dirname(__file__), '..', 'models', 'midas_small.onnx')
    if not os.path.exists(path):
        return np.tile(np.linspace(0.1, 1, img.shape[0], dtype=np.float32)[:, None], (1, img.shape[1]))
    import onnxruntime as ort
    if _MIDAS is None:
        _MIDAS = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    x = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (256, 256)).astype(np.float32) / 255.
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    d = _MIDAS.run(None, {_MIDAS.get_inputs()[0].name: x})[0][0]
    d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(d, 2), np.percentile(d, 99)
    return cv2.GaussianBlur(np.clip((d - lo) / (hi - lo + 1e-6), 0, 1), (0, 0), 3).astype(np.float32)


def cover(img, w, h):
    s = max(w / img.shape[1], h / img.shape[0])
    r = cv2.resize(img, (max(w, round(img.shape[1] * s)), max(h, round(img.shape[0] * s))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    y0, x0 = (r.shape[0] - h) // 2, (r.shape[1] - w) // 2
    return r[y0:y0 + h, x0:x0 + w]


def box_mask(shape, box, feather):
    h, w = shape
    m = np.zeros((h, w), np.float32)
    m[int(box[1] * h):int(box[3] * h), int(box[0] * w):int(box[2] * w)] = 1
    return cv2.GaussianBlur(m, (0, 0), feather) if feather else m


class LivingImage:
    MARGIN = 1.12  # extra canvas so the camera can move without showing edges

    def __init__(self, path, spec, seed=0):
        src = cv2.imread(path, cv2.IMREAD_COLOR)
        if src is None:
            raise FileNotFoundError(path)
        self.spec = spec
        bw, bh = int(W * self.MARGIN), int(H * self.MARGIN)
        self.bg = cover(src, bw, bh).astype(np.float32)
        self.depth = cover(estimate_depth(src), bw, bh)
        self.bw, self.bh = bw, bh
        gy, gx = np.mgrid[0:bh, 0:bw].astype(np.float32)
        self.gx, self.gy = gx, gy
        oy, ox = np.mgrid[0:H, 0:W].astype(np.float32)
        self.ox, self.oy = ox + (bw - W) / 2, oy + (bh - H) / 2
        r = np.random.default_rng(seed)
        if spec.get('sway'):
            hsv = cv2.cvtColor(np.clip(self.bg, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
            m = ((hsv[..., 0] > 28) & (hsv[..., 0] < 95) & (hsv[..., 1] > 50)).astype(np.float32)
            if 'sway_box' in spec:
                m *= box_mask((bh, bw), spec['sway_box'], 8)
            self.sway = cv2.GaussianBlur(m, (0, 0), 6) * (0.35 + 0.65 * self.depth)
            self.phase = cv2.resize(r.uniform(0, 6.28, (6, 6)).astype(np.float32), (bw, bh), interpolation=cv2.INTER_CUBIC)
        self.wiggles = [(box_mask((bh, bw), g['box'], 16), g) for g in spec.get('wiggle', [])]
        self.rip = None
        if spec.get('water'):
            b = spec['water']
            box = (int(b[0] * bw), int(b[1] * bh), int(b[2] * bw), int(b[3] * bh))
            self.rip = Ripples(seed + 7, box, n=int(spec.get('drops', 45)), squash=spec.get('squash', 0.3), amp=spec.get('ripple_amp', 5.0))
            self.wmask = box_mask((bh, bw), b, 10)[box[1]:box[3], box[0]:box[2]]
        if spec.get('rack'):
            self.blur = cv2.GaussianBlur(self.bg, (0, 0), 9)

    def _living(self, t):
        s = self.spec
        mx = np.zeros((self.bh, self.bw), np.float32); my = np.zeros_like(mx)
        crest = None
        if s.get('sway'):
            v = (np.sin(t * 2.1 + self.phase) * 0.7 + np.sin(t * 5.3 + self.phase * 1.7) * 0.3) * self.sway * s['sway']
            mx += v; my += v * 0.3
        for m, g in self.wiggles:
            ax, ay = g.get('amp', [4, 3]); f = g.get('freq', 2.0) * 2 * math.pi
            mx -= m * math.sin(t * f) * ax
            my -= m * math.sin(t * f * 2 + 0.7) * ay
        if self.rip is not None:
            x0, y0, x1, y1 = self.rip.box
            dx, dy, cr = self.rip.field(t)
            mx[y0:y1, x0:x1] += dx * self.wmask; my[y0:y1, x0:x1] += dy * self.wmask
            crest = (y0, y1, x0, x1, cr * self.wmask)
        out = cv2.remap(self.bg, self.gx + mx, self.gy + my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        if crest is not None:
            y0, y1, x0, x1, c = crest
            out[y0:y1, x0:x1] += c[..., None] * np.array([80, 90, 85], np.float32) * self.spec.get('crest', 1.6)
        return out

    def frame(self, t, dur):
        s = self.spec
        img = self._living(t)
        if s.get('rack'):
            f0, f1 = s['rack']
            f = f0 + (f1 - f0) * smooth(t / max(dur, 1e-3))
            wgt = np.clip(np.abs(self.depth - f) * 2.6 - 0.15, 0, 1)[..., None]
            img = img * (1 - wgt) + self.blur * wgt
        mv = s.get('move', {'type': 'hold'})
        kind = mv.get('type', 'hold'); am = mv.get('amount', 0.04); e = smooth(t / max(dur, 1e-3))
        dx, dy = mv.get('dir', [1, 0])
        cx, cy = self.bw / 2, self.bh / 2
        if kind == 'dolly':  # 2.5D parallax: per-pixel zoom/shift by depth (inverse warp, refined)
            dd = np.full_like(self.ox, 0.5)
            for _ in range(3):
                sc = 1 + am * e * (0.3 + 1.4 * dd)
                tx = -dx * am * W * (e - 0.5) * (0.2 + 1.6 * dd); ty = -dy * am * H * (e - 0.5) * (0.2 + 1.6 * dd)
                xs = (cx + (self.ox - cx - tx) / sc).astype(np.float32); ys = (cy + (self.oy - cy - ty) / sc).astype(np.float32)
                dd = cv2.remap(self.depth, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        else:
            sc = 1.0; tx = ty = 0.0
            if kind == 'push':
                sc = 1 + am * e
            elif kind == 'pull':
                sc = 1 + am * (1 - e)
            elif kind == 'drift':
                tx, ty = -dx * am * W * (e - 0.5), -dy * am * H * (e - 0.5)
            hand = mv.get('handheld', 0.0)  # subtle camera breathing
            tx += hand * (math.sin(t * 1.3) * 3 + math.sin(t * 3.1) * 1.2); ty += hand * (math.cos(t * 1.1) * 2.5)
            xs = (cx + (self.ox - cx - tx) / sc).astype(np.float32); ys = (cy + (self.oy - cy - ty) / sc).astype(np.float32)
        return cv2.remap(img, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


class ClipSource:
    """A video clip (e.g. from Google Vids / Veo): trimmed, speed-ramped, scaled to cover the frame.
    Frames for the used segment are decoded once and kept as uint8."""

    def __init__(self, path, start=0.0, dur=None, speed=1.0, fps=30):
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise FileNotFoundError(path)
        self.src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        n_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.speed = speed
        need = (dur or (n_total / self.src_fps - start)) * speed + 0.2
        cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        self.frames = []
        while len(self.frames) < need * self.src_fps:
            ok, f = cap.read()
            if not ok:
                break
            self.frames.append(cover(f, W, H))
        cap.release()
        if not self.frames:
            raise ValueError(f'no frames read from {path}')
        self.duration = len(self.frames) / self.src_fps / speed

    def frame(self, t, dur=None):
        k = min(int(t * self.speed * self.src_fps), len(self.frames) - 1)
        return self.frames[k].astype(np.float32)
