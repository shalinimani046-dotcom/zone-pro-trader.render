#!/usr/bin/env node
// Register a user from the terminal (handy for the very first account, before the admin page is usable).
//   node scripts/create-user.js someone@example.com "Full Name" [password] [YYYY-MM-DD expiry]
// With no password the person signs in with Google, or uses "Forgot password" to set one.
require('../src/config/env');
const { getDb, getAuth } = require('../src/config/firebase');

(async () => {
  const [emailArg, name = '', password, until] = process.argv.slice(2);
  if (!emailArg) { console.error('Usage: node scripts/create-user.js email "Name" [password] [YYYY-MM-DD]'); process.exit(1); }
  const email = emailArg.trim().toLowerCase();
  const auth = getAuth();
  let user;
  try { user = await auth.getUserByEmail(email); if (password) await auth.updateUser(user.uid, { password }); }
  catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await auth.createUser({ email, displayName: name || undefined, password: password || undefined });
  }
  await getDb().collection('allowed_users').doc(email).set({
    email, name, uid: user.uid, active: true,
    accessUntil: until ? Date.parse(`${until}T23:59:59+05:30`) : null,
    createdAt: Date.now(), createdBy: 'cli',
  }, { merge: true });
  console.log(`Registered ${email} (uid ${user.uid})`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
