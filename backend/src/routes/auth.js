const express = require('express');
const { z } = require('zod');
const { getDb, getAuth } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { COOKIE } = require('../middleware/pageGuard');
const { getStatus } = require('../services/subscriptions');
const { env } = require('../config/env');

const router = express.Router();
const SESSION_MS = 5 * 24 * 60 * 60 * 1000;
const clean = (s, max) => String(s || '').replace(/[<>]/g, '').trim().slice(0, max);
const sessionBody = z.object({ name: z.string().max(100).optional() }).default({});

async function summary(req) {
  const out = {
    isAdmin: req.user.isAdmin,
    accessUntil: req.user.accessUntil,
    paymentsEnabled: env.paymentsEnabled,
  };
  if (env.paymentsEnabled) out.subscription = await getStatus(req.user.uid);
  return out;
}

/**
 * Called by the login page right after Firebase signs the user in. requireAuth has ALREADY
 * confirmed the admin approved this email (otherwise the user got a 403 and never reaches here).
 * Sets an HttpOnly cookie so the server can protect the HTML pages too.
 */
router.post('/session', requireAuth, async (req, res, next) => {
  try {
    const body = sessionBody.parse(req.body || {});
    const ref = getDb().collection('users').doc(req.user.uid);
    const snap = await ref.get();
    const now = Date.now();
    const name = clean(req.user.approvedName || req.user.name || body.name || req.user.email.split('@')[0] || 'Trader', 100);

    if (!snap.exists) {
      await ref.set({ uid: req.user.uid, email: req.user.email, name, photo: req.user.picture, provider: req.user.provider, createdAt: now, lastLoginAt: now });
    } else {
      await ref.set({ email: req.user.email, photo: req.user.picture, provider: req.user.provider, lastLoginAt: now }, { merge: true });
    }
    const user = (await ref.get()).data();

    const cookie = await getAuth().createSessionCookie(req.idToken, { expiresIn: SESSION_MS });
    res.cookie(COOKIE, cookie, { maxAge: SESSION_MS, httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });

    res.json({ user: { uid: user.uid, email: user.email, name: user.name, photo: user.photo }, ...(await summary(req)) });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ user: { uid: req.user.uid, email: req.user.email, name: req.user.approvedName || req.user.name }, ...(await summary(req)) });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
  res.json({ success: true });
});

module.exports = router;
