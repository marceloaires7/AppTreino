import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
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

// The API is stateless, so the signed-in user (never the password) is kept in the browser.
const STORAGE_KEY = "gymapp.user";

function readStoredUser(): User | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const user = raw ? (JSON.parse(raw) as User) : null;
    return user && (user.role === "trainer" || user.role === "student") ? user : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    setUser(readStoredUser());
    setReady(true);
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    const u = await api.login(login, password);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setLastSession(null);
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
