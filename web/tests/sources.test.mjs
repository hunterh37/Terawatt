// Source and copy hygiene: every source id resolves, and no em-dash ships. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SOURCES } from '../src/data/sources.js';
import { CATALOG } from '../src/data/catalog.js';
import { PARAMS } from '../src/engine/engine.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'vendor', 'private', 'test-results', 'playwright-report']);
const TEXT = /\.(js|mjs|html|css|md|svg|json|txt)$/;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory()) walk(p, out); else if (TEXT.test(name)) out.push(p);
  }
  return out;
}

test('every catalog src and src_<field> names a source', () => {
  const missing = [];
  (function visit(o, path) {
    if (Array.isArray(o)) return o.forEach((x, i) => visit(x, `${path}[${i}]`));
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if ((k === 'src' || k.startsWith('src_')) && typeof v === 'string' && !SOURCES[v]) missing.push(`${path}.${k} = ${v}`);
      visit(v, `${path}.${k}`);
    }
  })(CATALOG, 'CATALOG');
  assert.deepEqual(missing, []);
});

test('every engine PARAM names a source', () => {
  assert.deepEqual(PARAMS.filter((p) => !SOURCES[p.sourceId]).map((p) => p.path), []);
});

test('every external source has a URL; every assumption says why', () => {
  for (const [id, s] of Object.entries(SOURCES)) {
    if (s.kind === 'external' && !['ext.sentiment', 'ext.existing'].includes(id)) assert.ok(s.url, `${id} url`);
    if (s.kind === 'assumption') assert.ok(s.why, `${id} why`);
    assert.ok(s.label, `${id} label`);
  }
});

test('every sourceId and data-src string in UI, level and PRD code exists', () => {
  const files = walk(ROOT).filter((p) => /\/(src|prd)\//.test(p));
  const bad = [];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    for (const re of [/sourceId:\s*['"`]([a-z0-9_.-]+)['"`]/gi, /data-src=["']([a-z0-9_.-]+)["']/gi, /sourceBadge\(\s*['"`]([a-z0-9_.-]+)['"`]/gi]) {
      for (const m of t.matchAll(re)) if (!SOURCES[m[1]]) bad.push(`${relative(ROOT, f)}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no em-dash in any shipped text file', () => {
  const hits = walk(ROOT).filter((f) => readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014))).map((f) => relative(ROOT, f));
  assert.deepEqual(hits, []);
});

test('private inputs are git-ignored', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /notes\/private\//);
  assert.ok(existsSync(join(ROOT, 'LICENSE')));
});
