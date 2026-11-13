// Late Fire-tier sites are independent geographical Strategies. Boss sites
// reserve MUCH more real terrain than regular 40m Hunt sites: the miniboss
// has 56m extent and the Wyrm a 64m irregular natural cavern.
// No Voxel, renderer, AI, shader, boss script or V1 dependency.
const FIRE_ROAD=Object.freeze({
  kind:'basalt-causeway',nominalCutFraction:0.2,material:3,cutVoxels:0
});
const p=(x,z)=>({x,z});

function authoredHub(builder,{kind,center,radius,siteRadius,landmark}) {
  const boss=kind!=='approach-only';
  const outside=siteRadius-2;
  // The entrance is a narrow natural canyon. No brown/grey causeway is
  // artificially painted across an ancient cave or the Wyrm fighting floor.
  const road=boss?null:FIRE_ROAD;
  builder.addRoute('entry-to-exit',[
    p(0,outside),p(-1,outside-9),p(center.x,center.z),
    p(1,-outside+9),p(0,-outside)
  ],2,road);
  builder.addRoute('landmark-spur',[
    p(center.x,center.z),p(center.x+3,center.z-2),
    p(center.x+5,center.z-4)
  ],1,road);
  builder.addCombatSpace({
    id:'boss-fighting-floor',x:center.x,z:center.z,radius
  });
  builder.addClearing({
    id:'boss-clearing',x:center.x,z:center.z,radius:5
  });
  builder.addClearing({
    id:'arena-approach-clearing',x:0,z:outside-6,radius:3
  });
  builder.addLandmark({
    id:'boss-landmark',kind:landmark,x:center.x+3,z:center.z-2,
    clearance:3
  });
  const flank=siteRadius-6;
  for(const [id,x,z] of [
    ['north-ingress',center.x,center.z-flank],
    ['south-ingress',center.x,center.z+flank],
    ['east-ingress',center.x+flank,center.z],
    ['west-ingress',center.x-flank,center.z]
  ])builder.addApproach({
    id,x,z,width:3,combatSpaceId:'boss-fighting-floor'
  });
  if(boss)builder.setDedicatedArena({
    kind,combatSpaceId:'boss-fighting-floor',
    entryKind:'natural-canyon',exitKind:'stone-passage'
  });
}

function addSideChambers(builder,kind) {
  // Wide, terrain-connected kiting alcoves, NOT spawned enemy arenas.
  // They preserve escape choices without subdividing the boss fight with
  // narrow corridors or fake blocked decorative objects.
  const spaces=kind==='wyrm'
    ? [
      {id:'west-alcove',kind:'sheltered-basin',x:-24,z:8,
        nodes:[p(0,0),p(-17,4),p(-24,8)]},
      {id:'east-terrace',kind:'broken-rock-terrace',x:24,z:-8,
        nodes:[p(0,0),p(18,-4),p(24,-8)]},
      {id:'southern-shelf',kind:'lava-scarred-shelf',x:8,z:24,
        nodes:[p(0,0),p(6,18),p(8,24)]}
    ]
    : [
      {id:'west-alcove',kind:'sheltered-basin',x:-20,z:8,
        nodes:[p(0,0),p(-14,3),p(-20,8)]},
      {id:'east-terrace',kind:'broken-rock-terrace',x:20,z:-8,
        nodes:[p(0,0),p(14,-3),p(20,-8)]}
    ];
  for(const chamber of spaces) {
    builder.addManeuverPocket({
      id:chamber.id,kind:chamber.kind,
      x:chamber.x,z:chamber.z,radius:5
    });
    builder.addFlowLink({
      id:chamber.id+'-approach',kind:chamber.kind,
      pocketId:chamber.id,nodes:chamber.nodes,width:3
    });
  }
}

// This is NOT a circular arena primitive. Large, coherent warped
// mountain masses enclose an asymmetrical natural rock hollow. The
// narrow entry and side chambers are carved into the *same* terrain.
// It creates gradual slopes, broken ledges and sheer outer cliffs only
// beyond the kiting floor; the shared grade/clearance rules stay in charge.
function naturalCavernElevation(seed,siteNoise,x,z,{kind}) {
  const wyrm=kind==='wyrm';
  const warpX=3.2*(siteNoise(seed,x,z,15,93)-0.5);
  const warpZ=4.4*(siteNoise(seed,x,z,18,94)-0.5);
  const r=Math.hypot((x+warpX)*0.94,(z+warpZ)*1.06);
  const irregular=3.4*(siteNoise(seed,x,z,16,95)-0.5)+
    2.2*(siteNoise(seed,x,z,23,96)-0.5);
  const southOpening=z>0 ? 2.6 : 0;
  const wallStart=(wyrm?20:16)+irregular+southOpening;
  const wallDistance=Math.max(0,r-wallStart);
  const massif=wallDistance*0.83+
    (wallDistance>4.2?3.8:0);
  const westSpine=x<-14 ? 1.5*siteNoise(seed,x,z,13,97):0;
  const northRidge=z<-12 ? 1.7*siteNoise(seed,x,z,11,98):0;
  const scree=1.6*(siteNoise(seed,x,z,9,99)-0.5);
  const base=wyrm?7.8:6;
  return base+massif+westSpine+northRidge+scree;
}

export function createFireArenaStrategies(siteNoise) {
  if(typeof siteNoise!=='function') {
    throw new TypeError('Arena terrain requires coherent site noise');
  }
  const scorchedApproach=(builder,{seed,recipe})=>{
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
    authoredHub(builder,{
      kind:'approach-only',center:p(0,0),radius:7,
      siteRadius:recipe.radius,landmark:'basalt-watch'
    });
    builder.setVolcanicTerrain({stage:'approach'});
    builder.addFeature({
      id:'western-volcanic-wall',kind:'rocky-slope',x:-13,z:-6,radius:6
    });
    builder.addFeature({
      id:'eastern-volcanic-wall',kind:'cliff',x:13,z:-8,radius:6
    });
  };
  const miniBoss=(builder,{seed,recipe})=>{
    builder.setTerrain({
      elevation:(x,z)=>naturalCavernElevation(seed,siteNoise,x,z,{
        kind:'mini-boss'
      }),
      exposedStone:0.22,soilDepth:1,rockFaceThreshold:2
    });
    authoredHub(builder,{
      kind:'mini-boss',center:p(0,0),radius:12,
      siteRadius:recipe.radius,landmark:'warden-dais'
    });
    addSideChambers(builder,'mini-boss');
    builder.setVolcanicTerrain({stage:'mini-boss'});
    builder.addFeature({
      id:'western-cave-wall',kind:'cliff',x:-21,z:-4,radius:8
    });
    builder.addFeature({
      id:'southern-cave-shelf',kind:'rocky-slope',x:17,z:13,radius:8
    });
  };
  const wyrmLair=(builder,{seed,recipe})=>{
    builder.setTerrain({
      elevation:(x,z)=>naturalCavernElevation(seed,siteNoise,x,z,{
        kind:'wyrm'
      }),
      exposedStone:0.1,soilDepth:1,rockFaceThreshold:2
    });
    authoredHub(builder,{
      kind:'wyrm',center:p(0,0),radius:16,
      siteRadius:recipe.radius,landmark:'wyrm-throne'
    });
    addSideChambers(builder,'wyrm');
    builder.setVolcanicTerrain({stage:'lair'});
    builder.addFeature({
      id:'western-cavern-massif',kind:'cliff',x:-26,z:-3,radius:9
    });
    builder.addFeature({
      id:'northern-cavern-wall',kind:'cliff',x:11,z:-25,radius:9
    });
  };
  return Object.freeze([
    Object.freeze({kind:'scorched-approach',compose:scorchedApproach}),
    Object.freeze({kind:'mini-boss-arena',compose:miniBoss}),
    Object.freeze({kind:'wyrm-lair',compose:wyrmLair})
  ]);
}
