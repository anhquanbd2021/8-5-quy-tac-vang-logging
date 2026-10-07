# Silent Bug Hunter — companion demo

Interactive lab for the article *5 Golden Logging Rules: The Skill That
Catches Every Silent Bug*. A fake checkout service ships one silent defect —
the percent-coupon path returns early and drops shipping from the total.
Nothing throws; every response is `200 ok`. The lab replays the same six
orders through three instrumentation builds and scores which trace makes the
bug visible:

| Mode | Emits | Result |
|---|---|---|
| `none` | zero lines | bug invisible — all you have is "200 OK" |
| `naive` | free-text spam, per-item loop lines, no `requestId`, customer email + test card in clear text | bug invisible *and* PII leaked — nothing to join, nothing to recompute |
| `disciplined` | structured JSON: `checkout.start` / `coupon.applied` / `checkout.done` with `requestId` and cent-denominated fields | bug caught — the trace contradicts itself (input shipping 900, no freeship decision, charged shipping 0) |

Zero dependencies — Node 20+ only. The service, the three loggers, and the
hunter are plain ES modules shared by the browser UI, the CLI, and the test
suite.

## How detection works

The hunter never runs an oracle next to the service. It joins the
disciplined lane's lines by `requestId` and replays the arithmetic from the
logged fields: entry records `shippingCents`, the decision record tells you
whether a `freeship` coupon legitimately zeroed it, and exit records the
charged components. `expected = subtotal − discount + expectedShipping` —
any mismatch is the silent bug. The other lanes can't be reconstructed at
all.

## Run it

```text
npm start         # serve the lab on :3000 (PORT env to change)
npm test          # service + loggers + hunter + server + fixture sync
npm run report    # side-by-side CLI report on examples/ with assertions
npm run check     # both
```

## Files

- `public/service.mjs` — checkout service; `defect` flag toggles the silent
  bug; `expectedTotalCents` is the independent oracle (CLI ground truth).
- `public/hunter.mjs` — replays workloads, reconstructs requests from lines
  alone, reports anomalies + PII leaks + queryable ratio.
- `public/scenarios.mjs` — the six-order workload, mirrored from
  `examples/orders.json` (fixture-sync test enforces it).
- `examples/` — `orders.json`, `service.buggy.json`, `service.fixed.json`.
  Cards are the canonical Stripe test number — obviously fake fixtures.
- `scripts/hunt-report.mjs` — prints the mode comparison and exits 1 if the
  disciplined lane ever stops catching the bug.

## Honest limits

- The anomaly checker knows this service's fields (`subtotalCents`,
  `shippingCents`, …). The rule that generalizes is "log enough structured
  context to replay what happened"; the assertions are demo-sized.
- Real structured logging also needs levels, sampling, and a pipeline —
  this lab models the *contract*, not the infrastructure.
- "Caught" means a reader could reconstruct the discrepancy from the trace;
  it does not mean an alert fired. Wiring the check into an alerting loop
  is out of scope.

This is an educational demo, not production infrastructure.
