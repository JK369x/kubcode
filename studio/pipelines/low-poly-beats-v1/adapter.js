const handReveal=new T.Group();ss.add(handReveal);rod(handReveal,[0,-.50,-.30],[0,0,0],.065,mat.rot);box(handReveal,.14,.085,.19,0,0,.05,mat.rot);for(let i=0;i<3;i++)rod(handReveal,[-.045+i*.045,0,.12],[-.045+i*.045,.015,.26],.014,mat.rot);
const handFill=new T.PointLight('#92b5b8',1.5,3,1.4);handFill.position.set(1.3,-.3,-3.5);ss.add(handFill);
step.rim.intensity=.6;step.scene.children.find(x=>x.isHemisphereLight).intensity=.62;emergency.intensity=6;lowerFill.intensity=6;
const atStep=(a,n)=>a.g.position.set(-.4,-.22*n,.6-.6*n);
function renderAt(time){
 const s=stateAt(plan,time),v=s.values,t=s.time;
 for(const w of Object.values(worlds))for(const a of w.actors)pose(a,0,false);
 atStep(sh,v.heroStep);sh.g.rotation.set(0,Math.PI,0);if(v.heroWalking>.5&&v.heroFreeze<.5)pose(sh,t,true);
 sh.arms[0].sh.rotation.z=-.32;sh.arms[0].elbow.rotation.x=-.22;sh.arms[1].sh.rotation.x=lerp(-.3,-1.3,v.heroTorchRaise);sh.arms[1].elbow.rotation.x=-.65;
 atStep(iz,v.infectedStep);iz.g.position.x=.35;iz.g.rotation.set(0,v.infectedDirection,0);iz.g.visible=v.infectedVisible>.5;if(v.infectedMove>.5)pose(iz,t,true);
 iz.arms[1].sh.rotation.set(-.8*(1-v.infectedRailGrip),0,1.3*v.infectedRailGrip);iz.arms[1].elbow.rotation.set(-.15*(1-v.infectedRailGrip),0,0);iz.head.rotation.y=v.infectedTurn;iz.arms[0].sh.rotation.x=lerp(-.55,-1.45,v.infectedReach);iz.arms[0].elbow.rotation.x=-.1;
 reaching.position.z=.12*v.shoeReach;handReveal.visible=v.handVisible>.5;handReveal.position.set(1.34,lerp(-1.02,-.74,v.handRise),lerp(-4.35,-4.13,v.handSlide));handFill.intensity=handReveal.visible?1.5:0;
 spot.intensity=v.torch*26;shaft.visible=v.torch>.1;spot.position.set(-.4,.06,-2.55);spot.target.position.set(.35,-.15,-4.2);shaft.position.copy(spot.position).add(spot.target.position).multiplyScalar(.5);shaft.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),spot.position.clone().sub(spot.target.position).normalize());step.key.intensity=v.stepFill;
 pipe.visible=bucket.visible=water.visible=v.pipeVisible>.5;ripple.visible=v.pipeVisible>.5&&v.pipeDrip>.5;drops.forEach((d,i)=>{d.visible=ripple.visible;d.position.y=-1.9-((t*1.4+i/3)%1)*.75});ripple.scale.setScalar(.2+(t*1.4)%1);
 lh.g.position.set(.2,0,v.landingHeroZ);lh.g.rotation.set(0,Math.PI,0);if(v.landingHeroWalk>.5)pose(lh,t,true);lh.head.rotation.y=v.landingHeroLook;
 seated.g.visible=v.figureVisible>.5;seated.g.position.set(-1.2,-.35,-5.05);seated.g.rotation.set(0,Math.PI,0);seated.head.rotation.y=v.figureTurn;seated.legs.forEach(l=>{l.hip.rotation.x=-1.4;l.knee.rotation.x=1.4});seated.arms.forEach(a=>{a.sh.rotation.x=-.7;a.elbow.rotation.x=-.7});
 paLed.scale.setScalar(1+.15*Math.sin(t*5)*v.paPulse);choiceOne.visible=v.choices===1||v.choices===3;choiceTwo.visible=v.choices===2||v.choices===3;
 below.g.visible=v.lowerVisible>.5;below.g.position.set(1.85,-2,-9);below.g.rotation.set(0,Math.PI,0);if(v.lowerWalk>.5)pose(below,t,true);
 ch.head.rotation.x=.05;handset.rotation.set(0,-.05,0);
 camera.position.set(...s.position);camera.lookAt(...s.lookAt);renderer.render(worlds[s.world].scene,camera);
 window.__filmState={...s,branch:'stairs',nextBranchChosen:false};
}
window.renderFilm=renderAt;window.addEventListener('hf-seek',e=>renderAt(e.detail.time));renderAt(0);
Promise.all([document.fonts.load('600 65px TerminalThai'),document.fonts.load('30px TerminalLatin')]).then(()=>{labels.forEach(draw=>draw());renderAt(0);window.resolveFilm?.();});
