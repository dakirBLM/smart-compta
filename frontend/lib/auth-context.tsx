"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, clearToken, getToken, setToken } from "./api";
import { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (form: FormData) => Promise<User>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/api/auth/me/")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ access: string; user: User }>(
      "/api/auth/login/",
      { username, password }
    );
    setToken(res.access);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (form: FormData) => {
    const res = await api.post<{ access: string; user: User }>(
      "/api/auth/register/",
      form
    );
    setToken(res.access);
    setUser(res.user);
    return res.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.get<User>("/api/auth/me/");
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
