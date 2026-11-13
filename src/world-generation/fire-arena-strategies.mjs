// Replaceable World Generation strategies for late Fire-tier Hunt sites.
// An encounter type chooses one of these *geographies*; corruption does not
// upgrade ordinary forest sites into boss arenas. No game/AI/VFX/voxel imports.
const FIRE_ROAD=Object.freeze({
  kind:'basalt-causeway',nominalCutFraction:0.2,material:3,cutVoxels:0
});
const p=(x,z)=>({x,z});

function arenaBase(builder,{kind,center,radius,landmark}) {
  builder.addRoute('entry-to-exit',[
    p(0,18),p(0,12),p(center.x,center.z),p(0,-12),p(0,-18)
  ],2,FIRE_ROAD);
  builder.addRoute('landmark-spur',[
    p(center.x,center.z),p(center.x+3,center.z-2),
    p(center.x+5,center.z-3)
  ],1,FIRE_ROAD);
  builder.addCombatSpace({
    id:'boss-fighting-floor',x:center.x,z:center.z,radius
  });
  builder.addClearing({
    id:'boss-clearing',x:center.x,z:center.z,radius:5
  });
  builder.addClearing({
    id:'arena-approach-clearing',x:0,z:12,radius:3
  });
  builder.addLandmark({
    id:'boss-landmark',kind:landmark,
    x:center.x+3,z:center.z-2,clearance:3
  });
  for(const [id,x,z] of [
    ['north-ingress',center.x,center.z-14],
    ['south-ingress',center.x,center.z+14],
    ['east-ingress',center.x+14,center.z],
    ['west-ingress',center.x-14,center.z]
  ]) {
    builder.addApproach({
      id,x,z,width:3,combatSpaceId:'boss-fighting-floor'
    });
  }
  builder.setDedicatedArena({
    kind,combatSpaceId:'boss-fighting-floor',
    entryKind:'authored-causeway',exitKind:'authored-causeway'
  });
}

export function createFireArenaStrategies(siteNoise) {
  if(typeof siteNoise!=='function')throw new TypeError('Arena terrain requires coherent site noise');
  const scorchedApproach=(builder,{seed})=>{
    builder.setTerrain({
      elevation(x,z) {
        const north=(18-z)/36;
        const warped=x+2.3*(siteNoise(seed,x,z,11,91)-0.5);
        const ridge=Math.max(0,Math.abs(warped)-6);
        return 5+north*5+ridge*0.65+
          2.2*(siteNoise(seed,x,z,9,92)-0.5);
      },
      exposedStone:0.24,soilDepth:1,rockFaceThreshold:2
    });
    // The approach is a traversable valley between fractured volcanic walls.
    arenaBase(builder,{
      kind:'approach-only',center:p(0,0),radius:7,
      landmark:'basalt-watch'
    });
    // This site has an ordinary horde-compatible floor, not a boss fight.
    builder.setVolcanicTerrain({stage:'approach'});
    builder.addFeature({id:'western-volcanic-wall',
      kind:'rocky-slope',x:-13,z:-6,radius:6});
    builder.addFeature({id:'eastern-volcanic-wall',
      kind:'cliff',x:13,z:-8,radius:6});
  };
  const miniBoss=(builder,{seed})=>{
    builder.setTerrain({
      elevation(x,z) {
        const r=Math.hypot(x,z);
        const arc=r>8 && r<16 ? 4.3:0;
        const broken=siteNoise(seed,x,z,7,93)*1.5;
        const spill=Math.abs(x)>12 && Math.abs(z)>12 ? 2:0;
        return 6+arc+broken+spill;
      },
      exposedStone:0.3,soilDepth:1,rockFaceThreshold:2
    });
    arenaBase(builder,{
      kind:'mini-boss',center:p(0,0),radius:7,
      landmark:'warden-dais'
    });
    builder.setVolcanicTerrain({stage:'mini-boss'});
    builder.addFeature({
      id:'broken-ring',kind:'cliff',x:-10,z:6,radius:7
    });
    builder.addFeature({
      id:'shield-wall',kind:'rocky-slope',x:10,z:-7,radius:6
    });
  };
  const wyrmLair=(builder,{seed})=>{
    builder.setTerrain({
      elevation(x,z) {
        const r=Math.hypot(x,z);
        const rim=r>9 && r<18 ? 7.2:0;
        const rise=Math.max(0,r-15)*0.6;
        const jagged=2.2*siteNoise(seed,x,z,9,94);
        return 7+rim+rise+jagged;
      },
      exposedStone:0.12,soilDepth:1,rockFaceThreshold:2
    });
    arenaBase(builder,{
      kind:'wyrm',center:p(0,0),radius:8,
      landmark:'wyrm-throne'
    });
    builder.setVolcanicTerrain({stage:'lair'});
    builder.addFeature({
      id:'caldera-rim-west',kind:'cliff',x:-13,z:0,radius:8
    });
    builder.addFeature({
      id:'caldera-rim-east',kind:'cliff',x:13,z:0,radius:8
    });
  };
  return Object.freeze([
    Object.freeze({kind:'scorched-approach',compose:scorchedApproach}),
    Object.freeze({kind:'mini-boss-arena',compose:miniBoss}),
    Object.freeze({kind:'wyrm-lair',compose:wyrmLair})
  ]);
}
