<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import Sheet from './Sheet.svelte';
 import {ui,stop} from './appState.svelte';
 import {projectStore} from './services';
 import {exportSong,mp3Filename,type ExportProgress} from '../song/export';
 import {formatBytes} from './format';
 let {onclose}:{onclose:()=>void}=$props();
 let progress=$state<ExportProgress>({stage:'Preparing',fraction:0}),error=$state(''),url=$state(''),filename=$state(''),bytes=$state(0),busy=$state(true),cancelled=$state(false);
 let controller:AbortController|null=null;
 async function run(){
  if(!ui.project)return;stop();controller=new AbortController();busy=true;error='';cancelled=false;filename=mp3Filename(ui.project.name);
  try{const blob=await exportSong($state.snapshot(ui.project),projectStore,{signal:controller.signal,onProgress:p=>progress=p});url=URL.createObjectURL(blob);bytes=blob.size;}
  catch(e){if((e as Error).name==='AbortError')cancelled=true;else error=(e as Error).message??String(e);}finally{busy=false;controller=null;}
 }
 function cancel(){controller?.abort();}
 onMount(()=>void run());onDestroy(()=>{controller?.abort();if(url)URL.revokeObjectURL(url);});
</script>
<Sheet title="Export MP3" sub={filename} onclose={onclose} closable={!busy}>
 {#if busy}
  <div class="card"><div class="row"><b class="grow">{progress.stage}</b><span>{Math.round(progress.fraction*100)}%</span></div>
   <div class="bar" role="progressbar" aria-label={progress.stage} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress.fraction*100)}><i style="width:{progress.fraction*100}%"></i></div>
   <p class="note">Your song includes instruments, sample controls and mixer effects.</p>
   <button class="btn" aria-label="Cancel MP3 export" onclick={cancel}>Cancel</button>
  </div>
 {:else if url}
  <div class="card"><b>MP3 ready</b><p class="note">Stereo · 192 kbps · {formatBytes(bytes)}</p></div>
  <a class="btn pri download" aria-label="Download MP3" href={url} download={filename}>↓ Download MP3</a>
 {:else}
  <div class="card" class:bad={!!error} role={error?'alert':'status'}><b>{cancelled?'Export cancelled':'Could not export'}</b><p class="note">{error||'Your layout is saved. You can try again.'}</p></div>
  <div class="btnrow"><button class="btn pri" onclick={()=>void run()}>Try again</button></div>
 {/if}
</Sheet>
<style>.download{display:flex;align-items:center;justify-content:center;text-decoration:none;margin-top:12px;min-height:44px;}</style>
