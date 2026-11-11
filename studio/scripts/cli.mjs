import {readFile,writeFile,mkdir,realpath,stat,copyFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadLibrary,addStyle} from './library.mjs';
import {renderGallery,renderCatalog,dingSource,fontFiles} from './gallery.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function gallery(){
 const styles=await loadLibrary(root);
 await mkdir(path.join(root,'gallery'),{recursive:true});
 await writeFile(path.join(root,'gallery/index.html'),renderGallery(styles));
 await writeFile(path.join(root,'gallery/ding.js'),dingSource());
 await mkdir(path.join(root,'gallery/fonts'),{recursive:true});
 for(const f of fontFiles)await copyFile(path.join(root,'node_modules/@fontsource/anuphan/files',f),path.join(root,'gallery/fonts',f));
 await writeFile(path.join(root,'CATALOG.md'),renderCatalog(styles));
 return styles;
}
async function preview(){
 await gallery();
 const mime={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.md':'text/plain; charset=utf-8','.js':'text/javascript','.mp4':'video/mp4','.ttf':'font/ttf','.woff2':'font/woff2'};
 const canonical=await realpath(root);
 const server=createServer(async(req,res)=>{
  try{
   const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   const requested=name==='/'?'/gallery/index.html':name;
   if(!requested.startsWith('/gallery/')&&!requested.startsWith('/styles/'))throw Error('Not public');
   const target=await realpath(path.join(root,requested));
   if(!target.startsWith(canonical+path.sep)||!(await stat(target)).isFile())throw Error('Not a public file');
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(target));
  }catch{res.writeHead(404);res.end('Not found');}
 });
 server.listen(3012,'127.0.0.1',()=>console.log('JK Animation Studio: http://127.0.0.1:3012'));
 server.on('error',e=>{console.error(e.message);process.exitCode=1;});
}
try{
 const command=process.argv[2]??'list';
 if(command==='add'){const dir=await addStyle(root,process.argv[3]??'');await gallery();console.log('Draft created: '+dir);}
 else if(command==='gallery'){await gallery();console.log('Gallery generated: gallery/index.html');}
 else if(command==='preview')await preview();
 else if(command==='list'||command==='check'){const warnings=[];const styles=await loadLibrary(root,{strictMedia:process.argv.includes('--strict-media')||process.env.STUDIO_STRICT_MEDIA==='1',warnings});for(const w of warnings)console.warn('WARN: '+w);for(const s of styles)console.log(s.id+' | '+s.status+' | v'+s.version);if(command==='check')console.log('PASS: '+styles.length+' styles and all referenced assets'+(warnings.length?' ('+warnings.length+' optional media file(s) absent; see docs/media.md)':''));}
 else throw Error('Commands: list, check, add <id>, gallery, preview');
}catch(e){console.error(e.message);process.exitCode=1;}
