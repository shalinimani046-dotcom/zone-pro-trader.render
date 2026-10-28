import { auth } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// INVITE ONLY: there is no sign-up here. The admin registers people (pages/admin-users.html);
// the server rejects anyone who isn't registered, even if Firebase itself accepts the login.
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const DENIED = {
  not_approved: "This account has not been approved. Please contact the administrator.",
  disabled: "Your access has been disabled. Please contact the administrator.",
  expired: "Your access has expired. Please contact the administrator.",
};
const ERRORS = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/user-disabled": DENIED.disabled,
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/popup-blocked": "Your browser blocked the Google pop-up. Please allow pop-ups and retry.",
  "auth/unauthorized-domain": "This website's domain is not authorised in Firebase yet (Authentication > Settings > Authorized domains).",
  "auth/network-request-failed": "Network error. Please check your connection.",
};
const friendly = (e) => (e && e.denied) || ERRORS[e && e.code] || (e && e.message) || "Something went wrong. Please try again.";

function showError(message) {
  const el = document.getElementById("auth-error");
  if (!el) return alert(message);
  el.textContent = "";
  const span = document.createElement("span");
  span.textContent = message; // textContent: never inject text as HTML
  el.appendChild(span);
  el.classList.remove("hidden");
}
const hideError = () => document.getElementById("auth-error")?.classList.add("hidden");

// Only ever redirect to one of our own pages
function nextUrl() {
  const n = new URLSearchParams(window.location.search).get("next") || "";
  return /^[a-z0-9-]+\.html$/i.test(n) ? n : "dashboard.html";
}

// Ask the server whether this person is registered. If not: sign out and explain.
async function finishLogin(user) {
  const token = await user.getIdToken(true);
  let res;
  try {
    res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: "{}",
    });
  } catch (netErr) {
    await signOut(auth).catch(() => {});
    throw new Error("Google login worked, but this page could not reach the server. Open the site through the server address (e.g. http://localhost:8000), not as a file or from another port.");
  }
  if (res.status === 403) {
    const j = await res.json().catch(() => ({}));
    await signOut(auth).catch(() => {});
    const err = new Error(DENIED[j.error] || DENIED.not_approved);
    err.denied = err.message;
    throw err;
  }
  if (res.status === 401) {
    await signOut(auth).catch(() => {});
    throw new Error("Server rejected the login token (401). The service-account key on the server must belong to Firebase project zoneprotrader-90959.");
  }
  if (res.status === 404) {
    await signOut(auth).catch(() => {});
    throw new Error("Server route /api/auth/session not found (404). The site must be opened from the Node backend (npm run dev), not a static file server.");
  }
  if (!res.ok) {
    await signOut(auth).catch(() => {});
    throw new Error("Server error (" + res.status + "). Check the backend terminal for details.");
  }
  const { user: u } = await res.json();

  // Display-only cache for the UI (name/avatar). Access control never reads these.
  localStorage.setItem("zp_uid", u.uid);
  localStorage.setItem("zp_user", u.email);
  localStorage.setItem("zp_name", u.name);
  if (u.photo) localStorage.setItem("zp_photo", u.photo);
  window.location.href = nextUrl();
}

document.addEventListener("DOMContentLoaded", () => {
  // Redirected here by the server (e.g. access removed)
  const denied = new URLSearchParams(window.location.search).get("denied");
  if (denied && DENIED[denied]) showError(DENIED[denied]);

  document.getElementById("google-signin")?.addEventListener("click", async () => {
    hideError();
    try {
      const { user } = await signInWithPopup(auth, googleProvider);
      await finishLogin(user);
    } catch (e) { console.error(e); showError(friendly(e)); }
  });

  const form = document.getElementById("login-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    const email = (document.getElementById("email-input")?.value || "").trim().toLowerCase();
    const password = document.getElementById("password-input")?.value || "";
    if (!email || !password) return showError("Please enter both email address and password.");

    const btn = document.getElementById("submit-btn");
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Logging in..."; }
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await finishLogin(user);
    } catch (err) {
      console.error(err);
      showError(friendly(err));
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  });

  // Forgot / first-time password: Firebase emails a link (works only for registered accounts)
  document.querySelector("#forgot-pass-row a")?.addEventListener("click", async (e) => {
    e.preventDefault();
    hideError();
    const email = (document.getElementById("email-input")?.value || "").trim().toLowerCase();
    if (!email) return showError("Type your email above first, then click 'Forgot Password?'.");
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) { /* same message either way, so nobody can probe which emails exist */ }
    showError("If this email is registered, a password reset link has been sent.");
  });
});
