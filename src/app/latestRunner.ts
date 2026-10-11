export interface RunnerHooks {onBusy:(busy:boolean)=>void;onError:(error:Error,value:unknown)=>void}
/** Runs async jobs one at a time; values arriving while one runs collapse to the latest. */
export function createLatestRunner<T>(job:(value:T)=>Promise<void>,hooks:RunnerHooks):(value:T)=>void {
 let running=false,queued:{value:T}|null=null;
 async function start(value:T){
  running=true;hooks.onBusy(true);
  try{await job(value);}catch(e){hooks.onError(e instanceof Error?e:new Error(String(e)),value);}
  running=false;
  const next=queued;queued=null;
  if(next)void start(next.value);else hooks.onBusy(false);
 }
 return value=>{if(running)queued={value};else void start(value);};
}
