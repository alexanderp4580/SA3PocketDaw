// Dev-only live playback probe: plays a synthetic melody in the real app under a CDP CPU throttle, records the
// destination with an AudioWorklet tap and reports late/skipped notes, clicks and gaps.
// Usage: node scripts/perf-probe/live.mjs '{"throttle":4,"tracks":"ins"}'   (URL=http://localhost:5199)
// nIns/nSmp: counts of instrument/sample tracks (overrides tracks). tracks: "ins" (one instrument track), "smp" (one sample track), "both". partials multiplies worklet cost per voice.
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.env.PW_REQUIRE_FROM??'/tmp/e2e/')('playwright-core');
const c={throttle:1,tracks:'ins',seconds:12,partials:8,pitches:8,bars:2,stepsPerNote:1,ctxRate:0,noteLenSteps:1,release:0,reverb:false,eq:false,roll:false,nIns:0,nSmp:0,srcSec:2,pitchStep:2,...JSON.parse(process.argv[2]??'{}')};
const SR=44100,base=process.env.URL??'http://localhost:5199';
function build(){
 const tracks=[],samples={};
 const kinds=c.nIns||c.nSmp?[...Array(c.nIns).fill('ins'),...Array(c.nSmp).fill('smp')]:c.tracks==='both'?['ins','smp']:[c.tracks];
 kinds.forEach((kind,t)=>{
  const inst=kind==='ins',sid=`s${t}`,notes=[],steps=c.bars*16;
  for(let i=0;i*c.stepsPerNote<steps;i++)notes.push({id:`n${t}_${i}`,midi:48+((i*3+t)%c.pitches)*c.pitchStep,start:i*c.stepsPerNote,length:c.noteLenSteps*c.stepsPerNote,velocity:100});
  const plugins=[];if(c.eq)plugins.push({id:`eq${t}`,type:'eq',bypass:false,settings:{}});if(c.reverb)plugins.push({id:`rv${t}`,type:'reverb',bypass:false,settings:{}});
  const track={id:`t${t}`,name:`Track ${t+1}`,muted:false,sampleId:sid,rootMidi:57,notes,soundType:inst?'instrument':'sample',bars:c.bars,mix:{volumeDb:-6,pan:0,plugins}};
  if(c.release&&inst)track.instrumentControls={release:c.release};
  tracks.push(track);
  const n=SR*c.srcSec,pcm=Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*220*i/SR)*Math.exp(-i/(SR*.5)));
  if(inst){const count=Math.ceil(n/512);samples[sid]={pcm,sampleRate:SR,meta:{mode:'instrument'},instrument:{version:1,hz:220,sampleRate:SR,hop:512,pcm,residual:pcm.map(()=>0),harmonicEnergy:1,dynamics:'sustain',gain:1,partials:Array.from({length:c.partials},(_,i)=>({ratio:i+1,phase:0,decay:-1,amplitudes:Array.from({length:count},(_,j)=>.15*Math.exp(-j/120)/(i+1))}))}};}
  else samples[sid]={pcm,sampleRate:SR,meta:{mode:'sample'}};
 });
 return {project:{id:'p1',name:'Perf',bpm:120,key:'C',bars:c.bars,tracks,masterPlugins:[]},samples};
}
const browser=await chromium.launch({executablePath:process.env.CHROME??`${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,headless:true,args:['--headless=new','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:375,height:812}});const errors=[],logs={late:0,lateMax:0,stale:0,staleMax:0,other:{}};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{const t=m.text();if(/late note preparation/.test(t)){logs.late++;const d=/"?delay"?[:=]\s*([0-9.]+)/.exec(t);if(d)logs.lateMax=Math.max(logs.lateMax,+d[1]);}else if(/skipped stale notes/.test(t)){const n=/"?count"?[:=]\s*(\d+)/.exec(t);logs.stale+=n?+n[1]:1;}else if(/warn|error/i.test(m.type())||/audio\.sampler|underrun/.test(t))logs.other[t.slice(0,80)]=(logs.other[t.slice(0,80)]??0)+1;});
await page.addInitScript(rate=>{
 window.__perf={lead:[],chunks:[],on:false,long:[],hb:[]};
 new PerformanceObserver(l=>{for(const e of l.getEntries())window.__perf.long.push(Math.round(e.duration));}).observe({entryTypes:['longtask']});
 {let last=performance.now();setInterval(()=>{const n=performance.now();if(window.__perf.on)window.__perf.hb.push(Math.round(n-last-10));last=n;},10);}
 const code=`class R extends AudioWorkletProcessor{constructor(){super();this.on=false;this.buf=new Float32Array(8192);this.i=0;this.start=0;this.last=0;this.stalls=[];this.port.onmessage=e=>{this.on=e.data;};}
 process(inp){const w=Date.now();if(this.on&&this.last&&w-this.last>=15)this.stalls.push(w-this.last);this.last=w;const x=inp[0]&&inp[0][0];if(this.on&&x){for(let k=0;k<x.length;k++){if(this.i===0)this.start=currentFrame+k;this.buf[this.i++]=x[k];if(this.i===this.buf.length){this.port.postMessage({frame:this.start,data:this.buf.slice(),stalls:this.stalls});this.stalls=[];this.i=0;}}}else if(!this.on&&this.i>0){this.port.postMessage({frame:this.start,data:this.buf.slice(0,this.i),stalls:this.stalls});this.stalls=[];this.i=0;}return true;}}registerProcessor('rec',R);`;
 const Ctx=window.AudioContext;let ctx=null,tap=null;const orig=AudioNode.prototype.connect;
 window.AudioContext=class extends Ctx{constructor(o){super(rate?{...(o??{}),sampleRate:rate}:o);ctx=this;window.__ctx=this;
  this.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'text/javascript'}))).then(()=>{tap=new AudioWorkletNode(this,'rec',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});tap.port.onmessage=e=>window.__perf.chunks.push(e.data);orig.call(tap,this.destination);window.__tap=tap;window.__perf.tapReady=true;});}};
 AudioNode.prototype.connect=function(d,...r){if(tap&&ctx&&d===ctx.destination&&this!==tap)orig.call(this,tap);return orig.call(this,d,...r);};
 const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(w,...r){if(ctx&&w!==undefined&&window.__perf.on)window.__perf.lead.push(+(w-ctx.currentTime).toFixed(3));return start.call(this,w,...r);};
 const post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(m,...r){if(ctx&&m&&m.type==='note'&&window.__perf.on)window.__perf.lead.push(+(m.when-ctx.currentTime).toFixed(3));return post.call(this,m,...r);};
},c.ctxRate);
await page.goto(`${base}/?skipcompat=1`);await page.waitForTimeout(1000);
await page.evaluate(async d=>{
 const db=await new Promise((res,rej)=>{const r=indexedDB.open('sa3daw',1);r.onupgradeneeded=()=>{r.result.createObjectStore('project');r.result.createObjectStore('samples');};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
 const f32=a=>Float32Array.from(a);
 await new Promise((res,rej)=>{const tx=db.transaction(['project','samples'],'readwrite');tx.objectStore('project').put(d.project,'current');for(const [id,s] of Object.entries(d.samples)){const o={...s,pcm:f32(s.pcm)};if(s.instrument){o.instrument={...s.instrument,pcm:f32(s.instrument.pcm),residual:f32(s.instrument.residual),partials:s.instrument.partials.map(p=>({...p,amplitudes:f32(p.amplitudes)}))};}tx.objectStore('samples').put(o,id);}tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
 db.close();
},build());
await page.reload();await page.waitForTimeout(2500);
if(c.roll)await page.getByRole('button',{name:/Open piano roll for/}).first().click();await page.waitForTimeout(500);
const cdp=await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:c.throttle});
const play=page.getByRole('button',{name:'Play',exact:true}).first();
await play.click();await page.waitForTimeout(400); // first Play: unlock + prepare; then restart to measure steady state
const sr=await page.evaluate(()=>window.__ctx?.sampleRate);
await page.getByRole('button',{name:'Pause',exact:true}).first().click().catch(()=>{});
await page.waitForTimeout(300);
await page.evaluate(()=>{window.__perf.lead.length=0;window.__perf.long.length=0;window.__perf.hb.length=0;window.__perf.chunks.length=0;window.__perf.on=true;window.__tap.port.postMessage(true);});
const t0=Date.now();await page.getByRole('button',{name:'Play',exact:true}).first().click();
await page.waitForTimeout(c.seconds*1000);
const r=await page.evaluate(async()=>{window.__tap.port.postMessage(false);await new Promise(r=>setTimeout(r,200));const p=window.__perf;p.on=false;return {long:p.long,hb:p.hb,lead:p.lead,chunks:p.chunks.map(k=>({frame:k.frame,data:Array.from(k.data),stalls:k.stalls}))};});
// assemble captured signal
let frames=r.chunks.sort((a,b)=>a.frame-b.frame),sig=[],missed=0,first=frames[0]?.frame??0;
for(const k of frames){const at=k.frame-first;if(at>sig.length){missed+=at-sig.length;while(sig.length<at)sig.push(0);}for(const v of k.data)sig.push(v);}
const stalls=frames.flatMap(k=>k.stalls??[]);
let peak=0;for(const v of sig)peak=Math.max(peak,Math.abs(v));
let firstSound=sig.findIndex(v=>Math.abs(v)>1e-4);if(firstSound<0)firstSound=sig.length;
const lo=firstSound+Math.round(.3*sr),hi=sig.length-Math.round(.3*sr);
let clicks=0,maxD1=0,gaps=0,run=0;const T=.25*peak;
for(let n=Math.max(1,lo);n<hi;n++){const d=Math.abs(sig[n]-sig[n-1]);maxD1=Math.max(maxD1,d);if(d>T)clicks++;if(Math.abs(sig[n])<1e-5){run++;if(run===Math.round(.003*sr))gaps++;}else run=0;}
const q=(a,f)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*f))]??0;};
console.log(JSON.stringify({case:c,sampleRate:sr,notes:r.lead.length,lateNotes:r.lead.filter(x=>x<0).length,leadMinMs:Math.round(Math.min(...r.lead)*1000),leadP5ms:Math.round(q(r.lead,.05)*1000),logLate:logs.late,logLateMaxS:logs.lateMax,logStale:logs.stale,other:logs.other,longTasks:r.long.length,longMaxMs:Math.max(0,...r.long),hbP99:q(r.hb,.99),hbMax:Math.max(0,...r.hb),audioStalls:stalls.length,audioStallMaxMs:Math.max(0,...stalls),capturedSec:+(sig.length/sr).toFixed(2),peak:+peak.toFixed(3),maxD1OverPeak:+(maxD1/(peak||1)).toFixed(3),clicks,gaps,missedFrames:missed,errors:errors.slice(0,2)}));
await browser.close();
