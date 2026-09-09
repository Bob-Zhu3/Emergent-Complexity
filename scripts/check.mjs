import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, dirname, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
  return groups.flat();
}
const sources = (await Promise.all(['dist', 'scripts', 'test'].map(directory => files(resolve(root, directory))))).flat();
const scripts = sources.filter(path => ['.js', '.mjs'].includes(extname(path)));
for (const path of scripts) execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
let links = 0;
for (const path of sources.filter(path => extname(path) === '.html')) {
  const html = await readFile(path, 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(value)) continue;
    const url = new URL(value, `https://local.test/${relative(dist, path).split(sep).join('/')}`);
    let target = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    assert.ok(target === dist || target.startsWith(dist + sep));
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    assert.ok((await stat(target)).isFile(), `${value} in ${path}`);
    if (url.hash && extname(target) === '.html') {
      const body = await readFile(target, 'utf8');
      assert.ok(body.includes(`id="${url.hash.slice(1)}"`), `Missing fragment ${value}`);
    }
    links++;
  }
}
for (const path of scripts) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g)) assert.ok((await stat(resolve(dirname(path), match[1]))).isFile());
}
for (const entry of ['index.html', 'research.html', 'report.html', 'app.js', 'research.js', 'survey-worker.js']) assert.ok((await stat(resolve(dist, entry))).size > 0);
const manifest = JSON.parse((await readFile(resolve(root, '.openai/hosting.json'), 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(manifest.static.directory, 'dist');
assert.ok(manifest.project_id);
process.stdout.write(`Checked ${scripts.length} JavaScript files, three page entry points, and ${links} local asset/link references.\n`);
