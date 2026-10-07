import { log } from '../../log';
import { fft } from './fft';
import type { InstrumentProfile,Partial } from './types';
const scope=log.scope('instrument.analysis');
const N=8192,HOP=512,FFT=32768;
const median=(a:number[])=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;};
function peak(m:Float64Array,lo:number,hi:number,bin:number):{f:number;a:number}{let k=Math.max(1,Math.floor(lo/bin)),end=Math.min(m.length-2,Math.ceil(hi/bin)),best=k;for(;k<=end;k++)if(m[k]!>m[best]!)best=k;const a=Math.log(Math.max(1e-12,m[best-1]!)),b=Math.log(Math.max(1e-12,m[best]!)),c=Math.log(Math.max(1e-12,m[best+1]!)),den=a-2*b+c,delta=den?Math.max(-.5,Math.min(.5,.5*(a-c)/den)):0;return {f:(best+delta)*bin,a:m[best]!};}
/** Analyse one isolated note; no assumed MIDI root is needed. FFT buffers are reused per frame. */
export function analyse(input:Float32Array,sampleRate:number,dynamics:'sustain'|'decay',progress:(fraction:number)=>void=()=>{}):InstrumentProfile {
 if(input.length<4096||!input.every(Number.isFinite))throw new Error('The source is silent, too short, or invalid.');
 let envMax=0;const env:number[]=[];for(let b=0;b<input.length;b+=256){let sq=0;for(let i=b;i<Math.min(b+256,input.length);i++)sq+=input[i]!**2;const rms=Math.sqrt(sq/256);env.push(rms);envMax=Math.max(envMax,rms);}
 if(envMax<1e-5)throw new Error('The model produced silence.');
 const onset=Math.max(0,env.findIndex(v=>v>envMax*.03)*256-Math.round(.005*sampleRate)),pcm=input.slice(onset),count=Math.ceil(pcm.length/HOP),bin=sampleRate/FFT;
 const win=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1))),winSum=win.reduce((a,v)=>a+v,0),re=new Float64Array(FFT),im=new Float64Array(FFT),rms=new Float64Array(count),avg=new Float64Array(FFT/2+1);
 const frame=(j:number)=>{re.fill(0);im.fill(0);let sq=0;for(let i=0;i<N;i++){const v=pcm[j*HOP+i-N/2]??0;sq+=v*v;re[i]=v*win[i]!;}fft(re,im);return Math.sqrt(sq/N);};
 for(let j=0;j<count;j++){let sq=0;for(let i=Math.max(0,j*HOP-N/2);i<Math.min(pcm.length,j*HOP+N/2);i++)sq+=pcm[i]!**2;rms[j]=Math.sqrt(sq/N);}
 const maxRms=Math.max(...rms);let weight=0;for(let j=0;j<count;j++){if(j*HOP/sampleRate>=.06&&rms[j]!>maxRms*.15){frame(j);weight+=rms[j]!;for(let k=0;k<avg.length;k++)avg[k]!+=Math.hypot(re[k]!,im[k]!)*rms[j]!;}progress(.25*j/count);}
 if(!weight)throw new Error('No usable tonal body. Try a longer single note.');
 let max=0;for(let k=0;k<avg.length;k++){avg[k]!/=weight;max=Math.max(max,avg[k]!);}
 const compressed=avg.map(v=>Math.sqrt(v/max));let coarse=50,best=-Infinity;
 for(let i=0;i<Math.log2(1200/50)*240;i++){const f=50*2**(i/240);let score=0;for(let h=1;h<=10;h++){const center=f*h/bin;let value=0;for(let o=-2;o<=2;o++){const pos=center+o,k=Math.floor(pos),a=pos-k;if(k>=0&&k+1<compressed.length)value=Math.max(value,compressed[k]!*(1-a)+compressed[k+1]!*a);}score+=.8**(h-1)*value;}if(score>best){best=score;coarse=f;}}
 let sum=0,weights=0;for(let h=1;h<=6;h++){const p=peak(avg,coarse*h*.975,coarse*h*1.025,bin);if(p.a>max*.06){const w=p.a/(h*h);sum+=p.f/h*w;weights+=w;}}
 if(!weights)throw new Error('Could not find a stable single note.');let hz=sum/weights;
 const mask=new Uint8Array(avg.length);for(let h=1;h*hz<8000;h++){const f=h*hz,w=Math.max(1.6*sampleRate/N,.025*f);for(let k=Math.max(0,Math.ceil((f-w)/bin));k<Math.min(mask.length,(f+w)/bin);k++)mask[k]=1;}
 let total=0,explained=0;for(let j=0;j<count;j++){if(j*HOP/sampleRate<.06||rms[j]!<=maxRms*.15)continue;frame(j);for(let k=Math.ceil(40/bin);k<8000/bin;k++){const e=re[k]!**2+im[k]!**2;total+=e;if(mask[k])explained+=e;}}
 const harmonicEnergy=explained/total;if(harmonicEnergy<.72)throw new Error(`This is not a clean single note (${Math.round(harmonicEnergy*100)}% tonal energy). Try one dry isolated note, without chords or accompaniment.`);
 const partials:Partial[]=[];for(let h=1;h<Math.min(65,Math.floor(14000/hz)+1);h++){const p=peak(avg,h*hz*.975,h*hz*1.025,bin);if(p.a>=max*.015)partials.push({ratio:p.f/hz,amplitudes:new Float32Array(count),phase:0,decay:-.5});}
 const mag=new Float64Array(avg.length),freqs=partials.map(()=>[] as number[]),residual=new Float32Array(pcm.length+N),ola=new Float32Array(pcm.length+N);
 for(let j=0;j<count;j++){frame(j);for(let k=0;k<mag.length;k++)mag[k]=Math.hypot(re[k]!,im[k]!);for(let q=0;q<partials.length;q++){const p=partials[q]!,f=p.ratio*hz,pk=peak(mag,f*.99,f*1.01,bin);p.amplitudes[j]=2*pk.a/winSum;freqs[q]!.push(pk.f);const width=Math.max(2.5*sampleRate/N,.025*f);for(let k=Math.max(0,Math.ceil((f-width)/bin));k<Math.min(mag.length,(f+width)/bin);k++){re[k]=0;im[k]=0;if(k>0){re[FFT-k]=0;im[FFT-k]=0;}}}fft(re,im,true);for(let i=0;i<N;i++){const at=j*HOP+i;if(at<residual.length){residual[at]!+=re[i]!*win[i]!;ola[at]!+=win[i]!**2;}}progress(.5+.5*j/count);}
 const reference=Math.min(count-1,Math.round(.12*sampleRate/HOP));for(let q=0;q<partials.length;q++){const p=partials[q]!,a=p.amplitudes,ampMax=Math.max(...a),reliable=freqs[q]!.filter((_,i)=>a[i]!>ampMax*.15);p.ratio=median(reliable)/hz;let cr=0,ci=0;for(let i=0;i<N;i++){const pos=reference*HOP+i-N/2,v=(pcm[pos]??0)*win[i]!,ph=2*Math.PI*p.ratio*hz*pos/sampleRate;cr+=v*Math.cos(ph);ci-=v*Math.sin(ph);}p.phase=Math.atan2(ci,cr);const end=(count-1)*HOP/sampleRate,tail=Array.from(a).filter((_,i)=>i*HOP/sampleRate>Math.max(.1,end-.5)),head=Array.from(a).filter((_,i)=>i*HOP/sampleRate>.1&&i*HOP/sampleRate<Math.min(end,.4));p.decay=Math.min(-.5,Math.log(Math.max(median(tail),1e-6)/Math.max(median(head),1e-6))/Math.max(.2,end-.3));}
 const noise=Float32Array.from({length:pcm.length},(_,i)=>residual[i+N/2]!/Math.max(ola[i+N/2]!,1e-8));const anchor=partials.find(p=>p.ratio>.97&&p.ratio<1.03)?.ratio??1;hz*=anchor;for(const p of partials)p.ratio/=anchor;
 // Source normalization applies equally to the attack, partials and residual.
 let sourcePeak=0;for(const v of pcm)sourcePeak=Math.max(sourcePeak,Math.abs(v));const gain=Math.min(1,.9/Math.max(sourcePeak,partials.reduce((s,p)=>s+Math.max(...p.amplitudes),0)+envMax));
 scope.info('analysed',{hz,partials:partials.length,harmonicEnergy,dynamics});return {version:1,hz,sampleRate,hop:HOP,pcm,residual:noise,partials,harmonicEnergy,dynamics,gain};
}
