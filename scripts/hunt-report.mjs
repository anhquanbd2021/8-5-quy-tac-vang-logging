// Side-by-side report: replay the workload through all three logging modes
// and score which instrumentation makes the silent bug visible.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { huntAllModes } from '../public/hunter.mjs';
import { checkout, expectedTotalCents } from '../public/service.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { orders } = JSON.parse(await readFile(`${root}examples/orders.json`, 'utf8'));
const buggy = JSON.parse(await readFile(`${root}examples/service.buggy.json`, 'utf8'));
const fixed = JSON.parse(await readFile(`${root}examples/service.fixed.json`, 'utf8'));

// Ground truth: run the buggy build silently and diff against the oracle.
const truth = orders.map((order) => {
  const expected = expectedTotalCents(order);
  const actual = checkout(order, { mode: 'none', defect: buggy.defect }).totalCents;
  return { order, expected, actual, shouldFlag: expected !== actual };
});

console.log('Silent Bug Hunter — three logging modes, one silent defect\n');
console.log(`Workload: ${orders.length} orders · defect: ${buggy.defect}`);
console.log(`Ground truth: ${truth.filter(t => t.shouldFlag).length} orders carry a wrong total\n`);

const runs = huntAllModes(orders, { defect: buggy.defect });

console.log(`${'mode'.padEnd(13)}${'lines'.padStart(7)}${'queryable'.padStart(11)}${'PII leaks'.padStart(11)}${'reconstructed'.padStart(15)}${'anomalies'.padStart(11)}  verdict`);
for (const [mode, run] of Object.entries(runs)) {
  const a = run.analysis;
  console.log(`${mode.padEnd(13)}${String(a.totalLines).padStart(7)}${`${Math.round(a.queryableRatio * 100)}%`.padStart(11)}${String(a.piiLeaks).padStart(11)}${`${a.reconstructed}/${a.requests}`.padStart(15)}${String(a.anomalies.length).padStart(11)}  ${a.verdict}`);
}

const d = runs.disciplined.analysis;
if (d.anomalies.length) {
  console.log('\nAnomalies reconstructed from the disciplined trace:');
  for (const a of d.anomalies) {
    console.log(`  ${a.requestId}: charged ${a.actual} but logged fields imply ${a.expected} (Δ ${a.deltaCents}¢ — input shipping ${a.inputShipping} became logged shipping ${a.loggedShipping})`);
  }
}

// Control run: fixed service + disciplined logging must flag nothing.
const control = huntAllModes(orders, { defect: fixed.defect });
console.log(`\nControl (fixed service, disciplined logging): ${control.disciplined.analysis.anomalies.length} anomalies`);

// Hard assertions — the whole point in one table.
const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };
expect(runs.none.analysis.totalLines === 0, 'none mode should emit zero lines');
expect(runs.none.analysis.verdict === 'invisible', 'none mode must not catch the bug');
expect(runs.naive.analysis.verdict === 'invisible', 'naive mode must not catch the bug');
expect(runs.naive.analysis.piiLeaks > 0, 'naive mode must leak PII fixtures');
expect(runs.naive.analysis.queryableRatio < 0.5, 'naive lines should be mostly unqueryable');
expect(d.verdict === 'caught', 'disciplined mode must catch the bug');
expect(d.anomalies.length === truth.filter(t => t.shouldFlag).length, 'disciplined anomalies must equal ground truth');
expect(d.reconstructed === orders.length, 'disciplined mode must reconstruct every request');
expect(d.piiLeaks === 0, 'disciplined mode must leak zero PII');
expect(control.disciplined.analysis.anomalies.length === 0, 'fixed service must produce zero anomalies');

if (failures.length) {
  console.error('\nFAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll assertions passed — only the disciplined trace catches the silent bug.');
