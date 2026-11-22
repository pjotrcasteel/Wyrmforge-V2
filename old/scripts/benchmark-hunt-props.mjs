import {performance} from 'node:perf_hooks';
import {createHuntPropFixture} from '../src/diagnostics/hunt-prop-fixture.mjs';

// Full-capacity resident fixture and an expanded stress case. Use the real
// prop loading, projection, sorting and collider paths with stub Canvas
// commands. This measures desktop JS only; Play Hunt reports device timing.
const view={width:402,height:604,scale:16,camera:'hunt'};
const actor={x:0,y:5,z:0};
const image={complete:true,naturalWidth:768};
let drawCalls=0;
const ctx={save(){},restore(){},drawImage(){drawCalls++;}};
function sample(count){
  const tree=createHuntPropFixture(count,image);
  const iterations=1000,samples=[];
  let measuredDraws=0;
  for(let frame=0;frame<iterations+100;frame++){
    drawCalls=0;
    const start=performance.now();
    tree.objects.limitTravel(actor,'x',.08);
    tree.objects.limitTravel(actor,'z',.08);
    tree.paint(ctx,view,actor,()=>{});
    if(frame<100)continue;
    samples.push(performance.now()-start);
    measuredDraws+=drawCalls;
  }
  samples.sort((a,b)=>a-b);
  return {...tree.objects.diagnostics,averageDrawCommands:measuredDraws/iterations,
    p95CpuMs:samples[Math.ceil(iterations*.95)-1]};
}
console.log(JSON.stringify({environment:'Node JS, stub Canvas, no GPU or device timing',
  residentBudget:sample(3),expandedStress:sample(9)},null,2));
