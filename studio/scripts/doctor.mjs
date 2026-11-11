import {spawnSync} from 'node:child_process';
import {findPython} from './python.mjs';
const probe=(name,args)=>{const r=spawnSync(name,args,{encoding:'utf8'});return {available:r.status===0,version:(r.stdout??'').split('\n')[0]};};
const report={node:process.version,platform:process.platform,arch:process.arch,ffmpeg:probe('ffmpeg',['-version']),ffprobe:probe('ffprobe',['-version']),python:findPython(),voicePlatformSupported:process.platform==='darwin'&&process.arch==='arm64'};
console.log(JSON.stringify(report,null,2));
if(Number(process.versions.node.split('.')[0])<22)process.exitCode=1;
