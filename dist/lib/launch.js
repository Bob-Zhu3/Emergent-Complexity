import { Automaton, randomCells } from './engine.js';
import { patterns, patternCells } from './patterns.js';

export function worldFromQuery(search) {
  const query = new URLSearchParams(search);
  const width = Number(query.get('size') ?? 72);
  const steps = Number(query.get('steps') ?? 0);
  const density = Number(query.get('density') ?? 0.3);
  const seed = query.get('seed') ?? 'george-01';
  const pattern = query.get('pattern');
  if (!Number.isInteger(width) || width < 3 || width > 128) throw new Error('Replay size must be an integer from 3 to 128.');
  if (!Number.isInteger(steps) || steps < 0 || steps > 5000) throw new Error('Replay steps must be an integer from 0 to 5000.');
  if (seed.length > 100) throw new Error('Replay seed is too long.');
  if (!Number.isFinite(density) || density < 0 || density > 1) throw new Error('Replay density must be between 0 and 1.');
  if (pattern && !Object.hasOwn(patterns, pattern)) throw new Error('Unknown replay pattern.');
  const world = new Automaton({ width, rule: query.get('rule') ?? (pattern ? patterns[pattern].rule : 'B3/S23'), boundary: query.get('boundary') ?? 'wrap', noise: Number(query.get('noise') ?? 0), noiseSeed: query.get('noiseSeed') ?? `${seed}:noise` });
  const cells = pattern ? patternCells(width, width, pattern) : randomCells(width, width, density, seed);
  world.setCells(cells);
  return { world, steps, seed, density };
}

export function replayURL(run, steps = 0) {
  const query = new URLSearchParams({ rule: run.rule, size: run.width, density: run.density, seed: run.seed, boundary: run.boundary, noise: run.noise ?? 0, noiseSeed: run.noiseSeed ?? `${run.seed}:noise`, steps });
  return `./?${query}`;
}
