// Usage: node scripts/perf-probe/run.mjs  (needs `npx vite --port 5199` running; playwright-core from PLAYWRIGHT_CORE or /tmp/e2e)
import {createRequire} from 'node:module';
const require=createRequire(process.env.PW_REQUIRE_FROM??'/tmp/e2e/');
const {chromium}=require('playwright-core');
const base=process.env.URL??'http://localhost:5199';
const cases=JSON.parse(process.argv[2]??'[]');
const browser=await chromium.launch({executablePath:process.env.CHROME??`${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,headless:true,args:['--headless=new','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
for(const c of cases){
 const page=await browser.newPage();const errors=[];page.on('console',m=>{if(process.env.VERBOSE)console.log('C',m.text().slice(0,200));});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}/scripts/perf-probe/probe.html`);await page.waitForFunction(()=>window.ready);
 const r=await Promise.race([page.evaluate(c=>window.run(c),c),new Promise(r=>setTimeout(()=>r('TIMEOUT'),90000))]);console.log(JSON.stringify(r),errors.length?`ERR ${errors.slice(0,2)}`:'');await page.close();
}
await browser.close();
