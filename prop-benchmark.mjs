import {COMMIT,VERSION} from './src/build-info.mjs';
import {createHuntPropFixture} from './src/diagnostics/hunt-prop-fixture.mjs';

const RUN_MS=10_000;
const WARMUP_MS=1_000;
const loads=[3,9];
const canvas=document.querySelector('#scene');
const ctx=canvas.getContext('2d');
const run=document.querySelector('#run');
const save=document.querySelector('#save');
const status=document.querySelector('#status');
const image=new Image();
let report=null;

function summarize(samples){
  const sorted=samples.slice().sort((a,b)=>a-b);
  const at=q=>sorted.length?Number(sorted[Math.ceil((sorted.length-1)*q)].toFixed(2)):null;
  return {samples:sorted.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),
    maxMs:at(1),over33Ms:sorted.filter(ms=>ms>33.34).length};
}

function measure(groups,index){
  return new Promise((resolve,reject)=>{
    const fixture=createHuntPropFixture(groups,image);
    const intervals=[],cpu=[];
    let start=null,previous=null;
    const view={width:canvas.width,height:canvas.height,scale:16,camera:'hunt'};
    status.textContent='Running '+(index+1)+' of '+loads.length+' · '+groups*36+' props';
    function frame(now){
      if(document.hidden){reject(new Error('Page was hidden. Run again with it visible.'));return;}
      start??=now;
      const elapsed=now-start;
      const origin=performance.now();
      const actor={x:Math.sin(elapsed/1800)*5+groups,y:5,z:Math.cos(elapsed/2200)*3};
      view.panX=Math.round(-actor.x*16);
      view.panY=Math.round((5*.64-actor.z*.77)*16);
      ctx.fillStyle='#46543d';
      ctx.fillRect(0,0,view.width,view.height);
      fixture.objects.limitTravel(actor,'x',.08);
      fixture.objects.limitTravel(actor,'z',.08);
      fixture.paint(ctx,view,actor,()=>{
        ctx.fillStyle='#fff0af';
        ctx.fillRect(view.width/2-3,view.height/2-12,6,12);
      });
      if(elapsed>=WARMUP_MS&&previous!==null){
        intervals.push(now-previous);
        cpu.push(performance.now()-origin);
      }
      previous=now;
      if(elapsed<WARMUP_MS+RUN_MS)requestAnimationFrame(frame);
      else resolve({...fixture.objects.diagnostics,frameIntervals:summarize(intervals),
        frameCpu:summarize(cpu)});
    }
    requestAnimationFrame(frame);
  });
}

run.addEventListener('click',async()=>{
  run.disabled=save.disabled=true;
  report=null;
  canvas.width=Math.max(1,Math.round(canvas.clientWidth));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight));
  try{
    const results=[];
    for(const [index,groups] of loads.entries())results.push(await measure(groups,index));
    report={schema:'wyrmforge.world-objects-device.v1',version:VERSION,commit:COMMIT,
      userAgent:navigator.userAgent,devicePixelRatio:window.devicePixelRatio,
      canvas:{width:canvas.width,height:canvas.height},results};
    status.textContent='Done. Save report.';
    save.disabled=false;
  }catch(error){status.textContent=error.message;}
  finally{run.disabled=false;}
});

save.addEventListener('click',()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='wyrmforge-world-objects-'+COMMIT.slice(0,7)+'.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
image.addEventListener('load',()=>{
  run.disabled=false;
  status.textContent='Ready · build '+COMMIT.slice(0,7);
});
image.addEventListener('error',()=>{status.textContent='Could not load the woodland art.';});
image.src='./art/wet-forest/live-trees.png';
