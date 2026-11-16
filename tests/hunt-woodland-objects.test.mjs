import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {V2TerrainPort} from '../src/terrain-integration-port.mjs';
import {TerrainEditLedger} from '../src/terrain-edit-ledger.mjs';
import {HuntTreePreview} from '../src/hunt-tree-preview.mjs';
import {HuntWoodlandDamage} from '../src/hunt-woodland-damage.mjs';
import {targetHuntFireball} from '../src/hunt-play-runtime.mjs';
import {projectVoxel} from '../src/camera-presets.mjs';
import {HuntWoodlandObjects} from '../src/hunt-woodland-objects.mjs';

test('grounded trunks stop both approaches, preserve canopy clearance and evict with the region',()=>{
  const tree={kind:'tree',id:'trunk-1',position:{x:0,y:5,z:0},scale:1,seed:7};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  const terrain={raycast:()=>({point:{y:5}})};
  objects.update(['entry'],terrain);
  const first=[...objects.regions][0][0];
  assert.ok(Math.abs(objects.limitTravel({x:-2,y:5,z:0},'x',4)-1.48999)<1e-9);
  assert.ok(Math.abs(objects.limitTravel({x:0,y:5,z:2},'z',-4)+1.48999)<1e-9);
  assert.equal(objects.limitTravel({x:-2,y:5,z:1},'x',4),4);
  assert.equal(objects.limitTravel({x:-2,y:7,z:0},'x',4),4);
  objects.update([],terrain);
  assert.equal(objects.limitTravel({x:-2,y:5,z:0},'x',4),4);
  objects.update(['entry'],terrain);
  assert.deepEqual([...objects.regions][0][0],first);
});

test('grounded logs use a long narrow footprint and fall back to rock on steep ground',()=>{
  const placements=[{kind:'boulder',id:'reserved',position:{x:0,y:5,z:0},
    scale:1,seed:0,footprint:{radius:.85}}];
  const objects=new HuntWoodlandObjects({placement:()=>({placements})});
  objects.update(['entry'],{raycast:()=>({point:{y:5}})});
  const log=[...objects.regions][0][0];
  assert.equal(log.kind,'log');
  const end=objects.limitTravel({x:-2,y:5,z:0},'x',4);
  const side=objects.limitTravel({x:0,y:5,z:-2},'z',4);
  assert.ok(end<side&&side<2);
  objects.update([],null);
  objects.update(['entry'],{raycast:({origin})=>({point:{y:origin[0]===0?5:4}})});
  assert.equal([...objects.regions][0][0].kind,'boulder');
});

test('the large oak blocks a side approach at the root base without making its canopy solid',()=>{
  const tree={kind:'tree',id:'oak',position:{x:0,y:5,z:0},scale:1,
    seed:4<<8,footprint:{radius:.46}};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  objects.update(['entry'],{raycast:()=>({point:{y:5}})});
  const [oak]=[...objects.regions][0];
  assert.match(oak.sprite.name,/^tree\.oak_l\./);
  assert.equal(oak.radius,.46);
  assert.ok(objects.limitTravel({x:-2,y:5,z:.65},'x',4)<2);
  assert.equal(objects.limitTravel({x:-2,y:5,z:.9},'x',4),4);
});

test('removing root support replaces the trunk and reconstructs the fallen log after eviction',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let z=-4;z<=4;z++)for(let x=-4;x<=4;x++){
    world.set(x,0,z,4);
    for(let y=1;y<=3;y++)world.set(x,y,z,1);
  }
  const terrain=new V2TerrainPort(world,new TerrainEditLedger(world));
  const tree={kind:'tree',id:'edited-trunk',position:{x:.5,y:4,z:.5},
    scale:1,seed:7,footprint:{radius:.46}};
  const preview=new HuntTreePreview({layout:{regions:[],links:[]},placement:()=>({placements:[tree]})},
    {complete:true,naturalWidth:1});
  const objects=preview.objects;
  preview.update(['entry'],terrain);
  assert.ok(objects.limitTravel({x:-1,y:4,z:.5},'x',3)<3);
  const huntView={camera:'hunt',width:402,height:604,scale:16};
  const target=projectVoxel(.5,5,.5,huntView);
  assert.equal(targetHuntFireball(terrain,huntView,target.x,target.y,objects)?.propId,tree.id);
  const soil=projectVoxel(2.5,4,.5,huntView);
  assert.equal(targetHuntFireball(terrain,huntView,soil.x,soil.y,objects)?.target.x,2);
  const result=terrain.apply({id:'root-crater',type:'carve-crater',x:0,y:3,z:0,radius:2.3,depth:2});
  assert.ok(result.removedVoxels>0);
  preview.terrainChanged(result.changedBounds,terrain,null,1000);
  const angles=[];
  const ctx={save(){},restore(){},translate(){},rotate(angle){angles.push(angle);},drawImage(){}};
  const view={camera:'inspection',width:400,height:400,scale:16};
  preview.paint(ctx,view,tree.position,()=>{},null,1250);
  assert.equal(angles.length,1);
  assert.ok(Math.abs(angles[0])>.3);
  preview.paint(ctx,view,tree.position,()=>{},null,1500);
  assert.equal(angles.length,1,'finished fall no longer renders the standing sprite');
  assert.equal(objects.diagnostics.treesFelled,1);
  assert.equal(objects.diagnostics.treesWithoutLanding,0);
  assert.deepEqual(objects.terrainChanged(result.changedBounds,terrain),[]);
  const [fallen]=[...objects.regions][0];
  assert.equal(fallen.id,tree.id);
  assert.equal(fallen.kind,'log');
  assert.ok(fallen.y<tree.position.y-.5);
  assert.equal(objects.limitTravel({x:-1,y:4,z:.5},'x',3),3);
  assert.ok(objects.limitTravel({x:-1,y:fallen.y,z:.5},'x',3)<3);
  objects.update([],terrain);
  objects.update(['entry'],terrain);
  assert.deepEqual([...objects.regions][0],[fallen]);
  assert.equal(objects.diagnostics.treesFelled,1);
});

test('direct tree hits preserve partial and settled damage across new object instances',()=>{
  const tree={kind:'tree',id:'tree:direct',position:{x:0,y:5,z:0},scale:1,seed:7};
  const graph={placement:()=>({placements:[tree]})};
  const terrain={raycast:()=>({point:{y:5}})};
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const load=()=>{
    const objects=new HuntWoodlandObjects(graph,new HuntWoodlandDamage(storage,'seed-7'));
    objects.update(['entry'],terrain);
    return objects;
  };
  const ray={origin:[0,6,3],direction:[0,0,-1],maxDistance:10};
  const first=load();
  assert.equal(first.raycastDamageable({...ray,maxDistance:2}),null);
  assert.equal(first.raycastDamageable(ray)?.id,tree.id);
  assert.equal(first.hitProp(tree.id,terrain).hits,1);
  const reloaded=load();
  assert.ok([...reloaded.regions][0][0].damaged);
  const felled=reloaded.hitProp(tree.id,terrain);
  assert.equal(felled.hits,2);
  assert.equal(felled.falls.length,1);
  assert.equal(reloaded.raycastDamageable(ray),null);
  assert.equal(reloaded.hitProp(tree.id,terrain),null);
  assert.equal([...load().regions][0][0].kind,'log');
});

test('boulder damage opens its collision footprint and persists across reload',()=>{
  const rock={kind:'boulder',id:'rock:direct',position:{x:0,y:5,z:0},scale:1,
    seed:1<<24,footprint:{radius:.85}};
  const graph={placement:()=>({placements:[rock]})};
  const terrain={raycast:()=>({point:{y:5}})};
  const saved=new Map();
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const load=()=>{
    const objects=new HuntWoodlandObjects(graph,new HuntWoodlandDamage(storage,'seed-7'));
    objects.update(['entry'],terrain);
    return objects;
  };
  const actor={x:0,y:5,z:2},ray={origin:[0,6,3],direction:[0,0,-1],maxDistance:10};
  const first=load();
  assert.equal(first.raycastDamageable(ray)?.kind,'boulder');
  assert.ok(first.limitTravel(actor,'z',-4)>-4);
  assert.equal(first.hitProp(rock.id,terrain)?.hits,1);
  const second=load();
  assert.equal([...second.regions][0][0].damaged,true);
  assert.equal(second.hitProp(rock.id,terrain)?.hits,2);
  assert.equal(second.limitTravel(actor,'z',-4),-4);
  assert.equal(load().raycastDamageable(ray),null);
});
