// Adds the Firebase login token to every call to our own /api/... so the server can
// know who the user really is. (Replaces the old spoofable "X-UID" header.)
import { auth } from "../firebase/firebase-config.js";

const nativeFetch = window.fetch.bind(window);

function isOurApi(input) {
  try {
    const u = new URL(typeof input === "string" ? input : input.url, window.location.href);
    return u.pathname.startsWith("/api/") &&
      (u.origin === window.location.origin || u.origin === "http://localhost:8000");
  } catch (e) { return false; }
}

window.fetch = async function (input, init = {}) {
  if (!isOurApi(input)) return nativeFetch(input, init);
  await auth.authStateReady();
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined) || {});
  if (auth.currentUser && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + (await auth.currentUser.getIdToken()));
  }
  headers.delete("X-UID"); // never trusted by the server
  return nativeFetch(input, { ...init, headers });
};

export { auth };
