"""SETS module: camp / insert / night / tent worlds + props. Blender 5.2, units = metres, Z up.
Characters face -Y by default (front = -Y). Anchor empties carry rotation_euler.z that already faces the partner.
Each cam_hint_* anchor has custom prop 'target' = world-space look-at point (3 floats).
"""
import math, os, random
try:
    import bpy, bmesh
    from mathutils import Vector
except ImportError:  # texture generation runs under system python (Blender has no PIL/numpy)
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.normpath(os.path.join(HERE, '..', 'tex'))
ORIGIN = {'camp': (0, 0, 0), 'insert': (300, 0, 0), 'night': (600, 0, 0), 'tent': (900, 0, 0), 'dusk': (1200, 0, 0)}
STASH = (-300, 0, 0)

# ---------------------------------------------------------------- textures (painted, tileable)
def _gen_textures():
    import numpy as np
    from PIL import Image, ImageFilter
    os.makedirs(TEX, exist_ok=True)
    rng = np.random.default_rng(7)
    S = 512

    def tn(gh, gw, size=S):  # tileable value noise 0..1
        g = rng.random((gh, gw)).astype('float32')
        t = np.tile(g, (3, 3))
        im = Image.fromarray((t * 255).astype('uint8')).resize((3 * size, 3 * size), Image.BICUBIC)
        return np.asarray(im)[size:2 * size, size:2 * size].astype('float32') / 255

    def save(name, a):
        Image.fromarray(np.clip(a, 0, 255).astype('uint8')).save(os.path.join(TEX, name))

    def col(c): return np.array(c, 'float32')

    def wood(name, rows, pal, gap=0.35):
        a = np.zeros((S, S, 3), 'float32'); ph = S // rows
        yy = np.arange(S)[:, None]
        for r in range(rows):
            base = col(pal[r % len(pal)]) * (0.9 + 0.2 * rng.random())
            y0 = r * ph
            g = tn(S // 2, 6) * 0.6 + tn(40, 3) * 0.4          # streaks along x
            ring = 0.5 + 0.5 * np.sin((np.arange(S)[:, None] * 0.35) + g * 14)
            tone = 0.72 + 0.35 * g + 0.12 * ring
            blk = np.zeros((S, S, 3), 'float32') + base * tone[..., None]
            m = (yy >= y0) & (yy < y0 + ph)
            a = np.where(m[..., None], blk, a)
            # butt joint
            jx = int(rng.integers(60, S - 60))
            a[y0:y0 + ph, jx:jx + 4] *= gap
            # dark gap + painted highlight under it
            a[y0:y0 + 6] *= gap
            a[y0 + 6:y0 + 11] = a[y0 + 6:y0 + 11] * 0.8 + 255 * 0.2 * (base / base.max())
        a *= (0.9 + 0.2 * tn(8, 8))[..., None]
        im = Image.fromarray(np.clip(a, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
        im.save(os.path.join(TEX, name))

    wood('wood_deck.png', 6, [(206, 132, 62), (190, 112, 50), (222, 150, 76), (176, 100, 46)])
    wood('wood_dark.png', 4, [(120, 66, 34), (104, 56, 30), (136, 78, 40)], gap=0.25)
    wood('wood_crate.png', 3, [(214, 150, 80), (196, 132, 66), (226, 164, 90)], gap=0.3)

    # canvas: cream weave, stitched seams, blotches
    n = tn(10, 10); w = np.zeros((S, S), 'float32')
    w += 0.06 * np.sin(np.arange(S) * math.pi / 2)[None, :] + 0.06 * np.sin(np.arange(S) * math.pi / 2)[:, None]
    for tint, nm in (((236, 222, 184), 'canvas.png'), ((176, 142, 92), 'burlap.png'), ((120, 150, 80), 'canvas_green.png')):
        a = col(tint)[None, None, :] * (0.82 + 0.3 * n + w)[..., None]
        for x in range(0, S, 128): a[:, x:x + 3] *= 0.6; a[:, x + 4:x + 6] *= 1.08
        save(nm, a)

    # stone: voronoi cobbles w/ dark mortar
    pts = rng.random((45, 2)) * S; yy, xx = np.mgrid[0:S, 0:S]
    d = np.full((S, S), 1e9, 'float32'); d2 = d.copy(); idx = np.zeros((S, S), int)
    for i, (px, py) in enumerate(pts):
        best = np.full((S, S), 1e9, 'float32')
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                best = np.minimum(best, (xx - px - ox) ** 2 + (yy - py - oy) ** 2)
        upd = best < d; d2 = np.where(upd, d, np.minimum(d2, best)); idx = np.where(upd, i, idx); d = np.where(upd, best, d)
    edge = np.sqrt(d2) - np.sqrt(d)
    tones = np.array([[150, 148, 160], [170, 158, 150], [138, 142, 158], [180, 170, 156]], 'float32')[rng.integers(0, 4, 45)][idx]
    a = tones * (0.8 + 0.4 * tn(12, 12))[..., None]
    a = np.where((edge < 7)[..., None], a * 0.35, a)
    a = np.where(((edge >= 7) & (edge < 12))[..., None], a * 1.12, a)
    save('stone.png', a)

    # grass: green + painted blade dashes
    a = col((92, 156, 52))[None, None, :] * (0.72 + 0.5 * tn(14, 14))[..., None]
    a += (tn(60, 60)[..., None] - 0.5) * 40
    for _ in range(1800):
        x, y = int(rng.integers(0, S - 12)), int(rng.integers(0, S - 12)); L = int(rng.integers(5, 12))
        a[y:y + L, x:x + 2] = col((150, 200, 72)) if rng.random() < 0.5 else col((54, 112, 40))
    save('grass.png', a)

    # dirt trodden
    a = col((176, 128, 80))[None, None, :] * (0.7 + 0.5 * tn(16, 16))[..., None]
    for _ in range(500):
        x, y = int(rng.integers(0, S - 8)), int(rng.integers(0, S - 8)); a[y:y + 4, x:x + 7] *= 0.75
    save('dirt.png', a)

    # bark: vertical streaks, cracks
    g = tn(6, 40)
    a = col((120, 82, 52))[None, None, :] * (0.45 + 0.8 * g)[..., None]
    a *= (0.8 + 0.4 * tn(30, 4))[..., None]
    a = np.where((g < 0.3)[..., None], a * 0.5, a)
    save('bark.png', a)

    # water: deep blue with painted white ripples
    a = col((40, 130, 215))[None, None, :] * (0.75 + 0.5 * tn(10, 10))[..., None]
    for _ in range(140):
        x, y = int(rng.integers(0, S - 60)), int(rng.integers(0, S - 4)); L = int(rng.integers(20, 60))
        a[y:y + 3, x:x + L] = col((190, 230, 250))
    save('water.png', a)

    # label card text (readable)
    from PIL import ImageDraw, ImageFont
    W, H = 1024, 640
    im = Image.new('RGB', (W, H), (238, 222, 186)); dr = ImageDraw.Draw(im)
    dr.rectangle([14, 14, W - 15, H - 15], outline=(120, 40, 24), width=10)
    dr.rectangle([34, 34, W - 35, H - 35], outline=(120, 40, 24), width=3)
    f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 100)
    for i, ln in enumerate(['Cut round the', 'top with a chisel', 'and hammer']):
        w = dr.textlength(ln, font=f)
        dr.text(((W - w) / 2, 90 + i * 150), ln, font=f, fill=(48, 24, 16))
    im.save(os.path.join(TEX, 'label_card.png'))
    # can tin label band
    im = Image.new('RGB', (512, 256), (200, 40, 36)); dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 511, 255], outline=(255, 214, 90), width=14)
    f = ImageFont.truetype('C:/Windows/Fonts/impact.ttf', 90)
    for i, t in enumerate(['SALTED', 'BEEF']):
        w = dr.textlength(t, font=f); dr.text(((512 - w) / 2, 22 + i * 108), t, font=f, fill=(255, 226, 120))
    im.save(os.path.join(TEX, 'can_label.png'))


def _gen_world():
    """WORLD pass: calm painted 2048 grass (soft patches, few crisp strokes), scratched wood, gingham cloth."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    rng = np.random.default_rng(21); S = 2048

    def tn(g, size=S):
        a = rng.random((g, g)).astype('float32'); t = np.tile(a, (3, 3))
        im = Image.fromarray((t * 255).astype('uint8')).resize((3 * size, 3 * size), Image.BICUBIC)
        return np.asarray(im)[size:2 * size, size:2 * size].astype('float32') / 255
    base = np.array((86, 116, 52), 'float32'); warm = np.array((106, 126, 52), 'float32'); cool = np.array((70, 104, 58), 'float32')
    h = tn(4); a = base + (warm - base) * np.clip(h * 2 - 1, 0, 1)[..., None] + (cool - base) * np.clip(1 - h * 2, 0, 1)[..., None]
    a *= (0.95 + 0.10 * tn(5))[..., None]
    im = Image.fromarray(np.clip(a, 0, 255).astype('uint8')); dr = ImageDraw.Draw(im)
    pal = [((62, 92, 42), 0.35), ((74, 104, 46), 0.25), ((100, 128, 56), 0.20), ((44, 70, 36), 0.20)]
    cols = [q[0] for q in pal]; pr = np.array([q[1] for q in pal]); pr /= pr.sum()
    for _ in range(2600):
        x, y = int(rng.integers(0, S)), int(rng.integers(0, S)); L = int(rng.integers(24, 60)); lean = rng.uniform(-0.4, 0.4)
        c = cols[int(rng.choice(len(cols), p=pr))]; w = int(rng.integers(4, 8))
        pts = [(x + lean * t * L, y - t * L) for t in (0, 0.5, 1.0)]
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                if -80 < x + ox < S + 80 and -80 < y + oy < S + 80:
                    q = [(px + ox, py + oy) for px, py in pts]
                    dr.line(q, fill=c, width=w)
    for _ in range(9000):   # fine painted blade detail (thin crisp strokes, no blur / speckle)
        x, y = int(rng.integers(0, S)), int(rng.integers(0, S)); L = int(rng.integers(14, 34)); lean = rng.uniform(-0.35, 0.35)
        c = cols[int(rng.choice(len(cols), p=pr))]; c = tuple(int(max(0, min(255, v + rng.integers(-14, 15)))) for v in c)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                if -40 < x + ox < S + 40 and -40 < y + oy < S + 40: dr.line([(x + ox, y + oy), (x + ox + lean * L, y + oy - L)], fill=c, width=2)
    lp = os.path.join(TEX, 'leaf_grass.png')
    if not os.path.exists(lp): import shutil; shutil.copy(os.path.join(TEX, 'grass.png'), lp)  # old painted grass stays on tree foliage
    a_d = np.asarray(im).astype('int16') + rng.integers(-2, 3, (S, S, 1)); im = Image.fromarray(np.clip(a_d, 0, 255).astype('uint8'))   # +-2 dither: no banding in the dark night ground
    im.save(os.path.join(TEX, 'grass.png'))
    for nm in ('wood_dark.png', 'wood_deck.png', 'wood_crate.png'):
        p = os.path.join(TEX, nm); w_ = Image.open(p).convert('RGB').resize((2048, 2048), Image.BICUBIC)
        a_ = np.asarray(w_).astype('float32')
        if nm == 'wood_dark.png': a_ = np.clip(a_ * (0.9, 0.95, 1.12), 0, 255)
        w_ = Image.fromarray(a_.astype('uint8')); d2 = ImageDraw.Draw(w_, 'RGBA'); r2 = np.random.default_rng(5)
        rows_ = {'wood_deck.png': 6, 'wood_dark.png': 4, 'wood_crate.png': 3}[nm]
        for r_ in range(rows_):   # painted plank seams: dark gap + warm edge highlight under it
            y_ = r_ * 2048 // rows_
            d2.rectangle([0, y_, 2048, y_ + 7], fill=(26, 12, 5, 235)); d2.rectangle([0, y_ + 8, 2048, y_ + 12], fill=(255, 222, 170, 130))
        for _ in range(800):   # fine grain streaks along the planks (1 px, low alpha)
            x, y = int(r2.integers(0, 2048)), int(r2.integers(0, 2048)); L = int(r2.integers(80, 420)); ang = r2.normal(0, 0.02)
            lite = r2.random() < 0.45
            d2.line([(x, y), (x + L * math.cos(ang), y + L * math.sin(ang))], fill=(255, 226, 180, 55) if lite else (30, 14, 6, 70), width=1 + int(r2.random() < 0.25))
        for _ in range(240):    # scratches + knife nicks
            x, y = int(r2.integers(0, 2048)), int(r2.integers(0, 2048)); L = int(r2.integers(60, 280)); ang = r2.normal(0, 0.12)
            d2.line([(x, y), (x + L * math.cos(ang), y + L * math.sin(ang))], fill=(255, 226, 180, 120) if r2.random() < 0.5 else (30, 14, 6, 150), width=int(r2.integers(2, 4)))
        for _ in range(14):
            x, y = int(r2.integers(0, 2048)), int(r2.integers(0, 2048)); r_ = int(r2.integers(28, 68))
            d2.ellipse([x - r_, y - r_, x + r_, y + r_], outline=(24, 10, 4, 110), width=4)
        w_.save(p)
    # clean interior canvas: neutral cream-grey, soft broad folds, thin darker seams every 256 px, almost no blotch
    CS = 1024; xx = np.arange(CS)[None, :]; yy = np.arange(CS)[:, None]
    fold = 0.05 * np.sin(xx * 2 * math.pi / 256 + 0.8 * np.sin(yy * 2 * math.pi / 1024)) + 0.025 * np.sin(xx * 2 * math.pi / 128 + 1.3)
    base_ = np.zeros((CS, CS, 3), 'float32') + (212, 208, 198)
    img_ = base_ * (1 + fold)[..., None]
    img_[:, ::256] *= 0.82; img_[:, 1::256] *= 0.9; img_[:, 5::256] *= 1.04
    for sx_ in range(0, CS, 256):      # stitched seam: short dashes beside each seam
        for y_ in range(0, CS, 20): img_[y_:y_ + 11, sx_ + 8:sx_ + 10] *= 0.6
    Image.fromarray(np.clip(img_, 0, 255).astype('uint8')).save(os.path.join(TEX, 'canvas_i.png'))
    W3, H3 = 1024, 328   # stencil panel for the crate front: wood-toned plank with a stencilled mark
    im3 = Image.new('RGB', (W3, H3), (206, 142, 78)); d3 = ImageDraw.Draw(im3); r3 = np.random.default_rng(11)
    for _ in range(90):
        y_ = int(r3.integers(0, H3)); x_ = int(r3.integers(0, W3)); d3.line([(x_, y_), (x_ + int(r3.integers(80, 400)), y_)], fill=(150, 98, 52), width=1)
    d3.rectangle([6, 6, W3 - 7, H3 - 7], outline=(120, 78, 42), width=6)
    f3 = ImageFont.truetype('C:/Windows/Fonts/impact.ttf', 190); tx = 'U.S. RATIONS'; w3 = d3.textlength(tx, font=f3)
    d3.text(((W3 - w3) / 2 + 3, 62 + 3), tx, font=f3, fill=(120, 74, 38)); d3.text(((W3 - w3) / 2, 62), tx, font=f3, fill=(38, 26, 20))
    im3.save(os.path.join(TEX, 'crate_stencil.png'))
    ii = np.arange(512); ra = (ii[:, None] // 64) % 2 == 0; ca = (ii[None, :] // 64) % 2 == 0
    t = np.zeros((512, 512, 3), 'float32') + (238, 226, 200)
    t[ra | ca] = (214, 128, 112); t[ra & ca] = (160, 66, 58)
    Image.fromarray(t.astype('uint8')).save(os.path.join(TEX, 'cloth.png'))


def ensure_textures():
    if not os.path.exists(os.path.join(TEX, 'canvas_i.png')):
        import subprocess, sys
        subprocess.check_call(['python', os.path.abspath(__file__)])  # system python has PIL


if __name__ == '__main__':
    _gen_textures(); _gen_world(); _gen_world()


# ---------------------------------------------------------------- look: use look.py else local stub
try:
    from . import look as _look  # package import
except Exception:
    try:
        import look as _look
    except Exception:
        _look = None


def _stub_toon_mat(name, rgb, tex=None, ink=True):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    diff = N('ShaderNodeBsdfDiffuse'); s2r = N('ShaderNodeShaderToRGB'); ramp = N('ShaderNodeValToRGB')
    sep = N('ShaderNodeSeparateColor'); mix = N('ShaderNodeMix'); out = N('ShaderNodeOutputMaterial')
    mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0
    L(diff.outputs[0], s2r.inputs[0]); L(s2r.outputs[0], sep.inputs[0])
    L(sep.outputs[0], ramp.inputs[0])  # red channel of lit = brightness
    e = ramp.color_ramp.elements; e[0].position = 0.12; e[0].color = (0.62, 0.52, 0.86, 1)
    e[1].position = 0.55; e[1].color = (1.0, 0.97, 0.9, 1)
    mid = e.new(0.3); mid.color = (0.9, 0.84, 0.92, 1)
    base = N('ShaderNodeRGB'); base.outputs[0].default_value = (*rgb[:3], 1)
    if tex:
        im = N('ShaderNodeTexImage'); im.image = bpy.data.images.load(tex, check_existing=True)
        tc = N('ShaderNodeTexCoord'); L(tc.outputs['UV'], im.inputs[0])
        mt = N('ShaderNodeMix'); mt.data_type = 'RGBA'; mt.blend_type = 'MULTIPLY'; mt.inputs[0].default_value = 1
        L(base.outputs[0], mt.inputs[6]); L(im.outputs[0], mt.inputs[7]); bc = mt.outputs[2]
    else:
        bc = base.outputs[0]
    L(bc, mix.inputs[6]); L(ramp.outputs[0], mix.inputs[7]); L(mix.outputs[2], out.inputs[0])
    return m


def _stub_ink_hull(obj, width=0.02):
    bm = bpy.data.materials.get('ink_black')
    if not bm:
        bm = bpy.data.materials.new('ink_black'); bm.use_nodes = True
        bm.node_tree.nodes.clear(); em = bm.node_tree.nodes.new('ShaderNodeEmission'); o = bm.node_tree.nodes.new('ShaderNodeOutputMaterial')
        em.inputs[0].default_value = (0.02, 0.01, 0.02, 1); bm.node_tree.links.new(em.outputs[0], o.inputs[0])
        bm.use_backface_culling = True
    obj.data.materials.append(bm)
    md = obj.modifiers.new('ink', 'SOLIDIFY'); md.thickness = width; md.offset = 1; md.use_flip_normals = True
    md.material_offset = len(obj.data.materials) - 1
    return obj


def toon_mat(name, rgb, tex=None, ink=True):
    return (_look.toon_mat if _look and hasattr(_look, 'toon_mat') else _stub_toon_mat)(name, rgb, tex, ink)


def ink_hull(obj, width=0.02):
    return (_look.ink_hull if _look and hasattr(_look, 'ink_hull') else _stub_ink_hull)(obj, width)


def glow(name, rgb, strength=6.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); em = nt.nodes.new('ShaderNodeEmission'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    em.inputs[0].default_value = (*rgb[:3], 1); em.inputs[1].default_value = strength; nt.links.new(em.outputs[0], o.inputs[0])
    return m


def _grass_tune(m):
    """calmer ground: damp the blotchy brush-noise, add a large hue-patch map (yellow-green <-> blue-green) before the toon ramp."""
    nt = m.node_tree; L = nt.links.new
    for n in nt.nodes:
        if n.bl_idname == 'ShaderNodeMapRange' and abs(n.inputs['To Min'].default_value - 0.84) < 1e-4: n.inputs['To Min'].default_value = 0.97; n.inputs['To Max'].default_value = 1.03
    mt = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeMix' and n.blend_type == 'MULTIPLY' and n.inputs[7].links and n.inputs[7].links[0].from_node.bl_idname == 'ShaderNodeTexImage'), None)
    if not mt: return
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.3; nz.inputs['Detail'].default_value = 2.0
    cr = nt.nodes.new('ShaderNodeValToRGB'); e = cr.color_ramp.elements
    e[0].position = 0.35; e[0].color = (0.93, 0.98, 0.97, 1); e[1].position = 0.65; e[1].color = (1.05, 1.02, 0.9, 1)
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
    outs = [l.to_socket for l in mt.outputs[2].links]
    L(tc.outputs['Object'], nz.inputs['Vector']); L(nz.outputs['Fac'], cr.inputs[0]); L(mt.outputs[2], mx.inputs[6]); L(cr.outputs[0], mx.inputs[7])
    for so in outs: L(mx.outputs[2], so)


_M = {}
_NIGHT = False
_DUSK = False   # while building the dusk set: warm olive-gold grass
_INT = False   # True while building the tent/insert sets: day-palette retint (cream-grey canvas, brown wood, muted jars)
_INT_MAP = {'canvas': 'canvas_i', 'canvas_w': 'canvas_i', 'canvas_g': 'canvas_i', 'canvas_d': 'canvas_di', 'deck': 'deck_i', 'wooddark': 'wooddark_i', 'crate': 'crate_i', 'brass': 'brass_i', 'red': 'red_i', 'blue': 'blue_i'}
def M(key):
    """named material palette"""
    if _NIGHT and key in ('grass', 'grass_d', 'grass_l'): key += '_n'
    if _DUSK and key in ('grass', 'grass_d', 'grass_l'): key += '_s'
    if _INT and key in _INT_MAP: key = _INT_MAP[key]
    if key in _M and _M[key].name in bpy.data.materials: return _M[key]
    t = lambda n: os.path.join(TEX, n)
    P = {
        'deck': ('deck', (1, 1, 1), t('wood_deck.png')), 'wooddark': ('wooddark', (1, 1, 1), t('wood_dark.png')),
        'crate': ('crate', (1, 1, 1), t('wood_crate.png')), 'canvas': ('canvas', (1, 1, 1), t('canvas.png')),
        'canvas_g': ('canvas_g', (1, 1, 1), t('canvas_green.png')), 'burlap': ('burlap', (1, 1, 1), t('burlap.png')),
        'stone': ('stone', (1, 1, 1), t('stone.png')), 'grass': ('grass', (1, 1, 1), t('grass.png')),
        'dirt': ('dirt', (1, 1, 1), t('dirt.png')), 'bark': ('bark', (1, 1, 1), t('bark.png')),
        'water': ('water', (1, 1, 1), t('water.png')), 'leaf': ('leaf', (0.55, 0.95, 0.4), t('leaf_grass.png')), 'canvas_i': ('canvas_i', (0.95, 0.93, 0.95), t('canvas_i.png')), 'canvas_di': ('canvas_di', (0.72, 0.7, 0.72), t('canvas_i.png')), 'cratestencil': ('cratestencil', (1, 1, 1), t('crate_stencil.png')), 'smoke': ('smoke', (0.8, 0.74, 0.84), None), 'cloud_d': ('cloud_d', (1.0, 0.84, 0.72), None), 'dirt_d': ('dirt_d', (0.62, 0.55, 0.5), t('dirt.png')),
        'deck_i': ('deck_i', (0.42, 0.62, 1.05), t('wood_deck.png')), 'wooddark_i': ('wooddark_i', (0.58, 0.76, 1.1), t('wood_dark.png')), 'crate_i': ('crate_i', (0.6, 0.78, 1.2), t('wood_crate.png')),
        'brass_i': ('brass_i', (0.52, 0.55, 0.3), None), 'red_i': ('red_i', (0.5, 0.24, 0.2), None), 'blue_i': ('blue_i', (0.22, 0.34, 0.52), None),
        'grass_s': ('grass_s', (1.12, 1.0, 0.62), t('grass.png')), 'grass_d_s': ('grass_d_s', (0.95, 0.88, 0.6), t('grass.png')), 'grass_l_s': ('grass_l_s', (1.2, 1.08, 0.66), t('grass.png')),
        'grass_n': ('grass_n', (0.2, 0.42, 0.5), t('grass.png')), 'grass_d_n': ('grass_d_n', (0.17, 0.36, 0.45), t('grass.png')), 'grass_l_n': ('grass_l_n', (0.23, 0.46, 0.53), t('grass.png')), 'cloth': ('cloth', (1, 1, 1), t('cloth.png')), 'flw_w': ('flw_w', (1.0, 0.97, 0.9), None), 'flw_y': ('flw_y', (1.0, 0.82, 0.15), None), 'flw_r': ('flw_r', (0.85, 0.35, 0.45), None), 'pen_y': ('pen_y', (0.9, 0.7, 0.2), None),
        'iron': ('iron', (0.34, 0.34, 0.42), None), 'opsteel': ('opsteel', (0.30, 0.38, 0.52), None), 'steel': ('steel', (0.78, 0.82, 0.9), None),
        'brass': ('brass', (0.95, 0.68, 0.2), None), 'rope': ('rope', (0.82, 0.62, 0.34), None),
        'red': ('red', (0.58, 0.2, 0.17), None), 'blue': ('blue', (0.2, 0.32, 0.58), None),
        'cream': ('cream', (0.95, 0.88, 0.7), None), 'black': ('black', (0.1, 0.08, 0.1), None),
        'copper': ('copper', (0.9, 0.42, 0.14), None), 'leather': ('leather', (0.42, 0.22, 0.1), None),
        'rockm': ('rockm', (1, 1, 1), t('stone.png')), 'tin': ('tin', (0.6, 0.62, 0.7), None),
        'canlabel': ('canlabel', (1, 1, 1), t('can_label.png')), 'cardtext': ('cardtext', (1, 1, 1), t('label_card.png')),
        'paper': ('paper', (0.93, 0.85, 0.66), None), 'fireglow': None,
        'grass_d': ('grass_d', (0.74, 0.86, 0.68), t('grass.png')), 'grass_l': ('grass_l', (1.05, 1.02, 0.82), t('grass.png')),
        'canvas_w': ('canvas_w', (1.0, 0.88, 0.66), t('canvas.png')), 'canvas_d': ('canvas_d', (0.72, 0.55, 0.42), t('canvas.png')),
        'hill1': ('hill1', (0.62, 0.78, 0.86), None), 'hill2': ('hill2', (0.42, 0.7, 0.6), None), 'hill3': ('hill3', (0.3, 0.6, 0.28), None),
        'tree_d': ('tree_d', (0.16, 0.42, 0.2), None), 'cloud': ('cloud', (1.0, 1.0, 1.0), None), 'cloud_n': ('cloud_n', (0.62, 0.52, 0.95), None),
        'bread': ('bread', (0.9, 0.58, 0.26), None), 'onion': ('onion', (0.85, 0.5, 0.62), None), 'reed': ('reed', (0.6, 0.7, 0.28), None),
        'hill1n': ('hill1n', (0.3, 0.3, 0.6), None), 'hill2n': ('hill2n', (0.2, 0.25, 0.45), None), 'hill3n': ('hill3n', (0.12, 0.2, 0.3), None),
    }
    GL = {'f_red': ((1, 0.18, 0.04), 3.0), 'f_orange': ((1, 0.55, 0.06), 4.0), 'f_yellow': ((1, 0.92, 0.35), 5.0),
          'ember': ((1, 0.5, 0.1), 8.0), 'ripple': ((0.9, 0.97, 1.0), 1.0), 'moon': ((1, 0.96, 0.78), 1.0), 'star': ((1, 1, 1), 4.0)}
    if key in GL: m = glow(key, *GL[key])
    elif key == 'fireglow': m = glow('fireglow', (1, 0.45, 0.05), 2.5)
    elif key == 'lampglow': m = glow('lampglow', (1, 0.75, 0.3), 6)
    else:
        n, c, tx = P[key]
        uvmat = key in ('canlabel', 'cardtext', 'cratestencil')  # these need real UVs; look.toon_mat box-projects in object space
        m = _stub_toon_mat(n, c, tx) if uvmat else toon_mat(n, c, tx)
        sc = {'canvas_i': 0.5, 'canvas_di': 0.5, 'grass_s': 0.125, 'grass_d_s': 0.125, 'grass_l_s': 0.125, 'dirt_d': 0.25, 'grass': 0.125, 'grass_d': 0.125, 'grass_l': 0.125, 'grass_n': 0.125, 'grass_d_n': 0.125, 'grass_l_n': 0.125, 'dirt': 0.25, 'water': 0.15, 'stone': 0.4, 'leaf': 0.6}.get(key)  # bigger painted tiles on large surfaces
        if sc and m.node_tree:
            for nd in m.node_tree.nodes:
                if nd.bl_idname == 'ShaderNodeMapping' and any(l.to_node.bl_idname == 'ShaderNodeTexImage' for o in nd.outputs for l in o.links):
                    nd.inputs['Scale'].default_value = (sc, sc, sc)
        if key.startswith('grass') and key != 'grass_l_x': _grass_tune(m)
        if key in ('canvas_i', 'canvas_di', 'deck_i', 'wooddark_i', 'crate_i') and m.node_tree:
            for nd in m.node_tree.nodes:
                if nd.bl_idname == 'ShaderNodeMapRange' and abs(nd.inputs['To Min'].default_value - 0.84) < 1e-4: nd.inputs['To Min'].default_value = 0.97; nd.inputs['To Max'].default_value = 1.02
    _M[key] = m; return m


# ---------------------------------------------------------------- geometry helpers (bmesh, baked box-UVs)
def _uv_box(bm, tile=1.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [i for i in range(3) if i != ax]
        for l in f.loops:
            p = l.vert.co; l[uv].uv = (p[a] / tile, p[b] / tile)


def _obj(name, bm, mat, coll, loc=(0, 0, 0), rot=(0, 0, 0), smooth=False, uv=True, tile=1.0):
    if uv: _uv_box(bm, tile)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if mat: o.data.materials.append(mat)
    for p in me.polygons: p.use_smooth = smooth
    return o


def box(coll, name, size, loc, mat, rot=(0, 0, 0), tile=1.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts); bm.normal_update()
    return _obj(name, bm, mat, coll, loc, rot, False, True, tile)


def lathe(coll, name, prof, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=24, smooth=True, scale=(1, 1, 1), cap=True, tile=1.0):
    """prof = [(r, z), ...] bottom to top"""
    bm = bmesh.new(); rings = []
    for r, z in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg) * scale[0], r * math.sin(2 * math.pi * i / seg) * scale[1], z * scale[2])) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    if cap:
        for ring, up in ((rings[0], False), (rings[-1], True)):
            if prof[0 if not up else -1][0] > 1e-6:
                f = bm.faces.new(ring if up else ring[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, mat, coll, loc, rot, smooth, True, tile)


def cyl(coll, name, r, h, loc, mat, rot=(0, 0, 0), seg=16, r2=None, smooth=False, tile=1.0):
    return lathe(coll, name, [(r, -h / 2), (r if r2 is None else r2, h / 2)], mat, loc, rot, seg, smooth, tile=tile)


def sph(coll, name, r, loc, mat, scale=(1, 1, 1), seg=16, noise=0.0, seed=0):
    prof = [(r * math.sin(math.pi * k / 10), -r * math.cos(math.pi * k / 10)) for k in range(0, 11)]
    prof[0] = (0.0, prof[0][1]); prof[-1] = (0.0, prof[-1][1])
    o = lathe(coll, name, prof, mat, loc, (0, 0, 0), seg, True, scale, cap=False)
    if noise:
        rnd = random.Random(seed)
        for v in o.data.vertices: v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * noise * r
    return o


def beam(coll, name, p0, p1, r, mat, seg=8):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    o = cyl(coll, name, r, d.length, (p0 + p1) / 2, mat, (0, 0, 0), seg)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); o.rotation_mode = 'XYZ'
    return o


def rope(coll, name, p0, p1, sag=0.25, r=0.015, mat=None, n=8):
    p0, p1 = Vector(p0), Vector(p1); pts = []
    for i in range(n + 1):
        t = i / n; p = p0.lerp(p1, t); p.z -= sag * 4 * t * (1 - t); pts.append(p)
    segs = [beam(coll, f'{name}_{i}', pts[i], pts[i + 1], r, mat, 6) for i in range(n)]
    return join(segs, name)


def join(objs, name=None):
    objs = [o for o in objs if o]
    if len(objs) == 1: return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    if name: objs[0].name = name
    return objs[0]


def inked(o, w=0.015):
    ink_hull(o, w); return o


def newcoll(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children: (parent or bpy.context.scene.collection).children.link(c)
    return c


def empty(coll, name, loc, rot_z=0.0, target=None):
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.3
    coll.objects.link(e); e.location = loc; e.rotation_euler = (0, 0, rot_z)
    if target is not None: e['target'] = list(target)
    return e


def light(coll, name, kind, loc, energy, color, size=0.3):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == 'POINT': ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); coll.objects.link(o); o.location = loc; return o


# ---------------------------------------------------------------- reusable dressing pieces
def barrel(c, nm, loc, s=1.0, mat=None):
    prof = [(0.0, 0), (0.34, 0), (0.40, 0.18), (0.43, 0.45), (0.40, 0.72), (0.34, 0.9), (0.0, 0.9)]
    b = lathe(c, nm, prof, mat or M('wooddark'), loc, seg=20, scale=(s, s, s), tile=0.5)
    hoops = [lathe(c, nm + 'h', [(r * 1.015, z - 0.025), (r * 1.04, z - 0.025), (r * 1.04, z + 0.025), (r * 1.015, z + 0.025)], M('iron'), loc, seg=20, scale=(s, s, s), cap=False, smooth=False)
             for r, z in ((0.37, 0.11), (0.435, 0.3), (0.435, 0.6), (0.37, 0.8))]
    # lid ring on top
    return inked(join([b] + hoops, nm), 0.012)


def crate(c, nm, loc, size=(0.8, 0.8, 0.7), rot=(0, 0, 0), mat=None):
    sx, sy, sz = size; m = mat or M('crate'); parts = [box(c, nm, size, (0, 0, sz / 2), m, tile=0.8)]
    t = 0.07
    for x in (-1, 1):
        for y in (-1, 1):
            parts.append(box(c, nm + 'p', (t, t, sz + 0.02), (x * (sx / 2), y * (sy / 2), sz / 2), M('wooddark')))
    for z in (0.0 + t / 2, sz - t / 2):  # top/bottom rails
        parts.append(box(c, nm + 'r', (sx + 0.03, sy + 0.03, t), (0, 0, z), M('wooddark')))
    o = join(parts, nm); o.location = loc; o.rotation_euler = rot
    return inked(o, 0.012)


def sack(c, nm, loc, s=1.0, mat=None, rot_z=0.0):
    prof = [(0.0, 0), (0.22, 0.02), (0.30, 0.15), (0.28, 0.32), (0.18, 0.45), (0.1, 0.52), (0.16, 0.58), (0.0, 0.58)]
    o = lathe(c, nm, prof, mat or M('burlap'), loc, (0, 0, rot_z), seg=14, scale=(s, s * 0.85, s))
    return inked(o, 0.012)


def rock(c, nm, loc, r=0.4, seed=1, mat=None):
    o = sph(c, nm, r, loc, mat or M('rockm'), scale=(1.2, 1.0, 0.7), seg=12, noise=0.18, seed=seed)
    return inked(o, 0.015)


def lantern(c, nm, loc, s=1.0, glowmat=None):
    body = lathe(c, nm, [(0.0, 0), (0.07, 0), (0.09, 0.03), (0.09, 0.2), (0.07, 0.22), (0.0, 0.22)], glowmat or M('lampglow'), loc, seg=12, scale=(s, s, s))
    base = cyl(c, nm + 'b', 0.1 * s, 0.03 * s, (loc[0], loc[1], loc[2] - 0.01 * s), M('iron'), seg=12)
    top = cyl(c, nm + 't', 0.095 * s, 0.04 * s, (loc[0], loc[1], loc[2] + 0.23 * s), M('iron'), seg=12, r2=0.04 * s)
    ring = beam(c, nm + 'h', (loc[0], loc[1], loc[2] + 0.25 * s), (loc[0], loc[1], loc[2] + 0.36 * s), 0.008 * s, M('iron'))
    bars = [beam(c, nm + 'k', (loc[0] + dx * 0.092 * s, loc[1] + dy * 0.092 * s, loc[2]), (loc[0] + dx * 0.092 * s, loc[1] + dy * 0.092 * s, loc[2] + 0.22 * s), 0.006 * s, M('iron'), 5)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
    return join([body, base, top, ring] + bars, nm)


def tent(c, nm, loc, rot_z=0, w=3.0, l=3.6, h=2.0, mat=None):
    m = mat or M('canvas')
    bm = bmesh.new(); hw, hl = w / 2, l / 2
    v = [bm.verts.new(p) for p in ((-hw, -hl, 0), (hw, -hl, 0), (hw, hl, 0), (-hw, hl, 0), (0, -hl, h), (0, hl, h))]
    for f in ((0, 4, 1), (3, 2, 5), (0, 3, 5, 4), (1, 4, 5, 2)): bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = _obj(nm, bm, m, c, (0, 0, 0), (0, 0, 0), False, True, 1.4)
    door = box(c, nm + 'd', (w * 0.28, 0.06, h * 0.55), (0, -hl - 0.02, h * 0.28), M('black'))
    flap1 = box(c, nm + 'f1', (w * 0.17, 0.05, h * 0.62), (-w * 0.2, -hl - 0.05, h * 0.3), m, (0, 0.0, 0.18))
    flap2 = box(c, nm + 'f2', (w * 0.17, 0.05, h * 0.62), (w * 0.2, -hl - 0.05, h * 0.3), m, (0, 0.0, -0.18))
    pole = beam(c, nm + 'p', (0, -hl, 0), (0, -hl, h + 0.35), 0.04, M('wooddark'))
    pole2 = beam(c, nm + 'p2', (0, hl, 0), (0, hl, h + 0.35), 0.04, M('wooddark'))
    ridge = beam(c, nm + 'rg', (0, -hl, h + 0.32), (0, hl, h + 0.32), 0.035, M('wooddark'))
    parts = [body, door, flap1, flap2, pole, pole2, ridge]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (sx * (hw + 0.7), sy * (hl + 0.5), 0.0)
            parts.append(beam(c, nm + 'g', p, (sx * hw * 0.6, sy * hl, h * 0.55), 0.012, M('rope'), 5))
            parts.append(beam(c, nm + 'pg', (p[0], p[1], 0.22), (p[0], p[1], -0.02), 0.03, M('wooddark'), 6))
    o = join(parts, nm); o.location = loc; o.rotation_euler = (0, 0, rot_z)
    return inked(o, 0.02)


def tree(c, nm, loc, h=5.5, seed=3):
    rnd = random.Random(seed); parts = []
    tr = lathe(c, nm, [(0.0, 0), (0.55, 0), (0.42, 0.6), (0.3, 2.5), (0.22, h * 0.7), (0.0, h * 0.7)], M('bark'), (0, 0, 0), seg=14, tile=1.2)
    parts.append(tr)
    tops = []
    for i in range(7):
        a = rnd.uniform(0, 6.28); d = rnd.uniform(0.4, 1.8); z = h * 0.62 + rnd.uniform(-0.5, 1.2)
        p = (d * math.cos(a), d * math.sin(a), z)
        parts.append(beam(c, nm + 'br', (0, 0, h * 0.5), p, 0.09, M('bark'), 6))
        tops.append(sph(c, nm + 'lf', rnd.uniform(1.0, 1.5), (p[0], p[1], p[2] + 0.5), M('leaf'), (1, 1, 0.8), 10, 0.12, i))
    sph_main = sph(c, nm + 'lm', 1.9, (0, 0, h * 0.85), M('leaf'), (1, 1, 0.8), 12, 0.1, 99)
    trunk = join(parts, nm + '_trunk'); foliage = join(tops + [sph_main], nm + '_leaves')
    inked(trunk, 0.03); inked(foliage, 0.035)
    foliage.parent = trunk; trunk.location = loc
    return trunk


def pot(c, nm, loc, s=1.0, mat=None):
    b = lathe(c, nm, [(0.0, 0), (0.2, 0), (0.26, 0.1), (0.27, 0.3), (0.25, 0.34), (0.0, 0.34)], mat or M('copper'), loc, seg=18, scale=(s, s, s))
    ear = [beam(c, nm + 'e', (loc[0] + d * 0.27 * s, loc[1], loc[2] + 0.28 * s), (loc[0] + d * 0.36 * s, loc[1], loc[2] + 0.3 * s), 0.025 * s, M('iron')) for d in (-1, 1)]
    return inked(join([b] + ear, nm), 0.012)


def flag(c, nm, loc, h=4.0):
    pole = beam(c, nm, loc, (loc[0], loc[1], loc[2] + h), 0.04, M('wooddark'))
    bm = bmesh.new(); z0 = loc[2] + h - 0.1
    vs = [bm.verts.new(p) for p in ((loc[0], loc[1], z0), (loc[0] + 1.1, loc[1] - 0.1, z0 - 0.1), (loc[0] + 1.0, loc[1] - 0.2, z0 - 0.7), (loc[0], loc[1], z0 - 0.8))]
    bm.faces.new(vs)
    fl = _obj(nm + 'cl', bm, M('red'), c, uv=False)
    return join([pole, fl], nm)


# ---------------------------------------------------------------- the four sets
def _ground(c, nm, size=44, mat=None, z=0.0, loc=(0, 0, 0)):
    return box(c, nm, (size, size, 0.4), (loc[0], loc[1], z - 0.2), mat or M('grass'), tile=4.0)


import math as _m
def sky_mat(name, stops, R=140.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    tc = N('ShaderNodeTexCoord'); sp = N('ShaderNodeSeparateXYZ'); mr = N('ShaderNodeMapRange'); cr = N('ShaderNodeValToRGB'); em = N('ShaderNodeEmission'); o = N('ShaderNodeOutputMaterial')
    L(tc.outputs['Object'], sp.inputs[0]); L(sp.outputs['Z'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value = -0.05 * R; mr.inputs['From Max'].default_value = 0.8 * R
    L(mr.outputs[0], cr.inputs[0]); e = cr.color_ramp.elements
    e[0].position, e[0].color = stops[0][0], (*stops[0][1], 1); e[1].position, e[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        x = e.new(p); x.color = (*c, 1)
    L(cr.outputs[0], em.inputs[0]); L(em.outputs[0], o.inputs[0]); return m


def cloud(c, nm, loc, s, mat):
    parts = [sph(c, nm, 1.0 * s * k, (loc[0] + dx * s, loc[1], loc[2] + dz * s), mat, (1, 0.6, 0.72), 12) for dx, dz, k in
             ((0, 0, 1), (1.1, -0.1, 0.8), (-1.1, -0.15, 0.75), (0.45, 0.45, 0.7), (-0.5, 0.4, 0.6))]
    o = join(parts, nm); return inked(o, 0.25 * s / 6)


def sky(c, o, night=False):
    ox, oy, oz = o; R = 140.0
    if night:
        st = [(0.0, (0.04, 0.1, 0.52)), (0.35, (0.015, 0.045, 0.4)), (1.0, (0.008, 0.015, 0.24))]
    else:
        st = [(0.0, (0.98, 0.95, 0.82)), (0.22, (0.6, 0.9, 0.96)), (0.65, (0.22, 0.62, 0.96)), (1.0, (0.14, 0.45, 0.9))]
    d = sph(c, 'skydome', R, (ox, oy, oz), sky_mat('sky_night' if night else 'sky_day', st, R), (1, 1, 1), 24)
    d.visible_shadow = False
    rnd = random.Random(5 if night else 2)
    for i in range(9):
        cloud(c, f'cloud{i}', (ox - 80 + i * 20 + rnd.uniform(-5, 5), oy + rnd.uniform(70, 110), oz + rnd.uniform(14, 40)), rnd.uniform(4.5, 8), M('cloud_n' if night else 'cloud'))
    if night:
        m = sph(c, 'moon', 7.0, (ox - 14, oy + 95, oz + 42), M('moon'), (1, 1, 1), 20); inked(m, 0.35)
        for i in range(70):
            while True:
                v = Vector((rnd.uniform(-1, 1), rnd.uniform(0.2, 1), rnd.uniform(0.3, 1)))
                if v.length > 0.3: break
            p = v.normalized() * 125
            sph(c, 'star', rnd.uniform(0.2, 0.45), (ox + p.x, oy + p.y, oz + p.z), M('star'), (1, 1, 1), 5)
    return d


def hills(c, o, night=False):
    ox, oy, oz = o; k = 'n' if night else ''
    for i, x in enumerate(range(-100, 101, 38)):
        sph(c, 'hillfar', 22, (ox + x + (i % 2) * 12, oy + 105, oz - 7), M('hill1' + k), (2.4, 1, 0.85 + 0.15 * (i % 3)), 20)
    for i, x in enumerate(range(-90, 91, 32)):
        sph(c, 'hillmid', 17, (ox + x + (i % 2) * 9, oy + 80, oz - 5), M('hill2' + k), (2.3, 1, 0.7 + 0.12 * (i % 3)), 20)
    for i, x in enumerate(range(-70, 71, 26)):
        sph(c, 'hillnear', 12, (ox + x + (i % 2) * 7, oy + 63, oz - 3.5), M('hill3' + k), (2.3, 1, 0.55 + 0.1 * (i % 3)), 20)
    rnd = random.Random(8); blobs = []
    for i in range(36):
        x = -52 + i * 3.0
        blobs.append(sph(c, 'tl', rnd.uniform(1.8, 2.8), (ox + x, oy + rnd.uniform(53, 57), oz + rnd.uniform(1.0, 2.6)), M('tree_d' if not night else 'hill3n'), (1, 1, 1.25), 8, 0.1, i))
    inked(join(blobs, 'treeline'), 0.06)


def terrain(c, o):
    ox, oy, oz = o; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    box(c, 'ground', (140, 34, 0.4), P(0, -5, -0.2), M('grass'), tile=4.0)
    box(c, 'bank', (140, 3.0, 0.3), P(0, 12.2, -0.05), M('dirt'), rot=(0.12, 0, 0), tile=4.0)
    box(c, 'river', (140, 26, 0.2), P(0, 26, -0.55), M('water'), tile=5.0)
    box(c, 'farbank', (140, 28, 0.5), P(0, 53, -0.25), M('grass_d'), tile=4.0)
    rnd = random.Random(4)
    for i in range(22):  # ink-white ripple highlights on the water band
        box(c, 'ripple', (rnd.uniform(1.5, 4), 0.07, 0.01), P(rnd.uniform(-14, 14), rnd.uniform(14.5, 37), -0.44), M('ripple'))
    for i, (x, y, r, k) in enumerate(((-7, -4, 3.2, 'grass_d'), (6, -3, 2.8, 'grass_l'), (-3, -7, 3.5, 'grass_l'), (3, -8, 3, 'grass_d'), (-9, 2, 3, 'grass_l'),
                                      (9, 1, 3.4, 'grass_d'), (-5, 9, 3, 'grass_d'), (7, 10, 3, 'grass_l'), (0, -11, 4, 'grass_d'))):
        p = cyl(c, 'patch', r, 0.03, P(x, y, 0.015 + 0.002 * i), M(k), seg=18, tile=4.0); p.scale = (1, 0.7, 1)
    dp = cyl(c, 'dirtpatch', 2.3, 0.06, P(0, 0.4, 0.0), M('dirt'), seg=20, tile=4.0); dp.scale = (1, 0.7, 1)
    for i in range(14):  # path winding toward the camp
        t = i / 13
        cyl(c, 'path', 0.9 - 0.25 * t, 0.05, P(-1.4 * _m.sin(t * 3.2) + 0.6, -9 + t * 20, 0.0), M('dirt'), seg=12, tile=4.0)
    for i in range(9): rock(c, 'bankrock', P(-15 + i * 3.5 + (i % 2) * 0.6, 11.0 + (i % 3) * 0.4, 0.1), 0.35 + 0.1 * (i % 3), i)


def tufts(c, nm, pts, h, mat, seg=4, spread=0.1):
    rnd = random.Random(len(pts)); parts = []
    for (x, y, z) in pts:
        for k in range(4):
            hh = h * rnd.uniform(0.6, 1.2)
            parts.append(cyl(c, nm, 0.03, hh, (x + rnd.uniform(-spread, spread), y + rnd.uniform(-spread, spread), z + hh / 2), mat, (rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35), 0), seg, 0.0))
    return join(parts, nm)


def rifles(c, nm, loc, s=1.0):
    ox, oy, oz = loc; apex = Vector((ox, oy, oz + 1.25 * s)); parts = []
    for i in range(3):
        a = i * 2.094 + 0.3; b = Vector((ox + 0.38 * _m.cos(a) * s, oy + 0.38 * _m.sin(a) * s, oz))
        parts.append(beam(c, nm, b, apex, 0.016 * s, M('iron'), 6)); parts.append(beam(c, nm, b, b.lerp(apex, 0.38), 0.03 * s, M('leather'), 6))
    parts.append(cyl(c, nm, 0.045 * s, 0.1 * s, apex - Vector((0, 0, 0.12 * s)), M('rope'), seg=8))
    return inked(join(parts, nm), 0.01)


def bucket(c, nm, loc, s=1.0):
    ox, oy, oz = loc
    b = lathe(c, nm, [(0.0, 0), (0.15 * s, 0), (0.21 * s, 0.3 * s), (0.2 * s, 0.3 * s), (0.14 * s, 0.03 * s)], M('crate'), loc, seg=14, cap=True, smooth=False, tile=0.4)
    h = lathe(c, nm, [(0.165 * s, 0.07 * s), (0.18 * s, 0.07 * s), (0.18 * s, 0.1 * s), (0.165 * s, 0.1 * s)], M('iron'), loc, seg=14, cap=False, smooth=False)
    pts = [(ox + 0.2 * s * _m.cos(_m.pi * i / 6), oy, oz + 0.3 * s + 0.2 * s * _m.sin(_m.pi * i / 6)) for i in range(7)]
    hd = [beam(c, nm, pts[i], pts[i + 1], 0.01 * s, M('iron'), 4) for i in range(6)]
    return inked(join([b, h] + hd, nm), 0.01)


def coil(c, nm, loc, s=1.0):
    parts = []
    for R, z in ((0.22, 0.03), (0.2, 0.08), (0.17, 0.13)):
        prof = [(R * s + 0.03 * s * _m.cos(t), 0.03 * s * _m.sin(t) + z * s) for t in [2 * _m.pi * i / 8 for i in range(9)]]
        parts.append(lathe(c, nm, prof, M('rope'), loc, seg=14, cap=False, smooth=True))
    return inked(join(parts, nm), 0.006)


def cook_tripod(c, nm, loc):
    ox, oy, oz = loc; apex = Vector((ox, oy, oz + 1.7)); parts = []
    for i in range(3):
        a = i * 2.094 + 0.5; parts.append(beam(c, nm, Vector((ox + 0.8 * _m.cos(a), oy + 0.8 * _m.sin(a), oz)), apex, 0.04, M('wooddark'), 6))
    parts.append(beam(c, nm, apex, (ox, oy, oz + 0.95), 0.012, M('iron'), 4))
    for i in range(5):
        a = i * 1.26; rock(c, nm + 'r', (ox + 0.42 * _m.cos(a), oy + 0.42 * _m.sin(a), oz + 0.07), 0.12, 30 + i)
    for i in range(3):
        a = i * 2.1; parts.append(beam(c, nm, (ox + 0.3 * _m.cos(a), oy + 0.3 * _m.sin(a), oz + 0.08), (ox - 0.2 * _m.cos(a), oy - 0.2 * _m.sin(a), oz + 0.12), 0.05, M('bark'), 6))
    inked(join(parts, nm), 0.015); pot(c, nm + 'pot', (ox, oy, oz + 0.62), 1.1)


def stack(c, nm, loc, sizes, jit=0.12):
    ox, oy, oz = loc; z = 0; rnd = random.Random(int(abs(ox * 7 + oy * 3)))
    for i, sz in enumerate(sizes):
        crate(c, f'{nm}{i}', (ox + rnd.uniform(-jit, jit), oy + rnd.uniform(-jit, jit), oz + z), (sz, sz, sz * 0.88), (0, 0, rnd.uniform(-0.3, 0.3))); z += sz * 0.88


def flames(c, nm, loc, frames=120, seed=1):
    """4 layered flame tongues (red/red/orange/yellow) with looping scale/rotation noise keys + embers rising. Returns all objects."""
    rnd = random.Random(seed); ox, oy, oz = loc; objs = []
    def tongue(mat, r, h, dx, dy):
        prof = [(0.0, 0), (r, 0.03), (r * 0.9, h * 0.3), (r * 0.55, h * 0.68), (0.0, h)]
        o = lathe(c, nm, prof, M(mat), (ox + dx, oy + dy, oz), seg=8, cap=False, smooth=True); objs.append(o); return o
    for t in (tongue('f_red', 0.34, 1.0, 0, 0), tongue('f_red', 0.2, 0.75, 0.22, 0.05), tongue('f_orange', 0.24, 0.8, -0.02, 0), tongue('f_yellow', 0.13, 0.5, 0, 0)):
        first = None
        for f in range(1, frames + 2, 3):
            if f > frames: sc, rt = first
            else:
                sc = (rnd.uniform(0.85, 1.15), rnd.uniform(0.85, 1.15), rnd.uniform(0.75, 1.3)); rt = (rnd.uniform(-0.28, 0.28), rnd.uniform(-0.28, 0.28), rnd.uniform(-0.8, 0.8))
                if first is None: first = (sc, rt)
            t.scale = sc; t.rotation_euler = rt
            t.keyframe_insert('scale', frame=f); t.keyframe_insert('rotation_euler', frame=f)
    for n in range(10):
        e = sph(c, 'ember', 0.025, (ox, oy, oz + 0.4), M('ember'), (1, 1, 1), 5); objs.append(e)
        per = 28 + n * 4; x0, y0 = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25); dx, dy = rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5)
        for k in range(0, frames + per, per):
            e.location = (ox + x0, oy + y0, oz + 0.4); e.scale = (1, 1, 1); e.keyframe_insert('location', frame=k + n + 1); e.keyframe_insert('scale', frame=k + n + 1)
            e.location = (ox + x0 + dx, oy + y0 + dy, oz + 2.2); e.scale = (0.1, 0.1, 0.1); e.keyframe_insert('location', frame=k + n + per); e.keyframe_insert('scale', frame=k + n + per)
    return objs


def flicker(lt, base, frames=120, seed=2):
    rnd = random.Random(seed)
    for f in range(1, frames + 1, 2):
        lt.data.energy = base * (1 if f in (1, frames) else rnd.uniform(0.75, 1.25)); lt.data.keyframe_insert('energy', frame=f)


# ---------------------------------------------------------------- WORLD pass: grass tufts/flowers + extra camp dressing
def _blade_tetra(bm, p, h, lean, yaw, w=0.022):
    """thin closed tetrahedron blade so ink_hull outlines it like every other prop"""
    x, y, z = p
    v = [bm.verts.new((x + w * math.cos(a + yaw), y + w * math.sin(a + yaw), z)) for a in (0, 2.094, 4.189)]
    tip = bm.verts.new((x + lean * math.cos(yaw), y + lean * math.sin(yaw), z + h))
    for f in ((v[0], v[1], v[2]), (v[0], v[1], tip), (v[1], v[2], tip), (v[2], v[0], tip)): bm.faces.new(f)


def _world_ground_cover(c, o):
    """~220 ink-outlined tufts + ~60 flowers, ONE joined low-poly mesh each. Clear around the character/camera corridor, fire and path."""
    ox, oy, oz = o; rnd = random.Random(31); bt = bmesh.new(); bf = {k: bmesh.new() for k in ('flw_w', 'flw_y', 'flw_r')}
    path = lambda y: -1.4 * math.sin(((y + 9) / 20) * 3.2) + 0.6
    def ok(x, y):
        d = math.hypot(x, y)
        if min(math.hypot(x - 0.9, y), math.hypot(x + 0.9, y)) < 1.3: return False   # feet stay clean (1.5 m round each spot)
        if math.hypot(x, y - 2.5) < 2.9 or y > 11.0: return False  # fire pit, river bank
        if -9 < y < 11 and abs(x - path(y)) < 1.3: return False    # dirt path
        return rnd.random() < min(1.0, (d - 2.2) / 5.0 + 0.2)
    n_t = tries = 0
    while n_t < 560 and tries < 6000:
        tries += 1; x, y = rnd.uniform(-13, 13), rnd.uniform(-9.5, 10.5)
        if not ok(x, y): continue
        n_t += 1; h = rnd.uniform(0.35, 0.65)
        for k in range(4):
            _blade_tetra(bt, (ox + x + rnd.uniform(-0.07, 0.07), oy + y + rnd.uniform(-0.07, 0.07), oz), h * rnd.uniform(0.6, 1.1), rnd.uniform(0.05, 0.2), rnd.uniform(0, 6.28), 0.034)
    nf = tries = 0
    while nf < 110 and tries < 6000:
        tries += 1; x, y = rnd.uniform(-12, 12), rnd.uniform(-9, 10)
        if not ok(x, y) or math.hypot(x, y) < 4.5: continue
        nf += 1; k = rnd.choice(('flw_w', 'flw_y', 'flw_r', 'flw_y')); hh = rnd.uniform(0.18, 0.3)
        _blade_tetra(bt, (ox + x, oy + y, oz), hh, 0.02, rnd.uniform(0, 6.28), 0.01)
        r = bmesh.ops.create_uvsphere(bf[k], u_segments=6, v_segments=4, radius=0.055)
        bmesh.ops.scale(bf[k], vec=(1, 1, 0.45), verts=r['verts']); bmesh.ops.translate(bf[k], vec=(ox + x, oy + y, oz + hh), verts=r['verts'])
    for b in [bt] + list(bf.values()): b.normal_update(); bmesh.ops.recalc_face_normals(b, faces=b.faces)
    inked(_obj('wgrass', bt, M('grass_l'), c, uv=False), 0.008)
    for k, b in bf.items(): inked(_obj('wflower_' + k, b, M(k), c, uv=False), 0.01)
    bp = bmesh.new()
    for i in range(80):   # painted pebbles scattered along the dirt path
        yy = rnd.uniform(-9, 10.5); xx = path(yy) + rnd.uniform(-1.0, 1.0)
        if min(math.hypot(xx - 0.9, yy), math.hypot(xx + 0.9, yy)) < 0.9: continue
        r_ = bmesh.ops.create_uvsphere(bp, u_segments=6, v_segments=4, radius=rnd.uniform(0.035, 0.075))
        bmesh.ops.scale(bp, vec=(1.2, 1.0, 0.55), verts=r_['verts']); bmesh.ops.translate(bp, vec=(ox + xx, oy + yy, oz + 0.02), verts=r_['verts'])
    bp.normal_update(); bmesh.ops.recalc_face_normals(bp, faces=bp.faces); inked(_obj('wpebbles', bp, M('rockm'), c, uv=False), 0.006)


def _rack(c, nm, loc, rot_z=0.0):
    ox, oy, oz = loc; parts = []; ca, sa = math.cos(rot_z), math.sin(rot_z); R = lambda dx, dy, z: (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca, oz + z)
    for dx in (-0.9, 0.9):
        parts.append(beam(c, nm, R(dx, 0, 0), R(dx, 0, 1.15), 0.045, M('wooddark'), 6)); parts.append(beam(c, nm, R(dx, -0.3, 0.0), R(dx, 0.3, 0.0), 0.04, M('wooddark'), 6))
    for z in (0.9, 0.35): parts.append(beam(c, nm, R(-0.95, 0, z), R(0.95, 0, z), 0.04, M('wooddark'), 6))
    for i in range(6):
        x = -0.65 + i * 0.26; parts.append(beam(c, nm, R(x, 0.1, 0.0), R(x + 0.05, 0.02, 1.35), 0.018, M('iron'), 5)); parts.append(beam(c, nm, R(x, 0.1, 0.0), R(x + 0.012, 0.08, 0.5), 0.032, M('leather'), 5))
    return inked(join(parts, nm), 0.012)


def _wheelbarrow(c, nm, loc, rot_z=0.0):
    ox, oy, oz = loc; ca, sa = math.cos(rot_z), math.sin(rot_z); R = lambda dx, dy, z: (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca, oz + z)
    bm = bmesh.new(); v = [bm.verts.new(R(*p)) for p in ((-0.35, -0.45, 0.5), (0.35, -0.45, 0.5), (0.4, 0.45, 0.62), (-0.4, 0.45, 0.62), (-0.2, -0.3, 0.3), (0.2, -0.3, 0.3), (0.22, 0.3, 0.36), (-0.22, 0.3, 0.36))]
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)): bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts = [_obj(nm, bm, M('crate'), c, uv=True, tile=0.6)]
    for sx in (-0.3, 0.3):
        parts.append(beam(c, nm, R(sx, -0.45, 0.42), R(sx * 1.1, -1.3, 0.62), 0.025, M('wooddark'), 5)); parts.append(beam(c, nm, R(sx, 0.4, 0.3), R(sx, 0.55, 0.0), 0.025, M('wooddark'), 5))
    parts.append(cyl(c, nm, 0.22, 0.07, R(0, 0.5, 0.22), M('iron'), (0, math.pi / 2, rot_z), 14))
    return inked(join(parts, nm), 0.012)


def _flag_line(c, nm, p0, p1, sag=0.5, n=12):
    p0, p1 = Vector(p0), Vector(p1); line = rope(c, nm, p0, p1, sag, 0.012, M('rope'), 10); ks = ('red', 'pen_y', 'blue', 'cream'); bms = {k: bmesh.new() for k in ks}
    d = (p1 - p0).normalized()
    for i in range(1, n):
        t = i / n; p = p0.lerp(p1, t); p.z -= sag * 4 * t * (1 - t); b = bms[ks[i % 4]]
        vs = [b.verts.new(q) for q in (p - d * 0.14, p + d * 0.14, p - Vector((0, 0, 0.42)))]; b.faces.new(vs)
    for k, b in bms.items(): _obj(nm + 'pen', b, M(k), c, uv=False)
    return line


def _dep_trees(c, o, night):
    """depth layers: far-bank trees (background), big framing trees at the camp edge (mid), bushes (foreground edge)."""
    ox, oy, oz = o; rnd = random.Random(12); blobs = []; trunks = []; k = 'hill3n' if night else 'tree_d'
    for i in range(16):
        x = -48 + i * 6.2 + rnd.uniform(-1.5, 1.5); y = rnd.uniform(40, 52); h = rnd.uniform(5, 9)
        trunks.append(beam(c, 'dtrunk', (ox + x, oy + y, oz), (ox + x, oy + y, oz + h * 0.5), 0.35, M('bark'), 5))
        if rnd.random() < 0.45: blobs.append(lathe(c, 'dcone', [(0.0, 0), (1.9, 0), (0.0, h)], M(k), (ox + x, oy + y, oz + h * 0.25), seg=7, cap=False, smooth=False))
        else: blobs.append(sph(c, 'dblob', rnd.uniform(2.4, 3.4), (ox + x, oy + y, oz + h * 0.65), M(k), (1, 1, 1.15), 9, 0.1, i))
    inked(join(blobs, 'deptree_cones'), 0.1); join(trunks, 'deptree_trunks')
    tree(c, 'tree_L', (ox - 13.5, oy + 5.5, oz), 7.0, 21); tree(c, 'tree_R', (ox + 13.0, oy + 7.0, oz), 6.5, 22)
    for i, (x, y, s_) in enumerate(((-11.5, -3.0, 1.0), (-12.5, 2.0, 1.3), (11.5, -2.0, 1.1), (12.5, 3.5, 1.4), (-10.0, 12.0, 1.2), (10.0, 12.2, 1.1))):
        inked(sph(c, 'bush', 0.9 * s_, (ox + x, oy + y, oz + 0.35 * s_), M('leaf'), (1.3, 1.0, 0.75), 10, 0.14, i), 0.025)


def _edge_props(c, o, night):
    """frame-edge foreground framing (left/right of every camera spot, nearer than the characters), a plank walkway and scattered leaves."""
    ox, oy, oz = o; P = lambda x, y, z=0: (ox + x, oy + y, oz + z); rnd = random.Random(77)
    for sx in (-1, 1):
        for y, kind in ((-1.0, 'bush'), (-1.6, 'bush'), (-2.4, 'crate'), (-2.6, 'bush'), (-3.9, 'barrel'), (-5.2, 'crate'), (-6.6, 'bush'), (-3.2, 'post')):
            x = sx * (2.5 + rnd.uniform(0, 0.8)) if y < -2.0 else sx * (2.3 + rnd.uniform(0, 0.5))
            if kind == 'bush': inked(sph(c, 'ebush', 0.7, P(x + sx * 0.3, y, 0.28), M('leaf'), (1.3, 1.0, 0.8), 10, 0.14, int(y * 10)), 0.025)
            elif kind == 'barrel': barrel(c, 'ebarrel', P(x, y), 1.0)
            elif kind == 'crate': crate(c, 'ecrate', P(x, y), (0.8, 0.8, 0.7), (0, 0, rnd.uniform(-0.4, 0.4)))
            else:
                inked(beam(c, 'epost', P(x, y, 0), P(x, y, 1.1), 0.07, M('wooddark')), 0.012)
                rope(c, 'eposr', P(x, y, 0.9), P(x + sx * 1.2, y - 1.0, 0.9), 0.15, 0.022, M('rope'))
        # tall grass clumps
        bt = bmesh.new()
        for i in range(12):
            gx, gy = sx * rnd.uniform(3.2, 4.2), rnd.uniform(-6.4, -4.4)
            for k in range(6): _blade_tetra(bt, (ox + gx + rnd.uniform(-0.1, 0.1), oy + gy + rnd.uniform(-0.1, 0.1), oz), rnd.uniform(0.25, 0.45), rnd.uniform(0.05, 0.2), rnd.uniform(0, 6.28), 0.03)
        bt.normal_update(); bmesh.ops.recalc_face_normals(bt, faces=bt.faces); inked(_obj('wtall', bt, M('grass_l'), c, uv=False), 0.01)
    # plank walkway down the near ground (stops 1.6 m before the character spots)
    parts = []
    for i in range(16):
        y = -9.2 + i * 0.46; parts.append(box(c, 'wwalk', (1.15 + rnd.uniform(-0.05, 0.05), 0.4, 0.05), P(0.05 + 0.1 * math.sin(i * 0.5), y, 0.025), M('wooddark'), (0, 0, rnd.uniform(-0.04, 0.04)), tile=0.5))
    inked(join(parts, 'wwalk'), 0.008)
    # scattered leaves (flat little tetrahedra)
    bl = {k: bmesh.new() for k in ('copper', 'pen_y', 'leather')}
    for i in range(70):
        x, y = rnd.uniform(-5, 5), rnd.uniform(-8, -1.5)
        if min(math.hypot(x - 0.9, y), math.hypot(x + 0.9, y)) < 1.4: continue
        _blade_tetra(bl[rnd.choice(list(bl))], (ox + x, oy + y, oz + 0.005), 0.025, 0.1, rnd.uniform(0, 6.28), 0.07)
    for k, b in bl.items(): b.normal_update(); bmesh.ops.recalc_face_normals(b, faces=b.faces); _obj('wleaf_' + k, b, M(k), c, uv=False)


def _world_dressing(c, o, night=False):
    ox, oy, oz = o; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    _world_ground_cover(c, o); _dep_trees(c, o, night); _edge_props(c, o, night)
    # mid-ground dressing flanking the character corridor so the wides never show bare floor
    _rack(c, 'wrack', P(4.6, -1.0), -0.5); _rack(c, 'wrack2', P(-4.8, -1.2), 0.6)
    _wheelbarrow(c, 'wbarrow', P(6.0, -2.4), 0.6)
    _flag_line(c, 'fline1', P(-9.5, -1.2, 3.4), P(9.5, -1.2, 3.4), 0.55, 14)
    for x in (-9.5, 9.5): inked(beam(c, 'fpost', P(x, -1.2, 0), P(x, -1.2, 3.55), 0.07, M('wooddark')), 0.015)
    for sx in (-1, 1):   # side rope fences, centre left open
        for i in range(4):
            y = -4.8 + i * 2.2; inked(beam(c, 'spost', P(sx * 8.4, y, 0), P(sx * 8.4, y, 1.15), 0.07, M('wooddark')), 0.012)
            if i: rope(c, 'sfence', P(sx * 8.4, y - 2.2, 0.95), P(sx * 8.4, y, 0.95), 0.16, 0.022, M('rope'))
    for lx, ly in ((7.8, -3.9), (-8.0, 0.8), (3.6, -2.4), (-3.9, -2.8)):
        for i in range(6):
            inked(beam(c, 'wlog', P(lx, ly + (i % 3) * 0.2, 0.09 + 0.15 * (i // 3)), P(lx + 1.2, ly + (i % 3) * 0.2 + 0.05, 0.11 + 0.15 * (i // 3)), 0.075, M('bark'), 7), 0.01)
    for i, (x, y) in enumerate(((5.6, 0.9), (6.1, 1.4), (-5.6, -3.4), (-6.2, -3.0))): sack(c, f'wsack{i}', P(x, y), 1.1, rot_z=i * 1.3)
    bucket(c, 'wbucket1', P(5.4, 2.0), 1.1); bucket(c, 'wbucket2', P(-5.8, 0.6), 1.0); bucket(c, 'wbucket3', P(3.9, -3.4), 1.0)
    stack(c, 'wstack', P(9.0, 1.0), (1.0, 0.85, 0.7)); barrel(c, 'wbarrel', P(-9.0, -3.0), 1.1)
    rock(c, 'wrock1', P(8.6, -5.6, 0.1), 0.6, 41); rock(c, 'wrock2', P(-9.6, -6.0, 0.1), 0.7, 42)
    cols = dict(tl=(0.34, 0.5, 0.12), td=(0.14, 0.3, 0.14), peb=(0.66, 0.64, 0.6), flw=(1.0, 0.95, 0.55), patch=(0.5, 0.72, 0.38)) if not night else dict(tl=(0.12, 0.28, 0.34), td=(0.07, 0.17, 0.26), peb=(0.3, 0.33, 0.42), flw=(0.6, 0.7, 0.9), patch=(0.2, 0.4, 0.5))
    _surface_ground(c, o, 'cn' if night else 'c', cols, [(0.9, 0, 1.0), (-0.9, 0, 1.0), (0, 2.5, 2.6)], (-9, 9, -8.5, 9), seed=77)
    _surface_ground(c, o, 'cx' if night else 'cc', cols, [(0.9, 0, 0.75), (-0.9, 0, 0.75), (0, 2.5, 2.3)], (-3.6, 3.6, -3.2, 2.6), n_t=260, n_p=45, n_f=16, patches=0, seed=79)   # dense layer where close-ups look

def _camp_dressing(c, A, o, night=False):
    ox, oy, oz = o; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    terrain(c, o); hills(c, o, night); sky(c, o, night)
    # tents
    tent(c, 'tentA', P(-4.6, 5.2), 0.35, 3.2, 3.8, 2.2, M('canvas'))
    tent(c, 'tentB', P(4.4, 6.0), -0.3, 3.0, 3.6, 2.0, M('canvas_g'))
    tent(c, 'tentC', P(-8.0, 3.0), 0.9, 2.8, 3.4, 2.0, M('canvas'))
    tent(c, 'tentD', P(8.2, 3.0), -0.8, 2.8, 3.4, 2.0, M('canvas'))
    tent(c, 'tentE', P(-9.5, 8.0), 0.5, 3.0, 3.6, 2.1, M('canvas_g')); tent(c, 'tentF', P(9.5, 8.5), -0.5, 3.0, 3.6, 2.1, M('canvas_w'))
    tent(c, 'tentG', P(0.5, 10.0), 0.1, 3.4, 4.0, 2.4, M('canvas_w'))
    # tree + flag
    tr = tree(c, 'tree', P(-3.2, 9.0), 6.0, 3); A['tree'] = empty(c, 'tree', P(-3.2, 9.0), 0)
    flag(c, 'flag', P(1.5, 10.0), 4.5)
    # barrels, crates, sacks clusters (background)
    for i, (x, y) in enumerate(((3.0, 3.0), (3.8, 2.6), (3.3, 3.8), (-1.2, 5.0), (-0.3, 5.1), (6.5, 3.2))):
        barrel(c, f'barrel{i}', P(x, y), 1.0)
    barrel(c, 'barrelT', P(3.4, 3.2, 0.9), 1.0)  # stacked
    crate(c, 'crB1', P(5.2, 3.4), (1.0, 1.0, 0.9)); crate(c, 'crB2', P(5.3, 3.5, 0.9), (0.8, 0.8, 0.7), (0, 0, 0.4))
    for i, (x, y) in enumerate(((-2.7, 3.8), (-3.4, 3.4), (-2.2, 3.2), (1.6, 4.6), (4.6, 1.6))): sack(c, f'sack{i}', P(x, y), 1.0 + 0.1 * (i % 2), rot_z=i)
    # foreground depth (low Y side, camera looks +Y)
    barrel(c, 'fgbarrel1', P(-3.0, -3.0), 1.1); barrel(c, 'fgbarrel2', P(-2.1, -3.5), 1.0)
    crate(c, 'fgcrate1', P(3.2, -3.4), (1.1, 0.9, 0.9), (0, 0, 0.25)); crate(c, 'fgcrate2', P(3.6, -3.0, 0.9), (0.7, 0.7, 0.6), (0, 0, -0.2))
    sack(c, 'fgsack1', P(-3.9, -2.2), 1.2); sack(c, 'fgsack2', P(-3.5, -2.9), 1.0, rot_z=2)
    rock(c, 'fgrock1', P(3.0, -2.6, 0.1), 0.45, 11); rock(c, 'fgrock2', P(-2.4, -2.9, 0.05), 0.35, 12)
    # rope fence along the camp edge
    for i in range(7):
        x = -7 + i * 2.3; beam(c, 'post', P(x, -4.8, 0), P(x, -4.8, 1.2), 0.07, M('wooddark')); inked(c.objects[-1], 0.012)
        if i: rope(c, 'fence', P(x - 2.3, -4.8, 1.0), P(x, -4.8, 1.0), 0.18, 0.025, M('rope'))
    # lantern posts + hanging lantern
    for x in (-4.6, 4.6):
        beam(c, 'lpost', P(x, 1.0, 0), P(x, 1.0, 2.6), 0.06, M('wooddark')); beam(c, 'larm', P(x, 1.0, 2.6), P(x - 0.5 * (1 if x > 0 else -1), 1.0, 2.6), 0.04, M('wooddark'))
        lantern(c, 'lantern', P(x - 0.5 * (1 if x > 0 else -1), 1.0, 2.2), 1.3)
    # boot, pan, drums, small props on ground
    box(c, 'bench', (2.2, 0.5, 0.1), P(-2.2, 2.6, 0.5), M('crate')); inked(c.objects[-1], 0.012)
    for x in (-3.1, -1.3): box(c, 'benchleg', (0.12, 0.4, 0.5), P(x, 2.6, 0.25), M('wooddark'))
    # drum on stand
    cyl(c, 'drum', 0.35, 0.4, P(-1.4, 2.6, 0.75), M('red'), seg=16); inked(c.objects[-1], 0.012)
    # cannonballs stack
    for i, (x, y, z) in enumerate(((1, 0, 0), (1.3, 0, 0), (1.15, 0.25, 0), (1.15, 0.1, 0.22))):
        inked(sph(c, 'ball', 0.13, P(4.2 + x, 0.9 + y, 0.13 + z), M('iron'), seg=10), 0.01)
    # firewood pile
    for i in range(6): beam(c, 'log', P(-4.8, 0.4 + i * 0.01, 0.1 + 0.14 * (i // 3)), P(-4.8 + 1.2, 0.3 + (i % 3) * 0.16, 0.12 + 0.14 * (i // 3)), 0.07, M('bark'), 7)
    # tent-flap banners / bunting
    rope(c, 'bunting', P(-6.2, 4.0, 2.4), P(5.6, 5.4, 2.6), 0.5, 0.012, M('rope'), 10)
    # ---- lower-third depth dressing
    stack(c, 'fgstackL', P(-4.3, -1.6), (1.1, 0.95, 0.8)); stack(c, 'fgstackR', P(3.9, -2.2), (1.0, 0.9, 0.75)); stack(c, 'fgstackM', P(-1.0, -5.6), (0.9, 0.8))
    stack(c, 'fgstackM2', P(2.8, -6.0), (1.0, 0.8, 0.7))
    rifles(c, 'rifles1', P(-1.6, -2.3), 1.0); rifles(c, 'rifles2', P(4.8, 0.6), 1.0)
    bucket(c, 'bucket1', P(-0.9, -3.0), 1.0); bucket(c, 'bucket2', P(2.2, -3.4), 1.2); bucket(c, 'bucket3', P(-2.5, -5.0), 1.0)
    coil(c, 'coil1', P(0.6, -3.4), 1.2); coil(c, 'coil2', P(-3.4, -4.4), 1.0); coil(c, 'coil3', P(1.6, -5.4), 1.1)
    cook_tripod(c, 'cooktri', P(3.6, 1.4)); cook_tripod(c, 'cooktri2', P(-6.2, 2.0))
    for i, (x, y) in enumerate(((-2.6, -5.4), (0.2, -6.4), (3.8, -4.6), (-4.6, -3.6), (5.2, -4.2), (-0.4, -4.3))): sack(c, f'fgs{i}', P(x, y), 1.1 + 0.1 * (i % 3), rot_z=i)
    barrel(c, 'fgbarrel3', P(5.2, -5.2), 1.1); barrel(c, 'fgbarrel4', P(-5.4, -5.6), 1.2); rock(c, 'fgrock3', P(0.3, -7.0, 0.1), 0.5, 15); rock(c, 'fgrock4', P(-3.8, -7.0, 0.1), 0.55, 16)
    rnd = random.Random(6)
    tufts(c, 'tufts', [P(rnd.uniform(-9, 9), rnd.uniform(-8, 10)) for _ in range(90)], 0.38, M('grass_l'))
    tufts(c, 'tuftsd', [P(rnd.uniform(-9, 9), rnd.uniform(-7, 9)) for _ in range(60)], 0.3, M('grass_d'))
    tufts(c, 'reeds', [P(-12 + i * 0.9 + rnd.uniform(-.2, .2), 11.6 + rnd.uniform(-.4, 1.0), -0.1) for i in range(26)], 1.3, M('reed'), spread=0.2)
    tufts(c, 'reeds2', [P(rnd.uniform(-5, 6), 13.5 + rnd.uniform(0, 1), -0.2) for i in range(14)], 1.1, M('reed'), spread=0.25)
    flag(c, 'flag2', P(-8.0, 9.5), 3.8)
    for i in range(5):  # log seats round the fire
        a = 0.6 + i * 1.15
        cyl(c, 'seat', 0.16, 1.0, P(2.3 * math.cos(a), 2.5 + 1.7 * math.sin(a) - 0.3, 0.17), M('bark'), (0, math.pi / 2, a + math.pi / 2), 8); inked(c.objects[-1], 0.01)
    crate(c, 'midcrate', P(2.0, -0.9), (0.8, 0.8, 0.7), (0, 0, 0.3)); sack(c, 'midsack', P(2.9, -0.7), 1.1, rot_z=1); bucket(c, 'midbucket', P(-2.2, -1.1), 1.1)
    barrel(c, 'midbarrel', P(-3.0, -0.2), 1.0); coil(c, 'midcoil', P(1.6, -1.8), 1.0); rifles(c, 'midrifles', P(-2.6, 1.2), 0.9)
    _world_dressing(c, o, night)
    tufts(c, 'edgetufts', [P(1.0 * math.cos(a) * 3.2 + 0.3, 0.4 + 2.4 * math.sin(a)) for a in [i * 0.28 for i in range(23)]], 0.4, M('grass_l'), spread=0.3)
    return A


def _fire(c, A, o, glowstr=1.0):
    ox, oy, oz = o
    for i in range(6):
        a = i * 1.05; beam(c, 'firelog', (ox + 0.5 * math.cos(a), oy + 2.5 + 0.5 * math.sin(a), oz + 0.1), (ox - 0.2 * math.cos(a), oy + 2.5 - 0.2 * math.sin(a), oz + 0.35), 0.07, M('bark'), 7)
    for i in range(9):
        a = i * 0.7; rock(c, 'firering', (ox + 0.85 * math.cos(a), oy + 2.5 + 0.85 * math.sin(a), oz + 0.12), 0.2, 20 + i)
    return flames(c, 'flame', (ox, oy + 2.5, oz + 0.25))


def _camp_anchors(c, o, A, fire_y=2.5):
    ox, oy, oz = o
    A['marcel_spot'] = empty(c, 'marcel_spot', (ox - 0.9, oy, oz), math.pi / 2)
    A['gaston_spot'] = empty(c, 'gaston_spot', (ox + 0.9, oy, oz), -math.pi / 2)
    A['crate'] = empty(c, 'crate', (ox + 2.4, oy + 0.3, oz))
    A['fire'] = empty(c, 'fire', (ox, oy + fire_y, oz))
    A['table'] = empty(c, 'table', (ox - 2.2, oy + 2.6, oz + 0.55))
    A['cam_hint_wide'] = empty(c, 'cam_hint_wide', (ox - 1.5, oy - 9.0, oz + 3.2), 0, (ox, oy + 1.5, oz + 1.2))
    A['cam_hint_med'] = empty(c, 'cam_hint_med', (ox + 0.2, oy - 4.2, oz + 1.4), 0, (ox, oy, oz + 1.0))
    A['cam_hint_close'] = empty(c, 'cam_hint_close', (ox, oy - 2.2, oz + 1.1), 0, (ox, oy, oz + 1.05))
    A['cam_hint_low'] = empty(c, 'cam_hint_low', (ox + 1.5, oy - 3.0, oz + 0.3), 0, (ox, oy + 0.5, oz + 1.2))


def build_camp(c):
    o = ORIGIN['camp']; A = {}; _camp_dressing(c, A, o); _camp_anchors(c, o, A)
    for fo in _fire(c, A, o): fo.hide_render = True; fo.hide_viewport = True  # unlit pit by day
    return A


def _rain(c, o, seed=3):
    """stylised ink rain: three layers of thin white-blue streaks falling on a short seamless loop (keyed z cycle), slightly angled."""
    ox, oy, oz = o; rnd = random.Random(seed); mat = _look._fx_mat('rain_streak', (0.8, 0.93, 1.0), 1.0, 3.2) if _look else glow('rain_streak', (0.72, 0.88, 1.0), 1.5)
    for layer, (n, ln, spd, wd) in enumerate(((560, 1.4, 1.0, 0.008), (460, 1.0, 0.75, 0.0065), (360, 0.7, 0.55, 0.005))):
        bm = bmesh.new(); H = 9.0
        for i in range(n):
            x, y, z = ox + rnd.uniform(-10, 10), oy + rnd.uniform(-2.5, 10), oz + rnd.uniform(0, H)
            vs = [bm.verts.new(p) for p in ((x - wd, y, z + ln), (x + wd, y, z + ln), (x + wd + 0.12 * ln, y, z), (x - wd + 0.12 * ln, y, z))]
            bm.faces.new(vs)
        me = bpy.data.meshes.new(f'rain{layer}'); bm.to_mesh(me); bm.free(); me.materials.append(mat)
        r = bpy.data.objects.new(f'rain{layer}', me); c.objects.link(r); r.visible_shadow = False
        r.location = (0, 0, 0); r.keyframe_insert('location', index=2, frame=1)
        r.location = (-0.9 * spd, 0, -H); r.keyframe_insert('location', index=2, frame=1 + int(round(14 / spd)))   # fall one full column height per loop (wraps invisibly)
        r.location = (0, 0, 0)
        try: import chars as _ch
        except ImportError: from . import chars as _ch
        for fc in _ch._fcurves(r):
            for k in fc.keyframe_points: k.interpolation = 'LINEAR'
            fc.modifiers.new('CYCLES')


def _lightning(c, o, f0=1007):
    """2-frame lightning flash on 'thought' (33.56 s -> frame 1007): sky brightens + a cold sun pulse. Light value is x3.3 because scene.py scales night light energy by 0.3."""
    try: import chars as _ch
    except ImportError: from . import chars as _ch
    ld = bpy.data.lights.new('lightning', 'SUN'); ld.color = (0.78, 0.9, 1.0); ld.energy = 0.0
    lo = bpy.data.objects.new('lightning', ld); c.objects.link(lo); lo.rotation_euler = (math.radians(55), 0, math.radians(25))
    for f, v in ((f0 - 1, 0.0), (f0, 40.0), (f0 + 1, 40.0), (f0 + 2, 0.0)): ld.energy = v; ld.keyframe_insert('energy', frame=f)
    sm = bpy.data.materials.get('sky_night'); em = [n for n in sm.node_tree.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
    for f, v in ((f0 - 1, 1.0), (f0, 6.5), (f0 + 1, 6.5), (f0 + 2, 1.0)): em.inputs['Strength'].default_value = v; em.inputs['Strength'].keyframe_insert('default_value', frame=f)
    for idb in (ld, sm.node_tree):
        for fc in _ch._fcurves(idb):
            for k in fc.keyframe_points: k.interpolation = 'CONSTANT'


def build_night(c):
    global _NIGHT
    o = ORIGIN['night']; A = {}; _NIGHT = True
    try: _camp_dressing(c, A, o, True)
    finally: _NIGHT = False
    _camp_anchors(c, o, A)
    _fire(c, A, o); ox, oy, oz = o
    fl = light(c, 'firelight', 'POINT', (ox, oy + 2.5, oz + 1.0), 1400, (1.0, 0.5, 0.18), 0.4); flicker(fl, 1400)
    light(c, 'firefill', 'POINT', (ox, oy - 0.6, oz + 1.4), 350, (1.0, 0.55, 0.25), 0.8)
    A['firelight'] = c.objects['firelight']
    for x in (-4.6, 4.6): light(c, 'lanternlight', 'POINT', (ox + x, oy + 1.0, oz + 2.4), 120, (1, 0.7, 0.3), 0.2)
    A['moon'] = empty(c, 'moon', (ox - 15, oy + 45, oz + 25))
    _rain(c, o); _lightning(c, o)
    return A


def _crumbs(c, nm, pts):
    rnd = random.Random(9); parts = []
    for i, p in enumerate(pts):
        for k in range(4):
            parts.append(box(c, nm, (0.016, 0.014, 0.008), (p[0] + rnd.uniform(-0.06, 0.06), p[1] + rnd.uniform(-0.05, 0.05), p[2]), M('bread'), (0, 0, rnd.uniform(0, 3))))
    return join(parts, nm)


# ---------------------------------------------------------------- DUSK set: big Civil War army camp at sunset (instanced tents)
def _cannon(c, nm, loc, rot_z=0.0):
    ox, oy, oz = loc; ca, sa = math.cos(rot_z), math.sin(rot_z); R = lambda dx, dy, z: (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca, oz + z)
    parts = [beam(c, nm, R(-0.5, 0, 0.62), R(1.0, 0, 0.7), 0.17, M('iron'), 10), beam(c, nm, R(1.0, 0, 0.7), R(1.12, 0, 0.7), 0.21, M('iron'), 10), beam(c, nm, R(-0.5, 0, 0.55), R(-1.4, 0, 0.1), 0.05, M('wooddark'), 6)]
    for dy in (-0.42, 0.42): parts.append(cyl(c, nm, 0.5, 0.09, R(0, dy, 0.5), M('wooddark'), (math.pi / 2, 0, rot_z), 12))
    return inked(join(parts, nm), 0.012)


def _wagon(c, nm, loc, rot_z=0.0):
    ox, oy, oz = loc; ca, sa = math.cos(rot_z), math.sin(rot_z); R = lambda dx, dy, z: (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca, oz + z)
    parts = [box(c, nm, (2.6, 1.2, 0.3), R(0, 0, 0.85), M('crate'), (0, 0, rot_z), tile=0.8), sph(c, nm, 1.0, R(0, 0, 1.45), M('canvas'), (1.35, 0.62, 0.62), 12)]
    for dx in (-0.9, 0.9):
        for dy in (-0.68, 0.68): parts.append(cyl(c, nm, 0.55, 0.08, R(dx, dy, 0.55), M('wooddark'), (math.pi / 2, 0, rot_z), 12))
    return inked(join(parts, nm), 0.014)


def _campfire(c, nm, loc):
    ox, oy, oz = loc; parts = [beam(c, nm, (ox + 0.5 * math.cos(a), oy + 0.5 * math.sin(a), oz + 0.08), (ox - 0.15 * math.cos(a), oy - 0.15 * math.sin(a), oz + 0.3), 0.07, M('bark'), 6) for a in (0, 2.1, 4.2)]
    inked(join(parts, nm), 0.01)
    lathe(c, nm + 'f1', [(0.0, 0), (0.24, 0.03), (0.12, 0.55), (0.0, 0.95)], M('f_orange'), (ox, oy, oz + 0.2), seg=8, cap=False)
    lathe(c, nm + 'f2', [(0.0, 0), (0.13, 0.03), (0.07, 0.35), (0.0, 0.6)], M('f_yellow'), (ox, oy, oz + 0.2), seg=8, cap=False)
    light(c, nm + 'lt', 'POINT', (ox, oy, oz + 0.8), 300, (1.0, 0.55, 0.2), 0.4)


# ---------------------------------------------------------------- ROUND 11 surface detail (clean cartoon marks, own materials, no noise)
_DM = {}
def _dm(name, rgb):
    if name not in _DM: _DM[name] = toon_mat(name, rgb, None)
    return _DM[name]


def _surface_ground(c, o, tag, cols, avoid, area, n_t=380, n_p=70, n_f=30, patches=6, seed=77):
    """grass tufts (light+dark layers), pebble clusters, a few flower dots and soft dark turf patches on the big grass plane.
    cols = dict(tl, td, peb, flw, patch) rgb tuples; avoid = [(x, y, r)]; area = (x0, x1, y0, y1)."""
    ox, oy, oz = o; rnd = random.Random(seed); x0, x1, y0, y1 = area
    ok = lambda x, y: all(math.hypot(x - ax, y - ay) > ar for ax, ay, ar in avoid)
    bl, bd, bp, bf = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    for i in range(n_t):   # denser toward the camera side (low y)
        x = rnd.uniform(x0, x1); y = y0 + (y1 - y0) * rnd.random() ** 1.6
        if not ok(x, y): continue
        b = bl if rnd.random() < 0.55 else bd; h = rnd.uniform(0.22, 0.5)
        for k in range(5): _blade_tetra(b, (ox + x + rnd.uniform(-0.09, 0.09), oy + y + rnd.uniform(-0.09, 0.09), oz), h * rnd.uniform(0.55, 1.1), rnd.uniform(0.06, 0.2), rnd.uniform(0, 6.28), 0.04)
    for i in range(n_p // 3):   # pebble clusters of 2-4
        cx = rnd.uniform(x0, x1); cy = y0 + (y1 - y0) * rnd.random() ** 1.5
        if not ok(cx, cy): continue
        for k in range(rnd.randint(2, 4)):
            r_ = bmesh.ops.create_uvsphere(bp, u_segments=7, v_segments=5, radius=rnd.uniform(0.05, 0.13))
            bmesh.ops.scale(bp, vec=(1.25, 1.0, 0.6), verts=r_['verts']); bmesh.ops.translate(bp, vec=(ox + cx + rnd.uniform(-0.2, 0.2), oy + cy + rnd.uniform(-0.2, 0.2), oz + 0.02), verts=r_['verts'])
    for i in range(n_f):
        x = rnd.uniform(x0, x1); y = y0 + (y1 - y0) * rnd.random() ** 1.5
        if not ok(x, y): continue
        hh = rnd.uniform(0.15, 0.26); _blade_tetra(bl, (ox + x, oy + y, oz), hh, 0.02, rnd.uniform(0, 6.28), 0.012)
        r = bmesh.ops.create_uvsphere(bf, u_segments=6, v_segments=4, radius=0.05); bmesh.ops.scale(bf, vec=(1, 1, 0.5), verts=r['verts']); bmesh.ops.translate(bf, vec=(ox + x, oy + y, oz + hh), verts=r['verts'])
    for b, nm, col in ((bl, 'tl', cols['tl']), (bd, 'td', cols['td']), (bp, 'peb', cols['peb']), (bf, 'flw', cols['flw'])):
        if not b.faces: b.free(); continue
        b.normal_update(); bmesh.ops.recalc_face_normals(b, faces=b.faces); inked(_obj('sd_' + nm, b, _dm(f'sd_{tag}_{nm}', col), c, uv=False), 0.008)
    for i in range(patches):   # soft darker turf patches: flat ellipses = big calm shapes breaking the plane
        px = rnd.uniform(x0, x1); py = y0 + (y1 - y0) * rnd.random() ** 1.3
        if not ok(px, py): continue
        p_ = cyl(c, 'sd_patch', rnd.uniform(0.5, 1.1), 0.02, (ox + px, oy + py, oz + 0.008 + 0.002 * i), _dm(f'sd_{tag}_patch', cols['patch']), seg=18); p_.scale = (1, rnd.uniform(0.45, 0.7), 1)


def _surface_sky(c, o):
    ox, oy, oz = o; rnd = random.Random(19); m = _dm('sd_cloud_hi', (1.0, 0.9, 0.84)); m2 = _dm('sd_cloud_lo', (1.0, 0.8, 0.62))
    for i in range(7): cloud(c, f'sdcloud{i}', (ox - 85 + i * 28 + rnd.uniform(-6, 6), oy + rnd.uniform(78, 105), oz + rnd.uniform(20, 48)), rnd.uniform(6, 10), m)
    for i in range(6):   # long soft streaks near the horizon glow
        s_ = sph(c, f'sdstreak{i}', 1.0, (ox - 80 + i * 32 + rnd.uniform(-5, 5), oy + rnd.uniform(90, 110), oz + rnd.uniform(6, 22)), m2, (rnd.uniform(9, 15), 0.5, 0.9), 12)


def _surface_tent(c, o):
    ox, oy, oz = o; P = lambda x, y, z=0: (ox + x, oy + y, oz + z); rnd = random.Random(23)
    seam, hi, knot = _dm('sd_tf_seam', (0.13, 0.06, 0.03)), _dm('sd_tf_hi', (0.85, 0.58, 0.32)), _dm('sd_tf_knot', (0.2, 0.1, 0.05))
    for k in range(13):   # floor plank seams (run along X) + staggered butt joints + knots
        y = -2.5 + 0.5 * k
        box(c, 'sd_seam', (6.8, 0.025, 0.01), P(0, y, 0.005), seam); box(c, 'sd_hi', (6.8, 0.012, 0.008), P(0, y + 0.03, 0.005), hi)
        for j in range(2): box(c, 'sd_joint', (0.025, 0.5, 0.01), P(-2.2 + 2.6 * j + 0.7 * (k % 3) - 0.6, y + 0.25, 0.005), seam)
        if rnd.random() < 0.6: cyl(c, 'sd_knot', rnd.uniform(0.03, 0.05), 0.008, P(rnd.uniform(-3.2, 3.2), y + 0.25, 0.006), knot, seg=10)
    rc, rd = _dm('sd_rug_cream', (0.93, 0.8, 0.58)), _dm('sd_rug_dark', (0.42, 0.08, 0.1))   # rug border stripes + fringe
    for dx, dy, sx_, sy_ in ((0, 1.2, 3.0, 0.1), (0, -0.8, 3.0, 0.1), (-1.45, 0.2, 0.1, 2.2), (1.45, 0.2, 0.1, 2.2)): box(c, 'sd_rugb', (sx_, sy_, 0.006), P(dx, dy, 0.036), rc)
    for dx, dy, sx_, sy_ in ((0, 1.0, 2.7, 0.06), (0, -0.6, 2.7, 0.06), (-1.3, 0.2, 0.06, 1.6), (1.3, 0.2, 0.06, 1.6)): box(c, 'sd_rugi', (sx_, sy_, 0.006), P(dx, dy, 0.04), rd)
    for i in range(14):
        for sg in (-1, 1): box(c, 'sd_fringe', (0.03, 0.14, 0.01), P(-1.4 + i * 0.215, 0.2 + sg * 1.17, 0.02), rc)
    rb = _dm('sd_cv_rib', (0.38, 0.33, 0.3))
    for side in (-1, 1):   # canopy: thin dark ribs hugging the sagging surface between the existing seams (odd rows)
        for j in (1, 3, 5, 7, 9):
            pts = []
            for i in range(0, 7):
                u = i / 6.0; z_ = 4.0 - u - 0.22 * math.sin(math.pi * u) * math.sin(math.pi * j / 10) - 0.03
                pts.append(P(side * 3.7 * u, -2.8 + 6.3 * j / 10, z_))
            for a_, b_ in zip(pts, pts[1:]): beam(c, 'sd_rib', a_, b_, 0.016, rb, 4)
    ws, wf, wh = _dm('sd_cv_seam', (0.4, 0.35, 0.31)), _dm('sd_cv_fold', (0.58, 0.52, 0.48)), _dm('sd_cv_stitch', (0.3, 0.26, 0.23))
    for k in range(-2, 3):   # back wall: vertical seams + stitches + drape wrinkles, flush on the canvas
        x = k * 1.4
        box(c, 'sd_wseam', (0.035, 0.012, 3.0), P(x, 3.318, 1.5), ws)
        for z in [0.3 + 0.2 * i for i in range(14)]: box(c, 'sd_stitch', (0.012, 0.012, 0.09), P(x + 0.05, 3.314, z), wh)
        for t in range(2): box(c, 'sd_fold', (0.05, 0.012, rnd.uniform(0.9, 1.5)), P(x + 0.7 + rnd.uniform(-0.2, 0.2), 3.316, 1.9 + 0.5 * t + rnd.uniform(-0.1, 0.1)), wf, (0, rnd.uniform(-0.3, 0.3), 0))
    for sx in (-1, 1):   # side walls: horizontal sag wrinkles + seams
        for z in (0.9, 1.5, 2.1, 2.7): box(c, 'sd_sfold', (0.012, 2.4 + rnd.uniform(0, 1.2), 0.04), P(sx * 3.42, rnd.uniform(-0.6, 0.6), z), wf, (rnd.uniform(-0.05, 0.05), 0, 0))
        for yy in (-1.1, 1.1): box(c, 'sd_sseam', (0.012, 0.035, 3.0), P(sx * 3.42, yy, 1.5), ws)


def build_dusk(c):
    global _DUSK
    _DUSK = True
    try: return _build_dusk(c)
    finally: _DUSK = False


def _build_dusk(c):
    o = ORIGIN['dusk']; ox, oy, oz = o; A = {}; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    st = [(0.0, (1.0, 0.8, 0.5)), (0.12, (1.0, 0.66, 0.44)), (0.36, (0.82, 0.66, 0.74)), (0.68, (0.46, 0.54, 0.8)), (1.0, (0.3, 0.38, 0.68))]
    d = sph(c, 'skydome', 140.0, (ox, oy, oz), sky_mat('sky_dusk', st, 140.0), (1, 1, 1), 24); d.visible_shadow = False
    sph(c, 'sundisc', 8.0, P(14, 118, 5), glow('sundisc', (1.0, 0.82, 0.5), 3.0), (1, 1, 1), 16)
    rnd = random.Random(15)
    for i in range(8): cloud(c, f'cloud{i}', P(-90 + i * 24 + rnd.uniform(-6, 6), rnd.uniform(75, 110), rnd.uniform(8, 30)), rnd.uniform(5, 8), M('cloud_d'))
    hills(c, o, False)
    hz = _look._fx_mat('dusk_haze', (1.0, 0.76, 0.58), 0.38, 1.0) if _look else None   # warm haze band in front of the far hills
    bpy.ops.mesh.primitive_plane_add(size=1); hp = bpy.context.object; hp.name = 'dusk_haze'; hp.scale = (320, 22, 1); hp.location = P(0, 100, 7); hp.rotation_euler = (math.radians(90), 0, 0); hp.visible_shadow = False
    if hz: hp.data.materials.append(hz)
    for c_old in list(hp.users_collection): c_old.objects.unlink(hp)
    c.objects.link(hp)
    box(c, 'ground', (180, 150, 0.4), P(0, 45, -0.2), M('grass'), tile=4.0)
    for r_, (x, y, rr) in enumerate(((0, 0.5, 3.6), (-3.0, 5.5, 2.4), (3.2, 5.0, 2.2))):
        p_ = cyl(c, 'dirtpatch', rr, 0.05, P(x, y, 0.01 + 0.002 * r_), M('grass_l'), seg=20, tile=4.0); p_.scale = (1, 0.75, 1)
    _dep_trees(c, o, False)
    # rows of tents receding to the horizon: two linked-duplicate bases (shared mesh) so 60+ tents cost one mesh each
    bases = [tent(c, 'dtentA', P(0, -60), 0.0, 3.0, 3.6, 2.0, M('canvas_w')), tent(c, 'dtentB', P(0, -60), 0.0, 3.0, 3.6, 2.0, M('canvas'))]
    for b_ in bases: b_.hide_render = True
    n = 0
    for r_ in range(7):
        y = 8.0 + r_ * 7.5
        for k in range(-5, 6):
            x = k * 5.3 + (r_ % 2) * 2.65 + rnd.uniform(-0.4, 0.4)
            if abs(x) < 3.5 and r_ < 2: continue
            t_ = bases[(k + r_) % 2].copy(); c.objects.link(t_); t_.hide_render = False; n += 1
            t_.location = P(x, y + rnd.uniform(-0.5, 0.5)); t_.rotation_euler = (0, 0, rnd.uniform(-0.12, 0.12))
    for i, (x, y, rot) in enumerate(((-6.5, -0.5, -0.4), (6.8, 0.0, 3.4), (-11.0, 4.0, -0.2), (11.5, 3.5, 3.3))): _cannon(c, f'cannon{i}', P(x, y), rot)
    for i, (x, y, rot) in enumerate(((-8.5, 2.5, 0.3), (9.0, 2.0, -0.4), (-13.5, 9.0, 0.1))): _wagon(c, f'wagon{i}', P(x, y), rot)
    for i, (x, y) in enumerate(((-4.2, 3.8), (4.4, 4.0), (-1.0, 9.5), (6.0, 12.0), (-7.0, 12.5))):
        _campfire(c, f'cfire{i}', P(x, y))
        for k in range(5): inked(sph(c, 'smoke', 0.28 + 0.1 * k, P(x + 0.12 * k * (1 if i % 2 else -1), y, 1.2 + 0.7 * k), M('smoke'), (1, 1, 0.85), 8, 0.1, k), 0.02)   # mid-ground campfire smoke columns
    ft = bases[0].copy(); c.objects.link(ft); ft.hide_render = False; ft.location = P(-5.6, -6.8); ft.rotation_euler = (0, 0, 0.7); ft.scale = (1.5, 1.5, 1.5)   # foreground tent corner for depth
    _flag_line(c, 'fline_d', P(-15, 5.5, 3.6), P(15, 5.5, 3.6), 0.6, 16)
    for x in (-15, 15): inked(beam(c, 'fpost', P(x, 5.5, 0), P(x, 5.5, 3.8), 0.07, M('wooddark')), 0.015)
    flag(c, 'flagd1', P(-2.5, 14.0), 5.0); flag(c, 'flagd2', P(5.5, 22.0), 5.0)
    rifles(c, 'rifd1', P(-4.5, -2.2), 1.0); rifles(c, 'rifd2', P(4.5, -1.8), 1.0)
    for lx, ly in ((-9.0, -3.0), (8.5, -2.5)):
        for i in range(5): inked(beam(c, 'wlog', P(lx, ly + (i % 3) * 0.2, 0.09 + 0.15 * (i // 3)), P(lx + 1.2, ly + (i % 3) * 0.2 + 0.05, 0.11 + 0.15 * (i // 3)), 0.075, M('bark'), 7), 0.01)
    barrel(c, 'dbarrel1', P(-6.0, 2.2), 1.0); barrel(c, 'dbarrel2', P(6.0, 2.0), 1.0); crate(c, 'dcrate1', P(-5.2, 2.6), (0.8, 0.8, 0.7), (0, 0, 0.3))
    A['marcel_spot'] = empty(c, 'marcel_spot', P(-1.0, -0.4), 0.0)
    A['soldier_row'] = empty(c, 'soldier_row', P(0, 2.0), 0.0)
    for i, x in enumerate((-1.8, 0.0, 1.8)): A[f'soldier_row_{i + 1}'] = empty(c, f'soldier_row_{i + 1}', P(x, 2.0), 0.0)
    A['cam_hint_wide'] = empty(c, 'cam_hint_wide', P(0, -9.0, 2.2), 0, P(0, 12.0, 2.0))
    A['cam_hint_med'] = empty(c, 'cam_hint_med', P(0.4, -4.2, 1.3), 0, P(0, 1.0, 1.1))
    _surface_ground(c, o, 'd', dict(tl=(0.36, 0.44, 0.14), td=(0.1, 0.2, 0.1), peb=(0.5, 0.46, 0.5), flw=(1.0, 0.8, 0.45), patch=(0.18, 0.28, 0.1)), [(-1, -0.4, 0.9), (-1.8, 2, 0.7), (0, 2, 0.7), (1.8, 2, 0.7), (-4.2, 3.8, 1.0), (4.4, 4, 1.0), (-4.5, -2.2, 0.8), (4.5, -1.8, 0.8), (-5.6, -6.8, 2.3), (-6.5, -0.5, 1.2), (6.8, 0, 1.2)], (-9, 9, -5.8, 8), n_t=1100, n_p=150, n_f=50, patches=14, seed=78)
    _surface_sky(c, o)
    return A


def build_insert(c, props):
    o = ORIGIN['insert']; ox, oy, oz = o; A = {}; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    # big tabletop of planks + chunky legs, with cloth strip and dressing behind
    box(c, 'tabletop', (3.2, 1.8, 0.12), P(0, 0.2, 0.74), M('deck'), tile=0.8); inked(c.objects[-1], 0.01)
    box(c, 'tablefront', (3.2, 0.1, 0.18), P(0, -0.7, 0.66), M('wooddark'))
    for x in (-1.5, 1.5):
        for y in (-0.55, 0.95): box(c, 'tleg', (0.14, 0.14, 0.74), P(x, y, 0.37), M('wooddark'))
    box(c, 'floor', (24, 18, 0.2), P(0, 4, -0.1), M('deck'), tile=1.5)
    box(c, 'backwall', (24, 0.3, 6), P(0, 7.5, 3), M('wooddark'), tile=1.5)
    # ledger / cloth
    box(c, 'cloth', (1.6, 0.9, 0.012), P(-0.1, 0.15, 0.81), M('canvas'), (0, 0, 0.08), tile=1.0)
    # background dressing (blurred by DOF)
    barrel(c, 'ibarrel1', P(-2.6, 3.3), 1.3); barrel(c, 'ibarrel2', P(-1.5, 3.8), 1.2); barrel(c, 'ibarrel3', P(-2.2, 3.3, 1.2), 1.0)
    crate(c, 'icrate1', P(2.3, 3.4), (1.4, 1.2, 1.2)); crate(c, 'icrate2', P(2.8, 3.3, 1.2), (0.9, 0.9, 0.8), (0, 0, 0.3))
    sack(c, 'isack1', P(0.6, 3.4), 1.5); sack(c, 'isack2', P(1.3, 3.2), 1.3, rot_z=1)
    shelf = box(c, 'shelf', (3.0, 0.4, 0.1), P(0.3, 6.9, 2.5), M('wooddark'))
    for i in range(6): cyl(c, 'jar', 0.14, 0.32, P(-0.9 + i * 0.35, 6.9, 2.71), M('brass' if i % 2 else 'red'), seg=10, smooth=True)
    lantern(c, 'ilantern', P(-1.35, 0.6, 0.8), 1.7); lantern(c, 'ilantern2', P(3.0, 6.7, 2.0), 1.8)
    rope(c, 'irope', P(-4, 7.2, 3.2), P(4, 7.2, 3.4), 0.7, 0.03, M('rope'), 10)
    # table clutter
    pot(c, 'ipot', P(1.35, 0.55, 0.8), 0.9); rock(c, 'irock', P(-1.45, -0.3, 0.8), 0.14, 5)
    # WORLD detail: folded rag (not named cloth: scene.py hides that), crumbs, a nick-board
    box(c, 'rag_i', (0.42, 0.3, 0.02), P(1.1, -0.35, 0.82), M('cloth'), (0, 0, 0.35), tile=0.5); inked(c.objects[-1], 0.006)
    box(c, 'rag_i2', (0.4, 0.28, 0.02), P(1.12, -0.34, 0.84), M('cloth'), (0, 0, 0.5), tile=0.5)
    _crumbs(c, 'crumbs_i', [P(-0.45, -0.5, 0.805), P(0.15, -0.5, 0.805), P(-0.95, 0.05, 0.805), P(0.9, 0.15, 0.805)])
    light(c, 'ilamp', 'POINT', P(-1.35, 0.6, 1.3), 150, (1, 0.7, 0.3), 0.2)
    A['table'] = empty(c, 'table', P(0, 0.2, 0.80))
    A['can_spot'] = empty(c, 'can_spot', P(-0.1, 0.25, 0.81)); A['card_spot'] = empty(c, 'card_spot', P(-0.55, -0.3, 0.81), 0.0)
    A['chisel_spot'] = empty(c, 'chisel_spot', P(0.5, -0.25, 0.81)); A['hammer_spot'] = empty(c, 'hammer_spot', P(0.75, 0.3, 0.81))
    A['opener_spot'] = empty(c, 'opener_spot', P(-0.8, 0.45, 0.81))
    A['scale_spot'] = empty(c, 'scale_spot', P(0.25, 0.8, 0.81)); A['food_spot'] = empty(c, 'food_spot', P(-1.15, -0.1, 0.81))
    A['marcel_spot'] = empty(c, 'marcel_spot', P(-0.8, 1.9, 0), math.pi); A['gaston_spot'] = empty(c, 'gaston_spot', P(0.8, 1.9, 0), math.pi)
    A['cam_hint_wide'] = empty(c, 'cam_hint_wide', P(0.6, -2.4, 1.7), 0, P(0, 0.3, 0.9))
    A['cam_hint_med'] = empty(c, 'cam_hint_med', P(0.1, -1.0, 1.25), 0, P(0, 0.25, 0.85))
    A['cam_hint_macro'] = empty(c, 'cam_hint_macro', P(-0.1, -0.35, 1.0), 0, P(-0.1, 0.25, 0.9))
    A['cam_hint_top'] = empty(c, 'cam_hint_top', P(-0.1, 0.2, 1.7), 0, P(-0.1, 0.25, 0.81))
    return A


def _sag_canopy(c, o):
    ox, oy, oz = o; nx, ny = 6, 10; bm = bmesh.new()
    for side in (-1, 1):
        g = [[bm.verts.new((ox + side * 3.7 * i / nx, oy - 2.8 + 6.3 * j / ny, oz + 4.0 - 1.0 * i / nx - 0.22 * math.sin(math.pi * i / nx) * math.sin(math.pi * j / ny))) for j in range(ny + 1)] for i in range(nx + 1)]
        for i in range(nx):
            for j in range(ny): bm.faces.new((g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]) if side > 0 else (g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j]))
    for f in bm.faces: f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cn = _obj('canopy', bm, M('canvas_w'), c, smooth=True, tile=1.2)
    for j in range(0, ny + 1, 2): beam(c, 'canopyseam', (ox - 3.7, oy - 2.8 + 6.3 * j / ny, oz + 3.0), (ox, oy - 2.8 + 6.3 * j / ny, oz + 3.97), 0.012, M('canvas_d'), 4); beam(c, 'canopyseam', (ox + 3.7, oy - 2.8 + 6.3 * j / ny, oz + 3.0), (ox, oy - 2.8 + 6.3 * j / ny, oz + 3.97), 0.012, M('canvas_d'), 4)


def build_tent(c):
    o = ORIGIN['tent']; ox, oy, oz = o; A = {}; P = lambda x, y, z=0: (ox + x, oy + y, oz + z)
    box(c, 'tfloor', (7, 6, 0.2), P(0, 0.5, -0.1), M('deck'), tile=1.2)
    box(c, 'trug', (3.0, 2.2, 0.03), P(0, 0.2, 0.02), M('red'), tile=1.0)
    # canvas walls (back, left, right), sloped canopy overhead, open toward -Y camera
    box(c, 'bwall', (7.2, 0.15, 3.0), P(0, 3.4, 1.5), M('canvas_w'), tile=1.4)
    for sx in (-1, 1):
        w = box(c, 'swall', (0.15, 6.0, 3.0), P(sx * 3.5, 0.4, 1.5), M('canvas_w'), tile=1.4)
        for yy in (-2.2, 0.0, 2.2): box(c, 'seam', (0.2, 0.05, 3.0), P(sx * 3.4, yy, 1.5), M('canvas_d'))
        box(c, 'cornerdark', (0.3, 1.6, 3.0), P(sx * 3.35, 2.8, 1.5), M('canvas_d'))
    _sag_canopy(c, o); bm = bmesh.new(); vs = [bm.verts.new(p) for p in ((ox - 3.7, oy - 2.8, oz + 3.0), (ox + 3.7, oy - 2.8, oz + 3.0), (ox + 3.7, oy + 3.5, oz + 3.0), (ox - 3.7, oy + 3.5, oz + 3.0), (ox, oy - 2.8, oz + 4.0), (ox, oy + 3.5, oz + 4.0))]
    bm.faces.new([vs[3], vs[5], vs[2]]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); _obj('gable', bm, M('canvas_w'), c, tile=1.2)
    for x in (-3.5, 3.5): beam(c, 'tpole', P(x, -2.7), P(x, -2.7, 3.2), 0.07, M('wooddark')); beam(c, 'tpole', P(x, 3.3), P(x, 3.3, 3.2), 0.07, M('wooddark'))
    beam(c, 'tridge', P(0, -2.8, 4.0), P(0, 3.5, 4.0), 0.06, M('wooddark'))
    # galley cabinet along the back with counter (like the reference kitchen)
    box(c, 'cabinet', (5.0, 0.8, 0.9), P(0, 2.9, 0.45), M('wooddark'), tile=0.8); inked(c.objects[-1], 0.015)
    box(c, 'counter', (5.2, 0.95, 0.1), P(0, 2.9, 0.95), M('deck'), tile=0.8); inked(c.objects[-1], 0.015)
    for x in (-1.9, -0.65, 0.65, 1.9): box(c, 'cabdoor', (1.0, 0.04, 0.7), P(x, 2.49, 0.45), M('crate')); box(c, 'knob', (0.05, 0.05, 0.05), P(x + 0.35, 2.46, 0.5), M('brass'))
    # wall shelves with jars
    for z in (1.7, 2.35):
        box(c, 'wshelf', (3.6, 0.35, 0.08), P(-0.8, 3.15, z), M('wooddark'))
        for i in range(8):
            m = (M('brass'), M('red'), M('blue'))[i % 3]; cyl(c, 'jar', 0.13, 0.3, P(-2.3 + i * 0.44, 3.15, z + 0.19), m, seg=10, smooth=True)
    # hanging pans + ladles on the back wall, cooked porthole-like round window
    for i, x in enumerate((1.5, 2.1, 2.7)):
        beam(c, 'hook', P(x, 3.2, 2.6), P(x, 3.2, 2.0), 0.012, M('iron'))
        cyl(c, 'panh', 0.2, 0.04, P(x, 3.18, 1.82), M('iron'), (math.pi / 2, 0, 0), 14); inked(c.objects[-1], 0.01)
    win = cyl(c, 'window', 0.5, 0.1, P(-2.5, 3.3, 1.7), M('brass'), (math.pi / 2, 0, 0), 20); inked(win, 0.02)
    cyl(c, 'windowglass', 0.4, 0.1, P(-2.5, 3.26, 1.7), M('lampglow'), (math.pi / 2, 0, 0), 20)
    # the cook table in front (center-right) with pot, ladle, bowls
    box(c, 'ttable', (1.9, 1.0, 0.1), P(0.2, 0.3, 0.95), M('deck'), tile=0.8); inked(c.objects[-1], 0.015)
    for x in (-0.65, 1.05):
        for y in (-0.1, 0.7): box(c, 'ttleg', (0.12, 0.12, 0.92), P(x, y, 0.46), M('wooddark'))
    pot(c, 'tpot', P(-0.45, 0.35, 1.0), 1.3)
    bowl = lathe(c, 'bowl', [(0.0, 0), (0.1, 0), (0.17, 0.08), (0.17, 0.1), (0.0, 0.1)], M('cream'), P(0.95, 0.15, 1.0), seg=14); inked(bowl, 0.01)
    big = pot(c, 'bigpot', P(-2.2, 0.8, 0), 2.2)
    barrel(c, 'tbarrel1', P(2.7, 1.3), 1.1); barrel(c, 'tbarrel2', P(2.9, 0.3), 1.0)
    crate(c, 'tcrate1', P(-2.7, 2.0), (1.0, 0.9, 0.8)); crate(c, 'tcrate2', P(-2.7, 2.0, 0.8), (0.7, 0.7, 0.6), (0, 0, 0.3))
    sack(c, 'tsack1', P(1.6, 2.1), 1.3); sack(c, 'tsack2', P(2.2, 2.0), 1.1, rot_z=1); sack(c, 'tsack3', P(-1.2, 2.1), 1.0)
    lantern(c, 'tlantern', P(1.0, 0.7, 1.0), 1.6)
    box(c, 'board', (0.5, 0.3, 0.04), P(0.35, 0.1, 1.07), M('crate'), (0, 0, 0.2)); inked(c.objects[-1], 0.008)
    for i, (dx, dy) in enumerate(((0.22, 0.1), (0.38, 0.05), (0.3, 0.2))):
        inked(sph(c, 'onion', 0.07, P(dx + 0.1, dy, 1.16), M('onion' if i != 1 else 'cream'), (1, 1, 0.9), 8), 0.006)
        cyl(c, 'onionTip', 0.008, 0.06, P(dx + 0.1, dy, 1.25), M('reed'), seg=4)
    inked(sph(c, 'bread', 0.15, P(0.65, 0.55, 1.12), M('bread'), (1.6, 0.8, 0.7), 10, 0.03, 4), 0.01)
    # hanging lantern from ridge, rope bunting
    beam(c, 'hang', P(0.0, 0.8, 4.0), P(0.0, 0.8, 3.1), 0.01, M('iron')); lantern(c, 'tlantern2', P(0.0, 0.8, 2.75), 1.7)
    rope(c, 'trope', P(-3.5, -1.5, 3.3), P(3.5, -1.5, 3.3), 0.5, 0.025, M('rope'), 10)
    for i, x in enumerate((-2.4, -1.4, -0.4, 0.6)):  # garlic / sausage strings
        beam(c, 'str', P(x, -1.5, 3.2), P(x, -1.5, 2.6), 0.012, M('rope'))
        sph(c, 'sausage', 0.11, P(x, -1.5, 2.55), M('red' if i % 2 else 'cream'), (1, 1, 1.5), 8)
    box(c, 'rag_t', (0.7, 0.9, 0.012), P(0.2, 0.3, 1.006), M('cloth'), (0, 0, 0.05), tile=0.7)  # checked cloth under the can
    _crumbs(c, 'crumbs_t', [P(0.85, 0.5, 1.01), P(-0.1, 0.0, 1.01), P(0.95, -0.1, 1.01)])
    beam(c, 'tladle', P(1.9, 3.2, 2.2), P(2.1, 3.1, 1.6), 0.015, M('iron')); cyl(c, 'tladleb', 0.06, 0.04, P(2.1, 3.1, 1.58), M('iron'), seg=10)
    light(c, 'tlight1', 'POINT', P(0.0, 0.8, 2.7), 550, (1.0, 0.66, 0.28), 0.3)
    light(c, 'tlight2', 'POINT', P(1.0, 0.7, 1.4), 220, (1.0, 0.7, 0.3), 0.15)
    A['table'] = empty(c, 'table', P(0.2, 0.3, 1.0)); A['can_spot'] = empty(c, 'can_spot', P(0.5, 0.3, 1.0))
    A['marcel_spot'] = empty(c, 'marcel_spot', P(-1.5, -0.7, 0), -math.pi / 4); A['gaston_spot'] = empty(c, 'gaston_spot', P(1.4, 0.0, 0), math.pi / 2 + 0.5)
    A['cam_hint_wide'] = empty(c, 'cam_hint_wide', P(0, -4.6, 1.8), 0, P(0, 0.5, 1.4))
    A['cam_hint_med'] = empty(c, 'cam_hint_med', P(0.2, -2.6, 1.5), 0, P(0, 0.3, 1.2))
    A['cam_hint_close'] = empty(c, 'cam_hint_close', P(0.3, -1.4, 1.35), 0, P(0.4, 0.3, 1.1))
    _surface_tent(c, o)
    return A


# ---------------------------------------------------------------- props
def _shape(o, name, fn):
    if not o.data.shape_keys: o.shape_key_add(name='Basis')
    k = o.shape_key_add(name=name)
    for i, v in enumerate(o.data.vertices): k.data[i].co = fn(v.co.copy())
    return k


_PROPS = None
def build_props():
    """Props stashed at x=-300 in collection 'props'; build_sets() arranges them on the insert table / camp."""
    global _PROPS
    if _PROPS and all(o.name in bpy.data.objects for o in _PROPS.values()): return _PROPS
    ensure_textures(); c = newcoll('props'); S = STASH; P = lambda x=0, y=0, z=0: (S[0] + x, S[1] + y, S[2] + z)
    pr = {}
    # --- can (origin at base centre, radius .12, h .22). rim ring + body + label band
    can = lathe(c, 'can', [(0.0, 0), (0.115, 0), (0.12, 0.01), (0.12, 0.205), (0.1, 0.212), (0.0, 0.212)], M('tin'), P(), seg=32, tile=0.3)
    # label: a second, slightly wider band with a text image; seg 32 around, UV by angle
    band = lathe(c, 'canband', [(0.1215, 0.04), (0.1215, 0.17)], M('canlabel'), P(), seg=32, cap=False)
    bm = bmesh.new(); bm.from_mesh(band.data); uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            a = math.atan2(l.vert.co.y, l.vert.co.x) / (2 * math.pi) + 0.5; l[uv].uv = (a * 2, 0 if l.vert.co.z < 0.1 else 1)
    bm.to_mesh(band.data); bm.free()
    can = join([can, band], 'can')
    # hold the dent: push verts on +X side (the chisel/hammer side) inward, with falloff
    def dent(co):
        w = max(0.0, co.x / 0.12) ** 2 * max(0.0, 1 - abs(co.z - 0.11) / 0.1)
        co.x -= 0.05 * w; co.z -= 0.012 * w; return co
    _shape(can, 'dent', dent); inked(can, 0.008)
    pr['can'] = can
    lid = lathe(c, 'lid', [(0.0, 0), (0.12, 0), (0.125, 0.008), (0.1, 0.012), (0.0, 0.012)], M('steel'), P(0.4), seg=32); inked(lid, 0.006)
    pr['lid'] = lid
    # --- crate (hero prop, 0.5 m)
    # --- crate (hero prop, 0.7 m): OPEN-TOP plank crate with plank gaps, a stencilled front, a lid slat for the hero can and 6 decorative SALTED BEEF cans inside.
    # origin kept at mid-height like the old crate(); mesh z spans -0.3..0.3 (lz converts a height above the base to local z). Cans are joined in (not a child) because scene.py only hides/shows P[...] objects.
    lz = lambda h: h - 0.3
    parts = [box(c, 'cr_floor', (0.64, 0.64, 0.03), (0, 0, lz(0.295)), M('crate'), tile=0.6), box(c, 'cr_base', (0.7, 0.7, 0.03), (0, 0, lz(0.015)), M('wooddark'), tile=0.6)]
    for h in (0.1, 0.3, 0.5):
        for sy in (-1, 1): parts.append(box(c, 'cr_pf', (0.7, 0.03, 0.18), (0, sy * 0.335, lz(h + 0.0)), M('crate'), tile=0.7))
        for sx in (-1, 1): parts.append(box(c, 'cr_ps', (0.03, 0.64, 0.18), (sx * 0.335, 0, lz(h)), M('crate'), tile=0.7))
    for sx in (-1, 1):
        for sy in (-1, 1): parts.append(box(c, 'cr_post', (0.055, 0.055, 0.6), (sx * 0.34, sy * 0.34, lz(0.3)), M('wooddark')))
    parts.append(box(c, 'cr_slat', (0.7, 0.16, 0.025), (0, 0, lz(0.6125)), M('crate'), tile=0.5))
    bmq = bmesh.new(); uvq = bmq.loops.layers.uv.verify(); x0, x1, z0, z1 = -0.25, 0.25, lz(0.3) - 0.08, lz(0.3) + 0.08; yq = -0.3515
    fq = bmq.faces.new([bmq.verts.new(p_) for p_ in ((x0, yq, z0), (x0, yq, z1), (x1, yq, z1), (x1, yq, z0))])
    if fq.normal.y > 0: fq.normal_flip()
    for l_ in fq.loops: l_[uvq].uv = ((l_.vert.co.x - x0) / 0.5, (l_.vert.co.z - z0) / 0.16)
    parts.append(_obj('cr_stencil', bmq, M('cratestencil'), c, uv=False))
    for i, (cx, cy) in enumerate(((-0.2, -0.2), (0.0, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.0, 0.2), (0.2, 0.2))):
        sc_ = 0.8; rz = i * 1.7; lc = (cx, cy, lz(0.31))
        parts.append(lathe(c, 'cr_can', [(0.0, 0), (0.115, 0), (0.12, 0.01), (0.12, 0.205), (0.1, 0.212), (0.0, 0.212)], M('tin'), lc, (0, 0, rz), seg=14, scale=(sc_, sc_, sc_), tile=0.3))
        bd = lathe(c, 'cr_band', [(0.1215, 0.04), (0.1215, 0.17)], M('canlabel'), lc, (0, 0, rz), seg=14, cap=False, scale=(sc_, sc_, sc_))
        bm = bmesh.new(); bm.from_mesh(bd.data); uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops: l[uv].uv = ((math.atan2(l.vert.co.y, l.vert.co.x) / (2 * math.pi) + 0.5) * 2, 0 if l.vert.co.z < 0.1 else 1)
        bm.to_mesh(bd.data); bm.free(); parts.append(bd)
    cr_ = join(parts, 'crate'); cr_.location = P(1.0); inked(cr_, 0.012); pr['crate'] = cr_
    # --- label card (readable): thin slab, front face (-Y) textured
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(0.5, 0.012, 0.32), verts=bm.verts); bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if f.calc_center_median().y < -0.005:
            f.material_index = 1
            for l in f.loops: l[uv].uv = (l.vert.co.x * 2 + 0.5, l.vert.co.z * 3.125 + 0.5)  # verts are +-0.25 x +-0.16
        else:
            for l in f.loops: l[uv].uv = (0.5, 0.5)
    me = bpy.data.meshes.new('label_card'); bm.to_mesh(me); bm.free()
    card = bpy.data.objects.new('label_card', me); c.objects.link(card); card.location = P(1.6, 0, 0.32)
    me.materials.append(M('paper')); me.materials.append(M('cardtext'))
    pr['label_card'] = card
    # card stays flat on the table when arranged (rotated -75 deg back on a prop stand), see arrange
    # --- chisel
    blade = box(c, 'cblade', (0.03, 0.012, 0.16), P(0, 0, 0.08), M('steel')); handle = cyl(c, 'chandle', 0.022, 0.12, P(0, 0, 0.22), M('wooddark'), seg=8)
    cap = cyl(c, 'ccap', 0.026, 0.015, P(0, 0, 0.285), M('iron'), seg=8)
    ch = join([blade, handle, cap], 'chisel'); inked(ch, 0.006); pr['chisel'] = ch
    # --- hammer (head in +X, long handle along Z)
    hh = cyl(c, 'hhandle', 0.02, 0.3, P(0, 0, 0.15), M('wooddark'), seg=8)
    head = box(c, 'hhead', (0.12, 0.05, 0.05), P(0, 0, 0.3), M('iron')); face = box(c, 'hface', (0.025, 0.06, 0.06), P(0.07, 0, 0.3), M('steel'))
    ham = join([hh, head, face], 'hammer'); inked(ham, 0.007); pr['hammer'] = ham
    # --- 1858 Warner lever opener: dark wooden handle (~60% of length), grey-blue steel neck + guard, sickle blade hooking down at the tip.
    # origin = blade tip, lies flat (blade/neck/handle along +X, hook toward +Y... drawn in the XY plane), overall length 0.28 = 1.3 x can height.
    steel = M('opsteel'); R, w0, w1, t, n = 0.04, 0.006, 0.03, 0.02, 14
    bm = bmesh.new(); rows = []
    for i in range(n + 1):
        th = math.radians(-90 + 90 * i / n); u = i / n; wd = w0 + (w1 - w0) * u
        cx, cy = 0.0 + R * math.cos(th), R + R * math.sin(th)
        nx, ny = math.cos(th), math.sin(th)       # outward normal of the arc
        po, pi_ = (cx + nx * wd * 0.0, cy + ny * wd * 0.0), (cx - nx * wd, cy - ny * wd)   # outer edge on the arc, inner edge inside
        rows.append([bm.verts.new((po[0], po[1], z)) for z in (0, t)] + [bm.verts.new((pi_[0], pi_[1], z)) for z in (0, t)])
    for a_, b_ in zip(rows, rows[1:]):
        for i, j in ((0, 1), (1, 3), (3, 2), (2, 0)): bm.faces.new((a_[i], a_[j], b_[j], b_[i]))
    bm.faces.new(rows[0][::-1][:]) if False else None
    bm.faces.new([rows[0][0], rows[0][2], rows[0][3], rows[0][1]]); bm.faces.new([rows[-1][0], rows[-1][1], rows[-1][3], rows[-1][2]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    blade = _obj('opener_blade', bm, steel, c, P(2.0), smooth=False, tile=0.2)
    X = lambda x, y=R, z=0.03: P(2.0 + x, y, z)
    neck = beam(c, 'oneck', X(R), X(0.11), 0.016, steel, 8)
    guard = box(c, 'oguard', (0.02, 0.11, 0.06), X(0.11), M('iron'))
    hm = toon_mat('ophandle', (0.2, 0.1, 0.05))   # matte opaque dark wood
    for nd in hm.node_tree.nodes:
        if nd.bl_idname == 'ShaderNodeMapRange' and abs(nd.inputs['To Max'].default_value - 0.5) < 1e-4: nd.inputs['To Max'].default_value = 0.0   # no fresnel rim strip
    handle = cyl(c, 'ohandle', 0.048, 0.16, X(0.2), hm, (0, math.pi / 2, 0), 12)
    cap = sph(c, 'ocap', 0.048, X(0.28), hm, (1.0, 1.0, 1.0), 8)
    op = join([blade, neck, guard, handle, cap], 'opener_1858'); inked(op, 0.006); pr['opener_1858'] = op
    # --- knife: chunky 0.45 x 0.07 m grey-blue blade + opaque dark wood handle; `bend` folds the front half up ~75 deg in a smooth arc
    kb = []; bm = bmesh.new(); L, n, T = 0.45, 28, 0.009
    for i in range(n + 1):
        u = i / n; x = L * u; wd = 0.07 * (1 - 0.8 * max(0.0, (u - 0.72) / 0.28) ** 2)
        kb.append([bm.verts.new((x, y, z)) for y, z in ((-T, -wd / 2), (T, -wd / 2), (T, wd / 2), (-T, wd / 2))])
    for a_, b_ in zip(kb, kb[1:]):
        for i in range(4): bm.faces.new((a_[i], a_[(i + 1) % 4], b_[(i + 1) % 4], b_[i]))
    bm.faces.new(kb[0][::-1]); bm.faces.new(kb[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    blade = _obj('kblade', bm, M('opsteel'), c, P(3.0), tile=0.2)
    hmk = toon_mat('ophandle', (0.2, 0.1, 0.05))
    kh = box(c, 'khandle', (0.15, 0.04, 0.055), P(2.925, 0, 0), hmk); knife = join([blade, kh], 'knife')
    X0, TH = 0.225, math.radians(75)
    def _bend(co):
        if co.x <= X0: return co
        sd = co.x - X0; r = (L - X0) / TH; th = sd / r; zo = co.z
        return Vector((X0 + r * math.sin(th) - zo * math.sin(th), co.y, r * (1 - math.cos(th)) + zo * math.cos(th)))
    _shape(knife, 'bend', _bend)
    inked(knife, 0.008); pr['knife'] = knife
    # --- boot: sole + shaft + toe
    sole = box(c, 'bsole', (0.3, 0.12, 0.03), P(4.0, 0, 0.015), M('black')); toe = sph(c, 'btoe', 0.1, P(4.1, 0, 0.07), M('leather'), (1.5, 1.0, 0.8), 10)
    shaft = cyl(c, 'bshaft', 0.085, 0.3, P(3.95, 0, 0.17), M('leather'), seg=12, smooth=True); heel = box(c, 'bheel', (0.08, 0.12, 0.05), P(3.88, 0, 0.04), M('black'))
    boot = join([sole, toe, shaft, heel], 'boot'); inked(boot, 0.008); pr['boot'] = boot
    pr['rock'] = rock(c, 'rock_prop', P(5.0, 0, 0.08), 0.18, 4)
    # --- pan
    body = cyl(c, 'pbody', 0.16, 0.04, P(6.0, 0, 0.02), M('iron'), seg=20, r2=0.18); hdl = box(c, 'phandle', (0.28, 0.035, 0.02), P(6.3, 0, 0.04), M('wooddark'))
    pan = join([body, hdl], 'pan'); inked(pan, 0.008); pr['pan'] = pan
    # --- balance scale: root 'scale' (base+post), child 'scale_beam' (origin = pivot, rotate Y), pans are children of the beam
    base = cyl(c, 'sbase', 0.16, 0.04, (0, 0, 0.02), M('wooddark'), seg=16)
    post = cyl(c, 'spost', 0.025, 0.6, (0, 0, 0.32), M('brass'), seg=8); cap = sph(c, 'scap', 0.04, (0, 0, 0.64), M('brass'), seg=8)
    sc = join([base, post, cap], 'scale'); inked(sc, 0.008); sc.location = P(7.0, 0, 0)
    bb = box(c, 'bbeam', (0.8, 0.03, 0.025), (0, 0, 0), M('brass')); hubs = [sph(c, 'bhub', 0.035, (0, 0, 0), M('iron'), seg=8)]
    pans = []
    for sx in (-1, 1):
        x = sx * 0.4; ps = [beam(c, 'str', (x, 0, 0), (x - 0.15 * sx * 0, 0.0, -0.3), 0.004, M('iron'), 4)]
        pn = lathe(c, 'span', [(0.0, -0.3), (0.17, -0.27), (0.17, -0.25), (0.0, -0.285)], M('brass'), (x, 0, 0), seg=18, cap=False)
        pans.append(join(ps + [pn], 'scale_pan_l' if sx < 0 else 'scale_pan_r'))
    sb = join([bb] + hubs, 'scale_beam'); inked(sb, 0.006)
    sb.parent = sc; sb.location = (0, 0, 0.64)
    for p in pans: p.parent = sb; inked(p, 0.006)  # pans ride the beam: counter-rotate by -angle to keep them level
    pr['scale'] = sc; pr['scale_beam'] = sb; pr['scale_pan_l'] = pans[0]; pr['scale_pan_r'] = pans[1]
    # --- food: little plate with a small stew mound + beef chunks (clearly smaller than the can)
    pl = lathe(c, 'fplate', [(0.0, 0), (0.07, 0), (0.1, 0.012), (0.1, 0.016), (0.0, 0.016)], M('cream'), P(8.0), seg=20)
    st = sph(c, 'fstew', 0.045, P(8.0, 0, 0.02), M('copper'), (1.3, 1.3, 0.5), 10)
    ch = [sph(c, 'fchunk', 0.017, P(8.0 + dx, dy, 0.04), M('leather'), seg=6) for dx, dy in ((-0.02, 0.01), (0.02, -0.015), (0.0, 0.025))]
    pr['food'] = join([pl, st] + ch, 'food'); inked(pr['food'], 0.005)
    for k, o in pr.items(): o.name = k
    _PROPS = pr; return pr


def arrange_insert_tabletop(props, A):
    """put the props on the insert table at their anchors"""
    def at(p, a, rot=(0, 0, 0), dz=0.0): props[p].location = Vector(A[a].location) + Vector((0, 0, dz)); props[p].rotation_euler = rot
    at('can', 'can_spot'); props['lid'].location = Vector(A['can_spot'].location) + Vector((0, 0, 0.212)) if False else Vector(A['can_spot'].location) + Vector((0.45, -0.1, 0.0))
    props['lid'].rotation_euler = (0, 0, 0)
    at('label_card', 'card_spot', (math.radians(-12), 0, math.radians(8)), 0.28)
    at('chisel', 'chisel_spot', (math.pi / 2 + 0.2, 0, 0.5)); props['chisel'].location.z += 0.03
    at('hammer', 'hammer_spot', (math.pi / 2, 0, -0.3)); props['hammer'].location.z += 0.02
    at('opener_1858', 'opener_spot', (0, 0, 0.3)); props['opener_1858'].location.z += 0.01
    at('scale', 'scale_spot'); at('food', 'food_spot')


_INK_SKIP = ('sky', 'cloud', 'moon', 'star', 'ember', 'flame', 'rain', 'ripple', 'ground', 'terrain', 'farbank', 'bank', 'river', 'floor', 'backwall', 'tfloor', 'bwall', 'swall', 'canopy', 'gable', 'wleaf', 'fx', 'hill', 'treeline', 'sundisc', 'haze', 'dirtpatch', 'path', 'patch', 'lightning', 'pen')
def _ink_all(coll):
    """thin hull ink on every prop / dressing mesh that has none yet (same look as the characters, thinner)."""
    for o in list(coll.all_objects):
        if o.type != 'MESH' or any(k in o.name.lower() for k in _INK_SKIP) or 'LOOK_ink' in o.modifiers or 'ink' in o.modifiers: continue
        if any(m and (m.name.startswith('LOOK_ink') or m.name == 'ink_black') for m in o.data.materials) or not o.data.polygons: continue
        if any(m and m.name in ('f_red', 'f_orange', 'f_yellow', 'ember', 'lampglow', 'fireglow', 'ripple', 'star', 'moon') for m in o.data.materials): continue
        if max(o.dimensions) > 9: continue
        ink_hull(o, 0.008)


def build_sets():
    ensure_textures(); props = build_props()
    out = {}
    global _INT
    for sid, fn in (('camp', build_camp), ('night', build_night), ('tent', build_tent)):
        _INT = sid == 'tent'
        try: c = newcoll('set_' + sid); out[sid] = {'collection': c, 'anchors': fn(c)}
        finally: _INT = False
    c = newcoll('set_dusk'); out['dusk'] = {'collection': c, 'anchors': build_dusk(c)}
    _INT = True
    try: c = newcoll('set_insert'); out['insert'] = {'collection': c, 'anchors': build_insert(c, props)}
    finally: _INT = False
    arrange_insert_tabletop(props, out['insert']['anchors'])
    for d_ in out.values(): _ink_all(d_['collection'])
    ca = out['camp']['anchors']
    props['crate'].location = ca['crate'].location; props['boot'].location = Vector(ca['marcel_spot'].location) + Vector((-0.7, -0.5, 0))
    props['rock'].location = Vector(ca['gaston_spot'].location) + Vector((0.9, -0.4, 0.0))
    props['pan'].location = Vector(out['tent']['anchors']['table'].location) + Vector((-0.55, 0.2, 0.0))
    for k, o in props.items():
        if k in ('can',) : o.location = out['insert']['anchors']['can_spot'].location
    return out
