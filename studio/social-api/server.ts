import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from './app';
const stateRoot=resolve(Bun.env.JK_SOCIAL_STATE_DIR??fileURLToPath(new URL('../.local/social/',import.meta.url)));
const app=createApp({stateRoot,apiKey:Bun.env.JK_SOCIAL_API_KEY??'',instagramVersion:Bun.env.INSTAGRAM_API_VERSION??'v26.0'}).listen({hostname:'127.0.0.1',port:Number(Bun.env.JK_SOCIAL_PORT??3015)});
console.log('JK Social API: http://127.0.0.1:'+app.server?.port);
