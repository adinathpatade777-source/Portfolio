"""Build 'The Truck and the Jar' as a smooth doodle animation, synced to the narration.
Usage: blender -b --python build.py -- <res_x> <res_y> <samples> <frame_start> <frame_end> <outdir>
"""
import bpy, sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_flat as lib
from lib_flat import *

argv = sys.argv[sys.argv.index("--") + 1:]
RX, RY, SAMPLES, FS, FE, OUT = int(argv[0]), int(argv[1]), int(argv[2]), int(argv[3]), int(argv[4]), argv[5]
DURATION = 635.0
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.eevee.taa_render_samples = SAMPLES
sc.render.resolution_x, sc.render.resolution_y = RX, RY
sc.render.fps = FPS
sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w"); sc.world = w; w.color = srgb2lin(PAPER)
cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = 16
CAM = bpy.data.objects.new("cam", cam); sc.collection.objects.link(CAM); sc.camera = CAM
CAM.location = (0, -40, 4.0); CAM.rotation_euler = (math.pi / 2, 0, 0)
wiggle(CAM, "location", 0, 0.07, 7.3)
wiggle(CAM, "location", 2, 0.05, 5.1)

SYMFONT = bpy.data.fonts.load("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
TEXTSWAP = []  # (objname, [(t, body)])


def sym(name, ch, loc, size, color, parent):
    ob = text(name, ch, loc, size, color, parent)
    ob.data.font = SYMFONT
    return ob


# permanent ground line
line("ground", [(-30, 0), (30, 0)], INK, 0.035)


# ------------------------------------------------------------------ building blocks
def group(name, t_in, t_out):
    g = empty(name, (32, 0, 0))
    kf(g, "location", F(t_in - 0.5), (32, 0, 0), "SINE", "EASE_OUT")
    kf(g, "location", F(t_in + 0.35), (0, 0, 0), "BACK", "EASE_OUT")
    kf(g, "location", F(t_out - 0.35), (0, 0, 0), "SINE", "EASE_IN")
    kf(g, "location", F(t_out + 0.35), (-32, 0, 0), "CONSTANT")
    return g


def popped(ob, t, s=1.0, out=None, dur=0.45):
    pop_in(ob, t, dur, s)
    if out:
        pop_out(ob, out)
    return ob


def T(name, body, loc, size, color, parent, t, out=None, s=1.0):
    return popped(text(name, body, loc, size, color, parent), t, s, out)


def bubble(name, body, loc, parent, t, out=None, width=None, size=0.42, tail=(-0.6, -0.9), think=False):
    b = empty(name, loc, parent)
    lines = body.split("\n")
    wdt = width or max(len(l) for l in lines) * size * 0.62 + 0.9
    hgt = len(lines) * size * 1.35 + 0.6
    box(name + "_bg", (wdt, 0.1, hgt), (0, 0.1, 0), WHITE, b, outline=0.05, bevel=0.3)
    if think:
        disk(name + "_d1", 0.18, (tail[0] * 0.6, 0.1, -hgt / 2 - 0.25), WHITE, b, outline=0.04)
        disk(name + "_d2", 0.11, (tail[0], 0.1, -hgt / 2 - 0.6), WHITE, b, outline=0.04)
    else:
        poly(name + "_tail", [(tail[0] + 0.5, -hgt / 2 + 0.05), (tail[0] + 0.05, -hgt / 2 + 0.05), (tail[0], -hgt / 2 + tail[1] * 0.6)], WHITE, b, outline=0.05, y=0.05)
        box(name + "_cover", (0.62, 0.05, 0.12), (tail[0] + 0.27, 0.0, -hgt / 2 + 0.06), WHITE, b, outline=False, bevel=0)
    text(name + "_t", body, (0, -0.15, 0), size, INK, b)
    popped(b, t, 1.0, out)
    return b


def tag(name, body, loc, parent, t, out=None, color=YELLOW, size=0.6, rotdeg=-8):
    g = empty(name, loc, parent)
    wdt = len(body) * size * 0.62 + 0.9
    h = size * 1.6
    poly(name + "_bg", [(-wdt / 2, -h / 2), (wdt / 2, -h / 2), (wdt / 2 + 0.45, 0), (wdt / 2, h / 2), (-wdt / 2, h / 2)], color, g, outline=0.05)
    disk(name + "_hole", 0.09, (wdt / 2 + 0.05, -0.08, 0), WHITE, g, outline=0.02)
    tx = text(name + "_t", body, (0, -0.12, 0), size, INK, g)
    g.rotation_euler[1] = math.radians(rotdeg)
    popped(g, t, 1.0, out)
    return g


def stamp(name, body, loc, parent, t, out=None, color=RED, size=0.7, rotdeg=12):
    g = empty(name, loc, parent)
    wdt = len(body) * size * 0.66 + 0.6
    h = size * 1.7
    line(name + "_b", [(-wdt / 2, -h / 2), (wdt / 2, -h / 2), (wdt / 2, h / 2), (-wdt / 2, h / 2)], color, 0.07, g, cyclic=True)
    text(name + "_t", body, (0, -0.05, 0), size, color, g)
    g.rotation_euler[1] = math.radians(rotdeg)
    pop_in(g, t, 0.35, 1.0)
    kf(g, "scale", F(t), (2.2, 2.2, 2.2), "BACK", "EASE_OUT")
    kf(g, "scale", F(t + 0.35), (1, 1, 1))
    if out:
        pop_out(g, out)
    return g


def xmark(name, loc, parent, t, s=0.8, out=None):
    g = empty(name, loc, parent)
    line(name + "_a", [(-s, -s), (s, s)], RED, 0.1, g)
    line(name + "_b", [(-s, s), (s, -s)], RED, 0.1, g)
    return popped(g, t, 1.0, out)


def check(name, loc, parent, t, s=0.6, out=None, color=GREEN):
    g = empty(name, loc, parent)
    line(name + "_c", [(-s, 0), (-s * 0.3, -s * 0.7), (s, s * 0.8)], color, 0.11, g)
    return popped(g, t, 1.0, out)


def sparkle(name, loc, parent, t, s=0.35, out=None, color=YELLOW):
    pts = []
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 2
        r = s if i % 2 == 0 else s * 0.3
        pts.append((r * math.cos(a), r * math.sin(a)))
    ob = poly(name, pts, color, parent, outline=0.025, loc=loc)
    popped(ob, t, 1.0, out)
    wiggle(ob, "rotation_euler", 1, 0.4, 1.7, phase=loc[0])
    return ob


def contract(name, loc, parent, t, sign_t, out=None, s=1.0):
    g = empty(name, loc, parent)
    g.scale = (s, s, s)
    box(name + "_p", (2.2, 0.05, 2.8), (0, 0, 0), WHITE, g, outline=0.05, bevel=0.05)
    text(name + "_h", "LOAN", (0, -0.1, 1.0), 0.35, INK, g)
    for i in range(4):
        line(name + f"_l{i}", [(-0.8, 0.5 - i * 0.35), (0.8 - (0.4 if i == 3 else 0), 0.5 - i * 0.35)], GREY, 0.03, g, loc=(0, -0.1, 0))
    line(name + "_sl", [(-0.8, -1.0), (0.8, -1.0)], INK, 0.025, g, loc=(0, -0.1, 0))
    sig = smooth_line(name + "_sig", [(-0.7, -0.85), (-0.5, -0.55), (-0.35, -0.95), (-0.15, -0.6), (0.05, -0.9), (0.3, -0.65), (0.6, -0.85)], BLUE, 0.035, g, loc=(0, -0.15, 0))
    underline_draw(sig, sign_t, 0.9)
    popped(g, t, s, out)
    return g


def calendar(name, loc, parent, t, out=None, s=1.0):
    g = empty(name, loc, parent)
    box(name + "_p", (2.2, 0.05, 2.2), (0, 0, 0), WHITE, g, outline=0.05, bevel=0.1)
    box(name + "_top", (2.2, 0.06, 0.6), (0, -0.05, 0.85), RED, g, outline=0.04, bevel=0.08)
    popped(g, t, s, out)
    return g


def phone(name, loc, parent, t, out=None, s=1.0, screen=SKY):
    g = empty(name, loc, parent)
    box(name + "_b", (1.0, 0.1, 1.9), (0, 0, 0), INK, g, outline=0.03, bevel=0.15)
    box(name + "_s", (0.8, 0.05, 1.5), (0, -0.08, 0.05), screen, g, outline=False, bevel=0.05)
    popped(g, t, s, out)
    return g


def envelope(name, loc, parent, t, body="+$300", out=None):
    g = empty(name, loc, parent)
    box(name + "_b", (1.8, 0.05, 1.1), (0, 0, 0), WHITE, g, outline=0.05, bevel=0.05)
    line(name + "_v", [(-0.85, 0.5), (0, -0.05), (0.85, 0.5)], INK, 0.035, g, loc=(0, -0.08, 0))
    text(name + "_t", body, (0, -0.12, -0.3), 0.32, DGREEN, g)
    popped(g, t, 1.0, out)
    return g


def house(name, loc, parent, t, out=None, s=1.0):
    g = empty(name, loc, parent)
    box(name + "_w", (2.0, 0.1, 1.6), (0, 0, 0.8), (0.95, 0.85, 0.65), g)
    poly(name + "_r", [(-1.3, 1.55), (1.3, 1.55), (0, 2.7)], RED, g, outline=0.05)
    box(name + "_d", (0.5, 0.05, 0.9), (0, -0.1, 0.45), BROWN, g, outline=0.03, bevel=0.03)
    popped(g, t, s, out)
    return g


def sofa(name, loc, parent, t, out=None, s=1.0):
    g = empty(name, loc, parent)
    box(name + "_back", (3.0, 0.2, 1.2), (0, 0.1, 1.3), PURPLE, g)
    box(name + "_seat", (3.0, 0.3, 0.6), (0, 0, 0.75), PURPLE, g)
    box(name + "_al", (0.5, 0.3, 1.1), (-1.6, -0.05, 1.0), PURPLE, g)
    box(name + "_ar", (0.5, 0.3, 1.1), (1.6, -0.05, 1.0), PURPLE, g)
    line(name + "_l1", [(-1.4, 0.45), (-1.4, 0.05)], INK, 0.06, g)
    line(name + "_l2", [(1.4, 0.45), (1.4, 0.05)], INK, 0.06, g)
    popped(g, t, s, out)
    return g


def shoe(name, loc, parent, t, out=None, s=1.0):
    g = empty(name, loc, parent)
    poly(name + "_u", [(-1.2, 0.25), (1.3, 0.25), (1.3, 0.6), (0.5, 0.9), (-0.3, 1.5), (-1.1, 1.5)], ORANGE, g, outline=0.05)
    box(name + "_sole", (2.7, 0.1, 0.3), (0.05, -0.05, 0.12), WHITE, g, bevel=0.1)
    for i in range(3):
        line(name + f"_lace{i}", [(-0.6 + i * 0.25, 1.15 - i * 0.2), (-0.25 + i * 0.25, 1.25 - i * 0.2)], WHITE, 0.03, g, loc=(0, -0.1, 0))
    popped(g, t, s, out)
    return g


def rain(parent, t0, t1, n=40):
    rp = empty("rainp", (0, 0, 0), parent)
    kf(rp, "scale", 1, (0, 0, 0), "CONSTANT")
    kf(rp, "scale", F(t0), (1, 1, 1), "CONSTANT")
    kf(rp, "scale", F(t1), (0, 0, 0), "CONSTANT")
    for i in range(n):
        x = random.uniform(-9, 9)
        d = line(f"rain{i}", [(0, 0), (-0.15, -0.5)], (0.35, 0.55, 0.9), 0.03, rp, loc=(x, -2, 9))
        dur = random.uniform(0.5, 0.75)
        off = random.uniform(0, dur)
        f0 = F(t0) - int(off * FPS)
        kf(d, "location", f0, (x, -2, 9.5), "LINEAR")
        kf(d, "location", f0 + int(dur * FPS), (x - 0.4, -2, -0.5), "LINEAR")
        for c in d.animation_data.action.fcurves:
            c.modifiers.new("CYCLES")


def float_hearts(parent, t0, t1, x, z, n=8):
    for i in range(n):
        tt = t0 + (t1 - t0) * i / n
        h = heart(f"hrt{i}_{int(t0)}", (x + random.uniform(-1.2, 1.2), -1, z), parent, s=0.35)
        kf(h, "scale", F(tt) - 1, (0, 0, 0), "BACK", "EASE_OUT")
        kf(h, "scale", F(tt), (0.01, 0.01, 0.01), "BACK", "EASE_OUT")
        kf(h, "scale", F(tt + 0.4), (1, 1, 1), "SINE")
        kf(h, "scale", F(tt + 1.6), (1, 1, 1), "SINE")
        kf(h, "scale", F(tt + 2.0), (0, 0, 0), "CONSTANT")
        hx = h.location[0]
        move(h, tt, tt + 2.0, (hx, -1, z), (hx + random.uniform(-0.6, 0.6), -1, z + 3), "SINE", "EASE_OUT")


def coin_drops(parent, t0, t1, x, ztop, zbot, every=0.8, prefix="cd"):
    """A coin falls into the jar repeatedly between t0 and t1."""
    t = t0
    i = 0
    while t < t1:
        c = coin(f"{prefix}{i}", (x, -0.6, ztop), parent, r=0.3)
        kf(c, "scale", F(t) - 1, (0, 0, 0), "CONSTANT")
        kf(c, "scale", F(t), (1, 1, 1), "CONSTANT")
        kf(c, "location", F(t), (x, -0.6, ztop), "QUAD", "EASE_IN")
        kf(c, "location", F(t + 0.45), (x, -0.6, zbot), "LINEAR")
        kf(c, "scale", F(t + 0.45), (1, 1, 1), "SINE")
        kf(c, "scale", F(t + 0.6), (0, 0, 0), "CONSTANT")
        t += every
        i += 1


def counter_text(name, loc, size, color, parent, segs, fmt="${:,.0f}", t_in=None, out=None):
    ob = text(name, fmt.format(segs[0][2]), loc, size, color, parent)
    counter(ob, segs, fmt)
    if t_in is not None:
        popped(ob, t_in, 1.0, out)
    return ob


def fill_jar(jname, t0, t1, a, b):
    fp = PARTS[jname]["fill"]
    kf(fp, "scale", F(t0), (1, 1, a), "SINE", "EASE_IN_OUT")
    kf(fp, "scale", F(t1), (1, 1, b), "SINE", "EASE_IN_OUT")


def drive(trk, t0, t1, a, b, interp="SINE", easing="EASE_IN_OUT", wheel_r=0.6):
    move(trk, t0, t1, a, b, interp, easing)
    dist = (b[0] - a[0]) * val(trk, "scale", F(t1))[0]
    for wh in PARTS[trk.name]["wheels"]:
        cur = val(wh, "rotation_euler", F(t0))[1]
        rot(wh, t0, t1, (0, cur, 0), (0, cur + dist / wheel_r, 0), interp, easing)


def monster_eats(mname, items, parent):
    """items: list of (obj, t) -> object flies into the monster's mouth and vanishes."""
    m = bpy.data.objects[mname]
    for ob, t in items:
        start = val(ob, "location", F(t))
        ms = val(m, "scale", F(t))
        ml = val(m, "location", F(t))
        mouth = (ml[0], -1.2, ml[2] + 0.85 * ms[2])
        osc = val(ob, "scale", F(t))
        kf(ob, "location", F(t), start, "SINE", "EASE_IN")
        kf(ob, "location", F(t + 0.6), mouth, "SINE", "EASE_IN")
        kf(ob, "scale", F(t), osc, "SINE")
        kf(ob, "scale", F(t + 0.35), osc, "SINE")
        kf(ob, "scale", F(t + 0.6), (0, 0, 0), "CONSTANT")
        kf(m, "scale", F(t + 0.55), ms, "SINE")
        kf(m, "scale", F(t + 0.7), tuple(v * 1.12 for v in ms), "SINE")
        kf(m, "scale", F(t + 0.95), ms, "SINE")


def add_tie(st):
    poly(st.root.name + "_tie", [(0, 2.68), (0.12, 2.5), (0.05, 1.95), (0, 1.85), (-0.05, 1.95), (-0.12, 2.5)], PURPLE, st.body, outline=0.02, y=-0.1)


def old_look(st, t):
    hair = poly(st.root.name + "_grey", [(-0.53, 0.1)] + [(0.53 * math.cos(a), 0.1 + 0.48 * math.sin(a)) for a in [i * math.pi / 12 for i in range(1, 12)]][::-1] + [(0.53, 0.1)], LGREY, st.head, outline=0.05, y=-0.1)
    pop_in(hair, t)
    g = empty(st.root.name + "_glasses", (0, -0.15, 0.05), st.head)
    line(st.root.name + "_gl1", [(-0.3, 0), (-0.05, 0)], INK, 0.03, g)
    for sx in (-0.17, 0.17):
        sm = bpy.data.curves.new("gc", "CURVE")
        line(st.root.name + f"_gr{sx}", [(sx + 0.13 * math.cos(a * math.pi / 8), 0.13 * math.sin(a * math.pi / 8)) for a in range(17)], INK, 0.025, g)
    pop_in(g, t + 0.2)
    if st.hat:
        pop_out(st.hat, t + 0.05)


def stick(name, loc, parent, t, hat=None, s=1.0, out=None):
    st = Stick(name, loc, hat=hat, scale=s)
    st.root.parent = parent
    pop_in(st.root, t, 0.45, s)
    if out:
        pop_out(st.root, out)
    return st


# ================================================================== SCENES
# S0 title  0 - 3.6
g = group("S0", -1, 3.4)
T("title1", "THE TRUCK", (0, -1, 5.6), 1.4, RED, g, 0.1)
T("title2", "& THE JAR", (0, -1, 3.8), 1.4, GREEN, g, 0.5)
tr0 = truck("t0truck", (-5.5, 0, 0), s=0.55); tr0.parent = g; pop_in(tr0, 0.8, 0.45, 0.55)
j0 = jar("t0jar", (5.5, 0, 0), s=0.55, label=""); j0.parent = g; pop_in(j0, 1.0, 0.45, 0.55); fill_jar("t0jar", 1.0, 3.0, 0.0, 0.6)

# S1 hook 3.6 - 41
g = group("S1", 3.6, 40.8)
tr = truck("htruck", (-30, 0, 0), s=1.0); tr.parent = g
drive(tr, 3.6, 5.4, (-16, 0.5, 0), (-1, 0.5, 0), "BACK", "EASE_OUT")
big = text("h754", "$754,000", (0, -1.5, 6.6), 1.6, RED, g); popped(big, 5.6, 1.0, 16.4)
wiggle(big, "rotation_euler", 1, 0.03, 1.3)
tg = tag("hsticker", "$45,000", (4.2, -1, 3.9), g, 9.8, 16.4, size=0.5)
xs = xmark("hstx", (4.2, -1.2, 3.9), g, 10.6, 0.9, 16.4)
stamp("hreal", "THE REAL PRICE", (-1.0, -2, 4.8), g, 11.6, 16.4, size=0.55, rotdeg=-8)
bubble("hnobody", "...nobody tells you", (-5.5, -1, 7.6), g, 13.5, 16.4, size=0.4)
pop_out(tr, 16.6)
sam1 = stick("h_sam", (-4.5, 0, 0), g, 17.0, "cap")
alx1 = stick("h_alx", (4.5, 0, 0), g, 17.2, "beanie")
T("h_same1", "SAME JOB", (0, -1, 7.4), 0.6, INK, g, 18.6, 23.4)
T("h_same2", "SAME PAYCHECK", (0, -1, 6.5), 0.6, INK, g, 19.7, 23.4)
contract("hcon", (0, 0, 3.0), g, 20.6, 21.3, 23.4, s=0.9)
T("h36", "36 YEARS LATER...", (0, -1, 7.6), 0.75, BLUE, g, 23.7, 33.8)
hj = jar("hjar", (6.9, 0, 0), s=0.55, label=""); hj.parent = g; pop_in(hj, 25.5, 0.45, 0.55); fill_jar("hjar", 25.6, 28.6, 0.0, 1.0)
T("h34", "$754,000", (5.6, -1, 5.0), 0.7, DGREEN, g, 27.3, 33.8)
alx1.jump(28.0); alx1.mood(26.0, True)
hm = monster("hmon", (-7.2, -0.3, 0), s=0.75, label="$750"); hm.parent = g; pop_in(hm, 30.3, 0.45, 0.75)
T("hstill", "still paying...", (-5.6, -1, 5.0), 0.5, RED, g, 31.0, 33.8)
sam1.mood(31.4, False)
q = sym("hq", "?", (0, -1, 4.8), 2.6, ORANGE, g); popped(q, 34.6)
wiggle(q, "rotation_euler", 1, 0.12, 1.1)
sam1.mood(35.0, True)
T("hwhich", "WHICH ONE ARE YOU?", (0, -1, 7.6), 0.7, INK, g, 35.6)

# S2 intro 41 - 78
g = group("S2", 41.2, 77.8)
sam = Stick("i_sam", (-12, 0, 0), hat="cap"); sam.root.parent = g
alx = Stick("i_alx", (12, 0, 0), hat="beanie"); alx.root.parent = g
sam.walk(41.4, 43.2, (-12, 0, 0), (-2.2, 0, 0)); alx.walk(41.4, 43.2, (12, 0, 0), (2.2, 0, 0))
T("i_n1", "SAM", (-2.2, -1, 4.6), 0.5, RED, g, 43.0, 52.6)
T("i_n2", "ALEX", (2.2, -1, 4.6), 0.5, BLUE, g, 43.2, 52.6)
desk = box("i_desk", (8.0, 0.4, 0.25), (0, 0.6, 1.9), BROWN, g); pop_in(desk, 45.6); pop_out(desk, 52.6)
for i, x in enumerate((-2.2, 2.2)):
    bd = empty(f"i_badge{i}", (x, -0.6, 2.35), g)
    box(f"i_badgeb{i}", (0.55, 0.05, 0.7), (0, 0, 0), WHITE, bd, outline=0.03, bevel=0.05)
    disk(f"i_badgef{i}", 0.13, (0, -0.06, 0.08), LGREY, bd, outline=0.02)
    popped(bd, 47.0 + i * 0.2, 1.0, 52.6)
    T(f"i_zz{i}", "z z", (x + 0.8, -1, 4.0), 0.35, GREY, g, 47.4 + i * 0.2, 52.6)
tb = bill("i_bill1", (-2.2, -1, 6.3), g, 0.8); popped(tb, 50.2, 0.8, 52.6)
tb2 = bill("i_bill2", (2.2, -1, 6.3), g, 0.8); popped(tb2, 50.4, 0.8, 52.6)
sym("i_eq", "=", (0, -1, 6.1), 0.9, INK, g); popped(bpy.data.objects["i_eq"], 50.8, 1.0, 52.6)
T("i_2y", "2 YEARS", (0, -1, 7.5), 0.7, INK, g, 53.0, 61.8)
for i, x in enumerate((-2.2, 2.2)):
    bw = empty(f"i_bowl{i}", (x + (1.0 if i == 0 else -1.0), -0.8, 2.3), g)
    poly(f"i_bowlb{i}", [(-0.45, 0), (0.45, 0)] + [(0.45 * math.cos(-a * math.pi / 10), 0.45 * math.sin(-a * math.pi / 10)) for a in range(1, 10)], WHITE, bw, outline=0.04)
    smooth_line(f"i_nood{i}", [(-0.3, 0.05), (-0.15, 0.35), (0, 0.1), (0.15, 0.4), (0.3, 0.05)], YELLOW, 0.03, bw, loc=(0, 0.05, 0))
    popped(bw, 56.6 + i * 0.2, 1.0, 59.4)
boss = stick("i_boss", (0, 0.4, 0), g, 58.4, None, 0.75, 61.8)
T("i_grr", "!!", (0.6, -1, 3.6), 0.5, RED, g, 58.8, 61.8)
sam.mood(58.6, False); alx.mood(58.6, False); sam.mood(61.2, True); alx.mood(61.2, True)
bus = empty("i_bus", (0, 0.8, 0), g)
box("i_busb", (8.5, 0.6, 2.8), (0, 0, 1.9), YELLOW, bus)
for k in range(5):
    box(f"i_busw{k}", (1.1, 0.1, 0.8), (-3.1 + k * 1.45, -0.35, 2.5), SKY, bus, outline=0.03, bevel=0.05)
wheel("i_busw1", (-2.6, -0.4, 0.55), 0.55, bus); wheel("i_busw2", (2.6, -0.4, 0.55), 0.55, bus)
T("i_bustxt", "BUS", (2.9, -0.4, 1.5), 0.4, INK, bus, 60.3)
kf(bus, "location", F(59.6), (20, 0.8, 0), "SINE", "EASE_OUT")
kf(bus, "location", F(61.0), (0, 0.8, 0), "BACK", "EASE_OUT")
kf(bus, "rotation_euler", F(63.5), (0, 0, 0), "SINE")
kf(bus, "rotation_euler", F(64.0), (0, math.radians(-4), 0), "BOUNCE", "EASE_OUT")
kf(bus, "location", F(70.5), (0, 0.8, 0), "SINE", "EASE_IN")
kf(bus, "location", F(71.5), (0, 0.8, -12), "CONSTANT")
move(sam.root, 60.0, 61.0, (-2.2, 0, 0), (-5.6, -0.5, 0)); move(alx.root, 60.0, 61.0, (2.2, 0, 0), (5.6, -0.5, 0))
rain(g, 62.6, 70.6)
for k in range(4):
    sm = ball(f"i_smoke{k}", 0.4 + k * 0.15, (2.5 + k * 0.5, -0.2, 3.5 + k * 0.7), LGREY, g, outline=0.03)
    popped(sm, 64.3 + k * 0.25, 1.0, 70.4)
    wiggle(sm, "location", 2, 0.1, 1.5, phase=k)
T("i_broke", "BROKE DOWN!", (0, -1.5, 7.2), 0.7, RED, g, 64.4, 70.4)
sam.mood(64.6, False); alx.mood(64.6, False)
T("i_buy", "TIME TO BUY A CAR!", (0, -1, 7.2), 0.75, BLUE, g, 68.2)
sam.mood(68.4, True); alx.mood(68.4, True); sam.jump(68.6); alx.jump(68.7)
div = line("i_div", [(0, -0.5), (0, 8.5)], INK, 0.05, g, loc=(0, -1, 0)); div.data.bevel_factor_end = 0
underline_draw(div, 74.6, 1.0)
T("i_last", "the last day they were the same", (0, -1, 6.0), 0.4, GREY, g, 75.0)

# S3 dealership 79 - 142
g = group("S3", 78.8, 141.8)
spot = poly("d_spot", [(-0.5, 9), (0.5, 9), (3.4, 0), (-3.4, 0)], (1, 0.95, 0.6), g, outline=False, loc=(3.4, 1.2, 0))
spot.data.materials[0] = mat((1, 0.93, 0.55), 0.45)
popped(spot, 89.9, (1, 1, 1))
dtr = truck("d_truck", (3.4, 1.0, 0), s=0.85); dtr.parent = g; pop_in(dtr, 90.3, 0.45, 0.85)
for k, (x, c) in enumerate(((-6.8, BLUE), (-3.4, GREEN))):
    hc = hatch(f"d_small{k}", (x - 1.0, 1.4, 0), c, 0.45); hc.parent = g; pop_in(hc, 79.6 + k * 0.2, 0.45, 0.45)
sam = Stick("d_sam", (-12, 0, 0), hat="cap"); sam.root.parent = g
sam.walk(79.6, 81.4, (-12, -0.5, 0), (-6.5, -0.5, 0))
bubble("d_look", '"Just to look"', (-4.5, -1, 6.0), g, 82.3, 84.2, size=0.4)
sam.walk(84.5, 88.6, (-6.5, -0.5, 0), (-1.0, -0.5, 0), 0.55)
for k in range(4):
    sparkle(f"d_sp{k}", (1.0 + k * 1.3, -1.5, 3.4 + (k % 2) * 0.9), g, 93.6 + k * 0.15, 0.32 + 0.08 * (k % 2), 97.5)
sam.mood(93.9, True); sam.jump(94.2, 0.4)
sal = stick("d_sal", (-3.6, 0, 0), g, 98.3, None, 0.95); add_tie(sal)
bubble("d_b1", '"Beautiful, isn\'t she?"', (-4.0, -1, 7.2), g, 102.0, 104.8, size=0.4)
pt = tag("d_price", "$45,000", (5.6, -1.5, 5.6), g, 107.9, 118.9, size=0.6)
sam.mood(110.9, False)
popped(sym("d_sweat", "💧" if False else "!", (-0.4, -1, 4.4), 0.6, BLUE, g), 109.2, 1.0, 113.0)
sal.jump(113.3, 0.3); sal.jump(113.8, 0.3)
T("d_haha", "HA HA", (-3.6, -1, 4.6), 0.4, PURPLE, g, 113.4, 115.0)
bubble("d_b2", '"Don\'t worry about the price.\nJust think about the MONTHLY."', (-3.2, -1, 7.2), g, 115.3, 118.9, size=0.36)
tg2 = tag("d_month", "$750/mo", (5.6, -1.5, 5.6), g, 119.2, 130.2, size=0.6, color=(0.6, 0.9, 0.6))
T("d_72", "x 72 MONTHS", (5.6, -1.4, 4.4), 0.42, INK, g, 121.6, 130.2)
bubble("d_think", "$750... fine!", (-1.0, -1, 6.6), g, 124.9, 129.4, size=0.4, think=True)
sam.mood(126.8, True)
contract("d_con", (-3.2, -0.5, 6.4), g, 129.6, 130.4, 133.0, s=0.8)
# Sam hops in & drives away
kf(sam.root, "scale", F(131.6), (1, 1, 1), "SINE"); kf(sam.root, "scale", F(132.0), (0, 0, 0), "CONSTANT")
pop_out(sal.root, 132.4)
for wh in PARTS["d_truck"]["wheels"]:
    pass
drive(dtr, 132.4, 137.5, (3.4, 1.0, 0), (24, 1.0, 0), "SINE", "EASE_IN")
kf(dtr, "scale", F(137.6), (0.85, 0.85, 0.85), "CONSTANT"); kf(dtr, "scale", F(137.7), (0, 0, 0), "CONSTANT")
pop_out(spot, 133.0)
for k in range(5):
    n = sym(f"d_note{k}", "♪" if k % 2 else "♫", (2.0 + k * 1.3, -1, 4.0 + (k % 2) * 0.8), 0.7, PURPLE, g)
    popped(n, 132.6 + k * 0.25, 1.0, 138.0)
    wiggle(n, "location", 2, 0.25, 0.8, phase=k)
T("d_rich", "feeling like the richest man alive", (0, -1, 7.4), 0.45, RED, g, 136.4)

# S4 used lot 142 - 174
g = group("S4", 142.2, 173.9)
bunt = smooth_line("u_bunt", [(-8, 7.6), (-4, 6.9), (0, 7.6), (4, 6.9), (8, 7.6)], INK, 0.025, g)
for k in range(16):
    x = -7.5 + k
    zz = 7.25 + 0.35 * math.cos((x + 8) / 8 * 2 * math.pi) * 1.0
    fl = poly(f"u_flag{k}", [(-0.3, 0), (0.3, 0), (0, -0.6)], [RED, YELLOW, BLUE, GREEN][k % 4], g, outline=0.02, loc=(x, -0.2, zz))
    wiggle(fl, "rotation_euler", 1, 0.25, 0.7 + (k % 3) * 0.15, phase=k)
    popped(fl, 144.0 + k * 0.05)
alx = Stick("u_alx", (-12, 0, 0), hat="beanie"); alx.root.parent = g
alx.walk(144.8, 147.8, (-12, -0.5, 0), (-5.4, -0.5, 0))
hb = hatch("u_hatch", (2.0, 0.8, 0), GREY, 0.9); hb.parent = g; pop_in(hb, 151.4, 0.45, 0.9)
tag("u_age", "8 YRS OLD", (5.5, -1.5, 4.2), g, 155.1, 165.0, size=0.42, color=LGREY)
circ = line("u_dentc", [(0.55 * math.cos(a * math.pi / 12), 0.55 * math.sin(a * math.pi / 12)) for a in range(25)], RED, 0.05, g, loc=(1.05, -1, 0.85))
circ.data.bevel_factor_end = 0; underline_draw(circ, 156.2, 0.6)
for k in range(3):
    st_ = smooth_line(f"u_stink{k}", [(0, 0), (0.25, 0.4), (-0.1, 0.8), (0.2, 1.2)], (0.5, 0.65, 0.3), 0.04, g, loc=(0.6 + k * 0.6, -1, 2.6))
    popped(st_, 157.9 + k * 0.15, 1.0, 161.2)
    wiggle(st_, "location", 0, 0.12, 0.8, phase=k)
T("u_coffee", "old coffee smell", (2.0, -1, 4.8), 0.4, (0.45, 0.32, 0.2), g, 158.4, 161.2)
sq = T("u_squeak", "SQUEAK!", (3.2, -1, 4.6), 0.75, ORANGE, g, 162.4, 165.0)
wiggle(sq, "rotation_euler", 1, 0.12, 0.25)
alx.mood(162.6, False); alx.mood(164.6, True)
tag("u_price", "$12,000", (5.2, -1.5, 5.8), g, 165.1, 174, size=0.6)
stamp("u_cash", "PAID IN CASH", (-1.2, -2, 6.8), g, 167.8, None, size=0.5, color=DGREEN, rotdeg=-6)
T("u_nl", "NO LOAN", (-5.4, -1, 5.2), 0.5, INK, g, 171.3)
check("u_c1", (-7.3, -1, 5.25), g, 171.5, 0.3)
T("u_nm", "NO MONTHLY", (-5.0, -1, 4.4), 0.5, INK, g, 172.5)
check("u_c2", (-7.3, -1, 4.45), g, 172.7, 0.3)

# S5 jar setup 174 - 203.3
g = group("S5", 174.2, 203.3)
alx = stick("j_alx", (-5.5, 0, 0), g, 174.4, "beanie")
T("j_strange", "something a little strange...", (0, -1, 7.6), 0.45, GREY, g, 174.6, 178.2)
ph = phone("j_phone", (-3.6, -1, 2.6), g, 178.4, 186.6, 0.9)
T("j_app", "INVEST", (-3.6, -1.2, 2.9), 0.2, INK, g, 178.6, 186.6)
jj = jar("j_jar", (3.0, 0, 0), s=1.0, label="INDEX FUND"); jj.parent = g; pop_in(jj, 181.0)
T("j_boring", "(boring)", (3.0, -1, 5.1), 0.4, GREY, g, 182.4, 186.6)
ar = arrow("j_arrow", (-3.4, 3.0), (1.4, 3.0), BLUE, 0.07, g); popped(ar, 184.4, 1.0, 196.0)
T("j_auto", "AUTOMATIC", (-1.0, -1, 3.5), 0.38, BLUE, g, 184.8, 196.0)
T("j_750", "$750", (3.0, -1.2, 6.6), 1.2, DGREEN, g, 188.5)
T("j_every", "EVERY. SINGLE. MONTH.", (0, -1, 7.9), 0.45, INK, g, 191.2, 197.2)
coin_drops(g, 189.0, 202.8, 3.0, 5.0, 2.2, 0.75, "j_cd")
fill_jar("j_jar", 189.0, 203.0, 0.0, 0.35)
mt = truck("j_mini", (-7.5, -0.2, 4.6), s=0.3); mt.parent = g; pop_in(mt, 193.7, 0.45, 0.3); pop_out(mt, 197.2)
T("j_same", "= same as Sam's truck", (-4.8, -1, 4.2), 0.32, RED, g, 194.0, 197.2)
bubble("j_b1", '"I\'m pretending I have\na car payment."', (-4.2, -1, 6.4), g, 197.4, 200.6, size=0.36)
bubble("j_b2", '"I\'m paying it to\nmy FUTURE SELF."', (-4.2, -1, 6.4), g, 200.9, None, size=0.36)
alx.mood(201.0, True)

# S6 year 1 203.6 - 258
g = group("S6", 203.5, 258.0)
T("y1", "YEAR 1", (0, -1, 7.9), 0.7, INK, g, 203.7)
line("y1div", [(0, -0.2), (0, 7.2)], LGREY, 0.04, g, loc=(0, 0.5, 0))
sam = stick("y1_sam", (-6.6, 0, 0), g, 204.0, "cap")
ytr = truck("y1_tr", (-3.0, 0.6, 0), s=0.6); ytr.parent = g; pop_in(ytr, 204.2, 0.45, 0.6)
alx = stick("y1_alx", (6.8, 0, 0), g, 204.2, "beanie")
yh = hatch("y1_h", (3.3, 0.6, 0), GREY, 0.55); yh.parent = g; pop_in(yh, 204.4, 0.45, 0.55)
T("y1_win", "WINNING!", (-3.6, -1, 6.6), 0.6, RED, g, 205.0, 220.4)
sam.jump(205.2); sam.wave("L", 207.6)
float_hearts(g, 207.6, 214.4, -3.2, 3.0, 9)
counter_text("y1_likes", (-3.6, -1, 5.6), 0.45, (0.9, 0.3, 0.4), g, [(212.0, 214.0, 12, 1847)], "{:,.0f} likes", t_in=212.2, out=220.4)
counter_text("y1_zero", (3.6, -1, 5.6), 0.45, GREY, g, [(0, 1, 0, 0)], "0 likes", t_in=215.0, out=243.0)
mon = monster("y1_mon", (-4.5, -0.5, 4.2), s=0.0, label="$750"); mon.parent = g
pop_in(mon, 221.0, 0.5, 0.7)
T("y1_unnot", "(unnoticed)", (-4.5, -1, 7.0), 0.36, GREY, g, 224.2, 226.4)
T("y1_name", "THE PAYMENT", (-4.5, -1.2, 7.0), 0.55, DGREEN, g, 226.8)
cal = calendar("y1_cal", (-1.4, -0.5, 5.6), g, 230.2, 238.0, 0.6)
counter_text("y1_cald", (-1.4, -0.8, 5.45), 0.5, INK, g, [(0, 1, 1, 1)], "1st", t_in=230.4, out=238.0)
bl = [bill(f"y1_bill{k}", (-6.8 + k * 0.4, -1, 5.2 - k * 0.3), g, 0.6) for k in range(3)]
for k, b in enumerate(bl):
    popped(b, 233.8 + k * 0.1, 0.6)
monster_eats("y1_mon", [(bl[0], 235.0), (bl[1], 235.7), (bl[2], 236.4)], g)
T("y1_ty", "no 'thank you'", (-4.5, -1, 1.4), 0.36, INK, g, 238.4, 243.0)
T("y1_miss", "never misses a month", (-4.5, -1, 0.8), 0.36, INK, g, 240.5, 243.0)
yj = jar("y1_jar", (3.6, -0.2, 3.6), s=0.55, label=""); yj.parent = g; pop_in(yj, 243.2, 0.45, 0.55)
fill_jar("y1_jar", 244.0, 247.6, 0.0, 0.18)
counter_text("y1_9k", (3.6, -1, 1.4), 0.7, DGREEN, g, [(244.0, 248.0, 0, 9000)], t_in=243.6)
T("y1_crick", "*crickets*", (6.2, -1, 6.6), 0.36, GREY, g, 252.0)
alx.mood(249.6, False); alx.mood(254.0, True)
bw = empty("y1_bowl", (5.4, -0.8, 2.2), g)
poly("y1_bowlb", [(-0.45, 0), (0.45, 0)] + [(0.45 * math.cos(-a * math.pi / 10), 0.45 * math.sin(-a * math.pi / 10)) for a in range(1, 10)], WHITE, bw, outline=0.04)
smooth_line("y1_nood", [(-0.3, 0.05), (-0.15, 0.35), (0, 0.1), (0.15, 0.4), (0.3, 0.05)], YELLOW, 0.03, bw, loc=(0, 0.05, 0))
popped(bw, 254.4)

# S7 year 2 258.6 - 318
g = group("S7", 258.4, 318.2)
T("y2", "YEAR 2", (0, -1, 7.9), 0.7, INK, g, 258.6)
line("y2div", [(0, -0.2), (0, 7.2)], LGREY, 0.04, g, loc=(0, 0.5, 0))
sam = stick("y2_sam", (-5.0, 0, 0), g, 258.8, "cap")
alx = stick("y2_alx", (5.0, 0, 0), g, 259.0, "beanie")
e1 = envelope("y2_e1", (-5.0, -1, 5.2), g, 261.1)
e2 = envelope("y2_e2", (5.0, -1, 5.2), g, 261.3)
T("y2_raise", "RAISE!", (0, -1, 6.9), 0.6, DGREEN, g, 261.4, 266.0)
sam.jump(265.8); sam.jump(266.4)
mon = monster("y2_mon", (-1.9, -0.5, 0.3), s=0.0, label="$750"); mon.parent = g
pop_in(mon, 267.6, 0.5, 0.75)
ins = empty("y2_ins", (-7.0, -1, 3.4), g)
poly("y2_shield", [(-0.45, 0.5), (0.45, 0.5), (0.45, 0.0), (0, -0.55), (-0.45, 0.0)], BLUE, ins, outline=0.04)
text("y2_inst", "INSURANCE", (0, -0.1, -0.85), 0.25, INK, ins)
popped(ins, 268.2)
gas = empty("y2_gas", (-5.4, -1, 3.4), g)
box("y2_pump", (0.7, 0.1, 1.0), (0, 0, 0), RED, gas, bevel=0.05)
box("y2_pumpw", (0.4, 0.05, 0.3), (0, -0.08, 0.2), WHITE, gas, outline=0.02, bevel=0.03)
text("y2_gast", "GAS", (0, -0.1, -0.85), 0.25, INK, gas)
popped(gas, 274.9)
tire = empty("y2_tire", (-3.8, -1, 3.4), g)
for k in range(4):
    disk(f"y2_tire{k}", 0.25, (-0.3 + (k % 2) * 0.6, 0, 0.25 - (k // 2) * 0.55), INK, tire, outline=False)
text("y2_tiret", "TIRES", (0, -0.1, -0.85), 0.25, INK, tire)
popped(tire, 279.2)
monster_eats("y2_mon", [(ins, 271.9), (gas, 277.0), (tire, 282.0), (e1, 285.4)], g)
T("y2_gone", "RAISE: GONE", (-5.0, -1, 6.9), 0.5, RED, g, 288.0)
sam.mood(287.2, False)
T("y2_tight", "still tight on money", (-5.0, -1, 6.2), 0.36, GREY, g, 293.2)
y2j = jar("y2_jar", (2.4, -0.2, 0), s=0.55, label=""); y2j.parent = g; pop_in(y2j, 299.2, 0.45, 0.55)
fill_jar("y2_jar", 302.0, 304.4, 0.2, 0.4)
pz = empty("y2_pizza", (7.4, -0.5, 0), g)
box("y2_pzb", (1.6, 0.4, 0.5), (0, 0, 0.25), BROWN, pz, bevel=0.05)
text("y2_fun", "FUN", (0, -0.35, 0.25), 0.3, WHITE, pz)
popped(pz, 299.6)
a1 = arrow("y2_a1", (5.0, 4.6), (3.0, 3.0), DGREEN, 0.05, g); popped(a1, 301.8)
a2 = arrow("y2_a2", (5.0, 4.6), (7.0, 1.4), ORANGE, 0.05, g); popped(a2, 304.6)
kf(e2, "scale", F(301.4), (1, 1, 1), "SINE"); kf(e2, "scale", F(301.8), (0.7, 0.7, 0.7), "SINE")
T("y2_half1", "50%", (3.2, -1, 4.4), 0.4, DGREEN, g, 302.0)
T("y2_half2", "50%", (7.1, -1, 3.0), 0.4, ORANGE, g, 304.8)
for k, (ch, x) in enumerate((("🍕" if False else "PIZZA", 2.2), ("♫", 4.6), ("✈", 7.0))):
    ob = sym(f"y2_fun{k}", ch, (x, -1, 7.2), 0.5 if k == 0 else 0.8, [RED, PURPLE, BLUE][k], g)
    popped(ob, 308.4 + k * 1.1)
alx.mood(308.6, True); alx.jump(309.0, 0.4)
T("y2_monk", "not living like a monk", (4.8, -1, 6.2), 0.36, GREY, g, 312.3)
T("y2_care", "just careful", (4.8, -1, 5.6), 0.4, BLUE, g, 314.3)

# S8 compounding 318.4 - 371
g = group("S8", 318.3, 370.8)
cj = jar("c_jar", (-4.0, 0, 0), s=1.2, label="ALEX'S ACCOUNT"); cj.parent = g; pop_in(cj, 318.6, 0.45, 1.2)
fill_jar("c_jar", 318.6, 319.0, 0.3, 0.3)
T("c_quiet", "shhh... something is happening", (0, -1, 7.9), 0.42, GREY, g, 320.2, 338.0)
# coins sprouting coins
gen = [(-4.0, 3.1, 326.2)]
cc = coin("c_c0", (-4.0, -1.0, 3.1), g, 0.45); popped(cc, 326.2)
T("c_r1", "RETURN", (-1.2, -1, 3.1), 0.42, DGREEN, g, 327.0, 338.0)
kids1 = [(-4.8, 4.2), (-3.2, 4.2)]
for k, (x, z) in enumerate(kids1):
    popped(coin(f"c_c1{k}", (x, -1.0, z), g, 0.35), 330.3 + k * 0.3)
T("c_r2", "RETURN ON RETURN", (-0.6, -1, 4.2), 0.38, DGREEN, g, 331.0, 338.0)
for k in range(4):
    popped(coin(f"c_c2{k}", (-5.3 + k * 0.85, -1.0, 5.2), g, 0.28), 334.3 + k * 0.2)
T("c_r3", "AND AGAIN...", (-0.6, -1, 5.2), 0.38, DGREEN, g, 335.0, 338.0)
for nm in ["c_c0", "c_c10", "c_c11", "c_c20", "c_c21", "c_c22", "c_c23", "c_jar"]:
    pop_out(bpy.data.objects[nm], 338.6)
T("c_title", "COMPOUNDING", (0, -1.2, 7.4), 1.0, DGREEN, g, 338.9, 351.6)
hill = poly("c_hill", [(-8.5, 0), (-8.5, 6.0), (8.5, 0)], (0.82, 0.92, 0.82), g, outline=0.05, loc=(0, 1.0, 0))
popped(hill, 341.4)
sb = ball("c_snow", 0.5, (0, 0, 0), WHITE, None, outline=0.05)
sbp = empty("c_snowp", (-7.6, -0.3, 5.9), g)
sb.parent = sbp
line("c_snowmark", [(-0.3, 0.1), (0.3, -0.1)], LGREY, 0.04, sb, loc=(0, -0.55, 0))
popped(sbp, 341.6, 0.3)
# roll down slope: z = 6*(8.5-x)/17 ; ball radius grows
steps = 24
for i in range(steps + 1):
    t = 342.0 + (351.0 - 342.0) * i / steps
    u = i / steps
    x = -7.6 + 14.0 * (u ** 1.6)
    r = 0.3 + 1.6 * (u ** 2.2)
    zg = 6.0 * (8.5 - x) / 17.0
    kf(sbp, "location", F(t), (x, -0.3, zg + r * 1.05), "LINEAR")
    kf(sbp, "scale", F(t), (r, r, r), "LINEAR")
    kf(sb, "rotation_euler", F(t), (0, (x + 7.6) / max(r, 0.3) * 0.8, 0), "LINEAR")
pop_out(sbp, 351.8); pop_out(hill, 351.8)
chart_axes = line("c_axes", [(-6, 6.6), (-6, 0.8), (6, 0.8)], INK, 0.05, g, loc=(0, -0.5, 0))
popped(chart_axes, 352.2)
pts = [(-6, 1.4), (-5, 2.0), (-4.2, 1.6), (-3.4, 2.4), (-2.6, 2.1), (-1.8, 3.0), (-1.0, 2.5), (-0.2, 3.4), (0.6, 2.9), (1.4, 4.0), (2.2, 3.6), (3.0, 4.6), (3.8, 4.2), (4.6, 5.4), (5.6, 6.0)]
ch = line("c_chart", pts, DGREEN, 0.07, g, loc=(0, -0.8, 0)); ch.data.bevel_factor_end = 0
underline_draw(ch, 352.6, 6.0)
xmark("c_dip1", (-4.2, -1, 1.6), g, 355.2, 0.25)
T("c_scary", "scary years", (-3.6, -1, 0.9) if False else (-2.4, -1, 1.2), 0.32, RED, g, 355.6)
T("c_8", "~8% / year (average)", (0, -1.2, 7.4), 0.6, DGREEN, g, 362.0)
stamp("c_ng", "NOT GUARANTEED", (3.2, -2, 2.0), g, 364.8, None, size=0.5, rotdeg=-10)

# S9 six years 371 - 431
g = group("S9", 371.0, 431.6)
cal = calendar("s9_cal", (0, -0.5, 6.6), g, 371.2, 377.0, 0.8)
counter_text("s9_yr", (0, -0.8, 6.4), 0.5, INK, g, [(371.4, 372.6, 1, 6)], "YEAR {:.0f}", t_in=371.3, out=377.0)
sam = stick("s9_sam", (-6.8, 0, 0), g, 373.3, "cap")
str9 = truck("s9_tr", (-2.6, 0.6, 0), s=0.62); str9.parent = g; pop_in(str9, 373.5, 0.45, 0.62)
counter_text("s9_72", (-4.0, -1, 7.5), 0.55, INK, g, [(377.2, 379.0, 0, 72)], "{:.0f} PAYMENTS", t_in=377.2)
T("s9_54", "$54,000 PAID", (-4.0, -1.2, 6.6), 0.6, RED, g, 382.0)
sam.jump(384.9); sam.jump(386.5); sam.wave("L", 386.5)
T("s9_free", "FREE!", (-6.8, -1, 4.6), 0.5, BLUE, g, 386.5, 389.4)
for k in range(3):
    sc_ = line(f"s9_scr{k}", [(-1.0 + k * 0.6, 1.4 - k * 0.1), (0.2 + k * 0.6, 0.9 - k * 0.1)], INK, 0.025, str9, loc=(0, -0.45, 0))
    popped(sc_, 392.0 + k * 0.15)
popped(disk("s9_stain", 0.25, (1.2, -0.45, 1.6), (0.45, 0.3, 0.15), str9, outline=False), 393.6)
ttag = tag("s9_val", "$45,000", (-3.0, -1.5, 4.6), g, 389.7, size=0.5)
tv = [o for o in bpy.data.objects if o.name == "s9_val_t"][0]
counter(tv, [(397.4, 399.8, 45000, 18000)])
alx = stick("s9_alx", (6.8, 0, 0), g, 401.4, "beanie")
yh = hatch("s9_h", (3.4, 0.6, 0), GREY, 0.5); yh.parent = g; pop_in(yh, 401.5, 0.45, 0.5)
ph9 = phone("s9_ph", (5.6, -1, 3.0), g, 402.6, None, 0.8)
counter_text("s9_69", (4.2, -1.2, 6.6), 0.9, DGREEN, g, [(407.0, 409.8, 0, 69000)], t_in=406.8)
alx.mood(407.0, True); alx.jump(409.0); alx.jump(409.5)
line("s9_div", [(0, -0.2), (0, 7.2)], LGREY, 0.04, g, loc=(0, 0.5, 0))
T("s9_sameam", "SAME $750 / MONTH", (0, -1.2, 8.1), 0.45, INK, g, 415.6)
pop_out(ttag, 423.0)
T("s9_r1", "OLD TRUCK", (-4.0, -1.2, 5.0), 0.55, RED, g, 423.3)
T("s9_r2", "OLD CAR", (4.2, -1.2, 5.3), 0.55, BLUE, g, 425.8)
T("s9_r3", "+ $69,000", (4.2, -1.2, 4.5), 0.6, DGREEN, g, 429.2)

# S10 trap 431.9 - 474
g = group("S10", 431.8, 474.2)
T("t_end", "THE END?", (0, -1, 6.6), 0.9, INK, g, 432.0, 436.0)
xmark("t_endx", (0, -1.2, 6.6), g, 435.2, 1.2, 436.4)
sam = stick("t_sam", (-5.6, 0, 0), g, 432.2, "cap")
otr = truck("t_old", (-1.6, 0.6, 0), s=0.6); otr.parent = g; pop_in(otr, 432.4, 0.45, 0.6)
phr = phone("t_ph", (-7.4, -1, 4.0), g, 436.5, 449.2, 0.7, screen=GREEN)
wiggle(phr, "rotation_euler", 1, 0.15, 0.12)
T("t_ring", "RING!", (-7.4, -1, 5.6), 0.4, RED, g, 436.6, 438.6)
bubble("t_b1", '"Such a great customer!\nTrade it in!"', (-1.6, -1, 6.6), g, 439.1, 445.0, size=0.36)
bubble("t_b2", '"Your payment would\nBARELY change."', (-1.6, -1, 6.6), g, 445.2, 450.2, size=0.36)
pop_out(otr, 445.3)
ntr = truck("t_new", (3.6, 0.6, 0), color=(0.95, 0.1, 0.25), s=0.68); ntr.parent = g; pop_in(ntr, 445.5, 0.45, 0.68)
for k in range(3):
    sparkle(f"t_sp{k}", (2.0 + k * 1.6, -1.5, 3.4 + (k % 2) * 0.7), g, 446.0 + k * 0.2, 0.3)
T("t_night", "...one night...", (0, -1, 7.6), 0.42, GREY, g, 450.5, 453.0)
contract("t_con", (-1.6, -0.5, 6.0), g, 453.3, 454.3, 457.0, s=0.75)
sam.mood(457.0, False)
mon = monster("t_mon", (-1.5, -0.5, 0.0), s=0.0, label="$750"); mon.parent = g
pop_in(mon, 457.6, 0.5, 0.8)
scale_to(mon, 463.0, 464.0, (0.8, 0.8, 0.8), (1.25, 1.25, 1.25), "BACK", "EASE_OUT")
T("t_big", "BIGGER!", (-1.5, -1, 4.6), 0.5, RED, g, 463.3, 469.0)
loop = empty("t_loop", (5.6, -1, 6.3), g)
lc = line("t_loopc", [(1.1 * math.cos(a * math.pi / 16), 1.1 * math.sin(a * math.pi / 16)) for a in range(29)], INK, 0.05, loop)
poly("t_looph", [(0.85, 0.35), (1.35, 0.35), (1.1, -0.05)], INK, loop, outline=False, loc=(0, 0, 0.05))
text("t_loopt", "6 YRS", (0, -0.1, 0), 0.32, INK, loop)
popped(loop, 465.0)
kf(loop, "rotation_euler", F(465.0), (0, 0, 0), "LINEAR"); kf(loop, "rotation_euler", F(474.0), (0, -math.pi * 4, 0), "LINEAR")
lbl = bpy.data.objects["t_mon_lbl"]
TEXTSWAP.append(("t_mon_lbl", [(0, "$750"), (470.9, "LOAN"), (471.6, "LEASE"), (472.3, "PAYMENT")]))

# S11 boring move 474 - 542
g = group("S11", 474.0, 541.8)
alx = stick("b_alx", (-6.6, 0, 0), g, 474.2, "beanie")
bj = jar("b_jar", (-1.8, 0, 0), s=0.75, label=""); bj.parent = g; pop_in(bj, 474.3, 0.45, 0.75)
fill_jar("b_jar", 474.3, 474.5, 0.2, 0.2)
T("b_boring", "BORING MOVE", (0, -1, 7.8), 0.6, BLUE, g, 474.4, 484.0)
stp = empty("b_stop", (-4.2, -1, 4.6), g)
pts8 = [(0.7 * math.cos(math.pi / 8 + k * math.pi / 4), 0.7 * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
poly("b_stopo", pts8, RED, stp, outline=0.04)
text("b_stopt", "STOP", (0, -0.1, 0), 0.3, WHITE, stp)
popped(stp, 476.9, 1.0, 484.0)
T("b_alone", "...and leave it alone", (2.6, -1, 4.6), 0.42, GREY, g, 482.8, 489.0)
counter_text("b_yrs", (3.6, -1.2, 6.6), 0.75, INK, g, [(484.6, 485.6, 1, 1), (485.7, 486.8, 1, 10), (487.0, 488.4, 10, 20), (489.0, 505.0, 20, 30)], "YEAR {:.0f}", t_in=484.6, out=506.0)
old_look(alx, 489.4)
pop_out(bj, 489.0)
nh = hatch("b_h2", (-2.2, 0.6, 0), BLUE, 0.5); nh.parent = g; pop_in(nh, 491.8, 0.45, 0.5)
T("b_cash", "paid in cash", (-2.2, -1, 2.4), 0.36, DGREEN, g, 492.4, 506.0)
kid1 = stick("b_kid1", (1.4, 0, 0), g, 498.7, None, 0.5)
kid2 = stick("b_kid2", (2.4, 0, 0), g, 499.0, None, 0.45)
house("b_house", (5.6, 0.8, 0), g, 499.6, None, 1.1)
T("b_gh", "good years  &  hard years", (2.0, -1, 5.2), 0.38, INK, g, 500.4, 506.0)
sb2p = empty("b_snowp", (-9, -1.2, 0.5), g)
sb2 = ball("b_snow", 0.5, (0, 0, 0), WHITE, sb2p, outline=0.05)
line("b_snowmark", [(-0.3, 0.1), (0.3, -0.1)], LGREY, 0.04, sb2, loc=(0, -0.55, 0))
for i in range(13):
    t = 502.9 + 3.0 * i / 12
    u = i / 12
    r = 0.4 + 0.9 * u
    x = -9 + 18 * u
    kf(sb2p, "location", F(t), (x, -1.2, r), "LINEAR")
    kf(sb2p, "scale", F(t), (r / 0.5, r / 0.5, r / 0.5), "LINEAR")
    kf(sb2, "rotation_euler", F(t), (0, (x + 9) / r, 0), "LINEAR")
kf(sb2p, "scale", F(506.0), val(sb2p, "scale", F(506.0)), "CONSTANT"); kf(sb2p, "scale", F(506.1), (0, 0, 0), "CONSTANT")
# cleanup life icons, then the big reveal
for nm in ["b_kid1", "b_kid2", "b_house", "b_h2"]:
    pop_out(bpy.data.objects[nm], 506.3)
move(alx.root, 506.0, 507.0, (-6.6, 0, 0), (-4.5, 0, 0))
bigj = jar("b_bigjar", (2.6, 0.4, 0), s=0.9, label=""); bigj.parent = g; pop_in(bigj, 507.0, 0.45, 0.9)
fill_jar("b_bigjar", 507.1, 507.3, 0.12, 0.12)
phb = phone("b_ph", (-2.6, -1, 3.0), g, 508.0, 514.0, 0.8)
counter_text("b_754", (2.6, -1.5, 7.6), 1.0, DGREEN, g, [(514.2, 519.8, 69000, 754000)], t_in=514.0)
fill_jar("b_bigjar", 514.2, 519.8, 0.12, 1.0)
scale_to(bigj, 514.2, 519.8, (0.9, 0.9, 0.9), (1.25, 1.25, 1.25), "SINE", "EASE_IN_OUT")
alx.mood(512.2, True); alx.jump(512.4); alx.jump(512.9)
T("b_nomore", "without adding a single dollar more", (0, -1.2, 6.6), 0.4, INK, g, 520.0, 523.4)
# Sam's trucks parade
pop_out(bigj, 523.4); pop_out(alx.root, 523.4)
pop_out(bpy.data.objects["b_754"], 523.4)
T("b_sam5", "Sam: 5-6 trucks", (0, -1, 7.6), 0.55, RED, g, 523.7, 534.2)
for k in range(5):
    tk = truck(f"b_tk{k}", (-6.4 + k * 3.2, 0.6, 0), s=0.33); tk.parent = g; pop_in(tk, 524.2 + k * 0.4, 0.4, 0.33)
    tag(f"b_tkv{k}", "$" + str(45 - k * 0) + "k", (-6.4 + k * 3.2, -1, 2.4), g, 527.2 + k * 0.2, None, size=0.35, rotdeg=0)
    tvo = bpy.data.objects[f"b_tkv{k}_t"]
    counter(tvo, [(531.0 + k * 0.2, 533.2, 45, 15)], "${:.0f}k")
    pop_out(tk, 534.3)
    pop_out(bpy.data.objects[f"b_tkv{k}"], 534.3)
sparkle("b_shiny", (0, -1.5, 4.4), g, 528.3, 0.4, 530.6)
alx2 = stick("b_alx2", (-5.0, 0, 0), g, 534.6, None)
old_look(alx2, 534.6)
for k in range(3):
    popped(bill(f"b_pile{k}", (0.5 + k * 0.2, -1, 0.5 + k * 0.45), g, 1.1), 538.5 + k * 0.15, 1.1)
T("b_boringcars", "a few boring cars", (2.6, -1, 6.4), 0.42, GREY, g, 534.8)
T("b_squeak", "a few squeaky doors", (2.6, -1, 5.6), 0.42, GREY, g, 536.6)
T("b_34", "$750,000+", (2.6, -1.2, 4.4), 0.8, DGREEN, g, 538.5)

# S12 twist 542 - 594.6
g = group("S12", 542.0, 594.6)
sam = stick("w_sam", (-4.5, 0, 0), g, 542.2, "cap")
wtr = truck("w_tr", (1.4, 0.6, 0), s=0.62); wtr.parent = g; pop_in(wtr, 542.4, 0.45, 0.62)
T("w_nv", "NOT A VILLAIN", (-4.5, -1, 5.0), 0.5, BLUE, g, 544.0, 558.8)
halo = line("w_halo", [(0.55 * math.cos(a * math.pi / 12), 0.17 * math.sin(a * math.pi / 12)) for a in range(25)], GOLD, 0.05, g, loc=(-4.5, -1, 4.2))
popped(halo, 544.4, 1.0, 558.8)
heart("w_love", (1.4, -1.5, 4.0), g, 0.6); popped(bpy.data.objects["w_love"], 547.8, 1.0, 558.8)
check("w_ok", (4.8, -1, 4.0), g, 552.0, 0.6, 558.8)
T("w_rel", "need a reliable car? buy one.", (1.4, -1, 6.6), 0.42, INK, g, 552.4, 558.8)
xmark("w_x", (1.4, -1.5, 1.6), g, 559.2, 2.0, 562.6)
T("w_never", "never about trucks", (0, -1, 6.6), 0.55, INK, g, 559.4, 562.6)
pop_out(sam.root, 562.8); pop_out(wtr, 562.8)
mon = monster("w_mon", (0, -0.4, 1.0), s=0.0, label="THE PAYMENT"); mon.parent = g
pop_in(mon, 563.2, 0.5, 1.6)
T("w_lose", "things that LOSE value", (0, -1.2, 7.8), 0.5, RED, g, 568.0)
ph12 = phone("w_ph", (-6.0, -1, 5.4), g, 573.2, None, 1.0)
T("w_pht", "$1,200 phone", (-6.0, -1, 3.8), 0.36, INK, g, 573.6, 585.0)
sf = sofa("w_sofa", (6.0, -0.2, 4.2), g, 576.4, None, 0.7)
T("w_sft", "0% financing!", (6.0, -1, 3.5), 0.36, INK, g, 576.8, 585.0)
sh = shoe("w_shoe", (6.0, -0.2, 1.0), g, 580.6, None, 0.7)
T("w_sht", "buy now, pay later", (6.0, -1, 0.5), 0.36, INK, g, 581.0, 585.0)
T("w_small", "small...", (-6.0, -1, 2.4), 0.42, GREY, g, 584.3, 589.4)
T("w_harmless", "harmless...", (-6.0, -1, 1.6), 0.42, GREY, g, 586.4, 589.4)
monster_eats("w_mon", [(ph12, 589.2), (sf, 589.8), (sh, 590.4)], g)
ens = [envelope(f"w_env{k}", (-5.6 + k * 2.1, -1, 6.6), g, 590.6 + k * 0.15, "RAISE") for k in range(3)]
monster_eats("w_mon", [(ens[k], 591.6 + k * 0.5) for k in range(3)], g)

# S13 challenge 595 - 623
g = group("S13", 595.0, 622.8)
T("ch_t", "YOUR CHALLENGE", (0, -1, 7.8), 0.75, ORANGE, g, 595.2)
pad = box("ch_pad", (9.5, 0.1, 5.4), (-1.4, 0.4, 3.6), (1.0, 0.97, 0.75), g, outline=0.05, bevel=0.1)
popped(pad, 595.6)
for k in range(5):
    line(f"ch_rule{k}", [(-5.8, 5.6 - k * 0.95), (3.0, 5.6 - k * 0.95)], (0.75, 0.85, 0.95), 0.02, g, loc=(0, 0.2, 0))
T("ch_1", "1. List every monthly payment", (-5.6, -0.6, 5.3), 0.45, INK, g, 598.4).data.align_x = "LEFT"
T("ch_2", "2. Circle what loses value", (-5.6, -0.6, 4.2), 0.45, INK, g, 603.0).data.align_x = "LEFT"
oc = line("ch_circ", [(1.9 * math.cos(a * math.pi / 16), 0.45 * math.sin(a * math.pi / 16)) for a in range(34)], RED, 0.04, g, loc=(-1.6, -0.8, 4.2))
oc.data.bevel_factor_end = 0; underline_draw(oc, 604.0, 0.8)
T("ch_3", "3. Pick just ONE", (-5.6, -0.6, 3.1), 0.45, INK, g, 606.4).data.align_x = "LEFT"
for k, x in enumerate((-5.4, -4.2, -3.0, -1.8)):
    pass
cj2 = jar("ch_jar", (6.0, 0, 0), s=0.75, label="30 YEARS"); cj2.parent = g; pop_in(cj2, 609.2, 0.45, 0.75)
coin_drops(g, 609.6, 615.4, 6.0, 4.0, 1.4, 0.6, "ch_cd")
fill_jar("ch_jar", 609.6, 615.4, 0.0, 0.9)
pop_out(pad, 616.2)
for nm in ["ch_1", "ch_2", "ch_3", "ch_circ"] + [f"ch_rule{k}" for k in range(5)]:
    o = bpy.data.objects[nm]
    if nm.startswith("ch_rule") or nm == "ch_circ":
        kf(o, "scale", F(595.6), (0, 0, 0), "CONSTANT"); kf(o, "scale", F(596.0), (1, 1, 1), "CONSTANT")
    pop_out(o, 616.2)
T("ch_b1", "boring forever", (-2.4, -1, 4.6), 0.6, GREY, g, 616.6)
xmark("ch_bx", (-2.4, -1.2, 4.6), g, 617.6, 0.5)
T("ch_b2", "boring ENOUGH", (-2.4, -1, 3.0), 0.7, DGREEN, g, 619.8)
check("ch_bc", (1.4, -1, 3.0), g, 620.6, 0.5)

# S14 outro 623 - 635
g = group("S14", 623.0, 640.0)
lb = bill("o_bill", (0, -0.5, 5.8), g, 2.2); popped(lb, 623.4, 2.2)
wiggle(lb, "rotation_euler", 1, 0.06, 2.0)
pen = empty("o_pen", (3.0, -1, 5.6), g)
box("o_penb", (0.3, 0.1, 2.2), (0, 0, 0), YELLOW, pen, bevel=0.05)
poly("o_pent", [(-0.15, -1.1), (0.15, -1.1), (0, -1.5)], (0.95, 0.85, 0.7), pen, outline=0.02)
pen.rotation_euler[1] = math.radians(-35)
popped(pen, 623.8)
T("o_name", "DOODLE DOLLAR", (0, -1.2, 3.2), 1.1, INK, g, 623.6)
sub = empty("o_sub", (0, -1, 1.4), g)
box("o_subb", (4.2, 0.1, 1.0), (0, 0, 0), (0.85, 0.1, 0.1), sub, bevel=0.3)
text("o_subt", "SUBSCRIBE", (0, -0.12, 0), 0.45, WHITE, sub)
popped(sub, 625.6)
kf(sub, "scale", F(627.8), (1, 1, 1), "SINE"); kf(sub, "scale", F(628.1), (0.9, 0.9, 0.9), "SINE"); kf(sub, "scale", F(628.4), (1, 1, 1), "SINE")
bubble("o_q", "Which payment will you\nkill first?", (-4.2, -1, 7.2), g, 630.0, None, size=0.38, tail=(0.6, -0.9))
om = monster("o_mon", (6.4, -0.4, 6.4), s=0.0, label="$750"); om.parent = g
pop_in(om, 630.4, 0.45, 0.6)
move(om, 632.4, 634.4, (6.4, -0.4, 6.4), (12.0, -0.4, 6.4), "SINE", "EASE_IN")


# ------------------------------------------------------------------ counters / text swaps
import json as _json
COUNTER_SRC = """
import bpy, json
C = json.loads(%r)
S = json.loads(%r)
def ease(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)
def upd(scene, *a):
    t = (scene.frame_current - 1) / 24.0
    for name, segs, fmt in C:
        ob = bpy.data.objects.get(name)
        if ob is None: continue
        v = segs[0][2]
        for t0, t1, v0, v1 in segs:
            if t >= t0:
                v = v0 + (v1 - v0) * ease((t - t0) / max(t1 - t0, 1e-3))
        body = fmt.format(v)
        if ob.data.body != body: ob.data.body = body
    for name, steps in S:
        ob = bpy.data.objects.get(name)
        if ob is None: continue
        body = steps[0][1]
        for ts, b in steps:
            if t >= ts: body = b
        if ob.data.body != body: ob.data.body = body
bpy.app.handlers.frame_change_pre.clear()
bpy.app.handlers.frame_change_pre.append(upd)
""" % (_json.dumps(lib.COUNTERS), _json.dumps(TEXTSWAP))
exec(COUNTER_SRC)

sc.frame_start, sc.frame_end = FS, FE
sc.render.filepath = OUT + "/f_"
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGB"
sc.render.use_overwrite = False
sc.render.use_placeholder = True
sc.render.use_lock_interface = True
if "--save" in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=OUT + "/doodle_dollar.blend")
if "--still" in sys.argv:
    for fr in [int(x) for x in sys.argv[sys.argv.index("--still") + 1].split(",")]:
        sc.frame_set(fr)
        sc.render.filepath = OUT + f"/still_{fr:05d}.png"
        bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
