const S=require('../shots.json');
const CH=new Set(['marcel','gaston','s1','s2','s3']),SETS=new Set(['camp','insert','night','tent']);
const POSE=new Set('idle walk point stab kick smash_down throw sit recoil shock sigh chew bite peer eyes_closed smug march'.split(' '));
const FACE=new Set('neutral hungry determined pain smug shock betrayed chewing eyes_shut'.split(' '));
const PROP=new Set('can lid crate label_card chisel hammer opener_1858 knife boot rock pan'.split(' '));
const EXTRA=new Set(['scale','food']); // optional props requested from SETS
const ANCH=new Set('marcel_spot gaston_spot crate tree fire table'.split(' '));
const FXT=new Set('puff speedlines sparkle godrays'.split(' ')),TR=new Set(['travel','whip','dissolve']);
const e=[];let prev=0;
const ck=(c,m)=>{if(!c)e.push(m)};
const anc=v=>!v||Array.isArray(v)||v==='night'||ANCH.has(v.anchor||v);
for(const s of S){
 ck(s.f_in===prev,`${s.id} gap/overlap at ${s.f_in}`);prev=s.f_out;
 ck(s.f_in<s.f_out,s.id+' f_in>=f_out');ck(SETS.has(s.set),s.id+' set');ck(TR.has(s.transition_in),s.id+' transition');
 ck(s.camera.length>=2&&s.camera[0].f===s.f_in&&s.camera.at(-1).f===s.f_out,s.id+' cam span');
 ck(s.camera.every((c,i)=>!i||c.f-s.camera[i-1].f>=20),s.id+' cam ease<20f');
 ck(s.camera.every(c=>Math.abs(c.roll_deg)<=12&&anc(c.pos)&&anc(c.target)),s.id+' cam roll/anchor');
 for(const a of s.actions){ck(a.f>=s.f_in&&a.f<=s.f_out,`${s.id} action f ${a.f}`);ck(CH.has(a.char),s.id+' char '+a.char);
  if(a.act==='pose')ck(POSE.has(a.args.name),s.id+' pose '+a.args.name);
  if(a.act==='face')ck(FACE.has(a.args.name),s.id+' face '+a.args.name);
  if(a.act==='hold')ck(PROP.has(a.args.prop),s.id+' hold '+a.args.prop);
  if(a.act==='place')ck(anc(a.args.loc),s.id+' place anchor');}
 for(const p of s.props)ck((PROP.has(p.prop)||EXTRA.has(p.prop))&&p.f>=s.f_in&&p.f<=s.f_out,`${s.id} prop ${p.prop}@${p.f}`);
 for(const x of s.fx)ck(FXT.has(x.type)&&x.f>=s.f_in&&x.f<=s.f_out&&anc(x.at),`${s.id} fx ${x.type}@${x.f}`);
}
ck(prev===1815,'ends at '+prev);
for(let i=1;i<S.length;i++)ck(S[i].size!==S[i-1].size||S[i].set!==S[i-1].set,`${S[i].id} repeats size ${S[i].size}`);
const cnt=k=>S.reduce((m,s)=>(m[s[k]]=(m[s[k]]||0)+1,m),{});
console.log(e.length?'FAIL\n'+e.join('\n'):'OK',S.length,'shots',JSON.stringify(cnt('size')),JSON.stringify(cnt('transition_in')),'dutch',S.filter(s=>/dutch/.test(s.angle)||s.camera.some(c=>Math.abs(c.roll_deg)>=5)).length);
