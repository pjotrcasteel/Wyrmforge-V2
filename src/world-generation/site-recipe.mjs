// World Generation V2: immutable input contract. World Map owns the chosen
// site and allowed exits; this engine owns only deterministic local geography.
export const WORLD_SITE_RECIPE_SCHEMA='wyrmforge.world-site-recipe.v2';
export const WORLD_GENERATOR_VERSION='worldgen-v2.7.0';
export const WORLD_SITE_RADIUS=20;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

export function validateWorldSiteRecipe(recipe) {
  if(!recipe || typeof recipe!=='object' ||
      recipe.schema!==WORLD_SITE_RECIPE_SCHEMA) {
    throw new TypeError('Expected a versioned World Generation V2 site recipe');
  }
  for(const name of ['regionId','siteId','encounterId']) {
    if(typeof recipe[name]!=='string' || !ID.test(recipe[name])) {
      throw new TypeError('Invalid '+name+' in World Generation V2 recipe');
    }
  }
  if(typeof recipe.kind!=='string' ||
      !/^[a-z][a-z0-9-]{2,31}$/.test(recipe.kind)) {
    throw new TypeError('Invalid map kind');
  }
  if(!Number.isSafeInteger(recipe.seed) || recipe.seed<0 ||
      recipe.seed>0xffffffff ||
      !Number.isSafeInteger(recipe.worldRevision) ||
      recipe.worldRevision<0 ||
      ![16,32].includes(recipe.chunkEdge) ||
      recipe.radius!==WORLD_SITE_RADIUS) {
    throw new RangeError('Invalid seed, revision, pitch, or bounded site extent');
  }
  if(!Number.isFinite(recipe.corruption) ||
      recipe.corruption<0 || recipe.corruption>1) {
    throw new RangeError('Corruption progress must be within [0,1]');
  }
  return Object.freeze({
    schema:WORLD_SITE_RECIPE_SCHEMA,
    regionId:recipe.regionId,siteId:recipe.siteId,
    encounterId:recipe.encounterId,kind:recipe.kind,
    seed:recipe.seed,worldRevision:recipe.worldRevision,
    chunkEdge:recipe.chunkEdge,radius:recipe.radius,
    corruption:recipe.corruption
  });
}

export function createWorldSiteRecipe({
  regionId='starter-forest',siteId='site-forest-01',
  encounterId='hunt-001',kind='wet-forest',
  seed=7,worldRevision=0,chunkEdge=16,
  radius=WORLD_SITE_RADIUS,corruption=0
}={}) {
  return validateWorldSiteRecipe({
    schema:WORLD_SITE_RECIPE_SCHEMA,regionId,siteId,encounterId,kind,
    seed,worldRevision,chunkEdge,radius,corruption
  });
}
