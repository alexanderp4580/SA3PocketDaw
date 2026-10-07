import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
for (const name of ['hall','room','plate']) {
 const path=`public/dragonfly/${name}.wasm`;
 assert.ok(existsSync(path),`${name}: browser DSP missing`);
 const module=await WebAssembly.compile(readFileSync(path));
 const {exports:e}=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:{proc_exit:c=>{throw Error(`exit ${c}`)},fd_write:()=>0,fd_seek:()=>0,fd_close:()=>0},env:{emscripten_notify_memory_growth:()=>{}}});
 e._initialize?.();
 const p=e.dr_create(48000),l=new Float32Array(e.memory.buffer,e.dr_buffer(p,0),128),r=new Float32Array(e.memory.buffer,e.dr_buffer(p,1),128);
 e.dr_param(p,0,0);e.dr_param(p,1,name==='plate'?100:30);if(name!=='plate')e.dr_param(p,name==='hall'?2:3,70);
 let energy=0,stereo=0,tail=0;const result=[];
 for(let block=0;block<750;block++){
  l.fill(0);r.fill(0);if(!block)l[0]=1;
  e.dr_process(p,128);
  const ol=new Float32Array(e.memory.buffer,e.dr_buffer(p,2),128),or=new Float32Array(e.memory.buffer,e.dr_buffer(p,3),128);
  for(let i=0;i<128;i++){assert.ok(Number.isFinite(ol[i])&&Number.isFinite(or[i]));energy+=ol[i]**2+or[i]**2;stereo+=(ol[i]-or[i])**2;if(block>30)tail+=ol[i]**2+or[i]**2;result.push(ol[i],or[i]);}
 }
 assert.ok(energy>1e-5&&tail>1e-5&&stereo>1e-5,`${name} genuine stereo tail`);
 const native=readFileSync(`/tmp/sa3-dragonfly-${name}.f32`);let error=0;
 for(let i=0;i<result.length;i++)error=Math.max(error,Math.abs(native.readFloatLE(i*4)-result[i]));
 assert.ok(error<0.0001,`${name} native/WASM error ${error}`);
 e.dr_mute(p);l.fill(0);r.fill(0);e.dr_process(p,128);assert.ok(new Float32Array(e.memory.buffer,e.dr_buffer(p,2),128).every(x=>Math.abs(x)<1e-10));
 e.dr_destroy(p);console.log(`${name}: stereo impulse/tail/mute pass; native/WASM maximum error ${error}`);
}
