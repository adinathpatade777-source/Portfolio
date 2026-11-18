"""Rigged, cel-shaded characters and props drawn from code.

- Sneaker + trouser leg (side view) with a walk cycle (heel lift, swing, heel strike).
- Seated boy at a desk, backlit by a window: head, spiky hair, hoodie, 2-bone IK
  arm that writes; blink and breathing.
- Maple leaf (7 lobes) with veins, back-light translucency and sway.
"""
import math
import numpy as np
from .core import col, fill, stroke, disc, xform, thick_line, mix, smooth, ease_in_out

# ------------------------------------------------------------------ sneaker
SOLE = [(-10, 0), (330, 0), (358, -12), (364, -30), (0, -32), (-14, -18)]
UPPER = [(-6, -30), (-12, -92), (6, -138), (62, -152), (108, -130), (176, -112), (258, -88), (322, -62), (356, -40), (362, -28), (0, -28)]
UPPER_SHADE = [(-6, -30), (-10, -66), (150, -64), (300, -56), (356, -40), (362, -28), (0, -28)]
TOE_CAP = [(268, -84), (322, -62), (356, -40), (362, -28), (282, -30)]
COLLAR = [(6, -138), (62, -152), (108, -130), (86, -118), (30, -122)]
LEG = [(14, -126), (112, -126), (128, -560), (-6, -560)]
LEG_SHADE = [(14, -126), (52, -126), (48, -560), (-6, -560)]
CUFF = [(6, -128), (120, -128), (124, -176), (2, -176)]

SHOE_C = dict(upper=col('#7b4a2b'), shade=col('#55321d'), light=col('#b47a48'), sole=col('#eadcb8'),
              sole_s=col('#bfae88'), line=col('#24150d'), lace=col('#efe6d2'), leg=col('#26324d'),
              leg_s=col('#19213a'), cuff=col('#2e3b5a'))


def sneaker(img, origin, angle=0.0, pivot=(0, 0), scale=1.0, mirror_y=None, dark=0.0, leg=True):
    """Draw one sneaker (+ trouser leg). origin = where the local pivot lands.
    mirror_y: if set, draw the reflection about that horizontal line."""
    def T(p):
        q = xform(p, origin, angle, scale, pivot)
        if mirror_y is not None:
            q[:, 1] = 2 * mirror_y - q[:, 1]
        return q
    C = {k: mix(v, np.array([60, 70, 60], np.float32), dark) for k, v in SHOE_C.items()}
    if leg:
        fill(img, T(LEG), C['leg']); fill(img, T(LEG_SHADE), C['leg_s'], 0.9)
        fill(img, T(CUFF), C['cuff']); stroke(img, T(CUFF), C['line'], 2.2 * scale, 0.6, closed=True)
    fill(img, T(UPPER), C['upper']); fill(img, T(UPPER_SHADE), C['shade'], 0.95)
    fill(img, T(TOE_CAP), C['shade'], 0.5)
    stroke(img, T([(20, -128), (60, -140), (100, -124), (170, -108)]), C['light'], 5 * scale, 0.85)  # rim highlight
    fill(img, T(COLLAR), C['line'], 0.85)
    for k in range(5):  # laces
        a = 120 + k * 26
        stroke(img, T([(a, -118 + k * 6), (a + 30, -100 + k * 7)]), C['lace'], 4 * scale, 0.95)
    fill(img, T(SOLE), C['sole']); fill(img, T([(-10, 0), (330, 0), (358, -12), (0, -12)]), C['sole_s'], 0.9)
    stroke(img, T(UPPER), C['line'], 3 * scale, 0.9, closed=True)
    stroke(img, T(SOLE), C['line'], 3 * scale, 0.9, closed=True)


def step_pose(u, x_from, x_to, ground, lift=110):
    """Walk-cycle pose for a stepping foot. u: 0..1 through the step.
    Returns (origin, angle, pivot) for sneaker()."""
    if u <= 0:
        return (x_from, ground), 0.0, (0, 0)
    if u < 0.25:  # heel lift, rolling over the toe
        k = ease_in_out(u / 0.25)
        return (x_from + 360, ground), -24 * k, (360, 0)
    if u < 0.85:  # swing
        k = ease_in_out((u - 0.25) / 0.6)
        x = x_from + (x_to - x_from) * k
        y = ground - math.sin(k * math.pi) * lift - 40 * (1 - k)
        ang = -24 * (1 - k) + 12 * math.sin(k * math.pi) * 0 + (-10) * k
        return (x + 180, y), ang, (180, 0)
    k = ease_in_out((u - 0.85) / 0.15)  # heel strike, toe comes down
    return (x_to, ground), -10 * (1 - k), (0, 0)


# ------------------------------------------------------------------ seated boy
BOY = dict(skin=col('#8a5a44'), skin_lit=col('#e2a986'), skin_rim=col('#ffd9b2'), hair_hl=col('#3c5560'), hair=col('#12161b'), hair_rim=col('#8fd3cf'),
           hood=col('#2c3826'), hood_s=col('#1d2619'), hood_rim=col('#d9e8b0'), line=col('#0b0d0f'),
           eye=col('#f2efe6'), iris=col('#3a2a20'), pencil=col('#2f6b5a'), wood=col('#e6c58f'))


def ik2(shoulder, target, l1, l2, bend=1):
    sx, sy = shoulder; tx, ty = target
    d = min(math.hypot(tx - sx, ty - sy), l1 + l2 - 1e-3)
    a = math.atan2(ty - sy, tx - sx)
    cosb = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    b = math.acos(max(-1, min(1, cosb)))
    ea = a + b * bend
    return (sx + math.cos(ea) * l1, sy + math.sin(ea) * l1)


def writing_tip(t, base=(830, 812)):
    """Pencil tip path: small handwriting loops moving right along a line, then a new line."""
    line_dur = 1.6
    k = (t % line_dur) / line_dur
    line = int(t // line_dur)
    x = base[0] + k * 170 + 7 * math.sin(t * 15)
    y = base[1] + line * 26 + 6 * math.sin(t * 30 + 0.6) - (0 if k < 0.93 else (k - 0.93) * 300)
    pen_down = 0.04 < k < 0.93 and math.sin(t * 15 * 0.5) > -0.85
    return (x, y), pen_down


def seated_boy(img, t, ink_layer=None):
    C = BOY
    breathe = math.sin(t * 2 * math.pi / 3.6)
    nod = 3 * math.sin(t * 1.1) + 1.5 * math.sin(t * 2.7)
    # torso (hoodie), back to the left, chest facing the window on the right
    sh = (640, 555 - breathe * 3)
    torso = [(300, 1080), (318, 880), (360, 700), (430, 580), (520, 520 - breathe * 3), (650, 505 - breathe * 3), (730, 560), (770, 700), (790, 1080)]
    fill(img, torso, C['hood'])
    fill(img, [(300, 1080), (318, 880), (360, 700), (430, 580), (500, 545), (520, 720), (470, 1080)], C['hood_s'], 0.9, blur=6)
    stroke(img, [(650, 500 - breathe * 3), (742, 560), (790, 700), (812, 1080)], C['hood_rim'], 6, 0.85, blur=1.2)
    stroke(img, [(470, 560), (520, 640), (600, 650), (680, 600)], C['line'], 4, 0.5)  # hood fold
    # head: side profile facing the window (right), lit from the window side
    hc = np.array([596, 290 - breathe * 2], np.float32)
    ang = nod + 12
    HS = 1.3
    T = lambda pts: xform(pts, hc, ang, HS)
    neck = xform([(-40, 70), (45, 80), (62, 190), (-46, 190)], hc, nod * 0.3, HS)
    fill(img, neck, C['skin']); fill(img, neck[1:3].tolist() + [(neck[2][0] - 26, neck[2][1]), (neck[1][0] - 22, neck[1][1])], C['skin_lit'], 0.9)
    disc(img, hc + (-8 * HS, -22 * HS), 104 * HS, C['skin'])
    face = [(40, -100), (88, -70), (104, -34), (110, -10), (130, 8), (116, 22), (118, 36), (112, 44), (114, 56), (100, 78), (62, 104), (20, 108), (-20, 80), (-40, 20), (0, -60)]
    fill(img, T(face), C['skin'])
    lit_face = [(40, -100), (88, -70), (104, -34), (110, -10), (130, 8), (116, 22), (118, 36), (112, 44), (114, 56), (100, 78), (62, 104), (30, 100), (24, 40), (14, -40)]
    fill(img, T(lit_face), C['skin_lit'], 0.95, blur=9)
    stroke(img, T(face[1:11]), C['line'], 2.5, 0.55)
    stroke(img, T([(104, 50), (112, 50)]), C['line'], 2.5, 0.7)  # mouth
    ear = T([(-22, -6), (2, -20), (14, 6), (2, 32), (-20, 22)])
    # anime eye in profile: thick upper lid, tall iris with highlight; blinks
    blink = 1.0 - max(0.0, 1 - abs(((t + 0.7) % 3.2) - 0.08) / 0.08)
    ec = T([(78, -14)])[0]
    if blink > 0.2:
        fill(img, xform([(-14, -14 * blink), (16, -16 * blink), (20, 4), (-10, 10)], ec, ang, HS), C['eye'])
        disc(img, xform([(6, -1)], ec, ang, HS)[0], 9 * HS, C['iris'], ry=13 * HS * blink)
        disc(img, xform([(10, -6)], ec, ang, HS)[0], 3, C['eye'], ry=3 * blink)
    stroke(img, xform([(-18, -14 * max(blink, 0.15)), (2, -20 * max(blink, 0.15)), (24, -12 * max(blink, 0.15))], ec, ang, HS), C['line'], 6)
    stroke(img, T([(46, -48), (74, -56), (98, -46)]), C['line'], 5)  # brow
    # hair: spiky mass with fringe falling over the brow, rim-lit by the window
    hair = [(96, -60), (78, -46), (84, -78), (58, -60), (60, -100), (30, -84), (28, -128), (-10, -112), (-30, -150), (-58, -108), (-110, -138), (-98, -96), (-150, -96), (-112, -62),
            (-152, -38), (-104, -24), (-128, 14), (-74, 8), (-60, 48), (-30, 0), (-4, -36), (30, -40), (54, -20), (66, -40)]
    fill(img, T(hair), C['hair'])
    stroke(img, T(hair[:9]), C['hair_rim'], 4, 0.95, blur=0.8)
    for k in (4, 6, 8, 10):
        stroke(img, T([hair[k], (hair[k][0] * 0.45, hair[k][1] * 0.45)]), C['hair_hl'], 3, 0.5)
    fill(img, ear, mix(C['skin'], C['skin_lit'], 0.4)); stroke(img, ear, C['line'], 2, 0.5, closed=True)
    # hood collar around the neck
    fill(img, [(500, 470), (560, 440), (690, 480), (720, 540), (640, 560), (540, 540)], C['hood'])
    stroke(img, [(560, 440), (690, 480), (720, 540)], C['hood_rim'], 5, 0.8, blur=1)
    # writing arm (IK), hand and pencil
    tip, pen = writing_tip(t)
    hand = (tip[0] - 46, tip[1] - 62 - (0 if pen else 10))
    elbow = ik2(sh, hand, 190, 200, bend=1)
    arm = thick_line([sh, ((sh[0] + elbow[0]) / 2, (sh[1] + elbow[1]) / 2), elbow], [96, 84, 74])
    fore = thick_line([elbow, ((elbow[0] + hand[0]) / 2, (elbow[1] + hand[1]) / 2), hand], [76, 70, 58])
    fill(img, arm, C['hood']); fill(img, fore, C['hood'])
    stroke(img, fore[: len(fore) // 2], C['hood_rim'], 5, 0.8, blur=1)
    stroke(img, arm[: len(arm) // 2], C['hood_rim'], 4, 0.6, blur=1)
    disc(img, (hand[0] + 14, hand[1] + 14), 34, C['skin'], ry=28)
    for k in range(3):
        disc(img, (hand[0] + 40 + k * 4, hand[1] + 26 + k * 13), 12, C['skin'], ry=9)
    stroke(img, [(hand[0] - 6, hand[1] - 8), (hand[0] + 40, hand[1] + 2)], C['skin_rim'], 4, 0.8, blur=0.8)
    stroke(img, [(tip[0] - 70, tip[1] - 98), tip], C['pencil'], 9)
    stroke(img, [(tip[0] - 14, tip[1] - 19), tip], C['wood'], 7)
    return tip, pen


# ------------------------------------------------------------------ maple leaf
def maple_points(n=7, r_main=1.0):
    pts = []
    lobes = [(-90, 1.0), (-140, 0.78), (-40, 0.78), (-185, 0.52), (5, 0.52), (-230, 0.3), (50, 0.3)]
    lobes = sorted(lobes, key=lambda a: a[0])
    for ang, ln in lobes:
        a = math.radians(ang)
        a_l, a_r = a - 0.22, a + 0.22
        pts += [(math.cos(a_l) * ln * 0.55, math.sin(a_l) * ln * 0.55), (math.cos(a - 0.08) * ln * 0.92, math.sin(a - 0.08) * ln * 0.92),
                (math.cos(a) * ln, math.sin(a) * ln), (math.cos(a + 0.08) * ln * 0.92, math.sin(a + 0.08) * ln * 0.92),
                (math.cos(a_r) * ln * 0.55, math.sin(a_r) * ln * 0.55)]
    pts += [(0.06, 0.12), (-0.06, 0.12)]
    return np.array(pts, np.float32) * r_main


MAPLE = maple_points()
LEAF_C = dict(base=col('#3c8a3a'), lit=col('#a7e05a'), dark=col('#25602a'), vein=col('#1f4d22'), rim=col('#e9ff9c'))


def maple(img, center, size, angle, backlit=0.6):
    pts = xform(MAPLE * size, center, angle)
    fill(img, pts, LEAF_C['base'])
    inner = xform(MAPLE * size * 0.62, center, angle)
    fill(img, inner, mix(LEAF_C['base'], LEAF_C['lit'], backlit), 0.85, blur=size * 0.06)
    half = xform(np.concatenate([[(0, 0.1)], MAPLE[: len(MAPLE) // 2]]) * size, center, angle)
    fill(img, half, LEAF_C['dark'], 0.35)
    for ang, ln in [(-90, 1.0), (-140, 0.78), (-40, 0.78), (-185, 0.5), (5, 0.5)]:
        a = math.radians(ang)
        stroke(img, xform(np.array([(0, 0.08), (math.cos(a) * ln * 0.85, math.sin(a) * ln * 0.85)], np.float32) * size, center, angle), LEAF_C['vein'], max(1.5, size * 0.018), 0.7)
    stroke(img, pts, LEAF_C['rim'], max(1.5, size * 0.012), 0.55 * backlit, closed=True, blur=0.8)
    stroke(img, xform(np.array([(0, 0.1), (0, 0.45)], np.float32) * size, center, angle), LEAF_C['vein'], max(2, size * 0.03), 0.9)
    return xform(np.array([[0, -1.0]], np.float32) * size, center, angle)[0]  # tip (for drips)
