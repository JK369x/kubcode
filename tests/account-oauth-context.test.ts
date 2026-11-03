import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthOptions} from '../lib/auth';
import type {AuthConfig} from '../lib/auth-policy';
import {emptyRequestContext, type AccountsRuntime} from '../lib/accounts/runtime';
import type {AccountStore} from '../lib/accounts/store';
import {linkCookie,csrfCookie} from '../lib/accounts/http';
const config: AuthConfig={origin:'https://kubcode.dev',secret:'fictional_local_cookie_spec_only_'.repeat(3),google:{clientId:'123456789-fixture.apps.googleusercontent.com',clientSecret:'fictional_google_only'},line:null};
function options(link: boolean){
 const runtime:AccountsRuntime={store:{} as AccountStore,ready:{google:true,line:false},request:{...emptyRequestContext(),linkCookie:link?Buffer.alloc(32,1):'none'}};
 return buildAuthOptions(config,runtime);
}
test('link OAuth check cookies are isolated from ordinary sign-in, so missing intent cannot downgrade callback',()=>{
 const link=options(true),ordinary=options(false);
 for(const [key,defaultName] of [['state','__Secure-next-auth.state'],['nonce','__Secure-next-auth.nonce'],['pkceCodeVerifier','__Secure-next-auth.pkce.code_verifier']] as const){
  const c=link.cookies?.[key];assert.ok(c,'Missing link-only '+key);assert.notEqual(c.name,ordinary.cookies?.[key]?.name??defaultName);
  assert.ok(c.name.startsWith('__Host-'));assert.equal(c.options.secure,true);assert.equal(c.options.httpOnly,true);assert.equal(c.options.sameSite,'lax');assert.equal(c.options.path,'/');assert.equal(c.options.domain,undefined);
 }
 assert.equal(link.cookies?.sessionToken?.name,ordinary.cookies?.sessionToken?.name);
});
test('link intent survives cross-site top-level OAuth return, while mutation CSRF cookie remains Strict',()=>{
 assert.match(linkCookie('F'.repeat(43)),/SameSite=Lax/);
 assert.match(csrfCookie('F'.repeat(43)),/SameSite=Strict/);
});

test('revoked central session is empty for the SDK client, not an expires-only authenticated-looking session',async()=>{
 const session=await options(false).callbacks!.session!({session:{expires:'FIXTURE'},token:{}} as never);
 assert.deepEqual(session,{});
});

test('real NextAuth SDK cryptographically separates link checks from normal sign-in and other providers',async()=>{
 const checks=require('../node_modules/next-auth/core/lib/oauth/checks.js');
 const {defaultCookies}=require('../node_modules/next-auth/core/lib/cookie.js');
 const {encode,decode}=require('next-auth/jwt');
 const runtimeOptions=(inLink:boolean,provider='google')=>{
  const opts=options(inLink);
  return {...opts,provider:{id:provider,checks:['pkce','state','nonce']},cookies:{...defaultCookies(true),...opts.cookies},jwt:{...opts.jwt,secret:config.secret,encode,decode},logger:{debug(){}}};
 };
 const linked=runtimeOptions(true);const generated:any[]=[];const params:Record<string,string>={};
 for(const key of ['pkce','state','nonce'])await checks[key].create(linked,generated,params);
 const cookies=Object.fromEntries(generated.map(c=>[c.name,c.value]));
 const accepted:Record<string,string>={};const cleared:any[]=[];
 for(const key of ['pkce','state','nonce'])await checks[key].use(cookies,cleared,linked,accepted);
 assert.equal(accepted.state,params.state);assert.equal(accepted.nonce,params.nonce);assert.ok(accepted.code_verifier);assert.equal(cleared.length,3);assert.equal(params.code_challenge_method,'S256');
 await assert.rejects(checks.state.use(cookies,[],runtimeOptions(false),{}),/State cookie was missing/);
 await assert.rejects(checks.state.use(cookies,[],runtimeOptions(true,'line'),{}),/different provider/);
 const normal=runtimeOptions(false);const moved={[normal.cookies.state.name]:cookies[linked.cookies.state.name]};
 await assert.rejects(checks.state.use(moved,[],normal,{}));
});
