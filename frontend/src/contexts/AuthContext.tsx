import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';

interface AdminUser {
  userId: string;
  username: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AdminUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'admin_token';
const REFRESH_TOKEN_KEY = 'admin_refresh_token';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const clearSession = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setIsAuthenticated(false);
    setUser(null);
  };

  // Restore session on mount by asking the backend who we are — avoids trusting
  // a stale/tampered token payload decoded client-side.
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await api.get<AdminUser>('/api/auth/me');
        if (result.success && result.data) {
          setUser(result.data);
          setIsAuthenticated(true);
        } else {
          clearSession();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>('/api/auth/login', {
        username,
        password,
      });

      if (result.success && result.data) {
        localStorage.setItem(ACCESS_TOKEN_KEY, result.data.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken);

        const me = await api.get<AdminUser>('/api/auth/me');
        if (me.success && me.data) {
          setUser(me.data);
          setIsAuthenticated(true);
        }

        return { success: true, message: result.message || 'Login successful' };
      }

      return { success: false, message: result.message || 'Invalid credentials' };
    } catch (error) {
      if (error instanceof ApiError) {
        return { success: false, message: error.message };
      }
      console.error('Login error:', error);
      return { success: false, message: 'Failed to connect to server. Please try again.' };
    }
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
