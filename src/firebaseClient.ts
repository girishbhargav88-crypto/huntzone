/** Optional Firebase. The game works fully without it; this only initialises when env keys are present. */
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId);

export async function initFirebase() {
  if (!firebaseEnabled) return null;
  const { initializeApp } = await import('firebase/app');
  const { getAuth, signInAnonymously } = await import('firebase/auth');
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth).catch(() => undefined);
  // Firestore is available via `await import('firebase/firestore')` for optional match history.
  return { app, auth };
}
