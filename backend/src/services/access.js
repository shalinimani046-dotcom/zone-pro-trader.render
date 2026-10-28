const { getDb } = require('../config/firebase');
const { env } = require('../config/env');

/**
 * THE gatekeeper. A person may use the site only if the admin registered their email in the
 * `allowed_users` collection (document id = lowercase email) and the record is active and
 * not expired.
 *
 * Takeover protection: email+password sign-ins must come from the Firebase account the admin
 * created (uid match). Google sign-ins are accepted only with a verified Google email.
 * So a stranger who registers a Firebase account with an approved email gets nothing.
 */
async function resolveAccess({ uid, email, emailVerified, provider }) {
  if (!email) return { ok: false, reason: 'not_approved' };
  const db = getDb();
  const ref = db.collection('allowed_users').doc(email);
  let snap = await ref.get();
  const viaGoogle = provider === 'google.com' && emailVerified;
  const isAdmin = viaGoogle && env.adminEmails.includes(email);

  if (!snap.exists) {
    if (!isAdmin) return { ok: false, reason: 'not_approved' };
    // First login of an admin listed in ADMIN_EMAILS: bootstrap their record.
    await ref.set({ email, name: '', uid, active: true, accessUntil: null, createdAt: Date.now(), createdBy: 'bootstrap' });
    snap = await ref.get();
  }
  const rec = snap.data();
  if (!rec.active) return { ok: false, reason: 'disabled' };
  if (rec.accessUntil && rec.accessUntil < Date.now()) return { ok: false, reason: 'expired' };
  if (!viaGoogle && rec.uid !== uid) return { ok: false, reason: 'not_approved' };

  return {
    ok: true,
    record: rec,
    isAdmin: env.adminEmails.includes(email) && (viaGoogle || rec.uid === uid),
  };
}

const DENIED_MESSAGES = {
  not_approved: 'This account has not been approved. Please contact the administrator.',
  disabled: 'Your access has been disabled. Please contact the administrator.',
  expired: 'Your access has expired. Please contact the administrator.',
};

module.exports = { resolveAccess, DENIED_MESSAGES };
