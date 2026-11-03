// Fictional browser protocol fixture over REAL loopback HTTPS, not OAuth consent.
// No route interception: server observes the browser's actual Fetch Metadata/cookies.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:https';
import {linkCookie,csrfCookie,LINK_COOKIE,CSRF_COOKIE} from '../lib/accounts/http';
async function main(){
 assert.ok(process.env.TMPDIR,'Hermes scratch TMPDIR required');
 const dir=mkdtempSync(join(process.env.TMPDIR,'kubcode-oauth-cookie-'));
 const key=join(dir,'fixture.key'),cert=join(dir,'fixture.crt');
 const generated=spawnSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=kubcode.dev','-addext','subjectAltName=DNS:kubcode.dev,DNS:identity.fixture.invalid','-days','1'],{stdio:'ignore'});
 assert.equal(generated.status,0,'Fixture TLS generation failed');
 let seen:unknown;let port=0;
 const server=createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
  res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');
  if(req.headers.host?.startsWith('identity.fixture.invalid:'))res.end(`<!doctype html><title>Fictional provider</title><a href="https://kubcode.dev:${port}/api/auth/callback/google?code=FICTIONAL&amp;state=FICTIONAL">Return to app</a>`);
  else if(req.url?.startsWith('/api/auth/callback/')){
   const names=(req.headers.cookie??'').split(';').map(s=>s.trim().split('=')[0]);
   seen={site:req.headers['sec-fetch-site'],intentIncluded:names.includes(LINK_COOKIE),csrfIncluded:names.includes(CSRF_COOKIE)};
   res.end('<!doctype html><title>Fixture return</title><p>Callback received</p>');
  }else{
   res.setHeader('set-cookie',[linkCookie('B'.repeat(43)),csrfCookie('C'.repeat(43))]);
   res.end(`<!doctype html><a href="https://identity.fixture.invalid:${port}/login">Fixture provider</a>`);
  }
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 port=(server.address() as {port:number}).port;
 const report:any={scope:'fictional_real_https_cross_site_cookie_protocol',realOAuthLogin:false,status:'running'};
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-proxy-server','--host-resolver-rules=MAP kubcode.dev 127.0.0.1, MAP identity.fixture.invalid 127.0.0.1']});
 try{
  // Accept self-signed TLS ONLY for this isolated fictional browser context.
  const ctx=await browser.newContext({ignoreHTTPSErrors:true});const page=await ctx.newPage();
  await page.goto(`https://kubcode.dev:${port}/account/settings`);await page.getByRole('link',{name:'Fixture provider',exact:true}).click();
  await page.getByRole('link',{name:'Return to app',exact:true}).click();await page.getByText('Callback received').waitFor();
  assert.deepEqual(seen,{site:'cross-site',intentIncluded:true,csrfIncluded:false});
  report.browser=await browser.version();report.callbackCookieMetadata=seen;report.status='passed';await ctx.close();
 }catch(e){report.status='failed';report.error=String(e);throw e;}
 finally{
  writeFileSync('.qa/account-linking-cross-site-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error('[fixture-browser]',String(e));process.exitCode=1;});
