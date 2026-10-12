// Dev-only: worklet cost of InstrumentVoice in isolation. Usage: node scripts/perf-probe/voiceCost.mjs [treeRoot] [partials] [sampleRate]
// Reports microseconds per 128-frame quantum for one sounding voice and for a legato monophonic melody (16ths at 120 bpm).
import {build} from 'rolldown';
import {pathToFileURL} from 'node:url';import {writeFileSync} from 'node:fs';
const root=process.argv[2]??process.cwd(),partials=+(process.argv[3]??64),rate=+(process.argv[4]??48000),SR=44100;
const out=`/tmp/voice-${Math.random().toString(36).slice(2)}.mjs`;
await build({input:`${root}/src/audio/instrument/voice.ts`,output:{file:out,format:'esm'},logLevel:'silent'});
const {InstrumentVoice}=await import(pathToFileURL(out));
const count=Math.ceil(5*SR/512);
const profile={version:1,hz:110,sampleRate:SR,hop:512,pcm:new Float32Array(5*SR),residual:new Float32Array(5*SR).map(()=>Math.random()*.01),partials:Array.from({length:partials},(_,i)=>({ratio:i+1,amplitudes:Float32Array.from({length:count},(_,j)=>.1*Math.exp(-j/200)/(i+1)),phase:0,decay:-.5})),harmonicEnergy:1,dynamics:'sustain',gain:1};
const assets={attack:new Float32Array(Math.round(.09*SR)).map(()=>Math.random()*.1),residual:profile.residual};
const outBuf=new Float32Array(128);
function run(voices,quanta){const t0=process.hrtime.bigint();for(let q=0;q<quanta;q++){outBuf.fill(0);for(const v of voices)v.render(outBuf,0,128);}return Number(process.hrtime.bigint()-t0)/1000/quanta;}
for(let w=0;w<3;w++)run([new InstrumentVoice(profile,assets,48,rate,5,1,{})],400);
const single=run([new InstrumentVoice(profile,assets,48,rate,5,1,{})],2000);
// melody: a voice starts every 125 ms (note 125 ms + release .15 s) -> about 2.2 voices overlap
const quantaPerNote=Math.round(.125*rate/128);let live=[],total=0,quanta=0;const t0=process.hrtime.bigint();
for(let n=0;n<40;n++){live.push(new InstrumentVoice(profile,assets,48+(n*2)%16,rate,.125,1,{}));for(let q=0;q<quantaPerNote;q++){outBuf.fill(0);for(const v of live)v.render(outBuf,0,128);quanta++;live=live.filter(v=>!v.done);}}
const melody=Number(process.hrtime.bigint()-t0)/1000/quanta;
console.log(JSON.stringify({root,partials,rate,budgetUs:+(128/rate*1e6).toFixed(0),singleVoiceUs:+single.toFixed(1),melodyUsPerQuantum:+melody.toFixed(1)}));
