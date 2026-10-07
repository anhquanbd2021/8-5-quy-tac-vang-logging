import test from 'node:test';
import assert from 'node:assert/strict';
import { checkout, expectedTotalCents, SILENT_DEFECT } from '../public/service.mjs';
import { ORDERS } from '../public/scenarios.mjs';

test('buggy build answers 200 and never throws — that is what "silent" means', () => {
  for (const order of ORDERS) {
    const res = checkout(order, { mode: 'none', defect: SILENT_DEFECT });
    assert.equal(res.status, 200);
    assert.equal(res.ok, true);
    assert.ok(Number.isInteger(res.totalCents));
  }
});

test('defect drops shipping on percent coupons only', () => {
  const bug = checkout(ORDERS[1], { mode: 'none', defect: SILENT_DEFECT }); // WELCOME10 + $9 shipping
  assert.equal(bug.totalCents, 5900 - 590);           // shipping missing
  assert.equal(expectedTotalCents(ORDERS[1]), 5900 - 590 + 900);
  const bug2 = checkout(ORDERS[3], { mode: 'none', defect: SILENT_DEFECT }); // VIP25 + $15 shipping
  assert.equal(bug2.totalCents, 15300 - 3825);
  assert.equal(expectedTotalCents(ORDERS[3]), 15300 - 3825 + 1500);
});

test('non-trigger orders are unaffected by the defect', () => {
  for (const i of [0, 2, 4, 5]) {
    const res = checkout(ORDERS[i], { mode: 'none', defect: SILENT_DEFECT });
    assert.equal(res.totalCents, expectedTotalCents(ORDERS[i]), ORDERS[i].id);
  }
});

test('fixed build matches the oracle on every order', () => {
  for (const order of ORDERS) {
    const res = checkout(order, { mode: 'none', defect: null });
    assert.equal(res.totalCents, expectedTotalCents(order), order.id);
  }
});

test('freeship coupon legitimately zeroes shipping', () => {
  const res = checkout(ORDERS[2], { mode: 'none', defect: null });
  assert.equal(res.shippingCents, 0);
  assert.equal(res.totalCents, 2400);
});
