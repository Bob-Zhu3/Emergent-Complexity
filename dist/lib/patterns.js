export const patterns = {
  block: { name: 'Block', rule: 'B3/S23', rows: ['11', '11'], description: 'A still life: four cells, unchanged.' },
  blinker: { name: 'Blinker', rule: 'B3/S23', rows: ['111'], description: 'An oscillator: the same shape returns every two steps.' },
  glider: { name: 'Glider', rule: 'B3/S23', rows: ['010', '001', '111'], description: 'A moving pattern: one diagonal cell every four steps.' },
  rpentomino: { name: 'R-pentomino', rule: 'B3/S23', rows: ['011', '110', '010'], description: 'Five cells with a long, eventful transient.' },
  replicator: { name: 'HighLife replicator', rule: 'B36/S23', rows: ['00111', '01001', '10001', '10010', '11100'], description: 'This seed becomes two copies after 12 steps in HighLife.' }
};

export function patternCells(width, height, pattern, offsetX, offsetY) {
  const rows = typeof pattern === 'string' ? patterns[pattern]?.rows : pattern;
  if (!rows || !rows.length) throw new Error('Unknown pattern.');
  const patternWidth = Math.max(...rows.map(row => row.length));
  const x0 = offsetX ?? Math.floor((width - patternWidth) / 2);
  const y0 = offsetY ?? Math.floor((height - rows.length) / 2);
  const cells = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((value, x) => {
    if (value === '1' && x0 + x >= 0 && x0 + x < width && y0 + y >= 0 && y0 + y < height) cells[(y0 + y) * width + x0 + x] = 1;
  }));
  return cells;
}
