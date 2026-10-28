const express = require('express');
const { z } = require('zod');
const { getDb, getAuth } = require('../config/firebase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { env } = require('../config/env');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const email = z.string().trim().toLowerCase().email().max(120).refine((e) => !e.includes('/'), 'invalid email');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

// "2027-03-31" -> end of that day in India time; null/empty -> never expires
const untilMs = (s) => (s ? Date.parse(`${s}T23:59:59+05:30`) : null);

const publicRec = (r) => ({
  email: r.email, name: r.name || '', active: !!r.active, accessUntil: r.accessUntil || null,
  createdAt: r.createdAt, createdBy: r.createdBy || '', isAdmin: env.adminEmails.includes(r.email),
});

router.get('/users', async (req, res, next) => {
  try {
    const snap = await getDb().collection('allowed_users').get();
    const users = snap.docs.map((d) => publicRec(d.data())).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ users });
  } catch (e) { next(e); }
});

const createBody = z.object({
  email,
  name: z.string().trim().max(100).default(''),
  password: z.string().min(8).max(100).optional(),
  accessUntil: dateOnly.optional(),
});

router.post('/users', async (req, res, next) => {
  try {
    const b = createBody.parse(req.body);
    const ref = getDb().collection('allowed_users').doc(b.email);
    if ((await ref.get()).exists) return res.status(409).json({ error: 'exists', message: 'This email is already registered.' });

    const auth = getAuth();
    let fbUser;
    try {
      fbUser = await auth.getUserByEmail(b.email);
      if (b.password) await auth.updateUser(fbUser.uid, { password: b.password });
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      fbUser = await auth.createUser({ email: b.email, displayName: b.name || undefined, password: b.password, emailVerified: false });
    }

    const rec = {
      email: b.email, name: b.name, uid: fbUser.uid, active: true,
      accessUntil: untilMs(b.accessUntil), createdAt: Date.now(), createdBy: req.user.email,
    };
    await ref.set(rec);
    // No password given -> hand the admin a link where the user sets their own password.
    const resetLink = b.password ? null : await auth.generatePasswordResetLink(b.email);
    res.status(201).json({ user: publicRec(rec), resetLink });
  } catch (e) { next(e); }
});

const patchBody = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().max(100).optional(),
  accessUntil: dateOnly.optional(),
});

router.patch('/users/:email', async (req, res, next) => {
  try {
    const target = email.parse(req.params.email);
    const b = patchBody.parse(req.body);
    if (b.active === false && env.adminEmails.includes(target)) {
      return res.status(400).json({ error: 'protected', message: 'Admin accounts cannot be disabled.' });
    }
    const ref = getDb().collection('allowed_users').doc(target);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    const update = {};
    if (b.active !== undefined) update.active = b.active;
    if (b.name !== undefined) update.name = b.name;
    if (b.accessUntil !== undefined) update.accessUntil = untilMs(b.accessUntil);
    await ref.set(update, { merge: true });

    const uid = snap.data().uid;
    if (uid && b.active !== undefined) {
      try {
        await getAuth().updateUser(uid, { disabled: !b.active });
        if (!b.active) await getAuth().revokeRefreshTokens(uid);
      } catch (e) { console.warn('Firebase user update skipped:', e.code || e.message); }
    }
    res.json({ user: publicRec((await ref.get()).data()) });
  } catch (e) { next(e); }
});

router.post('/users/:email/reset-link', async (req, res, next) => {
  try {
    const target = email.parse(req.params.email);
    const snap = await getDb().collection('allowed_users').doc(target).get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    res.json({ resetLink: await getAuth().generatePasswordResetLink(target) });
  } catch (e) { next(e); }
});

router.delete('/users/:email', async (req, res, next) => {
  try {
    const target = email.parse(req.params.email);
    if (env.adminEmails.includes(target)) return res.status(400).json({ error: 'protected', message: 'Admin accounts cannot be deleted.' });
    const ref = getDb().collection('allowed_users').doc(target);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const uid = snap.data().uid;
    await ref.delete();
    if (uid) { try { await getAuth().deleteUser(uid); } catch (e) { console.warn('Firebase user delete skipped:', e.code || e.message); } }
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
