import { expect,it,vi } from 'vitest';
import { installHaptics,pulse,setHapticsEnabled } from './haptics';
it('uses a short pulse and handles unsupported or throwing APIs',()=>{
 const vibrate=vi.fn(()=>true);pulse({vibrate});expect(vibrate).toHaveBeenCalledWith(3);
 expect(()=>pulse({})).not.toThrow();expect(()=>pulse({vibrate:()=>{throw new Error('unavailable');}})).not.toThrow();
});
it('pulses once on physical press, ignores click duplication and disabled controls, and cleans up',()=>{
 const doc=new EventTarget(),vibrate=vi.fn(()=>true);
 const control={matches:()=>false,getAttribute:()=>null,closest:(selector:string)=>selector==='[inert]'?null:control,tagName:'BUTTON'};
 const send=(type:string,props:object={})=>{const e=new Event(type);Object.defineProperty(e,'target',{value:control});Object.assign(e,props);doc.dispatchEvent(e);};
 const stop=installHaptics(doc as Document,{vibrate});
 send('pointerdown',{button:0});send('click');expect(vibrate).toHaveBeenCalledTimes(1);
 send('keydown',{key:'Enter',repeat:false});expect(vibrate).toHaveBeenCalledTimes(2);
 control.matches=()=>true;send('pointerdown',{button:0});expect(vibrate).toHaveBeenCalledTimes(2);
 stop();control.matches=()=>false;send('pointerdown',{button:0});expect(vibrate).toHaveBeenCalledTimes(2);
});

it('Off suppresses presses until Light is selected',()=>{const vibrate=vi.fn(()=>true);setHapticsEnabled(false);pulse({vibrate});expect(vibrate).not.toHaveBeenCalled();setHapticsEnabled(true);pulse({vibrate});expect(vibrate).toHaveBeenCalledWith(3);});
