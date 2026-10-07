/** In-place radix-2 transform. The inverse includes 1/N normalization. */
export function fft(re:Float64Array,im:Float64Array,inverse=false):void {
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const r=re[i]!,v=im[i]!;re[i]=re[j]!;im[i]=im[j]!;re[j]=r;im[j]=v;}}
 for(let len=2;len<=n;len*=2){const a=(inverse?2:-2)*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let start=0;start<n;start+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const u=start+k,v=u+len/2,x=re[v]!*cr-im[v]!*ci,y=re[v]!*ci+im[v]!*cr;re[v]=re[u]!-x;im[v]=im[u]!-y;re[u]!+=x;im[u]!+=y;const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;}}}
 if(inverse)for(let i=0;i<n;i++){re[i]!/=n;im[i]!/=n;}
}
export function nextPower(n:number):number {let p=1;while(p<n)p*=2;return p;}
