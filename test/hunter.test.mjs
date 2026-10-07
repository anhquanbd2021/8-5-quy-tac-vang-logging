import test from 'node:test';
import assert from 'node:assert/strict';
import { runHunt, huntAllModes, analyze } from '../public/hunter.mjs';
import { ORDERS, BUGGY_CONFIG, FIXED_CONFIG } from '../public/scenarios.mjs';

test('only the disciplined trace catches the silent bug', () => {
  const runs = huntAllModes(ORDERS, { defect: BUGGY_CONFIG.defect });
  assert.equal(runs.none.analysis.verdict, 'invisible');
  assert.equal(runs.naive.analysis.verdict, 'invisible');
  assert.equal(runs.disciplined.analysis.verdict, 'caught');
});

test('disciplined anomalies equal ground truth: 2 orders undercharged by shipping', () => {
  const { analysis } = runHunt(ORDERS, { mode: 'disciplined', defect: BUGGY_CONFIG.defect });
  assert.equal(analysis.anomalies.length, 2);
  const byReq = Object.fromEntries(analysis.anomalies.map((a) => [a.requestId, a]));
  assert.equal(byReq['req-002'].deltaCents, -900);   // ORDERS[1] shipping
  assert.equal(byReq['req-004'].deltaCents, -1500);  // ORDERS[3] shipping
});

test('reconstruction is total in disciplined mode, impossible in the others', () => {
  const runs = huntAllModes(ORDERS, { defect: BUGGY_CONFIG.defect });
  assert.equal(runs.disciplined.analysis.reconstructed, ORDERS.length);
  assert.equal(runs.none.analysis.reconstructed, 0);
  assert.equal(runs.naive.analysis.reconstructed, 0);
});

test('fixed service produces zero anomalies — detector does not cry wolf', () => {
  const runs = huntAllModes(ORDERS, { defect: FIXED_CONFIG.defect });
  assert.equal(runs.disciplined.analysis.anomalies.length, 0);
  assert.equal(runs.disciplined.analysis.verdict, 'invisible');
});

test('percent coupon on a zero-shipping order is not a false positive', () => {
  // ORDERS[4] takes the buggy path but shipping was already 0 — nothing lost.
  const { analysis } = runHunt([ORDERS[4]], { mode: 'disciplined', defect: BUGGY_CONFIG.defect });
  assert.equal(analysis.anomalies.length, 0);
});

test('analyze counts PII leaks in naive lines', () => {
  const { analysis } = runHunt(ORDERS, { mode: 'naive', defect: BUGGY_CONFIG.defect });
  assert.ok(analysis.piiLeaks >= ORDERS.length, 'every order leaks at least one PII line');
  assert.ok(analysis.piiSamples.length > 0);
});
