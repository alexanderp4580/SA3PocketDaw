// Adapted from the PoC browser-smoke.mjs: runs the SFX pack (browser/public/models -> models/small-sfx)
// through the unchanged PoC worker in Chrome/WebGPU. Usage: node browser-smoke-sfx.mjs [seconds] [prompt]
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('/home/deck/Documents/Codex/sa3-browser-poc/package.json');
const puppeteer=require('puppeteer-core');
const seconds=Number(process.argv[2]||2);
const prompt=process.argv[3]||'a short laser zap';
const out=new URL('../evidence/',import.meta.url).pathname;
const server=spawn('python3',['serve.py'],{cwd:import.meta.dirname});
let browser;const evidence={model:'small-sfx',backend:'webgpu',seconds,steps:8,seed:42,prompt,requests:[],console:[],started:new Date().toISOString()};
await mkdir(out,{recursive:true});
try {
 await new Promise(r=>setTimeout(r,1000));
 browser=await puppeteer.launch({executablePath:'/home/deck/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,protocolTimeout:900000,args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface']});
 const page=await browser.newPage();
 await page.setViewport({width:1100,height:850});
 page.on('request',req=>evidence.requests.push({url:req.url(),method:req.method()}));
 page.on('console',msg=>{evidence.console.push(msg.text());console.log('browser:',msg.text());});
 page.on('pageerror',error=>console.log('page error:',error.message));
 page.on('workercreated',async worker=>{const s=await worker.client;try{await s.send('Network.enable');s.on('Network.requestWillBeSent',e=>evidence.requests.push({url:e.request.url,method:e.request.method,worker:true}));}catch{}});
 await page.goto('http://127.0.0.1:8791',{waitUntil:'networkidle0'});
 evidence.browserVersion=await browser.version();
 evidence.capabilities=await page.evaluate(async()=>({crossOriginIsolated,webgpu:!!navigator.gpu,adapter:navigator.gpu?await navigator.gpu.requestAdapter().then(a=>a?{vendor:a.info.vendor,architecture:a.info.architecture,isFallbackAdapter:a.info.isFallbackAdapter}:null):null}));
 await page.select('#backend','webgpu');
 await page.$eval('#prompt',(e,v)=>e.value=v,prompt);
 await page.$eval('#seconds',(e,v)=>e.value=String(v),seconds);
 await page.click('#generate');
 const prog=setInterval(async()=>{try{console.log(await page.$eval('#log',e=>e.textContent.split('\n').slice(-2).join(' | ')));}catch{}},15000);
 try{await page.waitForFunction(()=>['complete','error'].includes(window.poc.state),{timeout:900000});}finally{clearInterval(prog);}
 const result=await page.evaluate(()=>window.poc);
 const wav=result.wav;delete result.wav;evidence.result=result;
 evidence.nonLocalRequests=evidence.requests.filter(x=>!x.url.startsWith('http://127.0.0.1:8791/')&&!x.url.startsWith('blob:')&&!x.url.startsWith('data:'));
 if(wav)await writeFile(`${out}browser-webgpu-small-sfx-${seconds}s.wav`,Buffer.from(wav));
 await page.screenshot({fullPage:true,path:`${out}browser-webgpu-small-sfx-${seconds}s.png`});
 console.log(JSON.stringify({capabilities:evidence.capabilities,result,nonLocalRequests:evidence.nonLocalRequests},null,2));
 if(result.state!=='complete'||evidence.nonLocalRequests.length)process.exitCode=1;
}catch(error){evidence.error=String(error);console.error(error);process.exitCode=1;}
finally{evidence.finished=new Date().toISOString();await writeFile(`${out}browser-webgpu-small-sfx-${seconds}s-run.json`,JSON.stringify(evidence,null,2));await browser?.close();server.kill();}
