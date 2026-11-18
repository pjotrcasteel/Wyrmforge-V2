import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {buildExposedFaceMeshes} from '../src/exposed-face-mesher.mjs';
import {buildPixelMicroSurfaceMeshes} from '../src/microvoxel-mesher.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {composeCliffTaperTiles} from '../src/world-generation/cliff-taper-grammar.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';
import {createExternalTerrainCheckpoint,V2ExternalTerrainReplaySession} from '../src/external-terrain-checkpoint.mjs';
import {worldDigest} from '../src/replay-checkpoint.mjs';

const width=inset=>Array.from({length:100},(_,i)=>i%10<inset?0:10);

test('stacked cliff microcells narrow physically and meshes expose the horizontal shelves',()=>{
  const world=new VoxelWorld();
  for(let y=0;y<3;y++)world.set(0,y,0,3);
  world.setMicroSurfaceTile(0,1,0,width(2));
  world.setMicroSurfaceTile(0,2,0,width(4));
  assert.equal(world.materialAtPoint(.05,.5,.5),3);
  assert.equal(world.materialAtPoint(.05,1.5,.5),0);
  assert.equal(world.materialAtPoint(.25,1.5,.5),3);
  assert.equal(world.materialAtPoint(.25,2.5,.5),0);
  for(const [y,x] of [[.5,0],[1.5,.2],[2.5,.4]]) {
    const hit=raycastTerrain(world,{origin:[-1,y,.55],direction:[1,0,0],maxDistance:4});
    assert.ok(Math.abs(hit.point.x-x)<.00001);
  }
  assert.equal(world.intersectsPhysicalBox({x:[0,.1],y:[1.1,1.9],z:[.4,.6]}),false);
  assert.equal(world.groundContactHeight([.01,.09],[.4,.6],2.9,-3),1);
  const meshes=buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world));
  const shelf=meshes.some(m=>Array.from({length:m.faceCount},(_,f)=>f*12).some(i=>
    m.normals[i+1]===1&&Math.abs(m.positions[i+1]-2)<.0001&&m.positions[i]<.4));
  assert.equal(shelf,true,'narrowing creates real exposed ledges');
  world.set(0,2,0,0);
  assert.deepEqual([...world.microSurfaceTile(0,1,0)],width(2),'upper destruction preserves lower taper');
});

test('natural profiles vary setbacks while upper occupancy remains within lower occupancy',()=>{
  const radius=8,heights=new Int16Array(256),surfaces=new Uint8Array(256).fill(3);
  for(let z=-8;z<8;z++)for(let x=-8;x<8;x++)heights[(z+8)*16+x+8]=z<0?6:0;
  const plan={recipe:{kind:'wyrm-lair',radius,seed:7,river:'lava'},routes:[],escapeRoutes:[],flowLinks:[],combatSpaces:[],clearings:[],maneuverPockets:[],approaches:[],landmarks:[]};
  const result=composeCliffTaperTiles({plan,heights,surfaces,tiles:[]});
  const map=new Map(result.tiles.map(t=>[t.x+','+t.y+','+t.z,t]));
  const signatures=new Set();
  for(let x=-6;x<6;x++) {
    const widths=[];
    for(let y=1;y<=6;y++) {
      const tile=map.get(x+','+y+',-1');
      const levels=tile?.levels??Array(100).fill(result.voidCells.has(x+','+y+',-1')?0:10);
      widths.push(levels.filter(h=>h>0).length);
    }
    assert.equal(widths[0],100,'base remains full width');
    for(let i=1;i<widths.length;i++)assert.ok(widths[i]<=widths[i-1]);
    signatures.add(widths.join(','));
  }
  assert.ok(signatures.size>1,'setbacks must vary along the formation');
  assert.deepEqual(result,composeCliffTaperTiles({plan,heights,surfaces,tiles:[]}));
});

test('generated stacked cliff occupancy survives checkpoint JSON and replay',()=>{
  const site=generateWorldSite(createWorldSiteRecipe({kind:'wyrm-lair',river:'lava',corruption:1}));
  const loader=new V2ExternalTerrainLoader(site.definition);
  try {
    while(!loader.progress.done)loader.loadStep(4096);
    const world=loader.terrain.world;
    assert.ok(world.microSurfaceTiles().some(t=>world.get(t.x,t.y+1,t.z)!==0&&t.levels.includes(0)));
    const replay=new V2ExternalTerrainReplaySession(JSON.parse(JSON.stringify(createExternalTerrainCheckpoint(loader))));
    try {
      while(!replay.progress.done)replay.step({maxCells:4096,maxEdits:1});
      assert.equal(worldDigest(replay.terrain.world),worldDigest(world));
    } finally {replay.unload();}
    assert.doesNotThrow(()=>buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world)));
  } finally {loader.unload();}
});

test('deep taper crosses parent-voxel boundaries and rounds diagonally exposed corners',()=>{
  const radius=8,heights=new Int16Array(256),surfaces=new Uint8Array(256).fill(3);
  for(let z=-8;z<8;z++)for(let x=-8;x<8;x++)heights[(z+8)*16+x+8]=x<0&&z<0?9:0;
  const plan={recipe:{kind:'wyrm-lair',radius,seed:19,river:'lava'},routes:[],escapeRoutes:[],flowLinks:[],combatSpaces:[],clearings:[],maneuverPockets:[],approaches:[],landmarks:[]};
  const result=composeCliffTaperTiles({plan,heights,surfaces,tiles:[]});
  assert.ok(result.voidCells.size>0,'deep retreat removes entire outer parents where necessary');
  assert.ok(result.tiles.some(t=>(t.z===-2||t.x===-2)&&t.levels.some(h=>h===0)),
    'the next parent layer must also be refined');
  assert.ok([...result.voidCells].every(key=>Number(key.split(',')[1])>1),'full base stays intact');
  const corner=result.tiles.find(t=>t.x===-1&&t.z===-1&&t.y===2);
  assert.ok(corner);
  assert.ok(new Set(corner.levels).size>1,'the exposed corner is cut at microvoxel scale');
  assert.ok(result.tiles.length<=1024);
  assert.ok(result.tiles.every(t=>t.levels.some(h=>h>0)),
    'empty parents become coarse terrain cuts, not phantom solid microtiles');
});
