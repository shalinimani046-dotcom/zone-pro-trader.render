const express = require('express');
const { z } = require('zod');
const { getDb } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { computePrice, couponPercent } = require('../config/plans');
const { getRazorpay, verifyPaymentSignature } = require('../services/razorpay');
const { activateFromPayment, getStatus } = require('../services/subscriptions');
const { env } = require('../config/env');

const router = express.Router();

const orderBody = z.object({
  planId: z.enum(['pro', 'team', 'business']),
  term: z.enum(['quarterly', 'yearly']),
  seats: z.number().int().optional(),
  couponCode: z.string().max(30).optional(),
});

router.post('/coupon', requireAuth, (req, res) => {
  const percent = couponPercent(req.body && req.body.code);
  res.json({ valid: percent > 0, percent });
});

/** Step 1: browser asks for an order. The server alone decides the amount. */
router.post('/create-order', requireAuth, async (req, res, next) => {
  try {
    const body = orderBody.parse(req.body);
    const price = computePrice(body);
    if (price.totalPaise < 100) return res.status(400).json({ error: 'invalid_amount' });

    const order = await getRazorpay().orders.create({
      amount: price.totalPaise,
      currency: 'INR',
      receipt: `zp_${Date.now()}`,
      notes: { uid: req.user.uid, planId: price.planId, term: price.term, seats: String(price.seats) },
    });

    await getDb().collection('orders').doc(order.id).set({
      orderId: order.id,
      uid: req.user.uid,
      planId: price.planId,
      term: price.term,
      months: price.months,
      seats: price.seats,
      couponCode: price.couponCode,
      amountPaise: price.totalPaise,
      currency: 'INR',
      status: 'created',
      createdAt: Date.now(),
    });

    res.json({
      keyId: env.razorpay.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      description: `${price.planName} - ${price.term}${price.planId === 'team' ? ` (${price.seats} users)` : ''}`,
      prefill: { name: req.user.name, email: req.user.email },
    });
  } catch (err) { next(err); }
});

const verifyBody = z.object({
  razorpay_order_id: z.string().min(5).max(60),
  razorpay_payment_id: z.string().min(5).max(60),
  razorpay_signature: z.string().min(10).max(200),
});

/** Step 2: browser reports success. We verify the signature AND re-check with Razorpay. */
router.post('/verify', requireAuth, async (req, res, next) => {
  try {
    const b = verifyBody.parse(req.body);
    const orderRef = getDb().collection('orders').doc(b.razorpay_order_id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data().uid !== req.user.uid) {
      return res.status(404).json({ error: 'order_not_found' });
    }
    const order = orderSnap.data();

    if (!verifyPaymentSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) {
      return res.status(400).json({ error: 'bad_signature', message: 'Payment verification failed.' });
    }

    const rzp = getRazorpay();
    let payment = await rzp.payments.fetch(b.razorpay_payment_id);
    if (payment.order_id !== order.orderId || payment.amount !== order.amountPaise) {
      return res.status(400).json({ error: 'payment_mismatch' });
    }
    if (payment.status === 'authorized') {
      payment = await rzp.payments.capture(payment.id, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return res.status(402).json({ error: 'not_captured', message: `Payment status: ${payment.status}` });
    }

    await activateFromPayment({ order, orderId: order.orderId, payment, source: 'verify' });
    res.json({ success: true, subscription: await getStatus(req.user.uid) });
  } catch (err) { next(err); }
});

module.exports = router;
