// Extra browser-side check for pages that need more than a login (the server already refuses
// to send any page without an approved session, and refuses data without an approved token).
import { auth } from "./api-auth.js";

const here = window.location.pathname.split("/").pop() || "dashboard.html";
const reveal = () => document.getElementById("gate-hide")?.remove();
const toLogin = (reason) => window.location.replace("login.html?next=" + encodeURIComponent(here) + (reason ? "&denied=" + reason : ""));

(async () => {
  await auth.authStateReady();
  if (!auth.currentUser) return toLogin("");
  try {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) return toLogin("");
    if (res.status === 403) { const j = await res.json().catch(() => ({})); return toLogin(j.error || "not_approved"); }
    const me = await res.json();
    // Only matters once Razorpay is switched back on
    if (me.paymentsEnabled && !(me.subscription && me.subscription.active)) {
      return window.location.replace("subscription.html?required=1&next=" + encodeURIComponent(here));
    }
    reveal();
  } catch (e) {
    document.body.innerHTML = '<div style="font-family:sans-serif;padding:3rem;text-align:center">Could not verify your access. Please check your connection and <a href="">retry</a>.</div>';
    reveal();
  }
})();
