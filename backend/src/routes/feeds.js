const express = require('express');
const { getDb } = require('../config/firebase');
const { requireAuth, requireSubscription, requireAdmin } = require('../middleware/auth');

// Subscriber-only scanner data. Endpoint names match what the frontend pages already call.
const FEEDS = {
  'swing-data': 'swing',
  'pdh-data': 'pdh',
  'pdl-data': 'pdl',
  heatmap: 'heatmap',
};

const feeds = express.Router();
for (const [path, name] of Object.entries(FEEDS)) {
  feeds.get(`/${path}`, requireAuth, requireSubscription, async (req, res, next) => {
    try {
      const snap = await getDb().collection('scanner_feeds').doc(name).get();
      const doc = snap.exists ? snap.data() : { data: [], updatedAt: null };
      res.json({ data: doc.data || [], updatedAt: doc.updatedAt });
    } catch (e) { next(e); }
  });
}

// Admin publishes new rows (from your scraper, a script, or curl). See README.
const admin = express.Router();
admin.put('/feeds/:name', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = req.params.name;
    if (!Object.values(FEEDS).includes(name)) return res.status(404).json({ error: 'unknown_feed' });
    const data = req.body && req.body.data;
    if (!Array.isArray(data) || data.length > 3000) return res.status(400).json({ error: 'data must be an array (max 3000 rows)' });
    await getDb().collection('scanner_feeds').doc(name).set({ data, updatedAt: Date.now() });
    res.json({ success: true, rows: data.length });
  } catch (e) { next(e); }
});

module.exports = { feeds, admin };
