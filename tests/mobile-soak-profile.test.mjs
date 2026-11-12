import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOAK_CYCLE_MS, SOAK_ATTACK_MS, SOAK_PROFILES, describeSoakProgress
} from '../src/mobile-soak-profile.mjs';

test('V2.7 foundation soak defines independent 3-minute and 10-minute profiles', () => {
  assert.equal(SOAK_PROFILES.short.durationMs, 180_000);
  assert.equal(SOAK_PROFILES.short.resetBetweenCycles, false);
  assert.equal(SOAK_PROFILES.sustained.durationMs, 600_000);
  assert.equal(SOAK_PROFILES.sustained.resetBetweenCycles, true);
  assert.equal(SOAK_CYCLE_MS, 60_000);
  assert.equal(SOAK_ATTACK_MS, 40_000);
});

test('10-minute soak repeatedly attacks, rests and requests a single safe world reset', () => {
  const profile = SOAK_PROFILES.sustained;
  assert.deepEqual(describeSoakProgress(profile, 0, 0), {
    finished: false, cycleIndex: 0, resetDue: false, attacking: true, phaseMs: 0
  });
  assert.equal(describeSoakProgress(profile, 39_999, 0).attacking, true);
  assert.equal(describeSoakProgress(profile, 40_000, 0).attacking, false);
  assert.equal(describeSoakProgress(profile, 59_999, 0).resetDue, false);
  assert.equal(describeSoakProgress(profile, 60_000, 0).resetDue, true);
  assert.equal(describeSoakProgress(profile, 60_000, 1).resetDue, false);
  assert.equal(describeSoakProgress(profile, 99_999, 1).attacking, true);
  assert.equal(describeSoakProgress(profile, 100_000, 1).attacking, false);
  assert.equal(describeSoakProgress(profile, 599_999, 8).resetDue, true);
  assert.equal(describeSoakProgress(profile, 600_000, 9).finished, true);
  assert.equal(describeSoakProgress(profile, 600_000, 8).resetDue, false);
});

test('existing 3-minute baseline remains non-resetting even after phase boundaries', () => {
  const p = SOAK_PROFILES.short;
  for (const time of [0, 60_000, 120_000, 179_999]) {
    assert.equal(describeSoakProgress(p, time, 0).resetDue, false);
  }
  assert.equal(describeSoakProgress(p, 180_000, 0).finished, true);
});

test('soak progress rejects corrupted clock, profile and cycle inputs', () => {
  const p = SOAK_PROFILES.sustained;
  for (const elapsed of [-1, NaN, Infinity]) {
    assert.throws(() => describeSoakProgress(p, elapsed, 0), RangeError);
  }
  assert.throws(() => describeSoakProgress({ ...p }, 0, 0), RangeError);
  assert.throws(() => describeSoakProgress(p, 0, -1), RangeError);
  assert.throws(() => describeSoakProgress(p, 0, 0.5), RangeError);
});

test('lab preserves real frame and sustained samples across soak resets', () => {
  const source = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="soak-run"/);
  assert.match(source, /soakRunButton\.addEventListener\('click', \(\) => startPreset\(SOAK_PROFILES\.sustained\)\)/);
  assert.match(source, /chooseScene\(\{ preserveMeasurements: true \}\)/);
  assert.match(source, /if \(!preserveMeasurements\) \{\s*frameMetrics\.reset\(\);\s*sustainedTelemetry\.reset\(\);\s*previous = null/);
  assert.match(source, /const queuesDrained = !activeTerrainJob && pendingTerrainDirty\.size === 0 &&/);
  assert.match(source, /completedSceneResets: run\.cycleResets, expectedSceneResets/);
  assert.match(source, /document\.hidden \|\| gpuError \|\| terrainMeshMode\.value !== 'worker'/);
});

test('mobile soak report includes full-session frame and sampling continuity evidence', () => {
  const source = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(source, /frameSession:frameMetrics\.sessionSummary\(\)/);
  assert.match(source, /const frameSession = frameMetrics\.sessionSummary\(\)/);
  assert.match(source, /timingQuality: timingReviewNeeded \? 'review-gaps'/);
  assert.match(source, /sessionFrameHitchesOver50Ms: frameSession\.hitchesOver50Ms/);
  assert.match(source, /largestSamplingGapMs: telemetryContinuity\.largestSamplingGapMs/);
});
