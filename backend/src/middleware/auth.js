const { getAuth } = require('../config/firebase');
const { env } = require('../config/env');
const { resolveAccess, DENIED_MESSAGES } = require('../services/access');
const { getStatus } = require('../services/subscriptions');

/**
 * Verifies the Firebase login token AND that the admin has approved this person.
 * Approval is re-checked on every request, so disabling a user cuts them off immediately.
 */
async function requireAuth(req, res, next) {
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/i);
  if (!match) return res.status(401).json({ error: 'unauthenticated', message: 'Please log in.' });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(match[1]);
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', message: 'Session expired. Please log in again.' });
  }

  try {
    const user = {
      uid: decoded.uid,
      email: (decoded.email || '').toLowerCase(),
      emailVerified: !!decoded.email_verified,
      name: decoded.name || '',
      picture: decoded.picture || '',
      provider: (decoded.firebase && decoded.firebase.sign_in_provider) || '',
    };
    const access = await resolveAccess(user);
    if (!access.ok) {
      return res.status(403).json({ error: access.reason, message: DENIED_MESSAGES[access.reason] });
    }
    req.user = { ...user, isAdmin: access.isAdmin, accessUntil: access.record.accessUntil || null, approvedName: access.record.name || '' };
    req.idToken = match[1];
    return next();
  } catch (err) {
    return next(err);
  }
}

/** With payments parked, every approved user already has full access. */
async function requireSubscription(req, res, next) {
  if (!env.paymentsEnabled) return next();
  try {
    const status = await getStatus(req.user.uid);
    if (!status.active) {
      return res.status(403).json({ error: 'subscription_required', message: 'An active subscription is required.' });
    }
    req.subscription = status;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'forbidden', message: 'Admin access only.' });
}

module.exports = { requireAuth, requireSubscription, requireAdmin };
