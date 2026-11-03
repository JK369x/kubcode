// Actual Next production server + real PostgreSQL, FICTIONAL identities only.
// OAuth proof input is deliberately supplied by the fixture to real callbacks;
// this does NOT verify external consent/token exchange with Google or LINE.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {Pool} from 'pg';
import {encode} from 'next-auth/jwt';
import {buildAuthOptions} from '../lib/auth';
import {readAuthConfig,SESSION_COOKIE_NAME} from '../lib/auth-policy';
import {createPgAccountStore} from '../lib/accounts/store';
import {migrate} from '../lib/accounts/migrate';
import {createPool} from '../lib/accounts/db';
import {accountToken,sessionClaims} from '../lib/accounts/session';
import {hashOpaqueToken} from '../lib/accounts/crypto';
import {LINK_COOKIE,CSRF_COOKIE} from '../lib/accounts/http';
import {emptyRequestContext} from '../lib/accounts/runtime';

async function main(){
 const local=JSON.parse(readFileSync('.qa/account-linking-local-test.json','utf8'));
 const manifest=JSON.parse(readFileSync('.qa/account-linking-release-build.json','utf8'));
 const url=new URL(local.databaseUrl);assert.equal(url.hostname,'127.0.0.1');assert.ok(url.pathname.includes('test'));
 const db='kb_runtime_'+randomBytes(5).toString('hex')+'_test';assert.match(db,/^kb_runtime_[a-f0-9]{10}_test$/);
 const admin=new Pool({connectionString:local.databaseUrl});await admin.query(`CREATE DATABASE ${db}`);url.pathname='/'+db;
 const pool=createPool(url.toString());const store=createPgAccountStore(pool);await migrate(pool);
 const fixture={NEXTAUTH_URL:'https://kubcode.dev',NEXTAUTH_SECRET:'FIXTURE-ONLY-session-secret-000000000000000001',GOOGLE_CLIENT_ID:'123456789012-fixtureonly0abc.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'FIXTURE-ONLY-client-secret-0001',LINE_CLIENT_ID:'2000000001',LINE_CLIENT_SECRET:'FIXTURE-ONLY-line-channel-secret-01'};
 const cfg=readAuthConfig(fixture);assert.ok(cfg.ok);if(!cfg.ok)throw Error('Invalid fictional configuration');const config=cfg.config;
 const google={provider:'google' as const,subject:'g-runtime-fixture',displayName:'Runtime Fixture Google',email:'runtime-fixture@example.test'};
 const line={provider:'line' as const,subject:'U-runtime-fixture',displayName:'Runtime Fixture LINE',email:null};
 const result=await store.resolveLogin(google);assert.equal(result.status,'ok');if(result.status!=='ok')throw Error('Fixture login rejected');
 const token=accountToken({userId:result.userId,sessionVersion:result.sessionVersion,provider:'google',subject:google.subject,name:google.displayName,email:google.email});
 const jar=new Map<string,string>();jar.set(SESSION_COOKIE_NAME,await encode({token:token as never,secret:fixture.NEXTAUTH_SECRET}));
 const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const logfd=openSync('.qa/account-linking-actual-app-server.log','w');
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:manifest.stage,env:{...process.env,...fixture,NODE_ENV:'production',KUBCODE_ACCOUNTS_ENABLED:'true',DATABASE_URL:url.toString(),KUBCODE_DB_ALLOW_PLAINTEXT_LOOPBACK:'true',NEXT_PUBLIC_MEDIA_MODE:'licensed-only',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore',logfd,logfd]});closeSync(logfd);
 const steps:string[]=[];const report:any={scope:'fictional_real_Next_server_and_Postgres',realProviderConsentVerified:false,status:'running',sourceStage:manifest.stage,steps};
 async function req(path:string,method='GET',body?:Record<string,unknown>,extra:Record<string,string>={}){
  const payload=body===undefined?undefined:JSON.stringify(body);
  return new Promise<{status:number,headers:any,text:string}>( (resolve,reject)=>{
   const headers:Record<string,string>={host:'kubcode.dev','x-forwarded-host':'kubcode.dev','x-forwarded-proto':'https',cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...extra};
   if(payload!==undefined)Object.assign(headers,{'content-type':'application/json','content-length':String(Buffer.byteLength(payload)),origin:'https://kubcode.dev','sec-fetch-site':'same-origin'});
   const q=httpRequest({host:'127.0.0.1',port,path,method,headers},r=>{const chunks:Buffer[]=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{
    for(const c of r.headers['set-cookie']??[]){const pair=c.split(';',1)[0];const idx=pair.indexOf('=');const key=pair.slice(0,idx),v=pair.slice(idx+1);if(v)jar.set(key,v);else jar.delete(key);}
    resolve({status:r.statusCode??0,headers:r.headers,text:Buffer.concat(chunks).toString()});
   });});q.on('error',reject);q.setTimeout(10000,()=>q.destroy(new Error('Fixture request timed out')));q.end(payload);
  });
 }
 async function write(path:string,body:Record<string,unknown>={}){
  const csrf=await req('/api/account/csrf');assert.equal(csrf.status,200);const value=JSON.parse(csrf.text).csrfToken;
  return req(path,'POST',body,{'x-kubcode-csrf':value});
 }
 async function prove(profile:typeof google|typeof line){
  const context={...emptyRequestContext(),linkCookie:hashOpaqueToken(jar.get(LINK_COOKIE)!),session:sessionClaims(token)};
  const options=buildAuthOptions(config,{store,ready:{google:true,line:true},request:context});
  const account={provider:profile.provider,type:'oauth',providerAccountId:profile.subject};
  const external={sub:profile.subject,name:profile.displayName,...(profile.provider==='google'?{email:profile.email,email_verified:true}:{})};
  const redirect=await options.callbacks!.signIn!({account,profile:external,user:{}} as never);assert.equal(typeof redirect,'string');assert.match(String(redirect),/\/account\/settings\?link=(source|target)_verified$/);
 }
 try{
  let ready=false;for(let i=0;i<80;i++){try{const r=await req('/api/auth/providers');if(r.status===200){assert.deepEqual(Object.keys(JSON.parse(r.text)),['google','line']);ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Actual Next server did not start');steps.push('actual Next server starts with central accounts enabled');
  let r=await req('/api/auth/session');assert.equal(JSON.parse(r.text).user.provider,'google');steps.push('encrypted fixture session is DB-validated through actual auth endpoint');
  r=await req('/account/settings');assert.equal(r.status,200);assert.match(r.text,/Runtime Fixture Google/);assert.match(r.text,/เชื่อม LINE/);steps.push('actual settings SSR shows connected Google and connect LINE');
  r=await req('/api/account/link/start','POST',{provider:'line'});assert.equal(r.status,403);steps.push('real route refuses mutation without CSRF');
  r=await write('/api/account/link/start',{provider:'line'});assert.equal(r.status,200);assert.equal(JSON.parse(r.text).phase,'await_source');assert.ok(jar.has(LINK_COOKIE));steps.push('real guarded start route creates bound intent and cookie');
  await prove(google);r=await req('/account/settings');assert.equal(r.status,200);assert.match(r.text,/LINE/);steps.push('fixture source OAuth callback preserves original central session');
  await prove(line);assert.equal(Number((await pool.query('SELECT count(*) AS n FROM kubcode_accounts.users')).rows[0].n),1);assert.equal(Number((await pool.query('SELECT count(*) AS n FROM kubcode_accounts.user_identities')).rows[0].n),1);steps.push('fixture target callback creates no separate user or identity before confirm');
  r=await req('/account/settings');assert.equal(r.status,200);assert.match(r.text,/Runtime Fixture LINE/);steps.push('actual settings SSR displays explicit final confirmation');
  r=await write('/api/account/intent/confirm');assert.equal(r.status,200);assert.equal(JSON.parse(r.text).signedOut,true);assert.ok(!jar.has(SESSION_COOKIE_NAME));steps.push('real confirm route attaches target and revokes/clears session');
  const mapped=await store.resolveLogin(line);assert.equal(mapped.status,'ok');if(mapped.status!=='ok')throw Error('Line mapping failed');assert.equal(mapped.userId,result.userId);assert.equal(await store.checkSession(sessionClaims(token)),false);steps.push('LINE maps to same internal user; prior Google JWT invalidated');
  const linkedToken=accountToken({userId:mapped.userId,sessionVersion:mapped.sessionVersion,provider:'line',subject:line.subject,name:line.displayName,email:null});jar.set(SESSION_COOKIE_NAME,await encode({token:linkedToken as never,secret:fixture.NEXTAUTH_SECRET}));
  r=await req('/account/settings');assert.equal(r.status,200);assert.match(r.text,/Runtime Fixture LINE/);assert.match(r.text,/Runtime Fixture Google/);steps.push('actual settings SSR shows both identities after linked LINE sign-in fixture');
  r=await write('/api/account/unlink/start',{provider:'google'});assert.equal(r.status,200);
  const ctx={...emptyRequestContext(),linkCookie:hashOpaqueToken(jar.get(LINK_COOKIE)!),session:sessionClaims(linkedToken)};
  const opts=buildAuthOptions(config,{store,ready:{google:true,line:true},request:ctx});
  const redirect=await opts.callbacks!.signIn!({account:{provider:'line',type:'oauth',providerAccountId:line.subject},profile:{sub:line.subject,name:line.displayName},user:{}} as never);assert.match(String(redirect),/source_verified/);
  r=await write('/api/account/intent/confirm');assert.equal(r.status,200);assert.ok(!jar.has(SESSION_COOKIE_NAME));assert.equal(await store.checkSession(sessionClaims(linkedToken)),false);steps.push('real unlink route requires source proof and revokes copied old session');
  const remaining=await store.resolveLogin(line);assert.equal(remaining.status,'ok');if(remaining.status!=='ok')throw Error('Remaining method failed');
  const last=accountToken({userId:remaining.userId,sessionVersion:remaining.sessionVersion,provider:'line',subject:line.subject,name:line.displayName,email:null});jar.set(SESSION_COOKIE_NAME,await encode({token:last as never,secret:fixture.NEXTAUTH_SECRET}));
  r=await write('/api/account/unlink/start',{provider:'line'});assert.equal(r.status,409);assert.equal(JSON.parse(r.text).code,'LAST_LOGIN_METHOD');steps.push('actual API prevents removing final usable login');
  jar.set(SESSION_COOKIE_NAME,await encode({token:linkedToken as never,secret:fixture.NEXTAUTH_SECRET}));r=await req('/api/auth/session');assert.deepEqual(JSON.parse(r.text),{});steps.push('actual session endpoint rejects DB-revoked copied JWT');
  report.status='passed';
 }catch(error){report.status='failed';report.error=String(error);throw error;}
 finally{
  server.kill('SIGTERM');await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else{const timer=setTimeout(()=>{server.kill('SIGKILL');resolve();},4000);server.once('exit',()=>{clearTimeout(timer);resolve();});}});
  await pool.end();await admin.query(`DROP DATABASE ${db} WITH (FORCE)`);report.ownedFixtureDatabaseRemoved=!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[db])).rowCount;await admin.end();
  writeFileSync('.qa/account-linking-actual-app-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
main().catch(e=>{console.error('[actual-app-fixture]',String(e));process.exitCode=1;});
