import {validateReveal} from './subtitles.mjs';
export const defaults={heroStep:0,heroWalking:0,heroTorchRaise:0,heroFreeze:0,infectedVisible:0,infectedStep:8,infectedTurn:-.65,infectedReach:0,infectedDirection:0,infectedMove:0,handVisible:0,handRise:0,handSlide:0,shoeReach:0,infectedRailGrip:1,torch:0,stepFill:1.6,pipeVisible:0,pipeDrip:0,landingHeroZ:1.8,landingHeroWalk:0,landingHeroLook:0,paPulse:0,figureVisible:1,figureTurn:0,choices:0,lowerVisible:1,lowerWalk:0};
const worlds=['upper','step','close','landing','pocket','shoe'];
const obj=(v,keys,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(label+': expected object');for(const k of Object.keys(v))if(!keys.includes(k))throw Error(label+': unknown '+k)};
const number=(n,min,max,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(label+': out of range')};
const text=(s,max,label)=>{if(typeof s!=='string'||!s.length||[...s].length>max||/[<>\u0000-\u001f\u007f]/u.test(s))throw Error(label+': invalid text')};
const identifier=(s)=>{if(typeof s!=='string'||! /^[a-z][a-z0-9-]{0,59}$/.test(s))throw Error('invalid id')};
const vector=(v)=>{if(!Array.isArray(v)||v.length!==3)throw Error('camera: expected vector');v.forEach(n=>number(n,-60,60,'camera coordinate'))};
export function normalizePlan(input){
 const p=structuredClone(input);obj(p,['version','scene','title','duration','anchors','beats','channels','captions','audio','sounds','holds','notes','captionTreatment'],'plan');
 if(p.captionTreatment!==undefined&&!['phrase','original-thai-pop'].includes(p.captionTreatment))throw Error('unknown caption treatment');
 if(p.version!==1||p.scene!=='mall-v1')throw Error('Only low-poly mall-v1 is supported');text(p.title,100,'title');number(p.duration,1,180,'duration');
 if(!p.anchors||Array.isArray(p.anchors)||typeof p.anchors!=='object')throw Error('anchors required');
 for(const [k,v] of Object.entries(p.anchors)){if(!/^[a-z][a-zA-Z0-9-]{0,55}$/.test(k))throw Error('invalid anchor id');number(v,0,p.duration,'anchor')}
 const time=v=>{const n=typeof v==='string'?p.anchors[v]:v;number(n,0,p.duration,'time/anchor');return n};
 if(!Array.isArray(p.beats)||!p.beats.length||p.beats.length>100)throw Error('beats required');let end=0;
 for(const b of p.beats){obj(b,['id','start','end','world','camera','purpose'],'beat');identifier(b.id);text(b.purpose,240,'purpose');b.start=time(b.start);b.end=time(b.end);if(Math.abs(b.start-end)>.00002||b.end-b.start<.15)throw Error('beats must be contiguous, >=.15s');end=b.end;if(!worlds.includes(b.world))throw Error('unknown world');obj(b.camera,['from','to','lookFrom','lookTo','ease'],'camera');for(const k of ['from','to','lookFrom','lookTo'])vector(b.camera[k]);if(!['linear','smooth','hold'].includes(b.camera.ease))throw Error('invalid camera ease')}
 if(Math.abs(end-p.duration)>.00002)throw Error('beats must cover duration');
 if(!p.channels||typeof p.channels!=='object'||Array.isArray(p.channels))throw Error('channels required');
 for(const [name,ch] of Object.entries(p.channels)){if(!(name in defaults))throw Error('unsupported channel '+name);obj(ch,['ease','keys'],'channel');if(!['step','linear','smooth'].includes(ch.ease)||!Array.isArray(ch.keys)||!ch.keys.length)throw Error('invalid channel');let last=-1;for(const k of ch.keys){obj(k,['at','value'],'keyframe');k.at=time(k.at);number(k.value,-50,50,'channel value');if(k.at<=last)throw Error('keyframes must be ordered');last=k.at}}
 if(!Array.isArray(p.captions))throw Error('captions required');end=0;const ids=new Set();
 for(const c of p.captions){obj(c,['id','start','end','keywordAt','thai','english','highlight','accent','y','reveal'],'caption');identifier(c.id);if(ids.has(c.id))throw Error('duplicate caption');ids.add(c.id);c.start=time(c.start);c.end=time(c.end);c.keywordAt=time(c.keywordAt);if(c.start<end-.00002||c.end-c.start<.45||c.keywordAt<c.start||c.keywordAt>=c.end)throw Error('caption timing/overlap');end=c.end;text(c.thai,50,'Thai');text(c.english,65,'English');text(c.highlight,30,'highlight');if(!c.thai.includes(c.highlight))throw Error('highlight must occur');if(!['amber','coral','cyan'].includes(c.accent))throw Error('invalid accent');number(c.y,300,1180,'subtitle y');if(c.reveal!==undefined)validateReveal(c,time);if(p.captionTreatment==='original-thai-pop'&&!c.reveal)throw Error('progressive treatment requires timed units')}
 const media=v=>{if(typeof v!=='string'||!/^assets\/[a-zA-Z0-9_/-]+\.(wav|mp3)$/.test(v)||v.split('/').some(x=>x==='..'||x==='.'))throw Error('media must be confined to assets/')};
 p.audio??=[];p.sounds??=[];p.holds??=[];
 for(const a of p.audio){obj(a,['id','file','start','duration','volume'],'audio');identifier(a.id);media(a.file);a.start=time(a.start);number(a.duration,.01,p.duration,'audio duration');if(a.start+a.duration>p.duration+.03)throw Error('audio exceeds timeline');number(a.volume,0,1,'audio volume')}
 for(const s of p.sounds){obj(s,['id','file','at','duration','volume'],'sound');identifier(s.id);media(s.file);s.at=time(s.at);number(s.duration,.01,8,'sound duration');if(s.at+s.duration>p.duration+.03)throw Error('sound exceeds timeline');number(s.volume,0,1,'sound volume')}
 for(const h of p.holds){obj(h,['start','end','purpose'],'hold');h.start=time(h.start);h.end=time(h.end);if(h.end<=h.start)throw Error('invalid hold');text(h.purpose,240,'hold purpose')}
 p.notes??=[];p.notes.forEach(n=>text(n,500,'note'));return p;
}
const clamp=x=>Math.max(0,Math.min(1,x));const ease=(p,type)=>type==='hold'?0:type==='smooth'?p*p*(3-2*p):p;
export function stateAt(plan,time){
 const t=Math.max(0,Math.min(plan.duration-.000001,time)),beat=plan.beats.find(b=>t>=b.start&&t<b.end)||plan.beats.at(-1),u=ease(clamp((t-beat.start)/(beat.end-beat.start)),beat.camera.ease);
 const values={...defaults};
 for(const [name,ch] of Object.entries(plan.channels)){
  const keys=ch.keys;let prev={at:0,value:defaults[name]},next=null;
  for(const k of keys){if(k.at<=t)prev=k;else{next=k;break}}
  values[name]=!next||ch.ease==='step'?prev.value:prev.value+(next.value-prev.value)*ease(clamp((t-prev.at)/(next.at-prev.at)),ch.ease);
 }
 const lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*u);
 return {time:t,beat:beat.id,world:beat.world,position:lerp(beat.camera.from,beat.camera.to),lookAt:lerp(beat.camera.lookFrom,beat.camera.lookTo),values,captions:plan.captions.filter(c=>t>=c.start&&t<c.end).map(c=>({id:c.id,highlighted:t>=c.keywordAt})),sounds:plan.sounds.filter(s=>t>=s.at&&t<s.at+s.duration).map(s=>s.id)};
}
