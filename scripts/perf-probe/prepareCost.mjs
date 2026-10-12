// Dev-only: cost of preparing one pitch (milliseconds). Usage: node scripts/perf-probe/prepareCost.mjs [treeRoot] [sourceSeconds] [partials]
import {build} from 'rolldown';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]??process.cwd(),sec=+(process.argv[3]??8),partials=+(process.argv[4]??64),SR=44100;
const out=`/tmp/prep-${Math.random().toString(36).slice(2)}.mjs`;
await build({input:`${root}/src/audio/instrument/prepare.ts`,output:{file:out,format:'esm'},logLevel:'silent'});
const {prepareNote}=await import(pathToFileURL(out));
const n=Math.round(sec*SR),count=Math.ceil(n/512);
const profile={version:1,hz:110,sampleRate:SR,hop:512,pcm:Float32Array.from({length:n},(_,i)=>Math.sin(i*.01)*.5),residual:Float32Array.from({length:n},()=>Math.random()*.01),partials:Array.from({length:partials},(_,i)=>({ratio:i+1,amplitudes:new Float32Array(count),phase:0,decay:-.5})),harmonicEnergy:1,dynamics:'sustain',gain:1};
prepareNote(profile,48);
const t0=performance.now();const reps=6;for(let i=0;i<reps;i++)prepareNote(profile,50+i);
console.log(JSON.stringify({root,sourceSeconds:sec,partials,msPerPitch:+((performance.now()-t0)/reps).toFixed(1)}));
