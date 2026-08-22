import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { requestAccessToken } from './googleToken';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Required Google Tasks scope
provider.addScope('https://www.googleapis.com/auth/tasks');

const TOKEN_KEY = 'spidey_google_access_token_v2';
const TOKEN_EXPIRY_KEY = 'spidey_google_token_expiry_v2';

let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
      const isExpired = storedExpiry ? Date.now() > parseInt(storedExpiry, 10) : false;

      if (cachedAccessToken && !isExpired) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (storedToken && !isExpired) {
        cachedAccessToken = storedToken;
        if (onAuthSuccess) onAuthSuccess(user, storedToken);
      } else if (!isSigningIn) {
        // Token missing or expired -- try to mint a new one silently before
        // giving up. This is what makes sync survive past the first hour.
        const refreshed = await getAccessToken();
        if (refreshed) {
          if (onAuthSuccess) onAuthSuccess(user, refreshed);
        } else if (onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth credentials');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, credential.accessToken);
      // Store 3500s expiry (tokens typically last 3600s)
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + 3500 * 1000));
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Spidey Google Sign-in Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/** Refresh once we're inside this window of expiry, rather than after. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function storedTokenIfFresh(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!stored) return null;
  const expiresAt = expiry ? parseInt(expiry, 10) : 0;
  if (expiresAt && Date.now() > expiresAt - REFRESH_MARGIN_MS) return null;
  return stored;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Returns a usable access token, silently minting a new one when the current
 * one is expired or close to it.
 *
 * The old version just returned null on expiry, which made triggerSync() bail
 * without a word -- sync appeared connected but did nothing, forever.
 */
export const getAccessToken = async (): Promise<string | null> => {
  const fresh = storedTokenIfFresh();
  if (fresh) {
    cachedAccessToken = fresh;
    return fresh;
  }

  // Collapse concurrent callers onto one refresh (the 45s sync interval,
  // focus handler and auth listener can all fire together).
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const result = await requestAccessToken(false);
      if (result) {
        setCachedAccessToken(result.accessToken, result.expiresInSeconds);
        return result.accessToken;
      }
      // Silent refresh failed -- consent revoked or Google session gone.
      cachedAccessToken = null;
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

/** Forces the consent popup. Used when silent refresh has failed. */
export const reauthorize = async (): Promise<string | null> => {
  const result = await requestAccessToken(true);
  if (!result) return null;
  setCachedAccessToken(result.accessToken, result.expiresInSeconds);
  return result.accessToken;
};

/** True when we have a token that hasn't expired. */
export const hasValidToken = (): boolean => storedTokenIfFresh() !== null;

export const setCachedAccessToken = (token: string | null, expiresInSeconds = 3500) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
  }
};

export const logout = async (): Promise<void> => {
  await firebaseSignOut(auth);
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
};