const express = require('express');
const { getDb } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');
const { env } = require('../config/env');
const router = express.Router();

const MAX_BYTES = 900 * 1024; // Firestore documents are limited to 1 MiB
const safeId = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection('posts').orderBy('timestamp', 'desc').limit(100).get();
    res.json({ posts: snap.docs.map((d) => d.data()) });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const p = req.body || {};
    const id = safeId(p.id) || `post_${Date.now()}`;
    const post = {
      id,
      uid: req.user.uid, // forced from the token
      author: String(p.author || req.user.name || 'Trader').replace(/[<>]/g, '').slice(0, 60),
      tag: String(p.tag || '').replace(/[<>]/g, '').slice(0, 30),
      avatar: String(p.avatar || '').slice(0, 4),
      avatarGradient: String(p.avatarGradient || '').slice(0, 120),
      content: String(p.content || '').replace(/[<>]/g, '').slice(0, 3000),
      image: typeof p.image === 'string' && p.image.startsWith('data:image/') ? p.image : '',
      likes: 0,
      comments: [],
      timestamp: Date.now(),
    };
    if (!post.content) return res.status(400).json({ error: 'content_required' });
    if (Buffer.byteLength(JSON.stringify(post)) > MAX_BYTES) return res.status(413).json({ error: 'post_too_large' });
    await getDb().collection('posts').doc(id).set(post);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const ref = getDb().collection('posts').doc(safeId(req.params.id));
    const snap = await ref.get();
    if (!snap.exists) return res.json({ success: true });
    const isAdmin = !!req.user.isAdmin;
    if (snap.data().uid !== req.user.uid && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    await ref.delete();
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
