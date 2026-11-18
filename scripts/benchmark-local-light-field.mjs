// Development witness: actual generated terrain/public port + initial live lava.
import {LocalLightField} from '../src/lighting/local-light-field.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createWorldGenFluidEngine} from '../src/fluid/worldgen-fluid-adapter.mjs';
const site=generateWorldSite(createWorldSiteRecipe({kind:'wyrm-lair',seed:7,river:'lava',corruption:1}));
const loader=new V2ExternalTerrainLoader(site.definition,{microSurfaceCapacity:2048});
while(!loader.progress.done)loader.loadStep(192);
try{
  const {port}=loader.terrain;
  const {fluid}=createWorldGenFluidEngine(site.layout,port);
  const liquid=fluid.snapshotSurface(),source=liquid.cells[Math.floor(liquid.cells.length/2)];
  const field=new LocalLightField((x,z,y)=>port.raycast({
    origin:[x,y+16,z],direction:[0,-1,0],maxDistance:32
  })?.point.y??NaN);
  const samples=[];
  for(let i=0;i<48;i++){
    const start=performance.now();
    field.update({epoch:port.epoch,revision:port.revision,
      center:{x:source.x+2,y:source.surfaceY+2,z:source.z},liquid,now:0});
    samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({scene:'seed 7 generated lair near live initial lava',
    source:{x:source.x,y:source.surfaceY,z:source.z},
    p50Ms:samples[24],p95Ms:samples[45],maxMs:samples[47],
    cpuMeshBytes:field.snapshot.data.byteLength,
    warmColumns:Array.from(field.snapshot.data).filter((n,i)=>i%4===2&&n>0).length,samples},null,2));
}finally{loader.unload();}
