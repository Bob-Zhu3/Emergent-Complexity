import { ageColor, ageScale } from './colors.js';

const percentage = value => `${(value * 100).toFixed(2)}%`;
const count = value => value.toLocaleString('en-US');
const sources = ['random', 'pattern', 'empty', 'edited', 'continued', 'snapshot'];

export function createStartInfo(world, details = {}) {
  return {
    version: 1, width: world.width, height: world.height,
    initialPopulation: world.generation === 0 ? world.population : null,
    source: details.source ?? 'snapshot', seed: details.seed ?? null,
    densitySetting: details.densitySetting ?? null,
    startArea: details.startArea ?? null, pattern: details.pattern ?? null
  };
}

export function restartStartInfo(world, previous, source = 'continued') {
  if (world.generation === 0 && source !== 'edited') return { ...previous };
  return { ...createStartInfo(world, { source, seed: previous.seed }), initialPopulation: world.population };
}

export function restoreStartInfo(data, world) {
  if (data === undefined) return createStartInfo(world);
  const nullableText = value => value === null || typeof value === 'string' && value.length <= 100;
  if (!data || data.version !== 1 || data.width !== world.width || data.height !== world.height || !sources.includes(data.source)
    || !nullableText(data.seed) || !nullableText(data.pattern)
    || !(data.initialPopulation === null || Number.isInteger(data.initialPopulation) && data.initialPopulation >= 0 && data.initialPopulation <= world.size)
    || !(data.densitySetting === null || Number.isFinite(data.densitySetting) && data.densitySetting >= 0 && data.densitySetting <= 1)
    || ![null, 'full', 'patch'].includes(data.startArea)
    || data.source === 'random' && (data.seed === null || data.densitySetting === null || data.startArea === null || data.initialPopulation === null)
    || data.source === 'pattern' && data.pattern === null
    || world.generation === 0 && data.initialPopulation !== world.population) throw new Error('Snapshot starting details are invalid.');
  return { ...createStartInfo(world, data), initialPopulation: data.initialPopulation };
}

export function imageDetails(world, start) {
  const details = [
    `Grid: ${world.width} × ${world.height} | Edges: ${world.boundary === 'wrap' ? 'Wrapping' : 'Stay empty'}`,
    `Current density: ${percentage(world.population / world.size)} | Living cells: ${count(world.population)} / ${count(world.size)}`,
    start.initialPopulation === null ? 'Initial density: Not recorded in this snapshot' : `Initial density (whole grid): ${percentage(start.initialPopulation / world.size)} | Initial living cells: ${count(start.initialPopulation)}`
  ];
  if (start.source === 'random') {
    const patch = start.startArea === 'patch';
    details.push(`Start: ${patch ? `Random center patch (${Math.min(16, world.width)} × ${Math.min(16, world.height)})` : 'Random whole grid'} | Density setting: ${percentage(start.densitySetting)}${patch ? ' within patch' : ''}`);
  } else {
    const names = { pattern: `${start.pattern} pattern`, empty: 'Empty grid', edited: 'Manually edited grid', continued: 'Current board restarted', snapshot: 'Loaded snapshot' };
    details.push(`Start: ${names[start.source]}`);
  }
  const seedLabel = ['edited', 'continued'].includes(start.source) ? 'Source seed (before edits or restart)' : 'Seed';
  details.push(`${seedLabel}: ${start.seed === null ? start.source === 'snapshot' ? 'Not recorded' : 'Not used' : JSON.stringify(start.seed)}`);
  details.push(`Noise: ${(world.noise * 100).toLocaleString('en-US', { maximumFractionDigits: 8 })}% chance per cell per step`);
  return details;
}

function wrapText(context, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderWorldImage(world, start, colorMode, createCanvas = () => document.createElement('canvas')) {
  const image = createCanvas();
  const scale = Math.min(Math.max(10, 720 / world.width), 2560 / Math.max(world.width, world.height));
  const gridWidth = Math.round(world.width * scale), gridHeight = Math.round(world.height * scale);
  image.width = Math.max(720, gridWidth);
  const paint = image.getContext('2d');
  const padding = 24, available = image.width - padding * 2;
  paint.font = 'bold 22px sans-serif';
  const headings = wrapText(paint, `${world.rule.name} · Generation ${count(world.generation)}`, available);
  paint.font = '16px sans-serif';
  const lines = imageDetails(world, start).flatMap(line => wrapText(paint, line, available));
  const showAge = colorMode === 'age';
  const ageNotes = (showAge ? ['Cell age: consecutive living steps. Death resets age.', ...(world.ageStartGeneration > 0 ? [`Age history starts at generation ${count(world.ageStartGeneration)}.`] : [])] : ['Colors: Single color']).flatMap(line => wrapText(paint, line, available));
  image.height = gridHeight + padding * 2 + headings.length * 30 + 10 + lines.length * 26 + (showAge ? 46 : 8) + ageNotes.length * 24;
  paint.fillStyle = '#101c20';
  paint.fillRect(0, 0, image.width, image.height);
  const left = (image.width - gridWidth) / 2;
  const cellWidth = gridWidth / world.width, cellHeight = gridHeight / world.height;
  paint.fillStyle = '#14262b';
  paint.fillRect(left, 0, gridWidth, gridHeight);
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const index = y * world.width + x;
    paint.fillStyle = world.cells[index] ? showAge ? ageColor(world.ages[index]) : '#bdf48f' : '#0d181c';
    paint.fillRect(left + x * cellWidth, y * cellHeight, cellWidth * 0.9, cellHeight * 0.9);
  }
  let y = gridHeight + padding;
  paint.textBaseline = 'top';
  paint.font = 'bold 22px sans-serif';
  paint.fillStyle = '#ffffff';
  for (const line of headings) { paint.fillText(line, padding, y); y += 30; }
  y += 10;
  paint.font = '16px sans-serif';
  paint.fillStyle = '#d1e1e4';
  for (const line of lines) { paint.fillText(line, padding, y); y += 26; }
  y += 8;
  if (showAge) {
    ageScale.forEach((stop, index) => {
      const x = padding + index * available / ageScale.length;
      paint.fillStyle = stop.color;
      paint.fillRect(x, y, 22, 18);
      paint.fillStyle = '#ffffff';
      paint.fillText(`${stop.age}${index === ageScale.length - 1 ? '+' : ''}`, x + 30, y);
    });
    y += 38;
  }
  paint.fillStyle = '#a4bec5';
  for (const line of ageNotes) { paint.fillText(line, padding, y); y += 24; }
  return image;
}
