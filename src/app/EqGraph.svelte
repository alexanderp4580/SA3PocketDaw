<script lang="ts">
 import {onMount} from 'svelte';import {engine} from './services';import {sections,responseDb} from '../audio/mixer/eq';import {bandwidth,gainFilter,type EqBand} from '../audio/mixer/model';
 let {bands,bypass,trimDb,selected,trackId,pluginId,post,heat,reference,onselect,onedit}:{bands:EqBand[];bypass:boolean;trimDb:number;selected:string|null;trackId:string;pluginId:string;post:boolean;heat:boolean;reference:string;onselect:(id:string)=>void;onedit:(id:string,patch:Partial<EqBand>)=>void}=$props();
 let canvas:HTMLCanvasElement;let container:HTMLDivElement;let width=$state(320),sr=$state(44100);let drag:string|null=null;const height=210;
 const maxFreq=$derived(Math.min(20000,sr*.49));const x=(f:number)=>Math.log(Math.max(20,f)/20)/Math.log(maxFreq/20)*width;
 const y=(db:number)=>Math.max(0,Math.min(height,height/2-db/48*height));const freq=(px:number)=>20*(maxFreq/20)**Math.max(0,Math.min(1,px/width));
 const color=(i:number)=>`hsl(${i*67%360} 85% 65%)`;
 function path(b:EqBand[]){const s=b.flatMap(b=>sections(b,sr));return Array.from({length:161},(_,i)=>{const px=i/160*width;return `${i?'L':'M'}${px.toFixed(2)},${y(responseDb(s,freq(px),sr)).toFixed(2)}`;}).join(' ');}
 const all=$derived(path(bypass?[]:bands));const focus=$derived(bands.find(b=>b.id===selected));
 function move(e:PointerEvent){if(!drag)return;const rect=container.getBoundingClientRect(),b=bands.find(b=>b.id===drag);if(b)onedit(b.id,{freq:Math.round(freq(e.clientX-rect.left)),...(gainFilter(b.type)?{gain:Math.round((height/2-(e.clientY-rect.top))/height*48*10)/10}:{})});}
 onMount(()=>{const observer=new ResizeObserver(entries=>{width=entries[0]?.contentRect.width??320;});observer.observe(container);let timer:number;const ctx=canvas.getContext('2d')!;const history=document.createElement('canvas');history.width=512;history.height=height;const hc=history.getContext('2d')!;
 const draw=()=>{if(document.hidden)return;sr=engine.sampleRate();const dpr=devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=height*dpr;ctx.scale(dpr,dpr);const spec=engine.spectrum(trackId,pluginId,post);if(!spec)return;const values=spec.values,fft=values.length*2;
 const bins=(px:number)=>values[Math.min(values.length-1,Math.max(1,Math.round(freq(px)/spec.sampleRate*fft)))]??-100;
 if(heat){hc.drawImage(history,0,0,512,height-1,0,1,512,height-1);for(let i=0;i<512;i++){const v=Math.max(0,Math.min(1,(bins(i/512*width)+90)/80));hc.fillStyle=`hsla(${240-v*240},85%,${15+v*45}%,${v*.8})`;hc.fillRect(i,0,1,1);}ctx.drawImage(history,0,0,width,height);}else hc.clearRect(0,0,512,height);
 function spectrum(data:Float32Array,rate:number,stroke:string,fill:boolean){ctx.beginPath();for(let px=0;px<=width;px+=2){const v=data[Math.min(data.length-1,Math.max(1,Math.round(freq(px)/rate*data.length*2)))]??-100,py=height-Math.max(0,Math.min(1,(v+100)/100))*height;px?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke();if(fill){ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle='#4fb3ff20';ctx.fill();}}
 spectrum(values,spec.sampleRate,'#4fb3ff99',true);if(reference){const ref=engine.spectrum(reference,'',true);if(ref)spectrum(ref.values,ref.sampleRate,'#ff8a3daa',false);}
 };timer=window.setInterval(draw,40);return ()=>{observer.disconnect();clearInterval(timer);};});
</script>
<div class="graph" bind:this={container}>
 <canvas bind:this={canvas} aria-hidden="true"></canvas>
 <svg viewBox="0 0 {width} {height}" aria-hidden="true">
 {#each [100,1000,10000] as f}<line x1={x(f)} x2={x(f)} y1={0} y2={height} stroke="#ffffff12"/>{/each}
 {#each [-24,-12,0,12,24] as g}<line x1={0} x2={width} y1={y(g)} y2={y(g)} stroke={g===0?'#ffffff40':'#ffffff12'}/><text x={3} y={Math.max(10,Math.min(height-3,y(g)-3))} fill="#9aa3b5" font-size={9}>{g>0?'+':''}{g}</text>{/each}
 {#if focus}{@const range=bandwidth(focus.freq,focus.q)}<rect x={Math.max(0,x(range[0]!))} y={0} width={Math.max(0,Math.min(width,x(range[1]!))-Math.max(0,x(range[0]!)))} height={height} fill="#b685ff10"/>{/if}
 {#each bands as b,i(b.id)}<path d={path([b])} fill="none" stroke={color(i)} stroke-width={b.id===selected?2:1} opacity={b.enabled&&!bypass?b.id===selected?.8:.35:.15}/>{/each}
 <path d={all} fill="none" stroke="#ffffff" stroke-width={2}/>
 </svg>
 {#each bands as b,i(b.id)}<button class="node" class:selected={b.id===selected} style="--node:{color(i)};left:{Math.max(18,Math.min(width-18,x(b.freq)))}px;top:{Math.max(18,Math.min(height-18,y(gainFilter(b.type)?b.gain:0)))}px" aria-label="EQ band {i+1}, {Math.round(b.freq)} Hz" onclick={()=>onselect(b.id)} onpointerdown={e=>{drag=b.id;onselect(b.id);e.currentTarget.setPointerCapture(e.pointerId);}} onpointermove={move} onpointerup={()=>drag=null} onpointercancel={()=>drag=null}>{i+1}</button>{/each}
</div>
<div class="axis"><span>20 Hz</span><span>100</span><span>1k</span><span>10k</span><span>20k</span></div>
<p class="legend">White: combined EQ · Blue: {post?'after':'before'} EQ{reference?' · Orange: comparison':''}{trimDb?' · Trim applied separately':''}</p>
<style>.graph{position:relative;height:210px;background:#0b0d12;border:1px solid var(--line);border-radius:8px;overflow:hidden;touch-action:none}canvas,svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.node{position:absolute;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;border:2px solid var(--node);color:var(--node);background:#131720dd;font-weight:700;touch-action:none}.node.selected{box-shadow:0 0 0 4px color-mix(in srgb,var(--node) 20%,transparent);background:color-mix(in srgb,var(--node) 25%,#131720)}.axis{display:flex;justify-content:space-between;color:var(--dim);font-size:9px;margin:5px 0}.legend{font-size:10px;color:var(--dim);margin:5px 0 10px}</style>
