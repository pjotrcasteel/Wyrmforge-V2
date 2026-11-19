import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {
  createWorldGenFluidEngine,DEFAULT_LAVA_SOURCE_RATE,DEFAULT_SOURCE_RATE
} from '../src/fluid/worldgen-fluid-adapter.mjs';
import {buildFluidSurfaceMesh} from '../src/fluid/fluid-surface-mesh.mjs';
import {huntFluidSurface,terrainChannelLayer} from '../src/fluid/hunt-fluid-surface.mjs';
import {collectEmissiveSurfaceCells} from '../src/lighting/emissive-surface-cells.mjs';
import {HUNT_CHANNEL_HEIGHT_OFFSET} from '../src/hunt-lava-surface.mjs';

test('LAVA-01: real Wyrm Lair lava flows slowly on Voxel stone with native luminous meshes',()=>{
  const generated=generateWorldSite(createWorldSiteRecipe({
    kind:'wyrm-lair',seed:7,river:'lava',corruption:1,chunkEdge:32
  }));
  assert.ok(generated.layout.riverChannels?.[0]?.floor?.length>4);
  const loader=new V2ExternalTerrainLoader(generated.definition,{
    microSurfaceCapacity:2048
  });
  while(!loader.progress.done)loader.loadStep(4096);
  try{
    const {port,world}=loader.terrain;
    const seeded=createWorldGenFluidEngine(generated.layout,port);
    const {fluid}=seeded;
    assert.equal(fluid.kind,'lava');
    assert.equal(DEFAULT_LAVA_SOURCE_RATE,1);
    assert.equal(DEFAULT_SOURCE_RATE,3);
    assert.equal(seeded.inletRatePerSource,1);
    assert.ok(fluid.snapshot().sources.length>0);
    assert.ok(fluid.snapshot().sources.every(source=>source.rate===1));
    const water=new ColumnFluidEngine({
      bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
      floorAt:()=>0,kind:'water',initial:[{x:0,z:0,depth:40}]
    });
    const molten=new ColumnFluidEngine({
      bounds:{minX:0,maxX:1,minZ:0,maxZ:0},
      floorAt:()=>0,kind:'lava',initial:[{x:0,z:0,depth:40}]
    });
    water.step({budget:2});
    molten.step({budget:2});
    assert.ok(water.sample(1,0).depth>molten.sample(1,0).depth,
      'molten flow must remain more viscous than water');
    assert.equal(molten.totalDepth,40);
    const originalRevision=world.revision;
    for(let i=0;i<80;i++){
      const step=fluid.step({budget:96});
      assert.ok(step.processed<=96,'lava work fits the same frame budget');
    }
    assert.equal(world.revision,originalRevision,
      'liquid simulation never authors stone or crust blocks');
    const surface=fluid.snapshotSurface();
    const mesh=buildFluidSurfaceMesh(surface,{sampleAt:(x,z)=>fluid.sample(x,z)});
    assert.equal(surface.kind,'lava');
    assert.equal(mesh.kind,'lava');
    assert.ok(mesh.topFaces>0);
    assert.ok(mesh.vertexCount>0);
    assert.equal(mesh.vertexCount,mesh.faceCount*4);
    const bytes=mesh.positions.byteLength+mesh.normals.byteLength+
      mesh.flows.byteLength+mesh.faceModes.byteLength+
      mesh.landingHeights.byteLength+mesh.indices.byteLength;
    assert.ok(bytes<=2*1024*1024,'mobile molten surface mesh must stay bounded');
    const map=huntFluidSurface(generated.layout,world,surface);
    assert.ok(map?.count>0,'only genuinely wet authored molten cells emit light');
    assert.equal(terrainChannelLayer(surface,map),null,
      'native lava mesh cannot overlap the legacy lava paint');
    const lights=collectEmissiveSurfaceCells(map,{
      heightOffset:HUNT_CHANNEL_HEIGHT_OFFSET,energyByChannel:{255:1}
    });
    assert.ok(lights.length>0,'the native molten cells remain real light sources');
    assert.equal(terrainChannelLayer(null,map),map,
      'legacy non-fluid route materials are unaffected');
    const checkpoint=fluid.snapshot();
    const replay=createWorldGenFluidEngine(generated.layout,port).fluid;
    replay.restore(checkpoint);
    assert.deepEqual(replay.snapshot(),checkpoint,
      'lava state resumes deterministically on the same physical terrain');
  }finally{
    loader.unload();
  }
});

test('LAVA-01: molten source defaults are independent from explicit authored vent pressure',()=>{
  const world={materialAt:(_x,y,_z)=>y<0?3:0};
  const footprint={minX:0,maxX:5,minZ:0,maxZ:2,minY:-2,maxY:3};
  const channel=kind=>({
    kind,floor:Array.from({length:6},(_,x)=>({x,z:1,y:0})),
    nodes:Array.from({length:6},(_,x)=>({x,z:1,y:0})),
    from:{x:0,z:1},to:{x:5,z:1}
  });
  const layout=kind=>({footprint,riverChannels:[channel(kind)]});
  const lava=createWorldGenFluidEngine(layout('lava'),world);
  const water=createWorldGenFluidEngine(layout('water'),world);
  const authored=createWorldGenFluidEngine(layout('lava'),world,{sourceRate:2});
  assert.equal(lava.inletRatePerSource,1);
  assert.equal(water.inletRatePerSource,3);
  assert.equal(authored.inletRatePerSource,2);
  assert.deepEqual(lava.fluid.snapshot().sources.map(s=>s.rate),[1]);
  assert.deepEqual(water.fluid.snapshot().sources.map(s=>s.rate),[3]);
  assert.deepEqual(authored.fluid.snapshot().sources.map(s=>s.rate),[2]);
});
