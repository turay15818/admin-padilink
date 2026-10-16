/**
 * "Continue with Google" for the command centre.
 *
 * Firebase is loaded only when the button is pressed, so the sign-in page stays light for
 * everybody who types a password. The result is a Firebase ID token and nothing else: the
 * API checks it, matches the verified e-mail to an account that is already on a desk, and
 * decides. Nothing here chooses who may come in.
 */
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyBjKA1O8_3Bil3sBedryQdUGgIU2IUE0w0',
  authDomain: 'padilink-bfed1.firebaseapp.com',
  projectId: 'padilink-bfed1',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || undefined,
};

export class GoogleCancelled extends Error {
  constructor() { super('Google sign-in was closed before it finished.'); }
}

/** Opens Google's account chooser and returns the signed Firebase ID token. */
export async function googleIdToken(): Promise<string> {
  const [{ initializeApp, getApps }, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const app = getApps().find(a => a.name === 'command') ?? initializeApp(firebaseConfig, 'command');
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(auth.getAuth(app), provider);
    const token = await result.user.getIdToken(true);
    // Nothing of this session is kept in the browser; the API's own session replaces it.
    await auth.signOut(auth.getAuth(app)).catch(() => undefined);
    return token;
  } catch (caught) {
    const code = (caught as { code?: string }).code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new GoogleCancelled();
    if (code === 'auth/popup-blocked') throw new Error('Your browser blocked the Google window. Allow pop-ups for this site and try again.');
    if (code === 'auth/unauthorized-domain') throw new Error('This address is not allowed for Google sign-in yet. Ask Vacancy support to add it.');
    throw caught instanceof Error ? caught : new Error('Google sign-in failed.');
  }
}
