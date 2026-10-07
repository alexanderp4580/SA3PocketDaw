import {Mp3Encoder} from '@breezystack/lamejs';
import {it,expect} from 'vitest';
import {createProject,addTrack,addNote,setTrackSample} from '../store/projectModel';
import {placeBlock} from './arrangement';
import {loadSongSnapshot,mp3Filename} from './export';
import {pcm16,encodeMp3} from './encode';
import {trimTail} from './render';
function project(){let p=addTrack(createProject({bars:1}),'Lead','t');p=addNote(p,'t',{midi:60,start:0,length:2});return placeBlock(setTrackSample(p,'t','s'),'t',1);}
it('refuses missing audio instead of dropping arranged notes',async()=>{await expect(loadSongSnapshot(project(),{getSample:async()=>null})).rejects.toThrow(/Lead.*missing/i);});
it('takes an immutable project snapshot before loading sounds',async()=>{const p=project();let release!:(v:any)=>void;const pending=loadSongSnapshot(p,{getSample:()=>new Promise(r=>release=r)});p.tracks[0]!.notes[0]!.midi=72;release({pcm:new Float32Array(100),sampleRate:44100,meta:{}});expect((await pending).project.tracks[0]!.notes[0]!.midi).toBe(60);});
it('aborted export does not load or mutate audio',async()=>{const p=project(),c=new AbortController();c.abort();await expect(loadSongSnapshot(p,{getSample:async()=>{throw Error('must not run');}},c.signal)).rejects.toMatchObject({name:'AbortError'});expect(p.arrangement?.blocks).toHaveLength(1);});
it('requires an arrangement with audible notes',async()=>{await expect(loadSongSnapshot(createProject(),{getSample:async()=>null})).rejects.toThrow(/notes/i);});
it('creates a safe MP3 filename and saturates PCM without wrapping',()=>{expect(mp3Filename('../My song:/')).toBe('My song.mp3');expect([...pcm16(new Float32Array([-2,-1,0,1,2,NaN]))]).toEqual([-32768,-32768,0,32767,32767,0]);});
it('retains timeline silence and trims only the final tail',()=>{const l=new Float32Array(44100*3),r=l.slice();l[44100+1000]=.1;const out=trimTail([l,r],44100,1);expect(out[0]!.length).toBeGreaterThan(44100+1000);expect(out[0]!.length).toBeLessThan(44100*2);expect(trimTail([new Float32Array(44100*2),r],44100,1)[0]!.length).toBe(44100);});
it('encodes real stereo MPEG frames with a finite sine wave',()=>{const l=Float32Array.from({length:44100},(_,i)=>.3*Math.sin(i*2*Math.PI*220/44100)),bytes=encodeMp3(l,l,44100,Mp3Encoder);expect(bytes.length).toBeGreaterThan(20000);expect(bytes[0]).toBe(255);expect(bytes[1]!&224).toBe(224);});
