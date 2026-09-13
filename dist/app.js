import { Automaton, parseRule } from './lib/engine.js';
import { patterns, patternCells } from './lib/patterns.js';
import { worldFromQuery, startingCells } from './lib/launch.js';
import { ageColor, ageScale } from './lib/colors.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
const context = canvas.getContext('2d');
let world, initial, running = false, lastTime = 0, accumulated = 0, history = [];
let cursor = null, drawing = false, drawValue = 1, lastCell = null, noticeTimer;
let hoveredCell = null;

function notice(message) {
  $('notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 5500);
}

function stop() {
  running = false;
  $('play').textContent = '▶ Run';
  $('play').setAttribute('aria-pressed', 'false');
  $('status-dot').classList.remove('running');
  $('canvas-hint').textContent = 'Paused · drag to draw';
}

function captureInitial() {
  initial = world.snapshot();
  history = [world.population / world.size];
}

function setWorld(next, message) {
  stop();
  world = next;
  cursor = null;
  hoveredCell = null;
  captureInitial();
  syncControls();
  render();
  if (message) notice(message);
}

function settings() {
  return { width: Number($('grid-size').value), boundary: $('boundary').value, rule: world?.rule.name ?? $('rule-text').value, noise: Number($('noise').value), noiseSeed: `${$('seed').value}:noise` };
}

function freshRandom() {
  try {
    const next = new Automaton(settings());
    next.setCells(startingCells(next.width, next.height, Number($('density').value) / 100, $('seed').value, $('start-area').value));
    setWorld(next);
  } catch (error) { notice(error.message); }
}

function syncControls() {
  $('rule-text').value = world.rule.name;
  $('rule-preset').value = [...$('rule-preset').options].some(option => option.value === world.rule.name) ? world.rule.name : 'custom';
  for (const [group, counts] of [['birth', world.rule.birth], ['survival', world.rule.survival]]) {
    [...$(`${group}-bits`).children].forEach((button, n) => button.setAttribute('aria-pressed', String(counts.includes(n))));
  }
  const width = String(world.width);
  if (![...$('grid-size').options].some(option => option.value === width)) $('grid-size').add(new Option(`${world.width} × ${world.height}`, width));
  $('grid-size').value = width;
  $('boundary').value = world.boundary;
  const noise = String(world.noise);
  if (![...$('noise').options].some(option => option.value === noise)) $('noise').add(new Option(`${world.noise * 100}%`, noise));
  $('noise').value = noise;
  $('noise-help').textContent = world.noise === 0 ? 'Each cell follows the rule exactly.' : `After the rule runs, each cell independently flips with probability ${world.noise * 100}%. About ${(world.noise * world.size).toFixed(1)} flips per step on this grid.`;
  $('world-rule').textContent = world.rule.name;
  $('world-title').textContent = $('rule-preset').value === 'custom' ? 'Custom world' : $('rule-preset').selectedOptions[0].textContent.split(' · ')[0];
  $('world-size').textContent = `${world.width} × ${world.height} · ${world.boundary === 'wrap' ? 'wrapping' : 'empty edges'}`;
}

function render() {
  canvas.width = world.width * 10;
  canvas.height = world.height * 10;
  canvas.style.aspectRatio = `${world.width} / ${world.height}`;
  context.fillStyle = '#14262b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0d181c';
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) context.fillRect(x * 10, y * 10, 9, 9);
  }
  const showAge = $('color-mode').value === 'age';
  for (let i = 0; i < world.size; i++) {
    if (world.cells[i]) {
      context.fillStyle = showAge ? ageColor(world.ages[i]) : '#bdf48f';
      context.fillRect((i % world.width) * 10, Math.floor(i / world.width) * 10, 9, 9);
    }
  }
  $('age-legend').hidden = !showAge;
  $('age-history-note').textContent = world.ageStartGeneration > 0 ? `This older snapshot has no earlier age history. Ages count from generation ${world.ageStartGeneration.toLocaleString()}.` : '';
  if (cursor && document.activeElement === canvas) {
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.strokeRect(cursor.x * 10, cursor.y * 10, 10, 10);
  }
  $('generation').textContent = world.generation.toLocaleString();
  $('population').textContent = world.population.toLocaleString();
  $('live-density').textContent = `${(100 * world.population / world.size).toFixed(1)}%`;
  $('activity').textContent = `${(100 * world.changes / world.size).toFixed(1)}%`;
  const data = history.slice(-180);
  $('history-path').setAttribute('d', data.map((value, i) => `${i ? 'L' : 'M'}${i * 600 / Math.max(1, data.length - 1)},${53 - value * 50}`).join(' '));
  $('history-chart').setAttribute('aria-label', `Population density over the last ${data.length} recorded steps, ending at ${(100 * world.population / world.size).toFixed(1)} percent.`);
  inspectCell(hoveredCell ?? cursor);
}

function inspectCell(cell) {
  if (!cell) {
    $('cell-age').textContent = 'Point to a cell or use the arrow keys to read its age.';
    return;
  }
  const x = Math.min(cell.x, world.width - 1), y = Math.min(cell.y, world.height - 1);
  const i = y * world.width + x;
  $('cell-age').textContent = `Cell (${x + 1}, ${y + 1}): ${world.cells[i] ? `alive, age ${world.ages[i].toLocaleString()} ${world.ages[i] === 1 ? 'step' : 'steps'}` : 'dead, age 0'}.`;
}

function step(count = 1) {
  for (let i = 0; i < count; i++) {
    world.step();
    history.push(world.population / world.size);
  }
  history = history.slice(-180);
  render();
}

function changeRule(value) {
  try {
    const parsed = parseRule(value);
    stop();
    world.rule = parsed;
    world.setCells(world.cells.slice(0, world.size));
    captureInitial();
    syncControls();
    render();
  } catch (error) { notice(error.message); syncControls(); }
}

for (const group of ['birth', 'survival']) {
  for (let n = 0; n <= 8; n++) {
    const button = document.createElement('button');
    button.textContent = n;
    button.setAttribute('aria-label', `${group === 'birth' ? 'Birth' : 'Survival'} with ${n} neighbors`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const birth = new Set(world.rule.birth), survival = new Set(world.rule.survival);
      const counts = group === 'birth' ? birth : survival;
      counts.has(n) ? counts.delete(n) : counts.add(n);
      changeRule(`B${[...birth].sort().join('')}/S${[...survival].sort().join('')}`);
    });
    $(`${group}-bits`).append(button);
  }
}

function loadPattern(key) {
  const pattern = patterns[key];
  const next = new Automaton({ ...settings(), rule: pattern.rule, noise: 0 });
  next.setCells(patternCells(next.width, next.height, key));
  setWorld(next, pattern.description);
}

for (const [key, pattern] of Object.entries(patterns)) {
  const button = document.createElement('button');
  button.className = 'pattern-card';
  const cells = pattern.rows.flatMap((row, y) => [...row].flatMap((value, x) => value === '1' ? [`<rect x="${x * 9}" y="${y * 9}" width="7" height="7"/>`] : []));
  button.innerHTML = `<svg viewBox="0 0 52 45" aria-hidden="true" fill="currentColor">${cells.join('')}</svg><strong>${pattern.name}</strong><span>${pattern.description}</span>`;
  button.addEventListener('click', () => loadPattern(key));
  $('pattern-grid').append(button);
}

$('play').addEventListener('click', () => {
  if (running) return stop();
  running = true;
  accumulated = 0;
  lastTime = performance.now();
  $('play').textContent = 'Ⅱ Pause';
  $('play').setAttribute('aria-pressed', 'true');
  $('status-dot').classList.add('running');
  $('canvas-hint').textContent = 'Running · draw to pause';
});
$('step').addEventListener('click', () => { stop(); step(); });
$('reset').addEventListener('click', () => setWorld(Automaton.fromSnapshot(initial), 'Restored the starting grid and random state.'));
$('randomize').addEventListener('click', freshRandom);
$('clear').addEventListener('click', () => setWorld(new Automaton(settings())));
$('density').addEventListener('input', () => { $('density-value').textContent = `${$('density').value}%`; });
$('speed').addEventListener('input', () => { $('speed-value').textContent = `${$('speed').value} /s`; });
$('color-mode').addEventListener('change', render);
$('grid-size').addEventListener('change', freshRandom);
$('boundary').addEventListener('change', () => {
  const next = new Automaton({ ...settings(), width: world.width, height: world.height });
  next.setCells(world.cells.slice(0, world.size));
  setWorld(next, 'Changed the boundary and restarted the current grid at generation 0.');
});
$('noise').addEventListener('change', () => {
  stop();
  world.noise = Number($('noise').value);
  world.setCells(world.cells.slice(0, world.size));
  captureInitial();
  syncControls();
  render();
});
$('rule-preset').addEventListener('change', () => { if ($('rule-preset').value !== 'custom') changeRule($('rule-preset').value); });
$('rule-form').addEventListener('submit', event => { event.preventDefault(); changeRule($('rule-text').value); });

function pointerCell(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(world.width - 1, Math.floor((event.clientX - rect.left) / rect.width * world.width))), y: Math.max(0, Math.min(world.height - 1, Math.floor((event.clientY - rect.top) / rect.height * world.height))) };
}

function paint(from, to, value) {
  const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let t = 0; t <= distance; t++) {
    const fraction = distance ? t / distance : 0;
    const x = Math.round(from.x + (to.x - from.x) * fraction), y = Math.round(from.y + (to.y - from.y) * fraction);
    const i = y * world.width + x;
    world.population += value - world.cells[i];
    world.cells[i] = value;
  }
  world.setCells(world.cells.slice(0, world.size));
  render();
}

canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  stop();
  canvas.focus();
  canvas.setPointerCapture(event.pointerId);
  lastCell = pointerCell(event);
  cursor = lastCell;
  drawValue = 1 - world.cells[lastCell.y * world.width + lastCell.x];
  drawing = true;
  paint(lastCell, lastCell, drawValue);
});
canvas.addEventListener('pointermove', event => {
  hoveredCell = pointerCell(event);
  if (!drawing) { inspectCell(hoveredCell); return; }
  const next = pointerCell(event);
  paint(lastCell, next, drawValue);
  lastCell = next;
  cursor = next;
});
function finishDrawing() {
  if (!drawing) return;
  drawing = false;
  captureInitial();
  render();
}
canvas.addEventListener('pointerup', finishDrawing);
canvas.addEventListener('pointercancel', finishDrawing);
canvas.addEventListener('lostpointercapture', finishDrawing);
canvas.addEventListener('pointerleave', () => { hoveredCell = null; inspectCell(cursor); });
canvas.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  stop();
  hoveredCell = null;
  cursor ??= { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };
  if (event.key === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
  if (event.key === 'ArrowRight') cursor.x = Math.min(world.width - 1, cursor.x + 1);
  if (event.key === 'ArrowUp') cursor.y = Math.max(0, cursor.y - 1);
  if (event.key === 'ArrowDown') cursor.y = Math.min(world.height - 1, cursor.y + 1);
  if (['Enter', ' '].includes(event.key)) {
    paint(cursor, cursor, 1 - world.cells[cursor.y * world.width + cursor.x]);
    captureInitial();
  }
  render();
});
canvas.addEventListener('focus', () => { cursor ??= { x: 0, y: 0 }; render(); });
canvas.addEventListener('blur', render);

function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('export-json').addEventListener('click', () => download(JSON.stringify(world.snapshot(), null, 2), `world-g${world.generation}.json`, 'application/json'));
$('export-image').addEventListener('click', () => {
  const image = document.createElement('canvas');
  const imageWidth = Math.max(600, canvas.width);
  const gridHeight = Math.round(imageWidth * world.height / world.width);
  const showAge = $('color-mode').value === 'age';
  image.width = imageWidth;
  image.height = gridHeight + (showAge ? 140 : 56);
  const paint = image.getContext('2d');
  paint.fillStyle = '#101c20';
  paint.fillRect(0, 0, image.width, image.height);
  paint.imageSmoothingEnabled = false;
  paint.drawImage(canvas, 0, 0, imageWidth, gridHeight);
  paint.fillStyle = '#ffffff';
  paint.font = '16px sans-serif';
  paint.fillText(`${world.rule.name} | Generation ${world.generation} | ${world.boundary === 'wrap' ? 'Wrapping' : 'Empty edges'} | Noise ${world.noise * 100}%`, 16, gridHeight + 30);
  if (showAge) {
    ageScale.forEach((stop, i) => {
      const x = 16 + i * (imageWidth - 32) / ageScale.length;
      paint.fillStyle = stop.color;
      paint.fillRect(x, gridHeight + 46, 22, 18);
      paint.fillStyle = '#ffffff';
      paint.fillText(`${stop.age}${i === ageScale.length - 1 ? '+' : ''}`, x + 28, gridHeight + 61);
    });
    paint.fillText('Cell age: consecutive living steps. Death resets age.', 16, gridHeight + 93);
    if (world.ageStartGeneration > 0) paint.fillText(`Age history starts at generation ${world.ageStartGeneration}.`, 16, gridHeight + 119);
  }
  const anchor = document.createElement('a');
  anchor.href = image.toDataURL('image/png');
  anchor.download = `${world.rule.name.replace('/', '-')}-g${world.generation}.png`;
  anchor.click();
});
$('import-json').addEventListener('click', () => $('snapshot-file').click());
$('snapshot-file').addEventListener('change', async () => {
  const file = $('snapshot-file').files[0];
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('Snapshot is too large (maximum 2 MB).');
    setWorld(Automaton.fromSnapshot(JSON.parse(await file.text())), 'Snapshot loaded. Its random state is preserved for exact continuation.');
  } catch (error) { notice(error.message); }
  $('snapshot-file').value = '';
});

function frame(time) {
  if (running && !drawing) {
    accumulated += Math.min(time - lastTime, 150);
    const interval = 1000 / Number($('speed').value);
    const count = Math.min(10, Math.floor(accumulated / interval));
    if (count) { step(count); accumulated -= count * interval; }
  }
  lastTime = time;
  requestAnimationFrame(frame);
}

for (const [i, stop] of ageScale.entries()) {
  const item = document.createElement('span');
  const swatch = document.createElement('span');
  swatch.className = 'age-swatch';
  swatch.style.backgroundColor = stop.color;
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, `${stop.age}${i === ageScale.length - 1 ? '+' : ''}`);
  $('age-key').append(item);
}

try {
  const replay = worldFromQuery(location.search);
  $('seed').value = replay.seed;
  $('density').value = Math.round(replay.density * 100);
  $('start-area').value = replay.start;
  $('density-value').textContent = `${$('density').value}%`;
  setWorld(replay.world);
  if (replay.steps) step(replay.steps);
} catch (error) {
  freshRandom();
  notice(error.message);
}
requestAnimationFrame(frame);

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const definitions = [
    {
      name: 'read_automaton', title: 'Read the current world',
      description: 'Read the displayed rule, grid dimensions, generation, population, boundary and noise setting.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('No arguments are accepted.');
        return { rule: world.rule.name, width: world.width, height: world.height, generation: world.generation, population: world.population, boundary: world.boundary, noise: world.noise, colorMode: $('color-mode').value, ageStartGeneration: world.ageStartGeneration, running };
      }
    },
    {
      name: 'load_automaton_pattern', title: 'Load a pattern',
      description: 'Replace the displayed world with a centered known pattern, set its associated rule, turn noise off, and pause at generation zero.',
      inputSchema: { type: 'object', properties: { pattern: { type: 'string', enum: Object.keys(patterns) } }, required: ['pattern'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'pattern') || !Object.hasOwn(patterns, input.pattern)) throw new Error('Choose a valid pattern.');
        loadPattern(input.pattern);
        return { rule: world.rule.name, generation: world.generation, population: world.population };
      }
    },
    {
      name: 'advance_automaton', title: 'Advance the world',
      description: 'Pause and advance the displayed automaton by a specified number of generations, then update the grid and measurements.',
      inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['steps'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'steps') || !Number.isInteger(input.steps) || input.steps < 1 || input.steps > 1000) throw new Error('Steps must be an integer from 1 to 1000.');
        stop();
        step(input.steps);
        return { generation: world.generation, population: world.population, density: world.population / world.size };
      }
    }
  ];
  for (const definition of definitions) {
    try { Promise.resolve(document.modelContext.registerTool(definition, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  }
  addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); });
}
