import { log } from '../log';
const scope=log.scope('haptics');
interface Vibration {vibrate?:(pattern:number|number[])=>boolean}
let enabled=true;
try{enabled=localStorage.getItem('sa3.haptics')!=='off';}catch{}
export function hapticsEnabled(){return enabled;}
export function setHapticsEnabled(value:boolean){enabled=value;try{localStorage.setItem('sa3.haptics',value?'light':'off');}catch{}}
/** A tiny optional pulse: unsupported APIs never interrupt the action. */
export function pulse(device:Vibration=globalThis.navigator??{}):void {
 try{if(enabled)device.vibrate?.(3);}catch{/* Some browser/device policies deny vibration. */}
}
/** Capture physical gestures once, including controls that prevent pointer defaults. */
export function installHaptics(target:Pick<Document,'addEventListener'|'removeEventListener'>=document,device:Vibration=globalThis.navigator??{}):()=>void {
 const control=(event:Event):Element|null=>{
  const node=event.target as Element|null;
  if(typeof node?.closest!=='function')return null;
  let el=node.closest('button,input,select,textarea,a[href],summary,[role="button"],[role="slider"],[data-haptic],label');
  if(el?.tagName==='LABEL')el=(el as HTMLLabelElement).control??el;
  if(!el||el.matches(':disabled')||el.getAttribute('aria-disabled')==='true'||el.closest('[inert]'))return null;
  return el;
 };
 const pointer=(event:Event)=>{if((event as PointerEvent).button===0&&control(event))pulse(device);};
 const key=(event:Event)=>{const e=event as KeyboardEvent,el=control(event);if(e.repeat||!el)return;if(e.key==='Enter'||e.key===' '||((el.matches('input[type="radio"],input[type="range"],[role="slider"],select'))&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)))pulse(device);};
 target.addEventListener('pointerdown',pointer,{capture:true});target.addEventListener('keydown',key,{capture:true});
 scope.info('press feedback installed',{vibrationSupported:typeof device.vibrate==='function'});
 return ()=>{target.removeEventListener('pointerdown',pointer,{capture:true});target.removeEventListener('keydown',key,{capture:true});};
}
