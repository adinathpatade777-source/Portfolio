"""Weather and water effects: rain layers, rain ripples on a water plane, splashes,
raindrops sliding on glass, god rays."""
import math
import numpy as np
import cv2
from .core import W, H, disc, stroke


class Rain:
    """Three depth layers of falling rain. Deterministic: frame(t) never depends on history."""

    def __init__(self, seed, density=1.0, angle=0.10, region=None):
        r = np.random.default_rng(seed)
        self.layers = []
        for n, length, th, alpha, speed, blur in ((420, 30, 1, 0.20, 1500, 0.6), (150, 64, 2, 0.30, 2300, 1.0), (28, 160, 5, 0.20, 3400, 3.0)):
            n = int(n * density)
            self.layers.append((r.uniform(0, 1, n), r.uniform(0, 1, n), r.uniform(0.75, 1.25, n), length, th, alpha, speed, blur))
        self.angle = angle
        self.region = region  # (x0, y0, x1, y1) or None for full frame

    def draw(self, img, t, color=(235, 242, 238), strength=1.0):
        x0, y0, x1, y1 = self.region or (0, 0, img.shape[1], img.shape[0])
        rw, rh = x1 - x0, y1 - y0
        dx, dy = math.sin(self.angle), math.cos(self.angle)
        c = np.array(color, np.float32)
        for xs, ys, ks, L, th, al, sp, bl in self.layers:
            m = np.zeros((rh, rw), np.float32)
            span_y = rh + L * 1.5
            for x, y, k in zip(xs, ys, ks):
                py = (y * span_y + t * sp * k) % span_y - L
                px = (x * (rw + 200) + py * dx / dy) % (rw + 200) - 100
                cv2.line(m, (int(px), int(py)), (int(px + dx * L * k), int(py + dy * L * k)), al * strength, th, cv2.LINE_AA)
            m = cv2.GaussianBlur(m, (0, 0), bl)[..., None]
            reg = img[y0:y1, x0:x1]
            reg *= 1 - m * 0.45
            reg += c * m


class Ripples:
    """Rain hitting a water plane seen at a low angle: rings expand, refract what is
    behind them (displacement map) and catch a bright crest. Extra 'events' (a foot
    landing, a drip) can be added with big amplitude."""

    def __init__(self, seed, box, n=40, squash=0.32, period=1.3, speed=150, amp=5.0):
        r = np.random.default_rng(seed)
        self.box = box
        x0, y0, x1, y1 = box
        self.drops = [(r.uniform(x0, x1), r.uniform(y0, y1), r.uniform(0, period)) for _ in range(n)]
        self.events = []  # (x, y, t_start, amp, speed, life)
        self.squash, self.period, self.speed, self.amp = squash, period, speed, amp
        gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        self.gx, self.gy = gx, gy

    def add_event(self, x, y, t0, amp=14.0, speed=260, life=1.6):
        self.events.append((x, y, t0, amp, speed, life))

    def field(self, t):
        gx, gy = self.gx, self.gy
        dx = np.zeros_like(gx); dy = np.zeros_like(gx); crest = np.zeros_like(gx)
        sh = 1.4 * np.sin(gx * 0.03 + t * 2.3) * np.sin(gy * 0.07 - t * 1.6)  # gentle surface shimmer
        dx += sh; dy += sh * 0.5
        rings = []
        for px, py, ph in self.drops:
            age = (t + ph) % self.period
            rings.append((px, py, age, self.amp * (1 - age / self.period) ** 1.5, self.speed, self.period))
        for x, y, t0, a, sp, life in self.events:
            age = t - t0
            if 0 <= age < life:
                rings.append((x, y, age, a * (1 - age / life) ** 1.2, sp, life))
                rings.append((x, y, max(0.0, age - 0.18), a * 0.6 * (1 - age / life), sp * 0.8, life))
        x0, y0 = self.box[0], self.box[1]
        sq = self.squash
        for px, py, age, amp, sp, life in rings:
            r = age * sp; R2 = r + 34
            ax0, ay0 = int(max(px - R2 - x0, 0)), int(max(py - R2 * sq - y0, 0))
            ax1, ay1 = int(min(px + R2 - x0, gx.shape[1])), int(min(py + R2 * sq - y0, gx.shape[0]))
            if ax1 <= ax0 or ay1 <= ay0 or amp < 0.05:
                continue
            ex = gx[ay0:ay1, ax0:ax1] - px; ey = (gy[ay0:ay1, ax0:ax1] - py) / sq
            d = np.sqrt(ex * ex + ey * ey) + 1e-3
            wv = np.sin((d - r) * 0.24) * np.exp(-((d - r) / 13.0) ** 2) * amp
            dx[ay0:ay1, ax0:ax1] += wv * ex / d
            dy[ay0:ay1, ax0:ax1] += wv * ey / d * sq
            crest[ay0:ay1, ax0:ax1] += np.clip(wv, 0, None) / max(amp, 1e-3) * (1 - age / life)
        return dx, dy, crest

    def apply(self, img_region, t):
        """Distort an image the size of the box; returns (distorted, crest)."""
        dx, dy, crest = self.field(t)
        h, w = img_region.shape[:2]
        mx = np.arange(w, dtype=np.float32)[None, :] + dx
        my = np.arange(h, dtype=np.float32)[:, None] + dy
        out = cv2.remap(img_region, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        return out, crest


class Splash:
    """Water droplets thrown up when a foot lands; simple ballistic particles."""

    def __init__(self, seed, x, y, t0, n=46, power=1.0):
        r = np.random.default_rng(seed)
        self.t0, self.x, self.y = t0, x, y
        self.p = [(r.uniform(-1, 1) * 480 * power, -r.uniform(280, 820) * power, r.uniform(2.5, 7.5), r.uniform(0.45, 0.8)) for _ in range(n)]

    def draw(self, img, t, color=(235, 245, 240)):
        age = t - self.t0
        if age < 0 or age > 0.9:
            return
        c = np.array(color, np.float32)
        for vx, vy, rad, life in self.p:
            if age > life:
                continue
            x = self.x + vx * age; y = self.y + vy * age + 0.5 * 2600 * age * age
            if y > self.y + 10:
                continue
            fade = 1 - age / life
            x2 = self.x + vx * (age - 0.025); y2 = self.y + vy * (age - 0.025) + 0.5 * 2600 * (age - 0.025) ** 2
            stroke(img, [(x2, y2), (x, y)], c, rad, alpha=0.75 * fade, blur=0.8)
            disc(img, (x, y), rad * 0.6, c, alpha=0.9 * fade)


class GlassDrops:
    """Raindrops on a window pane: each drop shows the scene behind it upside down
    (a tiny lens), with a highlight; some slide down leaving a wet trail."""

    def __init__(self, seed, box, n=90):
        r = np.random.default_rng(seed)
        self.box = box
        x0, y0, x1, y1 = box
        self.d = [(r.uniform(x0, x1), r.uniform(y0, y1), r.uniform(5, 22), r.uniform(0, 1), r.uniform(0, 3)) for _ in range(n)]

    def draw(self, img, src, t):
        x0, y0, x1, y1 = self.box
        blur = cv2.GaussianBlur(src, (0, 0), 2)
        for x, y, rr, kind, ph in self.d:
            slide = kind > 0.78
            v = (kind - 0.7) * 380 if slide else 0
            py = y + (v * (t + ph)) % (y1 - y0) if slide else y
            if py >= y1:
                py -= (y1 - y0)
            R = int(rr)
            if R < 3 or x - 3 * R < x0 or x + 3 * R > x1 or py - 3 * R < y0 or py + 3 * R > y1:
                continue
            patch = blur[int(py - 3 * R):int(py + 3 * R), int(x - 3 * R):int(x + 3 * R)]
            patch = cv2.resize(cv2.flip(patch, -1), (2 * R, int(2.2 * R))) * 1.1
            m = np.zeros(patch.shape[:2], np.float32)
            cv2.ellipse(m, (R, int(1.1 * R)), (int(R * 0.9), int(R * 1.05)), 0, 0, 360, 1, -1, cv2.LINE_AA)
            m = cv2.GaussianBlur(m, (0, 0), 0.8)[..., None]
            ty, tx = int(py - 1.1 * R), int(x - R)
            reg = img[ty:ty + patch.shape[0], tx:tx + patch.shape[1]]
            if reg.shape[:2] != patch.shape[:2]:
                continue
            reg[:] = reg * (1 - m) + (patch * 0.9 + 10) * m
            stroke(img, [(x - R * 0.85, py + R * 0.4), (x, py + R * 1.05), (x + R * 0.85, py + R * 0.4)], np.array([30, 40, 40], np.float32), max(1, R // 6), alpha=0.35)
            disc(img, (x - R * 0.35, py - R * 0.35), max(1.2, R * 0.2), np.array([255, 255, 255], np.float32), alpha=0.9)
            if slide:
                stroke(img, [(x, max(y0, py - 6 * R)), (x, py - R)], np.array([225, 235, 230], np.float32), max(1, R // 3), alpha=0.25, blur=1)


def god_rays(img, sun, t, strength=1.0, n=16, color=(150, 215, 255)):
    h, w = img.shape[:2]
    m = np.zeros((h // 2, w // 2), np.float32)
    sx, sy = sun[0] / 2, sun[1] / 2
    R = math.hypot(w, h)
    for k in range(n):
        a = k / n * 2 * math.pi + t * 0.04 + math.sin(k * 7.13) * 0.25
        wdt = 0.03 + 0.025 * abs(math.sin(k * 3.7))
        p = np.array([(sx, sy), (sx + math.cos(a - wdt) * R, sy + math.sin(a - wdt) * R), (sx + math.cos(a + wdt) * R, sy + math.sin(a + wdt) * R)], np.int32)
        cv2.fillPoly(m, [p], 0.55 + 0.45 * math.sin(t * 0.9 + k * 1.3), cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0, 0), 14)
    yy, xx = np.mgrid[0:h // 2, 0:w // 2].astype(np.float32)
    m *= np.clip(1 - np.hypot(xx - sx, yy - sy) / (R * 0.45), 0, 1)
    m = cv2.resize(m, (w, h))[..., None]
    img += m * np.array(color, np.float32) * 0.6 * strength
