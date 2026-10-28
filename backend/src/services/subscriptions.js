const { getDb } = require('../config/firebase');

function addMonths(timestampMs, months) {
  const d = new Date(timestampMs);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay)); // Jan 31 + 1 month -> Feb 28/29, not Mar 3
  return d.getTime();
}

/** Subscription state, computed at read time so expiry needs no cron job. */
async function getStatus(uid) {
  const snap = await getDb().collection('subscriptions').doc(uid).get();
  if (!snap.exists) return { active: false, status: 'none' };
  const s = snap.data();
  const now = Date.now();
  const active = s.status === 'active' && Number(s.endAt) > now;
  return {
    active,
    status: active ? 'active' : (s.status === 'cancelled' ? 'cancelled' : 'expired'),
    planId: s.planId,
    term: s.term,
    seats: s.seats,
    startAt: s.startAt,
    endAt: s.endAt,
    daysLeft: active ? Math.ceil((s.endAt - now) / 86400000) : 0,
  };
}

/**
 * Idempotent: safe to call from BOTH the browser verify step and the webhook.
 * The payment document id is the gateway payment id, so the same payment can only
 * extend a subscription once.
 */
async function activateFromPayment({ order, orderId, payment, source }) {
  const db = getDb();
  const paymentRef = db.collection('payments').doc(payment.id);
  const orderRef = db.collection('orders').doc(orderId);
  const subRef = db.collection('subscriptions').doc(order.uid);

  return db.runTransaction(async (tx) => {
    const paySnap = await tx.get(paymentRef);
    if (paySnap.exists && paySnap.data().status === 'paid') {
      return { alreadyProcessed: true };
    }
    const subSnap = await tx.get(subRef);
    const now = Date.now();
    const current = subSnap.exists ? subSnap.data() : null;
    // Renewing while still active extends from the current end date (no lost days).
    const startFrom = current && current.status === 'active' && current.endAt > now ? current.endAt : now;
    const endAt = addMonths(startFrom, order.months);

    tx.set(subRef, {
      uid: order.uid,
      planId: order.planId,
      term: order.term,
      seats: order.seats,
      status: 'active',
      startAt: current && startFrom > now ? current.startAt : now,
      endAt,
      lastPaymentId: payment.id,
      updatedAt: now,
    });
    tx.set(paymentRef, {
      paymentId: payment.id,
      orderId,
      uid: order.uid,
      planId: order.planId,
      term: order.term,
      seats: order.seats,
      couponCode: order.couponCode || '',
      amountPaise: payment.amount,
      currency: payment.currency || 'INR',
      method: payment.method || '',
      status: 'paid',
      source, // 'verify' | 'webhook'
      createdAt: now,
    });
    tx.set(orderRef, { status: 'paid', paymentId: payment.id, paidAt: now }, { merge: true });
    return { alreadyProcessed: false, endAt };
  });
}

module.exports = { addMonths, getStatus, activateFromPayment };
