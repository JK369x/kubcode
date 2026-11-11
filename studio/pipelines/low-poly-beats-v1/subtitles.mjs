// Keep Thai marks attached to their base and preposed vowels with the next base.
// Visibility changes never remove an element from layout.
export function thaiUnits(text){
 const out=[];let leading='';
 for(const {segment} of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)){
  if(/^[เแโใไ]$/u.test(segment)){leading+=segment;continue}
  if(/^[\p{M}\s…=:,!.?]+$/u.test(segment)&&out.length&&!leading)out[out.length-1]+=segment;
  else {out.push(leading+segment);leading=''}
 }
 if(leading){if(out.length)out[out.length-1]+=leading;else out.push(leading)}
 return out;
}
export function validateReveal(c,time){
 if(!Array.isArray(c.reveal)||c.reveal.length!==thaiUnits(c.thai).length)throw Error('reveal must contain coherent Thai units');
 const expected=thaiUnits(c.thai);let last=c.start;
 for(let i=0;i<c.reveal.length;i++){
  const u=c.reveal[i];if(!u||Object.keys(u).some(k=>!['text','at'].includes(k))||u.text!==expected[i])throw Error('reveal splits Thai marks or changes text');
  u.at=time(u.at);if(u.at<last-.000001||u.at<c.start||u.at>c.end-.22)throw Error('reveal times must be ordered and leave a reading hold');last=u.at;
 }
}
export function captionUnitState(c,t){const units=c.reveal??[];return {count:units.filter(u=>t>=u.at).length,text:units.filter(u=>t>=u.at).map(u=>u.text).join('')};}
export const originalPopCSS=`.caption-body{padding:0;background:none;border-radius:0}.caption-th{font:600 65px/1.28 TerminalThai;-webkit-text-stroke:5px #0b1015;text-shadow:0 4px 2px #05090dc9}.caption-en{display:table;margin:9px auto 0;padding:3px 10px 4px;background:#0b1015b8;font:600 30px/1.2 TerminalThai;letter-spacing:.7px;text-transform:uppercase;-webkit-text-stroke:0;max-width:100%}.pop-unit{display:inline-block;white-space:pre;transform-origin:50% 70%;opacity:0}.episode-mark{top:210px;padding:4px 10px;background:#0b1015b8;font:600 32px TerminalThai}`;
export function popMarkup(c,esc,color){
 let words='',script='',offset=0;const keyStart=c.thai.indexOf(c.highlight),keyEnd=keyStart+c.highlight.length;
 for(let i=0;i<c.reveal.length;i++){
  const u=c.reveal[i],end=offset+u.text.length,highlight=end>keyStart&&offset<keyEnd,id=`unit-${c.id}-${i}`;
  words+=`<span id="${id}" class="pop-unit${highlight?' pop-key':''}" style="${highlight?'color:'+color:''}" data-unit-index="${i}" data-reveal-at="${u.at}">${esc(u.text)}</span>`;
  script+=`tl.fromTo('#${id}',{opacity:0,y:5,scale:.94},{opacity:1,y:0,scale:1.04,duration:.09,ease:'power2.out'},${u.at});tl.to('#${id}',{scale:1,duration:.07,ease:'power2.out'},${u.at+.09});`;
  offset=end;
 }
 return {words,script};
}
