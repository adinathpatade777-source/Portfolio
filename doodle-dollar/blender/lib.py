"""Doodle Dollar Blender helpers: flat cartoon look, outlines, eased keyframes."""
import bpy, math
from mathutils import Vector

FPS = 24
FONT_PATH = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
_font = None
_mats = {}
PARTS = {}  # name -> dict of sub-objects
STYLE3D = False  # lit, shaded 3D look (set by build.py --3d)
K3D = 3.0  # world depth stretch used in 3D mode; round things pre-squash by 1/K3D

PAPER = (0.98, 0.965, 0.93)
INK = (0.08, 0.08, 0.1)
RED = (0.86, 0.16, 0.14)
BLUE = (0.16, 0.42, 0.85)
GREEN = (0.18, 0.68, 0.32)
DGREEN = (0.08, 0.45, 0.2)
GOLD = (0.98, 0.76, 0.12)
GREY = (0.62, 0.64, 0.66)
LGREY = (0.85, 0.86, 0.87)
YELLOW = (0.99, 0.84, 0.2)
SKY = (0.62, 0.84, 0.97)
WHITE = (1, 1, 1)
BROWN = (0.62, 0.42, 0.24)
ORANGE = (0.98, 0.55, 0.15)
PURPLE = (0.55, 0.35, 0.8)


def F(t):
    """seconds -> frame"""
    return int(round(t * FPS)) + 1


def srgb2lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def mat(color, alpha=1.0, name=None):
    key = (tuple(round(c, 3) for c in color), alpha)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name or f"flat_{len(_mats)}")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if STYLE3D and alpha >= 1 and not (name or "").startswith("outline"):
        em = nt.nodes.new("ShaderNodeBsdfPrincipled")
        em.inputs["Base Color"].default_value = (*srgb2lin(color), 1)
        em.inputs["Roughness"].default_value = 0.42
        em.inputs["Specular IOR Level"].default_value = 0.35
        em.inputs["Coat Weight"].default_value = 0.15
    else:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs[0].default_value = (*srgb2lin(color), 1)
    if alpha < 1:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        m.blend_method = "BLEND"
        m.shadow_method = "NONE"
    else:
        nt.links.new(em.outputs[0], out.inputs[0])
    _mats[key] = m
    return m


def outline_mat():
    if "outline" in bpy.data.materials:
        return bpy.data.materials["outline"]
    m = bpy.data.materials.new("outline")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*srgb2lin(INK), 1)
    nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
    m.shadow_method = "NONE"
    m.use_backface_culling = True
    return m


def add_outline(ob, thick=0.05):
    ob.data.materials.append(outline_mat())
    mod = ob.modifiers.new("ol", "SOLIDIFY")
    mod.thickness = thick
    mod.offset = 1
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = len(ob.data.materials) - 1


def link(ob, parent=None):
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    return link(e, parent)


def _finish(ob, color, parent, outline, alpha=1.0):
    ob.data.materials.clear()
    ob.data.materials.append(mat(color, alpha))
    if outline:
        add_outline(ob, outline if isinstance(outline, float) else 0.05)
    return link(ob, parent)


def box(name, size, loc, color, parent=None, outline=True, bevel=0.08, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (size[0], max(size[1] if len(size) > 2 else 0.2, 0.01), size[-1])
    ob.rotation_euler[1] = math.radians(rot)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = ob.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 4
    return _finish(ob, color, parent, outline)


def disk(name, r, loc, color, parent=None, outline=True, depth=0.1, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=(math.pi / 2, 0, 0), vertices=verts)
    ob = bpy.context.object
    ob.name = name
    bpy.ops.object.transform_apply(rotation=True)
    if STYLE3D:
        bv = ob.modifiers.new("bev", "BEVEL")
        bv.width = min(0.035, depth * 0.35, r * 0.3)
        bv.segments = 3
        bpy.ops.object.shade_smooth()
        ob.data.use_auto_smooth = True
        ob.data.auto_smooth_angle = math.radians(40)
    return _finish(ob, color, parent, outline)


def ball(name, r, loc, color, parent=None, outline=True, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=40, ring_count=20)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    if STYLE3D:
        ysq(ob)
    bpy.ops.object.shade_smooth()
    return _finish(ob, color, parent, outline)


def ysq(ob, f=None):
    """Pre-squash object in y so the world depth stretch leaves it round. Kept through scale keys."""
    f = f if f is not None else 1.0 / K3D
    ob["ysq"] = f
    sc_ = list(ob.scale); sc_[1] *= f; ob.scale = sc_
    return ob


def dome(name, r, loc, color, parent=None, outline=0.04, zscale=1.0):
    """Upper hemisphere (caps, beanies)."""
    import bmesh
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(0, 0, 0), segments=40, ring_count=20)
    ob = bpy.context.object
    ob.name = name
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
    bm.to_mesh(ob.data); bm.free()
    bpy.ops.object.shade_smooth()
    ob.location = loc
    ob.scale = (1, 1, zscale)
    ysq(ob)
    return _finish(ob, color, parent, outline)


def poly(name, pts, color, parent=None, outline=True, y=0.0, depth=0.1, loc=(0, 0, 0)):
    """Filled flat polygon from 2D points (x,z)."""
    me = bpy.data.meshes.new(name)
    vs = [(x, -depth / 2, z) for x, z in pts] + [(x, depth / 2, z) for x, z in pts]
    n = len(pts)
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    me.from_pydata(vs, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (loc[0], y + loc[1], loc[2])
    return _finish(ob, color, parent, outline)


def line(name, pts, color=INK, width=0.06, parent=None, loc=(0, 0, 0), cyclic=False):
    """Thick ink stroke through 2D points (x,z)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = width
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, z) in zip(sp.points, pts):
        p.co = (x, 0, z, 1)
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    cu.materials.append(mat(color))
    if STYLE3D:
        ysq(ob)
    return link(ob, parent)


def smooth_line(name, pts, color=INK, width=0.06, parent=None, loc=(0, 0, 0)):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = width
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for p, (x, z) in zip(sp.bezier_points, pts):
        p.co = (x, 0, z)
        p.handle_left_type = p.handle_right_type = "AUTO"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    cu.materials.append(mat(color))
    if STYLE3D:
        ysq(ob)
    return link(ob, parent)


def text(name, body, loc, size=1.0, color=INK, parent=None, align="CENTER", outline=False, extrude=0.02):
    global _font
    if _font is None:
        _font = bpy.data.fonts.load(FONT_PATH)
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = _font
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    if STYLE3D:
        cu.extrude = max(extrude, 0.06 * size)
        cu.bevel_depth = 0.012 * size
        cu.bevel_resolution = 2
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (math.pi / 2, 0, 0)
    cu.materials.append(mat(color))
    if outline:
        cu.offset = 0
    return link(ob, parent)


# ---------------------------------------------------------------- animation

def kf(ob, path, frame, value, interp="BEZIER", easing="AUTO", index=-1):
    if path == "location":
        ob.location = value
    elif path == "scale":
        v = list(value) if hasattr(value, "__len__") else [value, value, value]
        if "ysq" in ob.keys():
            v[1] *= ob["ysq"]
        ob.scale = v
    elif path == "rotation_euler":
        ob.rotation_euler = value
    else:
        setattr(ob, path, value)
    ob.keyframe_insert(path, frame=frame, index=index)
    ad = ob.animation_data
    for fc in ad.action.fcurves:
        if fc.data_path == path:
            for k in fc.keyframe_points:
                if int(k.co[0]) == frame:
                    k.interpolation = interp
                    k.easing = easing
                    if interp == "BACK":
                        k.back = 1.6


def pop_in(ob, t, dur=0.45, s=1.0):
    """Scale from 0 with overshoot."""
    sc = s if hasattr(s, "__len__") else (s, s, s)
    kf(ob, "scale", F(t) - 1, (0, 0, 0), "BACK", "EASE_OUT")
    kf(ob, "scale", F(t), (0.001, 0.001, 0.001), "BACK", "EASE_OUT")
    kf(ob, "scale", F(t + dur), sc)


def val(ob, path, frame):
    """Animated value of ob.path at frame (reads fcurves; safe after depsgraph resets)."""
    res = list(getattr(ob, path))
    ad = ob.animation_data
    if ad and ad.action:
        for i in range(len(res)):
            fc = ad.action.fcurves.find(path, index=i)
            if fc:
                res[i] = fc.evaluate(frame)
    if path == "scale" and "ysq" in ob.keys():
        res[1] /= ob["ysq"]
    return tuple(res)


def pop_out(ob, t, dur=0.3):
    sc = val(ob, "scale", F(t - dur))
    kf(ob, "scale", F(t - dur), sc, "BACK", "EASE_IN")
    kf(ob, "scale", F(t), (0, 0, 0), "CONSTANT")


def hide_until(ob, t):
    """Scale 0 before t (for children already pop-animated)."""
    kf(ob, "scale", 1, (0, 0, 0), "CONSTANT")


def move(ob, t0, t1, a, b, interp="SINE", easing="EASE_IN_OUT"):
    kf(ob, "location", F(t0), a, interp, easing)
    kf(ob, "location", F(t1), b, interp, easing)


def rot(ob, t0, t1, a, b, interp="SINE", easing="EASE_IN_OUT"):
    kf(ob, "rotation_euler", F(t0), a, interp, easing)
    kf(ob, "rotation_euler", F(t1), b, interp, easing)


def scale_to(ob, t0, t1, a, b, interp="SINE", easing="EASE_IN_OUT"):
    kf(ob, "scale", F(t0), a, interp, easing)
    kf(ob, "scale", F(t1), b, interp, easing)


def wiggle(ob, path, index, amp, period, phase=0.0):
    """Continuous sine oscillation using an fcurve modifier (cheap & smooth)."""
    if not ob.animation_data or not ob.animation_data.action:
        ob.keyframe_insert(path, frame=1, index=index)
    fc = None
    for c in ob.animation_data.action.fcurves:
        if c.data_path == path and c.array_index == index:
            fc = c
    if fc is None:
        ob.keyframe_insert(path, frame=1, index=index)
        fc = [c for c in ob.animation_data.action.fcurves if c.data_path == path and c.array_index == index][0]
    m = fc.modifiers.new("FNGENERATOR")
    m.function_type = "SIN"
    m.amplitude = amp
    m.phase_multiplier = 2 * math.pi / (period * FPS)
    m.phase_offset = phase
    m.use_additive = True
    return m


# ---------------------------------------------------------------- characters

class Stick:
    """Stick figure facing camera. Root at feet. Limbs pivot at joints, rotate about Y."""

    def __init__(self, name, loc, hat=None, scale=1.0):
        self.root = empty(name, loc)
        self.root.scale = (scale, scale, scale)
        r = self.root
        self.body = empty(name + "_body", (0, 0, 0), r)
        b = self.body
        if STYLE3D:
            ball(name + "_torso", 0.5, (0, 0, 2.12), (0.96, 0.96, 0.97) if hat != "cap" else (0.98, 0.98, 0.96), b, outline=0.03, scale=(0.62, 0.55, 1.3))
        else:
            line(name + "_torso", [(0, 1.5), (0, 2.75)], parent=b)
        self.head = empty(name + "_headpiv", (0, 0, 3.25), b)
        h = self.head
        if STYLE3D:
            ball(name + "_head", 0.5, (0, 0, 0), (0.99, 0.86, 0.72), h, outline=0.03)
            self.eyes = empty(name + "_eyes", (0, -0.44 / K3D, 0.06), h)
            ball(name + "_eyeL", 0.075, (-0.17, 0, 0), INK, self.eyes, outline=False)
            ball(name + "_eyeR", 0.075, (0.17, 0, 0), INK, self.eyes, outline=False)
            ball(name + "_nose", 0.07, (0, -0.5 / K3D, -0.07), (0.97, 0.7, 0.6), h, outline=False)
            self.smile = smooth_line(name + "_smile", [(-0.2, -0.15), (0, -0.27), (0.2, -0.15)], width=0.03, parent=h, loc=(0, -0.43 / K3D, 0))
            self.frown = smooth_line(name + "_frown", [(-0.18, -0.3), (0, -0.2), (0.18, -0.3)], width=0.03, parent=h, loc=(0, -0.41 / K3D, 0))
        else:
            disk(name + "_head", 0.5, (0, 0, 0), WHITE, h, outline=0.07)
            self.eyes = empty(name + "_eyes", (0, -0.1, 0.05), h)
            disk(name + "_eyeL", 0.07, (-0.17, 0, 0), INK, self.eyes, outline=False)
            disk(name + "_eyeR", 0.07, (0.17, 0, 0), INK, self.eyes, outline=False)
            self.smile = smooth_line(name + "_smile", [(-0.2, -0.15), (0, -0.27), (0.2, -0.15)], width=0.035, parent=h, loc=(0, -0.12, 0))
            self.frown = smooth_line(name + "_frown", [(-0.18, -0.3), (0, -0.2), (0.18, -0.3)], width=0.035, parent=h, loc=(0, -0.12, 0))
        kf(self.smile, "scale", 1, (1, 1, 1), "CONSTANT")
        kf(self.frown, "scale", 1, (0, 0, 0), "CONSTANT")
        self.hat = None
        if STYLE3D and hat == "cap":
            self.hat = empty(name + "_hat", (0, 0, 0), h)
            dome(name + "_capdome", 0.535, (0, 0, 0.2), RED, self.hat, zscale=0.8)
            ball(name + "_capbrim", 0.4, (0.0, -0.45 / K3D, 0.22), RED, self.hat, outline=0.02, scale=(1.0, 1.5, 0.1))
            ball(name + "_capbtn", 0.08, (0, 0, 0.63), RED, self.hat, outline=False)
        elif STYLE3D and hat == "beanie":
            self.hat = empty(name + "_hat", (0, 0, 0), h)
            dome(name + "_beanie", 0.54, (0, 0, 0.2), BLUE, self.hat, zscale=0.9)
            ball(name + "_brim", 0.555, (0, 0, 0.22), (0.12, 0.33, 0.7), self.hat, outline=0.02, scale=(1, 1, 0.2))
            ball(name + "_pom", 0.16, (0, 0, 0.72), (0.95, 0.95, 0.98), self.hat, outline=0.02)
        elif hat == "cap":
            self.hat = empty(name + "_hat", (0, -0.05, 0), h)
            poly(name + "_capdome", [(-0.52, 0.12)] + [(0.52 * math.cos(a), 0.12 + 0.5 * math.sin(a)) for a in [i * math.pi / 12 for i in range(13)]][::-1][:-1] + [(0.52, 0.12)], RED, self.hat, outline=0.05)
            box(name + "_capbrim", (0.75, 0.1, 0.12), (0.55, 0, 0.15), RED, self.hat, bevel=0.04)
        elif hat == "beanie":
            self.hat = empty(name + "_hat", (0, -0.05, 0), h)
            poly(name + "_beanie", [(-0.53, 0.1)] + [(0.53 * math.cos(a), 0.1 + 0.48 * math.sin(a)) for a in [i * math.pi / 12 for i in range(1, 12)]][::-1] + [(0.53, 0.1)], BLUE, self.hat, outline=0.05)
            disk(name + "_pom", 0.13, (0, 0, 0.62), BLUE, self.hat)
        # limbs
        def limb(nm, pivot, length, angle):
            p = empty(name + nm, pivot, b)
            line(name + nm + "_s", [(0, 0), (0, -length)], parent=p, width=0.085 if STYLE3D else 0.06)
            if STYLE3D:
                if "arm" in nm:
                    ball(name + nm + "_end", 0.14, (0, 0, -length), (0.99, 0.86, 0.72), p, outline=0.02)
                if "leg" in nm:
                    ball(name + nm + "_shoe", 0.2, (0.08 if nm.endswith("R") else -0.08, -0.05, -length + 0.06), (0.25, 0.25, 0.3), p, outline=0.02, scale=(1.3, 1.5, 0.6))
            p.rotation_euler[1] = math.radians(angle)
            return p
        self.armL = limb("_armL", (0, 0, 2.6), 1.15, -25)
        self.armR = limb("_armR", (0, 0, 2.6), 1.15, 25)
        self.legL = limb("_legL", (0, 0, 1.5), 1.5, -14)
        self.legR = limb("_legR", (0, 0, 1.5), 1.5, 14)
        # breathing / idle bob (always on, subtle)
        wiggle(self.body, "location", 2, 0.04, 2.2, phase=loc[0])
        wiggle(self.head, "rotation_euler", 1, 0.05, 3.1, phase=loc[0] * 2)

    def mood(self, t, happy=True):
        for ob, on in ((self.smile, happy), (self.frown, not happy)):
            cur = val(ob, "scale", F(t))
            kf(ob, "scale", F(t), cur, "SINE")
            kf(ob, "scale", F(t + 0.2), (1, 1, 1) if on else (0, 0, 0), "SINE")

    def walk(self, t0, t1, a, b, step=0.5):
        move(self.root, t0, t1, a, b, "SINE", "EASE_IN_OUT")
        n = max(2, int((t1 - t0) / step))
        for i in range(n + 1):
            t = t0 + (t1 - t0) * i / n
            s = 1 if i % 2 else -1
            if i in (0, n):
                s = 0
            kf(self.legL, "rotation_euler", F(t), (0, math.radians(-14 + 22 * s), 0))
            kf(self.legR, "rotation_euler", F(t), (0, math.radians(14 - 22 * s), 0))
            kf(self.armL, "rotation_euler", F(t), (0, math.radians(-25 - 20 * s), 0))
            kf(self.armR, "rotation_euler", F(t), (0, math.radians(25 + 20 * s), 0))

    def arm(self, side, t0, t1, a, b):
        ob = self.armL if side == "L" else self.armR
        rot(ob, t0, t1, (0, math.radians(a), 0), (0, math.radians(b), 0))

    def wave(self, side, t, n=3):
        ob = self.armL if side == "L" else self.armR
        base = -25 if side == "L" else 25
        up = -150 if side == "L" else 150
        kf(ob, "rotation_euler", F(t), (0, math.radians(base), 0))
        for i in range(n):
            kf(ob, "rotation_euler", F(t + 0.25 + i * 0.3), (0, math.radians(up + (15 if i % 2 else -15)), 0))
        kf(ob, "rotation_euler", F(t + 0.4 + n * 0.3), (0, math.radians(base), 0))

    def jump(self, t, h=0.6):
        x, y, z = val(self.root, "location", F(t))
        kf(self.root, "location", F(t), (x, y, z), "QUAD", "EASE_OUT")
        kf(self.root, "location", F(t + 0.22), (x, y, z + h), "QUAD", "EASE_IN")
        kf(self.root, "location", F(t + 0.44), (x, y, z), "BOUNCE", "EASE_OUT")


# ---------------------------------------------------------------- props

def wheel(name, loc, r, parent):
    w = empty(name, loc, parent)
    if STYLE3D:
        disk(name + "_t", r, (0, 0, 0), (0.12, 0.12, 0.14), w, outline=False, depth=0.22)
        disk(name + "_h", r * 0.5, (0, -0.09, 0), LGREY, w, outline=False, depth=0.06)
        line(name + "_sp", [(-r * 0.4, 0), (r * 0.4, 0)], GREY, 0.03, w, loc=(0, -0.13, 0))
        return w
    disk(name + "_t", r, (0, 0, 0), INK, w, outline=False)
    disk(name + "_h", r * 0.45, (0, -0.06, 0), LGREY, w, outline=False)
    line(name + "_sp", [(-r * 0.4, 0), (r * 0.4, 0)], GREY, 0.03, w, loc=(0, -0.12, 0))
    return w


def truck(name, loc, color=RED, s=1.0):
    r = empty(name, loc)
    r.scale = (s, s, s)
    box(name + "_bed", (3.2, 0.6, 1.0), (-1.2, 0, 1.1), color, r)
    box(name + "_cab", (2.0, 0.6, 1.9), (1.3, 0, 1.55), color, r)
    box(name + "_hood", (1.2, 0.6, 1.0), (2.75, 0, 1.1), color, r)
    box(name + "_win", (1.3, 0.1, 0.8), (1.45, -0.35, 1.95), SKY, r, outline=0.03, bevel=0.05)
    box(name + "_light", (0.25, 0.1, 0.25), (3.3, -0.35, 1.3), YELLOW, r, outline=0.03, bevel=0.04)
    PARTS[name] = {"wheels": [wheel(name + "_w1", (-1.6, -0.4, 0.55), 0.6, r), wheel(name + "_w2", (2.3, -0.4, 0.55), 0.6, r)]}
    if STYLE3D:
        PARTS[name]["wheels"] += [wheel(name + "_w3", (-1.6, 0.4, 0.55), 0.6, r), wheel(name + "_w4", (2.3, 0.4, 0.55), 0.6, r)]
    return r


def hatch(name, loc, color=GREY, s=1.0):
    r = empty(name, loc)
    r.scale = (s, s, s)
    box(name + "_body", (3.6, 0.6, 1.0), (0, 0, 0.95), color, r)
    poly(name + "_top", [(-1.7, 1.4), (-1.5, 2.2), (0.9, 2.2), (1.5, 1.4)], color, r, outline=0.05)
    poly(name + "_w", [(-1.35, 1.5), (-1.2, 2.05), (0.75, 2.05), (1.2, 1.5)], SKY, r, outline=0.03, y=-0.12)
    line(name + "_dent", [(-1.2, 0.8), (-1.0, 1.0), (-0.85, 0.75)], INK, 0.03, r, loc=(0, -0.4, 0))
    PARTS[name] = {"wheels": [wheel(name + "_w1", (-1.1, -0.4, 0.5), 0.5, r), wheel(name + "_w2", (1.1, -0.4, 0.5), 0.5, r)]}
    if STYLE3D:
        PARTS[name]["wheels"] += [wheel(name + "_w3", (-1.1, 0.4, 0.5), 0.5, r), wheel(name + "_w4", (1.1, 0.4, 0.5), 0.5, r)]
    return r


def jar(name, loc, s=1.0, label="INVESTED"):
    r = empty(name, loc)
    r.scale = (s, s, s)
    fill_piv = empty(name + "_fillpiv", (0, -0.02, 0.15), r)
    box(name + "_fill", (2.0, 0.3, 2.6), (0, 0, 1.3), GREEN, fill_piv, outline=False, bevel=0.15)
    fill_piv.scale = (1, 1, 0.0)
    box(name + "_glass", (2.4, 0.2, 3.0), (0, 0.2, 1.55), (0.85, 0.94, 0.98), r, outline=0.06, bevel=0.3)
    box(name + "_lid", (2.6, 0.4, 0.4), (0, 0, 3.2), GOLD, r, bevel=0.1)
    text(name + "_lbl", label, (0, -0.4, 3.85), 0.4, INK, r)
    PARTS[name] = {"fill": fill_piv}
    return r


def coin(name, loc, parent=None, r=0.35):
    c = empty(name, loc, parent)
    disk(name + "_c", r, (0, 0, 0), GOLD, c, outline=0.04)
    text(name + "_s", "$", (0, -0.1, 0), r * 1.2, (0.6, 0.42, 0.02), c)
    return c


def bill(name, loc, parent=None, s=1.0):
    b = empty(name, loc, parent)
    b.scale = (s, s, s)
    box(name + "_b", (1.6, 0.05, 0.8), (0, 0, 0), (0.55, 0.85, 0.55), b, outline=0.04, bevel=0.05)
    disk(name + "_o", 0.26, (0, -0.06, 0), (0.35, 0.7, 0.4), b, outline=0.03)
    text(name + "_s", "$", (0, -0.15, 0), 0.35, DGREEN, b)
    return b


def monster(name, loc, s=1.0, label="$750"):
    r = empty(name, loc)
    r.scale = (s, s, s)
    body = empty(name + "_bodypiv", (0, 0, 0), r)
    ball(name + "_blob", 1.0, (0, 0, 1.0), (0.45, 0.78, 0.25), body, outline=0.06, scale=(1.15, 1.0 if STYLE3D else 0.5, 1.0))
    FY = 0.5 if STYLE3D else 1.0  # face features sit on the round surface in 3D
    disk(name + "_eyeL", 0.28, (-0.38, -0.6 * FY, 1.45), WHITE, body, outline=0.04)
    disk(name + "_eyeR", 0.28, (0.38, -0.6 * FY, 1.45), WHITE, body, outline=0.04)
    disk(name + "_pL", 0.12, (-0.33, -0.7 * FY, 1.4), INK, body, outline=False)
    disk(name + "_pR", 0.12, (0.43, -0.7 * FY, 1.4), INK, body, outline=False)
    line(name + "_browL", [(-0.62, 1.82), (-0.18, 1.7)], INK, 0.05, body, loc=(0, -0.6 * FY, 0))
    line(name + "_browR", [(0.18, 1.7), (0.62, 1.82)], INK, 0.05, body, loc=(0, -0.6 * FY, 0))
    mouth = empty(name + "_mouthpiv", (0, -0.62 * FY, 0.85), body)
    poly(name + "_mouth", [(-0.45, 0.08), (0.45, 0.08), (0.3, -0.18), (-0.3, -0.18)], (0.45, 0.08, 0.1), mouth, outline=0.03)
    poly(name + "_t1", [(-0.25, 0.08), (-0.12, 0.08), (-0.185, -0.05)], WHITE, mouth, outline=False, y=-0.06)
    poly(name + "_t2", [(0.12, 0.08), (0.25, 0.08), (0.185, -0.05)], WHITE, mouth, outline=False, y=-0.06)
    text(name + "_lbl", label, (0, -0.65 * FY, 0.35), 0.38 if len(label) <= 7 else 0.24, INK, body)
    wiggle(body, "scale", 2, 0.05, 0.9)
    wiggle(body, "scale", 0, 0.035, 0.9, phase=math.pi)
    wiggle(mouth, "scale", 2, 0.35, 0.45)
    PARTS[name] = {"body": body, "label": name + "_lbl"}
    return r


def heart(name, loc, parent=None, s=0.5, color=(0.95, 0.3, 0.4)):
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * s / 16, z * s / 16))
    return poly(name, pts[::-1], color, parent, outline=0.03, loc=loc)


def arrow(name, a, b, color=INK, width=0.07, parent=None):
    ax, az = a
    bx, bz = b
    ang = math.atan2(bz - az, bx - ax)
    h = 0.35
    l1 = (bx - h * math.cos(ang - 0.5), bz - h * math.sin(ang - 0.5))
    l2 = (bx - h * math.cos(ang + 0.5), bz - h * math.sin(ang + 0.5))
    r = empty(name, (0, 0, 0), parent)
    line(name + "_s", [a, b], color, width, r)
    line(name + "_h", [l1, b, l2], color, width, r)
    return r


def underline_draw(ob, t, dur=0.5):
    """Animate a curve drawing itself via bevel_factor_end."""
    cu = ob.data
    cu.bevel_factor_end = 0
    cu.keyframe_insert("bevel_factor_end", frame=F(t))
    cu.bevel_factor_end = 1
    cu.keyframe_insert("bevel_factor_end", frame=F(t + dur))


# ---------------------------------------------------------------- counters

COUNTERS = []  # (text_obj, [(t0,t1,v0,v1)], fmt)


def counter(ob, segments, fmt="${:,.0f}"):
    COUNTERS.append((ob.name, segments, fmt))


def install_counter_handler(script_text):
    """Register a frame handler stored in the .blend as a text block that auto-runs."""
    t = bpy.data.texts.new("counters.py")
    t.write(script_text)
    t.use_module = True
