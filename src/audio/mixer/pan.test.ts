import {it,expect} from 'vitest';
import {panGain} from './model';
/** Web Audio StereoPannerNode law for a stereo input. */
function stereoPanner(pan:number,l:number,r:number):[number,number]{
 if(pan<=0){const t=(pan+1)*Math.PI/2;return [l+r*Math.cos(t),r*Math.sin(t)];}
 const t=pan*Math.PI/2;return [l*Math.cos(t),r+l*Math.sin(t)];
}
const out=(pan:number)=>{const [l,r]=stereoPanner(pan,1,1),g=panGain(pan);return [l*g,r*g];};
it('a centered dual-mono source keeps unity gain on both channels',()=>{const [l,r]=out(0);expect(l).toBeCloseTo(1,6);expect(r).toBeCloseTo(1,6);});
it('hard pan puts the source on one channel at most 3 dB above center',()=>{const [l,r]=out(-1);expect(r).toBeCloseTo(0,6);expect(l).toBeCloseTo(Math.SQRT2,6);const [l2,r2]=out(1);expect(l2).toBeCloseTo(0,6);expect(r2).toBeCloseTo(Math.SQRT2,6);});
it('total power stays constant across the pan range',()=>{for(const p of [-1,-.75,-.4,-.1,0,.1,.4,.75,1]){const [l=0,r=0]=out(p);expect(l*l+r*r).toBeCloseTo(2,6);}});
