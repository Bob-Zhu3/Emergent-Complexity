# Emergent Complexity

A browser laboratory and reproducible experiment set for George Tsoukalas's initial assignment. Built with AI assistance; the implementation and experimental design are documented in [the report](REPORT.md).

**[Open the laboratory](https://bob-zhu3.github.io/Emergent-Complexity/)** · **[Explore the experiments](https://bob-zhu3.github.io/Emergent-Complexity/research.html)** · **[Read the report](REPORT.md)**

## Run locally

Use Node.js 22 or later. No package installation is required for the app or experiments.

```text
npm start
```

Open http://127.0.0.1:4173. Use an HTTP server rather than opening the HTML directly: browser modules, data fetching, and the survey worker require it.

## What you can do

- Draw or erase cells; run, pause, step, reset, and adjust speed.
- Color cells by consecutive living age, from white through orange, yellow, green, cyan, and blue. The fixed key ends at 128+ steps; point to a cell to read its exact age.
- Edit all nine birth and nine survival conditions; switch between Life, HighLife, and custom rules.
- Set grid size, initial density, seed, boundary behavior, and random-flip probability. Start across the whole grid or inside a centered 16 × 16 patch to watch outward growth.
- Load a block, blinker, glider, R-pentomino, or HighLife replicator.
- Save a PNG with its color key or a complete JSON snapshot; reload a snapshot for exact continuation, including cell ages and future noise. Older snapshots start a new, explicitly labeled age history at their saved generation.
- Inspect all 100 sampled rules and their six starts, replay any recorded run, or rerun the survey in a background worker.
- Compare density, boundary, and noise experiments with downloadable measurements.

On the canvas, dragging toggles a starting cell and paints that same state along the stroke. Arrow keys move the editing cursor; Enter or Space toggles its cell. Editing pauses the simulation and starts a new trajectory at generation zero. The seed and density fields control the next random start; changing them alone does not replace the displayed grid. Reset restores the trajectory's saved start. A loaded snapshot becomes a new reset point at its saved generation.

## Reproduce the research

```text
npm test
npm run experiment
npm run age-demo
npm run report
npm run check
```

The project includes **1,992 recorded simulation runs**: 600 for the random-rule survey, 50 for Life/HighLife density comparisons, 56 for the selected rule, 960 for pattern noise, 324 for noise in random worlds, and 2 for the age-color growth comparison. The examples in the pattern catalog are not included in this total. Experiments use the same engine as the website and write deterministic JSON/CSV artifacts to `dist/data/`. Their seeds and settings are in the data and report. Runtime depends on the computer; the simulation runs synchronously in the Node script, and in a worker when launched from the experiments page.

For the scientific figures only, use Python 3.10 or later with Matplotlib and NumPy:

```text
python -m pip install -r requirements-report.txt
python scripts/figures.py
python scripts/age-figure.py
```

This regenerates the SVG and PNG figures in `dist/figures/`. Regenerate figures and the report after changing the experimental data. Precomputed artifacts are committed, so neither Python nor a build tool is needed to use the website.

The two age-color runs are included in the total of 1,992. They start Life without Death and Coral from the same centered patch and record their population, occupied region, and final cell ages in `dist/data/age-demo.json`. The report uses these measurements to compare how the two runs spread and explain what the colors can and cannot tell us about growth speed. Background references are listed in the report.

## How the code fits together

| File | Responsibility |
| --- | --- |
| `dist/lib/engine.js` | Binary grid, cell ages, rule parsing, simultaneous updates, seeded randomness, noise, and snapshots |
| `dist/lib/colors.js` | Fixed age-color scale shared by the lab and saved demonstration figure |
| `dist/lib/patterns.js` | Small known seeds and centered placement |
| `dist/lib/analysis.js` | Random-rule sampling, exact cycle detection, run measurements, and pattern-noise experiments |
| `dist/lib/launch.js` | Validated replay links that reconstruct recorded starts |
| `dist/app.js` | Canvas drawing, playback, controls, live measurements, import/export |
| `dist/research.js` | Survey table, run inspection, replay links, and worker controls |
| `dist/survey-worker.js` | Browser background survey using the shared analysis code |
| `scripts/experiments.mjs` | Complete reproducible batch experiment |
| `scripts/age-demo.mjs` | Matched starting patches and measurements for the age-color demonstration |
| `scripts/age-figure.py` | Age-color comparison from the saved demonstration data |
| `scripts/report.mjs` | Markdown and HTML report generated from measurements |
| `scripts/figures.py` | Standalone scientific figures from the recorded data |
| `test/` | Independent reference-engine checks and experiment/replay validation |

There is no framework and no runtime dependency. The authored site lives in `dist/`; it is the source for this static project, not a disposable build directory. The GitHub Pages workflow tests and checks the committed files before publishing them. It does not rerun the research on every push.

## Scientific interpretation

“Active” means no exact whole-grid repeat was found during the observation window and at least 2% of cells changed per step over its tail. It is not a claim of chaos, intelligence, mobility, or replication. Cycles are confirmed only on the stated finite grid. B0 rules are handled explicitly; an empty grid need not stay empty in those rules.

Noise independently flips each cell **after** the rule update. Pattern fidelity compares the expected living cells and their immediate neighbors with the noisy trajectory. A mismatch can mean a phase shift or a damaged copy, not necessarily total destruction. Different pattern sizes and exposure times affect this measurement. See the report for exact definitions, confidence intervals, and limitations.

The optional WebMCP interface is feature-detected through `document.modelContext`. Supported browsers can read the world, load a known pattern, and advance it using the same state and actions as the visible controls. It does not provide access to local files or external services. General browser visual/click QA is separate from the engine and static checks.

## Assignment status and attribution

The implementation covers Tasks 1-3, Option B of Task 4, and the experimental/report artifact for Task 5. Bob still needs to review the introductory material and complete his personal reflections. The report credits his proposal to add age coloring and discloses the AI implementation, experimental design, execution, and drafting.

The HighLife replicator seed comes from [David Eppstein's pattern notation page](https://ics.uci.edu/~eppstein/ca/lifelike.html). The assignment PDF and slide deck were used as references and are not redistributed in this repository.
