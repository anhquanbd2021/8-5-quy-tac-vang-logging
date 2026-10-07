// Silent Bug Hunter — replays a workload through the checkout service under
// one logging mode, then tries to reconstruct each request from the emitted
// lines alone. This is the on-call's job: given only what was logged, can
// you prove what the code did?
import { checkout, MODES } from './service.mjs';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const CARD_RE = /\b\d{13,19}\b/;
const SECRET_RE = /\b(?:token|secret|password|apikey|api_key|card)\b/i;

export function runHunt(orders, { mode = 'disciplined', defect } = {}) {
  if (!MODES.includes(mode)) throw new RangeError(`unknown mode: ${mode}`);
  const lines = [];
  const responses = orders.map((order, i) =>
    checkout(order, {
      mode, defect,
      requestId: `req-${String(i + 1).padStart(3, '0')}`,
      log: (line) => lines.push(line),
    }));
  return { mode, lines, responses, analysis: analyze(lines, orders) };
}

// Detection works the way an on-call would: join the lines by requestId,
// replay the arithmetic from the logged fields, flag what doesn't add up.
export function analyze(lines, orders) {
  const parsed = lines.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  });
  const queryable = parsed.filter((p) => p && typeof p.requestId === 'string' && typeof p.event === 'string');
  const piiLeaks = lines.filter((line) => EMAIL_RE.test(line) || CARD_RE.test(line) || SECRET_RE.test(line));

  const byRequest = new Map();
  for (const p of queryable) {
    if (!byRequest.has(p.requestId)) byRequest.set(p.requestId, []);
    byRequest.set(p.requestId, [...byRequest.get(p.requestId), p]);
  }

  const anomalies = [];
  let reconstructed = 0;
  for (const [requestId, events] of byRequest) {
    const entry = events.find((e) => e.event === 'checkout.start');
    const done = events.find((e) => e.event === 'checkout.done');
    if (!entry || !done) continue;
    reconstructed += 1;
    // A freeship coupon legitimately zeroes shipping; anything else that
    // changes shipping between boundary entry and exit is the silent bug.
    const freeship = events.some((e) => e.event === 'coupon.applied' && e.kind === 'freeship');
    const expectedShipping = freeship ? 0 : entry.shippingCents;
    const expected = done.subtotalCents - done.discountCents + expectedShipping;
    if (expected !== done.totalCents) {
      anomalies.push({
        requestId,
        expected, actual: done.totalCents,
        deltaCents: done.totalCents - expected,
        loggedShipping: done.shippingCents,
        inputShipping: entry.shippingCents,
      });
    }
  }

  return {
    totalLines: lines.length,
    queryableLines: queryable.length,
    queryableRatio: lines.length ? queryable.length / lines.length : 0,
    piiLeaks: piiLeaks.length,
    piiSamples: piiLeaks.slice(0, 3),
    reconstructed,
    requests: orders.length,
    anomalies,
    verdict: anomalies.length ? 'caught' : 'invisible',
  };
}

export function huntAllModes(orders, { defect } = {}) {
  return Object.fromEntries(MODES.map((mode) => [mode, runHunt(orders, { mode, defect })]));
}
