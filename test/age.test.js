import test from 'node:test';
import assert from 'node:assert/strict';
import { Automaton, randomCells } from '../dist/lib/engine.js';
import { patternCells } from '../dist/lib/patterns.js';
import { ageScale, ageColor } from '../dist/lib/colors.js';
import { startingCells, worldFromQuery } from '../dist/lib/launch.js';

test('still-life cells keep aging past the color limit without changing the board', () => {
  const world = new Automaton({ width: 12 });
  const start = patternCells(12, 12, 'block');
  world.setCells(start);
  for (let i = 0; i < 200; i++) world.step();
  assert.deepEqual(world.cells.slice(0, world.size), start);
  assert.deepEqual(Array.from(world.ages), Array.from(start, cell => cell ? 201 : 0));
  world.setCells(world.cells.slice(0, world.size));
  assert.equal(world.generation, 0);
  assert.equal(world.ageStartGeneration, 0);
  assert.deepEqual(Array.from(world.ages), Array.from(start));
});

test('a blinker keeps its center age and resets cells that die and return', () => {
  const world = new Automaton({ width: 9 });
  world.setCells(patternCells(9, 9, ['111'], 3, 4));
  world.step();
  assert.equal(world.ages[4 * 9 + 4], 2);
  assert.equal(world.ages[4 * 9 + 3], 0);
  assert.equal(world.ages[3 * 9 + 4], 1);
  world.step();
  assert.equal(world.ages[4 * 9 + 4], 3);
  assert.equal(world.ages[4 * 9 + 3], 1);
  assert.equal(world.ages[3 * 9 + 4], 0);
});

test('age follows the state after noise and does not consume random choices', () => {
  const world = new Automaton({ width: 8, rule: 'B012345678/S012345678', noise: 1 });
  world.setCells(new Uint8Array(64).fill(1));
  const randomState = world.random.state;
  world.step();
  assert.ok(world.ages.every(age => age === 0));
  assert.notEqual(world.random.state, randomState);
  world.noise = 0;
  const savedRandomState = world.random.state;
  world.step();
  assert.ok(world.ages.every(age => age === 1));
  assert.equal(world.random.state, savedRandomState);
});

test('snapshot saves and restores the age history along with a noisy trajectory', () => {
  const original = new Automaton({ width: 15, height: 12, noise: 0.01, noiseSeed: 'age-noise' });
  original.setCells(randomCells(15, 12, 0.4, 'age-start'));
  for (let i = 0; i < 35; i++) original.step();
  const restored = Automaton.fromSnapshot(JSON.parse(JSON.stringify(original.snapshot())));
  assert.deepEqual(restored.ages, original.ages);
  for (let i = 0; i < 30; i++) { original.step(); restored.step(); }
  assert.deepEqual(restored.snapshot(), original.snapshot());
});

test('legacy snapshots start a clearly dated age history instead of inventing earlier ages', () => {
  const original = new Automaton({ width: 12 });
  original.setCells(patternCells(12, 12, 'block'));
  for (let i = 0; i < 25; i++) original.step();
  const legacy = original.snapshot();
  delete legacy.ages;
  delete legacy.ageStartGeneration;
  const restored = Automaton.fromSnapshot(legacy);
  assert.equal(restored.generation, 25);
  assert.equal(restored.ageStartGeneration, 25);
  assert.deepEqual(Array.from(restored.ages), Array.from(restored.cells.slice(0, restored.size)));
  restored.step();
  assert.ok(restored.ages.every(age => age === 0 || age === 2));
  assert.deepEqual(Automaton.fromSnapshot(restored.snapshot()).snapshot(), restored.snapshot());
});

test('snapshots reject ages inconsistent with live cells, elapsed time, or array size', () => {
  const world = new Automaton({ width: 8 });
  world.setCells(patternCells(8, 8, 'block'));
  world.step();
  const base = world.snapshot();
  const live = world.cells.findIndex(cell => cell === 1);
  for (const [index, age] of [[0, 1], [live, 0], [live, 3], [live, -1], [live, 1.5], [live, '2'], [live, null]]) {
    const data = structuredClone(base);
    data.ages[index] = age;
    assert.throws(() => Automaton.fromSnapshot(data));
  }
  for (const change of [{ ages: [] }, { ages: null }, { ageStartGeneration: -1 }, { ageStartGeneration: 2 }, { ageStartGeneration: 0.5 }]) assert.throws(() => Automaton.fromSnapshot({ ...base, ...change }));
});

test('the fixed color key has consistent anchors and never cycles back to young colors', () => {
  assert.equal(ageColor(0), '#0d181c');
  for (const stop of ageScale) assert.equal(ageColor(stop.age), stop.color);
  assert.equal(ageColor(5000), ageScale.at(-1).color);
  assert.equal(ageColor(Number.MAX_SAFE_INTEGER), ageScale.at(-1).color);
  for (let age = 1; age <= 128; age++) assert.match(ageColor(age), /^#[0-9a-f]{6}$/);
});

test('center-patch replays share the same starting cells between different rules', () => {
  const query = '?size=128&start=patch&density=0.5&seed=growth-demo&boundary=fixed&steps=128';
  const first = worldFromQuery(`${query}&rule=B3/S012345678`);
  const second = worldFromQuery(`${query}&rule=B3/S45678`);
  assert.equal(first.start, 'patch');
  assert.equal(first.steps, 128);
  assert.deepEqual(first.world.cells, second.world.cells);
  const patch = randomCells(16, 16, 0.5, 'growth-demo');
  assert.equal(first.world.population, patch.reduce((sum, value) => sum + value, 0));
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    assert.equal(first.world.cells[y * 128 + x], x >= 56 && x < 72 && y >= 56 && y < 72 ? patch[(y - 56) * 16 + x - 56] : 0);
  }
  assert.deepEqual(startingCells(12, 8, 0.5, 'same'), randomCells(12, 8, 0.5, 'same'));
  assert.throws(() => worldFromQuery('?start=unknown'));
});
