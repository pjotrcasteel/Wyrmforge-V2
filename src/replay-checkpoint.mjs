// Standalone V2 replay checkpoint. No imported V1 data, browser storage,
// renderer state or GPU geometry. Deterministic lab scenarios are regenerated
// from their V2 generator and bounded edit journal, including partial damage.
import { createScene, SCENE_GENERATOR_VERSION, MAX_SCENE_SEED } from './voxel-world.mjs';
import { TerrainEditLedger, MAX_RECORDED_EDITS } from './terrain-edit-ledger.mjs';

export const REPLAY_CHECKPOINT_SCHEMA = 'voxel-v2.replay-checkpoint.v1';
const DIGEST_PATTERN = /^[0-9a-f]{16}$/;

// Two independent 32-bit deterministic non-cryptographic fingerprints, based
// on byte streams with explicit field boundaries. They detect accidental
// corruption and mismatched replay, not adversarial tampering.
function digest(append) {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  function byte(v) {
    a = Math.imul(a ^ v, 0x01000193) >>> 0;
    b = Math.imul(b ^ v, 0x85ebca6b) >>> 0;
  }
  function token(value) {
    const s = String(value);
    for (let i = 0; i < s.length; i++) {
      byte(s.charCodeAt(i) & 255);
      byte(s.charCodeAt(i) >>> 8);
    }
    byte(255);
  }
  append({ byte, token });
  return a.toString(16).padStart(8,'0') + b.toString(16).padStart(8,'0');
}

export function worldDigest(world) {
  if (!world || typeof world.snapshots !== 'function' ||
      ![16,32].includes(world.chunkEdge) || !Number.isSafeInteger(world.revision)) {
    throw new TypeError('Expected V2 authoritative voxel world');
  }
  const chunks = world.snapshots();
  return digest(({byte,token}) => {
    token('voxel-v2-world-v1');
    token(world.chunkEdge);
    token(world.revision);
    token(chunks.length);
    for (const chunk of chunks) {
      if (!(chunk.data instanceof Uint8Array) ||
          chunk.data.length !== world.chunkEdge ** 3) {
        throw new TypeError('Invalid checkpoint voxel chunk');
      }
      token(chunk.id);
      token(chunk.revision);
      token(chunk.data.length);
      for (let i = 0; i < chunk.data.length; i++) byte(chunk.data[i]);
      byte(254);
    }
  });
}

export function damageDigest(ledger) {
  if (!ledger || typeof ledger.exportDamage !== 'function') {
    throw new TypeError('Expected V2 damage ledger');
  }
  const entries = ledger.exportDamage();
  return digest(({token}) => {
    token('voxel-v2-partial-damage-v1');
    token(ledger.editRevision);
    token(entries.length);
    for (const row of entries) {
      token(row.position);
      token(row.material);
      token(row.amount);
    }
  });
}

// Versioned, non-cryptographic checksum for portable V2 data contracts.
// Detects accidental changes; never use as authentication or a trust boundary.
export function replayDataDigest(value) {
  return digest(({token}) => token(JSON.stringify(value)));
}

function journalDigest(journal) {
  return replayDataDigest(journal);
}

export function createReplayCheckpoint({ scene, seed, world, ledger }) {
  if (!['flat','hill','cliff','arch'].includes(scene) ||
      !Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SCENE_SEED ||
      !world || ![16,32].includes(world.chunkEdge) ||
      !ledger || typeof ledger.exportJournal !== 'function') {
    throw new TypeError('Expected valid V2 scene, seed, world and edit ledger');
  }
  const journal = ledger.exportJournal();
  if (journal.schema !== 'voxel-v2.terrain-journal.v1' ||
      journal.commands.length > MAX_RECORDED_EDITS ||
      journal.editRevision !== journal.commands.length) {
    throw new Error('Invalid or incomplete V2 terrain journal');
  }
  return {
    schema: REPLAY_CHECKPOINT_SCHEMA,
    source: { scene, seed, chunkEdge: world.chunkEdge,
      sceneGenerator: SCENE_GENERATOR_VERSION },
    worldRevision: world.revision,
    editRevision: ledger.editRevision,
    pendingDamageCells: ledger.pendingDamageCells,
    journal,
    checksums: {
      world: worldDigest(world),
      damage: damageDigest(ledger),
      journal: journalDigest(journal)
    }
  };
}

export function restoreReplayCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.schema !== REPLAY_CHECKPOINT_SCHEMA ||
      !checkpoint.source ||
      !['flat','hill','cliff','arch'].includes(checkpoint.source.scene) ||
      !Number.isSafeInteger(checkpoint.source.seed) ||
      checkpoint.source.seed < 0 || checkpoint.source.seed > MAX_SCENE_SEED ||
      ![16,32].includes(checkpoint.source.chunkEdge) ||
      checkpoint.source.sceneGenerator !== SCENE_GENERATOR_VERSION ||
      !checkpoint.journal || checkpoint.journal.schema !== 'voxel-v2.terrain-journal.v1' ||
      !Array.isArray(checkpoint.journal.commands) ||
      checkpoint.journal.commands.length > MAX_RECORDED_EDITS ||
      !Number.isSafeInteger(checkpoint.editRevision) ||
      checkpoint.editRevision < 0 ||
      checkpoint.editRevision !== checkpoint.journal.commands.length ||
      checkpoint.journal.editRevision !== checkpoint.editRevision ||
      !Number.isSafeInteger(checkpoint.worldRevision) || checkpoint.worldRevision < 0 ||
      !Number.isSafeInteger(checkpoint.pendingDamageCells) ||
      checkpoint.pendingDamageCells < 0 ||
      !checkpoint.checksums ||
      ![checkpoint.checksums.world,checkpoint.checksums.damage,
        checkpoint.checksums.journal].every(value =>
          typeof value === 'string' && DIGEST_PATTERN.test(value))) {
    throw new TypeError('Unsupported or corrupt V2 replay checkpoint');
  }
  if (journalDigest(checkpoint.journal) !== checkpoint.checksums.journal) {
    throw new Error('V2 replay checkpoint command journal checksum mismatch');
  }
  const { scene, seed, chunkEdge } = checkpoint.source;
  const world = createScene(scene,seed,{chunkEdge});
  const ledger = new TerrainEditLedger(world);
  for (const command of checkpoint.journal.commands) {
    const result = ledger.apply(command);
    if (result.status !== 'accepted') {
      throw new Error('V2 replay rejected a non-unique edit');
    }
  }
  if (world.revision !== checkpoint.worldRevision ||
      ledger.editRevision !== checkpoint.editRevision ||
      ledger.pendingDamageCells !== checkpoint.pendingDamageCells ||
      worldDigest(world) !== checkpoint.checksums.world ||
      damageDigest(ledger) !== checkpoint.checksums.damage) {
    throw new Error('V2 replay mismatch: terrain or accumulated damage differs');
  }
  return { world, ledger, source: { scene,seed,chunkEdge } };
}
