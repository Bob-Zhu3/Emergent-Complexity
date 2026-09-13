import test from 'node:test';
import assert from 'node:assert/strict';
import { Automaton } from '../dist/lib/engine.js';
import { worldFromQuery } from '../dist/lib/launch.js';
import { patterns } from '../dist/lib/patterns.js';
import { createStartInfo, restartStartInfo, restoreStartInfo, imageDetails } from '../dist/lib/image-export.js';

function randomStart(replay) {
  return createStartInfo(replay.world, { source: 'random', seed: replay.seed, densitySetting: replay.density, startArea: replay.start });
}

test('image details distinguish whole-grid initial density from the patch setting and current density', () => {
  const replay = worldFromQuery('?rule=B3/S012345678&size=128&start=patch&density=0.5&seed=growth-demo&boundary=fixed');
  const start = randomStart(replay);
  assert.equal(start.initialPopulation, 120);
  for (let i = 0; i < 128; i++) replay.world.step();
  assert.equal(replay.world.population, 4907);
  replay.seed = 'pending-seed';
  replay.density = 0.9;
  const details = imageDetails(replay.world, start).join('\n');
  assert.match(details, /Current density: 29.95%/);
  assert.match(details, /Initial density \(whole grid\): 0.73%/);
  assert.match(details, /Density setting: 50.00% within patch/);
  assert.match(details, /Seed: "growth-demo"/);
  assert.doesNotMatch(details, /pending-seed|90.00%/);
});

test('starting details survive a snapshot round trip and resetting to the original snapshot', () => {
  const replay = worldFromQuery('?size=48&density=0.3&seed=soup-a&noise=0.001');
  const start = randomStart(replay);
  const initial = { ...replay.world.snapshot(), startInfo: start };
  for (let i = 0; i < 20; i++) replay.world.step();
  const saved = JSON.parse(JSON.stringify({ ...replay.world.snapshot(), startInfo: start }));
  const loaded = Automaton.fromSnapshot(saved);
  assert.deepEqual(restoreStartInfo(saved.startInfo, loaded), start);
  replay.world.step();
  loaded.step();
  assert.deepEqual(loaded.snapshot(), replay.world.snapshot());
  const reset = Automaton.fromSnapshot(initial);
  assert.equal(reset.generation, 0);
  assert.equal(reset.population, start.initialPopulation);
  assert.deepEqual(restoreStartInfo(initial.startInfo, reset), start);
});

test('pattern and edited starts do not claim a random seed reproduces their cells', () => {
  const pattern = worldFromQuery('?pattern=glider&seed=unused');
  const start = createStartInfo(pattern.world, { source: 'pattern', pattern: patterns[pattern.pattern].name });
  assert.match(imageDetails(pattern.world, start).join('\n'), /Start: Glider pattern\nSeed: Not used/);
  const replay = worldFromQuery('?seed=soup-a&size=48');
  const original = randomStart(replay);
  assert.deepEqual(restartStartInfo(replay.world, original), original);
  replay.world.step();
  const restarted = restartStartInfo(replay.world, original);
  assert.equal(restarted.initialPopulation, replay.world.population);
  assert.equal(restarted.densitySetting, null);
  assert.match(imageDetails(replay.world, restarted).join('\n'), /Source seed \(before edits or restart\): "soup-a"/);
  const edited = restartStartInfo(replay.world, original, 'edited');
  assert.equal(edited.source, 'edited');
  assert.equal(edited.densitySetting, null);
});

test('legacy snapshots leave unknown starting details unknown and invalid metadata is rejected', () => {
  const replay = worldFromQuery('?size=48&seed=soup-b');
  const start = randomStart(replay);
  assert.throws(() => restoreStartInfo({ ...start, initialPopulation: start.initialPopulation + 1 }, replay.world), /invalid/);
  replay.world.step();
  const loaded = Automaton.fromSnapshot(replay.world.snapshot());
  const unknown = restoreStartInfo(undefined, loaded);
  const details = imageDetails(loaded, unknown).join('\n');
  assert.match(details, /Initial density: Not recorded/);
  assert.match(details, /Seed: Not recorded/);
  for (const override of [{ seed: 'a'.repeat(101) }, { width: 12 }, { densitySetting: 2 }, { initialPopulation: -1 }, { source: 'unrecognized' }]) {
    assert.throws(() => restoreStartInfo({ ...start, ...override }, loaded), /invalid/);
  }
});
