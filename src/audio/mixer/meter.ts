export interface MeterReading {rms:[number,number];peak:[number,number];clip:boolean;}
export const emptyMeter=():MeterReading=>({rms:[0,0],peak:[0,0],clip:false});
export class StereoMeter {
 private reading=emptyMeter();private held=[0,0];private clipFrames=0;
 constructor(readonly sr:number){}
 add(l:Float32Array,r:Float32Array){for(let ch=0;ch<2;ch++){const x=ch===0?l:r;let sum=0,peak=0;for(let i=0;i<x.length;i++){const v=x[i]!;sum+=v*v;peak=Math.max(peak,Math.abs(v));}const rms=Math.sqrt(sum/Math.max(1,x.length)),old=this.reading.rms[ch]!;this.reading.rms[ch]=Math.max(rms,old*Math.exp(-x.length/(this.sr*.3)));if(peak>=this.reading.peak[ch]!){this.reading.peak[ch]=peak;this.held[ch]=this.sr;}else {this.held[ch]=Math.max(0,this.held[ch]!-x.length);if(!this.held[ch])this.reading.peak[ch]=Math.max(peak,this.reading.peak[ch]!*Math.exp(-x.length/(this.sr*.7)));}if(peak>=1)this.clipFrames=this.sr*2;}this.clipFrames=Math.max(0,this.clipFrames-l.length);this.reading.clip=this.clipFrames>0;}
 read(){return this.reading;}
 clear(){this.reading=emptyMeter();this.held=[0,0];this.clipFrames=0;}
}
