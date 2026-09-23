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
import type { Role, SessionRecord, User } from "@/lib/types";

interface AppState {
  user: User | null;
  ready: boolean;
  lastSession: SessionRecord | null;
  login: (role: Role) => Promise<User>;
  logout: () => void;
  setLastSession: (s: SessionRecord | null) => void;
}

const AppContext = createContext<AppState | null>(null);

const STORAGE_KEY = "gymapp.role";

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Role | null;
    if (stored === "trainer" || stored === "student") {
      api.login(stored).then((u) => {
        setUser(u);
        setReady(true);
      });
    } else {
      setReady(true);
    }
  }, []);

  const login = useCallback(async (role: Role) => {
    const u = await api.login(role);
    window.localStorage.setItem(STORAGE_KEY, role);
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
