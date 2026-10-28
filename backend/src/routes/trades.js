const express = require('express');
const { getDb } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const t = req.body || {};
    const trade = {
      uid: req.user.uid,
      symbol: str(t.symbol, 40).toUpperCase(),
      type: str(t.type, 20),
      capital: num(t.capital),
      pnl: num(t.pnl),
      date: str(t.date, 20),
      status: str(t.status, 20),
      notes: str(t.notes, 2000),
      createdAt: Date.now(),
    };
    if (!trade.symbol) return res.status(400).json({ error: 'symbol_required' });
    const ref = await getDb().collection('trades').add(trade);
    res.status(201).json({ id: ref.id });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection('trades').where('uid', '==', req.user.uid).get();
    const trades = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ trades });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const ref = getDb().collection('trades').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== req.user.uid) return res.status(404).json({ error: 'not_found' });
    await ref.delete();
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
