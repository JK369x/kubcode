import * as THREE from './assets/three.module.js';
const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('world'),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(1080,1920,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
const scene=new THREE.Scene();scene.background=new THREE.Color('#6c6869');scene.fog=new THREE.Fog('#6c6869',38,110);
const camera=new THREE.PerspectiveCamera(42,1080/1920,.1,180);
scene.add(new THREE.HemisphereLight('#b0b4c1','#484341',1.05));
const sun=new THREE.DirectionalLight('#e0d0b9',1.75);sun.position.set(-18,12,-4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:35,bottom:-30,near:.5,far:80});sun.shadow.bias=-.001;scene.add(sun);scene.add(sun.target);
const fill=new THREE.DirectionalLight('#a7b6c6',.32);fill.position.set(-5,10,22);scene.add(fill);
const mat=(c,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:.9,flatShading:true,...extra});
const concrete=mat('#a19b91'),asphalt=mat('#363b40'),pavement=mat('#827e74'),glass=mat('#424f5a',{roughness:.45,metalness:.1}),dark=mat('#222b31'),rubber=mat('#23262a'),white=mat('#d3d5cf'),metal=mat('#8b9297',{metalness:.45,roughness:.6});
let seed=52;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
function mesh(geo,material,parent=scene){const obj=new THREE.Mesh(geo,material);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
function box(w,h,d,x,y,z,material,parent=scene){const obj=mesh(new THREE.BoxGeometry(w,h,d),material,parent);obj.position.set(x,y,z);return obj;}
function limb(a,b,r,material,parent){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);const obj=mesh(new THREE.CylinderGeometry(r*.85,r,start.distanceTo(end),5),material,parent);obj.position.copy(start.add(end).multiplyScalar(.5));obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(new THREE.Vector3(...a)).normalize());return obj;}
box(16,.15,115,0,-.13,-28,asphalt);box(3,.26,115,-9.4,-.03,-28,pavement);box(3,.26,115,9.4,-.03,-28,pavement);
for(let z=22;z>-85;z-=5){for(const x of [-2.7,2.7])box(.09,.012,2.5,x,.002,z,mat('#d0c5aa'));}
for(const side of [-1,1])for(let k=0;k<12;k++){
 const z=15-k*8;const h=7+rnd()*14,w=4+rnd()*3;const x=side*(13+w/2);
 const material=mat(['#81796e','#7e8587','#9a887d','#777b83'][k%4]);box(w,h,7,x,h/2,z,material);
 box(w+.3,.24,7.3,x,h,z,mat('#59616a'));
 for(let row=0;row<Math.floor(h/1.6);row++)for(let col=0;col<3;col++){
  const xx=side*(12.97),zz=z-2+col*2;
  const window=box(.09,1.03,.8,xx,.9+row*1.6,zz,rnd()>.84?mat('#c8b89a',{emissive:'#66502c',emissiveIntensity:.16}):glass);
  if(side===-1)window.position.x=-12.97;
 }
 if(k%2===0){box(1.6,.22,1.6,side*10.1,4,z,metal);limb([side*10.1,0,z],[side*10.1,4,z],.045,metal,scene);}
}
const treeMat=mat('#536657');for(const side of [-1,1])for(let k=0;k<9;k++){if(side===-1&&k<2)continue;const x=side*9.3,z=12-k*10;limb([x,0,z],[x,3.8,z],.14,mat('#5b5149'),scene);for(let n=0;n<3;n++){const crown=mesh(new THREE.IcosahedronGeometry(1.5,1),treeMat);crown.position.set(x+(n-1)*.55,3.6+n*.38,z+(n%2)*.6);crown.scale.set(1,1.1,1);}}

for(let n=0;n<9;n++){const x=-18+n*4.5,z=-55-(n%3)*7,h=23+(n%4)*5;box(4,h,5,x,h/2,z,mat(n%2?'#8a8583':'#909295'));for(let row=0;row<Math.floor(h/1.8);row++)for(let col=0;col<3;col++)box(.58,.9,.06,x-1.1+col*1.1,1.1+row*1.8,z+2.53,glass);}
for(const side of [-1,1])for(let k=0;k<10;k++){const z=12-k*8;for(let floor=0;floor<3;floor++){
 box(.45,.35,.9,side*12.8,1.2+floor*2,z+2.4,mat('#9c9e97'));
 box(.42,.05,.94,side*12.8,1.38+floor*2,z+2.4,mat('#626c71'));
}box(.5,.08,3.8,side*12.6,2.7,z,metal);}

function car(color='#c6c9c9'){
 const group=new THREE.Group();const paint=mat(color,{roughness:.55});
 box(1.72,.43,3.65,0,.57,0,paint,group);box(1.78,.16,3.55,0,.38,0,paint,group);
 const cabinGeo=new THREE.BufferGeometry();cabinGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.75,.8,1,.75,.8,1,.75,.8,-1,-.75,.8,-1,-.64,1.36,.49,.64,1.36,.49,.64,1.36,-.7,-.64,1.36,-.7],3));cabinGeo.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7]);cabinGeo.computeVertexNormals();mesh(cabinGeo,glass,group);
 const roof=box(1.28,.07,1.19,0,1.38,-.105,paint,group);
 box(1.57,.12,.82,0,.83,1.32,paint,group);box(1.57,.12,.64,0,.83,-1.48,paint,group);
 for(const sx of [-1,1])for(const z of [-1.15,1.13]){const wheel=mesh(new THREE.CylinderGeometry(.35,.35,.2,10),rubber,group);wheel.rotation.z=Math.PI/2;wheel.position.set(sx*.86,.36,z);const hub=mesh(new THREE.CylinderGeometry(.21,.21,.21,6),metal,group);hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);}
 box(1.5,.06,.035,0,.62,1.842,mat('#e9eeee',{emissive:'#d7e7e8',emissiveIntensity:1.1}),group);
 box(1.42,.055,.04,0,.61,-1.842,mat('#ba5344',{emissive:'#a22c24',emissiveIntensity:.7}),group);
 for(const x of [-.755,.755]){box(.045,.58,.04,x,1.06,-.13,paint,group);box(.025,.31,1.48,x,.56,-.15,mat('#929b9f'),group);}
 for(const x of [-.8,.8])box(.16,.13,.29,x,.98,.44,paint,group);
 return group;
}
const cars=[];for(let row=0;row<11;row++)for(let lane=0;lane<4;lane++){
 const obj=car(['#d5d4ce','#b7bebd','#a4adb1','#c8c5bd'][(row+lane)%4]);obj.position.set(-5.5+lane*3.65,0,11-row*6.1);scene.add(obj);cars.push(obj);
}
const hover=car('#c7d1d3');hover.position.set(-.4,6.4,-10);hover.rotation.y=.16;scene.add(hover);
for(const x of [-.55,.55]){const glow=mesh(new THREE.ConeGeometry(.3,2,12,1,true),new THREE.MeshBasicMaterial({color:'#b8dfdf',transparent:true,opacity:.09,side:THREE.DoubleSide}),hover);glow.position.set(x,-1.2,-.9);}
function person(){
 const group=new THREE.Group();const jacket=mat('#626c75'),pants=mat('#3b414a'),skin=mat('#bb987c'),hair=mat('#4d3d32');
 limb([-.12,.86,0],[-.14,.12,.04],.10,pants,group);limb([.12,.86,0],[.18,.12,-.02],.10,pants,group);
 box(.22,.1,.38,-.14,.06,.1,dark,group);box(.22,.1,.38,.18,.06,.06,dark,group);
 const torso=mesh(new THREE.CylinderGeometry(.22,.19,.66,6),jacket,group);torso.position.y=1.12;torso.scale.z=.65;box(.1,.45,.025,-.09,1.17,.15,mat('#727d86'),group);box(.1,.45,.025,.09,1.17,.15,mat('#727d86'),group);box(.055,.5,.02,0,1.13,.16,mat('#b7b4a5'),group);for(const x of [-.2,.2]){const shoulder=mesh(new THREE.IcosahedronGeometry(.14,1),jacket,group);shoulder.position.set(x,1.32,0);shoulder.scale.set(1,1.1,.8);}
 const headPivot=new THREE.Group();headPivot.position.set(0,1.58,0);group.add(headPivot);
 const head=mesh(new THREE.IcosahedronGeometry(.18,1),skin,headPivot);head.scale.set(.83,1.15,.9);
 const cap=mesh(new THREE.IcosahedronGeometry(.183,1),hair,headPivot);cap.scale.set(.88,.7,.96);cap.position.y=.1;
 box(.18,.035,.12,0,.11,.14,hair,headPivot);const nose=mesh(new THREE.IcosahedronGeometry(.045,0),skin,headPivot);nose.position.set(0,-.015,.16);const ear=mesh(new THREE.IcosahedronGeometry(.035,0),skin,headPivot);ear.position.set(.15,0,0);const ear2=ear.clone();ear2.position.x=-.15;headPivot.add(ear2);
 limb([-.21,1.35,0],[-.33,1.0,.18],.075,jacket,group);limb([-.33,1.0,.18],[-.29,1.04,.4],.055,skin,group);
 limb([.21,1.35,0],[.32,1.07,.14],.075,jacket,group);limb([.32,1.07,.14],[.24,1.02,.43],.055,skin,group);
 return {group,headPivot};
}
const observer=person();observer.group.position.set(-8.8,3.5,14.5);observer.group.rotation.y=Math.PI-.25;scene.add(observer.group);
box(3,.2,5,-7.1,3.35,15.6,concrete);
for(const x of [-8.4,-5.8]){limb([x,3.4,13.5],[x,4.45,13.5],.045,metal,scene);limb([x,3.4,17.7],[x,4.45,17.7],.045,metal,scene);limb([x,4.45,13.5],[x,4.45,17.7],.045,metal,scene);}
limb([-8.4,4.45,13.5],[-5.8,4.45,13.5],.055,metal,scene);
const rainGeo=new THREE.BufferGeometry();const rainPositions=[];for(let i=0;i<250;i++){const x=rnd()*28-14,y=rnd()*16,z=rnd()*48-20;rainPositions.push(x,y,z,x-.015,y-.13,z);}
rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPositions,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#d4d4d7',transparent:true,opacity:.09}));scene.add(rain);
function renderAt(t){
 const p=THREE.MathUtils.clamp(t/8,0,1);camera.position.set(-12.5+p*1.7,7.1-p*.25,22.7-p*2.3);camera.lookAt(-.2,3.5,-10);
 hover.position.y=6.6+p*1.2;hover.position.z=-10-p*2.5;hover.rotation.z=-.03+p*.045;
 observer.headPivot.rotation.y=-.28+Math.min(1,Math.max(0,(t-1.4)/1.1))*.54;
 rain.position.y=-(t*.55)%1;renderer.render(scene,camera);
}
window.__styleAudit={renderAt,hover,observer,camera,scene};
window.addEventListener('hf-seek',e=>renderAt(e.detail.time));
window.__timelines=window.__timelines||{};const clock={t:0};const tl=window.__timelines.main;tl.to(clock,{t:8,duration:8,ease:'none',onUpdate:()=>renderAt(clock.t)},0);window.__timelines.main=tl;renderAt(0);
