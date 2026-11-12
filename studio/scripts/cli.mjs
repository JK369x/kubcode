import {fileURLToPath} from 'node:url';
import {loadLibrary,addStyle} from './library.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 const command=process.argv[2]??'list';
 if(command==='add'){const dir=await addStyle(root,process.argv[3]??'');console.log('Draft created: '+dir);}
 else if(command==='list'||command==='check'){const warnings=[];const styles=await loadLibrary(root,{strictMedia:process.argv.includes('--strict-media')||process.env.STUDIO_STRICT_MEDIA==='1',warnings});for(const w of warnings)console.warn('WARN: '+w);for(const s of styles)console.log(s.id+' | '+s.status+' | v'+s.version);if(command==='check')console.log('PASS: '+styles.length+' styles and all referenced assets'+(warnings.length?' ('+warnings.length+' optional media file(s) absent; see docs/media.md)':''));}
 else throw Error('Commands: list, check, add <id>');
}catch(e){console.error(e.message);process.exitCode=1;}
