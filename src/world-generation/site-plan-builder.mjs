// Builder pattern: a strategy declares routes, landmark clearings and broad
// landform intent. It never writes voxels, meshes, collisions, or object art.
const IDENTIFIER=/^[a-z][a-z0-9-]{2,47}$/;
const integer=(n)=>Number.isSafeInteger(n);
const freezePoint=(point)=>Object.freeze({x:point.x,z:point.z});

export class SitePlanBuilder {
  #recipe;
  #terrain=null;
  #routes=[];
  #clearings=[];
  #landmarks=[];
  #features=[];
  #combatSpaces=[];
  #approaches=[];
  #discoveryCandidates=[];
  #escapeRoutes=[];
  #maneuverPockets=[];
  #flowLinks=[];
  #dedicatedArena=null;
  #volcanicTerrain=null;
  #ids=new Set();
  #built=false;

  constructor(recipe) {this.#recipe=recipe;}
  #checkOpen(id) {
    if(this.#built) throw new Error('Site plan has already been built');
    if(!IDENTIFIER.test(id) || this.#ids.has(id)) {
      throw new RangeError('Invalid or duplicated site feature identifier');
    }
    this.#ids.add(id);
  }
  #point(point,margin=1) {
    if(!point || !integer(point.x) || !integer(point.z) ||
        Math.abs(point.x)>this.#recipe.radius-margin ||
        Math.abs(point.z)>this.#recipe.radius-margin) {
      throw new RangeError('Site feature is outside the generation footprint');
    }
    return freezePoint(point);
  }
  setTerrain({
    elevation,exposedStone,soilDepth=2,rockFaceThreshold=null
  }) {
    if(this.#built || this.#terrain) throw new Error('Terrain intent already specified');
    if(typeof elevation!=='function' ||
        !Number.isFinite(exposedStone) ||
        exposedStone<0 || exposedStone>1 ||
        !integer(soilDepth) || soilDepth<1 || soilDepth>3 ||
        (rockFaceThreshold!==null &&
          (!integer(rockFaceThreshold) || rockFaceThreshold<2 ||
            rockFaceThreshold>6))) {
      throw new TypeError('Terrain intent needs bounded slope and geological strata');
    }
    this.#terrain=Object.freeze({
      elevation,exposedStone,soilDepth,rockFaceThreshold
    });
    return this;
  }
  addRoute(id,nodes,width=2,roadProfile=null) {
    this.#checkOpen(id);
    if(!Array.isArray(nodes) || nodes.length<2 || nodes.length>10 ||
        !integer(width) || width<1 || width>3) {
      throw new RangeError('Routes need bounded nodes and width');
    }
    // Quantized 10 cm road intent is realized by a detachable mesh-surface
    // adapter. Voxel storage remains integer, while visible surfaces need not.
    let profile=null;
    if(roadProfile!==null) {
      const {kind,nominalCutFraction,material,cutVoxels}=roadProfile;
      if(typeof kind!=='string' || !IDENTIFIER.test(kind) ||
          !Number.isFinite(nominalCutFraction) ||
          nominalCutFraction<0.1 || nominalCutFraction>0.3 ||
          ![2,3].includes(material) || cutVoxels!==0) {
        throw new RangeError('Road profile needs 0 integer cut and a 0.1-0.3 visual depth');
      }
      profile=Object.freeze({kind,nominalCutFraction,material,cutVoxels});
    }
    this.#routes.push(Object.freeze({
      id,width,nodes:Object.freeze(nodes.map(node=>this.#point(node))),
      roadProfile:profile
    }));
    return this;
  }
  addClearing({id,x,z,radius}) {
    this.#checkOpen(id);
    if(!integer(radius) || radius<2 || radius>7) {
      throw new RangeError('Invalid clearing radius');
    }
    this.#clearings.push(Object.freeze({
      id,...this.#point({x,z},radius+1),radius
    }));
    return this;
  }
  addLandmark({id,kind,x,z,clearance}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) ||
        !integer(clearance) || clearance<1 || clearance>5) {
      throw new RangeError('Invalid landmark descriptor');
    }
    this.#landmarks.push(Object.freeze({
      id,kind,...this.#point({x,z},clearance+1),clearance
    }));
    return this;
  }
  addFeature({id,kind,x,z,radius}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) || !integer(radius) ||
        radius<1 || radius>12) {
      throw new RangeError('Invalid terrain design feature');
    }
    this.#features.push(Object.freeze({
      id,kind,...this.#point({x,z}),radius
    }));
    return this;
  }
  // Encounter geometry is a World Generation promise, not an enemy spawner.
  // Combat simulation and actual spawn timing are owned by other engines.
  addCombatSpace({id,x,z,radius}) {
    this.#checkOpen(id);
    if(!integer(radius) || radius<5 || radius>16 ||
        (radius>8 && this.#recipe.radius<=20)) {
      throw new RangeError('Horde combat floor requires a bounded open radius');
    }
    this.#combatSpaces.push(Object.freeze({
      id,...this.#point({x,z},radius+2),radius
    }));
    return this;
  }
  addApproach({id,x,z,width,combatSpaceId}) {
    this.#checkOpen(id);
    if(!integer(width) || width<2 || width>4 ||
        typeof combatSpaceId!=='string' || !IDENTIFIER.test(combatSpaceId)) {
      throw new RangeError('Encounter approach needs width and combat destination');
    }
    this.#approaches.push(Object.freeze({
      id,...this.#point({x,z},width+1),width,combatSpaceId
    }));
    return this;
  }
  // A second way around the combat space. Geography owns these corridors,
  // not the enemy AI, steering system, or player controls. Both sides share
  // entry and exit anchors but have different actual terrain footprints.
  addEscapeRoute({id,side,style,nodes,width=2}) {
    this.#checkOpen(id);
    if(!['west','east'].includes(side) ||
        typeof style!=='string' || !IDENTIFIER.test(style) ||
        !Array.isArray(nodes) || nodes.length<3 || nodes.length>10 ||
        !integer(width) || width<1 || width>3) {
      throw new RangeError('Escape route needs side, style and bounded waypoints');
    }
    this.#escapeRoutes.push(Object.freeze({
      id,side,style,width,
      nodes:Object.freeze(nodes.map(point=>this.#point(point)))
    }));
    return this;
  }
  // Secondary maneuvering areas are terrain design, NOT enemy arenas.
  // Map kinds choose their geometry; Enemy/AI owns crowd pressure and spawns.
  addManeuverPocket({id,kind,x,z,radius=4}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) || !integer(radius) || radius<3 || radius>5) {
      throw new RangeError('Maneuver pocket requires a kind and bounded radius');
    }
    this.#maneuverPockets.push(Object.freeze({
      id,kind,...this.#point({x,z},radius+2),radius
    }));
    return this;
  }
  addFlowLink({id,kind,pocketId,nodes,width=2}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) || !IDENTIFIER.test(pocketId) ||
        !Array.isArray(nodes) || nodes.length<2 || nodes.length>6 ||
        !integer(width) || width<2 || width>3) {
      throw new RangeError('Circulation link needs a bounded width and waypoints');
    }
    this.#flowLinks.push(Object.freeze({
      id,kind,pocketId,width,
      nodes:Object.freeze(nodes.map(point=>this.#point(point)))
    }));
    return this;
  }
  // Only a possible buried *location*. No chest/object/reward is instantiated.
  // Encounter identity is explicit World Map intent, never inferred from
  // corruption percent. Boss AI, phases and rewards are not authored here.
  setDedicatedArena({kind,combatSpaceId,entryKind,exitKind}) {
    if(this.#built || this.#dedicatedArena ||
        !['mini-boss','wyrm'].includes(kind) ||
        ![combatSpaceId,entryKind,exitKind].every(value=>
          typeof value==='string' && IDENTIFIER.test(value))) {
      throw new TypeError('Dedicated arena requires a unique boss type and linked combat floor');
    }
    this.#dedicatedArena=Object.freeze({kind,combatSpaceId,entryKind,exitKind});
    return this;
  }
  setVolcanicTerrain({stage}) {
    if(this.#built || this.#volcanicTerrain ||
        !['approach','mini-boss','lair'].includes(stage)) {
      throw new TypeError('Volcanic geography needs a unique authored stage');
    }
    this.#volcanicTerrain=Object.freeze({stage});
    return this;
  }
  addDiscoveryCandidate({id,x,z,coverDepth=2,kind='buried-cache'}) {
    this.#checkOpen(id);
    if(!IDENTIFIER.test(kind) || !integer(coverDepth) ||
        coverDepth<2 || coverDepth>3) {
      throw new RangeError('Invalid buried discovery site');
    }
    this.#discoveryCandidates.push(Object.freeze({
      id,kind,...this.#point({x,z},2),coverDepth
    }));
    return this;
  }
  build() {
    if(this.#built) throw new Error('Site plan already built');
    this.#built=true;
    if(!this.#terrain || !this.#routes.some(route=>route.id==='entry-to-exit') ||
        this.#landmarks.length===0 || this.#clearings.length===0) {
      throw new Error('Site strategy must define landform, entry-to-exit route, and landmark');
    }
    if(this.#escapeRoutes.length>0) {
      const sides=this.#escapeRoutes.map(route=>route.side);
      if(this.#escapeRoutes.length!==2 ||
          !sides.includes('west') || !sides.includes('east')) {
        throw new Error('Escape layout requires one east and one west detour');
      }
      const [west,east]=this.#escapeRoutes;
      if(!['x','z'].every(axis=>
        west.nodes[0][axis]===east.nodes[0][axis] &&
        west.nodes.at(-1)[axis]===east.nodes.at(-1)[axis])) {
        throw new Error('Escape routes must rejoin at the same endpoints');
      }
    }
    if(this.#dedicatedArena) {
      const floor=this.#combatSpaces.find(space=>
        space.id===this.#dedicatedArena.combatSpaceId);
      if(!floor || this.#combatSpaces.length!==1 ||
          (this.#dedicatedArena.kind==='wyrm' && floor.radius!==16) ||
          (this.#dedicatedArena.kind==='mini-boss' && floor.radius!==12)) {
        throw new Error('Dedicated arena requires its own wide fighting floor');
      }
      if(this.#volcanicTerrain?.stage!==
          (this.#dedicatedArena.kind==='wyrm'?'lair':'mini-boss')) {
        throw new Error('Dedicated arena geology must match its authored boss identity');
      }
    }
    for(const pocket of this.#maneuverPockets) {
      if(this.#combatSpaces.some(space=>
        Math.hypot(space.x-pocket.x,space.z-pocket.z) <
          space.radius+pocket.radius-1)) {
        throw new Error('Maneuver pocket overlaps the central fighting floor');
      }
      const links=this.#flowLinks.filter(link=>link.pocketId===pocket.id);
      if(links.length!==1 ||
          !['x','z'].every(axis=>links[0].nodes.at(-1)[axis]===pocket[axis])) {
        throw new Error('Every maneuver pocket needs one connected flow link');
      }
    }
    for(const link of this.#flowLinks) {
      if(!this.#maneuverPockets.some(pocket=>pocket.id===link.pocketId) ||
          !this.#combatSpaces.some(space=>
            ['x','z'].every(axis=>space[axis]===link.nodes[0][axis]))) {
        throw new Error('Flow links must connect the central combat floor to a pocket');
      }
    }
    for(const approach of this.#approaches) {
      if(!this.#combatSpaces.some(space=>space.id===approach.combatSpaceId)) {
        throw new Error('Encounter approach references a missing combat space');
      }
    }
    return Object.freeze({
      recipe:this.#recipe,terrain:this.#terrain,
      routes:Object.freeze([...this.#routes]),
      clearings:Object.freeze([...this.#clearings]),
      landmarks:Object.freeze([...this.#landmarks]),
      features:Object.freeze([...this.#features]),
      combatSpaces:Object.freeze([...this.#combatSpaces]),
      approaches:Object.freeze([...this.#approaches]),
      escapeRoutes:Object.freeze([...this.#escapeRoutes]),
      maneuverPockets:Object.freeze([...this.#maneuverPockets]),
      flowLinks:Object.freeze([...this.#flowLinks]),
      discoveryCandidates:Object.freeze([...this.#discoveryCandidates]),
      dedicatedArena:this.#dedicatedArena,
      volcanicTerrain:this.#volcanicTerrain
    });
  }
}
