const test = require('node:test');
const assert = require('node:assert');
const { computePrice } = require('../src/config/plans');
const { addMonths } = require('../src/services/subscriptions');
const { verifyPaymentSignature, verifyWebhookSignature } = require('../src/services/razorpay');
const crypto = require('crypto');

test('pro price + coupon is computed in paise', () => {
  const p = computePrice({ planId: 'pro', term: 'quarterly', couponCode: 'zonepro' });
  assert.equal(p.subtotalPaise, 499900);
  assert.equal(p.discountPaise, 49990);
  assert.equal(p.totalPaise, 449910);
});

test('team seats add extra cost and are bounded', () => {
  const base = computePrice({ planId: 'team', term: 'yearly', seats: 5 });
  const more = computePrice({ planId: 'team', term: 'yearly', seats: 8 });
  assert.equal(more.totalPaise - base.totalPaise, 3 * 5499 * 100);
  assert.throws(() => computePrice({ planId: 'team', term: 'yearly', seats: 4 }));
  assert.throws(() => computePrice({ planId: 'team', term: 'yearly', seats: 999 }));
});

test('unknown plan / term / coupon', () => {
  assert.throws(() => computePrice({ planId: 'gold', term: 'yearly' }));
  assert.throws(() => computePrice({ planId: 'pro', term: 'weekly' }));
  assert.equal(computePrice({ planId: 'pro', term: 'yearly', couponCode: 'HACK' }).discountPercent, 0);
});

test('addMonths clamps month ends', () => {
  const jan31 = Date.UTC(2027, 0, 31);
  assert.equal(new Date(addMonths(jan31, 1)).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(new Date(addMonths(Date.UTC(2026, 10, 15), 3)).toISOString().slice(0, 10), '2027-02-15');
});

test('signature helpers', () => {
  const sig = crypto.createHmac('sha256', 's').update('o|p').digest('hex');
  assert.ok(verifyPaymentSignature('o', 'p', sig, 's'));
  assert.ok(!verifyPaymentSignature('o', 'p2', sig, 's'));
  const body = Buffer.from('{"a":1}');
  const ws = crypto.createHmac('sha256', 'w').update(body).digest('hex');
  assert.ok(verifyWebhookSignature(body, ws, 'w'));
  assert.ok(!verifyWebhookSignature(Buffer.from('{"a":2}'), ws, 'w'));
});
