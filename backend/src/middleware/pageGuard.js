const path = require('path');
const { getAuth } = require('../config/firebase');
const { resolveAccess } = require('../services/access');

// Everything under /pages/ needs an approved login EXCEPT these.
const PUBLIC_PAGES = new Set(['login.html', 'logout.html', 'terms.html', 'privacy.html', 'refund.html']);
const ADMIN_PAGES = new Set(['admin-users.html']);
const COOKIE = '__session';

function readCookie(header, name) {
  const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Protects the HTML pages themselves (not just the data) using a server-side session cookie
 * that is only issued after an approved login. Without it the page is never sent.
 */
async function pageGuard(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let p;
  try { p = path.posix.normalize(decodeURIComponent(req.path)).toLowerCase(); } catch (e) { return res.status(400).end(); }
  if (!p.startsWith('/pages/')) return next();
  const file = p.slice('/pages/'.length);
  if (!file || PUBLIC_PAGES.has(file)) return next();

  const toLogin = (reason) => {
    const q = new URLSearchParams();
    if (/^[a-z0-9-]+\.html$/.test(file)) q.set('next', file);
    if (reason) q.set('denied', reason);
    return res.redirect(302, '/pages/login.html?' + q.toString());
  };

  const cookie = readCookie(req.headers.cookie, COOKIE);
  if (!cookie) return toLogin('');
  try {
    const d = await getAuth().verifySessionCookie(cookie);
    const access = await resolveAccess({
      uid: d.uid,
      email: (d.email || '').toLowerCase(),
      emailVerified: !!d.email_verified,
      provider: (d.firebase && d.firebase.sign_in_provider) || '',
    });
    if (!access.ok) return toLogin(access.reason);
    if (ADMIN_PAGES.has(file) && !access.isAdmin) return res.redirect(302, '/pages/dashboard.html');
    res.setHeader('Cache-Control', 'private, no-store');
    return next();
  } catch (err) {
    return toLogin('');
  }
}

module.exports = { pageGuard, COOKIE };
