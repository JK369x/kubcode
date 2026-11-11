import {readdir,readFile,access,realpath} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {Elysia,t} from 'elysia';
async function inventory(root:string){
 const result=[];
 for(const platform of ['youtube','instagram']){
  const dir=join(root,platform);
  let dirs;try{dirs=await readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
  for(const entry of dirs.filter(e=>e.isDirectory()&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))){
   const profile=join(dir,entry.name);const data=await profileFile(root,platform,entry.name,platform==='youtube'?'channel.json':'account.json');
   let connected=true;try{await access(join(profile,'token.json'));}catch{connected=false;}
   result.push({platform,profile:entry.name,id:platform==='youtube'?data.id:data.user_id,name:platform==='youtube'?data.title:data.username,connected});
  }
 }
 return result;
}
class OperationError extends Error{constructor(public status:number,message:string){super(message);}}
async function profileFile(root:string,platform:string,slug:string,name:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(slug))throw new OperationError(400,'Invalid profile');
 const canonical=await realpath(root);
 const target=await realpath(join(canonical,platform,slug,name));
 if(!target.startsWith(canonical+sep))throw new OperationError(400,'Invalid profile path');
 return JSON.parse(await readFile(target,'utf8'));
}
async function providerJson(url:URL,token:string,transport:typeof fetch){
 let response;try{response=await transport(url,{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new OperationError(502,'Provider request failed');}
 if(!response.ok)throw new OperationError(502,'Provider rejected request (HTTP '+response.status+')');
 try{return await response.json();}catch{throw new OperationError(502,'Provider returned invalid JSON');}
}
export function createApp(config:{stateRoot:string;apiKey:string;transport?:typeof fetch;instagramVersion?:string}) {
 if(config.apiKey.length<24) throw new Error('JK_SOCIAL_API_KEY must contain at least 24 characters');
 const transport=config.transport??fetch;
 const version=config.instagramVersion??'v26.0';if(!/^v[0-9]+\.[0-9]+$/.test(version))throw new Error('Invalid Instagram API version');
 return new Elysia().onError(({error,set,code})=>{if(code==='NOT_FOUND'){set.status=404;return {error:'Not found'};}if(code==='VALIDATION'||code==='PARSE'){set.status=422;return {error:'Invalid request'};}if(error instanceof OperationError){set.status=error.status;return {error:error.message};}set.status=500;return {error:'Operation failed; check local profile setup'};}).get('/health',()=>({ok:true,service:'jk-social-api'}))
 .get('/connections',({headers,status})=>headers.authorization==='Bearer '+config.apiKey?inventory(config.stateRoot):status(401,{error:'Unauthorized'}))
 .post('/youtube/:profile/verify',async({params,body,headers,status})=>{
  if(headers.authorization!=='Bearer '+config.apiKey)return status(401,{error:'Unauthorized'});
  const binding=await profileFile(config.stateRoot,'youtube',params.profile,'channel.json');
  if(binding.id!==body.channelId)throw new OperationError(409,'Selected channel and local binding differ');
  const credential=await profileFile(config.stateRoot,'youtube',params.profile,'token.json');
  const token=credential.token??credential.access_token;if(typeof token!=='string'||!token)throw new OperationError(401,'Connect the selected channel first');
  const url=new URL('https://www.googleapis.com/youtube/v3/channels');url.search=new URLSearchParams({part:'snippet',mine:'true'}).toString();
  const data=await providerJson(url,token,transport);const channel=data.items?.find((x:any)=>x.id===body.channelId);
  if(!channel)throw new OperationError(409,'Live token identity differs from the selected channel');
  return {platform:'youtube',profile:params.profile,id:channel.id,name:channel.snippet?.title,verified:true};
 },{body:t.Object({channelId:t.String({minLength:1})})})
 .post('/instagram/:profile/verify',async({params,body,headers,status})=>{
  if(headers.authorization!=='Bearer '+config.apiKey)return status(401,{error:'Unauthorized'});
  const normalize=(s:string)=>s.replace(/^@/,'').toLowerCase();
  const binding=await profileFile(config.stateRoot,'instagram',params.profile,'account.json');
  if(binding.user_id!==body.userId||normalize(binding.username)!==normalize(body.username))throw new OperationError(409,'Selected account and local binding differ');
  const credential=await profileFile(config.stateRoot,'instagram',params.profile,'token.json');
  if(typeof credential.access_token!=='string'||!credential.access_token)throw new OperationError(401,'Connect the selected account first');
  const url=new URL('https://graph.instagram.com/'+version+'/me');url.search=new URLSearchParams({fields:'user_id,username'}).toString();
  const data=await providerJson(url,credential.access_token,transport);const user=Array.isArray(data.data)&&data.data.length===1?data.data[0]:data;
  if(user.user_id!==body.userId||typeof user.username!=='string'||normalize(user.username)!==normalize(body.username))throw new OperationError(409,'Live token identity differs from the selected account');
  return {platform:'instagram',profile:params.profile,id:user.user_id,name:user.username,verified:true};
 },{body:t.Object({userId:t.String({minLength:1}),username:t.String({minLength:1})})});
}
