import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authApi, setClientAccessToken } from '../services/api';
import {
  UserRole,
  type EffectiveRole,
  type PublicUser,
} from '../shared/types';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  effectiveRole: EffectiveRole | null;
  dashboardPath: string;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    department: string;
    batch?: string;
    studentId?: string;
    accountType: 'STUDENT' | 'FACULTY';
  }) => Promise<{ user: PublicUser; requiresApproval: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<PublicUser | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function resolveEffectiveRole(user: PublicUser | null): EffectiveRole | null {
  if (!user) return null;
  if (user.role === UserRole.ADMIN) return 'ADMIN';
  if (user.role === UserRole.FACULTY) return 'FACULTY';
  if (user.crCourseIds && user.crCourseIds.length > 0) return 'CR';
  return 'STUDENT';
}

export function resolveDashboardPath(user: PublicUser | null): string {
  const role = resolveEffectiveRole(user);
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'FACULTY':
      return '/faculty';
    case 'CR':
      return '/cr';
    case 'STUDENT':
      return '/student';
    default:
      return '/login';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi
      .refresh()
      .then((res) => {
        if (!active) return;
        setClientAccessToken(res.data.accessToken);
        setUser(res.data.user);
      })
      .catch(() => {
        if (!active) return;
        setClientAccessToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setClientAccessToken(res.data.accessToken);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      department: string;
      batch?: string;
      studentId?: string;
      accountType: 'STUDENT' | 'FACULTY';
    }) => {
      const res = await authApi.register(payload);
      if (res.data.accessToken) {
        setClientAccessToken(res.data.accessToken);
        setUser(res.data.user);
      }
      return {
        user: res.data.user,
        requiresApproval: res.data.requiresApproval,
      };
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setClientAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authApi.me();
    setUser(res.data.user);
  }, []);

  const effectiveRole = resolveEffectiveRole(user);
  const dashboardPath = resolveDashboardPath(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        effectiveRole,
        dashboardPath,
        login,
        register,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
