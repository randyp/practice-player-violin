// Google sign-in for a static, backend-free site: Google Identity Services'
// token-client flow (accounts.oauth2.initTokenClient) runs entirely in the
// browser (popup + postMessage), issuing a short-lived access token with no
// client secret and no server round-trip — see design/TODO.md for why this
// is viable without a backend.
//
// Identity (name/email/avatar) and Drive access are requested together as
// one combined-scope token, in a single popup triggered directly by the
// user's click. Two separate popups (identity first, then Drive) doesn't
// work: the second popup fires from inside an async callback rather than
// the original click's user-gesture stack, so browsers silently block it.
//
// OAuth Client ID from Google Cloud Console (APIs & Services -> Credentials
// -> OAuth client ID -> Web application, Authorized JavaScript origins
// https://randyp.github.io and http://localhost:8282). Client IDs are not
// secret and are safe to commit.
const CLIENT_ID = "332071885870-r8smpjq6sifa5fd77nme1lm6sqirqbq7.apps.googleusercontent.com";

// drive.file: the app can only see/manage files it creates itself, not the
// user's whole Drive. openid/profile/email: just enough to show who's
// signed in, via Google's userinfo endpoint below.
const SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";

// The access token lives only in JS memory by default (Google's library
// persists nothing) — cache it (plus the identity fetched with it) in
// localStorage, keyed by the token's own expiry, so a page refresh doesn't
// force a re-prompt.
const STORAGE_KEY = "practice-player-violin:drive-token";

// Subtract a buffer so a token doesn't get treated as valid and then expire
// mid-request.
const EXPIRY_BUFFER_MS = 60_000;

function log(...args) {
  try { console.log("[drive-auth]", ...args); } catch (e) { /* no console */ }
}

export const driveAuth = createDriveAuthState();

function loadCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, identity: null };
    const { token, expiresAt, identity } = JSON.parse(raw);
    if (!token || !expiresAt || Date.now() > expiresAt - EXPIRY_BUFFER_MS) return { token: null, identity: null };
    return { token, identity: identity ?? null };
  } catch (e) {
    return { token: null, identity: null };
  }
}

function saveCached(token, expiresInSec, identity) {
  try {
    const expiresAt = Date.now() + expiresInSec * 1000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt, identity }));
  } catch (e) { /* storage unavailable (private mode, quota) — session just won't persist */ }
}

function clearCached() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* no-op */ }
}

async function fetchIdentity(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`failed to fetch Google profile: HTTP ${res.status}`);
  const info = await res.json();
  return { name: info.name, email: info.email, picture: info.picture };
}

function createDriveAuthState() {
  const cached = loadCached();
  let token = cached.token;
  let identity = cached.identity;
  let tokenClient = null;

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services script has not loaded yet");
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // overwritten per-call by signIn()
    });
    return tokenClient;
  }

  // Must be called directly from a user gesture (e.g. a plain onclick) —
  // requestAccessToken() opens a real popup, which browsers block if it's
  // not synchronously within a click handler's call stack.
  function signIn() {
    log("signIn() called, origin =", window.location.origin);
    return new Promise((resolve, reject) => {
      let client;
      try {
        client = ensureTokenClient();
      } catch (e) {
        log("ensureTokenClient threw:", e);
        reject(e);
        return;
      }
      client.callback = (resp) => {
        log("token-client callback fired, resp =", resp);
        if (resp.error) { reject(new Error(`Google sign-in failed: ${resp.error}`)); return; }
        token = resp.access_token;
        fetchIdentity(token)
          .then((info) => {
            identity = info;
            log("fetched identity =", identity);
            saveCached(token, resp.expires_in, identity);
            resolve(identity);
          })
          .catch((e) => {
            log("fetchIdentity threw:", e);
            reject(e);
          });
      };
      client.requestAccessToken();
      log("requestAccessToken() called");
    });
  }

  function signOut() {
    log("signOut() called");
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }
    token = null;
    identity = null;
    clearCached();
  }

  function getToken() {
    return token;
  }

  function getIdentity() {
    return identity;
  }

  function isSignedIn() {
    return token !== null;
  }

  return { signIn, signOut, getToken, getIdentity, isSignedIn };
}

export async function listDriveFiles() {
  const token = driveAuth.getToken();
  if (!token) throw new Error("not signed in to Google");
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name)",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive API request failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.files ?? [];
}
