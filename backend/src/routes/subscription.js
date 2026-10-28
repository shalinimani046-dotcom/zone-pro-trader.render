const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStatus } = require('../services/subscriptions');
const { getDb } = require('../config/firebase');
const router = express.Router();

router.get('/status', requireAuth, async (req, res, next) => {
  try { res.json(await getStatus(req.user.uid)); } catch (e) { next(e); }
});

// Billing history for the logged-in user
router.get('/payments', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection('payments').where('uid', '==', req.user.uid).get();
    const payments = snap.docs
      .map((d) => d.data())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((p) => ({
        paymentId: p.paymentId, planId: p.planId, term: p.term, seats: p.seats,
        amount: p.amountPaise / 100, currency: p.currency, status: p.status, createdAt: p.createdAt,
      }));
    res.json({ payments });
  } catch (e) { next(e); }
});

module.exports = router;
