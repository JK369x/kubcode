import {test,expect} from 'bun:test';
import {createApp} from './app';
test('API health is available but account inventory requires the local API key',async()=>{
 const app=createApp({stateRoot:'/unused',apiKey:'a-local-api-key-for-tests'});
 expect((await app.handle(new Request('http://localhost/health'))).status).toBe(200);
 expect((await app.handle(new Request('http://localhost/connections'))).status).toBe(401);
});

import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('inventory is disk-only and returns account metadata without credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jk-social-'));
 try{
  await mkdir(root+'/youtube/demo',{recursive:true});
  await writeFile(root+'/youtube/demo/channel.json',JSON.stringify({id:'channel-a',title:'Demo'}));
  await writeFile(root+'/youtube/demo/token.json','NOT VALID JSON AND MUST NOT BE READ');
  const app=createApp({stateRoot:root,apiKey:'a-local-api-key-for-tests'});
  const response=await app.handle(new Request('http://localhost/connections',{headers:{authorization:'Bearer a-local-api-key-for-tests'}}));
  expect(await response.json()).toEqual([{platform:'youtube',profile:'demo',id:'channel-a',name:'Demo',connected:true}]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('YouTube verifies the selected binding before provider calls and rejects a different live identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jk-social-'));let calls=0;
 try{
  await mkdir(root+'/youtube/demo',{recursive:true});
  await writeFile(root+'/youtube/demo/channel.json',JSON.stringify({id:'channel-a',title:'Demo'}));
  await writeFile(root+'/youtube/demo/token.json',JSON.stringify({token:'private-provider-token'}));
  const transport:typeof fetch=(async(input,init)=>{calls++;expect(String(input)).toContain('https://www.googleapis.com/youtube/v3/channels?');expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-provider-token');expect(init?.redirect).toBe('error');return Response.json({items:[{id:'channel-b',snippet:{title:'Wrong'}}]});}) as typeof fetch;
  const app=createApp({stateRoot:root,apiKey:'a-local-api-key-for-tests',transport});
  const request=(id:string)=>new Request('http://localhost/youtube/demo/verify',{method:'POST',headers:{authorization:'Bearer a-local-api-key-for-tests','content-type':'application/json'},body:JSON.stringify({channelId:id})});
  expect((await app.handle(request('wrong-local-binding'))).status).toBe(409);expect(calls).toBe(0);
  const response=await app.handle(request('channel-a'));expect(response.status).toBe(409);expect(calls).toBe(1);expect(await response.text()).not.toContain('private-provider-token');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Instagram checks user_id rather than an app-scoped id and returns only verified identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jk-social-'));
 try{
  await mkdir(root+'/instagram/demo.account',{recursive:true});
  await writeFile(root+'/instagram/demo.account/account.json',JSON.stringify({user_id:'user-a',username:'demo.account'}));
  await writeFile(root+'/instagram/demo.account/token.json',JSON.stringify({access_token:'ig-private-token'}));
  const app=createApp({stateRoot:root,apiKey:'a-local-api-key-for-tests',transport:(async(input,init)=>{expect(String(input)).toBe('https://graph.instagram.com/v26.0/me?fields=user_id%2Cusername');expect(new Headers(init?.headers).get('authorization')).toBe('Bearer ig-private-token');return Response.json({id:'app-scoped-other-id',user_id:'user-a',username:'demo.account'});}) as typeof fetch});
  const response=await app.handle(new Request('http://localhost/instagram/demo.account/verify',{method:'POST',headers:{authorization:'Bearer a-local-api-key-for-tests','content-type':'application/json'},body:JSON.stringify({userId:'user-a',username:'@Demo.Account'})}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({platform:'instagram',profile:'demo.account',id:'user-a',name:'demo.account',verified:true});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('valid YouTube identity succeeds; provider errors are sanitized and no mutation route exists',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jk-social-'));
 try{
  await mkdir(root+'/youtube/demo',{recursive:true});await writeFile(root+'/youtube/demo/channel.json',JSON.stringify({id:'channel-a',title:'Demo'}));await writeFile(root+'/youtube/demo/token.json',JSON.stringify({token:'private-token'}));
  let fail=false;const app=createApp({stateRoot:root,apiKey:'a-local-api-key-for-tests',transport:(async()=>fail?new Response('private-token',{status:401}):Response.json({items:[{id:'channel-a',snippet:{title:'Demo'}}]})) as typeof fetch});
  const request=()=>new Request('http://localhost/youtube/demo/verify',{method:'POST',headers:{authorization:'Bearer a-local-api-key-for-tests','content-type':'application/json'},body:JSON.stringify({channelId:'channel-a'})});
  expect(await (await app.handle(request())).json()).toEqual({platform:'youtube',profile:'demo',id:'channel-a',name:'Demo',verified:true});fail=true;const response=await app.handle(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('private-token');
  expect((await app.handle(new Request('http://localhost/publish',{method:'POST'}))).status).toBe(404);
 }finally{await rm(root,{recursive:true,force:true});}
});
