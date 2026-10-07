import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ORDERS, BUGGY_CONFIG, FIXED_CONFIG } from '../public/scenarios.mjs';
import { runHunt } from '../public/hunter.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('embedded workload mirrors examples/orders.json', async () => {
  const fixture = JSON.parse(await readFile(`${root}examples/orders.json`, 'utf8'));
  assert.deepEqual(fixture.orders, ORDERS);
});

test('service config fixtures drive the defect switch', async () => {
  const buggy = JSON.parse(await readFile(`${root}examples/service.buggy.json`, 'utf8'));
  const fixed = JSON.parse(await readFile(`${root}examples/service.fixed.json`, 'utf8'));
  assert.equal(buggy.defect, BUGGY_CONFIG.defect);
  assert.equal(fixed.defect, FIXED_CONFIG.defect);
  const buggyRun = runHunt(ORDERS, { mode: 'disciplined', defect: buggy.defect });
  const fixedRun = runHunt(ORDERS, { mode: 'disciplined', defect: fixed.defect });
  assert.equal(buggyRun.analysis.anomalies.length, 2);
  assert.equal(fixedRun.analysis.anomalies.length, 0);
});
