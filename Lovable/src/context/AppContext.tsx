import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearApiCache, setSessionExpiredHandler } from "@/lib/api";
import { clearSession, readSession, saveSession } from "@/lib/session";
import type { SessionRecord, User } from "@/lib/types";

interface AppState {
  user: User | null;
  ready: boolean;
  lastSession: SessionRecord | null;
  login: (login: string, password: string) => Promise<User>;
  logout: () => void;
  setLastSession: (s: SessionRecord | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  const logout = useCallback(() => {
    clearSession();
    clearApiCache();
    setUser(null);
    setLastSession(null);
  }, []);

  useEffect(() => {
    setUser(readSession()?.user ?? null);
    setReady(true);
    // The backend rejected the token (expired, forged or account removed): back to the login.
    setSessionExpiredHandler(logout);
    return () => setSessionExpiredHandler(null);
  }, [logout]);

  const login = useCallback(async (login: string, password: string) => {
    const session = await api.login(login, password);
    saveSession(session);
    clearApiCache();
    setUser(session.user);
    return session.user;
  }, []);

  const value = useMemo(
    () => ({ user, ready, lastSession, login, logout, setLastSession }),
    [user, ready, lastSession, login, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
