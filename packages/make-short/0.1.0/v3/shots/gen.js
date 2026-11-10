// Generates ../shots.json. Positions are anchor-relative: {anchor,off:[x,y,z]} (set-local metres).
const fs=require('fs'),path=require('path');
const A=(anchor,off=[0,0,0])=>({anchor,off});
const C=(f,pos,target,lens,roll=0)=>({f,pos,target,lens,roll_deg:roll});
const P=(f,char,name)=>({f,char,act:'pose',args:{name}});
const F=(f,char,name)=>({f,char,act:'face',args:{name}});
const L=(f,char,anchor,off=[0,0,0],rot_z=0)=>({f,char,act:'place',args:{loc:A(anchor,off),rot_z}});
const H=(f,char,prop)=>({f,char,act:'hold',args:{prop}});
const pr=(f,prop,action,args={})=>({f,prop,action,args});
const fx=(f,type,at,dir)=>dir?{f,type,at,dir}:{f,type,at};
const M='marcel_spot',G='gaston_spot';
const S=[];
const add=(id,set,a,b,tr,mood,size,angle,words,cam,actions=[],props=[],fxs=[])=>S.push({id,set,f_in:a,f_out:b,transition_in:tr,mood,size,angle,words,camera:cam,actions,props,fx:fxs});

add('s01','camp',0,36,'dissolve','day','XW','crane-down','Canned food',
 [C(0,A('crate',[-3,9,6]),A('crate',[0,0,0.8]),24,0),C(36,A('crate',[-2,7,3.5]),A('crate',[0,0,0.8]),24,0)],
 [L(0,'marcel',M),P(0,'marcel','sit'),F(0,'marcel','hungry')],[pr(0,'crate','appear')]);
add('s02','insert',36,96,'whip','day','MACRO','dutch+6','forty-eight years',
 [C(36,A('table',[0.6,1.1,0.5]),A('table',[0,0,0.3]),85,6),C(96,A('table',[-0.4,1.0,0.55]),A('table',[0,0,0.3]),85,3)],
 [],[pr(39,'can','appear')]);
add('s03','camp',96,172,'whip','day','MED','low-up','before anyone invented the can opener',
 [C(96,A(M,[-1.5,3.2,0.3]),A(M,[0.4,0,1.2]),35,-4),C(172,A(M,[1.0,3.6,0.4]),A(M,[0.2,0,1.2]),35,-8)],
 [L(96,'marcel',M),P(96,'marcel','sit'),F(96,'marcel','hungry'),P(130,'marcel','sigh')]);
add('s04','insert',172,240,'whip','day','MACRO','top-crane','Just hammers and bad ideas',
 [C(172,A('table',[0.3,0.9,1.6]),A('table',[0,0,0.2]),70,-5),C(240,A('table',[-0.2,0.8,0.9]),A('table',[0,0,0.2]),70,5)],
 [],[pr(173,'hammer','appear'),pr(193,'chisel','appear'),pr(209,'can','dent',{amount:0.6})],[fx(209,'puff',A('table',[0,0,0.3]))]);
add('s05','camp',240,300,'whip','day','CU','low-up','Meet Marcel ... very hungry',
 [C(240,A(M,[0.4,1.9,0.5]),A(M,[0,0,1.25]),85,3),C(300,A(M,[0.0,1.5,0.7]),A(M,[0,0,1.3]),85,0)],
 [L(240,'marcel',M),P(240,'marcel','idle'),F(248,'marcel','neutral'),F(282,'marcel','hungry')]);
add('s06','camp',300,345,'travel','day','XW','crane-high','soldier by the river',
 [C(300,A(M,[-4,10,6]),A(M,[0,-2,0.5]),24,-4),C(345,A(M,[-2,8,4]),A(M,[0,-1,0.8]),24,-2)],
 [L(300,'marcel',M),P(300,'marcel','sit')]);
add('s07','camp',345,405,'travel','day','MED','eye-level','army sent him a crate of canned beef',
 [C(345,A('crate',[-2.5,4.0,1.4]),A('crate',[-0.8,0,0.9]),35,0),C(405,A('crate',[-1.2,3.2,1.2]),A('crate',[-0.8,0,1.0]),40,0)],
 [P(345,'marcel','idle'),F(361,'marcel','hungry')],[pr(361,'crate','appear'),pr(376,'can','appear')]);
add('s08','camp',405,445,'travel','day','CU','dutch-8','Marcel tries his knife',
 [C(405,A(M,[0.9,1.8,0.6]),A(M,[0.2,0,1.3]),85,-8),C(445,A(M,[0.6,1.6,0.8]),A(M,[0.2,0,1.3]),85,-6)],
 [F(405,'marcel','determined'),H(419,'marcel','knife'),P(425,'marcel','stab'),P(436,'marcel','stab')],[pr(419,'knife','appear')]);
add('s09','camp',445,479,'travel','day','MACRO','low-side','The knife bends',
 [C(445,A('crate',[0.5,0.9,0.6]),A('crate',[0,0,1.0]),100,4),C(479,A('crate',[0.3,0.8,0.8]),A('crate',[0,0,1.0]),100,2)],
 [F(456,'marcel','pain')],[pr(456,'knife','bend',{amount:1.0})],[fx(456,'puff',A('crate',[0,0,1.0]))]);
add('s10','camp',479,536,'travel','day','WIDE','low-up','His boot. The boot hurts more',
 [C(479,A(M,[2.5,4.0,0.2]),A(M,[0,0,0.9]),28,5),C(536,A(M,[1.2,4.6,0.3]),A(M,[0,0,0.9]),28,2)],
 [P(489,'marcel','kick'),F(489,'marcel','determined'),F(508,'marcel','pain'),P(508,'marcel','recoil')],
 [pr(489,'boot','appear')],[fx(508,'puff',A(M,[0.3,0,0.2]))]);
add('s11','camp',536,600,'travel','day','CU','crane-down','A rock. The rock loses',
 [C(536,A(M,[0.5,1.8,2.4]),A(M,[0,0,1.2]),70,0),C(600,A(M,[0.5,1.7,1.5]),A(M,[0,0,1.1]),70,-3)],
 [P(536,'marcel','idle'),H(547,'marcel','rock'),P(547,'marcel','smash_down'),F(558,'marcel','determined'),F(571,'marcel','pain')],
 [pr(547,'rock','appear'),pr(571,'rock','bend',{amount:0})],[fx(562,'puff',A('crate',[0,0,1.0]))]);
add('s12','camp',600,642,'whip','day','XW','low-up','Chef Gaston marches over',
 [C(600,A(M,[-1.0,6.5,0.3]),A(G,[0,0,1.0]),24,6),C(642,A(M,[-0.2,5.5,0.4]),A(G,[0,0,1.0]),24,0)],
 [L(603,'gaston',G,[6,0,0]),P(603,'gaston','march'),L(625,'gaston',G,[1.5,0,0]),F(603,'gaston','smug'),P(625,'gaston','idle'),F(600,'marcel','neutral')]);
add('s13','camp',642,682,'travel','day','CU','dutch+10','Step aside, amateur',
 [C(642,A(G,[-0.6,1.8,0.2]),A(G,[0,0,1.35]),85,10),C(682,A(G,[-0.3,1.6,0.3]),A(G,[0,0,1.35]),85,8)],
 [F(642,'gaston','smug'),P(642,'gaston','point')]);
add('s14','camp',682,745,'travel','day','MED','eye-level','He smacks it with a frying pan. Nothing.',
 [C(682,A('crate',[0,4.0,1.5]),A('crate',[0,0,1.0]),35,-3),C(745,A('crate',[1.0,3.5,1.2]),A('crate',[0,0,1.0]),35,0)],
 [H(689,'gaston','pan'),P(689,'gaston','smash_down'),P(731,'gaston','sigh'),F(731,'gaston','neutral')],
 [pr(689,'pan','appear'),pr(721,'can','dent',{amount:0.2})],[fx(721,'puff',A('crate',[0,0,1.0])),fx(721,'sparkle',A('crate',[0,0,1.2]))]);
add('s15','camp',745,800,'travel','day','CU','low-up','He sits on it. Still nothing.',
 [C(745,A('crate',[1.0,1.8,0.2]),A(G,[0,0,1.1]),70,-6),C(800,A('crate',[0.4,2.0,0.3]),A(G,[0,0,1.2]),70,-3)],
 [P(758,'gaston','sit'),F(772,'gaston','smug'),F(799,'gaston','neutral')],[],[fx(772,'puff',A('crate',[0,0,0.6]))]);
add('s16','camp',800,852,'travel','day','WIDE','track-side','Marcel hurls it at a tree',
 [C(800,A(M,[0,5.5,1.6]),A(M,[3,0,1.3]),28,0),C(852,A('tree',[-4,6,1.5]),A('tree',[0,0,1.8]),28,-5)],
 [P(812,'marcel','throw'),F(812,'marcel','determined')],
 [pr(823,'can','appear',{fly_to:'tree',frames:[823,861]})],[fx(823,'speedlines',A(M,[1,0,1.4]),[1,0,0]),fx(840,'speedlines',A(M,[3,0,2]),[1,0,0])]);
add('s17','camp',852,900,'travel','day','MED','low-up','The tree loses too',
 [C(852,A('tree',[-3.0,3.8,0.4]),A('tree',[0,0,1.6]),35,4),C(900,A('tree',[-2.2,3.4,0.5]),A('tree',[0,0,1.6]),35,7)],
 [F(889,'marcel','pain')],[pr(866,'can','dent',{amount:0.4})],[fx(866,'puff',A('tree',[0,0.3,1.2]))]);
add('s18','camp',900,945,'travel','day','CU','dutch-12','Wait.',
 [C(900,A(M,[1.0,1.9,0.3]),A(M,[0.9,0,1.3]),85,-12),C(945,A(M,[0.9,1.6,0.4]),A(M,[0.9,0,1.3]),85,-12)],
 [L(900,'marcel',M,[-0.3,0,0]),P(900,'marcel','shock'),F(900,'marcel','shock'),L(900,'gaston',G,[-1.8,0.1,0]),P(910,'gaston','peer'),F(910,'gaston','shock')]);
add('s19','camp',945,977,'travel','day','MED','crane-down','Who sells food nobody can open?',
 [C(945,A('crate',[2.4,3.6,2.4]),A('crate',[0,0,0.8]),40,6),C(977,A('crate',[1.6,3.0,1.4]),A('crate',[0,0,0.8]),40,2)],
 [P(945,'marcel','peer'),P(945,'gaston','peer')]);
add('s20','night',977,1042,'dissolve','night','XW','crane-down','You see, nobody had thought that far ahead',
 [C(977,A('fire',[-5,11,6.5]),A('fire',[0,0,1.0]),24,-5),C(1042,A('fire',[-3,8,3.2]),A('fire',[0,0,1.2]),24,-3)],
 [L(977,'marcel',M),P(977,'marcel','sit'),F(977,'marcel','neutral'),L(977,'gaston',G),P(977,'gaston','sit'),F(977,'gaston','smug')],[],[fx(977,'godrays','night')]);
add('s21','insert',1042,1102,'whip','night','MED','crane-down','The can was patented in 1810',
 [C(1042,A('table',[0.4,2.6,2.8]),A('table',[0,0,0.3]),40,0),C(1102,A('table',[0.4,1.8,1.0]),A('table',[0,0,0.3]),40,5)],
 [],[pr(1042,'can','appear'),pr(1042,'label_card','appear')]);
add('s22','insert',1102,1133,'travel','night','MACRO','low-dutch+12','in thick iron',
 [C(1102,A('table',[0.3,0.35,0.15]),A('table',[0,0,0.25]),100,12),C(1133,A('table',[0.15,0.30,0.18]),A('table',[0,0,0.28]),100,10)],
 [],[pr(1106,'can','dent',{amount:0.3})],[fx(1106,'puff',A('table',[0.1,0,0.3]))]);
add('s23','insert',1133,1182,'travel','night','MED','eye-level','often heavier than the food inside',
 [C(1133,A('table',[-1.6,2.8,0.7]),A('table',[0,0,0.4]),35,-3),C(1182,A('table',[-0.8,2.5,0.6]),A('table',[0,0,0.4]),35,0)],
 [],[pr(1138,'scale','appear'),pr(1138,'can','appear',{on:'scale'}),pr(1153,'food','appear',{on:'scale',tip:'iron_down'})]);
add('s24','insert',1182,1250,'travel','night','MACRO','top-down','The label instructions: Cut round the top',
 [C(1182,A('table',[0,0.3,1.2]),A('table',[0,0,0.05]),70,0),C(1250,A('table',[0,0.25,0.7]),A('table',[0,0,0.05]),85,-4)],
 [],[pr(1182,'label_card','appear')]);
add('s25','insert',1250,1284,'travel','night','MED','crane-high','with a chisel and hammer',
 [C(1250,A('table',[2.0,2.4,2.2]),A('table',[0,0,0.2]),35,8),C(1284,A('table',[1.4,2.0,1.4]),A('table',[0,0,0.2]),35,5)],
 [],[pr(1250,'chisel','appear'),pr(1260,'hammer','appear')]);
add('s26','tent',1284,1336,'dissolve','interior','MED','eye-level','Gaston grabs a chisel and hammer',
 [C(1284,A('table',[-2.2,3.6,1.3]),A('table',[0.2,0,1.0]),35,0),C(1336,A('table',[-1.5,3.2,1.3]),A('table',[0.2,0,1.0]),40,-3)],
 [L(1284,'gaston',G),P(1284,'gaston','idle'),F(1284,'gaston','determined'),H(1303,'gaston','chisel'),H(1318,'gaston','hammer'),L(1284,'marcel',M),P(1284,'marcel','sit'),F(1284,'marcel','hungry')]);
add('s27','tent',1336,1387,'travel','interior','CU','low-up','Marcel closes his eyes',
 [C(1336,A(M,[0.5,1.8,0.3]),A(M,[0,0,1.2]),85,-5),C(1387,A(M,[0.3,1.6,0.35]),A(M,[0,0,1.2]),85,-3)],
 [P(1351,'marcel','eyes_closed'),F(1351,'marcel','eyes_shut')]);
add('s28','insert',1387,1415,'whip','interior','MACRO','dutch+8','Clang',
 [C(1387,A('table',[0.3,0.55,0.35]),A('table',[0,0,0.25]),100,8),C(1415,A('table',[0.25,0.5,0.3]),A('table',[0,0,0.25]),100,8)],
 [],[pr(1387,'hammer','appear'),pr(1387,'chisel','appear')],[fx(1387,'puff',A('table',[0,0,0.3])),fx(1387,'sparkle',A('table',[0,0,0.35]))]);
add('s29','tent',1415,1442,'whip','interior','WIDE','crane-up','The lid pops',
 [C(1415,A('table',[0,3.6,1.0]),A('table',[0,0,0.9]),28,-4),C(1442,A('table',[0,3.9,2.2]),A('table',[0,0,1.2]),28,0)],
 [P(1415,'gaston','smash_down'),P(1425,'gaston','recoil')],[pr(1420,'lid','pop')],[fx(1420,'sparkle',A('table',[0,0,1.0])),fx(1424,'puff',A('table',[0,0,0.9]))]);
add('s30','tent',1442,1482,'travel','interior','MED','low-up','Marcel takes one bite',
 [C(1442,A(M,[1.2,3.2,0.4]),A(M,[0,0,1.1]),40,3),C(1482,A(M,[0.6,2.8,0.4]),A(M,[0,0,1.2]),40,0)],
 [F(1442,'marcel','hungry'),P(1457,'marcel','bite'),F(1462,'marcel','chewing')]);
add('s31','tent',1482,1520,'travel','interior','CU','dutch-6','and looks betrayed',
 [C(1482,A(M,[0,1.9,0.2]),A(M,[0,0,1.3]),85,-6),C(1520,A(M,[0,1.35,0.2]),A(M,[0,0,1.3]),85,-6)],
 [F(1497,'marcel','betrayed'),P(1497,'marcel','sigh')]);
add('s32','insert',1520,1580,'whip','day','MACRO','low-up','The first American can opener came in 1858',
 [C(1520,A('table',[0.4,0.7,0.1]),A('table',[0,0,0.2]),100,-6),C(1580,A('table',[0.0,0.9,0.5]),A('table',[0,0,0.2]),85,2)],
 [],[pr(1546,'opener_1858','appear')],[fx(1571,'sparkle',A('table',[0,0,0.3]))]);
add('s33','camp',1580,1648,'dissolve','day','XW','crane-down','Soldiers got it in the Civil War',
 [C(1580,A(M,[0,12,6.5]),A(M,[0,0,0.8]),24,0),C(1648,A(M,[4,9,2.5]),A(M,[0,0,0.9]),24,4)],
 [L(1580,'s1',M,[-6,0,0]),L(1580,'s2',M,[-7.5,0.3,0]),L(1580,'s3',M,[-9,0,0]),P(1580,'s1','march'),P(1580,'s2','march'),P(1580,'s3','march'),
  L(1648,'s1',M,[6,0,0]),L(1648,'s2',M,[4.5,0.3,0]),L(1648,'s3',M,[3,0,0])]);
add('s34','camp',1648,1685,'travel','day','MED','low-up','Everyone else?',
 [C(1648,A(G,[-1,3.5,0.3]),A(G,[-1,0,1.1]),35,5),C(1685,A(G,[-0.4,3.3,0.4]),A(G,[-1,0,1.1]),35,2)],
 [L(1648,'gaston',G),P(1648,'gaston','sigh'),F(1665,'gaston','smug'),L(1648,'marcel',M),P(1648,'marcel','peer')]);
add('s35','camp',1685,1727,'travel','day','CU','dutch+12','Too dangerous for home use',
 [C(1685,A(M,[0.6,1.8,0.4]),A(M,[0.3,0,1.2]),85,12),C(1727,A(M,[0.5,1.7,0.5]),A(M,[0.3,0,1.2]),85,10)],
 [L(1685,'s1',M,[1.2,0,0]),H(1685,'s1','opener_1858'),P(1689,'s1','stab'),P(1700,'marcel','recoil'),F(1700,'marcel','shock'),P(1711,'s1','stab')],
 [pr(1685,'opener_1858','appear')],[fx(1706,'puff',A(M,[0.8,0,1.2])),fx(1711,'sparkle',A(M,[0.8,0,1.4]))]);
add('s36','camp',1727,1775,'travel','day','MED','crane-down','Marcel, still chewing',
 [C(1727,A(M,[2.0,3.8,3.0]),A(M,[0,0,1.0]),40,-4),C(1775,A(M,[1.0,3.0,1.6]),A(M,[0,0,1.1]),40,-2)],
 [L(1727,'marcel',M),P(1727,'marcel','chew'),F(1727,'marcel','chewing')]);
add('s37','camp',1775,1815,'travel','day','CU','low-up','calls that progress',
 [C(1775,A(M,[0.3,2.0,0.2]),A(M,[0,0,1.25]),85,0),C(1815,A(M,[0,1.5,0.3]),A(M,[0,0,1.3]),85,0)],
 [F(1790,'marcel','smug'),P(1790,'marcel','smug'),P(1800,'marcel','chew'),F(1800,'marcel','chewing')]);

fs.writeFileSync(path.join(__dirname,'..','shots.json'),JSON.stringify(S,null,1));
const rows=S.map(s=>`| ${s.id} | ${s.set} | ${s.f_in}-${s.f_out} | ${((s.f_out-s.f_in)/30).toFixed(1)} | ${s.words} | ${s.size} | ${s.angle} | ${s.transition_in} |`);
fs.writeFileSync(path.join(__dirname,'table.md'),rows.join('\n'));
