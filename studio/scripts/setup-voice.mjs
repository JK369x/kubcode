import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {findPython} from './python.mjs';
const python=findPython();
if(!python){console.error('Python 3.11+ is required. On macOS: brew install python@3.12');process.exitCode=1;}
else{const r=spawnSync(python.command,[fileURLToPath(new URL('./setup-voice.py',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit'});process.exitCode=r.status??1;}
