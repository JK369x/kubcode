(() => {
 const plan=JSON.parse(document.getElementById('shot-plan').textContent);
 const tl=gsap.timeline({paused:true});
 const camera={wide:{scale:1,origin:'50% 50%'},hero:{scale:1.13,origin:'34% 48%'},window:{scale:1.16,origin:'70% 51%'}};
 for(const shot of plan.shots){
  const box=document.createElement('div');box.className='subtitle';
  const thai=document.createElement('div');const i=shot.caption.thai.indexOf(shot.caption.highlight);
  thai.append(document.createTextNode(shot.caption.thai.slice(0,i)));
  const highlight=document.createElement('em');highlight.textContent=shot.caption.highlight;thai.append(highlight,document.createTextNode(shot.caption.thai.slice(i+shot.caption.highlight.length)));
  const english=document.createElement('small');english.textContent=shot.caption.english;box.append(thai,english);document.getElementById('subtitle-layer').append(box);
  const c=camera[shot.camera];tl.to('#study svg',{scale:c.scale,transformOrigin:c.origin,duration:Math.min(.65,(shot.end-shot.start)/3),ease:'sine.inOut'},shot.start);
  tl.to(box,{opacity:1,duration:.14},shot.start);tl.to(box,{opacity:0,duration:.18},shot.end-.18);
  const at=shot.start+Math.min(.35,(shot.end-shot.start)/4);
  if(shot.effect==='blink') tl.fromTo('#hero-eyes',{scaleY:1,transformOrigin:'50% 50%'},{scaleY:.08,duration:.08,repeat:1,yoyo:true},at);
  if(shot.effect==='latch') {tl.to('#hero-right-hand',{rotation:-8,transformOrigin:'30% 50%',duration:.55},at);tl.to('#window-latch',{rotation:-12,transformOrigin:'50% 70%',duration:.55},at)}
  if(shot.effect==='hand') tl.to('#infected-hand',{y:7,scale:1.025,transformOrigin:'50% 60%',duration:.65},at);
 }
 tl.to({t:0},{t:plan.duration,duration:plan.duration,ease:'none'},0);window.__timelines={main:tl};
})();
