const express = require('express');
const { getDb } = require('../config/firebase');
const { verifyWebhookSignature } = require('../services/razorpay');
const { activateFromPayment } = require('../services/subscriptions');

const router = express.Router();

/**
 * Razorpay -> server. Mounted with express.raw() so the signature is computed over the
 * exact bytes Razorpay sent. This is the source of truth: it activates subscriptions even
 * if the customer closes the tab right after paying.
 */
router.post('/', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body; // Buffer
  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: 'bad_signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'bad_json' }); }

  const db = getDb();
  const eventId = req.headers['x-razorpay-event-id'] || `${event.event}_${event.created_at}_${(event.payload && event.payload.payment && event.payload.payment.entity && event.payload.payment.entity.id) || ''}`;
  const eventRef = db.collection('webhook_events').doc(String(eventId).replace(/\//g, '_'));

  try {
    if ((await eventRef.get()).exists) return res.json({ ok: true, duplicate: true });

    const payload = event.payload || {};
    const payment = payload.payment && payload.payment.entity;

    switch (event.event) {
      case 'order.paid':
      case 'payment.captured': {
        const orderId = (payload.order && payload.order.entity && payload.order.entity.id) || (payment && payment.order_id);
        if (!orderId || !payment) break;
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) { console.warn('Webhook for unknown order', orderId); break; }
        const order = orderSnap.data();
        if (payment.amount !== order.amountPaise) { console.error('Webhook amount mismatch', orderId); break; }
        await activateFromPayment({ order, orderId, payment, source: 'webhook' });
        break;
      }
      case 'payment.failed': {
        if (!payment) break;
        const orderSnap = payment.order_id ? await db.collection('orders').doc(payment.order_id).get() : null;
        if (orderSnap && orderSnap.exists) {
          const ref = db.collection('payments').doc(payment.id);
          const existing = await ref.get();
          if (!existing.exists || existing.data().status !== 'paid') {
            await ref.set({
              paymentId: payment.id, orderId: payment.order_id, uid: orderSnap.data().uid,
              planId: orderSnap.data().planId, term: orderSnap.data().term, seats: orderSnap.data().seats,
              amountPaise: payment.amount, currency: payment.currency || 'INR',
              status: 'failed', reason: (payment.error_description || '').slice(0, 200), createdAt: Date.now(),
            }, { merge: true });
          }
        }
        break;
      }
      case 'refund.processed': {
        const refund = payload.refund && payload.refund.entity;
        if (!refund) break;
        const payRef = db.collection('payments').doc(refund.payment_id);
        const paySnap = await payRef.get();
        if (!paySnap.exists) break;
        const p = paySnap.data();
        await payRef.set({ status: 'refunded', refundedAt: Date.now() }, { merge: true });
        const subRef = db.collection('subscriptions').doc(p.uid);
        const sub = await subRef.get();
        if (sub.exists && sub.data().lastPaymentId === p.paymentId) {
          await subRef.set({ status: 'cancelled', endAt: Date.now(), updatedAt: Date.now() }, { merge: true });
        }
        break;
      }
      default:
        break; // ignore other events
    }

    await eventRef.set({ type: event.event, processedAt: Date.now() });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Webhook processing error', err);
    return res.status(500).json({ error: 'processing_failed' }); // Razorpay will retry
  }
});

module.exports = router;
