const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ZodError } = require('zod');
const { env } = require('./config/env');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render/Railway/etc. sit behind a proxy

  app.use(helmet({
    contentSecurityPolicy: false, // pages load Tailwind/Lucide/Razorpay from CDNs and use inline scripts
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // REQUIRED for Google sign-in popup
    crossOriginResourcePolicy: false,
  }));

  const allowed = new Set(env.corsOrigins);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: false,
  }));

  // Webhook needs the RAW body, so it is mounted BEFORE express.json()
  if (env.paymentsEnabled) {
    app.use('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), require('./routes/webhooks'));
  }

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/payments', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  const feedRoutes = require('./routes/feeds');
  app.use('/api/auth', require('./routes/auth'));
  if (env.paymentsEnabled) { // Razorpay is parked; flip PAYMENTS_ENABLED=true to bring it back
    app.use('/api/plans', require('./routes/plans'));
    app.use('/api/subscription', require('./routes/subscription'));
    app.use('/api/payments', require('./routes/payments'));
  }
  app.use('/api/user', require('./routes/user'));
  app.use('/api/trades', require('./routes/trades'));
  app.use('/api/posts', require('./routes/posts'));
  app.use('/api/admin', require('./routes/adminUsers'));
  app.use('/api/admin', feedRoutes.admin);
  app.use('/api', feedRoutes.feeds);

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Serve the website itself from the same server -> same origin, so no CORS and the
  // frontend's relative /api/... calls just work.
  const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
  app.use(require('./middleware/pageGuard').pageGuard); // pages need an approved login
  app.use(express.static(FRONTEND));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_request', details: err.issues });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: 'bad_request', message: err.message });
    console.error(err);
    return res.status(500).json({ error: 'server_error', message: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const { validateEnv } = require('./config/env');
  validateEnv();
  createApp().listen(env.port, () => console.log(`Zone Pro Trader running on http://localhost:${env.port}`));
}
