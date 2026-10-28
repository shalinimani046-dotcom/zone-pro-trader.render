# Zone Pro Trader — Invite-only access (admin-registered users)

```
zoneprotrader/
  frontend/   your website (HTML/Tailwind)
  backend/    Node/Express API (also serves the website)
  firestore.rules, database.rules.json, firebase.json, render.yaml
```
**Stack:** Firebase Auth (Google + email/password) · Firestore · Node/Express.
Razorpay payments are built but switched OFF (`PAYMENTS_ENABLED=false`).

## How "only registered users can log in" works
1. **The admin registers people** on `/pages/admin-users.html` (email, name, optional password, optional expiry date).
   That writes a record to Firestore `allowed_users` and creates the person's Firebase login.
2. A person logs in on `login.html` (Google or email+password). There is **no sign-up form**.
3. The server then checks the list on **every request**. Not in the list, disabled, or expired → refused (403).
   Disabling someone takes effect immediately, even if they are already logged in.
4. After an approved login the server sets a secure cookie. **Without it the server won't even send the HTML pages**
   (only `login`, `logout`, `terms`, `privacy`, `refund` and the home page are public).
5. Anti-hijack: email+password logins must come from the account the admin created, and Google logins need a verified
   email. A stranger who creates their own Firebase account using an approved email gets nothing.

You (from `ADMIN_EMAILS`) are the admin. Your first Google login creates your own record automatically.

## Run locally
```bash
cd backend
cp .env.example .env      # fill ADMIN_EMAILS and FIREBASE_SERVICE_ACCOUNT_BASE64
npm install
npm test                  # 27 tests, no cloud needed
npm run dev               # open http://localhost:8000  (not the HTML file directly)
```

## SETUP — things only you can do
### Firebase (project `zoneprotrader-90959`)
1. **Authentication → Sign-in method:** enable **Google** and **Email/Password**.
2. **Authentication → Settings → User actions:** turn **OFF "Enable create (sign-up)"**.
   This stops strangers creating Firebase accounts at all. Accounts made by the admin page still work.
3. **Authentication → Settings → Authorized domains:** add `localhost` and your live domain.
4. **Build → Firestore Database → Create database.** Paste `firestore.rules` under Rules and publish (denies all browser access).
5. **Project settings → Service accounts → Generate new private key** → base64 → `FIREBASE_SERVICE_ACCOUNT_BASE64`. Never commit it.
6. **Realtime Database → Rules:** paste `database.rules.json`, and **delete the old `registered_users` data** (it holds plain-text passwords from the old code).

### Adding users
- Open `https://YOUR-SITE/pages/admin-users.html` (logged in as an admin) → **Add user**.
  - *With a password:* tell the person their email + that password.
  - *Without a password:* you get a link to send them so they choose their own password. They can also just use "Sign in with Google" with that email.
- **Disable / Enable**, **Set expiry**, **Password link**, **Delete** are buttons on each row.
- From the terminal (e.g. a first user): `cd backend && node scripts/create-user.js person@example.com "Full Name" [password] [2027-03-31]`

### Deploy (Render, free tier works)
1. Push to GitHub → Render → New → **Blueprint** → pick the repo (`render.yaml`).
2. Fill `ADMIN_EMAILS` and `FIREBASE_SERVICE_ACCOUNT_BASE64`. Then add the Render domain in Firebase "Authorized domains".

### Scanner data
Scanner pages show rows you publish (admin only). See `PUT /api/admin/feeds/:name` (`swing`, `pdh`, `pdl`, `heatmap`):
```bash
# TOKEN: on a logged-in page console:  await (await import('/js/api-auth.js')).auth.currentUser.getIdToken()
curl -X PUT https://YOUR-SITE/api/admin/feeds/swing -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"data":[{"nsecode":"TCS","name":"TCS","close":4100,"per_chg":1.8,"volume":1200000}]}'
```

## Turning payments back on later
Set `PAYMENTS_ENABLED=true`, add the three `RAZORPAY_*` keys, add the webhook (`/api/webhooks/razorpay`; events `order.paid`,
`payment.captured`, `payment.failed`, `refund.processed`) and edit prices in `backend/src/config/plans.js` (placeholders).
Then registered users also need an active plan to open the scanners. Everything is already written and tested.

## Known limits
- The dashboard feed, announcements and trade journal still use the open Realtime Database (as before): anyone who knows the
  URL could write there. Moving them to the backend (`/api/posts`, `/api/trades` exist) is the next job.
- Scanner pages contain built-in sample rows used when no feed is published.
- Logging out of one device doesn't end sessions on other devices until the cookie expires (5 days) — but disabling a user
  does block them immediately.
