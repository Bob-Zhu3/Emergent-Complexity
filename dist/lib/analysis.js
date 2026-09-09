import { Automaton, Random, randomCells, ruleFromInteger } from './engine.js';
import { patternCells } from './patterns.js';

export const surveyConfig = Object.freeze({ width: 48, height: 48, steps: 300, tail: 60, boundary: 'wrap', densities: [0.1, 0.3, 0.5], seeds: ['soup-a', 'soup-b'], ruleSeed: 'george-rule-survey-v1', count: 100 });
export const labels = ['extinct', 'fixed', 'periodic', 'active', 'slow'];

export function sampleRules(seed, count = 100) {
  if (!Number.isInteger(count) || count < 1 || count > 262144) throw new Error('Choose between 1 and 262144 rules.');
  const random = new Random(seed);
  const integers = new Set();
  while (integers.size < count) integers.add(Math.floor(random.next() * 262144));
  return [...integers].map((integer, index) => ({ index: index + 1, integer, rule: ruleFromInteger(integer) }));
}

export function stateKey(cells, size) {
  let result = '';
  for (let i = 0; i < size; i += 16) {
    let bits = 0;
    for (let j = 0; j < 16 && i + j < size; j++) bits |= cells[i + j] << j;
    result += String.fromCharCode(bits);
  }
  return result;
}

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function linearSlope(values) {
  const center = (values.length - 1) / 2;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < values.length; i++) {
    numerator += (i - center) * values[i];
    denominator += (i - center) ** 2;
  }
  return denominator ? numerator / denominator : 0;
}

export function observe({ rule, width = 48, height = width, density = 0.3, seed = 'soup-a', steps = 300, tail = 60, boundary = 'wrap', noise = 0, noiseSeed = `${seed}:noise`, cells, keepSnapshot = false }) {
  const world = new Automaton({ width, height, rule, boundary, noise, noiseSeed });
  world.setCells(cells ?? randomCells(width, height, density, seed));
  const population = [world.population], changes = [0], flips = [0];
  const seen = new Map();
  let period = null, cycleStart = null, extinctAt = null;
  if (noise === 0) seen.set(stateKey(world.cells, world.size), 0);
  for (let g = 1; g <= steps; g++) {
    world.step();
    population.push(world.population);
    changes.push(world.changes);
    flips.push(world.flips);
    if (world.population === 0 && !world.rule.birth.includes(0) && noise === 0 && extinctAt === null) extinctAt = g;
    if (noise === 0 && period === null) {
      const key = stateKey(world.cells, world.size);
      if (seen.has(key)) {
        cycleStart = seen.get(key);
        period = g - cycleStart;
        seen.clear();
      } else seen.set(key, g);
    }
  }
  const tailActivity = mean(changes.slice(-tail)) / world.size;
  const tailDensity = mean(population.slice(-tail)) / world.size;
  const densitySlope = linearSlope(population.slice(-tail)) / world.size;
  const label = extinctAt !== null ? 'extinct' : period === 1 ? 'fixed' : period !== null ? 'periodic' : tailActivity >= 0.02 ? 'active' : 'slow';
  return {
    rule: world.rule.name, width, height, boundary, density, seed, noise, noiseSeed, steps,
    initialPopulation: population[0], finalPopulation: world.population, finalDensity: world.population / world.size,
    tailActivity, tailDensity, densitySlope, growing: densitySlope > 0.0005,
    label, period, cycleStart, extinctAt, population, changes, flips,
    ...(keepSnapshot ? { snapshot: world.snapshot() } : {})
  };
}

export function summarizeRule(sample, runs) {
  const counts = Object.fromEntries(labels.map(label => [label, runs.filter(run => run.label === label).length]));
  return { ...sample, counts, meanFinalDensity: mean(runs.map(run => run.finalDensity)), meanTailActivity: mean(runs.map(run => run.tailActivity)), runs };
}

export function surveyRule(sample, config = surveyConfig) {
  const runs = config.densities.flatMap(density => config.seeds.map(seed => observe({ ...config, rule: sample.rule, density, seed })));
  return summarizeRule(sample, runs);
}

export function selectInteresting(rules) {
  const scored = rules.filter(result => !result.rule.split('/')[0].includes('0')).map(result => {
    const kinds = Object.values(result.counts).filter(count => count > 0).length;
    const densities = result.runs.map(run => run.finalDensity);
    const spread = Math.max(...densities) - Math.min(...densities);
    const active = result.counts.active + result.counts.slow;
    const score = 4 * kinds + spread + Number(active > 0 && active < result.runs.length);
    return { result, score };
  });
  scored.sort((a, b) => b.score - a.score || a.result.index - b.result.index);
  return scored[0].result;
}

export function boundingBox(cells, width, height, padding = 0) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let i = 0; i < width * height; i++) if (cells[i]) {
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right === -1) return null;
  return { left: Math.max(0, left - padding), right: Math.min(width - 1, right + padding), top: Math.max(0, top - padding), bottom: Math.min(height - 1, bottom + padding) };
}

export function matchesRegion(actual, expected, width, box) {
  if (!box) return false;
  for (let y = box.top; y <= box.bottom; y++) {
    for (let x = box.left; x <= box.right; x++) if (actual[y * width + x] !== expected[y * width + x]) return false;
  }
  return true;
}

export function patternFootprint(cells, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) if (cells[i]) {
    const x = i % width, y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) mask[ny * width + nx] = 1;
    }
  }
  const indices = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) indices.push(i);
  return Uint32Array.from(indices);
}

export function matchesFootprint(actual, expected, indices) {
  return indices.length > 0 && indices.every(i => actual[i] === expected[i]);
}

export function wilson(successes, trials) {
  const z = 1.96, fraction = successes / trials;
  const denominator = 1 + z * z / trials;
  const middle = (fraction + z * z / (2 * trials)) / denominator;
  const radius = z * Math.sqrt(fraction * (1 - fraction) / trials + z * z / (4 * trials * trials)) / denominator;
  return [Math.max(0, middle - radius), Math.min(1, middle + radius)];
}

export function patternNoiseStudy(pattern, rule, { width = 64, steps = 96, trials = 40, rates = [0, 0.0001, 0.0005, 0.001, 0.005, 0.01] } = {}) {
  const baseline = new Automaton({ width, rule, boundary: 'fixed' });
  const start = patternCells(width, width, pattern);
  baseline.setCells(start);
  const expected = [{ cells: baseline.cells.slice(0, baseline.size), footprint: patternFootprint(baseline.cells, width, width) }];
  for (let g = 1; g <= steps; g++) {
    baseline.step();
    expected.push({ cells: baseline.cells.slice(0, baseline.size), footprint: patternFootprint(baseline.cells, width, width) });
  }
  return rates.map(noise => {
    const runs = [], survival = new Array(steps + 1).fill(0);
    for (let trial = 0; trial < trials; trial++) {
      const noiseSeed = `${pattern}:noise:${trial}`;
      const world = new Automaton({ width, rule, boundary: 'fixed', noise, noiseSeed });
      world.setCells(start);
      let firstMismatch = null, finalMatch = true;
      survival[0]++;
      for (let g = 1; g <= steps; g++) {
        world.step();
        finalMatch = matchesFootprint(world.cells, expected[g].cells, expected[g].footprint);
        if (!finalMatch && firstMismatch === null) firstMismatch = g;
        if (firstMismatch === null) survival[g]++;
      }
      let differingCells = 0;
      for (let i = 0; i < world.size; i++) differingCells += world.cells[i] !== expected[steps].cells[i];
      runs.push({ trial, noiseSeed, firstMismatch, finalMatch, finalPopulation: world.population, finalHamming: differingCells / world.size });
    }
    const intact = runs.filter(run => run.firstMismatch === null).length;
    const finalMatches = runs.filter(run => run.finalMatch).length;
    return { pattern, rule, width, steps, trials, noise, intact, finalMatches, intactFraction: intact / trials, finalMatchFraction: finalMatches / trials, interval: wilson(intact, trials), survival, footprintExposure: expected.slice(1).reduce((sum, frame) => sum + frame.footprint.length, 0), runs };
  });
}
