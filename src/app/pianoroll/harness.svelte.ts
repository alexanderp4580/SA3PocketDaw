import { mount } from 'svelte';
import '../../styles/theme.css';
import type { Track } from '../../store/projectModel';
import PianoRoll from '../screens/PianoRoll.svelte';

const notes = [
  [69, 0, 4, 100], [71, 4, 2, 90], [72, 6, 2, 96], [74, 8, 6, 110], [67, 14, 2, 80], [60, 0, 8, 70], [64, 8, 8, 70], [65, 16, 4, 96], [67, 20, 4, 96],
].map(([midi, start, length, velocity], i) => ({ id: `n${i}`, midi: midi!, start: start!, length: length!, velocity: velocity! }));

const track: Track = { id: 't1', name: 'Warm synth', muted: false, sampleId: 's1', rootMidi: 60, notes };
const target = document.getElementById('app')!;
target.style.cssText = 'width:412px;height:892px;display:flex;flex-direction:column';
const shell = document.createElement('div');
shell.style.cssText = 'flex:none;height:136px;background:#10141a;border-top:1px solid rgba(255,255,255,.08);color:#888;display:grid;place-items:center;font:12px sans-serif';
shell.textContent = 'shell transport + nav';
const host = document.createElement('div');
host.style.cssText = 'flex:1;min-height:0';
target.append(host, shell);
const props = $state({
  track,
  bars: 2,
  playhead: () => 9.5,
  sampleName: 'synth lead',
  onTrackBars:(n:number)=>{props.bars=n;},
  onSolo:()=>{},
  onOpenGenerate: () => {},
  onChange: (t: Track) => {
    props.track = t;
  },
  onAudition: (_midi: number, _velocity?: number) => {},
  onBack: () => {},
});
mount(PianoRoll, { target: host, props });
