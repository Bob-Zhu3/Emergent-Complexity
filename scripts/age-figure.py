import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch, Rectangle
import numpy as np

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'dist/data/age-demo.json').read_text(encoding='utf-8'))
output = root / 'dist/figures'
plt.rcParams.update({
    'font.family': 'DejaVu Sans', 'font.size': 12,
    'text.color': '#263d39', 'axes.labelcolor': '#263d39',
    'xtick.color': '#5c7065', 'ytick.color': '#5c7065',
    'figure.facecolor': '#fffef8', 'svg.fonttype': 'none',
    'svg.hashsalt': 'emergent-complexity-age-v1'
})
fig, axes = plt.subplots(1, 2, figsize=(11, 6.2))
fig.subplots_adjust(left=0.06, right=0.98, top=0.81, bottom=0.18, wspace=0.2)
for ax, run in zip(axes, data['runs']):
    ages = np.array(run['final']['ages']).reshape(data['config']['height'], data['config']['width'])
    ax.imshow(np.minimum(ages, 128), cmap=ListedColormap(data['palette']), vmin=0, vmax=128, interpolation='nearest', extent=(0, 128, 128, 0))
    ax.add_patch(Rectangle((56, 56), 16, 16, fill=False, edgecolor='#ffffff', linestyle='--', linewidth=0.9))
    ax.set_xticks([0, 32, 64, 96, 128])
    ax.set_yticks([0, 32, 64, 96, 128])
    last = run['history'][-1]
    ax.set_title(f"{run['name']}\n{run['rule']} | {last['population']:,} living cells", fontsize=13, pad=12)
    ax.set_xlabel('Grid position')
    ax.set_aspect('equal')
fig.suptitle('Same starting patch, different growth after 128 steps', x=0.06, ha='left', y=1.035, fontsize=16)
fig.text(0.06, 0.92, '128 × 128 grids · empty edges · no noise · seed growth-demo\nDashed boxes mark the shared 16 × 16 starting area. Neither run reached an edge.', fontsize=11)
handles = [Patch(facecolor=stop['color'], edgecolor='#8c988e', label=str(stop['age']) + ('+' if i == len(data['ageScale']) - 1 else '')) for i, stop in enumerate(data['ageScale'])]
fig.legend(handles=handles, loc='lower center', bbox_to_anchor=(0.52, 0.04), ncol=6, frameon=False, title='Cell age in consecutive living steps', fontsize=12, title_fontsize=12)
fig.text(0.06, 0.008, 'One starting patch per rule: an illustration, not an estimate of a universal growth-speed ratio.', fontsize=10)
svg = output / 'age-growth.svg'
fig.savefig(svg, metadata={'Date': None}, bbox_inches='tight', pad_inches=0.15)
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf-8').splitlines()) + '\n', encoding='utf-8', newline='\n')
fig.savefig(output / 'age-growth.png', dpi=150, bbox_inches='tight', pad_inches=0.15)
plt.close(fig)
print('Saved the age-color comparison as SVG and PNG.')
