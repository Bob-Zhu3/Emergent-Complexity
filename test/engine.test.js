import test from 'node:test';
import assert from 'node:assert/strict';
import { Automaton, Random, parseRule, randomCells, ruleFromInteger } from '../dist/lib/engine.js';
import { patterns, patternCells } from '../dist/lib/patterns.js';
import { observe, sampleRules, matchesRegion, boundingBox, patternNoiseStudy, patternFootprint, matchesFootprint } from '../dist/lib/analysis.js';

function referenceStep(cells, width, height, rule, boundary) {
  const output = new Uint8Array(width * height);
  const { birth, survival } = parseRule(rule);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      let nx = x + dx, ny = y + dy;
      if (boundary === 'wrap') { nx = (nx + width) % width; ny = (ny + height) % height; }
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) neighbors += cells[ny * width + nx];
    }
    output[y * width + x] = Number((cells[y * width + x] ? survival : birth).includes(neighbors));
  }
  return output;
}

test('optimized simultaneous updates match an independent eight-neighbor implementation', () => {
  for (const boundary of ['wrap', 'fixed']) for (const { rule } of sampleRules('reference-test', 20)) {
    const world = new Automaton({ width: 9, height: 7, rule, boundary });
    let expected = randomCells(9, 7, 0.43, rule);
    world.setCells(expected);
    for (let g = 0; g < 15; g++) {
      expected = referenceStep(expected, 9, 7, rule, boundary);
      world.step();
      assert.deepEqual(world.cells.slice(0, world.size), expected, `${rule}, ${boundary}, generation ${g + 1}`);
      assert.equal(world.population, expected.reduce((sum, value) => sum + value, 0));
    }
  }
});

test('a block is fixed and a blinker has period two', () => {
  for (const [key, expectedPeriod] of [['block', 1], ['blinker', 2]]) {
    const run = observe({ rule: 'B3/S23', width: 20, cells: patternCells(20, 20, key), steps: 20 });
    assert.equal(run.period, expectedPeriod);
    assert.equal(run.cycleStart, 0);
  }
});

test('a glider translates one diagonal cell after four generations', () => {
  const world = new Automaton({ width: 20, boundary: 'fixed' });
  world.setCells(patternCells(20, 20, 'glider', 5, 5));
  for (let g = 0; g < 4; g++) world.step();
  assert.deepEqual(world.cells.slice(0, world.size), patternCells(20, 20, 'glider', 6, 6));
});

test('the HighLife seed makes exactly two translated copies after twelve steps', () => {
  const world = new Automaton({ width: 32, boundary: 'fixed', rule: 'B36/S23' });
  world.setCells(patternCells(32, 32, 'replicator', 12, 12));
  for (let g = 0; g < 12; g++) world.step();
  const first = patternCells(32, 32, 'replicator', 10, 10);
  const second = patternCells(32, 32, 'replicator', 14, 14);
  const expected = first.map((value, i) => value | second[i]);
  assert.deepEqual(world.cells.slice(0, world.size), expected);
  assert.equal(world.population, 24);
});

test('B0 permits birth from an empty grid and is not absorbing extinction', () => {
  const run = observe({ rule: 'B0/S', width: 8, density: 0, steps: 8 });
  assert.equal(run.label, 'periodic');
  assert.equal(run.period, 2);
  assert.equal(run.extinctAt, null);
  assert.equal(run.population[1], 64);
  assert.equal(run.population[2], 0);
});

test('fixed edges and wrapping produce different expected edge behavior', () => {
  const start = patternCells(8, 8, ['111'], 0, 0);
  const wrap = new Automaton({ width: 8, boundary: 'wrap' });
  const fixed = new Automaton({ width: 8, boundary: 'fixed' });
  wrap.setCells(start); fixed.setCells(start);
  wrap.step(); fixed.step();
  assert.equal(wrap.population, 3);
  assert.equal(fixed.population, 2);
  assert.equal(wrap.cells[57], 1);
});

test('noise is applied after the deterministic rule and can flip every cell', () => {
  const world = new Automaton({ width: 8, rule: 'B/S', noise: 1 });
  world.step();
  assert.equal(world.population, 64);
  assert.equal(world.flips, 64);
  assert.equal(world.deterministicChanges, 0);
});

test('snapshot continuation preserves the complete noisy random trajectory', () => {
  const world = new Automaton({ width: 12, height: 15, noise: 0.05, noiseSeed: 'saved' });
  world.setCells(randomCells(12, 15, 0.3, 'initial'));
  for (let g = 0; g < 13; g++) world.step();
  const restored = Automaton.fromSnapshot(JSON.parse(JSON.stringify(world.snapshot())));
  for (let g = 0; g < 30; g++) { world.step(); restored.step(); }
  assert.deepEqual(world.snapshot(), restored.snapshot());
});

test('snapshot validation rejects malformed cells, dimensions and random state', () => {
  const snapshot = new Automaton({ width: 8 }).snapshot();
  assert.throws(() => Automaton.fromSnapshot({ ...snapshot, width: 20000 }));
  assert.throws(() => Automaton.fromSnapshot({ ...snapshot, randomState: -1 }));
  assert.throws(() => Automaton.fromSnapshot({ ...snapshot, rows: ['1'] }));
  assert.throws(() => Automaton.fromSnapshot({ ...snapshot, rows: snapshot.rows.map(row => row.replace('0', '2')) }));
});

test('seeds reproduce grids and uniform sampling has 100 unique rules', () => {
  assert.deepEqual(randomCells(20, 20, 0.3, 'a'), randomCells(20, 20, 0.3, 'a'));
  assert.notDeepEqual(randomCells(20, 20, 0.3, 'a'), randomCells(20, 20, 0.3, 'b'));
  const samples = sampleRules('survey');
  assert.equal(new Set(samples.map(sample => sample.rule)).size, 100);
  assert.deepEqual(samples, sampleRules('survey'));
  assert.equal(ruleFromInteger(0), 'B/S');
  assert.equal(ruleFromInteger(262143), 'B012345678/S012345678');
});

test('rule parsing supports empty conditions and rejects out-of-range counts', () => {
  assert.equal(parseRule('b633/s322').name, 'B36/S23');
  assert.equal(parseRule('B/S').name, 'B/S');
  assert.throws(() => parseRule('B9/S23'));
  assert.throws(() => parseRule('23/3'));
  assert.throws(() => new Automaton({ noise: NaN }));
});

test('pattern fidelity ignores distant noise but checks the empty halo', () => {
  const target = patternCells(20, 20, 'block', 8, 8);
  const actual = target.slice();
  const box = boundingBox(target, 20, 20, 1);
  actual[0] = 1;
  assert.equal(matchesRegion(actual, target, 20, box), true);
  actual[7 * 20 + 8] = 1;
  assert.equal(matchesRegion(actual, target, 20, box), false);
});

test('all noise-free pattern controls remain faithful through the observation window', () => {
  for (const key of ['block', 'blinker', 'glider', 'replicator']) {
    const [result] = patternNoiseStudy(key, patterns[key].rule, { width: 64, steps: 96, trials: 2, rates: [0] });
    assert.equal(result.intact, 2);
    assert.equal(result.finalMatches, 2);
  }
});

test('the random generator has a stable reference sequence', () => {
  const random = new Random(1);
  assert.equal(random.next(), 0.6270739405881613);
  assert.equal(random.next(), 0.002735721180215478);
});

test('the fidelity footprint excludes distant empty gaps but includes immediate neighbors', () => {
  const target = new Uint8Array(400);
  target[42] = 1;
  target[357] = 1;
  const actual = target.slice();
  actual[200] = 1;
  const footprint = patternFootprint(target, 20, 20);
  assert.equal(footprint.length, 18);
  assert.equal(matchesFootprint(actual, target, footprint), true);
  actual[43] = 1;
  assert.equal(matchesFootprint(actual, target, footprint), false);
});
