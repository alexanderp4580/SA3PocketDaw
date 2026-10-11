import {expect,it,vi} from 'vitest';
import {createMixer} from './controller';
import {createProject,addTrack,addPlugin,updatePluginSettings,setBpm} from '../../store/projectModel';
import {MASTER_ID} from './plugins';
function harness(addModule:()=>Promise<void>=async()=>{}){
 const worklets:any[]=[];
 class Node {connections:any[]=[];gain={value:1,setTargetAtTime(){},cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}};pan={setTargetAtTime(){}};
  connect(n:any){this.connections.push(n);return n;}disconnect(t?:any){this.connections=t?this.connections.filter(n=>n!==t):[];}addEventListener(){}getFloatFrequencyData(a:Float32Array){a.fill(-100);}}
 class Worklet extends Node {name:string;options:any;messages:any[]=[];port={onmessage:null as any,postMessage:(m:any)=>this.messages.push(m),close(){}};constructor(_c:any,name:string,options:any){super();this.name=name;this.options=options;worklets.push(this);}}
 vi.stubGlobal('AudioWorkletNode',Worklet);
 const gains:any[]=[];
 const ctx:any={currentTime:0,state:'running',sampleRate:48000,destination:new Node(),audioWorklet:{addModule},createGain:()=>{const n=new Node();gains.push(n);return n;},createStereoPanner:()=>new Node(),createAnalyser:()=>new Node()};
 const master=new Node();return {worklets,gains,ctx,master,mixer:createMixer(ctx,master as any)};
}
const wait=(ms=60)=>new Promise(r=>setTimeout(r,ms));
const reaches=(from:any,to:any,seen=new Set<any>()):boolean=>from===to||(!seen.has(from)&&(seen.add(from),from.connections.some((n:any)=>reaches(n,to,seen))));
it('builds the master chain between the track sum and the master gain and reports reduction',async()=>{
 const h=harness();let p=addTrack(createProject({bpm:100}),'A','a');p=addPlugin(p,MASTER_ID,'limiter',()=>'lim');p=updatePluginSettings(p,MASTER_ID,'lim',{ceiling:-3});
 h.mixer.sync(p);await wait();
 const lim=h.worklets.find(w=>w.name==='sa3-fx-limiter');expect(lim).toBeTruthy();
 expect(lim.options.processorOptions).toMatchObject({settings:{ceiling:-3},bypass:false,bpm:100});
 const sum=h.gains[0];expect(reaches(sum,lim)).toBe(true);expect(reaches(lim,h.master)).toBe(true);expect(reaches(h.mixer.input('a') as any,lim)).toBe(true);
 expect(h.mixer.reduction(MASTER_ID,'lim')).toBe(0);lim.port.onmessage({data:{type:'reduction',value:4.5}});expect(h.mixer.reduction(MASTER_ID,'lim')).toBe(4.5);
 expect(h.mixer.reduction('a','lim')).toBeNull();expect(h.mixer.error(MASTER_ID)).toBeNull();
 vi.unstubAllGlobals();
});
it('forwards settings, bypass and tempo changes without rebuilding and disposes removed master inserts',async()=>{
 const h=harness();let p=addTrack(createProject({bpm:120}),'A','a');p=addPlugin(p,MASTER_ID,'delay',()=>'dl');h.mixer.sync(p);await wait();
 const node=h.worklets.find(w=>w.name==='sa3-fx-delay');node.messages.length=0;
 h.mixer.sync(setBpm(p,90));expect(node.messages.at(-1)).toMatchObject({type:'settings',bpm:90,bypass:false});
 h.mixer.sync(updatePluginSettings(setBpm(p,90),MASTER_ID,'dl',{feedback:70}));expect(node.messages.at(-1)).toMatchObject({type:'settings',settings:{feedback:70},bpm:90});
 expect(h.worklets.filter(w=>w.name==='sa3-fx-delay')).toHaveLength(1);
 h.mixer.sync({...p,masterPlugins:[]});h.ctx.currentTime=1;await wait();expect(node.messages.some((m:any)=>m.type==='dispose')).toBe(true);
 vi.unstubAllGlobals();
});
it('clears track and master effect state when playback stops',async()=>{
 const h=harness();
 try{
  let p=addTrack(createProject(),'A','a');
  p=addPlugin(p,'a','delay',()=>'track-delay');
  p=addPlugin(p,MASTER_ID,'delay',()=>'master-delay');
  h.mixer.sync(p);await wait();
  const delays=h.worklets.filter(w=>w.name==='sa3-fx-delay');
  expect(delays).toHaveLength(2);
  for(const node of delays)node.messages.length=0;
  h.mixer.clear();
  for(const node of delays)expect(node.messages).toContainEqual({type:'clear'});
 }finally{vi.unstubAllGlobals();}
});

it('shows and retries a failed master worklet installation',async()=>{
 let attempts=0;const h=harness(async()=>{if(++attempts===1)throw Error('worklet unavailable');});
 try{
  const p=addPlugin(createProject(),MASTER_ID,'delay',()=> 'master-delay');
  h.mixer.sync(p);await wait();
  expect(h.mixer.error(MASTER_ID)).toContain('worklet unavailable');
  h.mixer.retry(MASTER_ID);await wait();
  expect(h.mixer.error(MASTER_ID)).toBeNull();
  const delay=h.worklets.find(w=>w.name==='sa3-fx-delay');
  expect(delay).toBeTruthy();expect(reaches(h.gains[0],delay)).toBe(true);
  expect(h.worklets.some(w=>w.name==='sa3-meter')).toBe(true);
 }finally{vi.unstubAllGlobals();}
});
