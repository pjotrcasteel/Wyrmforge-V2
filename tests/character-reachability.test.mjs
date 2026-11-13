import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { V2TerrainPort } from '../src/terrain-integration-port.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import {
  analyzeCharacterReachability,ACTOR_REACHABILITY_SCHEMA
} from '../src/character-reachability.mjs';

const range=(n)=>Array.from({length:n},(_,i)=>i);
function port(world) {
  return new V2TerrainPort(world,new TerrainEditLedger(world));
}
function bounds(x0=0,x1=5,z0=0,z1=5,maxY=8) {
  return {minX:x0,maxX:x1,minZ:z0,maxZ:z1,minY:-2,maxY};
}
function flatWorld() {
  const world=new VoxelWorld();
  for(const x of range(6))for(const z of range(6))world.set(x,0,z,3);
  return world;
}
function audit(world,options={}) {
  const terrain=port(world);
  try {
    return analyzeCharacterReachability({
      terrain,bounds:bounds(),start:{x:0,z:2},
      targets:[{id:'exit',x:5,z:2}],...options
    });
  } finally {terrain.dispose();}
}

test('actor-volume reachability traces a continuous 6x6 walking floor',()=>{
  const result=audit(flatWorld());
  assert.equal(result.schema,ACTOR_REACHABILITY_SCHEMA);
  assert.equal(result.totalCells,36);
  assert.equal(result.standableCells,36);
  assert.equal(result.reachableCells,36);
  assert.equal(result.safelyReachableCells,36);
  assert.equal(result.unreachableCells,0);
  assert.equal(result.targets[0].reachable,true);
  const path=result.routeTo(5,2);
  assert.ok(path.length>=6);
  assert.deepEqual([path[0].x,path[0].z],[0,2]);
  assert.deepEqual([path.at(-1).x,path.at(-1).z],[5,2]);
  assert.ok(path.every(node=>node.damage===0));
});

test('real 3m tall wall blocks route; breaking it immediately updates navigability',()=>{
  const world=flatWorld();
  for(const z of range(6))for(let y=1;y<=3;y++)world.set(2,y,z,3);
  const blocked=audit(world);
  assert.equal(blocked.targets[0].reachable,false);
  assert.equal(blocked.routeTo(5,2),null);
  assert.ok(blocked.unreachableCells>=12);
  for(const z of [2,3])for(let y=1;y<=3;y++)world.set(2,y,z,0);
  const opened=audit(world);
  assert.equal(opened.targets[0].reachable,true);
  assert.equal(opened.worldRevision,world.revision);
  assert.ok(opened.reachableCells>blocked.reachableCells);
});

test('headroom rejects sites that a 2D heightmap would incorrectly mark walkable',()=>{
  const world=flatWorld();
  world.set(3,2,2,3);
  const report=audit(world);
  const cell=report.cells.find(x=>x.x===3 && x.z===2);
  assert.equal(cell.state,'unreachable');
  assert.equal(report.routeTo(3,2),null);
  assert.equal(report.targets[0].reachable,true,
    'an alternate route around the overhang remains possible');
});

test('10cm microvoxel surface is evaluated by real collider, not a painted heightmap',()=>{
  const world=flatWorld();
  world.set(2,1,2,2);
  world.setMicroSurfaceTile(2,1,2,Array(100).fill(2));
  const reachable=audit(world);
  const step=reachable.routeTo(2,2);
  assert.ok(step);
  assert.ok(step.at(-1).y>1.18 && step.at(-1).y<1.25);
  assert.equal(step.at(-1).movement,'auto-step');
  for(let x=1;x<5;x++)for(let z=0;z<6;z++) {
    world.set(x,3,z,3);
  }
  const obstructed=audit(world);
  assert.equal(obstructed.targets[0].reachable,false,
    'real low overhead voxel headroom can sever the route');
});

test('one-way damaging drops are reachable but penalized, while impossible rises are not',()=>{
  const world=new VoxelWorld();
  for(const x of range(4))for(const z of range(3)) {
    world.set(x,0,z,3);
    if(x<=1)for(let y=1;y<=4;y++)world.set(x,y,z,3);
  }
  const region=bounds(0,3,0,2,10);
  const downward=analyzeCharacterReachability({
    terrain:port(world),bounds:region,start:{x:0,z:1},
    targets:[{id:'descent',x:3,z:1}]
  });
  assert.equal(downward.targets[0].reachable,true);
  assert.ok(downward.targets[0].damage>0);
  assert.ok(downward.damageRiskCells>0);
  const path=downward.routeTo(3,1);
  assert.ok(path.some(node=>node.movement==='damaging-drop'));
  const uphill=analyzeCharacterReachability({
    terrain:port(world),bounds:region,start:{x:3,z:1},
    targets:[{id:'summit',x:0,z:1}]
  });
  assert.equal(uphill.targets[0].reachable,false);
});

test('generated world reachability is traced from real loaded voxels, not WorldGen metadata',()=>{
  for(const kind of ['wet-forest','forest-highland','mountain-pass']) {
    for(const seed of [7,19,101,267]) {
    const generated=generateWorldSite(createWorldSiteRecipe({
      kind,seed,chunkEdge:32,
      regionId:'reachability-acceptance',
      siteId:'traversal-'+kind,
      encounterId:'traversal'
    }));
    const loader=new V2ExternalTerrainLoader(generated.definition);
    try {
      let steps=0;
      while(!loader.progress.done) {
        loader.loadStep(4096);
        if(++steps>250)throw new Error('Terrain loader stalled');
      }
      const route=generated.layout.routes.find(item=>item.id==='entry-to-exit');
      const targetPoints=[
        {id:'exit',...route.nodes.at(-1)},
        ...generated.layout.combatSpaces,
        ...generated.layout.maneuverPockets,
        ...generated.layout.landmarks
      ];
      const report=analyzeCharacterReachability({
        terrain:loader.terrain.port,bounds:generated.layout.footprint,
        start:route.nodes[0],targets:targetPoints
      });
      console.log('ACTOR-REACHABILITY-AUDIT '+JSON.stringify({
        kind,seed,worldRevision:report.worldRevision,
        standable:report.standableCells,reachable:report.reachableCells,
        safe:report.safelyReachableCells,risk:report.damageRiskCells,
        targets:report.targets.map(target=>({
          id:target.id,reachable:target.reachable,damage:target.damage
        }))
      }));
      assert.equal(report.totalCells,1600);
      assert.ok(report.standableCells>200);
      assert.ok(report.reachableCells>100,
        'the real actor must reach more than the start corner');
      assert.equal(report.worldRevision,loader.terrain.world.revision);
      assert.equal(report.targets.length,targetPoints.length);
      if(report.targets.some(target=>!target.reachable)) {
        const waypoints=route.nodes;
        const heights=waypoints.map(node=>{
          const cell=report.cells.find(c=>c.x===node.x && c.z===node.z);
          return {x:node.x,z:node.z,y:cell?.y,state:cell?.state};
        });
        const blocked=report.cells.filter(c=>c.state==='unreachable')
          .filter(c=>c.z< -10)
          .map(c=>[c.x,c.z,c.y]);
        console.log('ACTOR-ROUTE-BLOCKERS '+JSON.stringify({
          kind,seed,heights,northBlocked:blocked.slice(0,100)
        }));
      }
      assert.ok(report.targets.every(target=>target.reachable),
        kind+' seed '+seed+' stranded a required destination: '+
        report.targets.filter(target=>!target.reachable)
          .map(target=>target.id).join(', '));
      assert.ok(report.targets.every(target=>target.damage===0),
        kind+' seed '+seed+' requires damaging drops to reach an authored destination');
      const rerun=seed===7 ? analyzeCharacterReachability({
        terrain:loader.terrain.port,bounds:generated.layout.footprint,
        start:route.nodes[0],targets:targetPoints
      }) : null;
      if(rerun) {
        assert.deepEqual(report.targets,rerun.targets);
        assert.equal(report.reachableCells,rerun.reachableCells);
        assert.equal(report.damageRiskCells,rerun.damageRiskCells);
      }
    } finally {loader.unload();}
    }
  }
});

test('reachability enforces memory bounds and does not mutate terrain',()=>{
  const world=flatWorld(),terrain=port(world);
  const revision=world.revision;
  assert.throws(()=>analyzeCharacterReachability({
    terrain,bounds:bounds(0,60,0,60),start:{x:0,z:0}
  }),/budget/);
  assert.throws(()=>analyzeCharacterReachability({
    terrain,bounds:bounds(),start:{x:-1,z:0}
  }),/outside/);
  const first=analyzeCharacterReachability({
    terrain,bounds:bounds(),start:{x:0,z:0}
  });
  assert.equal(first.worldRevision,revision);
  assert.equal(world.revision,revision);
  assert.equal(first.routeTo(-1,0),null);
  terrain.dispose();
});
