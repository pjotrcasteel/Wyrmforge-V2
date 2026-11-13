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
  setTerrain({elevation,exposedStone}) {
    if(this.#built || this.#terrain) throw new Error('Terrain intent already specified');
    if(typeof elevation!=='function' ||
        !Number.isFinite(exposedStone) ||
        exposedStone<0 || exposedStone>1) {
      throw new TypeError('Terrain intent needs elevation and a stone exposure threshold');
    }
    this.#terrain=Object.freeze({elevation,exposedStone});
    return this;
  }
  addRoute(id,nodes,width=2) {
    this.#checkOpen(id);
    if(!Array.isArray(nodes) || nodes.length<2 || nodes.length>10 ||
        !integer(width) || width<1 || width>3) {
      throw new RangeError('Routes need bounded nodes and width');
    }
    this.#routes.push(Object.freeze({
      id,width,nodes:Object.freeze(nodes.map(node=>this.#point(node)))
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
    if(!integer(radius) || radius<5 || radius>8) {
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
  // Only a possible buried *location*. No chest/object/reward is instantiated.
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
      discoveryCandidates:Object.freeze([...this.#discoveryCandidates])
    });
  }
}
