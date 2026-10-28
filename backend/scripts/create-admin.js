// One-time bootstrap: creates (or resets) the admin's Firebase login.
//   node scripts/create-admin.js you@gmail.com 'StrongPassword123'
// The email must also be listed in ADMIN_EMAILS.
require('dotenv').config();
const { getAuth } = require('../src/config/firebase');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error("Usage: node scripts/create-admin.js <email> <password (8+ chars)>");
    process.exit(1);
  }
  const auth = getAuth();
  try {
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password, emailVerified: true, disabled: false });
    console.log('Updated existing admin:', email);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ email, password, emailVerified: true, displayName: 'Admin' });
    console.log('Created admin:', email);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
