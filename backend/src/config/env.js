require('dotenv').config();

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const env = {
  port: Number(process.env.PORT) || 8000,
  isProd: process.env.NODE_ENV === 'production',
  // Razorpay is parked. Set PAYMENTS_ENABLED=true later to switch plans/checkout/webhooks back on.
  paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
  corsOrigins: list(process.env.CORS_ORIGINS),
  adminEmails: list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

/** Called once at startup so a missing key fails loudly instead of at the first payment. */
function validateEnv() {
  const missing = [];
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    missing.push('FIREBASE_SERVICE_ACCOUNT_BASE64');
  }
  if (env.paymentsEnabled) { // Razorpay keys are only needed once payments are switched on
    if (!env.razorpay.keyId) missing.push('RAZORPAY_KEY_ID');
    if (!env.razorpay.keySecret) missing.push('RAZORPAY_KEY_SECRET');
    if (!env.razorpay.webhookSecret) missing.push('RAZORPAY_WEBHOOK_SECRET');
  }
  if (!env.adminEmails.length) missing.push('ADMIN_EMAILS');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  }
}

module.exports = { env, validateEnv };
