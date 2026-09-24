/**
 * The signed-in session, kept in the browser like in the TreinoFácil app: the token proves to
 * the backend who is calling; the user is only a copy for drawing the screens.
 */
import type { User } from "./types";

export interface Session {
  token: string;
  /** Epoch milliseconds; the backend rejects the token after this. */
  expiresAt: number;
  user: User;
}

const STORAGE_KEY = "gymapp.session";
// Written by the version without tokens; it can no longer call the API.
const LEGACY_KEY = "gymapp.user";

export function readSession(): Session | null {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    if (!session || !session.token || !session.user || !(session.expiresAt > Date.now()))
      return null;
    return session.user.role === "trainer" || session.user.role === "student" ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or full storage: the session lasts until the page is closed.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
