"""LOOK module (v3): toon materials, hull ink, moods, compositor grade, stylised FX. Blender 5.2, EEVEE.
Everything is built from nodes/primitives; no external assets except an optional painted `tex` path.
"""
import bpy, math, random
from mathutils import Vector

LIGHTNING_F = 1007
SET_X = {'camp': 0.0, 'insert': 300.0, 'night': 600.0, 'tent': 900.0, 'dusk': 1200.0}
INK_RGB = (0.012, 0.01, 0.03, 1.0)

# per-mood: world top/horizon, sun colour/energy/dir(az,el deg), fill, lamp, and compositor grade
MOODS = {
    'day': dict(top=(0.10, 0.32, 1.0), hor=(0.62, 0.82, 1.0), wstr=1.0,
                sun=((1.0, 0.80, 0.52), 2.6, (-35, 48)), fill=((0.75, 0.8, 1.0), 120.0), lamp=((1, .8, .5), 0.0),
                exp=0.0, sat=1.2, con=0.30, gam=1.0, gain=(0.9, 0.88, 0.82), lift=(1.0, 1.0, 1.0), vig=0.35, haze=0.15),
    'night': dict(top=(0.01, 0.04, 0.4), hor=(0.04, 0.09, 0.5), wstr=0.8, rim=((0.72, 0.88, 1.0), 3.2, (55, 22)),
                  sun=((0.62, 0.78, 1.0), 3.0, (-120, 38)), fill=((0.75, 0.85, 1.0), 110.0), lamp=((1, .7, .4), 450.0),
                  exp=0.2, sat=1.8, con=0.2, gam=0.95, gain=(0.56, 0.68, 0.84), lift=(0.98, 0.99, 1.02), vig=0.5, haze=0.2),
    'night_in': dict(top=(0.05, 0.10, 0.50), hor=(0.20, 0.20, 0.58), wstr=0.8,
                  sun=((0.23, 0.36, 0.85), 3.4, (-120, 38)), fill=((0.45, 0.58, 1.0), 90.0), lamp=((1.0, 0.62, 0.28), 700.0),
                  exp=0.06, sat=2.0, con=0.2, gam=1.15, gain=(0.85, 0.9, 1.05), lift=(0.97, 0.98, 1.06), vig=0.5, haze=0.2),
    'day_in': dict(top=(0.10, 0.32, 1.0), hor=(0.62, 0.82, 1.0), wstr=1.0,
                sun=((1.0, 0.80, 0.52), 2.6, (-35, 48)), fill=((0.75, 0.8, 1.0), 120.0), lamp=((1, .8, .5), 0.0),
                exp=0.0, sat=1.2, con=0.30, gam=1.66, gain=(1.2, 1.15, 1.05), lift=(1.0, 1.0, 1.0), vig=0.35, haze=0.15),
    'interior_in': dict(top=(0.45, 0.25, 0.14), hor=(0.65, 0.34, 0.14), wstr=1.0,
                     sun=((0.5, 0.5, 1.0), 0.0, (-40, 50)), fill=((0.9, 0.85, 0.8), 70.0), lamp=((1.0, 0.7, 0.4), 300.0),
                     exp=0.05, sat=1.2, con=0.30, gam=1.6, gain=(1.1, 0.95, 0.8), lift=(1.0, 1.0, 1.0), vig=0.45, haze=0.1),
    'interior': dict(top=(0.34, 0.26, 0.26), hor=(0.52, 0.36, 0.30), wstr=1.0,   # less orange world, cool blue-violet fill + lift in the shadows, warm lantern key kept
                     sun=((0.5, 0.5, 1.0), 0.0, (-40, 50)), fill=((0.62, 0.66, 1.0), 95.0), lamp=((1.0, 0.7, 0.4), 300.0),
                     exp=0.02, sat=1.3, con=0.30, gam=1.0, gain=(0.62, 0.62, 0.65), lift=(0.95, 0.965, 1.08), vig=0.45, haze=0.1),
}

MOODS['dusk'] = dict(top=(0.36, 0.42, 0.72), hor=(1.0, 0.72, 0.46), wstr=1.0,    # warm storybook sunset: golden low sun, lilac fill/shadows
                     sun=((1.0, 0.74, 0.44), 3.2, (-72, 13)), fill=((0.72, 0.64, 0.93), 115.0), lamp=((1, .7, .4), 0.0),
                     exp=0.0, sat=1.95, con=0.30, gam=1.0, gain=(0.8, 0.73, 0.7), lift=(0.98, 0.97, 1.03), vig=0.4, haze=0.15)
MOODS['day_hot'] = dict(MOODS['day'], sun=((1.0, 0.7, 0.38), 2.6, (-35, 48)), sat=1.4, gain=(0.9, 0.84, 0.76))
MOODS['night_warm'] = dict(MOODS['day_in'], top=(0.04, 0.08, 0.38), hor=(0.10, 0.13, 0.40), wstr=0.8, sun=((1.0, 0.78, 0.5), 2.2, (-35, 48)), sat=1.2, gam=1.65)
MOODS['interior_lid'] = dict(MOODS['interior'], gain=(0.54, 0.51, 0.47), sat=1.5)
MOODS['night_card'] = dict(MOODS['night_in'], sat=1.9, gain=(0.8, 0.88, 1.0), gam=1.15)
import os as _os, json as _json
if _os.environ.get('LOOK_TUNE'):   # quick grade tuning: LOOK_TUNE='{"day":{"sat":1.0}}'
    for _m, _d in _json.loads(_os.environ['LOOK_TUNE']).items(): MOODS[_m].update({k: (tuple(v) if isinstance(v, list) else v) for k, v in _d.items()})


def _node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind); n.location = loc
    for k, v in inputs.items(): n.inputs[k].default_value = v
    return n


def setup_render(scene, w=720, h=1280):
    """EEVEE, 720x1280 (final is scaled to 1080x1920), standard colour mgmt (the compositor owns the grade)."""
    r = scene.render
    r.engine = 'BLENDER_EEVEE'; r.resolution_x, r.resolution_y = w, h; r.resolution_percentage = 100
    r.fps = 30; r.image_settings.file_format = 'PNG'; r.film_transparent = False
    for vt in ('Standard',):
        try: scene.view_settings.view_transform = vt
        except Exception: pass
    try: scene.view_settings.look = 'None'
    except Exception: pass
    scene.view_settings.exposure = 0.0; scene.view_settings.gamma = 1.0
    ev = scene.eevee
    for k, v in dict(taa_render_samples=40, use_raytracing=False, use_shadows=True, shadow_ray_count=2,
                     shadow_step_count=6, use_volumetric_shadows=False, volumetric_samples=48,
                     volumetric_tile_size='4', bokeh_max_size=24.0).items():
        try: setattr(ev, k, v)
        except Exception as e: print('look: eevee opt', k, e)
    vl = scene.view_layers[0]; vl.use_pass_z = True
    return scene


def dof(cam, focus_obj, fstop=3.2):
    """Depth blur on backgrounds: camera DOF (soft, cheap in EEVEE)."""
    cam.data.dof.use_dof = True; cam.data.dof.focus_object = focus_obj; cam.data.dof.aperture_fstop = fstop


# ---------------------------------------------------------------- materials
def _ramp(nt, loc):
    r = nt.nodes.new('ShaderNodeValToRGB'); r.location = loc
    r.color_ramp.interpolation = 'LINEAR'; els = r.color_ramp.elements
    # shadow (cool purple) | mid (neutral) | lit (warm) with narrow transitions = cel steps
    spec = [(0.0, (0.45, 0.42, 0.70)), (0.20, (0.45, 0.42, 0.70)), (0.27, (0.80, 0.76, 0.88)),
            (0.50, (0.80, 0.76, 0.88)), (0.57, (1.12, 1.0, 0.80))]
    while len(els) < len(spec): els.new(0.5)
    for e, (p, c) in zip(els, spec): e.position = p; e.color = (*c, 1)
    return r


def toon_mat(name, rgb, tex=None, ink=True):
    """Painted toon: diffuse -> cel ramp (cool purple shadow, warm light) x base colour/painted texture
    x subtle brush noise, output as emission (so lighting only decides the ramp step). ink=True adds a
    thin dark silhouette line inside the surface (use ink_hull for the outer outline)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = _node(nt, 'ShaderNodeOutputMaterial', (1400, 0))
    dif = _node(nt, 'ShaderNodeBsdfDiffuse', (-600, 200)); dif.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB'); s2r.location = (-400, 200)
    bw = nt.nodes.new('ShaderNodeRGBToBW'); bw.location = (-200, 200)
    ramp = _ramp(nt, (0, 200))
    L = nt.links.new
    L(dif.outputs[0], s2r.inputs[0]); L(s2r.outputs[0], bw.inputs[0]); L(bw.outputs[0], ramp.inputs[0])
    # base colour: rgb x painted tex, with brush-stroke noise
    base = _node(nt, 'ShaderNodeRGB', (-600, -200)); base.outputs[0].default_value = (*rgb[:3], 1)
    col = base.outputs[0]
    if tex:
        tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-1000, -500)
        mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-800, -500)
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.location = (-600, -500); ti.image = bpy.data.images.load(tex, check_existing=True)
        ti.projection = 'BOX'; ti.projection_blend = 0.2; ti.interpolation = 'Smart'
        L(tc.outputs['Object'], mp.inputs[0]); L(mp.outputs[0], ti.inputs[0])
        mt = nt.nodes.new('ShaderNodeMix'); mt.data_type = 'RGBA'; mt.blend_type = 'MULTIPLY'; mt.location = (-300, -300)
        mt.inputs[0].default_value = 1.0; L(col, mt.inputs[6]); L(ti.outputs[0], mt.inputs[7]); col = mt.outputs[2]
    nz = _node(nt, 'ShaderNodeTexNoise', (-800, -800), Scale=14.0, Detail=5.0, Roughness=0.6)
    nz.noise_dimensions = '3D'
    tc2 = nt.nodes.new('ShaderNodeTexCoord'); tc2.location = (-1000, -800)
    mp2 = nt.nodes.new('ShaderNodeMapping'); mp2.location = (-900, -800); mp2.inputs['Scale'].default_value = (1.0, 1.0, 0.3)
    L(tc2.outputs['Object'], mp2.inputs[0]); L(mp2.outputs[0], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-600, -800)
    mr.inputs['To Min'].default_value = 0.84; mr.inputs['To Max'].default_value = 1.08
    L(nz.outputs['Fac'], mr.inputs['Value'])
    mb = nt.nodes.new('ShaderNodeMix'); mb.data_type = 'RGBA'; mb.blend_type = 'MULTIPLY'; mb.location = (-100, -300)
    mb.inputs[0].default_value = 1.0; L(col, mb.inputs[6])
    mbv = nt.nodes.new('ShaderNodeCombineColor'); mbv.location = (-300, -800)
    for i in range(3): L(mr.outputs[0], mbv.inputs[i])
    L(mbv.outputs[0], mb.inputs[7])
    # light colour tint: lit colour of a white diffuse / its luminance (moon = blue, lantern pool = orange, sun = warm)
    mxv = nt.nodes.new('ShaderNodeMath'); mxv.operation = 'MAXIMUM'; mxv.location = (-200, 500); mxv.inputs[1].default_value = 0.02
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'DIVIDE'; inv.location = (0, 500); inv.inputs[0].default_value = 1.0
    sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'; sc_.location = (200, 500)
    L(bw.outputs[0], mxv.inputs[0]); L(mxv.outputs[0], inv.inputs[1]); L(s2r.outputs[0], sc_.inputs[0]); L(inv.outputs[0], sc_.inputs['Scale'])
    tn = nt.nodes.new('ShaderNodeMix'); tn.data_type = 'RGBA'; tn.location = (400, 500); tn.inputs[0].default_value = 0.4
    tn.inputs[6].default_value = (1, 1, 1, 1); L(sc_.outputs[0], tn.inputs[7])
    m0 = nt.nodes.new('ShaderNodeMix'); m0.data_type = 'RGBA'; m0.blend_type = 'MULTIPLY'; m0.location = (300, 150)
    m0.inputs[0].default_value = 1.0; L(ramp.outputs[0], m0.inputs[6]); L(tn.outputs[2], m0.inputs[7])
    m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = 'RGBA'; m1.blend_type = 'MULTIPLY'; m1.location = (500, 0)
    m1.inputs[0].default_value = 1.0; L(m0.outputs[2], m1.inputs[6]); L(mb.outputs[2], m1.inputs[7])
    # small self-emission (~0.15) keeps faces/colours readable in the dark + cool rim
    fl = nt.nodes.new('ShaderNodeMix'); fl.data_type = 'RGBA'; fl.blend_type = 'MULTIPLY'; fl.location = (500, -150)
    fl.inputs[0].default_value = 1.0; fl.inputs[7].default_value = (0.2, 0.2, 0.24, 1); L(mb.outputs[2], fl.inputs[6])
    rm = nt.nodes.new('ShaderNodeLayerWeight'); rm.location = (500, -450); rm.inputs['Blend'].default_value = 0.3
    rr = nt.nodes.new('ShaderNodeMapRange'); rr.location = (700, -450); rr.inputs['From Min'].default_value = 0.55; rr.inputs['From Max'].default_value = 0.9
    rr.inputs['To Max'].default_value = 0.5; L(rm.outputs['Fresnel'], rr.inputs['Value'])
    rc = nt.nodes.new('ShaderNodeMix'); rc.data_type = 'RGBA'; rc.blend_type = 'ADD'; rc.location = (900, -100)
    rc.inputs[7].default_value = (0.5, 0.78, 1.0, 1); L(rr.outputs[0], rc.inputs[0]); L(m1.outputs[2], rc.inputs[6])
    fa = nt.nodes.new('ShaderNodeMix'); fa.data_type = 'RGBA'; fa.blend_type = 'ADD'; fa.location = (1100, -100); fa.inputs[0].default_value = 1.0
    L(rc.outputs[2], fa.inputs[6]); L(fl.outputs[2], fa.inputs[7])
    last = fa.outputs[2]
    if ink:
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.location = (300, -300); lw.inputs['Blend'].default_value = 0.5
        er = nt.nodes.new('ShaderNodeMath'); er.operation = 'GREATER_THAN'; er.location = (500, -300); er.inputs[1].default_value = 0.93
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.location = (700, 0)
        mx.inputs[7].default_value = INK_RGB
        L(lw.outputs['Facing'], er.inputs[0]); L(er.outputs[0], mx.inputs[0]); L(last, mx.inputs[6]); last = mx.outputs[2]
    em = _node(nt, 'ShaderNodeEmission', (1000, 0), Strength=1.0); L(last, em.inputs['Color']); L(em.outputs[0], out.inputs[0])
    m['look_toon'] = True
    return m


_INK = None
def _ink_mat():
    global _INK
    if _INK is None or _INK.name not in bpy.data.materials:
        m = bpy.data.materials.new('LOOK_ink'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = INK_RGB; em.inputs['Strength'].default_value = 1.0
        o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], o.inputs[0])
        m.use_backface_culling = True; _INK = m
    return _INK


def ink_hull(obj, width=0.02):
    """Inverted-hull outline: solidify (flipped normals, backface-culled black emission) on a 2nd slot."""
    if obj.type != 'MESH': return obj
    if 'LOOK_ink' in obj.modifiers: obj.modifiers['LOOK_ink'].thickness = width; return obj
    obj.data.materials.append(_ink_mat())
    md = obj.modifiers.new('LOOK_ink', 'SOLIDIFY'); md.thickness = width; md.offset = 1
    md.use_flip_normals = True; md.use_rim = False; md.material_offset = len(obj.data.materials) - 1 - (0 if len(obj.data.materials) > 1 else 0)
    # material_offset is relative to each face's own slot index (0 for single-material objects)
    md.material_offset = len(obj.data.materials) - 1
    return obj


# ---------------------------------------------------------------- moods / world / lights
def _rig(scene):
    ob = bpy.data.objects
    def get(name, kind, make):
        o = ob.get(name)
        if o is None:
            l = make(); o = ob.new(name, l); scene.collection.objects.link(o)
        return o
    sun = get('LOOK_Sun', 'SUN', lambda: bpy.data.lights.new('LOOK_Sun', 'SUN')); sun.data.angle = math.radians(4)
    fill = get('LOOK_Fill', 'AREA', lambda: bpy.data.lights.new('LOOK_Fill', 'AREA')); fill.data.size = 6.0
    rim = get('LOOK_Rim', 'SUN', lambda: bpy.data.lights.new('LOOK_Rim', 'SUN')); rim.data.angle = math.radians(6)
    lamp = get('LOOK_Lamp', 'POINT', lambda: bpy.data.lights.new('LOOK_Lamp', 'POINT')); lamp.data.shadow_soft_size = 0.4
    w = scene.world
    if w is None or 'look_world' not in w:
        w = bpy.data.worlds.new('LOOK_World'); w['look_world'] = True; scene.world = w; w.use_nodes = True
        nt = w.node_tree; nt.nodes.clear(); L = nt.links.new
        tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ')
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.45
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.name = 'mix'
        top = nt.nodes.new('ShaderNodeRGB'); top.name = 'top'; hor = nt.nodes.new('ShaderNodeRGB'); hor.name = 'hor'
        bg = nt.nodes.new('ShaderNodeBackground'); bg.name = 'bg'; o = nt.nodes.new('ShaderNodeOutputWorld')
        L(tc.outputs['Generated'], sp.inputs[0]); L(sp.outputs['Z'], mr.inputs['Value']); L(mr.outputs[0], mx.inputs[0])
        L(hor.outputs[0], mx.inputs[6]); L(top.outputs[0], mx.inputs[7]); L(mx.outputs[2], bg.inputs[0]); L(bg.outputs[0], o.inputs[0])
    return sun, fill, lamp, w


def _key(obj_or_sock, path, frame, value, owner=None):
    """set + keyframe, constant-held per mood range (linear change only between ranges = dissolve)."""
    if owner is None: setattr(obj_or_sock, path, value); obj_or_sock.keyframe_insert(path, frame=frame)
    else: owner.default_value = value; owner.keyframe_insert('default_value', frame=frame)


def apply_mood(scene, mood, f_start, f_end, lamp_at=None, fill_x=None):
    """Key world, sun, fill, lamp, fog and grade for `mood` over [f_start, f_end]. Call once per shot range. lamp_at=(x,y,z) world position of the warm lamp/fire glow (night: the fire, interior: the lantern)."""
    P = MOODS[mood]; sun, fill, lamp, w = _rig(scene); nt = w.node_tree
    for f in (f_start, f_end):
        nt.nodes['top'].outputs[0].default_value = (*P['top'], 1); nt.nodes['top'].outputs[0].keyframe_insert('default_value', frame=f)
        nt.nodes['hor'].outputs[0].default_value = (*P['hor'], 1); nt.nodes['hor'].outputs[0].keyframe_insert('default_value', frame=f)
        s = nt.nodes['bg'].inputs['Strength']; s.default_value = P['wstr']; s.keyframe_insert('default_value', frame=f)
        c, e, (az, el) = P['sun']
        sun.data.color = c; sun.data.energy = e
        d = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)), math.cos(math.radians(el)) * math.sin(math.radians(az)), math.sin(math.radians(el))))
        sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler() if False else d.to_track_quat('Z', 'Y').to_euler()
        for ob_, attrs in ((sun.data, ('color', 'energy')), (sun, ('rotation_euler',))):
            for a in attrs: ob_.keyframe_insert(a, frame=f)
        rc_, re_, (raz, rel) = P.get('rim', ((0.72, 0.88, 1.0), 0.0, (100, 28)))   # cool blue-white rim from behind the characters (night only)
        rim = bpy.data.objects['LOOK_Rim']; rim.data.color = rc_; rim.data.energy = re_
        rd = Vector((math.cos(math.radians(rel)) * math.cos(math.radians(raz)), math.cos(math.radians(rel)) * math.sin(math.radians(raz)), math.sin(math.radians(rel))))
        rim.rotation_euler = rd.to_track_quat('Z', 'Y').to_euler()
        for ob_, attrs in ((rim.data, ('color', 'energy')), (rim, ('rotation_euler',))):
            for a in attrs: ob_.keyframe_insert(a, frame=f)
        fc, fe = P['fill']; fill.data.color = fc; fill.data.energy = fe
        fill.location = (fill_x if fill_x is not None else SET_X['camp'] if mood == 'day' else SET_X['night'] if mood.startswith('night') else SET_X['tent'], -6, 5)
        fill.rotation_euler = (math.radians(60), 0, 0)
        lc, le = P['lamp']; lamp.data.color = lc; lamp.data.energy = le
        lamp.location = lamp_at or ((SET_X['night'] - 1.8, 2.0, 1.2) if mood.startswith('night') else (SET_X['tent'] + 0.0, 0.3, 2.4))
        for ob_, attrs in ((fill.data, ('color', 'energy')), (fill, ('location', 'rotation_euler')), (lamp.data, ('color', 'energy')), (lamp, ('location',))):
            for a in attrs: ob_.keyframe_insert(a, frame=f)
        _grade_key(scene, mood, f)
    _fog(scene, mood, f_start, f_end)
    if mood == 'night' and f_start <= LIGHTNING_F <= f_end:   # 2-frame lightning flash on 'thought' (33.56 s): gain pulse through the compositor
        nt_ = getattr(scene, 'compositing_node_group', None)
        if nt_ is not None and 'cb' in nt_.nodes:
            gs = [i for i in nt_.nodes['cb'].inputs if i.name == 'Gain' and hasattr(i.default_value, '__len__')][0]; g_ = P['gain']
            for f_, k_ in ((LIGHTNING_F - 1, 1.0), (LIGHTNING_F, 2.6), (LIGHTNING_F + 1, 2.6), (LIGHTNING_F + 2, 1.0)):
                gs.default_value = (g_[0] * k_, g_[1] * k_, g_[2] * k_, 1); gs.keyframe_insert('default_value', frame=f_)
            gs.default_value = (*g_, 1)


def _fog(scene, mood, f0, f1):
    """Thin atmospheric volume on the world (night only is dense enough to read as haze)."""
    w = scene.world; nt = w.node_tree
    vs = nt.nodes.get('fog')
    if vs is None:
        vs = nt.nodes.new('ShaderNodeVolumeScatter'); vs.name = 'fog'
        o = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputWorld'][0]; nt.links.new(vs.outputs[0], o.inputs['Volume'])
    dens = {'night': 0.012}.get(mood, 0.0)
    vs.inputs['Color'].default_value = (0.35, 0.3, 0.9, 1) if mood.startswith('night') else (1, .8, .6, 1)
    for f in (f0, f1):
        vs.inputs['Density'].default_value = dens; vs.inputs['Density'].keyframe_insert('default_value', frame=f)


# ---------------------------------------------------------------- compositor
def setup_compositor(scene):
    """Kuwahara painterly -> bloom -> grade (contrast/lift/gain/sat, keyed per mood) -> depth ink (Sobel on Z)
    -> vignette -> animated film grain. Output via the group output (Blender 5 compositing_node_group)."""
    import numpy as np
    scene.render.use_compositing = True
    nt = bpy.data.node_groups.new('LOOK_comp', 'CompositorNodeTree'); scene.compositing_node_group = nt
    nt.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    L = nt.links.new
    def mix(loc, blend, fac=1.0):
        n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend; n.location = loc
        n.inputs[0].default_value = fac; return n
    rl = nt.nodes.new('CompositorNodeRLayers'); rl.location = (-1400, 0)
    ku = _node(nt, 'CompositorNodeKuwahara', (-1150, 200), Size=2); ku.name = 'ku'; ku.inputs['Type'].default_value = 'Classic'
    gl = _node(nt, 'CompositorNodeGlare', (-900, 200), Threshold=1.0, Strength=0.25, Size=0.6); gl.inputs['Type'].default_value = 'Bloom'
    cb = _node(nt, 'CompositorNodeColorBalance', (-400, 200)); cb.name = 'cb'; cb.inputs['Type'].default_value = 'Lift/Gamma/Gain'
    hs = nt.nodes.new('CompositorNodeHueSat'); hs.name = 'hs'; hs.location = (-150, 200)
    L(rl.outputs['Image'], ku.inputs['Image']); L(ku.outputs[0], gl.inputs['Image']); L(gl.outputs[0], cb.inputs['Image']); L(cb.outputs[0], hs.inputs['Image'])
    # depth ink: edge of the Z pass -> dark lines
    sob = _node(nt, 'CompositorNodeFilter', (-1150, -400)); sob.inputs['Type'].default_value = 'Sobel'
    zc = nt.nodes.new('ShaderNodeMath'); zc.operation = 'MINIMUM'; zc.inputs[1].default_value = 40.0; zc.location = (-1300, -400)  # sky depth is 1e10
    L(rl.outputs['Depth'], zc.inputs[0]); L(zc.outputs[0], sob.inputs['Image'])
    bw = nt.nodes.new('CompositorNodeRGBToBW'); bw.location = (-950, -400); L(sob.outputs[0], bw.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-750, -400); mr.name = 'inkmap'
    mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 1.2; mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.15
    L(bw.outputs[0], mr.inputs['Value'])
    hz = mix((0, 450), 'MIX'); hzr = nt.nodes.new('ShaderNodeMapRange'); hzr.name = 'hazeamt'; hzr.location = (-300, 450)
    hzr.inputs['From Min'].default_value = 4.0; hzr.inputs['From Max'].default_value = 40.0; hzr.inputs['To Max'].default_value = 0.3
    hzc = nt.nodes.new('CompositorNodeRGB'); hzc.name = 'hazecol'; hzc.location = (-300, 650)
    L(zc.outputs[0], hzr.inputs['Value']); L(hzr.outputs[0], hz.inputs[0]); L(hs.outputs[0], hz.inputs[6]); L(hzc.outputs[0], hz.inputs[7])
    mi = mix((150, 200), 'MULTIPLY'); L(hz.outputs[2], mi.inputs[6]); L(mr.outputs[0], mi.inputs[7])
    # vignette
    el = _node(nt, 'CompositorNodeEllipseMask', (-750, -700)); el.inputs['Position'].default_value = (0.5, 0.5); el.inputs['Size'].default_value = (0.9, 0.9)
    bl = _node(nt, 'CompositorNodeBlur', (-500, -700), Size=(260, 260)); bl.inputs['Type'].default_value = 'Gaussian'
    L(el.outputs[0], bl.inputs['Image'])
    vr = nt.nodes.new('ShaderNodeMapRange'); vr.name = 'vig'; vr.location = (-250, -700); vr.inputs['To Min'].default_value = 0.5
    L(bl.outputs[0], vr.inputs['Value'])
    vm = mix((400, 200), 'MULTIPLY'); L(mi.outputs[2], vm.inputs[6]); L(vr.outputs[0], vm.inputs[7])
    # whip blur (horizontal, keyed by key_transitions) + dip-to-ink (keyed). No grain.
    wb = _node(nt, 'CompositorNodeBlur', (650, 200), Size=(0.0, 0.0)); wb.name = 'whipblur'; wb.inputs['Type'].default_value = 'Gaussian'
    dsrc = vm.outputs[2]
    try:   # night-only 0.6% blue-noise dither (breaks 8-bit banding in the dark gradients); factor keyed 0/1 per mood in _grade_key
        import os as _o
        dp_ = _o.path.normpath(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)), '..', 'tex', 'dither.png'))
        im_ = nt.nodes.new('CompositorNodeImage'); im_.image = bpy.data.images.load(dp_, check_existing=True); im_.image.colorspace_settings.name = 'Non-Color'
        sc_ = nt.nodes.new('CompositorNodeScale'); sc_.inputs['Type'].default_value = 'Render Size'
        try: sc_.inputs['Frame Type'].default_value = 'Stretch'
        except Exception: pass
        L(im_.outputs[0], sc_.inputs['Image'])
        m1 = mix((300, -300), 'SUBTRACT'); m1.inputs[7].default_value = (0.5, 0.5, 0.5, 1); L(sc_.outputs[0], m1.inputs[6])
        m2 = mix((450, -300), 'MULTIPLY'); m2.inputs[7].default_value = (0.012, 0.012, 0.012, 1); L(m1.outputs[2], m2.inputs[6])
        m3 = mix((600, 100), 'ADD', 0.0); m3.name = 'dith'; L(vm.outputs[2], m3.inputs[6]); L(m2.outputs[2], m3.inputs[7]); dsrc = m3.outputs[2]
    except Exception as e: print('look: dither skipped', e)
    L(dsrc, wb.inputs['Image'])
    dp = mix((900, 200), 'MIX', 0.0); dp.name = 'dip'; dp.inputs[7].default_value = (0.10, 0.03, 0.02, 1); L(wb.outputs[0], dp.inputs[6])
    go = nt.nodes.new('NodeGroupOutput'); go.location = (1150, 200); L(dp.outputs[2], go.inputs[0])
    return nt


def _grade_key(scene, mood, f):
    nt = getattr(scene, 'compositing_node_group', None)
    if nt is None or 'hs' not in nt.nodes: return
    P = MOODS[mood]
    if 'dith' in nt.nodes:   # night: dither on + no Kuwahara smear (it flattens the dark range into bands)
        dsk = nt.nodes['dith'].inputs[0]; dsk.default_value = 1.0 if mood == 'night' else 0.0; dsk.keyframe_insert('default_value', frame=f)
    if 'ku' in nt.nodes:
        kz = nt.nodes['ku'].inputs['Size']; kz.default_value = 0.0 if mood == 'night' else 2.0; kz.keyframe_insert('default_value', frame=f)
    hc = nt.nodes['hazecol'].outputs[0]; hc.default_value = (*P['hor'], 1); hc.keyframe_insert('default_value', frame=f)
    ha = nt.nodes['hazeamt'].inputs['To Max']; ha.default_value = P['haze']; ha.keyframe_insert('default_value', frame=f)
    for name, sock, val in (('hs', 'Saturation', P['sat']),
                            ('cb', 'Gain', (*P['gain'], 1)), ('cb', 'Lift', (*P['lift'], 1)), ('cb', 'Gamma', (P['gam'],) * 3 + (1,)), ('vig', 'To Min', 1.0 - P['vig'])):
        want = isinstance(val, tuple)  # Blender 5 has float+colour sockets with the same name (Lift/Gain)
        s = [i for i in nt.nodes[name].inputs if i.name == sock and hasattr(i.default_value, '__len__') == want][0]
        s.default_value = val; s.keyframe_insert('default_value', frame=f)


# ---------------------------------------------------------------- FX
def _fx_mat(name, rgb, alpha=1.0, strength=1.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*rgb, 1); em.inputs['Strength'].default_value = strength
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = alpha
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o.inputs[0])
    return m


def _pop(o, f, f_life, peak):
    """scale 0 -> peak (overshoot) -> 0, keyed on twos."""
    for fr, s in ((f, 0.001), (f + 2, peak * 1.15), (f + 5, peak), (f + f_life, 0.001)):
        o.scale = (s, s, s); o.keyframe_insert('scale', frame=fr)
    o.hide_render = True; o.keyframe_insert('hide_render', frame=f - 1)
    o.hide_render = False; o.keyframe_insert('hide_render', frame=f)
    o.hide_render = True; o.keyframe_insert('hide_render', frame=f + f_life + 1)


def fx_puff(at, f, k=1.0):
    """Cel-shaded white cloud: one joined mesh of 5 lumps, one ink outline, pops out, drifts up, shrinks away."""
    import bmesh
    rnd = random.Random(int(f)); bm = bmesh.new()
    for i, (dx, dz, r) in enumerate(((0, 0, .55), (-.55, -.12, .38), (.55, -.1, .4), (-.25, .4, .36), (.3, .42, .32))):
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r, matrix=__import__('mathutils').Matrix.Translation((dx, 0, dz)))
    me = bpy.data.meshes.new(f'fx_puff_{f}'); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    o = bpy.data.objects.new(f'fx_puff_{f}', me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(toon_mat('fx_puffmat', (0.97, 0.96, 1.0), ink=False)); ink_hull(o, 0.035)
    o.location = (at[0], at[1] - 0.15, at[2]); o.rotation_euler = (0, 0, rnd.uniform(-.3, .3))
    for fr, sc_, dz in ((f, 0.001, 0), (f + 3, 0.55, .15), (f + 6, 0.5, .25), (f + 20, 0.62, .65), (f + 26, 0.001, .75)):
        o.scale = (sc_ * k,) * 3; o.location = (at[0], at[1] - 0.15, at[2] + dz * k)
        o.keyframe_insert('scale', frame=fr); o.keyframe_insert('location', frame=fr)
    o.hide_render = True; o.keyframe_insert('hide_render', frame=f - 1)
    o.hide_render = False; o.keyframe_insert('hide_render', frame=f)
    o.hide_render = True; o.keyframe_insert('hide_render', frame=f + 27)
    return [o]


def fx_speedlines(at, f, dir=(1, 0, 0)):
    """3 thin tapered strokes along dir; they slide ~0.5 m and thin out to nothing over 7 frames."""
    import bmesh
    rnd = random.Random(int(f) + 7); d = Vector(dir).normalized(); out = []
    ang = math.atan2(d.z, d.x) if abs(d.z) > abs(d.y) else math.atan2(d.y, d.x)
    horiz = not (abs(d.z) > abs(d.y))
    for i in range(3):
        me = bpy.data.meshes.new('fx_speed'); bm = bmesh.new()
        L_, wd = rnd.uniform(1.0, 1.7), 0.05
        vs = [bm.verts.new(p_) for p_ in ((-L_ / 2, 0, 0), (-L_ * 0.15, 0, wd), (L_ / 2, 0, 0), (-L_ * 0.15, 0, -wd))]
        bm.faces.new(vs); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(f'fx_speed_{f}_{i}', me); bpy.context.scene.collection.objects.link(o)
        o.rotation_euler = (math.radians(90), 0, math.atan2(d.y, d.x)) if horiz else (0, 0, 0)
        if not horiz: o.rotation_euler = (math.radians(90) , 0, 0); o.rotation_euler = (math.radians(90) - 0, 0, 0)
        o.data.materials.append(_fx_mat('fx_white', (1, 1, 1), 1.0, 1.6))
        base = Vector((at[0] - d.x * .6, at[1] - 0.2 - d.y * .6, at[2] + (i - 1) * 0.28 + rnd.uniform(-.06, .06)))
        # local Z of the (rot_x 90) plane is world -Y; thickness lives on the mesh Z = world Z when facing camera
        for fr, thick, dist in ((f, 0.2, 0.0), (f + 2, 1.0, .25), (f + 7, 0.05, .55)):
            o.scale = (1, 1, thick); o.location = base + Vector((d.x, d.y if horiz else 0, d.z)) * dist
            o.keyframe_insert('scale', frame=fr); o.keyframe_insert('location', frame=fr)
        o.hide_render = True; o.keyframe_insert('hide_render', frame=f - 1)
        o.hide_render = False; o.keyframe_insert('hide_render', frame=f)
        o.hide_render = True; o.keyframe_insert('hide_render', frame=f + 8)
        out.append(o)
    return out


def fx_sparkle(at, f):
    """Four-point gold star that pops and spins (the 'pop' accent)."""
    bpy.ops.mesh.primitive_circle_add(vertices=8, radius=1, fill_type='NGON'); o = bpy.context.object; o.name = f'fx_sparkle_{f}'
    me = o.data
    for i, v in enumerate(me.vertices): v.co *= (1.0 if i % 2 == 0 else 0.28)
    o.data.materials.append(_fx_mat('fx_gold', (1.0, 0.82, 0.25), 1.0, 3.0))
    o.location = at; o.rotation_euler = (math.radians(90), 0, 0)
    _pop(o, f, 12, 0.22)
    o.rotation_euler = (math.radians(90), 0, 0); o.keyframe_insert('rotation_euler', frame=f)
    o.rotation_euler = (math.radians(90), math.radians(120), 0); o.keyframe_insert('rotation_euler', frame=f + 12)
    return o


def fx_godrays(set_id):
    """Fake light shafts: soft emissive additive-looking planes fanned from the upper-left of the set (night)."""
    x0 = SET_X[set_id]; out = []
    nm = 'fx_ray'
    m = bpy.data.materials.get(nm)
    if m is None:
        m = bpy.data.materials.new(nm); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
        tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ')
        g = nt.nodes.new('ShaderNodeTexGradient'); g.gradient_type = 'QUADRATIC_SPHERE'
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (-.5, -.5, 0)  # centre the UV
        L(tc.outputs['UV'], mp.inputs[0]); L(mp.outputs[0], g.inputs[0])
        rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['From Min'].default_value = 0.0; rr.inputs['From Max'].default_value = 1.0
        L(g.outputs['Fac'], rr.inputs['Value'])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.55, 0.55, 1.0, 1); em.inputs['Strength'].default_value = 1.2
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        sc = nt.nodes.new('ShaderNodeMath'); sc.operation = 'MULTIPLY'; sc.inputs[1].default_value = 0.22
        L(rr.outputs[0], sc.inputs[0]); L(sc.outputs[0], mx.inputs[0]); L(tr.outputs[0], mx.inputs[1]); L(em.outputs[0], mx.inputs[2])
        o = nt.nodes.new('ShaderNodeOutputMaterial'); L(mx.outputs[0], o.inputs[0])
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
        m.use_backface_culling = False
    for i in range(7):  # vertical quads facing the camera, tilted ~25deg, behind the action (y=9..11)
        bpy.ops.mesh.primitive_plane_add(size=1); o = bpy.context.object; o.name = f'fx_godray_{set_id}_{i}'
        o.scale = (0.8 + 0.4 * (i % 3), 16.0, 1)
        o.location = (x0 - 4.0 + i * 1.7, 9.0 + (i % 2) * 1.5, 4.5)
        o.rotation_euler = (math.radians(90), math.radians(-24 + 2 * i), 0)
        o.data.materials.append(m); o.visible_shadow = False
        out.append(o)
    return out


def key_transitions(scene, whips, dips, w=6, dims=()):
    """whip = horizontal blur ramp around the cut f (cut hidden at peak); dip = fade to ink around f (0 = fade in from ink)."""
    nt = scene.compositing_node_group
    sz = nt.nodes['whipblur'].inputs['Size']; fa = nt.nodes['dip'].inputs[0]
    sz.default_value = (0.0, 0.0); fa.default_value = 0.0
    def k(sock, f, v, idx=None):
        sock.default_value = v
        sock.keyframe_insert('default_value', frame=f) if idx is None else sock.keyframe_insert('default_value', index=idx, frame=f)
    for f in whips:
        for fr, v in ((f - 5, 0.0), (f - 3, 60.0), (f - 1, 160.0), (f, 160.0), (f + 2, 60.0), (f + 5, 0.0)):
            k(sz, fr, (v, 0.0))
    for f0_, f1_, v_ in dims:
        for fr, v in ((f0_ - 1, 0.0), (f0_, v_), (f1_ - 1, v_), (f1_, 0.0)): k(fa, fr, v)
    for f in dips:
        for fr, v in ((f - 7, 0.0), (f - 1, 1.0), (f, 1.0), (f + 7, 0.0)) if f > 0 else ((0, 1.0), (10, 0.0)):
            k(fa, fr, v)
