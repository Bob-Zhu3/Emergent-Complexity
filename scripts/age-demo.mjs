import { writeFile } from 'node:fs/promises';
import { worldFromQuery } from '../dist/lib/launch.js';
import { boundingBox } from '../dist/lib/analysis.js';
import { ageColor, ageScale } from '../dist/lib/colors.js';

const config = { width: 128, height: 128, start: 'patch', patchSize: 16, density: 0.5, seed: 'growth-demo', boundary: 'fixed', noise: 0, steps: 128 };
const runs = [];
for (const [name, rule] of [['Life without Death', 'B3/S012345678'], ['Coral', 'B3/S45678']]) {
  const query = new URLSearchParams({ rule, size: config.width, start: config.start, density: config.density, seed: config.seed, boundary: config.boundary, noise: config.noise, steps: config.steps });
  const { world } = worldFromQuery(query);
  const initialRows = world.snapshot().rows;
  const history = [];
  let firstEdgeContact = null;
  for (let generation = 0; generation <= config.steps; generation++) {
    if (generation) world.step();
    const box = boundingBox(world.cells, world.width, world.height);
    if (firstEdgeContact === null && box && (box.left === 0 || box.top === 0 || box.right === world.width - 1 || box.bottom === world.height - 1)) firstEdgeContact = generation;
    history.push({ generation, population: world.population, changes: world.changes, box });
  }
  runs.push({ name, rule, replay: `./?${query}`, initialRows, firstEdgeContact, history, final: world.snapshot() });
}
const data = { format: 'emergent-complexity-age-demo-v1', config, ageScale, palette: Array.from({ length: 129 }, (_, age) => ageColor(age)), runs };
await writeFile(new URL('../dist/data/age-demo.json', import.meta.url), JSON.stringify(data) + '\n');
process.stdout.write('Saved two matching age-color demonstrations, separate from the original 1,990 runs.\n');
