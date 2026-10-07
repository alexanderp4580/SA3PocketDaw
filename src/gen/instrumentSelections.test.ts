import { describe,expect,it } from 'vitest';
import { instrumentDefaults, instrumentDescription, instrumentPrompt } from './instrumentSelections';
import { buildPrompt } from './prompt';

describe('instrument selections',()=>{
 for(const id of ['synth','pad','piano','guitar','bass','bell'] as const){
  it(`${id} has a useful default and a single-note prompt`,()=>{
   const s=instrumentDefaults(id),text=instrumentPrompt(s,'medium');
   expect(text).toContain('TrackType: Instrument');expect(text).toContain('single');expect(text).toContain('no chords');
   expect(s.behavior).toBe(['piano','guitar','bell'].includes(id)?'decay':'sustain');
  });
  for(const behavior of ['sustain','decay'] as const)it(`${id} ${behavior} has no contradictory behavior`,()=>{
   const s={...instrumentDefaults(id),behavior},text=instrumentDescription(s);
   if(behavior==='sustain'){expect(text).toContain('sustain');expect(text).not.toMatch(/decay|fading|short note/);}
   else{expect(text).toContain('natural decay');expect(text).not.toMatch(/sustain|held|holding/);}
  });
 }
 it('character and attack choices actually change the final prompt',()=>{
  const s={...instrumentDefaults('piano'),character:'bright' as const,attack:'gentle' as const};
  expect(instrumentPrompt(s,'small-music')).toContain('bright');expect(instrumentPrompt(s,'small-music')).toContain('gentle attack');
  expect(instrumentPrompt(s,'small-music')).toBe(buildPrompt(instrumentDescription(s),'small-music','instrument'));
 });
});
