import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {V2TerrainPort} from '../src/terrain-integration-port.mjs';
import {createWorldGenFluidEngine,attachWorldGenFluid} from '../src/fluid/worldgen-fluid-adapter.mjs';
import {huntFluidSurface,terrainChannelLayer} from '../src/fluid/hunt-fluid-surface.mjs';

function fixture(kind='water'){
  const world=new VoxelWorld();
  for(let z=0;z<9;z++)for(let x=0;x<9;x++){
    const floor=z===2||z===3?0:x>=4&&x<=6&&(z===5||z===6)?-2:3;
    for(let y=-4;y<floor;y++)world.set(x,y,z,y===-4?4:3);
  }
  const port=new V2TerrainPort(world,new TerrainEditLedger(world));
  const floor=[];
  for(let z=2;z<=3;z++)for(let x=0;x<9;x++)floor.push({x,z,y:0});
  const layout={
    footprint:{minX:0,maxX:8,minZ:0,maxZ:8,minY:-4,maxY:3},
    riverChannels:[{
      kind,floor,from:{x:0,z:2},to:{x:8,z:3},
      nodes:Array.from({length:9},(_,x)=>({x,z:2,y:0}))
    }]
  };
  const {fluid}=createWorldGenFluidEngine(layout,port);
  return {world,port,layout,fluid};
}
const alpha=(surface,x,z)=>{
  const index=((z-surface.origin[1])*surface.size[0]+x-surface.origin[0])*4;
  return surface.data[index+3];
};

test('the real Hunt material map consumes wet cells from the fluid engine, not the authored static footprint',()=>{
  for(const kind of ['water','lava']){
    const {world,port,layout,fluid}=fixture(kind);
    const initial=huntFluidSurface(layout,world,fluid.snapshotSurface());
    assert.equal(alpha(initial,5,3),kind==='water'?128:255);
    assert.equal(alpha(initial,5,5),0,'dry crater is absent from GPU material map');
    assert.equal(initial.count,18);

    const detach=attachWorldGenFluid(port,fluid);
    const revision=port.revision;
    const edit=port.apply({id:'game-bank-breach',type:'carve-tunnel',
      x:5,y:2,z:4,toX:5,toY:-2,toZ:4,radius:.8});
    assert.equal(edit.status,'accepted');
    assert.ok(edit.removedVoxels>0);
    assert.ok(port.revision>revision);
    assert.equal(fluid.sample(5,4).floorY,-2);

    for(let i=0;i<120;i++)fluid.step({budget:81});
    assert.ok(fluid.sample(5,5).depth>0,'Water V2 actually fills the connected crater');
    const dynamic=huntFluidSurface(layout,world,fluid.snapshotSurface());
    assert.equal(alpha(dynamic,5,5),kind==='water'?128:255,
      'newly wet crater must appear in the existing in-game material map');
    assert.equal(alpha(dynamic,2,5),0,'unconnected ground stays unpainted');
    assert.notDeepEqual(dynamic.data,initial.data);
    assert.equal(world.get(5,-3,5),3,'simulation does not own solid terrain');
    detach();
    port.dispose();
  }
});

test('fluid presentation rejects incompatible engine snapshots and never fabricates a river',()=>{
  const {world,port,layout,fluid}=fixture();
  assert.throws(()=>huntFluidSurface(layout,world,{
    ...fluid.snapshotSurface(),kind:'lava'
  }),/match the authored/);
  assert.throws(()=>huntFluidSurface(layout,world,{
    ...fluid.snapshotSurface(),bounds:{minX:-1,maxX:8,minZ:0,maxZ:8}
  }),/footprint/);
  const empty={...fluid.snapshotSurface(),cells:[]};
  assert.equal(huntFluidSurface(layout,world,empty),null);
  port.dispose();
});

test('Play Hunt runs Water V2 at fixed-step budget, feeds the shader and cleans up subscriptions',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const shader=readFileSync(new URL('../src/webgl-voxel-view.mjs',import.meta.url),'utf8');
  assert.match(host,/if\(playMode&&routePreview&&generatedSite\?\.layout\.riverChannels\?\.length\)/);
  assert.match(host,/createWorldGenFluidEngine\(generatedSite\.layout,terrain\.port\)/);
  assert.match(host,/attachWorldGenFluid\(terrain\.port,playFluid\)/);
  assert.match(host,/playFluid\.step\(\{budget:96\}\)/);
  assert.match(host,/huntFluidSurface\(generatedSite\.layout,world,state\)/);
  assert.match(host,/huntLava:terrainChannelLayer\(playLightingLiquid,playLava\)/);
  assert.match(host,/detachPlayFluid\?\.\(\)/);
  assert.match(shader,/#bindHuntLava\(huntLava\)/);
});

// Native Water V2 is drawn as true depth-tested caps; the earlier material
// map is NOT a second painted water plane on the Voxel river floor.
test('Water V2 keeps one visual water authority without removing native lava or legacy channels',()=>{
  const water=fixture('water'),lava=fixture('lava');
  const oldMaterial={size:[1,1],origin:[0,0],data:new Uint8Array(4)};
  assert.equal(terrainChannelLayer(water.fluid.snapshotSurface(),oldMaterial),null);
  assert.equal(terrainChannelLayer(lava.fluid.snapshotSurface(),oldMaterial),oldMaterial);
  assert.equal(terrainChannelLayer(null,oldMaterial),oldMaterial,
    'old Water/Lava WorldGen previews remain unchanged without native water');
  water.port.dispose();
  lava.port.dispose();
});
