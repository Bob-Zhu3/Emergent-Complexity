import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Automaton } from '../dist/lib/engine.js';
import { labels, mean, sampleRules, patternNoiseStudy } from '../dist/lib/analysis.js';
import { worldFromQuery, replayURL } from '../dist/lib/launch.js';

const read = async name => JSON.parse(await readFile(new URL(`../dist/data/${name}.json`, import.meta.url), 'utf8'));

test('the committed survey contains the specified 100 rules and all 600 complete trajectories', async () => {
  const survey = await read('survey');
  assert.deepEqual(survey.rules.map(({ index, integer, rule }) => ({ index, integer, rule })), sampleRules(survey.config.ruleSeed));
  for (const result of survey.rules) {
    assert.equal(result.runs.length, 6);
    for (const label of labels) assert.equal(result.counts[label], result.runs.filter(run => run.label === label).length);
    for (const run of result.runs) {
      assert.equal(run.population.length, 301);
      assert.equal(run.changes.length, 301);
      assert.equal(run.flips.length, 301);
      assert.ok(run.population.every(value => Number.isInteger(value) && value >= 0 && value <= 2304));
      assert.equal(run.finalPopulation, run.population.at(-1));
      assert.equal(run.tailActivity, mean(run.changes.slice(-60)) / 2304);
      assert.equal(run.finalDensity, run.finalPopulation / 2304);
    }
  }
});

test('replay links recreate the recorded survey populations and exact current snapshots', async () => {
  const survey = await read('survey');
  const selected = survey.rules.find(result => result.rule === survey.selectedRule);
  for (const run of selected.runs) {
    const { world, steps } = worldFromQuery(new URL(replayURL(run, run.steps), 'https://example.test/').search);
    assert.equal(world.population, run.initialPopulation);
    for (let g = 1; g <= steps; g++) {
      world.step();
      assert.equal(world.population, run.population[g]);
      assert.equal(world.changes, run.changes[g]);
    }
    assert.deepEqual(Automaton.fromSnapshot(world.snapshot()).snapshot(), world.snapshot());
  }
});

test('the selected rule repeats after the recorded longer periods on both finite boundaries', async () => {
  const detail = await read('detail');
  for (const boundary of ['wrap', 'fixed']) {
    const run = detail.runs.find(run => run.seed === 'detail-c' && run.density === 0.1 && run.boundary === boundary);
    assert.equal(run.label, 'periodic');
    const { world } = worldFromQuery(new URL(replayURL(run), 'https://example.test/').search);
    for (let g = 0; g < run.steps; g++) world.step();
    const before = world.cells.slice();
    for (let g = 0; g < run.period; g++) world.step();
    assert.deepEqual(world.cells, before);
  }
});

test('stored noisy pattern trials match a fresh calculation', async () => {
  const data = await read('noise');
  const stored = data.results.find(result => result.pattern === 'glider' && result.noise === 0.0005);
  const [fresh] = patternNoiseStudy('glider', 'B3/S23', { ...data.config, trials: 3, rates: [0.0005] });
  assert.deepEqual(fresh.runs, stored.runs.slice(0, 3));
  assert.equal(fresh.footprintExposure, stored.footprintExposure);
  for (const result of data.results) {
    assert.equal(result.survival[0], result.trials);
    assert.equal(result.survival.at(-1), result.intact);
    assert.ok(result.survival.every((count, i) => i === 0 || count <= result.survival[i - 1]));
    assert.ok(result.finalMatches >= result.intact);
  }
});

test('the study manifest and CSV exports agree with all recorded run counts', async () => {
  const [manifest, survey, density, detail, noise, soup] = await Promise.all(['manifest', 'survey', 'density', 'detail', 'noise', 'soup-noise'].map(read));
  const actual = { survey: survey.rules.flatMap(rule => rule.runs).length, density: density.runs.length, detail: detail.runs.length, patternNoise: noise.results.flatMap(result => result.runs).length, soupNoise: soup.runs.length };
  assert.deepEqual(manifest.counts, actual);
  assert.equal(Object.values(actual).reduce((sum, count) => sum + count, 0), 1990);
  const csv = await readFile(new URL('../dist/data/runs.csv', import.meta.url), 'utf8');
  assert.equal(csv.trim().split('\n').length - 1, actual.survey + actual.density + actual.detail + actual.soupNoise);
  const patternCSV = await readFile(new URL('../dist/data/pattern-noise.csv', import.meta.url), 'utf8');
  assert.equal(patternCSV.trim().split('\n').length - 1, actual.patternNoise);
});

test('replay parameters reject invalid or excessive work before replacing the displayed world', () => {
  for (const search of ['?size=1', '?size=99999', '?steps=-1', '?steps=5001', '?steps=no', '?density=NaN', '?density=2', '?pattern=unknown', '?noise=-1', '?boundary=wrong', '?rule=B9/S']) assert.throws(() => worldFromQuery(search));
  const { world } = worldFromQuery('?pattern=replicator&size=64&noise=0.001&noiseSeed=replicator%3Anoise%3A0');
  assert.equal(world.rule.name, 'B36/S23');
  assert.equal(world.noise, 0.001);
  assert.equal(world.population, 12);
});
