"""Four procedural rain scenes. Each scene paints its static layers once in __init__
and animates everything that moves in frame(t). t is seconds since the scene started."""
import math
import numpy as np
import cv2
from .core import W, H, col, mix, vgrad, fbm, fill, stroke, disc, xform, bezier, thick_line, smooth, ease_out, bloom
from .fx import Rain, Ripples, Splash, GlassDrops, god_rays
from .rigs import sneaker, step_pose, seated_boy, writing_tip, maple


def park_backdrop(seed, horizon, blur=6.0):
    """Soft, out-of-focus park: misty sky, tree trunks, foliage masses, bokeh."""
    img = vgrad(H, W, [(0, '#d7e7e0'), (0.35, '#a9cbb8'), (horizon / H, '#5e8f6b'), (1, '#3d5a4f')])
    r = np.random.default_rng(seed)
    n = fbm(H, W, seed + 1, base=3)
    n2 = fbm(H, W, seed + 2, base=6)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    canopy = np.clip((n - 0.42) * 6, 0, 1) * np.clip((horizon / H + 0.02 - yy) * 8, 0, 1) * np.clip(yy * 3.5, 0, 1)
    img = img * (1 - canopy[..., None]) + mix(col('#3f7d4f'), col('#86bd6e'), (n2 > 0.55).astype(np.float32)[..., None] * 0.8) * canopy[..., None]
    for _ in range(9):
        x = r.uniform(0, W); w = r.uniform(16, 60)
        fill(img, [(x, -10), (x + w, -10), (x + w * 1.2, horizon + 10), (x - w * 0.2, horizon + 10)], col('#2a3b33'), 0.75)
    for _ in range(45):
        disc(img, (r.uniform(0, W), r.uniform(0, horizon)), r.uniform(8, 38), mix(col('#e9f3c8'), col('#9fd29a'), r.uniform()), alpha=r.uniform(0.12, 0.35), blur=2)
    img = cv2.GaussianBlur(img, (0, 0), blur)
    return img


class PuddleSteps:
    """Ground-level close-up: sneakers step into a rain puddle. The puddle mirrors the
    park and the shoes; rain rings and the landing splash distort the reflection."""
    dur = 2.0

    def __init__(self, seed=11):
        self.g = 640  # sole line
        self.bg = park_backdrop(seed, self.g - 40)
        # stone path (outside the puddle)
        tex = fbm(H, W, seed + 5, base=10)[..., None]
        path = vgrad(H, W, [(0, '#55605d'), (1, '#36403f')]) * (0.82 + 0.3 * tex)
        yy = np.mgrid[0:H, 0:W][0]
        self.bg[self.g - 20:] = path[self.g - 20:]
        for k in range(7):  # paving joints in perspective
            y = self.g + 10 + (k ** 1.7) * 18
            stroke(self.bg, [(0, y), (W, y)], col('#2a312f'), 2 + k * 0.6, 0.5)
        # reflection source: everything above the sole line, mirrored, darker and cooler
        top = self.bg[:self.g].copy()
        self.refl = np.zeros_like(self.bg)
        rows = min(H - self.g, self.g)
        self.refl[self.g:self.g + rows] = top[::-1][:rows] * 0.72 + col('#0e2a2a') * 0.28
        edge = fbm(H, W, seed + 9, base=5)
        yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
        ell = ((np.arange(W)[None, :] - 980) / 1150.0) ** 2 + ((np.arange(H)[:, None] - 900) / 330.0) ** 2
        m = ((ell < 1.0) & (yy * H > self.g - 6)).astype(np.float32) * np.clip((edge - 0.18) * 5, 0, 1)
        self.pmask = cv2.GaussianBlur(m, (0, 0), 5)[..., None]
        self.rip = Ripples(seed + 3, (0, self.g, W, H), n=55, squash=0.28)
        self.rain = Rain(seed + 4, density=1.0)
        self.stand_x = 520  # back foot (standing)
        self.step = (0.15, 1.05)  # step timing
        self.land_x = 1180
        self.rip.add_event(self.land_x + 170, self.g + 18, self.step[1] - 0.02, amp=16, speed=300, life=1.4)
        self.splash = Splash(seed + 6, self.land_x + 170, self.g + 6, self.step[1] - 0.02, power=1.0)

    def feet(self, img, t, mirror=False, dark=0.0):
        my = self.g if mirror else None
        u = (t - self.step[0]) / (self.step[1] - self.step[0])
        # standing foot shifts weight, then begins the next heel lift at the end
        u2 = (t - 1.55) / 0.9
        o2, a2, p2 = step_pose(min(u2, 0.24), self.stand_x, self.stand_x + 700, self.g)
        sneaker(img, o2, a2, p2, 1.0, mirror_y=my, dark=dark + 0.12)
        o, a, p = step_pose(u, self.stand_x - 260, self.land_x, self.g)
        if u <= 0:
            o, a, p = (self.stand_x - 260, self.g), 0.0, (0, 0)
        sneaker(img, o, a, p, 1.0, mirror_y=my, dark=dark)

    def frame(self, t):
        img = self.bg.copy()
        refl = self.refl.copy()
        self.feet(refl, t, mirror=True, dark=0.35)
        reg, crest = self.rip.apply(refl[self.g:], t)
        refl[self.g:] = reg + crest[..., None] * np.array([90, 100, 95], np.float32)
        img = img * (1 - self.pmask) + refl * self.pmask
        self.feet(img, t)
        self.splash.draw(img, t)
        self.rain.draw(img, t)
        return img


class RainPond:
    """Park pond in the rain: misty skyline, tree line, swaying willow strands,
    reflection with ripples, bobbing lily pads."""
    dur = 1.5

    def __init__(self, seed=21):
        self.hz = 500
        r = np.random.default_rng(seed)
        sky = vgrad(H, W, [(0, '#9db8bb'), (self.hz / H, '#dbe6e0'), (1, '#dbe6e0')])
        cl = fbm(H, W, seed, base=3)[..., None]
        img = sky + (cl - 0.5) * 30
        for _ in range(28):  # misty city
            x = r.uniform(250, W - 100); w = r.uniform(40, 120); h = r.uniform(60, 260)
            c = mix(col('#8fa6aa'), col('#c9d6d3'), r.uniform(0.2, 0.7))
            fill(img, [(x, self.hz - h), (x + w, self.hz - h), (x + w, self.hz + 2), (x, self.hz + 2)], c)
        img = cv2.GaussianBlur(img, (0, 0), 1.6)
        x = np.arange(W, dtype=np.float32)
        for band, (base_h, amp, ca, cb, sd) in enumerate([(70, 70, '#5f8f78', '#88b494', 3), (40, 120, '#2e5a42', '#4f8a5a', 7)]):
            prof = fbm(64, W, seed + sd, base=2, octaves=4)[32]
            top = self.hz - base_h - amp * prof
            yy = np.arange(H, dtype=np.float32)[:, None]
            m = np.clip((yy - top[None, :]) / 6, 0, 1) * (yy < self.hz + 4)
            tex = fbm(H, W, seed + sd + 1, base=5)
            c = mix(col(ca), col(cb), (tex > 0.55).astype(np.float32)[..., None])
            img = img * (1 - m[..., None]) + c * m[..., None]
        self.upper = img.copy()
        water = img[:self.hz][::-1].copy()
        rows = H - self.hz
        w = cv2.resize(water, (W, rows), interpolation=cv2.INTER_LINEAR)
        w = w * 0.62 + col('#123a38') * 0.38
        for _ in range(60):  # painted horizontal light streaks on the water
            y = r.uniform(0, rows); x0 = r.uniform(0, W); L = r.uniform(80, 400)
            stroke(w, [(x0, y), (x0 + L, y)], col('#cfe3dc'), r.uniform(1, 3), r.uniform(0.08, 0.25), blur=1)
        self.water = w
        self.rip = Ripples(seed + 3, (0, 0, W, rows), n=70, squash=0.3)
        self.pads = [(r.uniform(100, W - 100), r.uniform(80, rows - 40), r.uniform(0, 6.28)) for _ in range(14)]
        self.strands = [(r.uniform(1150, W + 80), r.uniform(-40, 40), r.uniform(380, 760), r.uniform(0, 6.28)) for _ in range(18)]
        self.rain = Rain(seed + 4, density=1.1)

    def frame(self, t):
        img = self.upper.copy()
        wreg, crest = self.rip.apply(self.water, t)
        wreg += crest[..., None] * np.array([80, 95, 90], np.float32)
        for px, py, ph in self.pads:
            s = 0.4 + py / (H - self.hz) * 1.1
            yb = py + 3 * math.sin(t * 2.2 + ph)
            disc(wreg, (px, yb), 46 * s, col('#2f6b3c'), ry=14 * s)
            disc(wreg, (px - 4 * s, yb - 3 * s), 38 * s, col('#4f9a52'), ry=10 * s)
            fill(wreg, [(px, yb), (px + 46 * s, yb - 6 * s), (px + 46 * s, yb + 6 * s)], col('#1d4a3a'))
        img[self.hz:] = wreg
        for ax, ay, L, ph in self.strands:  # willow strands sway (more at the tips)
            n = 28
            s = np.linspace(0, 1, n, dtype=np.float32)
            sway = 26 * s ** 1.6 * np.sin(t * 1.4 + ph + s * 1.5) + 8 * s * np.sin(t * 3.1 + ph * 2)
            pts = np.stack([ax - 60 * s + sway, ay + s * L], 1)
            stroke(img, pts, col('#355f37'), 2, 0.9)
            for k in range(1, n):
                side = 1 if k % 2 == 0 else -1
                p = pts[k]
                fill(img, [p, p + (side * 9, 14), p + (side * 2, 26)], col('#6aad5c') if side > 0 else col('#3d7a45'), 0.95)
        for k in range(9):  # overhanging foliage clumps the strands hang from
            cx = 1150 + k * 95; disc(img, (cx, 20 + 18 * math.sin(k * 2.1)), 90 + 20 * math.sin(k * 1.3), col('#2d5c36') if k % 2 else col('#3f7a45'), ry=55)
        self.rain.draw(img, t)
        return img


class WindowDesk:
    """Backlit boy writing numbers at a desk by a rainy window: IK writing arm,
    ink appearing on the page, blink, breathing, steam, drops sliding on the glass."""
    dur = 2.9

    def __init__(self, seed=31):
        r = np.random.default_rng(seed)
        self.win = (420, 70, 1860, 740)
        x0, y0, x1, y1 = self.win
        room = vgrad(H, W, [(0, '#1b2b30'), (0.7, '#24363a'), (1, '#1a2427')])
        out = vgrad(H, W, [(0, '#e5f2e6'), (0.5, '#a9d4a8'), (1, '#6fae7c')])
        n = fbm(H, W, seed, base=4)
        out = out * (0.8 + 0.35 * n[..., None])
        for _ in range(70):
            disc(out, (r.uniform(x0, x1), r.uniform(y0, y1)), r.uniform(20, 70), mix(col('#f5f7d8'), col('#7fbf6e'), r.uniform()), alpha=r.uniform(0.15, 0.5), blur=3)
        self.outside = cv2.GaussianBlur(out, (0, 0), 7)
        self.room = room
        self.rain_out = Rain(seed + 2, density=0.8, region=self.win)
        self.glass = GlassDrops(seed + 3, self.win, n=110)
        self.ink = []  # filled lazily: pencil-tip samples
        self.rng = r

    def frame(self, t):
        img = self.room.copy()
        x0, y0, x1, y1 = self.win
        win = self.outside.copy()
        self.rain_out.draw(win, t, color=(250, 252, 245), strength=0.9)
        img[y0:y1, x0:x1] = win[y0:y1, x0:x1]
        self.glass.draw(img, win, t)
        wood = col('#2a211b')
        for rect in [(x0 - 26, y0 - 26, x1 + 26, y0), (x0 - 26, y1, x1 + 26, y1 + 30), (x0 - 26, y0, x0, y1), (x1, y0, x1 + 26, y1), (1110, y0, 1134, y1), (x0, 400, x1, 422)]:
            a, b, c, d = rect
            fill(img, [(a, b), (c, b), (c, d), (a, d)], wood)
        # light spill and desk
        fill(img, [(0, 770), (W, 770), (W, H), (0, H)], col('#5a3f2c'))
        fill(img, [(560, 770), (1840, 770), (1980, H), (720, H)], col('#c99a66'), 0.55, blur=30)
        stroke(img, [(0, 770), (W, 770)], col('#e8c79a'), 3, 0.6)
        # notebook
        page = [(760, 790), (1190, 784), (1230, 990), (740, 1000)]
        fill(img, page, col('#efe8d6'))
        fill(img, [(980, 787), (992, 787), (1000, 995), (986, 996)], col('#c9c0aa'))
        for k in range(8):
            y = 812 + k * 24
            stroke(img, [(770, y), (1200, y - 3)], col('#a9bfd0'), 1.5, 0.6)
        # ink: everything the pencil tip has written so far
        ink = []
        tt = 0.0
        while tt <= t:
            p, down = writing_tip(tt)
            ink.append((p, down)); tt += 1 / 90
        seg = []
        for p, down in ink:
            if down:
                seg.append(p)
            elif len(seg) > 1:
                stroke(img, seg, col('#2b2d36'), 2.4, 0.9); seg = []
            else:
                seg = []
        if len(seg) > 1:
            stroke(img, seg, col('#2b2d36'), 2.4, 0.9)
        # mug + steam
        fill(img, [(1480, 640), (1590, 640), (1585, 770), (1485, 770)], col('#d9d2c2'))
        fill(img, [(1480, 640), (1520, 640), (1515, 770), (1485, 770)], col('#a59d8e'))
        disc(img, (1535, 640), 55, col('#3a2a20'), ry=12)
        stroke(img, [(1590, 670), (1625, 690), (1622, 730), (1588, 745)], col('#d9d2c2'), 12)
        for k in range(3):
            s = np.linspace(0, 1, 30, dtype=np.float32)
            xs = 1520 + k * 22 + 18 * np.sin(s * 6 + t * 2.2 + k) * s
            ys = 625 - s * 210 - (t * 40 % 30)
            stroke(img, np.stack([xs, ys], 1), col('#f2f4ef'), 6, 0.10 + 0.05 * k, blur=4)
        seated_boy(img, t)
        # window light falls on the boy's side: soft additive glow
        disc(img, (1000, 400), 520, col('#a8d8c0'), alpha=0.10, blur=60, mode='add')
        return img


class SunBreak:
    """Looking up past wet maple leaves: clouds part, the sun breaks through,
    rays fan out, drops grow on leaf tips and fall, the rain thins out."""
    dur = 3.3

    def __init__(self, seed=41):
        self.sun = np.array([1340, 360], np.float32)
        self.sky = vgrad(H, W, [(0, '#24566e'), (0.45, '#6fa6b5'), (0.8, '#f0c88c'), (1, '#f6d8a6')])
        cn = fbm(H, W, seed, base=2, octaves=6, persistence=0.5)
        yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
        self.cn = np.clip(cn * (0.75 + 0.45 * np.exp(-((yy - 0.45) / 0.35) ** 2)), 0, 1)
        r = np.random.default_rng(seed)
        city = np.zeros((H, W, 3), np.float32)
        self.city_mask = np.zeros((H, W), np.float32)
        x = 0
        while x < W:
            w = r.uniform(50, 160); h = r.uniform(40, 170)
            fill(city, [(x, 960 - h), (x + w, 960 - h), (x + w, H), (x, H)], col('#1d3140'))
            cv2.rectangle(self.city_mask, (int(x), int(960 - h)), (int(x + w), H), 1, -1)
            for _ in range(int(w * h / 1800)):
                wx, wy = r.uniform(x + 6, x + w - 10), r.uniform(960 - h + 8, H - 10)
                if r.random() < 0.35:
                    fill(city, [(wx, wy), (wx + 7, wy), (wx + 7, wy + 9), (wx, wy + 9)], col('#ffd38a'))
            x += w + r.uniform(0, 20)
        self.city = city
        self.leaves = [((300, 260), 230, -20, 0.0), ((560, 120), 200, 15, 1.3), ((200, 560), 260, -55, 2.1), ((640, 420), 180, 30, 0.7), ((80, 300), 210, -80, 2.8), ((470, 640), 170, 5, 1.9)]
        self.rain = Rain(seed + 2, density=0.5)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.gx, self.gy = xx, yy

    def frame(self, t):
        u = smooth(t / self.dur)
        # clouds drift away from the sun and thin out (threshold rises)
        dx = (self.gx - self.sun[0]) * 0.05 * u + t * 6
        dy = (self.gy - self.sun[1]) * 0.03 * u
        cn = cv2.remap(self.cn, self.gx - dx, self.gy - dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        th = 0.46 + 0.14 * u
        m = cv2.GaussianBlur(np.clip((cn - th) / 0.05, 0, 1), (0, 0), 1.5)
        ang = np.arctan2(self.sun[1] - self.gy, self.sun[0] - self.gx)
        sx, sy = np.cos(ang) * 18, np.sin(ang) * 18  # sample toward the sun: surfaces facing it are lit
        lit = cv2.remap(cn, self.gx + sx, self.gy + sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) - cn
        lit = cv2.GaussianBlur(np.clip(lit * 40 + 0.35, 0, 1), (0, 0), 2)
        core = np.clip((cn - th - 0.12) / 0.1, 0, 1)
        lit = np.clip(lit * (1 - core * 0.5) + (1 - core) * 0.15, 0, 1)
        dsun = np.hypot(self.gx - self.sun[0], self.gy - self.sun[1]) / 900
        warm = np.clip(1 - dsun, 0, 1)
        c_sh = mix(col('#5d7086'), col('#9a8e8c'), warm[..., None])
        c_lt = mix(col('#d8dde0'), col('#fff0cc'), warm[..., None])
        cloud = c_sh * (1 - lit[..., None]) + c_lt * lit[..., None]
        rim = np.clip(m * (1 - m) * 4, 0, 1) * np.clip(1 - dsun * 1.6, 0, 1)
        img = self.sky * (1 - m[..., None]) + cloud * m[..., None]
        img += rim[..., None] * np.array([120, 210, 255], np.float32) * (0.4 + 0.8 * u)
        sun_k = 0.35 + 0.65 * u
        disc(img, self.sun, 70, col('#fff7e0'), alpha=sun_k, blur=10)
        disc(img, self.sun, 260, col('#ffd28a'), alpha=0.35 * sun_k, blur=90, mode='add')
        god_rays(img, self.sun, t, strength=0.25 + 0.5 * u)
        img = img * (1 - self.city_mask[..., None]) + self.city
        # branch + leaves (sway), drops forming on tips and falling
        sw = 4 * math.sin(t * 1.5)
        br = bezier((-40, 40), (200, 120), (420, 300), (700, 520), 30)
        fill(img, thick_line(br, np.linspace(30, 10, 30)), col('#3a2a1e'))
        for k, ((lx, ly), size, ang, ph) in enumerate(self.leaves):
            a = ang + 7 * math.sin(t * 1.7 + ph) + sw
            c = (lx + 6 * math.sin(t * 1.3 + ph), ly + 4 * math.sin(t * 1.9 + ph))
            tip = maple(img, c, size, a, backlit=0.55 + 0.35 * u)
            cyc = (t + ph) % 1.6
            if cyc < 1.15:
                rr = 3 + 6 * cyc / 1.15
                disc(img, (tip[0], tip[1] + rr), rr, col('#e8f6ff'), alpha=0.85)
                disc(img, (tip[0] - rr * 0.3, tip[1] + rr * 0.6), rr * 0.3, col('#ffffff'), alpha=0.9)
            else:
                f = cyc - 1.15
                y = tip[1] + 9 + 0.5 * 2600 * f * f
                stroke(img, [(tip[0], y - 28), (tip[0], y)], col('#e8f6ff'), 5, 0.7, blur=1)
        self.rain.draw(img, t, strength=max(0.0, 1 - u * 1.2))
        img = bloom(img, thr=215, sigma=26, k=0.35)
        return img
