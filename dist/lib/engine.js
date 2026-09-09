export function parseRule(value) {
  const match = /^B([0-8]*)\/S([0-8]*)$/i.exec(String(value).trim());
  if (!match) throw new Error('Use B followed by birth counts, then /S and survival counts (0-8).');
  const birth = [...new Set(match[1])].sort().map(Number);
  const survival = [...new Set(match[2])].sort().map(Number);
  const table = new Uint8Array(18);
  for (const n of birth) table[n] = 1;
  for (const n of survival) table[9 + n] = 1;
  return { name: `B${birth.join('')}/S${survival.join('')}`, birth, survival, table };
}

export function ruleFromInteger(value) {
  if (!Number.isInteger(value) || value < 0 || value >= 262144) throw new Error('Rule number must be between 0 and 262143.');
  let birth = '', survival = '';
  for (let n = 0; n < 9; n++) {
    if (value & (1 << n)) birth += n;
    if (value & (1 << (n + 9))) survival += n;
  }
  return `B${birth}/S${survival}`;
}

export function seedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}

export class Random {
  constructor(seed) {
    this.state = seedNumber(seed);
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

export function randomCells(width, height, density, seed) {
  if (!Number.isFinite(density) || density < 0 || density > 1) throw new Error('Density must be between 0 and 1.');
  const random = new Random(seed);
  return Uint8Array.from({ length: width * height }, () => Number(random.next() < density));
}

export class Automaton {
  constructor({ width = 72, height = width, rule = 'B3/S23', boundary = 'wrap', noise = 0, noiseSeed = 'noise' } = {}) {
    if (![width, height].every(n => Number.isInteger(n) && n >= 3 && n <= 256)) throw new Error('Each grid dimension must be an integer from 3 to 256.');
    if (!['wrap', 'fixed'].includes(boundary)) throw new Error('Boundary must be wrap or fixed.');
    if (!Number.isFinite(noise) || noise < 0 || noise > 1) throw new Error('Noise must be between 0 and 1.');
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.boundary = boundary;
    this.rule = parseRule(rule);
    this.noise = noise;
    this.random = new Random(noiseSeed);
    this.cells = new Uint8Array(this.size + 1);
    this.nextCells = new Uint8Array(this.size + 1);
    this.rowSums = new Uint8Array(this.size + 1);
    this.left = new Uint32Array(this.size);
    this.right = new Uint32Array(this.size);
    this.above = new Uint32Array(this.size);
    this.below = new Uint32Array(this.size);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        this.left[i] = x > 0 ? i - 1 : boundary === 'wrap' ? i + width - 1 : this.size;
        this.right[i] = x < width - 1 ? i + 1 : boundary === 'wrap' ? i - width + 1 : this.size;
        this.above[i] = y > 0 ? i - width : boundary === 'wrap' ? i + width * (height - 1) : this.size;
        this.below[i] = y < height - 1 ? i + width : boundary === 'wrap' ? i - width * (height - 1) : this.size;
      }
    }
    this.generation = 0;
    this.population = 0;
    this.changes = 0;
    this.deterministicChanges = 0;
    this.flips = 0;
  }

  setCells(cells) {
    if (cells.length !== this.size || cells.some(value => value !== 0 && value !== 1)) throw new Error('Grid must contain exactly width x height binary cells.');
    this.cells.fill(0);
    this.cells.set(cells);
    this.generation = 0;
    this.population = cells.reduce((sum, value) => sum + value, 0);
    this.changes = 0;
    this.deterministicChanges = 0;
    this.flips = 0;
  }

  step() {
    const { cells, nextCells, rowSums, left, right, above, below, size } = this;
    const table = this.rule.table;
    for (let i = 0; i < size; i++) rowSums[i] = cells[left[i]] + cells[i] + cells[right[i]];
    let population = 0, changes = 0, deterministicChanges = 0, flips = 0;
    for (let i = 0; i < size; i++) {
      const neighbors = rowSums[above[i]] + rowSums[i] + rowSums[below[i]] - cells[i];
      let value = table[cells[i] * 9 + neighbors];
      deterministicChanges += value !== cells[i];
      if (this.noise > 0 && this.random.next() < this.noise) {
        value = 1 - value;
        flips++;
      }
      nextCells[i] = value;
      population += value;
      changes += value !== cells[i];
    }
    this.cells = nextCells;
    this.nextCells = cells;
    this.population = population;
    this.changes = changes;
    this.deterministicChanges = deterministicChanges;
    this.flips = flips;
    this.generation++;
    return this;
  }

  snapshot() {
    const rows = [];
    for (let y = 0; y < this.height; y++) rows.push(this.cells.subarray(y * this.width, (y + 1) * this.width).join(''));
    return {
      format: 'emergent-complexity-v1', width: this.width, height: this.height,
      rule: this.rule.name, boundary: this.boundary, noise: this.noise,
      generation: this.generation, randomState: this.random.state, rows
    };
  }

  static fromSnapshot(data) {
    if (!data || data.format !== 'emergent-complexity-v1') throw new Error('This is not an Emergent Complexity snapshot.');
    const world = new Automaton(data);
    if (!Array.isArray(data.rows) || data.rows.length !== world.height || data.rows.some(row => typeof row !== 'string' || row.length !== world.width || /[^01]/.test(row))) throw new Error('Snapshot rows do not match the grid.');
    if (!Number.isSafeInteger(data.generation) || data.generation < 0 || !Number.isInteger(data.randomState) || data.randomState < 0 || data.randomState > 4294967295) throw new Error('Snapshot generation or random state is invalid.');
    world.setCells(Uint8Array.from(data.rows.join(''), Number));
    world.generation = data.generation;
    world.random.state = data.randomState;
    return world;
  }
}
