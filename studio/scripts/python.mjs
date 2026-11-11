import {spawnSync} from 'node:child_process';
export function findPython(){
 for(const command of ['python3.12','python3.11','python3.13','python3']){
  const r=spawnSync(command,['-c','import sys,json; print(json.dumps(list(sys.version_info[:3])))'],{encoding:'utf8'});
  if(r.status!==0)continue;
  const v=JSON.parse(r.stdout);if(v[0]===3&&v[1]>=11)return {command,version:v.join('.')};
 }
 return null;
}
