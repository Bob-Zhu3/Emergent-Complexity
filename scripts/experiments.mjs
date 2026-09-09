import { mkdir, writeFile } from 'node:fs/promises';
import { Automaton } from '../dist/lib/engine.js';
import { patterns, patternCells } from '../dist/lib/patterns.js';
import { surveyConfig, sampleRules, surveyRule, selectInteresting, observe, patternNoiseStudy } from '../dist/lib/analysis.js';

const output = new URL('../dist/data/', import.meta.url);
await mkdir(output, { recursive: true });
const writeJSON = async (name, data) => writeFile(new URL(name, output), JSON.stringify(data));
const rules = [];
for (const sample of sampleRules(surveyConfig.ruleSeed, surveyConfig.count)) {
  rules.push(surveyRule(sample));
  if (rules.length % 10 === 0) process.stdout.write(`Survey: ${rules.length}/100 rules completed\n`);
}
const selected = selectInteresting(rules);
await writeJSON('survey.json', { schema: 1, config: surveyConfig, selectedRule: selected.rule, rules });
process.stdout.write(`Selected ${selected.rule} for sensitivity to initial conditions\n`);

const densityConfig = { width: 64, height: 64, steps: 500, tail: 100, boundary: 'wrap', densities: [0.05, 0.15, 0.3, 0.5, 0.75], seeds: ['density-a', 'density-b', 'density-c', 'density-d', 'density-e'] };
const densityRuns = ['B3/S23', 'B36/S23'].flatMap(rule => densityConfig.densities.flatMap(density => densityConfig.seeds.map(seed => observe({ ...densityConfig, rule, density, seed }))));
await writeJSON('density.json', { schema: 1, config: densityConfig, runs: densityRuns });
process.stdout.write('Life and HighLife: 50 density experiments completed\n');

const detailConfig = { width: 64, height: 64, steps: 1000, tail: 100, densities: [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75], seeds: ['detail-a', 'detail-b', 'detail-c', 'detail-d'], boundaries: ['wrap', 'fixed'] };
const detailRuns = detailConfig.boundaries.flatMap(boundary => detailConfig.densities.flatMap(density => detailConfig.seeds.map(seed => observe({ ...detailConfig, rule: selected.rule, boundary, density, seed }))));
await writeJSON('detail.json', { schema: 1, rule: selected.rule, selection: 'Among rules without B0, maximize 4 x number of outcome categories + range of final densities + 1 if active/slow and settled outcomes coexist; break ties by sample index.', config: detailConfig, runs: detailRuns });
process.stdout.write('Selected rule: 56 longer experiments completed\n');

const catalog = [];
for (const [key, pattern] of Object.entries(patterns)) {
  const world = new Automaton({ width: 96, rule: pattern.rule, boundary: 'fixed' });
  world.setCells(patternCells(96, 96, key));
  const times = key === 'replicator' ? [0, 12, 36, 84] : key === 'rpentomino' ? [0, 50, 200, 500] : [0, 1, 2, 4];
  const frames = [];
  for (let g = 0; g <= Math.max(...times); g++) {
    if (times.includes(g)) frames.push(world.snapshot());
    world.step();
  }
  catalog.push({ key, name: pattern.name, description: pattern.description, frames });
}
await writeJSON('catalog.json', { patterns: catalog });

const noiseConfig = { width: 64, steps: 96, trials: 40, rates: [0, 0.0001, 0.0005, 0.001, 0.005, 0.01] };
const noiseResults = [];
for (const key of ['block', 'blinker', 'glider', 'replicator']) {
  noiseResults.push(...patternNoiseStudy(key, patterns[key].rule, noiseConfig));
  process.stdout.write(`Noise: ${patterns[key].name} completed\n`);
}
await writeJSON('noise.json', { schema: 1, config: noiseConfig, results: noiseResults });

const soupNoiseConfig = { width: 48, steps: 300, tail: 60, boundary: 'wrap', densities: [0.1, 0.3, 0.5], seeds: ['soup-a', 'soup-b'], noiseTrials: 3, rates: noiseConfig.rates };
const soupNoiseRuns = [];
for (const rule of ['B3/S23', 'B36/S23', selected.rule]) {
  for (const density of soupNoiseConfig.densities) for (const seed of soupNoiseConfig.seeds) {
    const baseline = observe({ ...soupNoiseConfig, rule, density, seed, keepSnapshot: true });
    const target = baseline.snapshot.rows.join('');
    for (const noise of soupNoiseConfig.rates) for (let trial = 0; trial < soupNoiseConfig.noiseTrials; trial++) {
      const run = observe({ ...soupNoiseConfig, rule, density, seed, noise, noiseSeed: `${seed}:noise:${trial}`, keepSnapshot: true });
      const actual = run.snapshot.rows.join('');
      let distance = 0;
      for (let i = 0; i < target.length; i++) distance += actual[i] !== target[i];
      run.hammingFromBaseline = distance / target.length;
      run.trial = trial;
      delete run.snapshot;
      soupNoiseRuns.push(run);
    }
  }
  process.stdout.write(`Noisy random worlds: ${rule} completed\n`);
}
await writeJSON('soup-noise.json', { schema: 1, config: soupNoiseConfig, runs: soupNoiseRuns });

const csvColumns = ['study', 'rule', 'width', 'height', 'boundary', 'density', 'seed', 'noise', 'noiseSeed', 'steps', 'label', 'finalPopulation', 'finalDensity', 'tailActivity', 'densitySlope', 'period', 'cycleStart', 'extinctAt', 'hammingFromBaseline'];
const allRuns = [...rules.flatMap(result => result.runs.map(run => ({ study: 'survey', ...run }))), ...densityRuns.map(run => ({ study: 'density', ...run })), ...detailRuns.map(run => ({ study: 'detail', ...run })), ...soupNoiseRuns.map(run => ({ study: 'soup-noise', ...run }))];
const csv = [csvColumns.join(','), ...allRuns.map(run => csvColumns.map(key => run[key] ?? '').join(','))].join('\n') + '\n';
await writeFile(new URL('runs.csv', output), csv);
const noiseColumns = ['pattern', 'rule', 'width', 'steps', 'noise', 'trial', 'noiseSeed', 'firstMismatch', 'finalMatch', 'finalPopulation', 'finalHamming'];
await writeFile(new URL('pattern-noise.csv', output), [noiseColumns.join(','), ...noiseResults.flatMap(result => result.runs.map(run => noiseColumns.map(key => ({ ...result, ...run })[key] ?? '').join(',')))].join('\n') + '\n');
await writeJSON('manifest.json', { schema: 1, engine: 'emergent-complexity-v1', ruleSampling: 'Uniform 18-bit integers without replacement; low 9 bits are birth counts, high 9 bits are survival counts.', generator: 'Mulberry32 with FNV-1a string seed conversion', selectedRule: selected.rule, counts: { survey: 600, density: 50, detail: 56, patternNoise: 960, soupNoise: 324 }, files: ['survey.json', 'density.json', 'detail.json', 'catalog.json', 'noise.json', 'soup-noise.json', 'runs.csv', 'pattern-noise.csv'] });
process.stdout.write('All experiments saved in dist/data.\n');
