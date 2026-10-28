// Invite-only access, with payments switched OFF (the default).
process.env.ADMIN_EMAILS = 'boss@x.com';
const { install } = require('./helpers');
const fake = install();
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/server');

let server; let base;
test.before(() => { server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const call = (method, path, { token, body, cookie, redirect } = {}) => fetch(base + path, {
  method, redirect: redirect || 'follow',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const boss = 'tok_boss_boss@x.com';
const eve = 'tok_eve_eve@x.com';            // real Google login, never registered by the admin
const rajGoogle = 'tok_raj_raj@x.com';

test('payments routes are off while Razorpay is parked', async () => {
  assert.equal((await call('GET', '/api/plans')).status, 404);
  assert.equal((await call('POST', '/api/payments/create-order', { token: boss, body: {} })).status, 404);
  assert.equal((await call('POST', '/api/webhooks/razorpay', { body: {} })).status, 404);
});

test('a stranger with a valid Firebase login is rejected everywhere', async () => {
  const r = await call('POST', '/api/auth/session', { token: eve, body: {} });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'not_approved');
  assert.equal((await call('GET', '/api/user/profile', { token: eve })).status, 403);
  assert.equal((await call('GET', '/api/swing-data', { token: eve })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', { token: eve })).status, 403);
});

test('admin (from ADMIN_EMAILS) can log in without being listed first', async () => {
  const r = await call('POST', '/api/auth/session', { token: boss, body: {} });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.isAdmin, true);
  assert.match(r.headers.get('set-cookie'), /__session=.*HttpOnly/i);
});

test('admin registers a user; that user can log in (Google or password) and use data', async () => {
  const c = await call('POST', '/api/admin/users', { token: boss, body: { email: 'Raj@X.com', name: 'Raj', password: 'Passw0rd!!' } });
  assert.equal(c.status, 201);
  assert.equal((await c.json()).resetLink, null);
  assert.ok(fake.authUsers.get('raj@x.com'), 'firebase login created');
  assert.equal((await call('POST', '/api/auth/session', { token: rajGoogle, body: {} })).status, 200);
  assert.equal((await call('POST', '/api/auth/session', { token: 'pw_raj_raj@x.com', body: {} })).status, 200);
  assert.equal((await call('GET', '/api/swing-data', { token: rajGoogle })).status, 200); // no payment needed
  const me = await (await call('GET', '/api/auth/me', { token: rajGoogle })).json();
  assert.equal(me.isAdmin, false);
  assert.equal(me.paymentsEnabled, false);
  assert.equal((await call('POST', '/api/admin/users', { token: boss, body: { email: 'raj@x.com' } })).status, 409);
});

test('no password given -> admin receives a set-password link', async () => {
  const r = await (await call('POST', '/api/admin/users', { token: boss, body: { email: 'zed@x.com', name: 'Zed' } })).json();
  assert.match(r.resetLink, /reset/);
});

test('someone who self-registers a Firebase account with an approved email cannot get in', async () => {
  // 'zed' never signed up through the admin's account (uid is uid "zed"@...): an attacker's uid differs
  const attackerPassword = 'pw_attacker_zed@x.com';
  assert.equal((await call('POST', '/api/auth/session', { token: attackerPassword, body: {} })).status, 403);
  assert.equal((await call('POST', '/api/auth/session', { token: 'unv_attacker_zed@x.com', body: {} })).status, 403);
});

test('disable blocks immediately; re-enable restores; expiry blocks', async () => {
  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { active: false } });
  assert.equal(fake.authUsers.get('raj@x.com').disabled, true);
  assert.equal(fake.authUsers.get('raj@x.com').revoked, true);
  assert.equal((await (await call('GET', '/api/user/profile', { token: rajGoogle })).json()).error, 'disabled');
  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { active: true } });
  assert.equal((await call('GET', '/api/user/profile', { token: rajGoogle })).status, 200);
  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { accessUntil: '2020-01-01' } });
  assert.equal((await (await call('GET', '/api/user/profile', { token: rajGoogle })).json()).error, 'expired');
  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { accessUntil: null } });
  assert.equal((await call('GET', '/api/user/profile', { token: rajGoogle })).status, 200);
});

test('pages: public ones open, others need an approved session cookie, admin page is admin-only', async () => {
  const noRedirect = { redirect: 'manual' };
  assert.equal((await call('GET', '/pages/login.html')).status, 200);
  assert.equal((await call('GET', '/pages/terms.html')).status, 200);
  assert.equal((await call('GET', '/')).status, 200);

  const r = await call('GET', '/pages/dashboard.html', noRedirect);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /login\.html\?next=dashboard\.html/);
  assert.equal((await call('GET', '/pages/%2e%2e/pages/DASHBOARD.html', noRedirect)).status, 302); // no bypass tricks
  assert.equal((await call('GET', '/pages/dashboard.html', { cookie: '__session=garbage', redirect: 'manual' })).status, 302);

  const rajCookie = '__session=' + encodeURIComponent('sess:' + rajGoogle);
  assert.equal((await call('GET', '/pages/dashboard.html', { cookie: rajCookie })).status, 200);
  const adm = await call('GET', '/pages/admin-users.html', { cookie: rajCookie, redirect: 'manual' });
  assert.equal(adm.status, 302);
  assert.match(adm.headers.get('location'), /dashboard\.html/);

  const strangerCookie = '__session=' + encodeURIComponent('sess:' + eve);
  const s = await call('GET', '/pages/dashboard.html', { cookie: strangerCookie, redirect: 'manual' });
  assert.match(s.headers.get('location'), /denied=not_approved/);

  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { active: false } });
  const cut = await call('GET', '/pages/dashboard.html', { cookie: rajCookie, redirect: 'manual' });
  assert.match(cut.headers.get('location'), /denied=disabled/); // an old cookie stops working at once
  await call('PATCH', '/api/admin/users/raj@x.com', { token: boss, body: { active: true } });
});

test('admin can get a reset link, delete a user, and cannot lock themselves out', async () => {
  const l = await (await call('POST', '/api/admin/users/raj@x.com/reset-link', { token: boss })).json();
  assert.match(l.resetLink, /reset/);
  assert.equal((await call('DELETE', '/api/admin/users/raj@x.com', { token: boss })).status, 200);
  assert.equal((await call('GET', '/api/user/profile', { token: rajGoogle })).status, 403);
  assert.equal((await call('PATCH', '/api/admin/users/boss@x.com', { token: boss, body: { active: false } })).status, 400);
  assert.equal((await call('DELETE', '/api/admin/users/boss@x.com', { token: boss })).status, 400);
});

test('logout clears the cookie', async () => {
  const r = await call('POST', '/api/auth/logout');
  assert.match(r.headers.get('set-cookie'), /__session=;/);
});
