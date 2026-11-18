// Reproduce desktop Play Hunt hangs, without asking for a user recording.
// Explicitly isolate water GPU rendering, mesh rebuilds and the real solver.
// CI uses desktop Chrome + software WebGL; these timings are NOT PC GPU fps.
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=8137,base='http://127.0.0.1:'+port;
const output=resolve('fluid-desktop-evidence');
await mkdir(output,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
const report={
  schema:'wyrmforge.fluid-desktop-diagnostics.v1',viewport:{width:1280,height:720},
  gpu:'Chromium SwiftShader (software WebGL2)',phases:[],errors:[]
};
const clampTimeout=(promise,ms,name)=>Promise.race([
  promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(name+' timed out at '+ms+'ms')),ms))
]);
let browser;
try{
  let ready=false;
  for(let i=0;i<70;i++){
    try{const response=await fetch(base+'/play-hunt.html');if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Desktop diagnostic web server not ready');
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']
  });
  const context=await browser.newContext({
    viewport:{width:1280,height:720},deviceScaleFactor:1,
    isMobile:false,hasTouch:false,reducedMotion:'no-preference'
  });
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push('page: '+error.message));
  page.on('crash',()=>report.errors.push('Chrome page process crashed'));
  page.on('console',message=>{
    if(message.type()==='error'&&!message.text().includes('404 (File not found)')){
      report.errors.push('console: '+message.text());
    }
  });
  await page.addInitScript(()=>{
    let active=false,last=null;
    let frames=[],longTasks=[];
    const tick=now=>{
      if(active&&last!==null){
        if(frames.length<4096)frames.push(now-last);
      }
      last=now;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
    try{
      new PerformanceObserver(entries=>{
        if(!active)return;
        for(const task of entries.getEntries()){
          if(longTasks.length<2000)longTasks.push(task.duration);
        }
      }).observe({entryTypes:['longtask']});
    }catch{}
    const percentile=(values,p)=>{
      if(!values.length)return null;
      const sorted=[...values].sort((a,b)=>a-b);
      return Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]*10)/10;
    };
    window.__WyrmforgeDesktopProbe={
      start(){
        frames=[];longTasks=[];last=null;active=true;
      },
      stop(){
        active=false;
        const f=[...frames],l=[...longTasks];
        return {
          frames:f.length,p50Ms:percentile(f,.50),p95Ms:percentile(f,.95),
          p99Ms:percentile(f,.99),maxFrameMs:f.length?Math.max(...f):null,
          over100Ms:f.filter(ms=>ms>100).length,
          over500Ms:f.filter(ms=>ms>500).length,
          over1000Ms:f.filter(ms=>ms>1000).length,
          longTasks:l.length,longTaskMaxMs:l.length?Math.max(...l):null
        };
      }
    };
  });
  await clampTimeout(page.goto(base+'/play-hunt.html?route=forest&stop=0&fluidTest=auto',{
    waitUntil:'domcontentloaded',timeout:60000
  }),70000,'Play Hunt navigation');
  await clampTimeout(page.waitForFunction(()=>{
    const hook=window.__WyrmforgeFluidTest;
    return Boolean(hook?.status().wetColumns>40&&!hook.status().busy);
  },null,{timeout:100000}),110000,'real Hunt startup');
  const start=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  report.start=start;
  console.log('FLUID_DESKTOP_START '+JSON.stringify(start));
  const phase=async(label,mode,hold=false,ms=8500)=>{
    await clampTimeout(page.evaluate(({mode,hold})=>{
      window.__WyrmforgeFluidTest.overlay(mode);
      window.__WyrmforgeFluidTest.hold(hold);
      window.__WyrmforgeDesktopProbe.start();
    },{mode,hold}),10000,label+' start');
    const initial=await clampTimeout(page.evaluate(()=>
      window.__WyrmforgeFluidTest.status()),10000,label+' read initial status');
    const elapsed=Date.now();
    await new Promise(done=>setTimeout(done,ms));
    const summary=await clampTimeout(page.evaluate(()=>({
      frames:window.__WyrmforgeDesktopProbe.stop(),
      status:window.__WyrmforgeFluidTest.status()
    })),12000,label+' finish');
    const after=summary.status;
    const row={
      label,mode,solverHeld:hold,wallMs:Date.now()-elapsed,
      raf:summary.frames,
      steps:after.steps-initial.steps,
      meshRebuilds:after.fluidMeshUpdates-initial.fluidMeshUpdates,
      gpuCreates:after.fluidGpuAllocations-initial.fluidGpuAllocations,
      gpuDeletes:after.fluidGpuDeletes-initial.fluidGpuDeletes,
      gpuUploads:after.fluidGpuUploads-initial.fluidGpuUploads,
      meshBytes:after.fluidMeshBytes,
      lastMeshBuildMs:after.fluidMeshBuildMs,
      lastGpuUploadMs:after.fluidGpuUploadMs,
      wetColumns:after.wetColumns,waterfallGroups:after.waterfallGroups
    };
    report.phases.push(row);
    console.log('FLUID_DESKTOP_PHASE '+JSON.stringify(row));
    return row;
  };
  await phase('baseline-rendered','on',false,12000);
  await phase('stop-water-overlay-draw','no-draw',false,10000);
  await phase('stop-water-mesh-and-draw','no-mesh',false,10000);
  await phase('resume-water-overlay','on',false,10000);
  await phase('freeze-physical-water','on',true,7000);
  // Same physical scene, same camera, compare short-interval pixel changes:
  // when physics is held, a reduced-motion waterfall ought to stay stable.
  const compare=async(mode)=>{
    await page.emulateMedia({reducedMotion:mode});
    await new Promise(done=>setTimeout(done,450));
    const rects=await page.evaluate(()=>window.__WyrmforgeFluidTest.ribbonRects());
    const before=PNG.sync.read(await clampTimeout(page.screenshot({
      path:output+'/'+mode+'-first.png',type:'png',scale:'css'
    }),18000,mode+' screenshot A'));
    await new Promise(done=>setTimeout(done,450));
    const after=PNG.sync.read(await clampTimeout(page.screenshot({
      path:output+'/'+mode+'-second.png',type:'png',scale:'css'
    }),18000,mode+' screenshot B'));
    const mask=new Uint8Array(before.width*before.height);
    for(const rect of rects){
      for(let y=Math.max(0,Math.floor(rect.top));y<Math.min(before.height,Math.ceil(rect.bottom));y++){
        for(let x=Math.max(0,Math.floor(rect.left));x<Math.min(before.width,Math.ceil(rect.right));x++){
          mask[y*before.width+x]=1;
        }
      }
    }
    let pixels=0,changed=0,totalDelta=0;
    for(let i=0;i<mask.length;i++){
      if(!mask[i])continue;
      pixels++;
      const o=i*4;
      const delta=Math.abs(before.data[o]-after.data[o])+
        Math.abs(before.data[o+1]-after.data[o+1])+
        Math.abs(before.data[o+2]-after.data[o+2]);
      if(delta>=36){changed++;totalDelta+=delta;}
    }
    return {mode,maskedPixels:pixels,changedPixels:changed,totalDelta};
  };
  report.jitter=[await compare('reduce'),await compare('no-preference')];
  console.log('FLUID_DESKTOP_JITTER '+JSON.stringify(report.jitter));
  await page.evaluate(()=>{
    window.__WyrmforgeFluidTest.hold(false);
    window.__WyrmforgeFluidTest.overlay('on');
  });
  report.end=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  if(report.errors.length)throw new Error(report.errors.join('; ').slice(0,800));
  if(report.phases.some(p=>p.raf.frames<2)){
    throw new Error('Desktop game stopped producing animation frames: '+JSON.stringify(report.phases));
  }
  console.log('FLUID_DESKTOP_PASS '+JSON.stringify({
    phases:report.phases,jitter:report.jitter
  }));
}catch(error){
  report.error=String(error?.stack??error);
  console.error('FLUID_DESKTOP_FAIL '+report.error);
}finally{
  await writeFile(output+'/desktop-profile.json',JSON.stringify(report,null,2));
  try{await clampTimeout(browser?.close(),5000,'Chrome close');}catch{}
  server.kill('SIGTERM');
}
if(report.error)process.exitCode=1;
