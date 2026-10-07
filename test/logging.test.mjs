import test from 'node:test';
import assert from 'node:assert/strict';
import { runHunt } from '../public/hunter.mjs';
import { ORDERS, BUGGY_CONFIG } from '../public/scenarios.mjs';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const CARD_RE = /\b\d{13,19}\b/;

test('none mode emits zero lines', () => {
  const run = runHunt(ORDERS, { mode: 'none', defect: BUGGY_CONFIG.defect });
  assert.equal(run.lines.length, 0);
});

test('naive mode is spammy, unjoinable, and leaks PII', () => {
  const run = runHunt(ORDERS, { mode: 'naive', defect: BUGGY_CONFIG.defect });
  const disc = runHunt(ORDERS, { mode: 'disciplined', defect: BUGGY_CONFIG.defect });
  assert.ok(run.lines.length > disc.lines.length * 2, 'naive should be far noisier');
  assert.ok(run.lines.some((l) => EMAIL_RE.test(l)), 'email leaks');
  assert.ok(run.lines.some((l) => CARD_RE.test(l)), 'card fixture leaks');
  assert.equal(run.analysis.queryableLines, 0, 'no requestId/event fields to join on');
});

test('disciplined mode: every line is JSON with requestId and event', () => {
  const run = runHunt(ORDERS, { mode: 'disciplined', defect: BUGGY_CONFIG.defect });
  assert.equal(run.lines.length, ORDERS.length * 2 + 4, 'entry+exit each, +4 coupon decisions');
  for (const line of run.lines) {
    const p = JSON.parse(line); // throws if not JSON — that is the test
    assert.match(p.requestId, /^req-\d{3}$/);
    assert.ok(['checkout.start', 'coupon.applied', 'checkout.done'].includes(p.event));
    assert.ok(!EMAIL_RE.test(line) && !CARD_RE.test(line), 'no PII in disciplined lines');
  }
});

test('disciplined exit lines carry enough fields to recompute the total', () => {
  const run = runHunt(ORDERS, { mode: 'disciplined', defect: BUGGY_CONFIG.defect });
  const done = run.lines.map(JSON.parse).filter((e) => e.event === 'checkout.done');
  for (const e of done) {
    for (const f of ['subtotalCents', 'discountCents', 'shippingCents', 'totalCents']) {
      assert.ok(Number.isInteger(e[f]), `${e.requestId} missing ${f}`);
    }
  }
});
