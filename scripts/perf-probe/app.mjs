// Dev-only main-thread probe: injects a synthetic project into IndexedDB, plays it in the real app and reports
// long tasks, main-thread busy time, heartbeat drift and note lead times. Needs `npx vite --port 5199`.
// Usage: node scripts/perf-probe/app.mjs '{"tracks":8,"instrumentTracks":8,"screen":"mix","seconds":10}'
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.env.PW_REQUIRE_FROM??'/tmp/e2e/')('playwright-core');
const c={pitches:12,tracks:8,instrumentTracks:8,screen:'tracks',seconds:10,partials:40,notesPerBar:16,reverb:true,trackFx:[],masterFx:[],...JSON.parse(process.argv[2]??'{}')};
const SR=44100,base=process.env.URL??'http://localhost:5199';
function build(){
 const tracks=[],samples={};
 for(let t=0;t<c.tracks;t++){
  const inst=t<c.instrumentTracks,sid=`s${t}`,notes=[];
  for(let i=0;i<c.notesPerBar*2;i++)notes.push({id:`n${t}_${i}`,midi:45+(i*5+t*3)%c.pitches,start:i*(32/(c.notesPerBar*2)),length:Math.max(1,Math.round(64/(c.notesPerBar*2))),velocity:100});
  const plugins=[{id:`eq${t}`,type:'eq',bypass:false,settings:{}}];if(c.reverb)plugins.push({id:`rv${t}`,type:'reverb',bypass:false,settings:{}});for(const k of c.trackFx)plugins.push({id:`${k}${t}`,type:k,bypass:false,settings:{}});
  tracks.push({id:`t${t}`,name:`Track ${t+1}`,muted:false,sampleId:sid,rootMidi:57,notes,soundType:inst?'instrument':'sample',bars:2,mix:{volumeDb:-6,pan:0,plugins}});
  const n=SR*2,pcm=Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*220*i/SR)*Math.exp(-i/(SR*.5)));
  if(inst){const count=Math.ceil(n/512);samples[sid]={pcm,sampleRate:SR,meta:{mode:'instrument'},instrument:{version:1,hz:220,sampleRate:SR,hop:512,pcm,residual:pcm.map(()=>0),harmonicEnergy:1,dynamics:'sustain',gain:1,partials:Array.from({length:c.partials},(_,i)=>({ratio:i+1,phase:0,decay:-1,amplitudes:Array.from({length:count},(_,j)=>.15*Math.exp(-j/120)/(i+1))}))}};}
  else samples[sid]={pcm,sampleRate:SR,meta:{mode:'sample'}};
 }
 return {project:{id:'p1',name:'Perf',bpm:120,key:'C',bars:2,tracks,masterPlugins:c.masterFx.map((k,i)=>({id:`m${i}`,type:k,bypass:false,settings:{}}))},samples};
}
const browser=await chromium.launch({executablePath:process.env.CHROME??`${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,headless:true,args:['--headless=new','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:375,height:812}});const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{
 window.__perf={long:[],lead:[],hb:[],raf:[]};
 new PerformanceObserver(l=>{for(const e of l.getEntries())window.__perf.long.push(Math.round(e.duration));(window.__perf.longAt??=[]).push(Math.round(e.startTime));}).observe({entryTypes:['longtask']});
 const Ctx=window.AudioContext;let ctx=null;
 window.AudioContext=class extends Ctx{constructor(...a){super(...a);ctx=this;}};
 const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(w,...r){if(ctx&&w!==undefined&&window.__perf.on){window.__perf.lead.push(+(w-ctx.currentTime).toFixed(3));window.__perf.first??=performance.now();}return start.call(this,w,...r);};
 const post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(m,...r){if(ctx&&m&&m.type==='note'&&window.__perf.on){window.__perf.lead.push(+(m.when-ctx.currentTime).toFixed(3));window.__perf.first??=performance.now();}return post.call(this,m,...r);};
});
await page.goto(`${base}/?skipcompat=1`);await page.waitForTimeout(1000);
const data=build();
await page.evaluate(async d=>{
 const db=await new Promise((res,rej)=>{const r=indexedDB.open('sa3daw',1);r.onupgradeneeded=()=>{r.result.createObjectStore('project');r.result.createObjectStore('samples');};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
 const f32=a=>Float32Array.from(a);
 await new Promise((res,rej)=>{const tx=db.transaction(['project','samples'],'readwrite');tx.objectStore('project').put(d.project,'current');for(const [id,s] of Object.entries(d.samples)){const o={...s,pcm:f32(s.pcm)};if(s.instrument){o.instrument={...s.instrument,pcm:f32(s.instrument.pcm),residual:f32(s.instrument.residual),partials:s.instrument.partials.map(p=>({...p,amplitudes:f32(p.amplitudes)}))};}tx.objectStore('samples').put(o,id);}tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
 db.close();
},data);
await page.reload();await page.waitForTimeout(2500);
if(c.screen==='mix')await page.getByRole('button',{name:'Mix',exact:true}).click();
if(c.screen==='layout')await page.getByRole('button',{name:'Layout',exact:true}).click();
await page.waitForTimeout(500);
const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
await page.evaluate(()=>{window.__perf.on=true;const p=window.__perf;let last=performance.now();p.hbTimer=setInterval(()=>{const n=performance.now();p.hb.push(Math.round(n-last-10));last=n;},10);let l=performance.now();const f=()=>{const n=performance.now();p.raf.push(Math.round(n-l));l=n;p.rafId=requestAnimationFrame(f);};p.rafId=requestAnimationFrame(f);});
const m0=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
await page.evaluate(()=>{window.__perf.clickAt=Math.round(performance.now());});await page.getByRole('button',{name:'Play',exact:true}).first().click();
await page.waitForTimeout(c.seconds*1000);
const m1=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const r=await page.evaluate(()=>{const p=window.__perf;clearInterval(p.hbTimer);cancelAnimationFrame(p.rafId);p.on=false;return p;});
const q=(a,f)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*f))]??0;};
const wall=c.seconds;
console.log(JSON.stringify({...c,mainBusyPct:+(((m1.TaskDuration-m0.TaskDuration)/wall)*100).toFixed(1),scriptPct:+(((m1.ScriptDuration-m0.ScriptDuration)/wall)*100).toFixed(1),layoutPct:+(((m1.LayoutDuration-m0.LayoutDuration)/wall)*100).toFixed(1),longTasks:r.long.length,longTaskMaxMs:Math.max(0,...r.long),longAt:r.longAt,clickAt:r.clickAt,heartbeatP99ms:q(r.hb,.99),heartbeatMaxMs:Math.max(0,...r.hb),rafP95ms:q(r.raf,.95),rafMaxMs:Math.max(0,...r.raf),firstNoteAfterClickMs:Math.round(r.first-r.clickAt),notes:r.lead.length,leadMinMs:Math.round(Math.min(...r.lead)*1000),leadP5ms:Math.round(q(r.lead,.05)*1000),lateNotes:r.lead.filter(x=>x<0).length,errors:errors.slice(0,2)}));
await browser.close();
