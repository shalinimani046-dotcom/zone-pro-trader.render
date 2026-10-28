const crypto = require('crypto');
const Razorpay = require('razorpay');
const { env } = require('../config/env');

let client;
function getRazorpay() {
  if (!client) client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  return client;
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Checkout success signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
function verifyPaymentSignature(orderId, paymentId, signature, secret = env.razorpay.keySecret) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret) */
function verifyWebhookSignature(rawBody, signature, secret = env.razorpay.webhookSecret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

module.exports = { getRazorpay, verifyPaymentSignature, verifyWebhookSignature };
