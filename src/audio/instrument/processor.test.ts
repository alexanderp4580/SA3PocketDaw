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

it('queued future notes are not stolen by the voice limit',async()=>{
 vi.resetModules();let C:any;vi.stubGlobal('sampleRate',48000);vi.stubGlobal('currentFrame',0);vi.stubGlobal('AudioWorkletProcessor',class {port={onmessage:null as any};});vi.stubGlobal('registerProcessor',(_n:string,c:any)=>C=c);
 await import('./processor');const p=new C(),send=(m:object)=>p.port.onmessage({data:m}),a=new Float32Array(48000).fill(.2);
 send({type:'profile',profile:{sampleRate:48000,hop:512,dynamics:'sustain',gain:1,partials:[{ratio:1,amplitudes:new Float32Array(100).fill(.2),phase:0,decay:-1}]}});send({type:'assets',midi:57,assets:{attack:a,residual:new Float32Array(48000)}});
 send({type:'note',midi:57,when:.5,duration:1,velocity:1});
 for(let i=0;i<12;i++)send({type:'note',midi:57,when:1+i*.01,duration:1,velocity:1});
 const out=new Float32Array(128);
 for(let frame=24000;frame<24000+.4*48000;frame+=128){vi.stubGlobal('currentFrame',frame);out.fill(0);p.process([],[[out]]);}
 expect(out.some(v=>v!==0)).toBe(true);vi.unstubAllGlobals();
});

it('stops the oldest sounding voice when too many notes play at once',async()=>{
 vi.resetModules();let C:any;vi.stubGlobal('sampleRate',48000);vi.stubGlobal('currentFrame',0);vi.stubGlobal('AudioWorkletProcessor',class {port={onmessage:null as any};});vi.stubGlobal('registerProcessor',(_n:string,c:any)=>C=c);
 await import('./processor');const p=new C(),send=(m:object)=>p.port.onmessage({data:m}),a=new Float32Array(48000).fill(.2);
 send({type:'profile',profile:{sampleRate:48000,hop:512,dynamics:'sustain',gain:1,partials:[{ratio:1,amplitudes:new Float32Array(100).fill(.2),phase:0,decay:-1}]}});send({type:'assets',midi:57,assets:{attack:a,residual:new Float32Array(48000)}});
 for(let i=0;i<20;i++)send({type:'note',midi:57,when:0,duration:5,velocity:1});
 const out=new Float32Array(128);p.process([],[[out]]);
 expect(p.voices.filter((v:any)=>!v.voice.done).length).toBeLessThanOrEqual(8+12);
 const sounding=p.voices.filter((v:any)=>v.start<=0&&!v.voice.releasing);expect(sounding.length).toBeLessThanOrEqual(8);vi.unstubAllGlobals();
});

it('caps sounding plus releasing voices',async()=>{
 vi.resetModules();let C:any;vi.stubGlobal('sampleRate',48000);vi.stubGlobal('currentFrame',0);vi.stubGlobal('AudioWorkletProcessor',class {port={onmessage:null as any};});vi.stubGlobal('registerProcessor',(_n:string,c:any)=>C=c);
 await import('./processor');const p=new C(),send=(m:object)=>p.port.onmessage({data:m}),a=new Float32Array(48000).fill(.2);
 send({type:'profile',profile:{sampleRate:48000,hop:512,dynamics:'sustain',gain:1,partials:[{ratio:1,amplitudes:new Float32Array(100).fill(.2),phase:0,decay:-1}]}});send({type:'controls',controls:{release:2}});send({type:'assets',midi:57,assets:{attack:a,residual:new Float32Array(48000)}});
 const out=new Float32Array(128);let frame=0,peak=0;
 for(let i=0;i<60;i++){vi.stubGlobal('currentFrame',frame);send({type:'note',midi:57,when:frame/48000,duration:.01,velocity:1});out.fill(0);p.process([],[[out]]);frame+=128;
  const rendering=p.voices.filter((v:any)=>v.start<=frame&&!v.voice.done&&!v.voice.fading);peak=Math.max(peak,rendering.length);}
 expect(peak).toBeLessThanOrEqual(16);
 vi.unstubAllGlobals();
});
