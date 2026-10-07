import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync('tar',['-czf','public/dragonfly/source.tar.gz','src','vendor/dragonfly','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','svelte.config.js','index.html','public/icons','public/manifest.webmanifest','public/gpu-probe.onnx'],{cwd:root,stdio:'inherit'});
if(result.status!==0)throw Error('Corresponding source archive failed');
