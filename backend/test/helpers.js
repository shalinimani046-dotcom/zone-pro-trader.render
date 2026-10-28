// In-memory stand-ins for firebase-admin and razorpay so the real routes can be tested offline.
const Module = require('module');
const crypto = require('crypto');

function makeFirestore() {
  const store = new Map(); // "col/id" -> data
  const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const docRef = (col, id) => ({
    id, col,
    async get() { const k = `${col}/${id}`; return { exists: store.has(k), id, data: () => clone(store.get(k)) }; },
    async set(data, opts) { const k = `${col}/${id}`; store.set(k, opts && opts.merge ? { ...(store.get(k) || {}), ...clone(data) } : clone(data)); },
    async delete() { store.delete(`${col}/${id}`); },
  });
  const query = (col, filters = [], order = null, lim = null) => ({
    where(f, op, v) { return query(col, [...filters, [f, v]], order, lim); },
    orderBy(f, dir) { return query(col, filters, [f, dir], lim); },
    limit(n) { return query(col, filters, order, n); },
    async get() {
      let rows = [...store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.slice(col.length + 1), v }));
      rows = rows.filter((r) => filters.every(([f, v]) => r.v[f] === v));
      if (order) rows.sort((a, b) => (order[1] === 'desc' ? b.v[order[0]] - a.v[order[0]] : a.v[order[0]] - b.v[order[0]]));
      if (lim) rows = rows.slice(0, lim);
      return { docs: rows.map((r) => ({ id: r.id, data: () => clone(r.v) })) };
    },
  });
  const db = {
    _store: store,
    collection(col) {
      return { doc: (id) => docRef(col, id), add: async (d) => { const id = crypto.randomBytes(8).toString('hex'); await docRef(col, id).set(d); return { id }; }, ...query(col) };
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = { get: (ref) => ref.get(), set: (ref, d, o) => writes.push(() => ref.set(d, o)) };
      const out = await fn(tx);
      for (const w of writes) await w();
      return out;
    },
  };
  return db;
}

function install() {
  const db = makeFirestore();
  const paymentsDb = new Map(); // fake razorpay payments
  let n = 0;
  const authUsers = new Map(); // email -> { uid, email, disabled }
  const authApi = {
    async verifyIdToken(t) {
      // tok_ = verified Google login, unv_ = Google-style but unverified email, pw_ = email+password login
      const m = /^(tok|unv|pw)_([^_]+)_(.+)$/.exec(t);
      if (!m) throw new Error('bad token');
      return { uid: m[2], email: m[3], email_verified: m[1] === 'tok', name: m[2], firebase: { sign_in_provider: m[1] === 'pw' ? 'password' : 'google.com' } };
    },
    async createSessionCookie(idToken) { await authApi.verifyIdToken(idToken); return 'sess:' + idToken; },
    async verifySessionCookie(c) { if (!String(c).startsWith('sess:')) throw new Error('bad cookie'); return authApi.verifyIdToken(c.slice(5)); },
    async getUserByEmail(e) { const u = authUsers.get(e); if (!u) { const err = new Error('nf'); err.code = 'auth/user-not-found'; throw err; } return u; },
    async createUser({ email, password }) { const u = { uid: email.split('@')[0], email, disabled: false, hasPassword: !!password }; authUsers.set(email, u); return u; },
    async updateUser(uid, patch) { const u = [...authUsers.values()].find((x) => x.uid === uid); Object.assign(u, patch); return u; },
    async revokeRefreshTokens(uid) { const u = [...authUsers.values()].find((x) => x.uid === uid); u.revoked = true; },
    async deleteUser(uid) { for (const [k, v] of authUsers) if (v.uid === uid) authUsers.delete(k); },
    async generatePasswordResetLink(e) { return `https://example.test/reset?e=${e}`; },
  };
  const fakeAdmin = {
    initializeApp() {},
    credential: { cert: () => ({}), applicationDefault: () => ({}) },
    firestore: () => db,
    auth: () => authApi,
  };
  class FakeRazorpay {
    constructor() {
      this.orders = { create: async ({ amount, currency, notes }) => ({ id: `order_T${++n}`, amount, currency, notes }) };
      this.payments = {
        fetch: async (id) => paymentsDb.get(id),
        capture: async (id) => { const p = paymentsDb.get(id); p.status = 'captured'; return p; },
      };
    }
  }
  const orig = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'firebase-admin') return fakeAdmin;
    if (request === 'razorpay') return FakeRazorpay;
    return orig.call(this, request, ...rest);
  };
  return { db, paymentsDb, authUsers };
}

module.exports = { install };
