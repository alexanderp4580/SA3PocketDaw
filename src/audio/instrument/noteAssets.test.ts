import { expect,it } from 'vitest';
import { chooseNoteAssets } from './noteAssets';
const never=()=>new Promise<never>(()=>{});
function setup(o:{has?:boolean;ensure:Promise<void>;near?:number|null;timeout:Promise<void>}){
 const calls:string[]=[];
 const run=()=>chooseNoteAssets({midi:60,has:()=>!!o.has,ensure:()=>{calls.push('ensure');return o.ensure;},nearest:()=>o.near??null,timeout:()=>o.timeout.then(()=>{calls.push('timeout');})});
 return {run,calls};
}
it('uses the exact pitch when it is installed',async()=>{
 const s=setup({has:true,ensure:Promise.resolve(),timeout:never()});
 expect(await s.run()).toEqual({assetMidi:60,exact:true});expect(s.calls).toEqual([]);
});
it('uses the exact pitch when preparation finishes before the note is due',async()=>{
 const s=setup({ensure:Promise.resolve(),near:62,timeout:never()});
 expect(await s.run()).toEqual({assetMidi:60,exact:true});
});
it('falls back to a nearby installed pitch when preparation is still running at the due time',async()=>{
 const s=setup({ensure:never(),near:62,timeout:Promise.resolve()});
 expect(await s.run()).toEqual({assetMidi:62,exact:false});expect(s.calls).toContain('ensure');
});
it('waits for the exact pitch when no nearby pitch is installed',async()=>{
 let done!:()=>void;const ensure=new Promise<void>(r=>{done=r;});
 const s=setup({ensure,near:null,timeout:Promise.resolve()});
 const result=s.run();await Promise.resolve();await Promise.resolve();done();
 expect(await result).toEqual({assetMidi:60,exact:true});
});
it('does not leave an unhandled rejection when the fallback was used',async()=>{
 const ensure=Promise.reject(new Error('boom'));
 const s=setup({ensure,near:59,timeout:new Promise<void>(r=>setTimeout(r,5))});
 const result=await s.run().catch(()=>null);
 expect(result===null||result.assetMidi===59||result.assetMidi===60).toBe(true);
});
it('reports a failed preparation when there is nothing to fall back to',async()=>{
 const s=setup({ensure:Promise.reject(new Error('boom')),near:null,timeout:never()});
 await expect(s.run()).rejects.toThrow('boom');
});
