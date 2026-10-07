import {pcm16} from './encode';
import type {Mp3Encoder} from '@breezystack/lamejs';
self.onmessage=async(e:MessageEvent<{left:Float32Array;right:Float32Array}>)=>{
 try{
 const url='/mp3/lamejs.js';
 const lib=await import(/* @vite-ignore */ url) as {Mp3Encoder:typeof Mp3Encoder};
 const encoder=new lib.Mp3Encoder(2,44100,192),parts:Uint8Array[]=[];
 const {left,right}=e.data;
 for(let i=0;i<left.length;i+=1152){const part=encoder.encodeBuffer(pcm16(left.subarray(i,i+1152)),pcm16(right.subarray(i,i+1152)));if(part.length)parts.push(new Uint8Array(part));if(i%(1152*128)===0)self.postMessage({type:'progress',fraction:i/left.length});}
 parts.push(new Uint8Array(encoder.flush()));self.postMessage({type:'done',blob:new Blob(parts as BlobPart[],{type:'audio/mpeg'})});
 }catch(e){self.postMessage({type:'error',message:String(e)});}
};
