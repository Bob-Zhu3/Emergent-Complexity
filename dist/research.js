import { labels } from './lib/analysis.js';
import { replayURL } from './lib/launch.js';

const $ = id => document.getElementById(id);
const displayLabel = label => label === 'slow' ? 'Slow change' : label[0].toUpperCase() + label.slice(1);
const percent = value => `${(100 * value).toFixed(1)}%`;
let survey, savedSurvey, worker, timer;

function notice(message) {
  $('notice').textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $('notice').textContent = ''; }, 6000);
}

function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showSurvey(data) {
  survey = data;
  const counts = Object.fromEntries(labels.map(label => [label, data.rules.reduce((sum, rule) => sum + rule.counts[label], 0)]));
  $('outcome-cards').innerHTML = labels.map(label => `<div class="outcome-card"><strong>${counts[label]}</strong><span>${displayLabel(label)}</span></div>`).join('');
  showTable();
}

function showTable() {
  if (!survey) return;
  const search = $('rule-search').value.toUpperCase().trim();
  const label = $('outcome-filter').value;
  const rules = survey.rules.filter(result => result.rule.includes(search) && (label === 'all' || result.counts[label] > 0));
  $('rule-table').innerHTML = rules.map(result => `<tr><td>${String(result.index).padStart(2, '0')}</td><td class="rule-name">${result.rule}</td><td>${labels.filter(key => result.counts[key]).map(key => `<span class="outcome-tag ${key}">${result.counts[key]} ${displayLabel(key)}</span>`).join('')}</td><td>${percent(result.meanFinalDensity)}</td><td>${percent(result.meanTailActivity)}</td><td><button data-rule-index="${result.index}">Inspect →</button></td></tr>`).join('');
  $('table-status').textContent = `${rules.length} of ${survey.rules.length} rules shown. Sampling seed: ${survey.config.ruleSeed}.${survey !== savedSurvey ? ' This is a local rerun; the report and figures use the saved survey.' : ''}`;
}

function showRule(index) {
  const result = survey.rules.find(rule => rule.index === index);
  if (!result) return;
  $('dialog-title').textContent = result.rule;
  $('dialog-content').innerHTML = result.runs.map(run => {
    const d = run.population.map((value, g) => `${g ? 'L' : 'M'}${g / run.steps * 300},${62 - value / (run.width * run.height) * 60}`).join(' ');
    return `<div class="run-detail"><p><strong>${percent(run.density)} start</strong><br>${run.seed}<br><span class="outcome-tag ${run.label}">${displayLabel(run.label)}${run.period ? ` · period ${run.period}` : ''}</span></p><svg class="trace" viewBox="0 0 300 64" role="img" aria-label="Population density from generation 0 to ${run.steps}; final density ${percent(run.finalDensity)}"><path d="${d}"/></svg><div><a href="${replayURL(run)}">Replay start →</a><a href="${replayURL(run, run.steps)}">View step ${run.steps} →</a></div></div>`;
  }).join('');
  $('rule-dialog').showModal();
}

function finishWorker() {
  worker?.terminate(); worker = null;
  $('rerun').disabled = false;
  $('cancel').disabled = true;
}

$('rule-search').addEventListener('input', showTable);
$('outcome-filter').addEventListener('change', showTable);
$('rule-table').addEventListener('click', event => {
  const button = event.target.closest('button[data-rule-index]');
  if (button) showRule(Number(button.dataset.ruleIndex));
});
$('close-dialog').addEventListener('click', () => $('rule-dialog').close());
$('download-survey').addEventListener('click', () => { if (survey) download(survey, 'rule-survey.json'); });
$('restore-survey').addEventListener('click', () => { if (savedSurvey) showSurvey(savedSurvey); });
$('cancel').addEventListener('click', () => { finishWorker(); $('progress-label').textContent = 'Cancelled. The displayed survey is unchanged.'; });
$('rerun').addEventListener('click', () => {
  if (worker) return;
  if (!window.Worker) { notice('This browser does not support background workers. Use the saved results or run npm run experiment locally.'); return; }
  try {
    worker = new Worker(new URL('./survey-worker.js', import.meta.url), { type: 'module' });
    $('rerun').disabled = true; $('cancel').disabled = false;
    $('survey-progress').value = 0;
    $('progress-label').textContent = 'Running 100 rules, six starts each...';
    worker.onmessage = event => {
      if (event.data.type === 'progress') {
        $('survey-progress').value = event.data.completed;
        $('progress-label').textContent = `${event.data.completed} of 100 rules complete`;
      } else if (event.data.type === 'complete') {
        showSurvey(event.data.survey);
        finishWorker();
        $('progress-label').textContent = 'Complete. The table now shows this run; you can save its JSON.';
      } else if (event.data.type === 'error') {
        finishWorker(); notice(event.data.message);
      }
    };
    worker.onerror = () => { finishWorker(); notice('The survey worker failed. The saved results remain available.'); };
    worker.postMessage({ seed: $('survey-seed').value });
  } catch (error) { finishWorker(); notice(error.message); }
});

async function read(name) {
  const response = await fetch(`./data/${name}.json`);
  if (!response.ok) throw new Error(`Could not load ${name}. Refresh the page or open the data in the repository.`);
  return response.json();
}

try {
  const [data, detail, noise] = await Promise.all([read('survey'), read('detail'), read('noise')]);
  savedSurvey = data;
  showSurvey(data);
  $('detail-replays').innerHTML = detail.runs.filter(run => run.density === 0.1 && run.boundary === 'wrap').map(run => `<article class="replay-card"><strong>${run.seed} · 10% start</strong><p>${displayLabel(run.label)}${run.period ? `, period ${run.period}` : ', no exact repeat by step 1,000'}.<br>Final density: ${percent(run.finalDensity)}</p><a href="${replayURL(run, run.steps)}">Open this world →</a></article>`).join('');
  $('noise-table').innerHTML = noise.results.map(result => {
    const query = new URLSearchParams({ pattern: result.pattern, size: 64, boundary: 'fixed', noise: result.noise, noiseSeed: `${result.pattern}:noise:0` });
    return `<tr><td>${result.pattern === 'replicator' ? 'HighLife replicator' : displayLabel(result.pattern)}</td><td>${(result.noise * 100).toFixed(2)}%</td><td>${result.intact} / ${result.trials}</td><td>${result.finalMatches} / ${result.trials}</td><td><a href="./?${query}">Replay trial 0 →</a></td></tr>`;
  }).join('');
} catch (error) {
  $('table-status').textContent = error.message;
  notice(error.message);
}
