// Original episode-one rig/materials continue into a new stairwell and third-floor set.
const upper=world('upper');corridor(upper);const us=upper.scene;
box(us,9,.5,.25,0,4.35,-2.6,mat.wall);box(us,.3,4.1,.25,.4,2.05,-2.6,mat.wall);
box(us,2.12,3.6,.14,-1.23,1.8,-2.4,mat.metal);sign(us,['ลิฟต์','4'],1.7,.8,-1.23,4,-2.18,{size:160});
const uDoor=new T.Group();uDoor.position.set(.59,0,-2.13);us.add(uDoor);box(uDoor,1.05,3.5,.13,.52,1.75,0,mat.green);box(uDoor,.25,.04,.07,.75,1.55,.09,mat.metal);
sign(us,['บันไดหนีไฟ','4 → 3'],1.85,.8,1.65,4,-2.18,{size:130,bg:'#254349'});
for(let i=0;i<8;i++)box(us,1.8,.15,.5,1.65,-.1-i*.22,-2.7-i*.46,mat.stone);
const uh=actor(us);upper.actors.push(uh);const glow=new T.PointLight('#87bfc8',8,7,1.4);glow.position.set(1.65,2,-2);us.add(glow);
const step=world('step'),ss=step.scene;ss.fog=new T.Fog('#10212a',12,30);
box(ss,3.3,.2,3,0,-.13,2,mat.stone);
for(let i=0;i<14;i++){box(ss,3.3,.22,.60,0,-.12-i*.22,.6-i*.6,mat.stone);box(ss,3.25,.04,.07,0,-.012-i*.22,.91-i*.6,mat.metal);}
box(ss,3.3,.2,2.8,0,-3.1,-8.2,mat.stone);
for(let side of [-1,1]){box(ss,.2,8,14,side*1.8,-.3,-3,mat.wall);rod(ss,[side*1.4,1.1,1],[side*1.4,-1.85,-7.1],.038,mat.metal);for(let i=0;i<6;i++)rod(ss,[side*1.4,-.22*i*2,.6-i*1.2],[side*1.4,1.1-.44*i,.6-i*1.2],.025,mat.metal);}
sign(ss,['ชั้น 4','↓ ชั้น 3'],1.3,.8,-.1,2.8,.1,{size:160,bg:'#214744'});
box(ss,2.3,3.6,.15,0,-1.23,-9.5,mat.green);sign(ss,['3'],.7,.7,0,-.55,-9.39,{size:350});
const emergency=new T.PointLight('#8dbdc8',11,14,1.3);emergency.position.set(.8,1.3,-3.0);ss.add(emergency);
const lowerFill=new T.PointLight('#a8bbb4',9,10,1.4);lowerFill.position.set(-.7,-.3,-7.0);ss.add(lowerFill);
const wet=m('#506f75',{metalness:.55,roughness:.13});
for(let i=0;i<13;i++){const f=mesh(new T.CircleGeometry(.16,12),wet,ss);f.rotation.x=-Math.PI/2;f.position.set((i%2?-.23:.23),.008-i*.22,.55-i*.60);f.scale.set(.54,1.38,1);f.rotateZ(i%2?.08:-.16);}
const sh=actor(ss);step.actors.push(sh);const iz=actor(ss,true,3);step.actors.push(iz);
const stairTorch=new T.Group();sh.arms[1].elbow.add(stairTorch);stairTorch.position.set(0,-.36,.06);box(stairTorch,.08,.08,.24,0,0,.08,mat.black);box(stairTorch,.1,.1,.03,0,0,.22,mat.light);
const spot=new T.SpotLight('#e3e7ce',40,8,.3,.6,1.2);ss.add(spot,spot.target);
const shaft=mesh(new T.ConeGeometry(.7,4,12,1,true),new T.MeshBasicMaterial({color:'#e4e8c5',transparent:true,opacity:.06,depthWrite:false,side:T.DoubleSide}),ss);
const pipe=new T.Group();ss.add(pipe);rod(pipe,[-1.53,1.0,-7],[-1.53,-1.8,-7],.085,mat.metal);rod(pipe,[-1.53,-1.8,-7],[-.92,-1.8,-7],.085,mat.metal);box(pipe,.2,.08,.18,-.94,-1.8,-7,mat.black);
const bucket=mesh(new T.CylinderGeometry(.31,.23,.5,12,1,true),mat.metal,ss);bucket.position.set(-.91,-2.8,-7);const water=mesh(new T.CylinderGeometry(.265,.265,.014,20),wet,ss);water.position.set(-.91,-2.69,-7);
const drops=[];for(let i=0;i<3;i++){const d=ball(ss,.027,-.91,-2,-7,mat.light,1);d.scale.y=2.1;drops.push(d);}
const ripple=mesh(new T.TorusGeometry(.15,.008,4,24),mat.light,ss);ripple.rotation.x=Math.PI/2;ripple.position.set(-.91,-2.675,-7);
const close=world('close'),cs=close.scene;cs.background=new T.Color('#15242a');box(cs,7,.2,8,0,-.2,-1,mat.stone);box(cs,7,5,.2,0,2,-2.3,mat.wall);
const ch=actor(cs);close.actors.push(ch);ch.g.position.set(-.8,0,.3);const cz=actor(cs,true,3);close.actors.push(cz);cz.g.position.set(.30,-.65,-.5);cz.g.rotation.y=-.3;
const cf=new T.PointLight('#9cbfc7',7,7,1.3);cf.position.set(-.5,2,2);cs.add(cf);
const landing=world('landing'),ls=landing.scene;
box(ls,8,.2,16.7,0,-.12,4.65,mat.stone);for(let x=-3;x<=3;x+=1)for(let z=-3;z<=12;z+=1)box(ls,.98,.015,.98,x,-.006,z,((x+z)%3===0)?mat.road:mat.stone);
for(let side of [-1,1])box(ls,.22,6,9,side*4,2,-.3,mat.wall);
box(ls,8,.3,.2,0,4.3,-3.7,mat.wall);box(ls,.3,4,.2,.35,2,-3.7,mat.wall);box(ls,1.6,4,.2,-3.2,2,-3.7,mat.wall);box(ls,1.1,4,.2,3.45,2,-3.7,mat.wall);
const lh=actor(ls);landing.actors.push(lh);
const controlDoor=new T.Group();controlDoor.position.set(-2.6,0,-3.5);ls.add(controlDoor);box(controlDoor,1.9,3.7,.14,.95,1.85,0,mat.green);box(controlDoor,.22,.035,.07,1.65,1.5,.1,mat.metal);controlDoor.rotation.y=-.7;
box(ls,3,.2,4,-1.2,-.13,-5.2,mat.stone);box(ls,3.4,4.7,.2,-1.3,2,-6.8,mat.trim);box(ls,2.6,.17,1.0,-1.25,1,-5.6,mat.wood);
const screens=[];for(let i=0;i<3;i++){box(ls,.78,.55,.1,-2.15+i*.86,1.55,-5.9,mat.black);const screen=box(ls,.70,.46,.016,-2.15+i*.86,1.55,-5.84,m('#345f67',{emissive:'#80cdd6',emissiveIntensity:.6}));screens.push(screen);for(let j=0;j<3;j++)box(ls,.63,.017,.008,-2.15+i*.86,1.43+j*.1,-5.824,mat.trim);}
const seated=actor(ls);landing.actors.push(seated);seated.g.position.set(-1.2,-.35,-5.05);seated.g.rotation.y=Math.PI;
box(ls,.65,.14,.65,-1.2,.5,-5.1,mat.black);box(ls,.65,.45,.14,-1.2,.67,-4.84,mat.black);for(let x of [-1.43,-.97])rod(ls,[x,.1,-4.9],[x,.5,-5.1],.035,mat.metal);
const monitorFill=new T.PointLight('#6ec3c7',9,5,1.3);monitorFill.position.set(-1.1,1.8,-5.4);ls.add(monitorFill);
box(ls,.14,3.7,.2,.57,1.85,-3.8,mat.trim);box(ls,.14,3.7,.2,3.03,1.85,-3.8,mat.trim);box(ls,2.6,.16,.2,1.8,3.7,-3.8,mat.trim);for(let i=0;i<11;i++)box(ls,2.3,.22,.55,1.8,-.12-i*.22,-3.95-i*.55,mat.stone);
rod(ls,[2.8,1.1,-3.7],[2.8,-1.3,-9.7],.035,mat.metal);
for(let i=0;i<10;i++){const f=mesh(new T.CircleGeometry(.16,12),wet,ls);f.rotation.x=-Math.PI/2;f.position.set(1.8+(i%2?-.2:.2),.009-i*.22,-3.95-i*.55);f.scale.set(.54,1.38,1);}
box(ls,.18,7,7.5,.5,-.6,-7.4,mat.wall);box(ls,.18,7,7.5,3.1,-.6,-7.4,mat.wall);box(ls,2.7,6.5,.18,1.8,-1.5,-11.2,mat.wall);box(ls,2.3,.2,2,1.8,-2.54,-10.4,mat.stone);box(ls,2.0,3.5,.12,1.8,-.67,-11.05,mat.green);sign(ls,['2'],.7,.7,1.8,.45,-10.97,{size:350});const bottomLight=new T.PointLight('#88b4bd',4,6.5,1.4);bottomLight.position.set(1.8,-.2,-9.2);ls.add(bottomLight);
const below=actor(ls,true,2);landing.actors.push(below);below.g.position.set(1.85,-2,-9);
const downGlow=new T.PointLight('#8db3bc',9,9,1.3);downGlow.position.set(1.7,.6,-5.2);ls.add(downGlow);
sign(ls,['ชั้น 3','FLOOR 3'],1.0,.85,-3.45,3.3,-3.53,{firstSize:210,size:90});
sign(ls,['ห้องควบคุม','CONTROL ROOM'],2.4,.7,-1.3,4.15,-3.48,{size:100,bg:'#514b3a'});
sign(ls,['ชั้น 2 ↓','ทางออกอีกฝั่ง'],2.0,.7,1.85,4.15,-3.48,{size:115,bg:'#24454b'});
const pa=new T.Group();ls.add(pa);box(pa,.8,.43,.20,0,3.52,-3.45,mat.trim);for(let i=0;i<7;i++)box(pa,.67,.019,.018,0,3.36+i*.045,-3.33,mat.metal);const paLed=ball(pa,.026,.32,3.65,-3.32,mat.red,1);
const routeMap=sign(ls,['ทางไปลานจอดรถ','ชั้น 3 → B1','ประตู B1 ล็อก','ปลดจากห้องควบคุม'],1.1,1.35,-3.2,1.8,-3.48,{bg:'#b7b29b',fg:'#25343a',border:'#686b5d',size:75,line:170});
const choiceOne=sign(ls,['1','ห้องควบคุม'],2.1,1.0,-1.3,3.00,-2.20,{firstSize:310,size:150,line:260,bg:'#55472d',fg:'#ffdf9b'});
const choiceTwo=sign(ls,['2','ลงบันไดต่อ'],2.1,1.0,1.8,3.00,-2.20,{firstSize:310,size:150,line:260,bg:'#22464b',fg:'#b9e8e2'});
const pocket=world('pocket'),ps=pocket.scene;box(ps,8,5,.2,0,2,-2,mat.wall);const handset=new T.Group();ps.add(handset);box(handset,.78,1.5,.09,0,1.45,0,mat.black);sign(handset,['7%','ปิดเสียง','SILENT'],.69,1.29,0,1.45,.052,{bg:'#17272e',size:130,line:200});ball(handset,.17,.44,.9,-.02,mat.skin,1).scale.set(.55,1.7,.6);ball(handset,.23,-.21,.48,-.05,mat.skin,1).scale.set(1.4,.55,.7);

const shoe=world('shoe'),sho=shoe.scene;
for(let i=0;i<4;i++)box(sho,3.0,.22,.55,0,-.12-i*.22,.5-i*.55,mat.stone);
box(sho,.20,.035,.34,-.15,.02,.35,mat.black);box(sho,.19,.10,.28,-.15,.075,.35,m('#344149'));box(sho,.19,.07,.12,-.15,.07,.20,m('#425057'));box(sho,.14,.8,.15,-.15,.5,.44,mat.pants);
const reaching=new T.Group();sho.add(reaching);box(reaching,.13,.095,.21,-.15,.10,-.26,mat.rot);rod(reaching,[-.15,.08,-1.05],[-.15,.10,-.36],.065,mat.rot);
for(let i=0;i<3;i++)rod(reaching,[-.20+i*.045,.10,-.16],[-.20+i*.045,.10,-.015+(i===1?.02:0)],.014,mat.rot);
const shoeFill=new T.PointLight('#a3c1c2',6,6,1.4);shoeFill.position.set(0,1.4,1);sho.add(shoeFill);
const worlds={upper,step,close,landing,pocket,shoe};
