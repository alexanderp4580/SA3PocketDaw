import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../log';
import { GenerationError } from './client';
import { CLOUD_DEADLINE_MS, CLOUD_POLL_MS, CLOUD_START_URL, cloudResultUrl, generateCloud, type CloudDeps } from './cloud';

const KEY = 'sk-SECRET-abcdef-1234';
const params = { prompt: 'a punchy kick', seconds: 2, steps: 8, seed: 7 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const audio = () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'audio/wav' } });
const decoded = (frames = 44100 * 3) => ({ channels: [new Float32Array(frames).fill(0.5), new Float32Array(frames).fill(-0.25)], sampleRate: 44100 });

function setup(responses: Array<Response | Error>, over: Partial<CloudDeps> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const queue = [...responses];
  let clock = 1000;
  const sleeps: number[] = [];
  const deps: CloudDeps = {
    fetch: async (url, init) => {
      calls.push({ url, init: init ?? {} });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next instanceof Error) throw next;
      return next;
    },
    decode: () => decoded(),
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
    ...over,
  };
  return { deps, calls, sleeps };
}

describe('generateCloud', () => {
  it('starts with a multipart POST carrying the key and every field', async () => {
    const { deps, calls } = setup([json(202, { id: 'abc' }), audio()]);
    await generateCloud(params, KEY, deps);
    const start = calls[0]!;
    expect(start.url).toBe('https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio');
    expect(CLOUD_START_URL).toBe(start.url);
    expect(start.init.method).toBe('POST');
    const h = new Headers(start.init.headers);
    expect(h.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(h.get('accept')).toBe('audio/*');
    expect(h.has('content-type')).toBe(false);
    const f = start.init.body as FormData;
    expect(f).toBeInstanceOf(FormData);
    expect(Object.fromEntries(f.entries())).toEqual({ prompt: 'a punchy kick', model: 'stable-audio-3', duration: '2', seed: '7', steps: '8', output_format: 'wav' });
  });
  it('clamps steps to 4..8, duration to at least 1 s and seed to the API range', async () => {
    const a = setup([json(202, { id: 'x' }), audio()]);
    await generateCloud({ ...params, steps: 16, seconds: 0.5, seed: 4294967295 }, KEY, a.deps);
    const f = a.calls[0]!.init.body as FormData;
    expect([f.get('steps'), f.get('duration'), f.get('seed')]).toEqual(['8', '1', '4294967294']);
    const b = setup([json(202, { id: 'x' }), audio()]);
    await generateCloud({ ...params, steps: 1 }, KEY, b.deps);
    expect((b.calls[0]!.init.body as FormData).get('steps')).toBe('4');
  });
  it('polls the result URL every 2 s through 202, 202, 200 and decodes the audio', async () => {
    const { deps, calls, sleeps } = setup([json(202, { id: 'id 1/x' }), json(202, { id: 'id 1/x', status: 'in-progress' }), json(202, { id: 'id 1/x', status: 'in-progress' }), audio()]);
    const progress = vi.fn();
    const out = await generateCloud(params, KEY, { ...deps, onProgress: progress });
    expect(calls).toHaveLength(4);
    for (const c of calls.slice(1)) {
      expect(c.url).toBe('https://api.stability.ai/v2beta/audio/results/id%201%2Fx');
      expect(c.init.method ?? 'GET').toBe('GET');
      expect(new Headers(c.init.headers).get('authorization')).toBe(`Bearer ${KEY}`);
      expect(new Headers(c.init.headers).get('accept')).toBe('audio/*');
    }
    expect(cloudResultUrl('q')).toBe('https://api.stability.ai/v2beta/audio/results/q');
    expect(sleeps).toEqual([CLOUD_POLL_MS, CLOUD_POLL_MS, CLOUD_POLL_MS]);
    expect(CLOUD_POLL_MS).toBe(2000);
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls[0]![0].stage).toBe('Generating in the cloud');
    expect(out.sampleRate).toBe(44100);
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0]).toHaveLength(88200);
    expect(out.stats.peak).toBeCloseTo(0.5);
    expect(out.stats.nonFinite).toBe(0);
    expect(out.stats.rms).toBeGreaterThan(0);
    expect(out.stats.dims).toEqual([1, 2, 88200]);
    const total = out.timings.find((t) => t.name === 'total')!;
    expect(total.endMs - total.startMs).toBe(6000);
  });
  it('passes the downloaded bytes to the decoder', async () => {
    const decode = vi.fn((_bytes: ArrayBuffer) => decoded());
    const { deps } = setup([json(202, { id: 'a' }), audio()], { decode });
    await generateCloud(params, KEY, deps);
    expect(new Uint8Array(decode.mock.calls[0]![0] as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
  it.each([
    [403, /403/, /content|access/i],
    [429, /429/, /rate|credits|later/i],
    [422, /422/, /rejected/i],
    [500, /500/, /server|later/i],
    [400, /400/, /rejected|invalid/i],
    [401, /401/, /key/i],
  ])('maps HTTP %i on the start request to a readable error', async (status, a, b) => {
    const { deps } = setup([json(status, { id: 'e', name: 'n', errors: ['detail text from API'] })]);
    const e = await generateCloud(params, KEY, deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.message).toMatch(a);
    expect(e.message).toMatch(b);
    expect(e.message).toContain('detail text from API');
  });
  it('maps an error body that is not JSON', async () => {
    const { deps } = setup([new Response('<html>bad gateway</html>', { status: 500 })]);
    const e = await generateCloud(params, KEY, deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.message).toMatch(/500/);
  });
  it('maps an error while polling and a 404 result', async () => {
    const a = setup([json(202, { id: 'a' }), json(500, { errors: ['boom'] })]);
    expect((await generateCloud(params, KEY, a.deps).catch((x) => x)).message).toMatch(/500/);
    const b = setup([json(202, { id: 'a' }), json(404, { errors: ['gone'] })]);
    expect((await generateCloud(params, KEY, b.deps).catch((x) => x)).message).toMatch(/404/);
  });
  it('rejects a 202 start response without an id', async () => {
    for (const body of [{}, { id: 5 }, { id: '' }, 'x']) {
      const { deps } = setup([json(202, body)]);
      const e = await generateCloud(params, KEY, deps).catch((x) => x);
      expect(e).toBeInstanceOf(GenerationError);
      expect(e.message).toMatch(/unexpected|id/i);
    }
    const { deps } = setup([new Response('not json', { status: 202 })]);
    expect(await generateCloud(params, KEY, deps).catch((x) => x)).toBeInstanceOf(GenerationError);
  });
  it('rejects audio that cannot be decoded or is silent', async () => {
    const a = setup([json(202, { id: 'a' }), audio()], { decode: () => { throw new Error('not a WAV'); } });
    const e = await generateCloud(params, KEY, a.deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.message).toMatch(/audio/i);
    const b = setup([json(202, { id: 'a' }), audio()], { decode: () => ({ channels: [new Float32Array(100)], sampleRate: 44100 }) });
    expect((await generateCloud(params, KEY, b.deps).catch((x) => x)).message).toMatch(/silent|invalid/i);
  });
  it('maps a fetch TypeError to a network message and logs it', async () => {
    const logger = createLogger({ console: null });
    const { deps } = setup([new TypeError('Failed to fetch')], { logger: logger.scope('cloud') });
    const e = await generateCloud(params, KEY, deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.code).toBe('network');
    expect(e.message).toMatch(/network/i);
    expect(e.message).toMatch(/blocked/i);
    expect(logger.entries().some((l) => l.level === 'error' && l.scope === 'cloud')).toBe(true);
  });
  it('maps a TypeError while polling too', async () => {
    const { deps } = setup([json(202, { id: 'a' }), new TypeError('Failed to fetch')]);
    expect((await generateCloud(params, KEY, deps).catch((x) => x)).code).toBe('network');
  });
  it('abort during polling stops further requests and rejects with code cancelled', async () => {
    const ctl = new AbortController();
    const { deps, calls } = setup([json(202, { id: 'a' }), json(202, { id: 'a' }), json(202, { id: 'a' }), audio()], {
      signal: ctl.signal,
      sleep: async () => { if (calls.length === 2) ctl.abort(); },
    });
    const e = await generateCloud(params, KEY, deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.code).toBe('cancelled');
    expect(calls).toHaveLength(2);
  });
  it('an already aborted signal makes no request; an aborted fetch maps to cancelled', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const a = setup([json(202, { id: 'a' })], { signal: ctl.signal });
    expect((await generateCloud(params, KEY, a.deps).catch((x) => x)).code).toBe('cancelled');
    expect(a.calls).toHaveLength(0);
    const c2 = new AbortController();
    const b = setup([], { signal: c2.signal, fetch: async () => { c2.abort(); throw new DOMException('aborted', 'AbortError'); } });
    expect((await generateCloud(params, KEY, b.deps).catch((x) => x)).code).toBe('cancelled');
  });
  it('gives up after 3 minutes', async () => {
    const stuck = Array.from({ length: 200 }, () => json(202, { id: 'a' }));
    const { deps, calls } = setup([json(202, { id: 'a' }), ...stuck]);
    const e = await generateCloud(params, KEY, deps).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError);
    expect(e.code).toBe('timeout');
    expect(e.message).toMatch(/3 minutes/);
    expect(CLOUD_DEADLINE_MS).toBe(180_000);
    expect(calls.length).toBeLessThanOrEqual(1 + CLOUD_DEADLINE_MS / CLOUD_POLL_MS);
  });
  it('never puts the key in thrown messages, details or log entries', async () => {
    const logger = createLogger({ console: null });
    const scenarios: Array<Array<Response | Error>> = [
      [new TypeError(`Failed to fetch ${KEY}`)],
      [json(403, { errors: [`token ${KEY} is not allowed`] })],
      [json(202, { id: 'a' }), json(500, { name: KEY, errors: [`Bearer ${KEY}`] })],
      [new Response(`echo ${KEY}`, { status: 500 })],
    ];
    for (const responses of scenarios) {
      const { deps } = setup(responses, { logger: logger.scope('cloud') });
      const e = (await generateCloud(params, KEY, deps).catch((x) => x)) as GenerationError;
      expect(e).toBeInstanceOf(GenerationError);
      expect(`${e.message} ${e.detail ?? ''} ${e.stack ?? ''}`).not.toContain(KEY);
      expect(`${e.message} ${e.detail ?? ''}`).not.toContain('SECRET');
    }
    const logged = JSON.stringify(logger.entries());
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('SECRET');
    expect(logged.length).toBeGreaterThan(10);
  });
});

describe('cloud audio inpainting',()=>{
 it('sends the context WAV and exact mask to the SA3 inpaint endpoint',async()=>{
  const bytes=new Uint8Array(44);const {deps,calls}=setup([json(202,{id:'context'}),audio()],{decode:()=>decoded(44100*12)});
  await generateCloud({...params,seconds:12,inpaint:{audio:new Blob([bytes],{type:'audio/wav'}),maskStart:4,maskEnd:8}},KEY,deps);
  expect(calls[0]!.url).toBe('https://api.stability.ai/v2beta/audio/stable-audio/inpaint');
  const form=calls[0]!.init.body as FormData;expect(form.get('mask_start')).toBe('4');expect(form.get('mask_end')).toBe('8');expect((form.get('audio') as Blob).size).toBe(44);expect(form.get('duration')).toBe('12');
 });
 it('rejects invalid inpaint duration and masks before spending a request',async()=>{
  for(const [seconds,start,end] of [[4,1,3],[12,8,4],[12,-1,4],[12,4,13],[12,NaN,8]]){
   const {deps,calls}=setup([]);
   await expect(generateCloud({...params,seconds:seconds!,inpaint:{audio:new Blob(['wav']),maskStart:start!,maskEnd:end!}},KEY,deps)).rejects.toThrow(/mask|6|duration/i);expect(calls).toHaveLength(0);
  }
 });
});
