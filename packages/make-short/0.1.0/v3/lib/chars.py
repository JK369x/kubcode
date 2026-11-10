"""CHARS module (v3): bean characters (white head, thick ink, dot eyes, big brows, stick legs, hat = identity).
API: make_char(kind, name) -> Char ; Char.root / place / pose / face / hold. Blender 5.2.
Faces are -Y. Poses are keyed ON TWOS (CONSTANT interp), with anticipation + overshoot; blinks are automatic.
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import look  # toon_mat, ink_hull

D = math.radians
CYC_LEN = 300          # frames a cyclic pose (walk/march/chew/idle) is pre-keyed for; trimmed by the next pose/face call
BLINK_LEN = 2400
INK_K = 2.5   # outline ink 2.6% -> ~6.6% of head width (reference); small features (<0.01) keep their width
INK_HEAD, INK_BODY, INK_HAT = 0.022, 0.015, 0.015
WHITE = (0.98, 0.98, 1.02)
BLACK = (0.02, 0.02, 0.03)

LEG_T, LEG_S = 0.38, 0.38      # tall stick legs: standing height = 3.2 head-heights (ref 3.1-3.3)            # thigh / shin
HIP_Z = LEG_T + LEG_S
BODY_H = 0.50                        # torso pivot (hips) to neck
ARM_U, ARM_F = 0.18, 0.17


# ------------------------------------------------------------------ mesh helpers
def _mesh(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me


def prim(kind, name, sc=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), mat=None, parent=None, ink=0.0, seg=28, r2=None):
    """kind sphere|cyl|cone|cube. sc = final size (radii for sphere/cyl: x,y radius, z half-height... see below)."""
    bm = bmesh.new()
    if kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0)
    elif kind in ('cyl', 'cone'):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=1.0, radius2=(r2 if r2 is not None else 1.0), depth=2.0)
    elif kind == 'tri':   # flat double-sided triangle in XZ, apex down
        va = [bm.verts.new(c) for c in ((-1, 0, 1), (1, 0, 1), (0, 0, -1))]; bm.faces.new(va)
    else:
        bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts: v.co = (v.co.x * sc[0], v.co.y * sc[1], v.co.z * sc[2])   # baked scale: ink stays uniform
    me = _mesh(name, bm)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if mat: o.data.materials.append(mat)
    o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    if ink: look.ink_hull(o, ink * (INK_K if ink >= 0.01 else 1.0))
    return o


def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.05; e.location = loc; e.rotation_euler = rot
    if parent: e.parent = parent
    return e


def _tmat(name, rgb): return look.toon_mat('CH_' + name, rgb)


def _white(name, rgb=(0.95, 0.95, 1.0)):
    """toon white that stays white under the warm key: near-white ramp + a little emission (~0.12)."""
    m = _tmat(name, rgb); nt = m.node_tree
    ramp = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeValToRGB'][0]
    for e, c in zip(ramp.color_ramp.elements, [(0.74, 0.72, 0.88), (0.74, 0.72, 0.88), (0.88, 0.88, 0.93), (0.88, 0.88, 0.93), (0.92, 0.92, 0.94)]):
        e.color = (*c, 1)
    for n_ in nt.nodes:
        if n_.bl_idname == 'ShaderNodeMix' and tuple(n_.location) == (400, 500): n_.inputs[0].default_value = 0.1   # faces stay white under lamps
    em = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
    src = em.inputs['Color'].links[0].from_socket
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'ADD'; mx.inputs[0].default_value = 1.0
    mx.inputs[7].default_value = (0.08, 0.08, 0.09, 1)
    nt.links.new(src, mx.inputs[6]); nt.links.new(mx.outputs[2], em.inputs['Color'])
    return m


# ------------------------------------------------------------------ character specs
SPEC = {
    'marcel': dict(coat=(0.13, 0.22, 0.50), hat='kepi', hat_col=(0.12, 0.20, 0.46), body_w=0.19, trim=(0.95, 0.75, 0.12),
                   sash=(0.85, 0.10, 0.10), stache='small', stache_col=(0.30, 0.17, 0.08), head_r=0.30, neck=(0.8, 0.2, 0.2)),
    'gaston': dict(coat=(0.93, 0.93, 0.98), hat='chef', hat_col=WHITE, body_w=0.18, trim=None, sash=None, apron=True,
                   stache='big', stache_col=(0.22, 0.12, 0.06), head_r=0.31, neck=(0.85, 0.1, 0.2)),
    'soldier': dict(coat=(0.42, 0.45, 0.20), hat='kepi2', hat_col=(0.40, 0.44, 0.17), body_w=0.18, trim=(0.80, 0.62, 0.20),
                    sash=(0.35, 0.22, 0.10), stache='stubble', stache_col=(0.25, 0.20, 0.15), head_r=0.30, neck=None),
}
HEAD_SC = (1.0, 0.95, 0.92)
EYE_X, EYE_Z, BROW_Z, MOUTH_Z = 0.105, 0.015, 0.105, -0.105

# mouth ribbon shapes: z(x) for x in [-1,1]
_MS = {
    'line': lambda x: 0.0,
    'smile': lambda x: 0.55 * x * x - 0.3,
    'frown': lambda x: -0.55 * x * x + 0.3,
    'smirk': lambda x: 0.45 * x + 0.25 * x * x - 0.1,
    'zig': lambda x: 0.28 * math.sin(x * 7.0),
}
NCOL = 13

# face name -> parameters. eye_h: pupil height; eye_w: width; scl: sclera 0/1; pup: pupil scale when sclera; brow_y; brow_a: inner end down (deg);
# brow_x inwards offset; brow_r: raise right(+X) brow extra; mouth: shape weights; mw: width; maw: (w,h) open mouth size; st_y: moustache lift; st_s: moustache scale
FACES = {
    'neutral':    dict(eye_h=0.85, eye_w=1.0, scl=0, pup=1.0, brow_y=0.0, brow_a=-6, brow_x=0, brow_r=0, mouth=dict(line=1), mw=0.7, maw=(0, 0), st_y=0, st_s=1.0),
    'hungry':     dict(eye_h=1.5, eye_w=1.0, scl=1, pup=1.0, brow_y=0.03, brow_a=-24, brow_x=0.01, brow_r=0, mouth=dict(smile=0.4), mw=0.9, maw=(0.05, 0.05), st_y=0.01, st_s=1.0),
    'determined': dict(eye_h=0.65, eye_w=1.1, scl=0, pup=1.0, brow_y=-0.02, brow_a=30, brow_x=0.015, brow_r=0, mouth=dict(frown=0.35), mw=0.75, maw=(0, 0), st_y=-0.005, st_s=1.0),
    'pain':       dict(eye_h=0.14, eye_w=1.3, scl=0, pup=1.0, brow_y=0.03, brow_a=-32, brow_x=0.01, brow_r=0, mouth=dict(zig=0.8), mw=1.1, maw=(0.08, 0.04), st_y=0.02, st_s=1.05),
    'smug':       dict(eye_h=0.5, eye_w=1.15, scl=0, pup=1.0, brow_y=0.0, brow_a=-4, brow_x=0, brow_r=0.045, mouth=dict(smirk=1), mw=0.8, maw=(0, 0), st_y=0.005, st_s=1.0),
    'shock':      dict(eye_h=1.4, eye_w=1.0, scl=1, pup=0.65, brow_y=0.075, brow_a=-8, brow_x=0, brow_r=0, mouth=dict(line=1), mw=0.5, maw=(0.075, 0.1), st_y=0.025, st_s=0.95),
    'betrayed':   dict(eye_h=1.2, eye_w=1.0, scl=1, pup=0.8, brow_y=0.045, brow_a=-35, brow_x=0.015, brow_r=0, mouth=dict(frown=1), mw=0.9, maw=(0, 0), st_y=-0.015, st_s=1.0),
    'chewing':    dict(eye_h=0.4, eye_w=1.2, scl=0, pup=1.0, brow_y=0.02, brow_a=-14, brow_x=0, brow_r=0, mouth=dict(smile=1), mw=0.8, maw=(0.05, 0.03), st_y=0.0, st_s=1.0, cyc='chew'),
    'eyes_shut':  dict(eye_h=0.06, eye_w=1.35, scl=0, pup=1.0, brow_y=0.0, brow_a=-12, brow_x=0, brow_r=0, mouth=dict(smile=0.7), mw=0.7, maw=(0, 0), st_y=0.0, st_s=1.0),
}

LIDS = {'neutral': (0.30, 3), 'hungry': (0, 0), 'determined': (0.38, 16), 'pain': (0.7, -12), 'smug': (0.5, 0),
        'shock': (0, 0), 'betrayed': (0, 0), 'chewing': (0.6, -4), 'eyes_shut': (0.96, 0)}
for _n, (_l, _a) in LIDS.items():
    FACES[_n]['lid'] = _l; FACES[_n]['lid_a'] = _a
    if not FACES[_n]['scl']: FACES[_n]['eye_h'] = FACES[_n]['eye_w'] = 1.0
FACES['neutral'].update(mouth=dict(smirk=0.55), mw=0.5)
FACES['smug'].update(mouth=dict(smirk=1), mw=0.62)
FACES['determined'].update(mouth=dict(frown=0.5), mw=0.55)
FACES['chewing'].update(mouth=dict(smile=0.8), mw=0.6)
FACES['eyes_shut'].update(mouth=dict(smile=0.8), mw=0.5)
FACES['pain']['eye_h'] = 0.8

# pose -> dict. arms: (fwd, out, elbow) degrees; legs (fwd, knee); head (nod, tilt, turn); lean (fwd, twist); hz hips z offset; sq squash (1=none)
P0 = dict(L=(6, 10, 10), R=(6, 10, 10), lL=(0, 0), lR=(0, 0), head=(0, 0, 0), lean=(0, 0), hz=0.0, sq=1.0)


def _p(**k):
    d = dict(P0); d.update(k); return d


POSES = {
    'idle':        _p(),
    'point':       _p(R=(88, 4, 4), L=(-10, 55, 80), head=(-4, 0, -8), lean=(5, -12), lL=(-8, 0), lR=(6, 0)),
    'stab':        _p(R=(62, 6, 12), L=(-25, 30, 20), lean=(20, -20), head=(6, 0, 0), lL=(-30, 20), lR=(35, 30), hz=-0.05),
    'kick':        _p(lR=(78, 6), lL=(-8, 8), lean=(-12, 0), L=(-35, 45, 15), R=(30, 40, 15), hz=-0.01, head=(-4, 0, 0)),
    'smash_down':  _p(L=(92, 8, 15), R=(92, 8, 15), lean=(22, 0), head=(5, 0, 0), hz=-0.07, lL=(20, 35), lR=(20, 35)),
    'throw':       _p(R=(105, 25, 10), L=(45, 10, 25), lean=(12, -28), head=(-4, 0, -12), lL=(24, 12), lR=(-24, 24)),
    'sit':         _p(hz=-0.405, lL=(88, 90), lR=(88, 90), L=(-10, 14, 50), R=(-10, 14, 50), lean=(-3, 0)),
    'recoil':      _p(lean=(-26, 0), head=(-14, 0, 0), L=(-30, 62, 24), R=(-30, 62, 24), lL=(-18, 12), lR=(20, 20), hz=-0.04),
    'shock':       _p(hz=0.07, L=(25, 82, 30), R=(25, 82, 30), lean=(-8, 0), head=(-10, 0, 0), lL=(0, 25), lR=(0, 25), sq=1.1),
    'sigh':        _p(head=(22, 0, 0), L=(-12, 6, 6), R=(-12, 6, 6), lean=(10, 0), hz=-0.035, sq=0.96),
    'chew':        _p(L=(30, 10, 80), R=(30, 10, 80), head=(4, 0, 0), cyc='chew'),
    'bite':        _p(R=(100, 10, 112), L=(-10, 12, 15), head=(14, 0, 0), lean=(7, 0)),
    'peer':        _p(lean=(20, 0), head=(10, 8, 12), R=(120, 15, 115), L=(-5, 28, 30), lL=(10, 10), lR=(-8, 0), hz=-0.01),
    'eyes_closed': _p(head=(-10, 6, 0), lean=(-4, 0), L=(25, 14, 85), R=(25, 14, 85)),
    'smug':        _p(L=(38, -6, 112), R=(38, -6, 112), head=(-8, 9, -6), lean=(-6, 4), lL=(0, 0), lR=(0, 0)),
    'walk':        None, 'march': None,
}


def _walk(t, march=False):
    """cycle pose at time t (frames). walk period 24, march period 20 (stiffer, high knees, big arm swing)."""
    per = 20.0 if march else 24.0
    s = math.sin(2 * math.pi * t / per); c = math.cos(2 * math.pi * t / per)
    legA = 34 if not march else 46
    d = _p(lL=(legA * s, max(0.0, c) * (35 if not march else 60)), lR=(-legA * s, max(0.0, -c) * (35 if not march else 60)),
           L=(-(30 if not march else 55) * s, 8, 15 if not march else 85), R=((30 if not march else 55) * s, 8, 15 if not march else 85),
           hz=0.028 * abs(math.sin(2 * math.pi * t / per)) - 0.02, lean=(6 if not march else 2, 6 * s), head=(0, 0, -4 * s))
    return d


def _idle(t):
    s = math.sin(2 * math.pi * t / 60.0)
    return _p(hz=0.004 * s, sq=1.0 + 0.008 * s, head=(1.0 * s, 0, 0))


def _chew(t):
    s = math.sin(2 * math.pi * t / 10.0)
    d = dict(POSES['chew']); d['head'] = (4 + 3.5 * s, 2.5 * s, 0); d['hz'] = 0.006 * s
    return d


CYCLES = {'walk': lambda t: _walk(t), 'march': lambda t: _walk(t, True), 'chew': _chew, 'idle': _idle}


# ------------------------------------------------------------------ keying machinery
class _Chan:
    __slots__ = ('idb', 'owner', 'attr', 'idx', 'path')

    def __init__(s, idb, owner, attr, idx=-1, path=None):
        s.idb, s.owner, s.attr, s.idx = idb, owner, attr, idx
        s.path = path or attr

    def set(s, v):
        if s.idx >= 0:
            a = getattr(s.owner, s.attr); a[s.idx] = v
        else: setattr(s.owner, s.attr, v)

    def get(s):
        a = getattr(s.owner, s.attr)
        return a[s.idx] if s.idx >= 0 else a

    def key(s, f, v):
        s.set(v); s.idb.keyframe_insert(data_path=s.path, index=s.idx, frame=f)

    def unkey(s, f):
        try: s.idb.keyframe_delete(data_path=s.path, index=s.idx, frame=f)
        except Exception: pass


def _interp(kind):
    pass   # preference is not honoured headless; Char._fix() sets interpolation on the fcurves instead


def _fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action: return []
    from bpy_extras import anim_utils
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    return list(cb.fcurves) if cb else []


def _curve(t, antic=0.12):
    """0->1 with a small anticipation dip first, then ease-out-back overshoot."""
    if t >= 1: return 1.0
    a = 0.28
    if t < a: return -antic * math.sin(math.pi * 0.5 * t / a) ** 1.0 * (1.0)
    u = (t - a) / (1 - a)
    c1, c3 = 1.2, 2.2
    eb = 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
    return -antic * (1 - u) + eb * (1 + antic * 0)


def _ease_face(t):
    return 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2 if t < 1 else 1.0


class Char:
    def __init__(self, kind, name):
        self.kind, self.name = kind, name
        self.root = None
        self.pose_ch = {}      # key -> _Chan
        self.face_ch = {}
        self.st = {}           # current "settled" values per channel key
        self.cyc = {'pose': None, 'face': None}   # (start_f, fn, frames list)
        self.cur_pose = 'idle'; self.cur_face = 'neutral'
        self._pstate = self._flat(P0)
        self._fstate = None
        self._grip_n = 0

    # ---- public API
    def place(self, f, loc, rot_z=0.0):
        """Key root location + yaw (rot_z in radians, 0 = facing -Y), linear."""
        _interp('LINEAR')
        r = self.root
        rz = rot_z
        r.location = loc; r.rotation_euler[2] = rz
        r.keyframe_insert('location', frame=f); r.keyframe_insert('rotation_euler', index=2, frame=f)
        self._fix()

    def pose(self, f, name, dur=10):
        if name not in POSES: raise KeyError(name)
        self._trim('pose', f)
        cur = self._pose_at(f)
        if name in CYCLES:
            fn = CYCLES[name]
            self._transition('pose', self.pose_ch, cur, self._flat(fn(0)), f, dur)
            frames = []
            _interp('CONSTANT')
            t0 = f + dur
            for t in range(0, CYC_LEN, 2):
                tgt = self._flat(fn(t))
                for k, v in tgt.items():
                    self.pose_ch[k].key(t0 + t, v)
                frames.append(t0 + t)
            self.cyc['pose'] = (t0, fn, frames)
        else:
            self._transition('pose', self.pose_ch, cur, self._flat(POSES[name]), f, dur)
            self._pstate = self._flat(POSES[name]); self.cyc['pose'] = None
        self.cur_pose = name; self._fix()

    def face(self, f, name, dur=6):
        F = FACES[name]
        self._trim('face', f)
        cur = self._face_at(f)
        self._transition('face', self.face_ch, cur, self._fflat(F), f, dur, face=True)
        self._fstate = self._fflat(F); self.cyc['face'] = None
        if F.get('cyc'):
            t0 = f + dur; frames = []; _interp('CONSTANT')
            for t in range(0, CYC_LEN, 2):
                s = 0.5 + 0.5 * math.sin(2 * math.pi * t / 10.0)
                m = self._fflat(F); m['maw_h'] = F['maw'][1] * (0.4 + 2.2 * s); m['maw_w'] = F['maw'][0] * (0.9 + 0.3 * s)
                for k in ('maw_h', 'maw_w'): self.face_ch[k].key(t0 + t, m[k])
                frames.append(t0 + t)
            self.cyc['face'] = (t0, None, frames)
            self._fcycle_F = F
        self.cur_face = name; self._fix()

    def hold(self, f, prop, upright=None):
        """Attach prop to the right hand from frame f (influence keyed). prop=None releases the last one.
        upright=True: COPY_LOCATION only, so the prop keeps its own rotation (label faces -Y). Default: True for 'can' and 'lid',
        False (full Copy Transforms) for everything else."""
        if prop is None:
            for c in list(getattr(self, '_held', [])):
                c.influence = 0.0; c.keyframe_insert('influence', frame=f)
            self._held = []; return
        _interp('CONSTANT')
        if upright is None: upright = prop.name in ('can', 'lid')
        c = prop.constraints.new('COPY_LOCATION' if upright else 'COPY_TRANSFORMS'); c.target = self.grip; c.name = 'HOLD_' + self.name
        if upright: self._uprights = getattr(self, '_uprights', []) + [prop]
        c.influence = 0.0; c.keyframe_insert('influence', frame=max(f - 1, -100))
        c.influence = 1.0; c.keyframe_insert('influence', frame=f)
        self._held = getattr(self, '_held', []) + [c]
        for fc in _fcurves(prop):
            for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT' if fc.data_path.endswith('influence') else kp.interpolation

    def _fix(self):
        """CONSTANT everywhere (= on twos) except root location/yaw (LINEAR)."""
        ids = [o for o in bpy.data.objects if o.name.startswith(self.name + '_') or o is self.root]
        ids += [o.data.shape_keys for o in ids if o.type == 'MESH' and o.data.shape_keys]
        for idb in ids:
            lin = idb is self.root
            for fc in _fcurves(idb):
                k = 'LINEAR' if lin else 'CONSTANT'
                for kp in fc.keyframe_points:
                    if kp.interpolation != k: kp.interpolation = k

    # ---- internals
    @staticmethod
    def _flat(P):
        d = {}
        for arm in 'LR':
            for i, n in enumerate(('fwd', 'out', 'elb')): d[f'{arm}_{n}'] = P[arm][i]
        for leg in 'lL', 'lR':
            d[f'{leg}_fwd'], d[f'{leg}_knee'] = P[leg]
        d['head_nod'], d['head_tilt'], d['head_turn'] = P['head']
        d['lean'], d['twist'] = P['lean']
        d['hz'] = P['hz']; d['sq'] = P['sq']
        return d

    @staticmethod
    def _fflat(F):
        d = {k: F[k] for k in ('eye_h', 'eye_w', 'scl', 'brow_y', 'brow_a', 'brow_x', 'brow_r', 'mw', 'st_y', 'st_s')}
        d['maw_w'], d['maw_h'] = F['maw']
        if F['scl']: d['eye_h'] = F['pup']; d['eye_w'] = F['pup'] * 0.9
        top = 0.036 * d['eye_h']
        d['lid_z'] = top * (1 - 2 * F['lid']); d['lid_a'] = F['lid_a']; d['lid_s'] = 0.0 if F['scl'] else 1.0
        for k in _MS: d['m_' + k] = F['mouth'].get(k, 0.0)
        return d

    def _pose_at(self, f):
        c = self.cyc['pose']
        if c and f >= c[0]: return self._flat(c[1](2 * int((f - c[0]) / 2)))
        return dict(self._pstate)

    def _face_at(self, f):
        if self._fstate is None: self._fstate = self._fflat(FACES['neutral'])
        return dict(self._fstate)

    def _trim(self, grp, f):
        c = self.cyc[grp]
        if not c: return
        chans = self.pose_ch if grp == 'pose' else self.face_ch
        for fr in c[2]:
            if fr > f:
                for k, ch in chans.items():
                    if grp == 'face' and not k.startswith('maw'): continue
                    ch.unkey(fr)
        # settled state = value at f (cycle value)
        if grp == 'pose' and f >= c[0]: self._pstate = self._flat(c[1](2 * int((f - c[0]) / 2)))
        self.cyc[grp] = None

    def _transition(self, grp, chans, A, B, f, dur, face=False):
        _interp('CONSTANT')
        n = max(2, dur // 2)
        for j in range(n):
            t = (j + 1) / n
            c = _ease_face(t) if face else _curve(t)
            for k, b in B.items():
                a = A.get(k, b)
                if a == b and j > 0: continue
                chans[k].key(f + 2 * j, a + (b - a) * c)
        for k, b in B.items():     # settle exactly
            chans[k].key(f + 2 * n, b)
        if grp == 'pose': self._pstate = dict(B)


# ------------------------------------------------------------------ construction
def _limb(name, length, r, mat, parent, loc, axis_down=True):
    """thin black stick hanging down -Z from its pivot."""
    pv = empty(name, loc, parent)
    prim('cyl', name + '_s', (r, r, length / 2), (0, 0, -length / 2), mat=mat, parent=pv, seg=10)
    return pv


def make_char(kind, name):
    sp = SPEC[kind]
    ch = Char(kind, name)
    mWhite, mBlack = _white('white'), look.toon_mat('CH_black', BLACK, ink=False)
    mCoat = _white(kind + '_coat') if sp['coat'][0] > 0.9 else _tmat(kind + '_coat', sp['coat']); mHat = _white(kind + '_hat') if sp['hat_col'] == WHITE else _tmat(kind + '_hat', sp['hat_col'])
    root = empty(name, (0, 0, 0)); ch.root = root
    act = empty(name + '_act', (0, 0, 0), root)          # ACTING layer wrapper (squash/hop/lean about the feet)
    hips = empty(name + '_hips', (0, 0, HIP_Z), act)
    torso = empty(name + '_torso', (0, 0, 0), hips)
    neck = empty(name + '_neck', (0, 0, BODY_H - 0.02), torso)
    hr = sp['head_r']

    # body bean
    bw = sp['body_w']
    prim('sphere', name + '_body', (bw, bw * 0.85, BODY_H * 0.58), (0, 0, BODY_H * 0.52), mat=mCoat, parent=torso, ink=INK_BODY, seg=32)
    if sp.get('apron'):
        mAp = _tmat('apron', (0.92, 0.94, 1.0))
        ay = -bw * 0.83 * 0.97
        prim('sphere', name + '_apron', (bw * 0.80, 0.022, BODY_H * 0.27), (0, ay, BODY_H * 0.40), mat=mAp, parent=torso, ink=0.008)
        prim('cube', name + '_apedge', (bw * 0.78, 0.004, 0.006), (0, ay - 0.022, BODY_H * 0.40 + BODY_H * 0.255), mat=look.toon_mat('CH_black', BLACK, ink=False), parent=torso)
        prim('tri', name + '_scarf', (0.06, 1, 0.062), (0, -bw * 0.66 - 0.012, BODY_H * 0.84), mat=_tmat('scarf', (0.85, 0.08, 0.12)), parent=torso)
    if sp.get('sash'):   # belt band wrapped round the bean
        prim('cyl', name + '_belt', (bw * 0.93, bw * 0.78, 0.022), (0, 0, BODY_H * 0.28), mat=_tmat(kind + '_belt', sp['sash']), parent=torso, seg=32)
    if sp.get('trim'):
        mT = _tmat(kind + '_trim', sp['trim'])
        for i, z in enumerate((0.62, 0.50, 0.38)):
            prim('sphere', f'{name}_btn{i}', (0.018, 0.012, 0.018), (0.0, -bw * 0.85 * math.sqrt(1 - ((z - 0.52 * 1) / 0.58 / 1.0 * BODY_H / BODY_H) ** 2 * 0.0) * 0.96 + 0.0, BODY_H * z), mat=mT, parent=torso)
        for sx in (-1, 1):   # epaulettes
            prim('sphere', f'{name}_ep{sx}', (0.05, 0.04, 0.02), (sx * bw * 0.86, 0, BODY_H * 0.92), (0, D(-sx * 25), 0), mat=mT, parent=torso)

    # head
    head = empty(name + '_head', (0, 0, 0), neck)
    hc = empty(name + '_hc', (0, 0, hr * HEAD_SC[2] - 0.03), head)
    prim('sphere', name + '_skull', tuple(hr * s for s in HEAD_SC), (0, 0, 0), mat=mWhite, parent=hc, ink=INK_HEAD, seg=40)

    # face slots on the head surface
    def surf(x, z, off=0.004):
        a, b, c = (hr * s for s in HEAD_SC)
        y = -b * math.sqrt(max(0.05, 1 - (x / a) ** 2 - (z / c) ** 2)) - off
        n = Vector((x / a ** 2, y / b ** 2, z / c ** 2)).normalized()
        q = n.to_track_quat('-Y', 'Z')
        return (x, y, z), q.to_euler()

    def slot(nm, x, z, off=0.004):
        loc, rot = surf(x, z, off)
        return empty(nm, loc, hc, rot)

    fc = {}
    pupR = (0.034, 0.012, 0.036)
    for side, sx in (('L', 1), ('R', -1)):
        sl = slot(f'{name}_eye{side}', sx * EYE_X, EYE_Z)
        scl = empty(f'{name}_scl{side}', (0, 0, 0), sl)
        prim('sphere', f'{name}_sclring{side}', (0.084, 0.014, 0.088), (0, 0.0, 0), mat=mBlack, parent=scl, seg=24)
        prim('sphere', f'{name}_sclw{side}', (0.072, 0.014, 0.076), (0, -0.008, 0), mat=mWhite, parent=scl, seg=24)
        pup = prim('sphere', f'{name}_pup{side}', pupR, (0, -0.020, 0), mat=mBlack, parent=sl, seg=20)
        eact = empty(f'{name}_eact{side}', (0, 0, 0), sl)     # acting layer: eye widen
        blink = empty(f'{name}_blink{side}', (0, 0, 0), eact)   # scales the pupil+sclera vertically for blinks
        pup.parent = blink; scl.parent = blink
        bs = slot(f'{name}_brow{side}', sx * EYE_X, BROW_Z)
        lid = empty(f'{name}_lid{side}', (0, 0, 0), blink)
        prim('cube', f'{name}_lidc{side}', (0.066, 0.004, 0.02), (0, -0.044, 0.02), mat=mWhite, parent=lid)
        prim('sphere', f'{name}_lidl{side}', (0.062, 0.009, 0.0115), (0, -0.05, 0.0), mat=mBlack, parent=lid, seg=16)
        boff = empty(f'{name}_boff{side}', (0, 0, 0), bs)
        bact = empty(f'{name}_bact{side}', (0, 0, 0), boff)   # acting layer: brow raise/angle
        brow = prim('sphere', f'{name}_browm{side}', (0.085, 0.010, 0.0165), (0, -0.006, 0), mat=mBlack, parent=bact, seg=16)
        fc[side] = dict(lid=lid, pup=pup, scl=scl, brow=brow, bs=bs, boff=boff, blink=blink, sx=sx, eact=eact, bact=bact)
    ch._blink = [fc['L']['blink'], fc['R']['blink']]
    # nose dot
    nsl = slot(name + '_nose', 0, -0.035, 0.004)
    prim('sphere', name + '_nosem', (0.011, 0.007, 0.009), (0, -0.002, 0), mat=mBlack, parent=nsl, seg=10)
    # mouth ribbon with shape keys
    msl = slot(name + '_mouth', 0, MOUTH_Z, 0.003)
    mo = _mouth(name, msl, mBlack)
    maw_sl = slot(name + '_maw', 0, MOUTH_Z - 0.01, 0.006)
    maw = prim('sphere', name + '_mawm', (1, 0.006, 1), (0, 0, 0), mat=_tmat('maw', (0.22, 0.03, 0.05)), parent=maw_sl, seg=20)
    prim('sphere', name + '_tongue', (0.5, 0.004, 0.35), (0, -0.003, -0.4), mat=_tmat('tongue', (0.95, 0.35, 0.40)), parent=maw, seg=14)
    # moustache
    st = _stache(name, sp, hc, surf)

    # hat
    _hat(name, sp, head, hr, mHat, mWhite)

    # arms
    mStick = mBlack
    sh = {}
    for side, sx in (('L', 1), ('R', -1)):
        sa = empty(f'{name}_sa{side}', (sx * (bw * 0.93), 0, BODY_H * 0.72), torso)   # acting layer: arm swing
        a = empty(f'{name}_sh{side}', (0, 0, 0), sa)
        prim('cyl', f'{name}_ua{side}', (0.021, 0.021, ARM_U / 2), (0, 0, -ARM_U / 2), mat=mStick, parent=a, seg=10)
        el = empty(f'{name}_el{side}', (0, 0, -ARM_U), a)
        prim('cyl', f'{name}_fa{side}', (0.021, 0.021, ARM_F / 2), (0, 0, -ARM_F / 2), mat=mStick, parent=el, seg=10)
        hand = empty(f'{name}_hand{side}', (0, 0, -ARM_F), el)
        prim('sphere', f'{name}_fist{side}', (0.044, 0.04, 0.05), (0, 0, -0.015), mat=mStick, parent=hand, seg=14)
        sh[side] = (a, el, hand); ch._sa = getattr(ch, '_sa', {}); ch._sa[side] = sa
    ch.grip = empty(name + '_grip', (0, -0.02, -0.03), sh['R'][2], (D(-90), 0, 0))
    # legs
    lg = {}
    for side, sx in (('L', 1), ('R', -1)):
        th = _limb(f'{name}_th{side}', LEG_T, 0.021, mStick, hips, (sx * bw * 0.45, 0, 0.0))
        kn = empty(f'{name}_kn{side}', (0, 0, -LEG_T), th)
        prim('cyl', f'{name}_sn{side}', (0.024, 0.024, LEG_S / 2), (0, 0, -LEG_S / 2), mat=mStick, parent=kn, seg=10, ink=0.008)
        prim('sphere', f'{name}_ft{side}', (0.05, 0.078, 0.028), (0, -0.03, -LEG_S + 0.008), mat=mStick, parent=kn, seg=14)
        lg[side] = (th, kn)

    # channels (pose)
    P = ch.pose_ch
    for side in 'LR':
        a, el, _ = sh[side]; s = 1 if side == 'L' else -1
        ch._pc(P, f'{side}_fwd', a, 'rotation_euler', 0)
        ch._pc(P, f'{side}_out', a, 'rotation_euler', 1)
        ch._pc(P, f'{side}_elb', el, 'rotation_euler', 0)
    for side in 'LR':
        th, kn = lg[side]
        ch._pc(P, f'l{side}_fwd', th, 'rotation_euler', 0); ch._pc(P, f'l{side}_knee', kn, 'rotation_euler', 0)
    ch._pc(P, 'head_nod', neck, 'rotation_euler', 0); ch._pc(P, 'head_tilt', neck, 'rotation_euler', 1); ch._pc(P, 'head_turn', neck, 'rotation_euler', 2)
    ch._pc(P, 'lean', torso, 'rotation_euler', 0); ch._pc(P, 'twist', torso, 'rotation_euler', 2)
    ch._pc(P, 'hz', hips, 'location', 2); ch._pc(P, 'sq', torso, 'scale', 2)
    # derived scale x on torso follows sq inversely via driver-free trick: keyed alongside in _apply
    ch._act, ch._head = act, head
    maw_f = prim('sphere', name + '_flap', (1, 0.006, 1), (0, -0.002, 0), mat=_tmat('maw', (0.22, 0.03, 0.05)), parent=maw_sl, seg=20)
    prim('sphere', name + '_flapt', (0.5, 0.004, 0.3), (0, -0.003, -0.45), mat=_tmat('tongue', (0.95, 0.35, 0.40)), parent=maw_f, seg=12)
    maw_f.scale = (0.0001, 1, 0.0001); ch._flap = maw_f
    ch._parts = dict(sh=sh, lg=lg, hips=hips, torso=torso, neck=neck, fc=fc, mo=mo, maw=maw, maw_sl=maw_sl, st=st)
    # facial channels
    F = ch.face_ch
    for side in 'LR':
        d = fc[side]
        ch._fc(F, f'e_{side}', d)
    ch._build_face_channels(fc, mo, maw, st)

    # initial state at frame -50 (rest)
    ch._init(-50)
    ch._blinks(); ch._fix()
    return ch


def _mouth(name, parent, mat):
    n = NCOL
    me = bpy.data.meshes.new(name + '_mouth')
    th = 0.0075
    vs = []
    for i in range(n): vs.append((-1 + 2 * i / (n - 1), 0, th))
    for i in range(n): vs.append((-1 + 2 * i / (n - 1), 0, -th))
    fs = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    me.from_pydata(vs, [], fs)
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name + '_mouthm', me); bpy.context.scene.collection.objects.link(o)
    o.parent = parent; me.materials.append(mat)
    o.shade_flat if False else None
    o.shape_key_add(name='line')
    for k, fn in _MS.items():
        if k == 'line': continue
        sk = o.shape_key_add(name=k)
        for i in range(n):
            x = -1 + 2 * i / (n - 1); z = fn(x) * 0.1   # scale shapes to ~0.1 height at the corners
            sk.data[i].co = Vector((x, 0, z + th)); sk.data[n + i].co = Vector((x, 0, z - th))
    return o


def _stache(name, sp, head, surf):
    kind = sp['stache']
    mS = _tmat(name + '_stache', sp['stache_col'])
    loc, rot = surf(0, -0.075, 0.012)
    sl = empty(name + '_stslot', loc, head, rot)
    st = empty(name + '_st', (0, 0, 0), sl)
    if kind == 'big':       # Gaston: fat handlebar
        for sx in (-1, 1):
            prim('sphere', f'{name}_stl{sx}', (0.075, 0.02, 0.04), (sx * 0.07, 0, 0.0), (0, D(sx * -18), 0), mat=mS, parent=st, ink=0.006, seg=18)
            prim('sphere', f'{name}_stc{sx}', (0.03, 0.018, 0.03), (sx * 0.16, -0.003, 0.03), mat=mS, parent=st, ink=0.005, seg=14)
    elif kind == 'small':   # Marcel: neat brown tache
        for sx in (-1, 1):
            prim('sphere', f'{name}_stl{sx}', (0.055, 0.017, 0.028), (sx * 0.045, 0, 0.0), (0, D(sx * -14), 0), mat=mS, parent=st, ink=0.005, seg=16)
    elif kind == 'stubble':
        prim('sphere', f'{name}_stl', (0.10, 0.012, 0.022), (0, 0, 0.0), mat=mS, parent=st, seg=16)
    return st


def _hat(name, sp, head, hr, mHat, mWhite):
    z0 = hr * HEAD_SC[2] * 1.72 - 0.03    # top-of-skull height in the head frame (hc is at hr*0.92-0.03)
    z_top = hr * HEAD_SC[2] * 2 - 0.03 - 0.03
    hatp = empty(name + '_hat', (0, 0, z_top - (0.075 if sp['hat'] == 'kepi2' else 0.015)), head)
    k = sp['hat']
    if k == 'chef':
        band = prim('cone', name + '_band', (0.26, 0.26, 0.14), (0, 0, 0.14), mat=mWhite, parent=hatp, ink=INK_HAT, seg=36, r2=1.1)
        prim('cone', name + '_bandfix', (0.26, 0.26, 0.001), (0, 0, 0.0), mat=mWhite, parent=hatp, seg=8)
        prim('sphere', name + '_puff', (0.34, 0.30, 0.15), (0, 0, 0.33), mat=mWhite, parent=hatp, ink=INK_HAT, seg=32)
        prim('sphere', name + '_puff2', (0.25, 0.23, 0.10), (0, 0, 0.42), mat=mWhite, parent=hatp, ink=INK_HAT, seg=28)
        mLine = look.toon_mat('CH_pleat', (0.72, 0.74, 0.85), ink=False)
        for i in range(-4, 5):
            ang = i * 0.15
            prim('cube', f'{name}_pl{i}', (0.004, 0.003, 0.11), (0.28 * math.sin(ang), -0.28 * math.cos(ang), 0.15), (0, 0, ang), mat=mLine, parent=hatp, seg=4)
    elif k == 'kepi':
        mT = _tmat('kepi_trim', sp['trim'])
        prim('sphere', name + '_cap', (0.35, 0.29, 0.11), (0.0, 0.0, 0.05), (0, D(-6), D(-5)), mat=mHat, parent=hatp, ink=INK_HAT, seg=32)
        prim('sphere', name + '_capr', (0.37, 0.31, 0.04), (0.0, 0.0, 0.0), (0, D(-6), D(-5)), mat=mT, parent=hatp, ink=INK_HAT, seg=32)
        prim('cone', name + '_vis', (0.17, 0.12, 0.012), (-0.02, -0.21, 0.015), (D(10), 0, 0), mat=mHat, parent=hatp, ink=0.01, seg=20)
        em = _tmat('kepi_emb', (0.9, 0.1, 0.1))
        prim('cyl', name + '_emb', (0.05, 0.05, 0.006), (0.0, -0.2, 0.09), (D(78), 0, 0), mat=em, parent=hatp, ink=0.006, seg=20)
        prim('cyl', name + '_embw', (0.025, 0.025, 0.008), (0.0, -0.205, 0.09), (D(78), 0, 0), mat=mWhite, parent=hatp, seg=16)
    elif k == 'kepi2':   # flat-top kepi, short visor, gold badge
        mT = _tmat('kepi2_trim', sp['trim'])
        prim('cone', name + '_k2', (0.27, 0.25, 0.065), (0, 0, 0.065), mat=mHat, parent=hatp, ink=INK_HAT, seg=32, r2=1.18)
        prim('cyl', name + '_k2top', (0.32, 0.295, 0.012), (0, 0, 0.13), mat=mHat, parent=hatp, ink=INK_HAT, seg=32)
        prim('cyl', name + '_k2band', (0.272, 0.252, 0.016), (0, 0, 0.018), mat=_tmat('k2band', (0.26, 0.28, 0.10)), parent=hatp, seg=32)
        prim('cone', name + '_vis', (0.17, 0.11, 0.011), (0, -0.25, 0.012), (D(12), 0, 0), mat=mHat, parent=hatp, ink=0.01, seg=20)
        prim('cyl', name + '_badge', (0.03, 0.03, 0.006), (0, -0.265, 0.075), (D(80), 0, 0), mat=mT, parent=hatp, ink=0.005, seg=16)
    elif k == 'helmet':
        prim('sphere', name + '_hel', (0.34, 0.31, 0.19), (0, 0.0, 0.07), mat=mHat, parent=hatp, ink=INK_HAT, seg=32)
        prim('cyl', name + '_rim', (0.37, 0.34, 0.012), (0, 0, -0.03), mat=mHat, parent=hatp, ink=INK_HAT, seg=32)
        prim('cube', name + '_strap', (0.012, 0.01, 0.08), (0.14, -0.2, -0.08), mat=_tmat('strap', (0.2, 0.15, 0.1)), parent=hatp)


def _pc(self, P, key, obj, attr, idx): P[key] = _Chan(obj, obj, attr, idx)
Char._pc = _pc
def _fcm(self, F, key, d): pass
Char._fc = _fcm


def _build_face_channels(self, fc, mo, maw, st):
    F = self.face_ch
    for side in 'LR':
        d = fc[side]
    # one shared channel set per attribute; applied to both sides in key()
    class Multi:
        """a virtual channel that keys several real channels from one value."""
        def __init__(s, chans, fn): s.chans, s.fn = chans, fn
        def key(s, f, v):
            for c, w in zip(s.chans, s.fn(v)): c.key(f, w)
        def unkey(s, f):
            for c in s.chans: c.unkey(f)
        def get(s): return 0.0

    def ch(o, attr, i): return _Chan(o, o, attr, i)
    L, R = fc['L'], fc['R']
    EH = 0.85
    F['eye_h'] = Multi([ch(L['pup'], 'scale', 2), ch(R['pup'], 'scale', 2)], lambda v: (v, v))
    F['eye_w'] = Multi([ch(L['pup'], 'scale', 0), ch(R['pup'], 'scale', 0)], lambda v: (v, v))
    F['scl'] = Multi([ch(L['scl'], 'scale', i) for i in range(3)] + [ch(R['scl'], 'scale', i) for i in range(3)],
                     lambda v: [max(v, 0.001)] * 6)
    F['lid_z'] = Multi([ch(L['lid'], 'location', 2), ch(R['lid'], 'location', 2)], lambda v: (v, v))
    F['lid_a'] = Multi([ch(L['lid'], 'rotation_euler', 1), ch(R['lid'], 'rotation_euler', 1)], lambda v: (-D(v), D(v)))
    F['lid_s'] = Multi([ch(L['lid'], 'scale', i) for i in range(3)] + [ch(R['lid'], 'scale', i) for i in range(3)], lambda v: [max(v, 0.001)] * 6)
    F['brow_y'] = Multi([ch(L['boff'], 'location', 2), ch(R['boff'], 'location', 2)], lambda v: (v, v))
    F['brow_x'] = Multi([ch(L['boff'], 'location', 0), ch(R['boff'], 'location', 0)], lambda v: (-v, v))
    F['brow_a'] = Multi([ch(L['brow'].parent and L['brow'], 'rotation_euler', 1), ch(R['brow'], 'rotation_euler', 1)],
                        lambda v: (-D(v), D(v)))
    F['brow_r'] = Multi([ch(R['brow'], 'location', 2)], lambda v: (v,))   # raise one brow
    # mouth shape keys
    key = mo.data.shape_keys
    for k in _MS:
        if k == 'line': continue
        F['m_' + k] = Multi([_Chan(key, key.key_blocks[k], 'value', -1, f'key_blocks["{k}"].value')], lambda v: (v,))
    F['m_line'] = Multi([], lambda v: ())
    F['mw'] = Multi([ch(mo, 'scale', 0)], lambda v: (v * 0.1,))
    F['maw_w'] = Multi([ch(maw, 'scale', 0)], lambda v: (max(v, 0.0001),))
    F['maw_h'] = Multi([ch(maw, 'scale', 2)], lambda v: (max(v, 0.0001),))
    F['st_y'] = Multi([ch(st, 'location', 2)], lambda v: (v,))
    F['st_s'] = Multi([ch(st, 'scale', 0), ch(st, 'scale', 2)], lambda v: (v, v))


Char._build_face_channels = _build_face_channels


def _init(self, f):
    """key the rest pose + neutral face on frame f so nothing is unkeyed before the first call."""
    _interp('CONSTANT')
    B = self._flat(P0)
    for k, v in B.items(): self.pose_ch[k].key(f, v)
    self._pstate = dict(B)
    # squash: torso scale x/y inverse of z handled at key time
    self._fstate = self._fflat(FACES['neutral'])
    for k, v in self._fstate.items():
        if k in self.face_ch: self.face_ch[k].key(f, v)
    self._fstate = dict(self._fstate)


Char._init = _init


def _blinks(self):
    rnd = random.Random(hash(self.name) & 0xffff)
    _interp('CONSTANT')
    chs = [(b, _Chan(b, b, 'scale', 2)) for b in self._blink]
    for b, c in chs: c.key(-60, 1.0)
    f = rnd.randint(20, 60)
    while f < BLINK_LEN:
        for b, c in chs:
            c.key(f, 0.12); c.key(f + 2, 0.5); c.key(f + 4, 1.0)
        f += rnd.randint(70, 130)


Char._blinks = _blinks


# ---- squash on torso: scale.x/y keyed with sq inverse (patch Char._transition keys)
_orig_key = _Chan.key


def _sq_key(self, f, v):
    _orig_key(self, f, v)
    if self.attr == 'scale' and self.owner.name.endswith('_torso'):
        k = 1.0 / math.sqrt(max(v, 0.2))
        for i in (0, 1):
            self.owner.scale[i] = k; self.idb.keyframe_insert(data_path='scale', index=i, frame=f)


_Chan.key = _sq_key


def _sq_unkey(self, f):
    try: self.idb.keyframe_delete(data_path=self.path, index=self.idx, frame=f)
    except Exception: pass
    if self.attr == 'scale' and self.owner.name.endswith('_torso'):
        for i in (0, 1):
            try: self.idb.keyframe_delete(data_path='scale', index=i, frame=f)
            except Exception: pass


_Chan.unkey = _sq_unkey


# arms need sign conventions applied at key time: wrap fwd/out/knee/lean
_SIGN = {'L_fwd': (0, -1), 'R_fwd': (0, -1), 'L_elb': (0, -1), 'R_elb': (0, -1), 'lL_fwd': (0, -1), 'lR_fwd': (0, -1),
         'lL_knee': (0, 1), 'lR_knee': (0, 1), 'lean': (0, 1), 'head_nod': (0, 1), 'twist': (2, 1), 'head_turn': (2, 1), 'head_tilt': (1, 1)}


def _pc2(self, P, key, obj, attr, idx):
    c = _Chan(obj, obj, attr, idx)
    sgn = {'L_out': -1, 'R_out': 1}.get(key, None)
    k = _SIGN.get(key)
    mult = (k[1] if k else (sgn if sgn else 1))
    if key == 'hz': mult = 1
    base = c.key
    if attr == 'rotation_euler' or key == 'hz':
        class W:
            def key(s, f, v): c.key(f, (D(v) if attr == 'rotation_euler' else v + (HIP_Z if key == 'hz' else 0.0)) * mult)   # hips z = HIP_Z + hz (feet on the root plane)
            def unkey(s, f): c.unkey(f)
            def get(s): return 0.0
        P[key] = W()
    else:
        P[key] = c


Char._pc = _pc2


def _fix_pose_chan_overrides():
    pass


def make_all(names=('marcel', 'gaston', 'soldier')):
    return {n: make_char(n, n.capitalize()) for n in names}


# =====================================================================================================
# ACTING LAYER (additive, on twos). Sits on wrapper empties (act / head / sa{L,R} / eact / bact / flap),
# so it never fights the pose/face keys. Everything is a *layer*: (start_f, dur, {channel: curve}).
# Channels (face channels run LEAD=2 frames BEFORE body channels = eyes/brows lead the action):
#   body: dx dy dz (m, +dy = away from camera) | lx (lean fwd deg) ly (roll) lr (turn) | sq (z-scale offset; x/y keep volume)
#   head: hx (nod fwd) hy (tilt) hr (turn) hsq (head squash, volume kept)
#   arms: aL aR (swing fwd deg) oL oR (out deg)
#   face: ey (eye widen) bz (brows up, m) ba (brow inner-down deg) br (right brow extra up) mh mw (flap mouth h/w, m)
# A curve is a list of (t, v) points (cosine-eased between them) or a callable f(t).
# Usage:  c.react(f, 'shock'); c.squash(f, -0.2, 10); c.talk(f_in, f_out, words); c.lean(f, 12, 20); c.bake(0, 1830)
# =====================================================================================================
LEAD = 2
HEAD_MAX = 8.0   # deg: max net forward head pitch (keeps eyes out from under the cap / chef hat)
ALIVE_TIMING = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '4-short-v2', 'voice', 'voice-final-timing.json')
LX_K = 0.35   # whole-body lean pivots at the feet; halve so tall legs do not fling the head at the lens
FACE_CH = ('ey', 'bz', 'ba', 'br', 'mh', 'mw', 'pt')   # pt = tilt (deg) of an upright-held prop toward the mouth
BODY_CH = ('dx', 'dy', 'dz', 'lx', 'ly', 'lr', 'sq', 'hx', 'hy', 'hr', 'hsq', 'aL', 'aR', 'oL', 'oR')
CH_ALL = BODY_CH + FACE_CH


def _ev(c, t):
    """evaluate a curve at t. list of (t, v) -> cosine ease between points, clamp ends."""
    if callable(c): return c(t)
    if t <= c[0][0]: return c[0][1]
    for (t0, v0), (t1, v1) in zip(c, c[1:]):
        if t <= t1:
            u = (t - t0) / max(1e-6, t1 - t0)
            return v0 + (v1 - v0) * (1 - math.cos(math.pi * u)) * 0.5
    return c[-1][1]


def _wob(a, per, dec, ph=0.0):
    return lambda t: a * math.exp(-dec * t) * math.sin(2 * math.pi * t / per + ph)


def _two(a, b, n=2):
    """same arm/eye move both sides"""
    return a, b


def _S(*pts): return list(pts)


def _hold_pair(v, t_in, t_out, end):
    return [(0, 0), (t_in, v), (t_out, v), (end, 0)]


# name -> (duration, hold_start_t or None, {channel: curve}). Anticipation (opposite way, 2-4 f) -> action -> overshoot -> settle -> HOLD -> recover.
REACTS = {
    'shock': (44, 14, dict(
        sq=[(0, 0), (3, -0.13), (6, 0.2), (9, -0.07), (12, 0.04), (14, 0.02), (36, 0.02), (44, 0)],
        dz=[(0, 0), (3, 0), (7, 0.16), (10, 0), (44, 0)], lx=[(0, 0), (3, 5), (7, -11), (11, -5), (14, -7), (36, -7), (44, 0)],
        hx=[(0, 0), (3, 6), (8, -14), (13, -8), (36, -8), (44, 0)], aL=[(0, 0), (3, -10), (8, 30), (13, 18), (36, 18), (44, 0)],
        aR=[(0, 0), (3, -10), (8, 30), (13, 18), (36, 18), (44, 0)], oL=[(0, 0), (8, 40), (13, 28), (36, 28), (44, 0)], oR=[(0, 0), (8, 40), (13, 28), (36, 28), (44, 0)],
        ey=[(0, 0), (2, -0.15), (5, 0.55), (9, 0.35), (36, 0.35), (44, 0)], bz=[(0, 0), (2, -0.01), (5, 0.07), (9, 0.045), (36, 0.045), (44, 0)],
        mh=[(0, 0), (4, 0), (7, 0.1), (11, 0.075), (36, 0.075), (42, 0)], mw=[(0, 0), (4, 0), (7, 0.06), (11, 0.05), (36, 0.05), (42, 0)])),
    'jump': (38, 22, dict(
        sq=[(0, 0), (4, -0.2), (7, 0.2), (14, 0.12), (19, -0.22), (22, -0.04), (25, 0.05), (28, 0), (38, 0)],
        dz=[(0, 0), (4, 0), (6, 0.1), (14, 0.5), (19, 0), (38, 0)], lx=[(0, 0), (4, 8), (8, -6), (19, 4), (24, 0), (38, 0)],
        aL=[(0, 0), (4, -25), (9, 85), (17, 70), (22, 5), (28, 0), (38, 0)], aR=[(0, 0), (4, -25), (9, 85), (17, 70), (22, 5), (28, 0), (38, 0)],
        oL=[(0, 0), (9, 30), (17, 30), (22, 0), (38, 0)], oR=[(0, 0), (9, 30), (17, 30), (22, 0), (38, 0)],
        hx=[(0, 0), (4, 8), (9, -8), (19, 6), (26, 0), (38, 0)], ey=[(0, 0), (4, -0.1), (8, 0.4), (19, 0.1), (26, 0), (38, 0)],
        bz=[(0, 0), (8, 0.05), (19, 0.03), (26, 0), (38, 0)], mh=[(0, 0), (6, 0), (9, 0.09), (19, 0.06), (24, 0), (38, 0)], mw=[(0, 0), (6, 0), (9, 0.06), (19, 0.05), (24, 0), (38, 0)])),
    'slump': (60, 18, dict(
        sq=[(0, 0), (3, 0.05), (9, -0.17), (12, -0.1), (15, -0.13), (18, -0.12), (50, -0.12), (60, 0)],
        lx=[(0, 0), (3, -5), (10, 20), (14, 14), (18, 16), (50, 16), (60, 0)], hx=[(0, 0), (3, -6), (10, 28), (14, 22), (18, 24), (50, 24), (60, 0)],
        hy=[(0, 0), (12, 0), (20, 9), (50, 9), (60, 0)], dz=[(0, 0), (9, -0.03), (50, -0.03), (60, 0)],
        aL=[(0, 0), (3, 12), (10, -28), (18, -20), (50, -20), (60, 0)], aR=[(0, 0), (3, 12), (10, -28), (18, -20), (50, -20), (60, 0)],
        oL=[(0, 0), (10, -8), (50, -8), (60, 0)], oR=[(0, 0), (10, -8), (50, -8), (60, 0)],
        ey=[(0, 0), (6, -0.35), (50, -0.35), (60, 0)], ba=[(0, 0), (6, -14), (50, -14), (60, 0)], bz=[(0, 0), (6, -0.01), (50, -0.01), (60, 0)],
        mh=[(0, 0), (8, 0.0), (12, 0.04), (18, 0), (60, 0)], mw=[(0, 0), (12, 0.03), (18, 0), (60, 0)])),
    'recoil_hit': (46, 16, dict(
        lx=[(0, 0), (3, 7), (6, -24), (9, -30), (12, -20), (16, -22), (36, -22), (46, 0)], dy=[(0, 0), (3, -0.02), (7, 0.16), (12, 0.1), (36, 0.1), (46, 0)],
        sq=[(0, 0), (3, 0.05), (6, -0.14), (9, 0.05), (12, -0.04), (16, 0), (46, 0)], hx=[(0, 0), (3, 8), (6, -22), (10, -14), (36, -14), (46, 0)],
        ly=lambda t: 7 * math.exp(-0.07 * t) * math.sin(2 * math.pi * t / 8) if 6 <= t < 36 else 0.0,
        aL=[(0, 0), (6, 40), (12, 25), (36, 25), (46, 0)], aR=[(0, 0), (6, 40), (12, 25), (36, 25), (46, 0)],
        oL=[(0, 0), (7, 45), (12, 30), (36, 30), (46, 0)], oR=[(0, 0), (7, 45), (12, 30), (36, 30), (46, 0)],
        ey=[(0, 0), (2, 0.2), (4, -0.55), (36, -0.5), (46, 0)], ba=[(0, 0), (4, -22), (36, -22), (46, 0)], bz=[(0, 0), (4, 0.05), (36, 0.05), (46, 0)],
        mh=[(0, 0), (4, 0), (6, 0.09), (30, 0.07), (40, 0)], mw=[(0, 0), (4, 0), (6, 0.08), (30, 0.07), (40, 0)])),
    'proud_puff': (62, 20, dict(
        sq=[(0, 0), (4, -0.06), (10, 0.1), (13, 0.12), (20, 0.1), (50, 0.1), (62, 0)], lx=[(0, 0), (4, 5), (12, -10), (20, -8), (50, -8), (62, 0)],
        hx=[(0, 0), (4, 6), (12, -14), (20, -12), (50, -12), (62, 0)], hy=[(0, 0), (12, 0), (24, -6), (50, -6), (62, 0)],
        oL=[(0, 0), (12, 28), (50, 28), (62, 0)], oR=[(0, 0), (12, 28), (50, 28), (62, 0)], aL=[(0, 0), (12, -6), (50, -6), (62, 0)], aR=[(0, 0), (12, -6), (50, -6), (62, 0)],
        hsq=[(0, 0), (8, -0.03), (14, 0.05), (20, 0.03), (50, 0.03), (62, 0)], bz=[(0, 0), (6, 0.03), (50, 0.03), (62, 0)], ey=[(0, 0), (6, -0.25), (50, -0.25), (62, 0)],
        ba=[(0, 0), (6, 10), (50, 10), (62, 0)], br=[(0, 0), (10, 0.03), (50, 0.03), (62, 0)])),
    'betrayed_droop': (70, 24, dict(
        ey=[(0, 0), (4, 0.35), (12, 0.25), (24, 0.25), (60, 0.25), (70, 0)], ba=[(0, 0), (6, -26), (60, -26), (70, 0)], bz=[(0, 0), (6, 0.03), (60, 0.03), (70, 0)],
        hx=[(0, 0), (3, -5), (12, 22), (16, 18), (24, 20), (60, 20), (70, 0)], hy=[(0, 0), (14, 0), (26, 9), (60, 9), (70, 0)],
        hr=[(0, 0), (30, 0), (40, 14), (50, 14), (60, 0), (70, 0)],
        lx=[(0, 0), (3, -3), (14, 11), (24, 9), (60, 9), (70, 0)], sq=[(0, 0), (4, 0.03), (14, -0.09), (18, -0.07), (24, -0.08), (60, -0.08), (70, 0)],
        aL=[(0, 0), (14, -18), (60, -18), (70, 0)], aR=[(0, 0), (14, -18), (60, -18), (70, 0)],
        mh=[(0, 0), (14, 0), (18, 0.03), (24, 0), (70, 0)])),
    'chew_bob': (40, None, dict(
        hx=lambda t: 4.5 * math.sin(2 * math.pi * t / 10), sq=lambda t: 0.03 * math.sin(2 * math.pi * t / 10 + 1.2),
        hy=lambda t: 3 * math.sin(2 * math.pi * t / 20), dz=lambda t: 0.006 * abs(math.sin(math.pi * t / 10)),
        mh=lambda t: 0.012 + 0.03 * max(0.0, math.sin(2 * math.pi * t / 10)), mw=lambda t: 0.03 + 0.012 * max(0.0, math.sin(2 * math.pi * t / 10)),
        ey=lambda t: -0.2 + 0.05 * math.sin(2 * math.pi * t / 10), aL=lambda t: 3 * math.sin(2 * math.pi * t / 10), aR=lambda t: 3 * math.sin(2 * math.pi * t / 10))),
    'march_bounce': (24, None, dict(
        dz=lambda t: 0.065 * abs(math.sin(math.pi * t / 12)), sq=lambda t: -0.07 * (1 - abs(math.sin(math.pi * t / 12))) ** 2 + 0.03 * abs(math.sin(math.pi * t / 12)),
        lx=lambda t: 4 + 2 * math.sin(2 * math.pi * t / 12), ly=lambda t: 5 * math.sin(math.pi * t / 12), hy=lambda t: -4 * math.sin(math.pi * t / 12),
        hx=lambda t: -2 * math.sin(2 * math.pi * t / 12), hsq=lambda t: 0.02 * math.sin(2 * math.pi * t / 12 + 1), bz=lambda t: 0.01)),
    'point_jab': (40, 16, dict(
        aR=[(0, 0), (3, -45), (6, 28), (9, 16), (13, 18), (30, 18), (40, 0)], oR=[(0, 0), (6, -6), (30, -6), (40, 0)],
        lx=[(0, 0), (3, -6), (6, 10), (10, 7), (30, 7), (40, 0)], hx=[(0, 0), (3, 5), (6, -8), (30, -6), (40, 0)], hy=[(0, 0), (6, 6), (30, 6), (40, 0)],
        sq=[(0, 0), (3, -0.05), (6, 0.07), (10, 0.02), (16, 0), (40, 0)], ba=[(0, 0), (4, 12), (30, 12), (40, 0)], bz=[(0, 0), (4, 0.025), (30, 0.025), (40, 0)],
        ey=[(0, 0), (4, 0.1), (30, 0.1), (40, 0)], dz=[(0, 0), (6, 0.03), (10, 0), (40, 0)], aL=[(0, 0), (6, -12), (30, -12), (40, 0)])),
    'smash': (46, 14, dict(
        sq=[(0, 0), (4, 0.16), (8, 0.18), (10, -0.24), (13, 0.06), (16, -0.05), (20, 0), (46, 0)],
        lx=[(0, 0), (4, -16), (8, -22), (10, 30), (14, 24), (36, 24), (46, 0)], dz=[(0, 0), (4, 0.02), (8, 0.08), (10, -0.04), (13, 0.0), (46, 0)],
        aL=[(0, 0), (4, 75), (8, 100), (10, -45), (14, -30), (36, -30), (46, 0)], aR=[(0, 0), (4, 75), (8, 100), (10, -45), (14, -30), (36, -30), (46, 0)],
        hx=[(0, 0), (4, -12), (8, -18), (10, 16), (14, 12), (36, 12), (46, 0)], hsq=[(0, 0), (10, -0.06), (13, 0.04), (16, 0), (46, 0)],
        ba=[(0, 0), (4, 16), (10, 30), (36, 30), (46, 0)], ey=[(0, 0), (4, 0.15), (10, -0.3), (36, -0.2), (46, 0)], bz=[(0, 0), (4, 0.04), (10, -0.015), (36, -0.015), (46, 0)],
        mh=[(0, 0), (4, 0.07), (9, 0.09), (11, 0.02), (16, 0), (46, 0)], mw=[(0, 0), (4, 0.05), (9, 0.06), (11, 0.05), (16, 0), (46, 0)])),
    # --- extras used by acting.json
    'flinch': (50, 12, dict(
        sq=[(0, 0), (3, -0.1), (6, -0.14), (12, -0.1), (40, -0.1), (50, 0)], lx=[(0, 0), (3, 6), (6, 12), (40, 10), (50, 0)],
        hx=[(0, 0), (3, 10), (7, 22), (40, 18), (50, 0)], aL=[(0, 0), (6, 30), (40, 26), (50, 0)], aR=[(0, 0), (6, 30), (40, 26), (50, 0)],
        oL=[(0, 0), (6, 10), (40, 10), (50, 0)], oR=[(0, 0), (6, 10), (40, 10), (50, 0)], ey=[(0, 0), (2, -0.5), (40, -0.5), (50, 0)],
        ba=[(0, 0), (3, -30), (40, -30), (50, 0)], bz=[(0, 0), (3, 0.05), (40, 0.05), (50, 0)],
        ly=lambda t: 1.6 * math.sin(2 * math.pi * t / 4) * (1 if 6 < t < 40 else 0), mh=[(0, 0), (6, 0.01), (40, 0.01), (50, 0)])),
    'shrug': (44, 16, dict(
        sq=[(0, 0), (3, -0.05), (8, 0.04), (12, 0), (44, 0)], oL=[(0, 0), (3, -4), (9, 55), (14, 45), (30, 45), (44, 0)], oR=[(0, 0), (3, -4), (9, 55), (14, 45), (30, 45), (44, 0)],
        aL=[(0, 0), (9, 25), (30, 25), (44, 0)], aR=[(0, 0), (9, 25), (30, 25), (44, 0)], hy=[(0, 0), (4, -3), (10, 12), (30, 12), (44, 0)],
        hx=[(0, 0), (4, 3), (10, -4), (30, -4), (44, 0)], dz=[(0, 0), (3, -0.01), (9, 0.04), (13, 0.01), (44, 0)], ey=[(0, 0), (8, -0.3), (30, -0.3), (44, 0)],
        ba=[(0, 0), (8, -18), (30, -18), (44, 0)], br=[(0, 0), (8, 0.04), (30, 0.04), (44, 0)], mh=[(0, 0), (8, 0.0), (11, 0.025), (18, 0), (44, 0)])),
    'hop': (26, None, dict(
        dz=[(0, 0), (4, 0), (9, 0.2), (14, 0), (26, 0)], sq=[(0, 0), (3, -0.12), (8, 0.1), (14, -0.12), (18, 0.04), (22, 0), (26, 0)],
        aL=[(0, 0), (9, 40), (14, 0), (26, 0)], aR=[(0, 0), (9, 40), (14, 0), (26, 0)], ly=[(0, 0), (9, 5), (14, 0), (26, 0)], ey=[(0, 0), (8, 0.25), (16, 0), (26, 0)])),
    'hop_pain': (60, None, dict(
        dz=lambda t: 0.14 * abs(math.sin(math.pi * t / 14)) if t < 42 else 0.0, sq=lambda t: (-0.12 * (1 - abs(math.sin(math.pi * t / 14))) ** 2 + 0.05) if t < 44 else 0.0,
        ly=lambda t: 10 * math.sin(math.pi * t / 14) if t < 42 else 0.0, lx=lambda t: -6 if t < 44 else 0.0,
        aL=lambda t: 40 * abs(math.sin(math.pi * t / 14)), aR=lambda t: 40 * abs(math.sin(math.pi * t / 14)),
        oL=lambda t: 40, oR=lambda t: 40, ey=lambda t: -0.5, ba=lambda t: -28, bz=lambda t: 0.04, mh=lambda t: 0.07 if t < 44 else 0.0, mw=lambda t: 0.06 if t < 44 else 0.0)),
    'nod': (18, None, dict(hx=[(0, 0), (3, -4), (7, 12), (12, 0), (18, 0)], sq=[(0, 0), (7, -0.03), (12, 0), (18, 0)], bz=[(0, 0), (4, 0.02), (14, 0), (18, 0)])),
    'sway': (24, None, dict(ly=lambda t: 5 * math.sin(2 * math.pi * t / 24), hy=lambda t: -6 * math.sin(2 * math.pi * t / 24 + 0.8), dx=lambda t: 0.025 * math.sin(2 * math.pi * t / 24),
                            sq=lambda t: 0.025 * math.sin(2 * math.pi * t / 12), aL=lambda t: 8 * math.sin(2 * math.pi * t / 24), aR=lambda t: -8 * math.sin(2 * math.pi * t / 24))),
    'lookaround': (40, 20, dict(hr=[(0, 0), (4, 4), (12, -22), (20, -20), (28, 18), (36, 0), (40, 0)], hy=[(0, 0), (12, -4), (28, 4), (40, 0)],
                                ey=[(0, 0), (6, 0.1), (28, 0.1), (40, 0)], bz=[(0, 0), (6, 0.02), (28, 0.02), (40, 0)], lr=[(0, 0), (12, -6), (28, 6), (40, 0)])),
    'wobble': (30, None, dict(ly=_wob(9, 10, 0.08), lx=_wob(5, 14, 0.08, 1.0), sq=_wob(0.06, 7, 0.12), hy=_wob(8, 9, 0.07, 0.6))),
    'sit_plop': (34, 14, dict(
        dz=[(0, 0), (3, 0.03), (6, -0.05), (34, 0)], sq=[(0, 0), (3, 0.08), (7, -0.2), (10, 0.06), (14, -0.04), (18, 0), (34, 0)],
        lx=[(0, 0), (3, -6), (8, 8), (14, 0), (34, 0)], aL=[(0, 0), (4, 20), (8, 0), (34, 0)], aR=[(0, 0), (4, 20), (8, 0), (34, 0)],
        oL=[(0, 0), (6, 30), (14, 8), (34, 0)], oR=[(0, 0), (6, 30), (14, 8), (34, 0)], hx=[(0, 0), (3, -8), (8, 8), (14, 0), (34, 0)], ey=[(0, 0), (3, 0.3), (14, 0), (34, 0)])),
    'throw_heave': (40, 14, dict(
        lx=[(0, 0), (6, -26), (10, -30), (14, 30), (18, 18), (24, 10), (40, 0)], lr=[(0, 0), (8, -20), (14, 24), (22, 10), (40, 0)],
        aR=[(0, 0), (6, -70), (10, -90), (14, 55), (18, 40), (40, 0)], oR=[(0, 0), (8, 40), (14, 10), (40, 0)], sq=[(0, 0), (6, -0.12), (10, -0.14), (14, 0.2), (18, 0.0), (22, -0.04), (40, 0)],
        dz=[(0, 0), (12, 0), (15, 0.1), (20, 0), (40, 0)], hx=[(0, 0), (6, 8), (14, -14), (24, 0), (40, 0)], ba=[(0, 0), (6, 20), (30, 12), (40, 0)], ey=[(0, 0), (6, -0.3), (14, 0.15), (40, 0)],
        mh=[(0, 0), (12, 0.02), (14, 0.09), (20, 0), (40, 0)], mw=[(0, 0), (12, 0.04), (14, 0.07), (20, 0), (40, 0)])),
    'bite_lunge': (40, 12, dict(
        pt=[(0, 0), (6, 20), (30, 20), (40, 0)],
        lx=[(0, 0), (3, -7), (6, 18), (9, 14), (12, 14), (30, 10), (40, 0)], hx=[(0, 0), (3, -8), (6, 20), (12, 14), (30, 10), (40, 0)], sq=[(0, 0), (3, 0.06), (6, -0.1), (9, 0.03), (14, 0), (40, 0)],
        aR=[(0, 0), (3, -15), (6, 20), (30, 10), (40, 0)], mh=[(0, 0), (2, 0.08), (5, 0.1), (7, 0.0), (40, 0)], mw=[(0, 0), (2, 0.07), (5, 0.07), (7, 0.03), (40, 0)], ey=[(0, 0), (3, 0.2), (8, 0), (40, 0)])),
    'kick': (34, 12, dict(
        lx=[(0, 0), (4, -10), (8, 14), (12, 12), (26, 12), (34, 0)], sq=[(0, 0), (4, -0.08), (8, 0.05), (12, 0), (34, 0)], dz=[(0, 0), (4, -0.02), (8, 0.03), (12, 0), (34, 0)],
        aL=[(0, 0), (4, 30), (8, -25), (26, -20), (34, 0)], aR=[(0, 0), (4, -30), (8, 35), (26, 30), (34, 0)], oL=[(0, 0), (8, 30), (26, 30), (34, 0)], oR=[(0, 0), (8, 30), (26, 30), (34, 0)],
        ba=[(0, 0), (3, 20), (26, 20), (34, 0)], ey=[(0, 0), (3, -0.2), (26, -0.2), (34, 0)])),
    'rub_belly': (60, None, dict(
        aR=lambda t: 25 + 10 * math.sin(2 * math.pi * t / 14), oR=lambda t: -25 + 12 * math.cos(2 * math.pi * t / 14), sq=lambda t: -0.02 + 0.02 * math.sin(2 * math.pi * t / 28),
        hy=lambda t: 4 * math.sin(2 * math.pi * t / 40), ey=lambda t: 0.1, bz=lambda t: 0.02 + 0.01 * math.sin(2 * math.pi * t / 14), ba=lambda t: -10)),
    'tremble': (30, None, dict(ly=lambda t: 2.5 * math.sin(t * 2.2), dx=lambda t: 0.012 * math.sin(t * 3.1), sq=lambda t: 0.02 * math.sin(t * 2.6), hy=lambda t: 3 * math.sin(t * 2.0), ey=lambda t: 0.15)),
    'tilt': (22, None, dict(hy=[(0, 0), (6, 10), (16, 10), (22, 0)], hx=[(0, 0), (6, 3), (16, 3), (22, 0)], bz=[(0, 0), (4, 0.02), (16, 0.02), (22, 0)], br=[(0, 0), (6, 0.03), (16, 0.03), (22, 0)], lx=[(0, 0), (8, 3), (16, 3), (22, 0)])),
    'lean_in': (50, 14, dict(lx=[(0, 0), (3, -3), (10, 14), (14, 12), (40, 12), (50, 0)], hx=[(0, 0), (10, -6), (40, -6), (50, 0)], hy=[(0, 0), (12, 8), (40, 8), (50, 0)],
                             ey=[(0, 0), (6, 0.15), (40, 0.15), (50, 0)], bz=[(0, 0), (6, 0.03), (40, 0.03), (50, 0)], sq=[(0, 0), (3, -0.03), (10, 0.03), (14, 0), (50, 0)])),
    'cheer': (40, None, dict(aL=lambda t: 85 + 10 * math.sin(t * 0.6), aR=lambda t: 85 - 10 * math.sin(t * 0.6), dz=lambda t: 0.1 * abs(math.sin(math.pi * t / 10)),
                              sq=lambda t: -0.06 * (1 - abs(math.sin(math.pi * t / 10))) ** 2, ey=lambda t: 0.1, mh=lambda t: 0.06, mw=lambda t: 0.06)),
}


def _syll(w):
    import re
    return max(1, len(re.findall(r'[aeiouy]+', (w or 'a').lower().rstrip('.,!?"'))))


class _Layer:
    __slots__ = ('f', 'dur', 'curves', 'hold', 'hs', 'amp', 'big')

    def __init__(s, f, dur, curves, hold=0, hs=None, amp=1.0):
        s.f, s.dur, s.curves, s.hold, s.hs, s.amp = f, dur + hold, curves, hold, hs, amp
        s.big = hs is not None   # reacts with a hold phase = comedy beats: the alive layer drops to 30% there


def _char_react(self, f, name, hold=0, amp=1.0):
    """anticipation -> action -> overshoot -> settle -> HOLD (extra `hold` frames on the settled pose) -> recover."""
    if name not in REACTS: raise KeyError(name)
    dur, hs, cv = REACTS[name]
    self.layers.append(_Layer(f, dur, cv, hold if hs is not None else 0, hs, amp))


def _char_squash(self, f, amt, dur=10):
    """volume-preserving whole-body squash (amt<0 squat, >0 stretch) that springs back with overshoot."""
    d = max(4, int(dur))
    cv = dict(sq=lambda t: amt * (t / 2.0 if t < 2 else math.exp(-3.2 * (t - 2) / d) * math.cos(2 * math.pi * (t - 2) / (d * 0.9))),
              hsq=lambda t: -0.5 * amt * math.exp(-3.2 * t / d) * math.sin(2 * math.pi * t / (d * 0.9)))
    self.layers.append(_Layer(f, d * 2, cv))


def _char_lean(self, f, amt, dur=20):
    """lean forward `amt` deg (neg = back) over 6 f, hold, recover. Head counter-rotates."""
    self.layers.append(_Layer(f, 14 + dur, dict(lx=[(0, 0), (6, amt), (6 + dur, amt), (14 + dur, 0)], hx=[(0, 0), (6, -amt * 0.4), (6 + dur, -amt * 0.4), (14 + dur, 0)])))


def _char_talk(self, f_in, f_out, words, amp=1.0):
    """open/close the flap mouth per syllable. words = [(start_f, end_f[, text]), ...] (absolute frames: word starts/ends)."""
    rnd = random.Random(f_in * 7 + 3)
    syl = []
    for wd in words:
        s, e = wd[0], wd[1]
        n = _syll(wd[2]) if len(wd) > 2 else max(1, round((e - s) / 6))
        seg = max(3.0, e - s) / n
        for i in range(n):
            a = s + i * seg; syl.append((a, a + seg * 0.35, a + seg * 0.9, rnd.uniform(0.6, 1.0) * (1.25 if i == 0 else 1.0)))

    def mfn(k):
        def fn(t):
            fr = f_in + t; best = 0.0
            for a, pk, b, sz in syl:
                if a - 1 <= fr <= b:
                    v = (fr - a + 1) / max(1.0, pk - a + 1) if fr < pk else 1 - (fr - pk) / max(1.0, b - pk)
                    best = max(best, max(0.0, min(1.0, v)) * sz)
            return best * k * amp
        return fn
    self.layers.append(_Layer(f_in, f_out - f_in + 2, dict(mh=mfn(0.07), mw=mfn(0.045), bz=lambda t: 0.012 * amp * (1 if mfn(1)(t) > 0.5 else 0))))


def _char_bake(self, f0=0, f1=1830):
    """key every layer on twos between f0..f1 (breathing + head tilts always on). Call once, after all layers are added."""
    rnd = random.Random(sum(map(ord, self.name)))
    ph = rnd.uniform(0, 6.28)
    tilts = [(f0 + rnd.randint(10, 40) + 70 * i, rnd.choice((-1, 1)) * rnd.uniform(2.5, 4.5)) for i in range((f1 - f0) // 70 + 1)]
    A, H, SA, EA, BA, FL = self._act, self._head, self._sa, self._eact, self._bact, self._flap
    last = {}
    # ALIVE layer: constant sway + word-driven head bobs + Marcel's chew-nod. Dampened to 30% while a react/hold is active.
    sway_per, sway_ph = rnd.uniform(45, 75), rnd.uniform(0, 6.28)
    bobs = []   # (frame, kind, amp deg)
    try:
        import json
        tj = json.load(open(ALIVE_TIMING, encoding='utf-8'))
        for ln in tj['lines']:
            for i, w in enumerate(ln['words']):
                if (w['end'] - w['start']) > 0.25 or w['w'][:1].isupper() or i == len(ln['words']) - 1:
                    bobs.append((round(w['start'] * 30) + rnd.randint(0, 2), 'nod' if len(bobs) % 2 == 0 else 'tilt', rnd.uniform(2.0, 4.0)))
    except Exception: pass   # timing json missing: sway only
    TO, NE = self._parts['torso'], self._parts['neck']

    def _rx(o, fr):
        for fc in _fcurves(o):
            if fc.data_path == 'rotation_euler' and fc.array_index == 0: return math.degrees(fc.evaluate(fr))
        return 0.0

    def key(obj, path, idx, v, f):
        k = (obj.name, path, idx)
        if abs(last.get(k, 1e9) - v) < 1e-5: return
        last[k] = v
        getattr(obj, path)[idx] = v
        obj.keyframe_insert(path, index=idx, frame=f)
    ls = sorted(self.layers, key=lambda l: l.f)
    for fr in range(f0, f1 + 1, 2):
        T = dict.fromkeys(CH_ALL, 0.0)
        T['sq'] += 0.013 * math.sin(2 * math.pi * fr / 54 + ph); T['hsq'] += 0.01 * math.sin(2 * math.pi * fr / 54 + ph + 0.9)
        T['hx'] += 1.2 * math.sin(2 * math.pi * fr / 54 + ph + 0.5); T['dz'] += 0.0035 * math.sin(2 * math.pi * fr / 54 + ph)
        for a, b in tilts:
            if a <= fr <= a + 36: T['hy'] += b * math.sin(math.pi * (fr - a) / 36) ** 2
        busy = False
        for l in ls:
            if fr < l.f - LEAD or fr > l.f + l.dur: continue
            busy = busy or l.big
            for ch, cv in l.curves.items():
                t = fr - l.f - (0 if ch in FACE_CH else LEAD)
                if l.hold and l.hs is not None:
                    t = l.hs if l.hs < t <= l.hs + l.hold else (t - l.hold if t > l.hs + l.hold else t)
                if t < 0: continue
                v = _ev(cv, t)
                T[ch] += v * (l.amp if ch not in ('mh', 'mw') else 1.0)
        al = {'ly': 2.0 * math.sin(2 * math.pi * fr / sway_per + sway_ph), 'hx': 0.0, 'hy': 0.0}
        for bf, kd, am in bobs:
            if bf <= fr < bf + 6:
                u = math.sin(math.pi * (fr - bf) / 6)
                if kd == 'nod': al['hx'] += am * u
                else: al['hy'] += am * u
        if self.kind == 'marcel' and 1740 <= fr <= 1814:   # ending: chewing proudly 1740-1803, 4 satisfied nods, chest-puff on "progress", smug hold to 1814
            al['hx'] += 1.6 * math.sin(2 * math.pi * (fr - 1740) / 10) if fr <= 1803 else 0.0      # chewing bob
            for nf in (1746, 1762, 1778, 1792):
                if nf <= fr < nf + 10: al['hx'] += 3.5 * math.sin(math.pi * (fr - nf) / 10); al['ly'] += 1.5 * math.sin(math.pi * (fr - nf) / 10)
            if 1788 <= fr: T['sq'] += 0.06 * min(1.0, (fr - 1788) / 6.0); T['hx'] -= 3 * min(1.0, (fr - 1788) / 6.0)   # puff, kept through the hold
            if fr > 1803: al['hy'] += 4.0 * min(1.0, (fr - 1803) / 4.0)                                         # settled smug tilt
        k_ = 0.3 if busy else 1.0
        for ch_, v_ in al.items(): T[ch_] += v_ * k_
        # FACE-SAFE: head net forward pitch (act lean + torso lean + neck nod + acting nod) is capped at HEAD_MAX deg; the body leans, the face stays readable.
        net = T['lx'] * LX_K + _rx(TO, fr) + _rx(NE, fr) + T['hx']
        if net > HEAD_MAX: T['hx'] -= net - HEAD_MAX
        D_ = math.radians
        sq = 1 + T['sq']; sk = 1 / math.sqrt(max(sq, 0.3)); hs = 1 + T['hsq']; hk = 1 / math.sqrt(max(hs, 0.3))
        key(A, 'location', 0, T['dx'], fr); key(A, 'location', 1, T['dy'], fr); key(A, 'location', 2, T['dz'], fr)
        key(A, 'rotation_euler', 0, D_(T['lx'] * LX_K), fr); key(A, 'rotation_euler', 1, D_(T['ly']), fr); key(A, 'rotation_euler', 2, D_(T['lr']), fr)
        key(A, 'scale', 0, sk, fr); key(A, 'scale', 1, sk, fr); key(A, 'scale', 2, sq, fr)
        key(H, 'rotation_euler', 0, D_(T['hx']), fr); key(H, 'rotation_euler', 1, D_(T['hy']), fr); key(H, 'rotation_euler', 2, D_(T['hr']), fr)
        key(H, 'scale', 0, hk, fr); key(H, 'scale', 1, hk, fr); key(H, 'scale', 2, hs, fr)
        for s_, a_, o_ in (('L', 'aL', 'oL'), ('R', 'aR', 'oR')):
            key(SA[s_], 'rotation_euler', 0, -D_(T[a_]), fr); key(SA[s_], 'rotation_euler', 1, (-1 if s_ == 'L' else 1) * D_(T[o_]), fr)
        for s_, sg in (('L', -1), ('R', 1)):
            key(EA[s_], 'scale', 2, max(0.05, 1 + T['ey']), fr); key(EA[s_], 'scale', 0, 1 + 0.35 * max(-0.5, T['ey']), fr)
            key(BA[s_], 'location', 2, T['bz'] + (T['br'] if s_ == 'R' else 0.0), fr); key(BA[s_], 'rotation_euler', 1, sg * D_(T['ba']), fr)
        for pr_ in getattr(self, '_uprights', []): key(pr_, 'delta_rotation_euler', 0, -D_(min(T['pt'], 20.0)), fr)   # top toward the mouth (+Y), max 20 deg so the label reads
        key(FL, 'scale', 0, max(0.0001, T['mw']), fr); key(FL, 'scale', 2, max(0.0001, T['mh']), fr)
    self._fix()


Char.layers = None
Char.react, Char.squash, Char.lean, Char.talk, Char.bake = _char_react, _char_squash, _char_lean, _char_talk, _char_bake
_orig_make = make_char


def make_char(kind, name):      # noqa: F811  (adds the acting handles to the Char)
    ch = _orig_make(kind, name); ch.layers = []
    P = ch._parts['fc']
    ch._eact = {s: P[s]['eact'] for s in 'LR'}; ch._bact = {s: P[s]['bact'] for s in 'LR'}
    return ch


def _char_act_do(self, f, do, args):
    if do == 'react': self.react(f, args['name'], args.get('hold', 0), args.get('amp', 1.0))
    elif do == 'squash': self.squash(f, args.get('amt', -0.15), args.get('dur', 10))
    elif do == 'lean': self.lean(f, args.get('amt', 10), args.get('dur', 20))
    elif do == 'talk': self.talk(f, args['f_out'], [tuple(w) for w in args['words']], args.get('amp', 1.0))
    elif do == 'pose': self.pose(f, args['name'], args.get('dur', 10))
    elif do == 'face': self.face(f, args['name'], args.get('dur', 6))
    else: raise ValueError(do)


Char.do = _char_act_do


def make_all(names=('marcel', 'gaston', 'soldier')):
    return {n: make_char(n, n.capitalize()) for n in names}


def apply_acting(chars_by_name, path=None, f0=0, f1=1830):
    """INTEGRATOR HOOK. Call once after the shots.json actions:  n = chars.apply_acting(CH)
    CH = {'marcel':Char,'gaston':Char,'s1':Char,'s2':Char,'s3':Char}. Reads acting.json (default: ../acting.json), turns every beat into an
    acting layer ('soldier' -> every s<N> char, staggered 3 f each) and bakes keys on twos for frames f0..f1 (breathing and head tilts included).
    pose/face beats (unused by default) go straight to Char.pose/face and must be time-ordered. Returns beats applied."""
    import json
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'acting.json')
    beats = json.load(open(path, encoding='utf-8'))
    sol = [k for k in chars_by_name if k.startswith('s') and k[1:].isdigit()]
    n = 0
    for b in sorted(beats, key=lambda b: b['f']):
        for i, k in enumerate(sol if b['char'] == 'soldier' else [b['char']]):
            if k in chars_by_name:
                chars_by_name[k].do(b['f'] + (3 * i if b['char'] == 'soldier' else 0), b['do'], b.get('args', {})); n += 1
    for c in chars_by_name.values():
        if c.layers is not None: c.bake(f0, f1)
    return n
