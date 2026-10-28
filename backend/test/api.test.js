process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'keysecret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsecret';
process.env.ADMIN_EMAILS = 'boss@x.com';
process.env.PAYMENTS_ENABLED = 'true';
const { install } = require('./helpers');
const fake = install();
// Only admin-registered people may use the site, so register the test users first.
for (const n of ['alice', 'bob', 'carol', 'dave']) {
  fake.db._store.set(`allowed_users/${n}@x.com`, { email: `${n}@x.com`, uid: n, active: true, accessUntil: null, createdAt: 1 });
}

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createApp } = require('../src/server');

let server; let base;
test.before(async () => {
  for (const e of ['alice', 'bob', 'carol', 'dave']) await fake.db.collection('allowed_users').doc(`${e}@x.com`).set({ email: `${e}@x.com`, active: true });
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const call = (method, path, { token, body, raw, headers } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });

const alice = 'tok_alice_alice@x.com';
const bob = 'tok_bob_bob@x.com';
const boss = 'tok_boss_boss@x.com';

async function pay(token, orderBody, { tamper } = {}) {
  const o = await (await call('POST', '/api/payments/create-order', { token, body: orderBody })).json();
  const paymentId = `pay_${crypto.randomBytes(5).toString('hex')}`;
  fake.paymentsDb.set(paymentId, { id: paymentId, order_id: o.orderId, amount: tamper ? o.amount - 100 : o.amount, currency: 'INR', status: 'captured', method: 'upi' });
  const sig = crypto.createHmac('sha256', 'keysecret').update(`${o.orderId}|${paymentId}`).digest('hex');
  return { o, paymentId, sig };
}

test('protected routes need a login', async () => {
  assert.equal((await call('GET', '/api/subscription/status')).status, 401);
  assert.equal((await call('GET', '/api/swing-data')).status, 401);
  assert.equal((await call('GET', '/api/swing-data', { token: 'garbage' })).status, 401);
});

test('plans are public', async () => {
  const j = await (await call('GET', '/api/plans')).json();
  assert.equal(j.currency, 'INR');
  assert.ok(j.plans.pro);
});

test('session creates the user; no subscription yet -> feeds blocked', async () => {
  const r = await call('POST', '/api/auth/session', { token: alice, body: {} });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.user.email, 'alice@x.com');
  assert.equal(j.subscription.active, false);
  assert.equal((await call('GET', '/api/swing-data', { token: alice })).status, 403);
});

test('create-order ignores client price, bad plan rejected', async () => {
  const r = await call('POST', '/api/payments/create-order', { token: alice, body: { planId: 'pro', term: 'quarterly', amount: 1 } });
  const j = await r.json();
  assert.equal(j.amount, 499900);
  assert.equal((await call('POST', '/api/payments/create-order', { token: alice, body: { planId: 'nope', term: 'yearly' } })).status, 400);
});

test('full payment: verify -> active -> feeds open; replay is idempotent', async () => {
  const { o, paymentId, sig } = await pay(alice, { planId: 'pro', term: 'quarterly' });
  const body = { razorpay_order_id: o.orderId, razorpay_payment_id: paymentId, razorpay_signature: sig };
  const r1 = await call('POST', '/api/payments/verify', { token: alice, body });
  assert.equal(r1.status, 200);
  const s1 = (await r1.json()).subscription;
  assert.equal(s1.active, true);
  assert.equal(s1.planId, 'pro');
  const r2 = await call('POST', '/api/payments/verify', { token: alice, body });
  assert.equal((await r2.json()).subscription.endAt, s1.endAt); // not extended twice
  assert.equal((await call('GET', '/api/swing-data', { token: alice })).status, 200);
});

test('verify rejects bad signature, other user, and amount mismatch', async () => {
  const a = await pay(alice, { planId: 'pro', term: 'yearly' });
  const bad = await call('POST', '/api/payments/verify', { token: alice, body: { razorpay_order_id: a.o.orderId, razorpay_payment_id: a.paymentId, razorpay_signature: 'x'.repeat(64) } });
  assert.equal(bad.status, 400);
  const steal = await call('POST', '/api/payments/verify', { token: bob, body: { razorpay_order_id: a.o.orderId, razorpay_payment_id: a.paymentId, razorpay_signature: a.sig } });
  assert.equal(steal.status, 404);
  const t = await pay(bob, { planId: 'pro', term: 'yearly' }, { tamper: true });
  const mism = await call('POST', '/api/payments/verify', { token: bob, body: { razorpay_order_id: t.o.orderId, razorpay_payment_id: t.paymentId, razorpay_signature: t.sig } });
  assert.equal(mism.status, 400);
  assert.equal((await (await call('GET', '/api/subscription/status', { token: bob })).json()).active, false);
});

const hook = (event, payload, id) => {
  const raw = JSON.stringify({ event, created_at: 1, payload });
  const sig = crypto.createHmac('sha256', 'whsecret').update(raw).digest('hex');
  return call('POST', '/api/webhooks/razorpay', { raw, headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': id } });
};

test('webhook: rejects bad signature', async () => {
  const r = await call('POST', '/api/webhooks/razorpay', { raw: '{}', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'nope' } });
  assert.equal(r.status, 400);
});

test('webhook activates even if the browser never called verify; duplicates ignored; refund cancels', async () => {
  const carol = 'tok_carol_carol@x.com';
  const o = await (await call('POST', '/api/payments/create-order', { token: carol, body: { planId: 'business', term: 'yearly' } })).json();
  const payment = { id: 'pay_wh1', order_id: o.orderId, amount: o.amount, currency: 'INR', status: 'captured' };
  const payload = { payment: { entity: payment }, order: { entity: { id: o.orderId } } };

  assert.equal((await hook('order.paid', payload, 'evt_1')).status, 200);
  const s = await (await call('GET', '/api/subscription/status', { token: carol })).json();
  assert.equal(s.active, true);
  assert.equal(s.planId, 'business');
  assert.equal(s.seats, 20);

  const dup = await (await hook('order.paid', payload, 'evt_1')).json();
  assert.equal(dup.duplicate, true);
  assert.equal((await (await hook('payment.captured', payload, 'evt_2')).json()).ok, true); // same payment, new event
  assert.equal((await (await call('GET', '/api/subscription/status', { token: carol })).json()).endAt, s.endAt);

  await hook('refund.processed', { refund: { entity: { payment_id: 'pay_wh1' } } }, 'evt_3');
  assert.equal((await (await call('GET', '/api/subscription/status', { token: carol })).json()).active, false);
});

test('renewal while active extends from current end date', async () => {
  const dave = 'tok_dave_dave@x.com';
  const a = await pay(dave, { planId: 'pro', term: 'quarterly' });
  await call('POST', '/api/payments/verify', { token: dave, body: { razorpay_order_id: a.o.orderId, razorpay_payment_id: a.paymentId, razorpay_signature: a.sig } });
  const s1 = await (await call('GET', '/api/subscription/status', { token: dave })).json();
  const b = await pay(dave, { planId: 'pro', term: 'quarterly' });
  await call('POST', '/api/payments/verify', { token: dave, body: { razorpay_order_id: b.o.orderId, razorpay_payment_id: b.paymentId, razorpay_signature: b.sig } });
  const s2 = await (await call('GET', '/api/subscription/status', { token: dave })).json();
  assert.ok(s2.endAt > s1.endAt + 80 * 86400000);
});

test('admin can publish feed; non-admin cannot; subscriber reads it', async () => {
  assert.equal((await call('PUT', '/api/admin/feeds/swing', { token: alice, body: { data: [] } })).status, 403);
  const ok = await call('PUT', '/api/admin/feeds/swing', { token: boss, body: { data: [{ nsecode: 'TCS', close: 1, per_chg: 2, volume: 3 }] } });
  assert.equal(ok.status, 200);
  const j = await (await call('GET', '/api/swing-data', { token: alice })).json();
  assert.equal(j.data[0].nsecode, 'TCS');
});

test('profile uses token uid, ignores spoofed X-UID', async () => {
  await call('POST', '/api/user/profile', { token: alice, headers: { 'X-UID': 'bob' }, body: { firstName: 'Al', lastName: 'Ice', phone: '123' } });
  const p = (await (await call('GET', '/api/user/profile?uid=bob', { token: alice })).json()).profile;
  assert.equal(p.uid, 'alice');
  assert.equal(p.firstName, 'Al');
  assert.equal((await (await call('GET', '/api/user/profile', { token: bob })).json()).profile.firstName, '');
});

test('trades and posts are scoped to their owner', async () => {
  const t = await call('POST', '/api/trades', { token: alice, body: { symbol: 'tcs', pnl: 500 } });
  assert.equal(t.status, 201);
  const mine = (await (await call('GET', '/api/trades', { token: alice })).json()).trades;
  const theirs = (await (await call('GET', '/api/trades', { token: bob })).json()).trades;
  assert.equal(mine.length, 1);
  assert.equal(theirs.length, 0);
  await call('POST', '/api/posts', { token: alice, body: { id: 'post_1', content: 'hi' } });
  assert.equal((await call('DELETE', '/api/posts/post_1', { token: bob })).status, 403);
  assert.equal((await call('DELETE', '/api/posts/post_1', { token: alice })).status, 200);
});
