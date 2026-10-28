const admin = require('firebase-admin');

let initialised = false;

function init() {
  if (initialised) return;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(json) });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS or the platform's default credentials
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  initialised = true;
}

const getDb = () => { init(); return admin.firestore(); };
const getAuth = () => { init(); return admin.auth(); };

module.exports = { getDb, getAuth };
