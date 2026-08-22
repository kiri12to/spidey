/**
 * Silent Google access-token refresh via Google Identity Services (GIS).
 *
 * THE BUG THIS FIXES
 * ------------------
 * Firebase's signInWithPopup returns a Google API access token that expires
 * in ~1 hour. Firebase refreshes its OWN id token automatically but NOT this
 * one. So sync worked for one session and then silently died forever:
 *
 *   const token = await getAccessToken();
 *   if (!token) return;          // <- quiet death, no error, no UI change
 *
 * GIS can re-issue that token with prompt:'' (no popup, no user interaction)
 * as long as consent was granted once. That turns a 1-hour session into an
 * indefinite one.
 */

import firebaseConfig from '../../firebase-applet-config.json';

const SCOPE = 'https://www.googleapis.com/auth/tasks';

declare global {
  interface Window {
    google?: any;
  }
}

let tokenClient: any = null;
let gisReady = false;

/** Waits for the GIS script in index.html to finish loading. */
function waitForGis(timeoutMs = 10000): Promise<boolean> {
  if (gisReady && window.google?.accounts?.oauth2) return Promise.resolve(true);

  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) {
        gisReady = true;
        return resolve(true);
      }
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function getTokenClient(): Promise<any | null> {
  if (tokenClient) return tokenClient;

  const ok = await waitForGis();
  if (!ok) {
    console.warn('[spidey] Google Identity Services did not load — silent refresh unavailable.');
    return null;
  }

  const clientId = (firebaseConfig as any).oAuthClientId;
  if (!clientId) {
    console.warn('[spidey] No oAuthClientId in firebase-applet-config.json.');
    return null;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: () => {}, // replaced per-request below
  });

  return tokenClient;
}

export interface TokenResult {
  accessToken: string;
  expiresInSeconds: number;
}

/**
 * Requests a fresh access token.
 *
 * interactive=false -> prompt:'' : no popup. Succeeds only if the user has
 * already consented and still has an active Google session. This is what runs
 * automatically before expiry.
 *
 * interactive=true -> shows the consent popup. Used on first connect, or when
 * silent refresh fails and we have to ask.
 */
export async function requestAccessToken(interactive = false): Promise<TokenResult | null> {
  const client = await getTokenClient();
  if (!client) return null;

  return new Promise((resolve) => {
    let settled = false;
    const done = (v: TokenResult | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    client.callback = (resp: any) => {
      if (resp?.access_token) {
        done({
          accessToken: resp.access_token,
          expiresInSeconds: Number(resp.expires_in) || 3600,
        });
      } else {
        if (resp?.error) console.warn('[spidey] token request failed:', resp.error);
        done(null);
      }
    };

    client.error_callback = (err: any) => {
      console.warn('[spidey] token request error:', err?.type || err);
      done(null);
    };

    try {
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (err) {
      console.warn('[spidey] requestAccessToken threw:', err);
      done(null);
    }

    // Silent attempts can hang if the Google session is gone.
    if (!interactive) setTimeout(() => done(null), 12000);
  });
}