const express = require('express');
const { z } = require('zod');
const { getDb } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const strip = (s) => String(s || '').replace(/[<>]/g, '').trim();
const profileBody = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  experience: z.string().max(40).optional(),
}).passthrough();

// The uid always comes from the verified token, never from the request.
router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection('users').doc(req.user.uid).get();
    const u = snap.exists ? snap.data() : {};
    res.json({ profile: {
      uid: req.user.uid, email: req.user.email, name: u.name || req.user.name,
      firstName: u.firstName || '', lastName: u.lastName || '', phone: u.phone || '', experience: u.experience || '',
    } });
  } catch (e) { next(e); }
});

router.post('/profile', requireAuth, async (req, res, next) => {
  try {
    const b = profileBody.parse(req.body || {});
    const firstName = strip(b.firstName);
    const lastName = strip(b.lastName);
    const update = {
      firstName, lastName,
      name: `${firstName} ${lastName}`.trim() || strip(req.user.name) || 'Trader',
      phone: strip(b.phone), experience: strip(b.experience), updatedAt: Date.now(),
    };
    await getDb().collection('users').doc(req.user.uid).set(update, { merge: true });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
