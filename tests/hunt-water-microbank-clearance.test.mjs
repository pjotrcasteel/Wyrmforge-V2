// WAT-18: device rejection regression. Measure the ACTUAL 10cm dry bank
// edge against native Water V2's free-surface head, not just water volume.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph}
  from '../src/world-generation/index.mjs';
import {toVoxelTerrainDefinition} from '../src/world-generation/voxel-terrain-adapter.mjs';
import {planHuntRiverCorridor} from '../src/world-generation/hunt-river-corridor-plan.mjs';
import {prepareHuntRiverEarthwork,composeHuntRiverEarthworkGraph}
  from '../src/world-generation/hunt-river-earthwork.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {HuntStreamedFluid} from '../src/fluid/hunt-streamed-fluid.mjs';

const SIDES=Object.freeze([[1,0],[-1,0],[0,1],[0,-1]]);
const key=(x,z)=>x+','+z;
function bankEdgeHeight(tile,dx,dz){
  const heights=[];
  for(let i=0;i<10;i++){
    const ix=dx===1?9:dx===-1?0:i;
    const iz=dz===1?9:dz===-1?0:i;
    heights.push(tile.levels[iz*10+ix]);
  }
  return tile.y+Math.min(...heights)/10;
}

test('Water V2 river stays at least 10cm below physically dry micro-grass edges before and after flow',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({
    seed:7,kind:'wet-forest',river:'water',huntRole:'arrival',chunkEdge:32
  }));
  const original=generateAuthoredHuntTerrainGraph(site);
  const link=original.layout.links.find(l=>
    [l.fromId,l.toId].includes('region-entry')&&
    [l.fromId,l.toId].includes('region-woodland-trail'));
  assert.ok(link);
  const plan=planHuntRiverCorridor(original,link.id);
  const earthwork=prepareHuntRiverEarthwork(original,plan,toVoxelTerrainDefinition);
  const graph=composeHuntRiverEarthworkGraph(original,earthwork,toVoxelTerrainDefinition);
  const ids=earthwork.bands.map(b=>b.id);
  const loader=new V2ExternalTerrainLoader(graph.initialTerrain(ids),{
    microSurfaceCapacity:2048
  });
  while(!loader.progress.done)loader.loadStep(4096);
  const fluid=new HuntStreamedFluid({
    graph,terrain:loader.terrain.port,identity:'wat18-bank-clearance'
  });
  try{
    fluid.syncResident(ids);
    const checks=(label)=>{
      let inspected=0;
      const violations=[];
      for(const band of earthwork.bands){
        const wet=new Map(band.fluidLayout.riverChannels[0].floor.map(c=>
          [key(c.x,c.z),c]));
        for(const tile of band.definition.surfaceTiles??[]){
          if(wet.has(key(tile.x,tile.z)))continue;
          if((fluid.sample(tile.x,tile.z)?.depth??0)>0)continue;
          for(const [dx,dz] of SIDES){
            const channel=wet.get(key(tile.x+dx,tile.z+dz));
            if(!channel)continue;
            const water=fluid.sample(channel.x,channel.z);
            if(!water?.depth)continue;
            const bankTop=bankEdgeHeight(tile,dx,dz);
            inspected++;
            const clearance=bankTop-water.surfaceY;
            if(clearance<.09999)violations.push({
              x:tile.x,z:tile.z,waterX:channel.x,waterZ:channel.z,
              bankTop,waterHead:water.surfaceY,clearance
            });
          }
        }
      }
      assert.ok(inspected>=4,label+': representative physical micro-riverbanks required');
      assert.deepEqual(violations.slice(0,8),[],label+
        ': water must not visually overtop an intact dry grass micro-bank');
    };
    checks('initial');
    for(let i=0;i<240;i++)fluid.step({budget:96});
    checks('after 240 native steps');
  }finally{
    fluid.dispose();
    loader.unload();
  }
});
