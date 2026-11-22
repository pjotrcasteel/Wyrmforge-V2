// V2-only portable replay file transport. No browser storage and no V1 code.
// Checkpoint replays are bounded before performing any CPU work on imported data.
import { createReplayCheckpoint, restoreReplayCheckpoint } from './replay-checkpoint.mjs';

export const REPLAY_FILE_SCHEMA = 'voxel-v2.replay-file.v1';
export const MAX_REPLAY_FILE_BYTES = 256 * 1024;
export const MAX_REPLAY_FILE_EDITS = 128;

function validatePortableCheckpoint(checkpoint) {
  if (!checkpoint || !checkpoint.journal ||
      !Array.isArray(checkpoint.journal.commands)) {
    throw new TypeError('Replay file has no supported edit journal');
  }
  if (checkpoint.journal.commands.length > MAX_REPLAY_FILE_EDITS) {
    throw new RangeError('Replay file exceeds the 128-edit portable safety limit');
  }
}

export function serializeReplayFile(checkpoint) {
  validatePortableCheckpoint(checkpoint);
  // Do not export invalid or out-of-date authority; verify first.
  restoreReplayCheckpoint(checkpoint);
  const contents = JSON.stringify({ schema: REPLAY_FILE_SCHEMA, checkpoint }, null, 2);
  if (new TextEncoder().encode(contents).byteLength > MAX_REPLAY_FILE_BYTES) {
    throw new RangeError('Replay file exceeds the 256 KiB size limit');
  }
  return contents;
}

export function createReplayFile({ scene, seed, world, ledger }) {
  const checkpoint = createReplayCheckpoint({ scene, seed, world, ledger });
  return serializeReplayFile(checkpoint);
}

export function importedReplayCounters(checkpoint) {
  validatePortableCheckpoint(checkpoint);
  const counters = { nextTerrainEditId:0, nextDamageId:0, nextBurstId:0 };
  for (const command of checkpoint.journal.commands) {
    const id = command.id;
    if (typeof id !== 'string') throw new TypeError('Invalid replay command ID');
    const patterns = [
      [/^lab-hit-(\d+)$/, 'nextTerrainEditId'],
      [/^lab-damage-(\d+)$/, 'nextDamageId'],
      [/^lab-burst-(\d+)-hit-[123]$/, 'nextBurstId']
    ];
    for (const [pattern, name] of patterns) {
      const match = pattern.exec(id);
      if (match) {
        const index = Number(match[1]);
        if (!Number.isSafeInteger(index)) {
          throw new RangeError('Replay command ID counter exceeds safe limits');
        }
        counters[name] = Math.max(counters[name], index);
      }
    }
  }
  return counters;
}

export function parseReplayFile(contents) {
  if (typeof contents !== 'string') throw new TypeError('Replay file must be JSON text');
  const bytes = new TextEncoder().encode(contents).byteLength;
  if (bytes === 0 || bytes > MAX_REPLAY_FILE_BYTES) {
    throw new RangeError('Replay file is empty or larger than 256 KiB');
  }
  let file;
  try {
    file = JSON.parse(contents);
  } catch {
    throw new TypeError('Replay file contains invalid JSON');
  }
  if (!file || file.schema !== REPLAY_FILE_SCHEMA ||
      !file.checkpoint || typeof file.checkpoint !== 'object') {
    throw new TypeError('Not a supported V2 portable replay file');
  }
  validatePortableCheckpoint(file.checkpoint);
  // All parsing and authority checks happen before the lab can swap worlds.
  const restored = restoreReplayCheckpoint(file.checkpoint);
  return { checkpoint:file.checkpoint, restored,
    counters:importedReplayCounters(file.checkpoint), bytes };
}
