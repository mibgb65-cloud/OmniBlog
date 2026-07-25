import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../../shared/types";
import { api, ApiError } from "./api";

type Credentials = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (details: Credentials & { name: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<User>("/api/auth/me")
      .then(setUser)
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (credentials) => {
        const nextUser = await api<User>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials),
        });
        setUser(nextUser);
      },
      register: async (details) => {
        const nextUser = await api<User>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(details),
        });
        setUser(nextUser);
      },
      logout: async () => {
        await api<boolean>("/api/auth/logout", { method: "POST" });
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

