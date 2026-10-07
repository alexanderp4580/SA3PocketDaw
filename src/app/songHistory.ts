import type {Arrangement} from '../song/arrangement';
export interface SongHistory {past:Arrangement[];future:Arrangement[]}
const copy=(a:Arrangement):Arrangement=>({bars:a.bars,blocks:a.blocks.map(b=>({...b}))});
export function newSongHistory():SongHistory{return {past:[],future:[]};}
export function rememberSong(h:SongHistory,current:Arrangement):SongHistory{return {past:[...h.past,copy(current)].slice(-30),future:[]};}
export function undoSong(h:SongHistory,current:Arrangement){const last=h.past.at(-1);return last?{history:{past:h.past.slice(0,-1),future:[copy(current),...h.future]},arrangement:copy(last)}:{history:h,arrangement:null};}
export function redoSong(h:SongHistory,current:Arrangement){const first=h.future[0];return first?{history:{past:[...h.past,copy(current)],future:h.future.slice(1)},arrangement:copy(first)}:{history:h,arrangement:null};}
