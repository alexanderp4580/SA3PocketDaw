/** Recording fakes of the Web Audio pieces the preset voices use (tests only). */
export interface ParamEvent { type: 'set' | 'ramp' | 'cancel'; value?: number; time: number }

export class FakeParam {
  value = 0;
  events: ParamEvent[] = [];
  setValueAtTime(v: number, t: number) { this.events.push({ type: 'set', value: v, time: t }); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.events.push({ type: 'ramp', value: v, time: t }); return this; }
  cancelScheduledValues(t: number) { this.events = this.events.filter((e) => e.time < t); this.events.push({ type: 'cancel', time: t }); return this; }
}

export class FakeNode {
  connections: unknown[] = [];
  connect(d: unknown) { this.connections.push(d); return d; }
  disconnect() { this.connections = []; }
}

export class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  playbackRate = new FakeParam();
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started: number | null = null;
  stopped: number | null = null;
  start(when?: number) { this.started = when ?? 0; }
  stop(when?: number) { this.stopped = when ?? 0; }
}

export class FakeGain extends FakeNode { gain = new FakeParam(); }
export class FakeFilter extends FakeNode { type: BiquadFilterType = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
export class FakePanner extends FakeNode { pan = new FakeParam(); }

export class FakePresetContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  panners: FakePanner[] = [];
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter() { const f = new FakeFilter(); this.filters.push(f); return f; }
  createStereoPanner() { const p = new FakePanner(); this.panners.push(p); return p; }
}
