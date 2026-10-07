import { huntAllModes } from './hunter.mjs';
import { ORDERS, BUGGY_CONFIG, FIXED_CONFIG } from './scenarios.mjs';

const $ = (id) => document.getElementById(id);
const cents = (c) => `$${(c / 100).toFixed(2)}`;

function renderOrders() {
  $('order-list').innerHTML = ORDERS.map((o) => {
    const coupon = o.coupon ? `${o.coupon.code} (${o.coupon.type}${o.coupon.pct ? ` ${o.coupon.pct}%` : ''})` : 'no coupon';
    return `<li><strong>${o.id}</strong> — ${o.items.length} line${o.items.length > 1 ? 's' : ''}, ship ${cents(o.shippingCents)}, ${coupon}</li>`;
  }).join('');
}

function statsFor(analysis) {
  return `${analysis.totalLines} lines · ${Math.round(analysis.queryableRatio * 100)}% queryable · ${analysis.piiLeaks} PII leaks`;
}

function verdictClass(v) { return v === 'caught' ? 'pass' : 'fail'; }

function run() {
  const defect = $('defect').checked ? BUGGY_CONFIG.defect : FIXED_CONFIG.defect;
  const runs = huntAllModes(ORDERS, { defect });

  for (const mode of ['none', 'naive', 'disciplined']) {
    const run = runs[mode];
    $(`log-${mode}`).textContent = run.lines.length ? run.lines.join('\n') : '(silence — nothing was logged)';
    $(`stats-${mode}`).textContent = statsFor(run.analysis);
    $(`stats-${mode}`).className = `badge ${verdictClass(run.analysis.verdict)}`;
  }

  $('scoreboard').innerHTML = Object.entries(runs).map(([mode, run]) => {
    const a = run.analysis;
    return `<tr><td><strong>${mode}</strong></td><td>${a.totalLines}</td><td>${Math.round(a.queryableRatio * 100)}%</td><td>${a.piiLeaks}</td><td>${a.reconstructed}/${a.requests}</td><td><span class="badge ${verdictClass(a.verdict)}">${a.verdict}</span></td></tr>`;
  }).join('');

  const anomalies = runs.disciplined.analysis.anomalies;
  $('anomalies').innerHTML = anomalies.length
    ? anomalies.map((a) => `<li class="result fail"><div class="result-head"><span class="badge fail">silent bug</span><strong>${a.requestId}</strong></div>
        <p>Charged <strong>${cents(a.actual)}</strong> but the logged fields imply <strong>${cents(a.expected)}</strong> — input shipping ${cents(a.inputShipping)} became logged shipping ${cents(a.loggedShipping)} (Δ ${cents(-a.deltaCents)}).</p>
        <p class="fix">Caught without an oracle: entry says shipping ${cents(a.inputShipping)}, no freeship decision, exit charges ${cents(a.loggedShipping)}.</p></li>`).join('')
    : `<li class="result pass"><div class="result-head"><span class="badge pass">clean</span><strong>no anomalies</strong></div><p>Every request reconstructs consistently — the defect toggle is off, or the trace would have flagged it.</p></li>`;

  const caught = Object.values(runs).filter((r) => r.analysis.verdict === 'caught').length;
  $('verdict-badge').textContent = `${caught}/3 modes caught it`;
  $('verdict-badge').className = `badge ${caught === 1 && runs.disciplined.analysis.verdict === 'caught' ? 'pass' : 'warn'}`;
}

renderOrders();
$('run').addEventListener('click', run);
run();
