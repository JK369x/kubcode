"""Integrator: builds the whole film from lib/* + shots.json.
blender -b -P scene.py -- gate OUTDIR [ids...]     render the middle frame of every shot (or listed ids)
blender -b -P scene.py -- frames OUTDIR A B [SAMPLES]   render frames A..B-1 as PNG
shots coordinates: {anchor, off:[x,y,z]} with y = toward camera -> world Y is mirrored (camera sits at -Y, chars face -Y).
"""
import bpy, sys, os, json, math
from mathutils import Vector, Euler, Quaternion
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE + '/lib')
import look, sets, chars
look.MOODS['night'].update(fill=((0.6, 0.7, 1.0), 190.0), exp=0.12)   # round 5: lift s21 via ambient, not characters

args = sys.argv[sys.argv.index('--') + 1:]
MODE, OUT = args[0], args[1]
SAMPLES = 12
SHOTS = json.load(open(HERE + '/shots.json'))
# beat directors: beats/<name>.json = {"range":[f0,f1], "shots":[full shot objects, replace by id], "acting":[acting beats]}
# one file per gag so agents work in parallel; acting.json beats inside "range" are dropped and replaced
import glob
BEATS = [json.load(open(p)) for p in sorted(glob.glob(HERE + '/beats/*.json'))]
for b in BEATS:
    for ns in b.get('shots', []):
        i = next((k for k, s in enumerate(SHOTS) if s['id'] == ns['id']), None)
        assert i is not None, f"beat shot id {ns['id']} not in shots.json"
        SHOTS[i] = ns
END = SHOTS[-1]['f_out']
POSE_OVR = {}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 0, END
look.setup_render(sc)
if os.environ.get('NATIVE'):   # native 1080x1920 instead of 720x1280 + upscale (critic: detail 934 vs ref 1591)
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1080, 1920, 100
S = sets.build_sets()
P = sets.build_props()
A = {sid: d['anchors'] for sid, d in S.items()}


def W(set_id, v):
    """shots position -> world Vector"""
    if isinstance(v, dict):
        a = A[set_id][v['anchor']].location; o = v['off']
        return Vector((a.x + o[0], a.y - o[1], a.z + o[2]))
    return Vector((sets.ORIGIN[set_id][0] + v[0], -v[1], v[2]))


def constant(idb, names=None):
    for fc in chars._fcurves(idb):
        if names is None or fc.data_path in names:
            for k in fc.keyframe_points: k.interpolation = 'CONSTANT'



# props that keep their real colour under the mood tint
for nm in ('tin', 'paper', 'cream', 'steel'):
    m_ = bpy.data.materials.get(nm)
    if m_ and m_.use_nodes:
        for n_ in m_.node_tree.nodes:
            if n_.bl_idname == 'ShaderNodeMix' and tuple(n_.location) == (400, 500): n_.inputs[0].default_value = 0.08
# ---- set fixes: no grass blades in front of lenses, dark warm tabletop, night lights tamed
for sid in [k for k in ('camp', 'night', 'dusk') if k in S]:
    for o in S[sid]['collection'].all_objects:
        if o.name.startswith(('tufts', 'edgetufts')): o.hide_render = True
ico = S['insert']['collection']
dk = look.toon_mat('tabletop_dark', (0.8, 0.5, 0.3), tex=sets.TEX + '/wood_dark.png')
for o in ico.all_objects:
    if o.name.startswith('tabletop'): o.data.materials[0] = dk
    if o.name.startswith('cloth'): o.hide_render = True
for o in S['night']['collection'].all_objects:
    if o.type == 'LIGHT':
        o.data.energy *= 0.3
        o.data.use_custom_distance = True; o.data.cutoff_distance = 3.2
        for fc in chars._fcurves(o.data):
            if fc.data_path == 'energy':
                for k in fc.keyframe_points: k.co[1] *= 0.3; k.handle_left[1] *= 0.3; k.handle_right[1] *= 0.3

# ---------------------------------------------------------------- characters
CH = {'marcel': chars.make_char('marcel', 'Marcel'), 'gaston': chars.make_char('gaston', 'Gaston'),
      's1': chars.make_char('soldier', 'Sol1'), 's2': chars.make_char('soldier', 'Sol2'), 's3': chars.make_char('soldier', 'Sol3')}
for c in CH.values():   # off-stage until first placed
    c.place(-5, (-300, 0, 0), 0)
    c.pose(-5, 'idle'); c.face(-5, 'neutral')

# ---------------------------------------------------------------- camera
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_end = 400; cam.data.clip_start = 0.05; cam.data.sensor_width = 36; cam.data.sensor_fit = 'HORIZONTAL'
cam.data.dof.use_dof = True; cam.data.dof.aperture_fstop = 5.6

# ---------------------------------------------------------------- set visibility (collection hide_render keyed) + moods
for sid, d in S.items():
    c = d['collection']
    for s in SHOTS:
        pass
vis = {sid: set() for sid in S}
for s in SHOTS: vis[s['set']].add(s['id'])

def _vis(scene, *a):
    f = scene.frame_current
    cur = next((x['set'] for x in SHOTS if x['f_in'] <= f < x['f_out']), SHOTS[-1]['set'])
    for sid, d in S.items(): d['collection'].hide_render = (sid != cur)
bpy.app.handlers.frame_change_pre.append(_vis)
# loop the night fire (keyed f1..121)
for o in S['night']['collection'].all_objects:
    for idb in (o, o.data if o.data else None):
        if idb is None: continue
        for fc in chars._fcurves(idb) if getattr(idb, 'animation_data', None) else []:
            if fc.keyframe_points and fc.keyframe_points[-1].co[0] <= 130 and not any(m.type == 'CYCLES' for m in fc.modifiers):
                fc.modifiers.new('CYCLES')
    if o.type == 'MESH' and o.data.shape_keys:
        for fc in chars._fcurves(o.data.shape_keys):
            if fc.keyframe_points[-1].co[0] <= 130: fc.modifiers.new('CYCLES')

LAMP = {('night_card', 'insert'): (300 - 1.0, 0.0, 1.5), ('night_in', 'insert'): (300 - 1.0, 0.0, 1.5), ('interior_in', 'insert'): (300 - 0.6, 0.2, 1.7), ('night', 'night'): (600 - 1.8, -2.0, 1.2), ('night', 'insert'): (300 - 1.0, 0.0, 1.5),
        ('interior', 'tent'): (900.0, 0.3, 2.4), ('interior', 'insert'): (300 - 0.6, 0.2, 1.7), ('day', 'camp'): None}
runs = []
for s_ in SHOTS:
    key = (s_['moodkey'], s_['set'])
    if runs and runs[-1][0] == key: runs[-1][2] = s_['f_out'] - 1
    else: runs.append([key, s_['f_in'], s_['f_out'] - 1])
comp = look.setup_compositor(sc)
for key, f0, f1 in runs: look.apply_mood(sc, key[0], f0, f1, lamp_at=LAMP.get(key), fill_x=sets.ORIGIN[key[1]][0])
for key, f0, f1 in runs: look.apply_mood(sc, key[0], f0, f1, lamp_at=LAMP.get(key), fill_x=sets.ORIGIN[key[1]][0])   # grade keys need the compositor
for idb in (bpy.data.worlds['LOOK_World'], bpy.data.worlds['LOOK_World'].node_tree, comp, bpy.data.objects['LOOK_Sun'], bpy.data.objects['LOOK_Fill'],
            bpy.data.objects['LOOK_Lamp'], bpy.data.objects['LOOK_Sun'].data, bpy.data.objects['LOOK_Fill'].data, bpy.data.objects['LOOK_Lamp'].data):
    for fc in chars._fcurves(idb):
        for k in fc.keyframe_points: k.interpolation = 'CONSTANT'


# per-mood colour multiplier on toon materials of a set (keeps wood brown-in-blue instead of magenta)
def mood_mult(coll_objs, cols, by_name=None):
    mats = {m for o in coll_objs if o.type == 'MESH' for m in o.data.materials if m and m.use_nodes and m.get('look_toon')}
    for m in mats:
        nt = m.node_tree; em = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeEmission']
        if not em or not em[0].inputs['Color'].links: continue
        em = em[0]; src = em.inputs['Color'].links[0].from_socket
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
        nt.links.new(src, mx.inputs[6]); nt.links.new(mx.outputs[2], em.inputs['Color'])
        for key, f0, f1 in runs:
            c = cols.get(key[0], (1, 1, 1))
            if by_name and key[0] in cols and m.name in by_name: c = by_name[m.name]
            for f in (f0, f1): mx.inputs[7].default_value = (*c, 1); mx.inputs[7].keyframe_insert('default_value', frame=f)
        for fc in chars._fcurves(nt):
            for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
NIGHT_MULT = (0.55, 1.0, 0.95)
mood_mult(list(S['insert']['collection'].all_objects), {'night_in': NIGHT_MULT, 'night_card': NIGHT_MULT})
mood_mult(list(S['night']['collection'].all_objects), {'night': (0.5, 0.95, 1.0)}, {'grass': (0.28, 0.55, 0.62), 'grass_l': (0.28, 0.55, 0.62), 'grass_d': (0.28, 0.5, 0.6), 'dirt': (0.45, 0.7, 0.85)})
_chobjs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(tuple(c.name + '_' for c in CH.values()))]
mood_mult(_chobjs, {'night': (0.9, 0.95, 0.88), 'night_in': (0.9, 0.95, 0.88), 'night_card': (0.9, 0.95, 0.88)})
# insert-room lamp per mood
il = [o for o in S['insert']['collection'].all_objects if o.type == 'LIGHT' and o.name.startswith('ilamp')][0]
for key, f0, f1 in runs:
    for f in (f0, f1):
        il.data.energy = {'day': 900.0, 'day_in': 900.0, 'night': 150.0, 'night_in': 320.0, 'night_card': 320.0, 'day_hot': 900.0, 'night_warm': 900.0, 'interior_lid': 800.0, 'interior': 800.0, 'interior_in': 800.0, 'dusk': 900.0}[key[0]]; il.data.keyframe_insert('energy', frame=f)
for fc in chars._fcurves(il.data):
    for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
# white (face/hat) self-glow per mood so faces stay white in dim interiors
GLOW = {'day': 0.06, 'day_in': 0.06, 'night_card': 0.14, 'day_hot': 0.06, 'night_warm': 0.06, 'interior_lid': 0.3, 'interior_in': 0.3, 'night': 0.05, 'night_in': 0.05, 'interior': 0.30, 'dusk': 0.08}
for m_ in bpy.data.materials:
    if not m_.use_nodes: continue
    for n_ in m_.node_tree.nodes:
        if n_.bl_idname == 'ShaderNodeMix' and n_.blend_type == 'ADD' and tuple(round(x, 2) for x in n_.inputs[7].default_value[:3]) == (0.08, 0.08, 0.09):
            for key, f0, f1 in runs:
                for f in (f0, f1):
                    g = GLOW[key[0]]; n_.inputs[7].default_value = (g, g, g * 1.05, 1); n_.inputs[7].keyframe_insert('default_value', frame=f)
            for fc in chars._fcurves(m_.node_tree):
                for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
# ---------------------------------------------------------------- per-shot: camera, chars, props, fx
def lookat_euler(pos, tgt, roll_deg):
    q = (tgt - pos).to_track_quat('-Z', 'Y') @ Quaternion((0, 0, 1), math.radians(roll_deg))
    return q.to_euler()

HOLD_END = {'knife': 's11', 'rock': 's12', 'pan': 's15', 'chisel': 's31', 'hammer': 's31', 'opener_1858': 's38'}
last_eul = None
char_state = {k: {'set': None, 'loc': None, 'f': -99, 'pose': 'idle'} for k in CH}
carry = {k: {} for k in CH}          # char -> {prop: set_id} held props
hold_live = {k: False for k in CH}
prop_vis = {}                        # (prop,set) -> bool
prop_home = {}
cr = A['camp']['crate'].location
crate_top = max((P['crate'].matrix_world @ Vector(c)).z for c in P['crate'].bound_box)
HOME = {('can', 'camp'): Vector((cr.x, cr.y, crate_top)), ('can', 'tent'): Vector(A['tent']['can_spot'].location),
        ('can', 'insert'): Vector(A['insert']['can_spot'].location),
        ('lid', 'tent'): Vector(A['tent']['can_spot'].location) + Vector((0, 0, 0.212)),
        ('lid', 'insert'): Vector(P['lid'].location)}
for k, o in P.items(): HOME.setdefault((k, 'camp'), Vector(o.location))
for k in ('chisel', 'hammer', 'label_card', 'opener_1858', 'scale', 'food', 'scale_beam', 'scale_pan_l', 'scale_pan_r'): HOME[(k, 'insert')] = Vector(P[k].location)
HOME[('opener_1858', 'insert')] = Vector(A['insert']['can_spot'].location) + Vector((-0.3, -0.12, 0.0))
base_rot = {k: o.rotation_euler.copy() for k, o in P.items()}
scale_parts = ['scale', 'food', 'scale_beam', 'scale_pan_l', 'scale_pan_r']
for o in P.values(): o.hide_render = True

def key_vis(o, f, v):
    o.hide_render = not v; o.keyframe_insert('hide_render', frame=f)

SNAP = {}
def key_loc(o, f, v, rot=None, snap=True):
    if snap: SNAP.setdefault(o.name, set()).add(f)
    o.location = v; o.keyframe_insert('location', frame=f)
    if rot is not None: o.rotation_euler = rot; o.keyframe_insert('rotation_euler', frame=f)

def shape(o, name, f, v, ramp=3):
    if not o.data.shape_keys or name not in o.data.shape_keys.key_blocks: return
    kb = o.data.shape_keys.key_blocks[name]
    kb.keyframe_insert('value', frame=max(f - 1, 0)) if kb.value != v else None
    kb.value = v; kb.keyframe_insert('value', frame=f + ramp)

def home_for(prop, set_id): return HOME.get((prop, set_id), HOME.get((prop, 'camp')))

# prop children of the scale are positioned by the scale builder; only keep visibility toggles for them
for s in SHOTS:
    sid, f0, f1 = s['set'], s['f_in'], s['f_out']
    # --- characters
    acts = sorted(s['actions'], key=lambda a: a['f'])
    # re-issue held props when contiguous in same set
    for ck, held in carry.items():
        for pk, hs in list(held.items()):
            if hs == sid and char_state[ck]['set'] == sid and not hold_live[ck]:
                CH[ck].hold(f0, P[pk]); hold_live[ck] = True
    for a in acts:
        f, ck, act, ar = a['f'], a['char'], a['act'], a['args']; c = CH[ck]; st = char_state[ck]
        if act == 'place':
            loc = W(sid, ar['loc']); rz = ar.get('rot_z', 0.0)
            if s['id'] == 's16' and ck == 'gaston' and ar['loc'].get('off', [0, 0, 0])[2] > 0.1: loc = Vector((loc.x, loc.y, crate_top - 0.355))   # seated hips 0.355 m above the root
            moving = st['set'] == sid and st['pose'] in ('walk', 'march') and st['loc'] is not None and (loc - st['loc']).length > 0.5
            if st['loc'] is not None and f > st['f'] + 1:
                if moving:
                    d = loc - st['loc']; head = math.atan2(d.x, -d.y)
                    c.place(st['f'], st['loc'], head) if False else None
                    rz = head * 0.55
                    c.place(st['f'], st['loc'], head * 0.55)
                else:
                    c.place(f - 1, st['loc'], st['rot'] if 'rot' in st else 0.0)
            c.place(f, loc, rz)
            if moving: c.place(f + 8, loc, 0.0)
            st.update(set=sid, loc=loc, f=f + (8 if moving else 0), rot=0.0 if moving else rz)
        elif act == 'pose':
            c.pose(f, POSE_OVR.get((s['id'], ck, ar['name']), ar['name'])); st['pose'] = ar['name']; st['set'] = st['set'] or sid
        elif act == 'face': c.face(f, ar['name'])
        elif act == 'hold':
            if carry[ck] and ar['prop'] not in carry[ck] and not ({ar['prop']} | set(carry[ck])) <= {'chisel', 'hammer'}:    # drop whatever was in hand
                c.hold(f, None); carry[ck] = {}
            if ar['prop'] is None: c.hold(f, None); carry[ck] = {}; hold_live[ck] = False; continue   # "prop": null = empty the hand
            if hold_live[ck] and ar['prop'] in carry[ck]: continue
            c.hold(f, P[ar['prop']]); hold_live[ck] = True; carry[ck][ar['prop']] = sid
            key_vis(P[ar['prop']], f - 1, False); key_vis(P[ar['prop']], f, True); prop_vis[(ar['prop'], sid)] = True
    # release holds at shot end: next shot in another set, or the held prop's last shot
    nxt = SHOTS[SHOTS.index(s) + 1] if s is not SHOTS[-1] else None
    for ck in CH:
        if not hold_live[ck]: continue
        done = any(HOLD_END.get(pk) == s['id'] for pk in carry[ck])
        if done or (nxt and nxt['set'] != sid):
            CH[ck].hold(f1 - 1, None); hold_live[ck] = False
            if done:
                for pk in carry[ck]: key_vis(P[pk], f1, False); prop_vis[(pk, sid)] = False
                carry[ck] = {}
    if s['id'] in ('s24', 's25', 's30', 's34'): prop_vis[('label_card', 'insert')] = False
    if s['id'] == 's28': prop_vis[('can', 'tent')] = True; prop_vis[('lid', 'tent')] = True
    # --- props: reposition + visibility at shot start
    held_now = {pk for ck in carry for pk in carry[ck] if hold_live[ck]}
    known = {pk for (pk, ps) in prop_vis}
    hide = set(s.get('hide_props', []))   # per-shot only: hidden here, restored for later shots
    for pk in known | hide:
        o = P[pk]; v = prop_vis.get((pk, sid), False) and pk not in hide
        if v and pk not in held_now: key_loc(o, f0, home_for(pk, sid), base_rot[pk])
        key_vis(o, f0, v)
    for q in sorted(s['props'], key=lambda q: q['f']):
        pk, f, act, ar = q['prop'], q['f'], q['action'], q['args']; o = P[pk]
        if act == 'appear':
            prop_vis[(pk, sid)] = True
            if pk not in held_now: key_loc(o, f, home_for(pk, sid), base_rot[pk])
            key_vis(o, f - 1, False); key_vis(o, f, True)
            if pk == 'can': shape(o, 'dent', f, 0.0, 0)
            if 'fly_to' in ar:
                a0 = W(sid, ar['from']) if 'from' in ar else home_for('can', sid); a1 = A[sid]['tree'].location + Vector((0.3, -0.4, 0.12))
                f_a, f_b = ar['frames']
                for t in range(0, 9):
                    u = t / 8; p = a0.lerp(a1, u); p.z += math.sin(u * math.pi) * 1.0 + (a1.z - a0.z) * 0
                    key_loc(o, f_a + int((f_b - f_a) * u), p, (u * 14, 0, u * 9), snap=False)
                HOME[('can', 'camp')] = a1.copy()
            if ar.get('on') == 'scale':   # key holds off from here instead of deleting them (hook/throw holds come earlier)
                for c_ in o.constraints: c_.influence = 0.0; c_.keyframe_insert('influence', frame=f - 1)
        elif act in ('dent', 'bend'):
            shape(o, 'dent' if act == 'dent' else 'bend', f, ar.get('amount', 1.0))
        elif act == 'pop':
            lid0 = home_for('lid', sid); prop_vis[('lid', sid)] = True; key_vis(o, f - 1, True)
            for t in range(0, 11):
                u = t / 10
                key_loc(o, f + 2 * t if False else f + int(u * 22), lid0 + Vector((0.5 * u, 0.05 * u, 0.8 * math.sin(math.pi * u * 0.9) * (1 - u * 0.2) + 0.0)), (u * 3.0, u * 1.0, u * 5), snap=False)
            HOME[('lid', 'tent')] = lid0 + Vector((0.5, 0.05, 0.0))
    # --- fx
    for x in s['fx']:
        t, f = x['type'], x['f']
        if t == 'godrays': continue
        at = W(sid, x['at'])
        if t == 'puff': look.fx_puff(at, f, x.get('k', 0.28 if s['size'] == 'MACRO' else 0.7 if s['size'] == 'MED' else 1.0))
        elif t == 'sparkle': look.fx_sparkle(at, f)
        elif t == 'speedlines':
            d = x.get('dir', [1, 0, 0]); look.fx_speedlines(at, f, (d[0], -d[1], d[2]))

# --- acting layer from the ACT agent (guarded: runs before chars.apply_acting exists)
_ap = os.path.join(HERE, 'acting.json')
if BEATS and os.path.exists(_ap):
    _act = json.load(open(_ap))
    for b in BEATS:
        f0, f1 = b['range']
        _act = [a for a in _act if not (f0 <= a['f'] < f1)] + b.get('acting', [])
    _ap = os.path.join(HERE, 'acting_merged_%d.json' % os.getpid()); json.dump(_act, open(_ap, 'w'))
if hasattr(chars, 'apply_acting') and os.path.exists(_ap): print('ACTING beats', chars.apply_acting(CH, _ap))
# --- scale gag (s25): beam tips can-side down then food joins (iron stays down)
s23 = next((s for s in SHOTS if s['id'] == 's25'), None)   # 60 s film only
beam = P['scale_beam']; pl, pr_ = P['scale_pan_l'], P['scale_pan_r']
if s23:
    f = 1133
    for ob in (P['scale'], P['scale_beam'], P['scale_pan_l'], P['scale_pan_r']):
        key_vis(ob, f - 1, False); key_vis(ob, f, True); key_vis(ob, s23['f_out'], False)
    # cartoon swing: the can slams the beam down with overshoot; the food lands and barely nudges it (the can wins)
    for fr, ang in ((1133, 0.0), (1140, 0.0), (1144, 0.38), (1147, 0.26), (1150, 0.32), (1153, 0.30), (1155, 0.27), (1158, 0.31), (1164, 0.30)):
        beam.rotation_euler[1] = ang; beam.keyframe_insert('rotation_euler', index=1, frame=fr)
        for p in (pl, pr_): p.rotation_euler[1] = -ang; p.keyframe_insert('rotation_euler', index=1, frame=fr)
    can = P['can']
    # free the can for the scale gag without deleting holds: earlier holds (hook) and later ones (bite) keep their own keys
    for c_ in list(can.constraints):
        c_.influence = 0.0; c_.keyframe_insert('influence', frame=s23['f_in'] - 1)
    key_loc(can, s23['f_out'], HOME[('can', 'insert')])
    # can rides the left pan, food the right pan (world positions sampled from the animated beam)
    key_vis(P['food'], 1132, False); key_vis(P['food'], 1153, True); key_vis(P['food'], s23['f_out'], False)
    for fr in range(1133, s23['f_out'] - 1, 2):
        sc.frame_set(fr)
        key_loc(can, fr, pl.matrix_world.translation + Vector((0, 0, 0.03)), (0, 0, 0), snap=False)
        if fr >= 1153: key_loc(P['food'], fr, pr_.matrix_world.translation + Vector((0, 0, 0.03)), (0, 0, 0), snap=False)
    key_loc(can, s23['f_out'] - 1, HOME[('can', 'insert')])
for o in P.values():
    constant(o, ('hide_render',))
    for fc in chars._fcurves(o):
        if fc.data_path in ('location', 'rotation_euler'):
            for k in fc.keyframe_points:
                if int(round(k.co[0])) in SNAP.get(o.name, ()): k.interpolation = 'CONSTANT'

# ---------------------------------------------------------------- camera pass (auto-framed on the real character/prop positions)
SUBJ = {x['id']: x.get('subj') for x in SHOTS}
CHN = {'m': 'marcel', 'g': 'gaston', 's1': 's1', 's2': 's2', 's3': 's3'}
FRACP = {'CU': 0.36, 'MED': 0.40, 'WIDE': 0.30, 'XW': 0.20, 'MACRO': 0.5}
FRAC = {'CU': 0.36, 'MED': 0.15, 'WIDE': 0.09, 'XW': 0.05, 'MACRO': 0.5}   # chars: head height / frame height; props: subject height / frame height
HC = {'marcel': 1.1, 'gaston': 1.42, 's1': 1.1, 's2': 1.1, 's3': 1.1}
camkeys = {}
CAMOVR = {x['id']: x['camrel'] for x in SHOTS if 'camrel' in x}
ZOFF = {}
AZ = {}

def char_box(c):
    zs = []; pts = []
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith(c.name + '_') and not o.hide_render:
            for v in o.bound_box: pts.append(o.matrix_world @ Vector(v))
    return pts

def prop_box(name):
    o = P[name]
    if o.hide_render: return []
    pts = [o.matrix_world @ Vector(v) for v in o.bound_box]
    for ch in o.children_recursive: pts += [ch.matrix_world @ Vector(v) for v in ch.bound_box]
    return pts

def subj_pts(spec, sid, f, size):
    """-> list of (center, height, [extreme points])"""
    out = []
    for t in spec.split():
        if t in CHN:
            n = CH[CHN[t]].name; hc = bpy.data.objects[n + '_hc'].matrix_world.translation
            pts = char_box(CH[CHN[t]])
            if size == 'CU': out.append((Vector(hc), 0.66, [hc + Vector((0, 0, 0.3)), hc - Vector((0, 0, 0.3))]))
            else:
                zmn = min(p.z for p in pts); zmx = max(p.z for p in pts); zmn = max(zmn, 0.0)
                cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts)
                out.append((Vector((cx, cy, (zmn + zmx) / 2)), zmx - zmn, pts))
        elif t.startswith('pt:'):
            _, an, x, y, z, h = t.split(':'); c = W(sid, {'anchor': an, 'off': [float(x), float(y), float(z)]}); out.append((c, float(h), []))
        elif t.startswith('p:'):
            pts = prop_box(t[2:])
            if not pts: continue
            zmn = min(p.z for p in pts); zmx = max(p.z for p in pts)
            c = sum(pts, Vector()) / len(pts); out.append((c, max(zmx - zmn, 0.2), pts))
        elif t == 'crate': c = A[sid]['crate'].location; out.append((Vector((c.x, c.y, 0.3)), 0.7, []))
        elif t == 'tree': c = A[sid]['tree'].location; out.append((Vector((c.x + 0.3, c.y - 0.4, 1.3)), 2.6, []))
        elif t == 'fire': c = A[sid]['fire'].location; out.append((Vector((c.x, c.y, 0.5)), 1.0, []))
        elif t == 'lidarc': c = A[sid]['can_spot'].location; out.append((Vector((c.x + 0.2, c.y, c.z + 0.65)), 0.9, []))
        elif t == 'tent_table': c = A[sid]['table'].location; out.append((Vector((c.x, c.y, c.z + 0.2)), 0.6, []))
    subj_pts.empty = not out
    if not out:
        c = A[sid]['table'].location if sid == 'insert' else A[sid]['crate'].location if 'crate' in A[sid] else A[sid]['marcel_spot'].location
        out.append((Vector((c.x, c.y, c.z + 0.2)), 0.4, []))
    return out

MINHV = {'MED': {'insert': 1.7}, 'MACRO': {'insert': 0.45, 'camp': 0.5}}

def head_h():
    o = bpy.data.objects.get('Marcel_skull'); return max(o.dimensions.z, 0.3) if o else 0.6

def frame_cam(s, k, f, prev, which):
    sid = s['set']; spec = SUBJ.get(s['id']); lens = k['lens']; size = s['size']
    pos = W(sid, k['pos']); tgt = W(sid, k['target'])
    if spec:
        sc.frame_set(f)
        pts = subj_pts(spec, sid, f, size)
        if subj_pts.empty:
            sc.frame_set((s['f_in'] + s['f_out']) // 2); pts = subj_pts(spec, sid, f, size); sc.frame_set(f)
        az = math.radians(s['az'] + (s['az1'] - s['az']) * which); el = math.radians(s['el'] + (s['el1'] - s['el']) * which)
        elmax = {'XW': 48, 'WIDE': 40, 'MED': 45, 'CU': 12, 'MACRO': 80}[size]; el = max(math.radians(-12), min(math.radians(elmax), el))
        right = Vector((math.cos(az), math.sin(az), 0))
        zmin = min(c.z - h / 2 for c, h, _ in pts); zmax = max(c.z + h / 2 for c, h, _ in pts)
        xs = [c.dot(right) for c, h, _ in pts]
        cxy = sum((c for c, h, _ in pts), Vector()) / len(pts)
        margin = 0.12 if size == 'MACRO' else 1.1
        has_char = any(t in CHN for t in spec.split())
        if has_char and size != 'MACRO': hv_size = head_h() / FRAC[size]; hv_fit = (zmax - zmin) / 0.40 if size != 'CU' else (zmax - zmin) / 0.9
        else: hv_size = (zmax - zmin) / FRACP[size]; hv_fit = 0
        Hv = max(hv_size, hv_fit, (max(xs) - min(xs) + margin) / (0.78 * 0.5625), MINHV.get(size, {}).get(sid, 0))
        Hv *= (1 + (s['push'] - 1) * which) * s.get('hvmul', 1.0)
        shift = 0.10 if size == 'CU' else 0.06
        C = Vector((cxy.x, cxy.y, (zmin + zmax) / 2))
        aim = C - Vector((0, 0, 1)) * shift * Hv
        vf = 2 * math.atan(32.0 / lens)
        d = Hv / (2 * math.tan(vf / 2))
        zfloor = s.get('zmin', 0.55) if sid in ('camp', 'night', 'tent') else 0.97
        elmin = math.asin(max(-1, min(1, (zfloor - aim.z) / d)))
        el = max(el, elmin); u = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        allp = [p for c, h, ps in pts for p in ps]
        if not s.get('moving'):
            for fx_ in (s['f_in'], (s['f_in'] + s['f_out']) // 2, s['f_out'] - 1):
                if fx_ != f: sc.frame_set(fx_); allp += [p for c, h, ps in subj_pts(spec, sid, fx_, size) for p in ps]
            sc.frame_set(f)
        front = max([(p - aim).dot(u) for p in allp] + [0.0])
        d = max(d, front + (0.8 if size != 'MACRO' else 0.3))
        ppts = ([p_ for c, h, ps in pts for p_ in (ps if ps else [c])] if s.get('moving') else [p_ for c, h, ps in pts for p_ in ps] + [c for c, h, ps in pts] + allp)
        if size == 'CU': ppts = [c for c, h, ps in pts] + [p_ for c, h, ps in pts for p_ in ps]
        for _ in range(8):
            pos_ = aim + u * d; e_ = lookat_euler(pos_, aim, 0.0); M_ = e_.to_matrix().transposed()
            xy = [(M_ @ (p_ - pos_)) for p_ in ppts]
            xn = [lens * v.x / (-v.z) / 18.0 for v in xy if v.z < -0.05]
            if not xn: break
            mid, span = (max(xn) + min(xn)) / 2, (max(xn) - min(xn)) / 2
            right_ = M_.transposed() @ Vector((1, 0, 0))
            aim = aim + right_ * mid * d * 18.0 / lens
            if span > 0.78: d *= span / 0.78
        pos, tgt = aim + u * d, aim
    if s['id'] in CAMOVR:
        c0 = Vector(A[sid]['can_spot'].location) if 'can_spot' in A[sid] else HOME[('can', 'camp')]   # camp has no can_spot: use the crate-top can home
        pos, tgt = c0 + Vector(CAMOVR[s['id']][which][0]), c0 + Vector(CAMOVR[s['id']][which][1])
    camkeys.setdefault(s['id'], []).append((pos, tgt))
    e = lookat_euler(pos, tgt, k['roll_deg'])
    if prev: e.make_compatible(prev)
    cam.location = pos; cam.rotation_euler = e; cam.data.lens = lens
    cam.data.dof.focus_distance = (tgt - pos).length
    cam.data.dof.aperture_fstop = 8.0 if lens >= 70 else 20.0
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
    cam.data.keyframe_insert('lens', frame=f); cam.data.dof.keyframe_insert('focus_distance', frame=f); cam.data.dof.keyframe_insert('aperture_fstop', frame=f)
    return e

prev_e = None
for s in SHOTS:
    prev_e = frame_cam(s, s['camera'][0], s['f_in'], prev_e, 0)
    prev_e = frame_cam(s, s['camera'][-1], s['f_out'] - 1, prev_e, 1)
# ---------------------------------------------------------------- clear set dressing out of each camera's way (keyed per shot)
KEEP = ('ground', 'sky', 'hill', 'terrain', 'floor', 'backwall', 'tabletop', 'tablefront', 'river', 'water', 'tleg', 'flag', 'tree', 'cloud', 'light', 'wall', 'canopy', 'pole')
cands = {}
for sid in [k for k in ('camp', 'night', 'insert', 'tent', 'dusk') if k in S]:
    L_ = []
    for o in S[sid]['collection'].all_objects:
        if o.type != 'MESH' or o.hide_render or any(k in o.name.lower() for k in KEEP): continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; ctr = sum(bb, Vector()) / 8
        rad = max((b - ctr).length for b in bb)
        big = rad > 1.6
        if big and 'tent' not in o.name.lower(): continue
        L_.append((o, ctr, rad, [min(b[i] for b in bb) for i in range(3)], [max(b[i] for b in bb) for i in range(3)], big))
    cands[sid] = L_
hidden_by_shot = {}
for s in SHOTS:
    sid = s['set']; hid = set()
    for p0, t0 in camkeys[s['id']]:
        d = t0 - p0; dl = d.length; d.normalize()
        for o, ctr, rad, lo, hi, big in cands[sid]:
            v = ctr - p0; t = v.dot(d)
            if big:   # tents: AABB slab test of the camera ray (shrunk), camera inside also hides
                t0_, t1_ = 0.0, dl - 0.3
                for i in range(3):
                    l_, h_ = lo[i] + 0.15, hi[i] - 0.15
                    if abs(d[i]) < 1e-6:
                        if not (l_ <= p0[i] <= h_): t0_, t1_ = 1, 0
                    else:
                        a_, b_ = (l_ - p0[i]) / d[i], (h_ - p0[i]) / d[i]
                        if a_ > b_: a_, b_ = b_, a_
                        t0_, t1_ = max(t0_, a_), min(t1_, b_)
                if t0_ <= t1_: hid.add(o)
            elif (v.length < rad + 0.9) or (0 < t < dl - 0.4 and (v - d * t).length < rad + (1.1 if s['size'] in ('XW', 'WIDE') else 0.6) and (ctr - t0).length > 0.5): hid.add(o)
    if sid == 'camp': hid |= {o for o in S[sid]['collection'].all_objects if o.type == 'MESH' and o.name.startswith(('wtall', 'wgrass', 'tufts', 'edgetufts'))}
    if s.get('hide_names'): hid |= {o for o in S[sid]['collection'].all_objects if o.type == 'MESH' and any(n_ in o.name.lower() for n_ in s['hide_names'])}
    hidden_by_shot[s['id']] = hid
allh = set().union(*hidden_by_shot.values())
for o in allh:
    osid = [k for k in S if o.name in S[k]['collection'].all_objects][0]
    for s in SHOTS:
        if s['set'] != osid: continue
        key_vis(o, s['f_in'], o not in hidden_by_shot[s['id']])
    constant(o, ('hide_render',))

# ---------------------------------------------------------------- occlusion: pull the camera in front of anything solid between it and the subject
SKIPN = ('sky', 'hill', 'cloud', 'river', 'bank', 'ground', 'tree_line', 'treeline', 'skydome', 'floor', 'ripple', 'tabletop', 'tablefront', 'path', 'patch', 'dirt', 'wwalk')
dg = bpy.context.evaluated_depsgraph_get()
CHP = tuple(c.name + '_' for c in CH.values())
n_pull = 0
for s in SHOTS:
    for which, f in ((0, s['f_in']), (1, s['f_out'] - 1)):
        if s['id'] in CAMOVR: continue
        sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        pos, tgt = camkeys[s['id']][which]; v = pos - tgt; L = v.length
        if L < 0.5: continue
        dirn = v / L; org = tgt + dirn * 0.1; rem = L - 0.1; hitd = None
        for _ in range(12):
            ok, loc, nrm, idx, ob, mw = sc.ray_cast(dg, org, dirn, distance=rem)
            if not ok: break
            if loc.z < 0.45 and s['set'] != 'insert' or ob.name.startswith(CHP) or ob in hidden_by_shot[s['id']] or any(k in ob.name.lower() for k in SKIPN) or ob.name in P or ob.type != 'MESH':
                step = (loc - org).length + 0.02; org = org + dirn * step; rem -= step
                if rem <= 0: break
                continue
            hitd = (loc - tgt).length; break
        if hitd is not None and hitd < L:
            newp = tgt + dirn * max(hitd - 0.12, 0.5); n_pull += 1
            camkeys[s['id']][which] = (newp, tgt)
            e = lookat_euler(newp, tgt, s['camera'][which]['roll_deg'])
            sc.frame_set(f); cam.location = newp; cam.keyframe_insert('location', frame=f)
print('OCCLUSION pulled', n_pull)
for idb in (cam, cam.data, cam.data.dof):
    pass
for fc in chars._fcurves(cam) + chars._fcurves(cam.data):
    ks = fc.keyframe_points
    for i, kp in enumerate(ks):
        if i % 2 == 1: kp.interpolation = 'CONSTANT'    # last key of a shot holds into the cut
        else: kp.interpolation = 'SINE'; kp.easing = 'EASE_IN_OUT'




# 1858 opener: big lever-style blade biting the lid, sweeping along the rim
if True:
    o_ = P['opener_1858']; cs_ = Vector(A['insert']['can_spot'].location)
    o_.scale = (2.4, 2.4, 2.4)
    for fr, dx in ((1520, -0.55), (1536, -0.20), (1546, -0.10), (1556, 0.0), (1568, 0.10), (1596, 0.10)):
        key_loc(o_, fr, cs_ + Vector((dx, -0.02, 0.17 if fr >= 1546 else 0.35 - (fr - 1520) * 0.004)), (0.0, 0.0, 0.3), snap=False)
# ---------------------------------------------------------------- clang: chisel on the can, hammer drops on it at 1386, can squashes
if True:
    can_ = P['can']; ch_, hm_ = P['chisel'], P['hammer']
    c0 = Vector(A['insert']['can_spot'].location)
    top = c0 + Vector((0.0, 0.0, 0.212))
    SNAPS = ch_, hm_
    for o_, fr in ((ch_, 1383), (hm_, 1383)):
        key_vis(o_, fr - 1, False); key_vis(o_, fr, True)
    key_loc(ch_, 1383, top + Vector((0.0, 0.0, 0.14)), (0.0, 0.0, 0.0))
    key_loc(hm_, 1383, top + Vector((0.14, 0.0, 0.42)), (0.0, math.radians(100), 0.0))
    key_loc(hm_, 1385, top + Vector((0.14, 0.0, 0.42)), (0.0, math.radians(100), 0.0))
    key_loc(hm_, 1387, top + Vector((0.05, 0.0, 0.30)), (0.0, math.radians(95), 0.0))
    key_loc(hm_, 1411, top + Vector((0.05, 0.0, 0.30)), (0.0, math.radians(95), 0.0))
    key_loc(ch_, 1411, top + Vector((0.0, 0.0, 0.14)), (0.0, 0.0, 0.0))
    for fr, v in ((1383, 1.0), (1387, 0.88), (1390, 1.04), (1394, 1.0)):
        can_.scale = (1.0, 1.0, v); can_.keyframe_insert('scale', frame=fr)
    can_.scale = (1, 1, 1); can_.keyframe_insert('scale', frame=1396)
    constant(ch_); constant(hm_)
# the clang insert shot hides label card + scale parts
# pop shot: remove clutter around the can
_hn = None
_cs = Vector(A['tent']['can_spot'].location)
for o in S['tent']['collection'].all_objects:
    if o is None or o.type != 'MESH' or o.hide_render: continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; ctr = sum(bb, Vector()) / 8; rad = max((b - ctr).length for b in bb)
    if rad < 0.6 and (Vector((ctr.x, ctr.y, 0)) - Vector((_cs.x, _cs.y, 0))).length < 0.75 and ctr.z > _cs.z - 0.1:
        for sh in SHOTS:
            if sh['set'] == 'tent': key_vis(o, sh['f_in'], sh['id'] != 's31')
        constant(o, ('hide_render',))

# ---------------------------------------------------------------- transitions (compositor keyed): whip blur + dip
def key_transitions(whips, dips):
    nt = sc.compositing_node_group
    sz = nt.nodes['whipblur'].inputs['Size']; fa = nt.nodes['dip'].inputs[0]
    sz.default_value = (0.0, 0.0); fa.default_value = 0.0
    def k(sock, f, v):
        sock.default_value = v; sock.keyframe_insert('default_value', frame=f)
    for f in whips:        # 5 blurred frames max, peak on the two frames either side of the cut
        for fr, v in ((f - 3, 0.0), (f - 2, 90.0), (f - 1, 170.0), (f, 0.0)): k(sz, fr, (v, 0.0))
    for f in dips:
        for fr, v in (((f - 4, 0.0), (f - 1, 1.0), (f, 0.45), (f + 2, 0.0)) if f > 0 else ((0, 1.0), (10, 0.0))): k(fa, fr, v)
dips = [s['f_in'] for s in SHOTS if s['transition_in'] == 'dissolve']
whips = [s['f_in'] for s in SHOTS if s['transition_in'] == 'whip' and s['f_in'] > 0]
key_transitions(whips, dips)

# ---------------------------------------------------------------- render settings
sc.eevee.taa_render_samples = SAMPLES
sc.render.use_motion_blur = False
sc.render.filepath = OUT
sc.render.image_settings.file_format = 'PNG'

def render_frame(f, path):
    sc.frame_set(f); sc.render.filepath = path; bpy.ops.render.render(write_still=True)

os.makedirs(OUT, exist_ok=True)
if MODE == 'gate':
    ids = args[2:]
    for s in SHOTS:
        if ids and s['id'] not in ids: continue
        fm = (s['f_in'] + s['f_out']) // 2
        render_frame(fm, os.path.join(OUT, s['id'] + '.png'))
        from bpy_extras.object_utils import world_to_camera_view
        rep = []
        for t in (SUBJ.get(s['id']) or '').split():
            for c_, h_, ps_ in subj_pts(t, s['set'], fm, 'CU' if s['size'] == 'CU' else s['size']):
                q = [world_to_camera_view(sc, cam, p) for p in (ps_ or [c_])]
                rep.append((t, round(min(v.x for v in q), 2), round(max(v.x for v in q), 2), round(1 - max(v.y for v in q), 2), round(1 - min(v.y for v in q), 2)))
        print('PROJ', s['id'], rep)
elif MODE == 'frames':
    a, b = int(args[2]), int(args[3])
    if len(args) > 4: sc.eevee.taa_render_samples = int(args[4])
    for f in range(a, b): render_frame(f, os.path.join(OUT, 'f%04d.png' % f))
elif MODE == 'list':
    for f in [int(x) for x in open(args[2]).read().split()]: render_frame(f, os.path.join(OUT, 'f%04d.png' % f))
elif MODE == 'save':
    bpy.ops.wm.save_as_mainfile(filepath=OUT + '/scene.blend')
