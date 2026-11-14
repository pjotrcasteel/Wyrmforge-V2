import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';
import {V2ExternalTerrainLoader} from '../src/external-terrain-loader.mjs';

const entryRecipe={kind:'wet-forest',regionId:'starter-region',siteId:'preview-wet-forest',
  encounterId:'preview-001',chunkEdge:32};
const graphFor=(seed,worldRevision=0)=>generateAuthoredHuntTerrainGraph(
  generateWorldSite(createWorldSiteRecipe({...entryRecipe,seed,worldRevision})));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ground=(port,x,z)=>port.raycast({origin:[x,30,z],direction:[0,-1,0],maxDistance:40});

test('placement regenerates independently of traversal order and changes with seed/revision',()=>{
  const snapshots=[7,8,19].map(seed=>{
    const graph=graphFor(seed),regenerated=graphFor(seed);
    const ids=graph.layout.regions.map(region=>region.id);
    const dossiers=ids.map(id=>graph.placement(id));
    for(const id of ids.reverse()){
      const expected=dossiers.find(item=>item.regionId===id);
      assert.deepEqual(regenerated.placement(id),expected);
    }
    const positions=dossiers.flatMap(item=>item.placements.map(p=>p.position));
    const revised=graphFor(seed,1);
    assert.notDeepEqual(dossiers[0].seed,revised.placement(dossiers[0].regionId).seed);
    return positions;
  });
  assert.notDeepEqual(snapshots[0],snapshots[1]);
  assert.notDeepEqual(snapshots[1],snapshots[2]);
});

test('clustered tree and boulder descriptors fit real land, preserve routes and avoid overlaps',()=>{
  for(const seed of [7,8,19]){
    const graph=graphFor(seed),ids=new Set(),kinds=new Set();
    for(const region of graph.layout.regions){
      const id=region.id;
      const {placements}=graph.placement(id);
      assert.ok(placements.length<=24);
      if(!placements.length)continue;
      const recipe=createWorldSiteRecipe(id===graph.layout.entryRegionId?{...entryRecipe,seed}:{
        ...entryRecipe,seed,regionId:id,siteId:'preview-'+id,huntRole:region.role,
        lateralPorts:region.ports.map(port=>port.direction).filter(d=>d==='west'||d==='east')});
      const {layout}=generateWorldSite(recipe);
      const loader=new V2ExternalTerrainLoader(graph.region(id).definition);
      try{
        while(!loader.progress.done)loader.loadStep(4096);
        const {port}=loader.terrain;
        for(const [i,placement] of placements.entries()){
          const {position,footprint,kind}=placement;
          assert.equal(ids.has(placement.id),false);
          ids.add(placement.id);
          kinds.add(kind);
          assert.equal(placement.material,kind==='tree'?'wood':'stone');
          assert.ok(placements.some(peer=>peer!==placement&&peer.clusterId===placement.clusterId&&
            peer.kind===kind&&distance(peer.position,position)<=Math.hypot(8,8)));
          for(const peer of placements.slice(0,i)){
            assert.ok(distance(position,peer.position)>=footprint.radius+peer.footprint.radius+1);
          }
          const blocked=[...layout.combatSpaces,...layout.clearings,...layout.maneuverPockets,
            ...layout.roadGrades.centers.map(p=>({...p,radius:2})),
            layout.features.find(p=>p.id==='wetland')];
          for(const area of blocked){
            assert.ok(distance(position,{x:area.x+region.offsetX+.5,z:area.z+region.offsetZ+.5})>=
              area.radius+footprint.radius);
          }
          for(const opportunity of region.opportunities){
            assert.ok(distance(position,opportunity.at)>=3+footprint.radius);
          }
          assert.ok(Math.abs(ground(port,position.x,position.z).point.y-position.y)<.001);
          const edge=footprint.radius+.5;
          const heights=[];
          for(let z=Math.floor(position.z-edge);z<=Math.floor(position.z+edge);z++){
            for(let x=Math.floor(position.x-edge);x<=Math.floor(position.x+edge);x++){
              const hit=ground(port,x+.5,z+.5);
              assert.ok(hit,'footprint extends into missing terrain');
              heights.push(hit.point.y);
            }
          }
          assert.ok(Math.max(...heights)-Math.min(...heights)<=.5001);
        }
      }finally{loader.unload();}
    }
    assert.deepEqual(kinds,new Set(['tree','boulder']));
  }
});
