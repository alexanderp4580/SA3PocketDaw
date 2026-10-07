import { expect,it,vi } from 'vitest';
it('stop cancels future notes while releasing active voices',async()=>{
 let Constructor:any;
 vi.stubGlobal('sampleRate',44100);vi.stubGlobal('currentFrame',0);
 vi.stubGlobal('AudioWorkletProcessor',class {port={onmessage:null as any};});
 vi.stubGlobal('registerProcessor',(_name:string,c:any)=>Constructor=c);
 await import('./processor');const p=new Constructor(),send=(m:object)=>p.port.onmessage({data:m});
 const a=new Float32Array(44100).fill(.2);send({type:'profile',profile:{sampleRate:44100,hop:512,dynamics:'sustain',gain:1,partials:[{ratio:1,amplitudes:new Float32Array(90).fill(.2),phase:0,decay:-1}]}});
 send({type:'assets',midi:57,assets:{attack:a,residual:new Float32Array(44100)}});
 send({type:'note',midi:57,when:.1,duration:1,velocity:1});send({type:'stop'});vi.stubGlobal('currentFrame',4410);
 const out=new Float32Array(128);p.process([],[[out]]);expect(out.every(v=>v===0)).toBe(true);vi.unstubAllGlobals();
});

it('transport stop silences active voices despite a long instrument release',async()=>{
 vi.resetModules();let C:any;vi.stubGlobal('sampleRate',48000);vi.stubGlobal('currentFrame',0);vi.stubGlobal('AudioWorkletProcessor',class {port={onmessage:null as any};});vi.stubGlobal('registerProcessor',(_n:string,c:any)=>C=c);
 await import('./processor');const p=new C(),send=(m:object)=>p.port.onmessage({data:m}),a=new Float32Array(48000).fill(.2);
 send({type:'profile',profile:{sampleRate:48000,hop:512,dynamics:'sustain',gain:1,partials:[{ratio:1,amplitudes:new Float32Array(100).fill(.2),phase:0,decay:-1}]}});send({type:'controls',controls:{release:2}});send({type:'assets',midi:57,assets:{attack:a,residual:new Float32Array(48000)}});send({type:'note',midi:57,when:0,duration:5,velocity:1});p.process([],[[new Float32Array(128)]]);send({type:'stop',hard:true});let last=new Float32Array(128);for(let i=0;i<30;i++){last=new Float32Array(128);p.process([],[[last]]);}expect(last.every(x=>x===0)).toBe(true);vi.unstubAllGlobals();
});
