// Fixed V2.6 interoperability fixture, NOT a biome generator or V1 content.
// Both a visual Pages proof and integration tests consume these same 3D runs.
import { TERRAIN_INITIALIZATION_SCHEMA } from '../external-terrain-loader.mjs';

export const EXTERNAL_SITE_BREACH = Object.freeze({
  x:0, y:6, z:0, radius:2.3
});

export function createExternalSiteFixture({chunkEdge=32,seed=7}={}) {
  const runs=[];
  // The signed 21 x 21 footprint intentionally crosses four chunk quadrants.
  // A material-stratified, flat reference floor avoids unapproved final art.
  for(let z=-10;z<=10;z++) {
    runs.push({x:-10,y:-2,z,length:21,material:3});
    runs.push({x:-10,y:-1,z,length:21,material:2});
    runs.push({x:-10,y:0,z,length:21,material:1});
  }
  // Freestanding 3D arch: player can pass UNDER the actual elevated roof.
  // All of this is authored diagnostic input to an independent terrain port.
  for(let z=-2;z<=2;z++) {
    for(let y=1;y<=5;y++) {
      runs.push({x:-4,y,z,length:1,material:3});
      runs.push({x:4,y,z,length:1,material:3});
    }
    runs.push({x:-4,y:6,z,length:9,material:3});
  }
  // A small stepped rocky outcrop on one side tests vertical material faces.
  for(let z=5;z<=7;z++) {
    runs.push({x:6,y:1,z,length:4,material:3});
    runs.push({x:7,y:2,z,length:3,material:3});
    runs.push({x:8,y:3,z,length:2,material:3});
  }
  return {
    schema:TERRAIN_INITIALIZATION_SCHEMA,
    siteId:'lab.site-arch-001',
    generatorVersion:'v2.6-diagnostic-fixture.1',
    chunkEdge,seed,runs
  };
}
