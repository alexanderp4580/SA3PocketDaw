interface ModalOptions {close:()=>void;closable:()=>boolean;}
interface ModalEntry {node:HTMLElement;opener:HTMLElement|null;options:ModalOptions;}
const stack:ModalEntry[]=[];
const inertBefore=new Map<HTMLElement,boolean>();
const top=()=>stack[stack.length-1];
function restoreInert(){for(const [node,value] of inertBefore)node.inert=value;inertBefore.clear();}
function isolate(){
 restoreInert();let branch:HTMLElement|undefined=top()?.node;
 while(branch&&branch!==branch.ownerDocument.body){
  const parent=branch.parentElement;if(!parent)break;
  for(const sibling of parent.children){if(sibling!==branch&&sibling instanceof HTMLElement){inertBefore.set(sibling,sibling.inert);sibling.inert=true;}}
  branch=parent;
 }
}
function controls(node:HTMLElement):HTMLElement[]{
 return Array.from(node.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[inert]')&&el.getClientRects().length>0);
}
function first(entry:ModalEntry){(controls(entry.node)[0]??entry.node).focus();}
/** Makes the top sheet modal while preserving focus and any pre-existing inert state. */
export function modalFocus(node:HTMLElement,options:ModalOptions){
 const active=node.ownerDocument.activeElement;
 const entry:ModalEntry={node,options,opener:active instanceof HTMLElement?active:null};
 stack.push(entry);isolate();first(entry);
 function keydown(event:KeyboardEvent){
  if(top()!==entry)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(entry.options.closable())entry.options.close();return;}
  if(event.key!=='Tab')return;
  const items=controls(node),active=node.ownerDocument.activeElement,index=items.findIndex(el=>el===active);
  if(!items.length){event.preventDefault();node.focus();}
  else if(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===items.length-1){event.preventDefault();items[event.shiftKey?items.length-1:0]!.focus();}
 }
 function focusin(event:FocusEvent){if(top()===entry&&!node.contains(event.target as Node))first(entry);}
 node.ownerDocument.addEventListener('keydown',keydown,true);
 node.ownerDocument.addEventListener('focusin',focusin,true);
 return {update(next:ModalOptions){entry.options=next;},destroy(){
  const wasTop=top()===entry;
  node.ownerDocument.removeEventListener('keydown',keydown,true);node.ownerDocument.removeEventListener('focusin',focusin,true);
  const index=stack.indexOf(entry);if(index>=0)stack.splice(index,1);isolate();
  if(wasTop){const current=top(),opener=entry.opener;if(opener?.isConnected&&!opener.closest('[inert]')&&(!current||current.node.contains(opener)))opener.focus();else if(current)first(current);}
 }};
}
