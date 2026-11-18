// Actual Play Hunt directional shadow screenshot witness (software WebGL2).
// Compare the same raw Canvas overlay before/after the cosmetic-only switch.
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const folder='lighting-directional-evidence';
await mkdir(folder,{recursive:true});
const port=8151,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
const report={schema:'wyrmforge.l10-06-hunt-witness.v1',errors:[]};
let browser,failed=null;
try{
  let up=false;
  for(let i=0;i<70;i++){
    try{if((await fetch(base+'/play-hunt.html')).ok){up=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!up)throw new Error('Local Play Hunt unavailable');
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:402,height:874},
    deviceScaleFactor:1.5,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/play-hunt.html?directionalShadowTest=1',{
    waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
    const s=window.__WyrmforgeDirectionalShadowTest?.status();
    return s?.ready&&s.visibleProps>=10&&s.direction?.completed>=2&&
      s.direction.frameStamps>5;
  },null,{timeout:150000});
  // Three matched captures during a SINGLE synchronous browser evaluation.
  // No rAF can advance movement or sprite/ambient/light inputs between states.
  // A second OFF capture is a mandatory negative control for tint-cache churn.
  const snapshots=await page.evaluate(()=>{
    const api=window.__WyrmforgeDirectionalShadowTest;
    // SpriteLightingCache tints at most 65K source pixels per frame;
    // several large trees need many repaint frames before their pixels settle.
    // Validate three identical OFF captures before measuring shadow delta.
    let previous=null,stable=0,passes=0;
    for(;passes<160;passes++){
      const current=api.capture(false);
      if(current===previous)stable++;
      else stable=0;
      previous=current;
      if(stable>=3)break;
    }
    const offBefore=api.capture(false);
    const on=api.capture(true);
    const onState=api.status();
    const offAfter=api.capture(false);
    return {on,offBefore,offAfter,onState,offState:api.status(),warmPasses:passes};
  });
  const raw=async(data,name)=>{
    const bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
    await writeFile(folder+'/'+name+'.png',bytes);
    return PNG.sync.read(bytes);
  };
  report.on=snapshots.onState;
  report.off=snapshots.offState;
  const on=await raw(snapshots.on,'direction-on');
  const off=await raw(snapshots.offBefore,'direction-off');
  const offAgain=await raw(snapshots.offAfter,'direction-off-control');
  await page.screenshot({path:folder+'/game-on.png',type:'png',timeout:25000});
  if(on.width!==off.width||on.height!==off.height)throw new Error('Nonmatching canvas sizes');
  let controlDrift=0;
  for(let i=0;i<off.data.length;i+=4){
    if(Math.abs(off.data[i]-offAgain.data[i])+
        Math.abs(off.data[i+1]-offAgain.data[i+1])+
        Math.abs(off.data[i+2]-offAgain.data[i+2])+
        Math.abs(off.data[i+3]-offAgain.data[i+3])>16)controlDrift++;
  }
  report.control={offVsOffChangedPixels:controlDrift,warmPasses:snapshots.warmPasses,freeze:'same JS task, no simulation advance'};
  let changed=0,alphaChanged=0,delta=0;
  for(let i=0;i<on.data.length;i+=4){
    const diff=Math.abs(on.data[i]-off.data[i])+
      Math.abs(on.data[i+1]-off.data[i+1])+
      Math.abs(on.data[i+2]-off.data[i+2])+
      Math.abs(on.data[i+3]-off.data[i+3]);
    if(diff>16)changed++;
    if(on.data[i+3]!==off.data[i+3])alphaChanged++;
    delta+=diff;
  }
  report.visual={changed,alphaChanged,delta,canvas:[on.width,on.height],
    source:'frozen same-frame raw Canvas2D, no WebGL or HUD',controlDrift};
  console.log('DIRECTIONAL_HUNT_WITNESS '+JSON.stringify({
    on:report.on.direction,off:report.off.direction,visible:report.on.visibleProps,
    pixels:report.visual,errors:report.errors}));
  if(report.on.props!==report.off.props)throw new Error('Hunt residency changed between screenshots');
  if(report.errors.length)throw new Error('Page errors: '+report.errors.join('; ').slice(0,500));
  if(controlDrift>2)throw new Error('Witness contaminated by sprite/cache churn: '+controlDrift+' OFF/OFF pixels');
  if(changed<100)throw new Error('No visible directional canopy shadow difference');
}catch(error){
  failed=String(error.stack??error);
  report.failed=failed;console.error('DIRECTIONAL_HUNT_FAILURE '+failed);
}finally{
  await writeFile(folder+'/report.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
if(failed)process.exitCode=1;
