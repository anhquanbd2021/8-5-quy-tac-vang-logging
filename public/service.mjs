// A tiny checkout service carrying one silent defect: the percent-coupon
// path returns early and drops shipping from the total. The response is
// still `200 ok` — nothing throws, nothing retries. The only way to see it
// is a trace of what the code actually did.
//
// The same service ships three instrumentation builds:
//   'none'        — no logging at all.
//   'naive'       — free-text spam: per-item loop lines, no request ID, and
//                   it leaks the customer email + card fixture into the log.
//   'disciplined' — structured JSON: boundary entry/exit, one decision line,
//                   requestId on every line, PII never logged.
export const SILENT_DEFECT = 'percent-coupon-drops-shipping';
export const MODES = ['none', 'naive', 'disciplined'];

export function checkout(order, { mode = 'disciplined', defect = SILENT_DEFECT, requestId = 'req-?', log } = {}) {
  const emit = typeof log === 'function' ? log : () => {};

  if (mode === 'disciplined') {
    emit(JSON.stringify({
      event: 'checkout.start', requestId,
      itemCount: order.items.length,
      shippingCents: order.shippingCents ?? 0,
      coupon: order.coupon?.code ?? null,
    }));
  } else if (mode === 'naive') {
    emit(`got an order from ${order.customer.email}`);
    emit(`card on file ${order.customer.card}`);
    emit('entering checkout function');
  }

  let subtotalCents = 0;
  order.items.forEach((item, i) => {
    subtotalCents += item.priceCents * item.qty;
    if (mode === 'naive') {
      emit(`loop item ${i} name=${item.name} priceCents=${item.priceCents} qty=${item.qty}`);
      emit(`running subtotal ${subtotalCents}`);
    }
  });

  let discountCents = 0;
  let shippingCents = order.shippingCents ?? 0;

  if (order.coupon?.type === 'percent') {
    discountCents = Math.round((subtotalCents * order.coupon.pct) / 100);
    if (mode === 'disciplined') {
      emit(JSON.stringify({
        event: 'coupon.applied', requestId,
        code: order.coupon.code, kind: 'percent',
        pct: order.coupon.pct, discountCents,
      }));
    } else if (mode === 'naive') {
      emit(`applying coupon ${order.coupon.code}`);
      emit(`discount is ${discountCents}`);
    }
    if (defect === SILENT_DEFECT) {
      // THE SILENT BUG: this path returns before shipping is added back.
      // `shippingCents` still holds the input value — the response just
      // never uses it. No exception, no retry, HTTP 200.
      const totalCents = subtotalCents - discountCents;
      if (mode === 'disciplined') {
        emit(JSON.stringify({
          event: 'checkout.done', requestId,
          subtotalCents, discountCents, shippingCents: 0, totalCents,
        }));
      } else if (mode === 'naive') {
        emit(`done total ${totalCents}`);
      }
      return { ok: true, status: 200, subtotalCents, discountCents, shippingCents: 0, totalCents };
    }
  } else if (order.coupon?.type === 'freeship') {
    shippingCents = 0;
    if (mode === 'disciplined') {
      emit(JSON.stringify({ event: 'coupon.applied', requestId, code: order.coupon.code, kind: 'freeship', shippingCents }));
    } else if (mode === 'naive') {
      emit('free shipping coupon applied');
    }
  } else if (mode === 'naive') {
    emit('no coupon path');
  }

  const totalCents = subtotalCents - discountCents + shippingCents;
  if (mode === 'disciplined') {
    emit(JSON.stringify({ event: 'checkout.done', requestId, subtotalCents, discountCents, shippingCents, totalCents }));
  } else if (mode === 'naive') {
    emit(`done total ${totalCents}`);
  }
  return { ok: true, status: 200, subtotalCents, discountCents, shippingCents, totalCents };
}

// Independent oracle: what the total *should* have been. Used by the CLI
// report to state ground truth — the hunter itself detects the anomaly
// from the log trace alone, the way an on-call would.
export function expectedTotalCents(order) {
  const subtotalCents = order.items.reduce((s, i) => s + i.priceCents * i.qty, 0);
  const discountCents = order.coupon?.type === 'percent'
    ? Math.round((subtotalCents * order.coupon.pct) / 100)
    : 0;
  const shippingCents = order.coupon?.type === 'freeship' ? 0 : (order.shippingCents ?? 0);
  return subtotalCents - discountCents + shippingCents;
}
