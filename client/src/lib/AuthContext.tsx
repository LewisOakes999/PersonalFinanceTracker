import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, getAuthToken, setAuthToken, setUnauthorizedHandler } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    // An expired/invalid token anywhere clears the session.
    setUnauthorizedHandler(() => setUser(null));

    (async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const { user } = await api.authMe();
          setUser(user);
          setLoading(false);
          return;
        } catch {
          setAuthToken(null);
        }
      }
      try {
        const { needsSetup } = await api.authStatus();
        setNeedsSetup(needsSetup);
      } catch {
        /* server unreachable — treat as login screen */
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.authLogin(email, password);
    setAuthToken(token);
    setUser(user);
  };

  const signup = async (email: string, password: string) => {
    const { token, user } = await api.authSetup(email, password);
    setAuthToken(token);
    setUser(user);
    setNeedsSetup(false);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ loading, user, needsSetup, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
