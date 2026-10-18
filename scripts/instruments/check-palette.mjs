#!/usr/bin/env node
/** Real Chromium decode and sampler-render checks. Start Vite first.
 * PUPPETEER_CORE=/path/to/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js CHROMIUM=/path/to/chrome node scripts/instruments/check-palette.mjs
 * PALETTE_URL defaults to http://127.0.0.1:5199/; PALETTE_REPORT defaults to /tmp/sa3-palette-audio.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PACKS } from './packs.mjs';
import { regionsToPlay } from '../../src/audio/sfz/select.ts';
import { normalizePreset, presetDecodedBytes } from '../../src/audio/sfz/format.ts';
const { default: puppeteer } = await import(process.env.PUPPETEER_CORE ? pathToFileURL(process.env.PUPPETEER_CORE).href : 'puppeteer-core');
const specs = JSON.parse(readFileSync(new URL('./palette.json', import.meta.url)));
const counts = {};
for (const cfg of Object.values(PACKS)) counts[cfg.category] = (counts[cfg.category] ?? 0) + 1;
if (Object.keys(counts).length !== 10 || Object.values(counts).some(n => n < 4)) throw Error('At least four instruments required in all ten categories');
for (const cfg of specs) {
 const p = normalizePreset(JSON.parse(readFileSync(new URL(`../../models/inst-${cfg.id}/preset.json`, import.meta.url))));
 for(let midi=0;midi<128;midi++){if(!p.regions.some(r=>r.trigger!=='release'&&midi>=r.lokey&&midi<=r.hikey))continue;for(let velocity=1;velocity<=127;velocity++)if(!regionsToPlay(p,midi,velocity).length)throw Error(`Velocity gap: ${cfg.id}/${midi}/${velocity}`);}
 if (p.id !== cfg.id || p.category !== cfg.category) throw Error('Incorrect pack identity: ' + cfg.id);
 if (presetDecodedBytes(p) > cfg.maxDecodedMB * 1e6) throw Error('Decoded budget exceeded: ' + cfg.id);
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
try {
 const page = await browser.newPage();
 await page.goto(process.env.PALETTE_URL ?? 'http://127.0.0.1:5199/?skipcompat=1');
 for (const cfg of specs) {
  const row = await page.evaluate(async (cfg) => {
   const { startRegionVoice } = await import('/src/audio/preset/voice.ts');
   const { regionsToPlay } = await import('/src/audio/sfz/select.ts');
   const { presetPreview } = await import('/src/audio/preset/categories.ts');
   const p = await (await fetch(`/models/inst-${cfg.id}/preset.json`)).json();
   const rate = 44100, ctx = new OfflineAudioContext(2, rate * 12, rate), buffers = [];
   let samplePeak = 0, maxSeam = 0, loopFiles = 0;
   for (let i=0; i<p.files.length; i++) {
    const f=p.files[i], response=await fetch(`/models/inst-${cfg.id}/${f.path}`);
    if (!response.ok) throw Error('Missing file ' + cfg.id + '/' + f.path);
    const b=await ctx.decodeAudioData(await response.arrayBuffer());buffers.push(b);
    let peak=0;
    for(let c=0;c<b.numberOfChannels;c++) for(const v of b.getChannelData(c)){if(!Number.isFinite(v))throw Error('Nonfinite sample');peak=Math.max(peak,Math.abs(v));}
    if(peak<1e-6)throw Error('Silent sample '+cfg.id+'/'+f.path);
    samplePeak=Math.max(samplePeak,peak);
    for(const r of p.regions.filter(r=>r.file===i&&r.loopEnd!==undefined)){
     if(r.loopEnd>b.duration||r.loopStart<0||r.loopEnd<=r.loopStart)throw Error('Invalid decoded loop '+cfg.id);
     const a=Math.round(r.loopStart*rate),z=Math.round(r.loopEnd*rate);loopFiles++;
     for(let c=0;c<b.numberOfChannels;c++){const y=b.getChannelData(c);maxSeam=Math.max(maxSeam,Math.abs(y[a]-y[z-1])/peak);}
    }
   }
   const notes=presetPreview(p);
   for(const n of notes){const plays=regionsToPlay(p,n.midi,100);if(!plays.length)throw Error('Silent preview note '+cfg.id+'/'+n.midi);for(const play of plays)startRegionVoice(ctx,{play,buffer:buffers[play.region.file],when:.02+n.offset,duration:n.duration,output:ctx.destination});}
   const rendered=await ctx.startRendering();let renderPeak=0,rms=0;
   for(let c=0;c<2;c++)for(const v of rendered.getChannelData(c)){if(!Number.isFinite(v))throw Error('Nonfinite rendered sample');renderPeak=Math.max(renderPeak,Math.abs(v));rms+=v*v;}
   if(renderPeak<1e-5)throw Error('Silent instrument '+cfg.id);
   let heldRms=null;
   if(p.category==='pads'||p.category==='textures'){
    const hold=new OfflineAudioContext(2,rate*10,rate);
    for(const play of regionsToPlay(p,60,100))startRegionVoice(hold,{play,buffer:buffers[play.region.file],when:0,duration:9,output:hold.destination});
    const held=await hold.startRendering();let sum=0;for(let c=0;c<2;c++){const y=held.getChannelData(c);for(let i=rate*7;i<rate*8;i++)sum+=y[i]*y[i];}heldRms=Math.sqrt(sum/(2*rate));if(heldRms<1e-5)throw Error('Pad failed to sustain '+cfg.id);
   }
   return {id:cfg.id,category:p.category,files:buffers.length,samplePeak,renderPeak,rms:Math.sqrt(rms/(rendered.length*2)),maxSeam,loopFiles,heldRms};
  }, cfg);
  rows.push(row);console.log(row.id, row.files, 'files', 'peak', row.renderPeak.toFixed(3), 'seam', row.maxSeam.toFixed(3));
 }
} finally { await browser.close(); }
writeFileSync(process.env.PALETTE_REPORT ?? '/tmp/sa3-palette-audio.json', JSON.stringify({ counts, rows }, null, 2)+'\n');
console.log('Verified', rows.length, 'new instruments;', rows.reduce((s,r)=>s+r.files,0), 'decoded files');
