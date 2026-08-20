"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { apiClient } from "./api-client";
import {
  API_ENDPOINTS,
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
} from "./api-config";

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  organization_id?: number | null;
}

export interface UserRole {
  name: string;
  display_name: string;
}

interface AuthContextType {
  user: User | null;
  roles: UserRole[];
  permissions: string[];
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // بررسی توکن در localStorage هنگام بارگذاری اولیه
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    const savedUser = typeof window !== "undefined" ? localStorage.getItem(USER_KEY) : null;

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        // دریافت اطلاعات کامل کاربر از سرور
        refreshUser();
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const refreshUser = async () => {
    try {
      const data = await apiClient.get<{
        user: User;
        roles: UserRole[];
        permissions: string[];
      }>(API_ENDPOINTS.me);

      setUser(data.user);
      setRoles(data.roles || []);
      setPermissions(data.permissions || []);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {
      // اگه توکن نامعتبره، پاک کن
      apiClient.clearTokens();
      setUser(null);
      setRoles([]);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const data = await apiClient.post<{
      user: User;
      tokens: {
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
      };
    }>(API_ENDPOINTS.login, { username, password }, { skipAuth: true });

    localStorage.setItem(TOKEN_KEY, data.tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.tokens.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    setUser(data.user);

    // دریافت نقش‌ها و دسترسی‌ها
    await refreshUser();
  };

  const logout = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.logout);
    } catch {
      // حتی اگه خطا داد، توکن‌ها رو پاک کن
    } finally {
      apiClient.clearTokens();
      setUser(null);
      setRoles([]);
      setPermissions([]);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasRole = (role: string): boolean => {
    return roles.some((r) => r.name === role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        permissions,
        loading,
        login,
        logout,
        hasPermission,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth باید داخل AuthProvider استفاده بشه");
  }
  return context;
}
