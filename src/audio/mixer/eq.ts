import {dbGain,normalizeBand,type EqBand,type EqSettings} from './model';
/** RBJ cookbook coefficients; normalized as [b0,b1,b2,a1,a2]. */
export type Section=[number,number,number,number,number];
const normalized=(b0:number,b1:number,b2:number,a0:number,a1:number,a2:number):Section=>[b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
export function sections(raw:EqBand,sr:number):Section[]{
 const b=normalizeBand(raw);if(!b.enabled)return [];
 const w=2*Math.PI*Math.min(b.freq,sr*.49)/sr,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*b.q),A=10**(b.gain/40);
 switch(b.type){
 case 'bell':return [normalized(1+alpha*A,-2*c,1-alpha*A,1+alpha/A,-2*c,1-alpha/A)];
 case 'notch':return [normalized(1,-2*c,1,1+alpha,-2*c,1-alpha)];
 case 'bandPass':return [normalized(alpha,0,-alpha,1+alpha,-2*c,1-alpha)];
 case 'allPass':return [normalized(1-alpha,-2*c,1+alpha,1+alpha,-2*c,1-alpha)];
 case 'lowShelf':{const k=2*Math.sqrt(A)*alpha;return [normalized(A*((A+1)-(A-1)*c+k),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-k),(A+1)+(A-1)*c+k,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-k)];}
 case 'highShelf':{const k=2*Math.sqrt(A)*alpha;return [normalized(A*((A+1)+(A-1)*c+k),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-k),(A+1)-(A-1)*c+k,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-k)];}
 default:{
 const order=b.slope/6,result:Section[]=[],low=b.type==='lowPass';
 if(order%2){const t=Math.tan(w/2),k=1/(1+t);result.push(low?[t*k,t*k,0,(t-1)*k,0]:[k,-k,0,(t-1)*k,0]);}
 for(let i=0;i<Math.floor(order/2);i++){
 // Butterworth section Qs, scaled by the user resonance relative to nominal Q.
 const q=1/(2*Math.sin(Math.PI*(2*i+1)/(2*order)))*b.q/Math.SQRT1_2,a=s/(2*q);
 result.push(low?normalized((1-c)/2,1-c,(1-c)/2,1+a,-2*c,1-a):normalized((1+c)/2,-(1+c),(1+c)/2,1+a,-2*c,1-a));
 }return result;}
 }
}
export function responseDb(coefficients:Section[],freq:number,sr:number):number{
 const w=2*Math.PI*freq/sr,c=Math.cos(w),s=-Math.sin(w),c2=Math.cos(2*w),s2=-Math.sin(2*w);let db=0;
 for(const [b0,b1,b2,a1,a2]of coefficients){const nr=b0+b1*c+b2*c2,ni=b1*s+b2*s2,dr=1+a1*c+a2*c2,di=a1*s+a2*s2;db+=10*Math.log10(Math.max(1e-24,(nr*nr+ni*ni)/(dr*dr+di*di)));}return db;
}
class Chain {
 readonly state:Float64Array;constructor(readonly coeff:Section[]){this.state=new Float64Array(coeff.length*4);}
 sample(x:number,ch:number){for(let j=0;j<this.coeff.length;j++){const [b0,b1,b2,a1,a2]=this.coeff[j]!,i=j*4+ch*2,y=b0*x+this.state[i]!;this.state[i]=b1*x-a1*y+this.state[i+1]!;this.state[i+1]=b2*x-a2*y;x=Number.isFinite(y)?y:0;}return x;}
 clear(){this.state.fill(0);}
}
/** Changes crossfade between coefficient-stable filter states over 10 ms. */
export class EqProcessor {
 private filterKey='';private current=new Chain([]);private previous:Chain|null=null;private blend=1;private gain=1;private targetGain=1;
 constructor(readonly sr:number){}
 set(eq:EqSettings,listen?:EqBand|null){this.targetGain=dbGain(eq.trimDb);const key=JSON.stringify(listen??(eq.bypass?[]:eq.bands));if(key===this.filterKey)return;this.filterKey=key;this.previous=this.current;this.current=new Chain(listen?sections({...listen,type:'bandPass',enabled:true},this.sr):eq.bypass?[]:eq.bands.flatMap(b=>sections(b,this.sr)));this.blend=0;this.targetGain=dbGain(eq.trimDb);}
 clear(){this.current.clear();this.previous=null;}
 process(l:Float32Array,r:Float32Array,ol:Float32Array,or:Float32Array){for(let i=0;i<ol.length;i++){this.blend=Math.min(1,this.blend+1/(this.sr*.01));this.gain+=(this.targetGain-this.gain)*.002;let a=this.current.sample(l[i]??0,0),b=this.current.sample(r[i]??0,1);if(this.previous){a=this.previous.sample(l[i]??0,0)*(1-this.blend)+a*this.blend;b=this.previous.sample(r[i]??0,1)*(1-this.blend)+b*this.blend;}ol[i]=a*this.gain;or[i]=b*this.gain;}if(this.blend===1)this.previous=null;}
}
