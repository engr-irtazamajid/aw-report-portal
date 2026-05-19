import {
  ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { configureAuthTokenHandlers } from '@/api/client';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '@/api/auth';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isInitializing: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const handleUnauthorized = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    configureAuthTokenHandlers(
      () => tokenRef.current,
      (token) => {
        tokenRef.current = token;
      },
      handleUnauthorized,
    );
  }, [handleUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const me = await fetchCurrentUser();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await loginRequest(email, password);
    tokenRef.current = tokens.access_token;
    const me = await fetchCurrentUser();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      tokenRef.current = null;
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitializing,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
