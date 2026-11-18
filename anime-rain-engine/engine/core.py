"""Drawing primitives for the procedural anime engine.

Everything works on float32 BGR images (0..255). Shapes are drawn into a small
local mask (bounding box only) with 4x sub-pixel anti-aliasing, so hundreds of
shapes per frame stay fast.
"""
import math
import numpy as np
import cv2

W, H = 1920, 1080  # every scene is painted landscape, then turned sideways for 9:16


def col(h):
    h = h.lstrip('#')
    return np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], np.float32)  # BGR


def mix(a, b, k):
    return a * (1 - k) + b * k


def clamp01(x):
    return min(1.0, max(0.0, x))


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp01(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def vgrad(h, w, stops):
    """Vertical gradient. stops = [(pos0..1, '#hex'), ...]."""
    y = np.linspace(0, 1, h, dtype=np.float32)
    out = np.zeros((h, 3), np.float32)
    ps = [p for p, _ in stops]
    cs = [col(c) for _, c in stops]
    for ch in range(3):
        out[:, ch] = np.interp(y, ps, [c[ch] for c in cs])
    return np.repeat(out[:, None, :], w, axis=1)


def fbm(h, w, seed, base=4, octaves=5, persistence=0.55):
    """Fractal value noise in 0..1 (cheap: resized random grids)."""
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh = max(2, int(base * 2 ** o)); gw = max(2, int(gh * w / h))
        g = r.random((gh, gw)).astype(np.float32)
        acc += cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC) * amp
        tot += amp; amp *= persistence
    acc /= tot
    lo, hi = np.percentile(acc, 1), np.percentile(acc, 99)
    return np.clip((acc - lo) / (hi - lo + 1e-6), 0, 1)


def _bbox(pts, pad, shape):
    h, w = shape[:2]
    x0 = max(int(math.floor(pts[:, 0].min())) - pad, 0); y0 = max(int(math.floor(pts[:, 1].min())) - pad, 0)
    x1 = min(int(math.ceil(pts[:, 0].max())) + pad, w); y1 = min(int(math.ceil(pts[:, 1].max())) + pad, h)
    return x0, y0, x1, y1


def _blend(img, m, x0, y0, color, alpha, mode='normal'):
    m = m[..., None] * alpha
    reg = img[y0:y0 + m.shape[0], x0:x0 + m.shape[1]]
    if mode == 'add':
        reg += m * color
    else:
        reg *= 1 - m
        reg += m * color


def fill(img, pts, color, alpha=1.0, blur=0.0, mode='normal'):
    pts = np.asarray(pts, np.float32).reshape(-1, 2)
    pad = 2 + int(3 * blur)
    x0, y0, x1, y1 = _bbox(pts, pad, img.shape)
    if x1 <= x0 or y1 <= y0:
        return
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.fillPoly(m, [np.round((pts - [x0, y0]) * 4).astype(np.int32)], 1.0, cv2.LINE_AA, shift=2)
    if blur:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    _blend(img, m, x0, y0, color, alpha, mode)


def stroke(img, pts, color, thick, alpha=1.0, closed=False, blur=0.0, mode='normal'):
    pts = np.asarray(pts, np.float32).reshape(-1, 2)
    pad = int(thick) + 2 + int(3 * blur)
    x0, y0, x1, y1 = _bbox(pts, pad, img.shape)
    if x1 <= x0 or y1 <= y0:
        return
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.polylines(m, [np.round((pts - [x0, y0]) * 4).astype(np.int32)], closed, 1.0, max(1, int(round(thick))), cv2.LINE_AA, shift=2)
    if blur:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    _blend(img, m, x0, y0, color, alpha, mode)


def disc(img, c, r, color, alpha=1.0, blur=0.0, mode='normal', ry=None):
    ry = r if ry is None else ry
    pad = 2 + int(3 * blur)
    x0, y0 = max(int(c[0] - r) - pad, 0), max(int(c[1] - ry) - pad, 0)
    x1, y1 = min(int(c[0] + r) + pad + 1, img.shape[1]), min(int(c[1] + ry) + pad + 1, img.shape[0])
    if x1 <= x0 or y1 <= y0 or r <= 0:
        return
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.ellipse(m, (int(round((c[0] - x0) * 4)), int(round((c[1] - y0) * 4))), (int(r * 4), int(ry * 4)), 0, 0, 360, 1.0, -1, cv2.LINE_AA, shift=2)
    if blur:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    _blend(img, m, x0, y0, color, alpha, mode)


def xform(pts, origin, angle_deg=0.0, scale=1.0, pivot=(0, 0)):
    """Rotate/scale local points around a local pivot, then place the pivot at origin."""
    a = math.radians(angle_deg); ca, sa = math.cos(a), math.sin(a)
    p = (np.asarray(pts, np.float32) - pivot) * scale
    return np.stack([p[:, 0] * ca - p[:, 1] * sa, p[:, 0] * sa + p[:, 1] * ca], 1) + origin


def bezier(p0, p1, p2, p3, n=24):
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    p0, p1, p2, p3 = map(lambda q: np.asarray(q, np.float32), (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def thick_line(pts, widths):
    """Polygon outlining a polyline with varying width (for limbs, strands, branches)."""
    pts = np.asarray(pts, np.float32); n = len(pts)
    d = np.gradient(pts, axis=0); d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    w = np.broadcast_to(np.asarray(widths, np.float32), (n,))[:, None] / 2
    return np.concatenate([pts + nrm * w, (pts - nrm * w)[::-1]])


def bloom(img, thr=190, sigma=22, k=0.45):
    b = np.clip(img - thr, 0, None)
    return img + cv2.GaussianBlur(b, (0, 0), sigma) * k


def vignette(h, w, strength=0.35):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = 1 - strength * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) ** 1.3
    return np.clip(v, 0.5, 1)[..., None]


def grade(img, sat=1.1, cool_shadows=True):
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    hsv = cv2.cvtColor(u8, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    if cool_shadows:
        lum = out.mean(2, keepdims=True) / 255
        out += (1 - lum) ** 2 * np.array([14, 6, -6], np.float32)
    return out


def grain(img, seed, amt=4.0):
    r = np.random.default_rng(seed)
    n = r.normal(0, amt, (img.shape[0] // 2, img.shape[1] // 2)).astype(np.float32)
    return img + cv2.resize(n, (img.shape[1], img.shape[0]))[..., None]
