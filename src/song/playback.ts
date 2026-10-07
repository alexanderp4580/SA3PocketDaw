import type {NoteEvent,SchedulerOptions} from '../audio/scheduler';
import type {CompiledSong} from './events';
export function createSongPlayback(opts:SchedulerOptions&{onEnd?:()=>void}){
 let song:CompiledSong={duration:0,events:[]},bpm=120,playing=false,repeat=false,offset=0,anchor=0,scheduled=0,timer:unknown=null;
 const clear=()=>{if(timer!==null)opts.clearTimer(timer);timer=null;};
 const elapsed=()=>Math.max(offset,opts.now()-anchor);
 function tick(){if(!playing)return;const time=elapsed(),end=song.duration;
 if(!repeat&&time>=end){playing=false;offset=end;clear();opts.onEnd?.();return;}
 const horizon=Math.min(repeat?Infinity:end,time+(opts.lookahead??.15));
 for(let cycle=Math.floor(scheduled/end);end>0&&cycle<=Math.floor(horizon/end);cycle++)for(const e of song.events){const at=cycle*end+e.when;if(at>=scheduled&&at<horizon)opts.onNote({...e,when:anchor+at});}
 scheduled=horizon;timer=opts.setTimer(tick,opts.tickMs??25);
 }
 return {
 get isPlaying(){return playing;},
 setSong(next:CompiledSong,nextBpm:number){this.stop();song=next;bpm=nextBpm;},
 setRepeat(value:boolean){repeat=value;},
 play(){if(playing||song.duration<=0)return;if(offset>=song.duration)offset=0;anchor=opts.now()+.05-offset;scheduled=offset;playing=true;
 const local=offset%song.duration;if(local>0)for(const e of song.events)if(e.when<local&&e.when+e.duration>local)opts.onNote({...e,when:anchor+offset,duration:e.when+e.duration-local});
 tick();},
 pause(){if(!playing)return;offset=elapsed();if(repeat)offset%=song.duration;playing=false;clear();},
 stop(){playing=false;offset=0;clear();},
 position(){let t=playing?elapsed():offset;if(repeat&&song.duration>0)t%=song.duration;return Math.min(t,song.duration)*bpm/60*4;}
 };
}
