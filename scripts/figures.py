import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np

root = Path(__file__).resolve().parents[1]
data = root / 'dist' / 'data'
output = root / 'dist' / 'figures'
output.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({
    'font.family': 'DejaVu Sans', 'font.size': 12, 'axes.titlesize': 14,
    'axes.labelsize': 12, 'axes.spines.top': False, 'axes.spines.right': False,
    'axes.edgecolor': '#c5cdc1', 'axes.labelcolor': '#263d39',
    'text.color': '#263d39', 'xtick.color': '#5c7065', 'ytick.color': '#5c7065',
    'figure.facecolor': '#fffef8', 'axes.facecolor': '#fffef8',
    'svg.fonttype': 'none', 'svg.hashsalt': 'emergent-complexity-v1',
    'savefig.bbox': 'tight', 'savefig.pad_inches': 0.25
})
colors = ['#326b4b', '#ac713a', '#77609a', '#317e95']

def read(name):
    return json.loads((data / f'{name}.json').read_text(encoding='utf-8'))

def save(figure, name):
    figure.savefig(output / f'{name}.svg', metadata={'Date': None})
    figure.savefig(output / f'{name}.png', dpi=150)
    plt.close(figure)

survey = read('survey')
categories = ['extinct', 'fixed', 'periodic', 'active', 'slow']
counts = [sum(result['counts'][label] for result in survey['rules']) for label in categories]
fig, ax = plt.subplots(figsize=(10.5, 3.8), layout='constrained')
bars = ax.barh([label.title() for label in categories], counts, color=['#8c988e', colors[0], colors[2], colors[1], colors[3]])
ax.bar_label(bars, padding=5)
ax.set_xlabel('Runs out of 600')
ax.set_xlim(0, max(counts) * 1.12)
ax.invert_yaxis()
ax.set_title('100 rules, six starting configurations each', loc='left', pad=18)
save(fig, 'survey')

density = read('density')
fig, ax = plt.subplots(figsize=(10.5, 4.2), layout='constrained')
for i, rule in enumerate(['B3/S23', 'B36/S23']):
    xs = density['config']['densities']
    groups = [[100 * run['finalDensity'] for run in density['runs'] if run['rule'] == rule and run['density'] == value] for value in xs]
    ax.errorbar(np.array(xs) * 100, [np.mean(group) for group in groups], yerr=[np.std(group, ddof=1) for group in groups], marker='o', capsize=4, color=colors[i], label=['Life · B3/S23', 'HighLife · B36/S23'][i])
ax.set(xlabel='Initial density (%)', ylabel='Final density (%)', ylim=(0, None))
ax.set_title('Life and HighLife after 500 generations', loc='left', pad=18)
ax.legend(frameon=False)
ax.grid(axis='y', alpha=0.2)
save(fig, 'density')

detail = read('detail')
fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.3), layout='constrained')
for i, boundary in enumerate(['wrap', 'fixed']):
    xs = detail['config']['densities']
    for ax, metric in zip(axes, ['finalDensity', 'tailActivity']):
        groups = [[100 * run[metric] for run in detail['runs'] if run['boundary'] == boundary and run['density'] == value] for value in xs]
        ax.plot(np.array(xs) * 100, [np.mean(group) for group in groups], marker='o', markersize=4, color=colors[i], label='Wrapping edges' if boundary == 'wrap' else 'Empty edges')
        for x, group in zip(xs, groups):
            ax.scatter(x * 100 + np.linspace(-0.35, 0.35, len(group)), group, s=15, color=colors[i], alpha=0.6)
        ax.set_xlabel('Initial density (%)')
        ax.grid(axis='y', alpha=0.2)
axes[0].set(ylabel='Final density (%)', ylim=(-2, 90))
axes[1].set(ylabel='Late activity (% changed per step)', ylim=(-1, 40))
axes[0].legend(frameon=False, fontsize=10, loc='lower right')
fig.suptitle(f"{detail['rule']} · 1,000 generations · four seeds per setting", x=0.02, ha='left', fontsize=14)
save(fig, 'selected')

noise = read('noise')
fig, ax = plt.subplots(figsize=(10.5, 4.8), layout='constrained')
for i, pattern in enumerate(['block', 'blinker', 'glider', 'replicator']):
    results = [result for result in noise['results'] if result['pattern'] == pattern]
    x = np.array([result['noise'] * 100 for result in results])
    y = np.array([result['intactFraction'] * 100 for result in results])
    lower = np.array([result['interval'][0] * 100 for result in results])
    upper = np.array([result['interval'][1] * 100 for result in results])
    ax.errorbar(x, y, yerr=np.maximum(0, [y - lower, upper - y]), color=colors[i], label=pattern.title() if pattern != 'replicator' else 'HighLife replicator', marker='o', capsize=3, linewidth=1.7, markersize=5)
ax.set_xscale('symlog', linthresh=0.01)
ax.set_xticks([0, 0.01, 0.05, 0.1, 0.5, 1], ['0', '0.01', '0.05', '0.1', '0.5', '1'])
ax.set(xlabel='Per-cell flip probability per generation (%)', ylabel='Intact throughout 96 generations (%)', ylim=(-3, 104))
ax.set_title('Pattern fidelity under repeated noise', loc='left', pad=18)
ax.legend(frameon=False)
ax.grid(axis='y', alpha=0.2)
save(fig, 'noise')

catalog = read('catalog')
fig, axes = plt.subplots(len(catalog['patterns']), 4, figsize=(11, 12), layout='constrained')
cmap = ListedColormap(['#122328', '#bdf48f'])
for row, item in enumerate(catalog['patterns']):
    grids = [np.array([[int(cell) for cell in line] for line in frame['rows']]) for frame in item['frames']]
    occupied = np.any(grids, axis=0)
    ys, xs = np.where(occupied)
    y0, y1 = max(0, int(ys.min()) - 2), min(96, int(ys.max()) + 3)
    x0, x1 = max(0, int(xs.min()) - 2), min(96, int(xs.max()) + 3)
    for col, (grid, frame) in enumerate(zip(grids, item['frames'])):
        ax = axes[row, col]
        ax.imshow(grid[y0:y1, x0:x1], cmap=cmap, vmin=0, vmax=1, interpolation='nearest')
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_title(f"Generation {frame['generation']}", fontsize=11)
        if col == 0:
            ax.set_ylabel(item['name'], fontsize=11)
fig.suptitle('A catalog of measured patterns', x=0.02, ha='left', fontsize=16)
save(fig, 'catalog')
print('Saved five scientific figures as SVG and PNG.')
