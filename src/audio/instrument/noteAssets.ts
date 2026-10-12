export interface NoteAssetsOptions {
 midi:number;
 has:(midi:number)=>boolean;
 /** Starts (or joins) preparing the pitch. */
 ensure:(midi:number)=>Promise<void>;
 nearest:(midi:number)=>number|null;
 /** Resolves when the note is due and preparation should no longer be waited for. */
 timeout:()=>Promise<void>;
}
/**
 * Picks the assets a note plays from: its own pitch when installed or ready before the note is due, otherwise the
 * nearest installed pitch (the voice itself still runs at the note's pitch), otherwise it waits for its own pitch.
 */
export async function chooseNoteAssets(o:NoteAssetsOptions):Promise<{assetMidi:number;exact:boolean}> {
 if(o.has(o.midi))return {assetMidi:o.midi,exact:true};
 const ready=o.ensure(o.midi),outcome=await Promise.race([ready.then(()=>'ready' as const),o.timeout().then(()=>'due' as const)]);
 if(outcome==='ready')return {assetMidi:o.midi,exact:true};
 const near=o.nearest(o.midi);
 if(near!==null){ready.catch(()=>{});return {assetMidi:near,exact:false};}
 await ready;return {assetMidi:o.midi,exact:true};
}
