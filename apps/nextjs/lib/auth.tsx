"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// Relative URL - works with any domain via Nginx proxy
const API_URL = "/api";

interface Admin {
  id: string;
  email: string;
  name: string | null;
  is_owner: boolean;
  created_at: string;
}

interface AuthContextType {
  admin: Admin | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  checkSetupStatus: () => Promise<boolean>;
  updateProfile: (data: { email?: string; name?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "clientpix_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setAdmin(data);
            setToken(storedToken);
          } else {
            // Token invalid, clear it
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
          }
        } catch (error) {
          console.error("Auth check failed:", error);
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/auth/setup-status`);
      const data = await response.json();
      return data.needs_setup;
    } catch (error) {
      console.error("Setup status check failed:", error);
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Login failed");
    }

    const data = await response.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setToken(data.access_token);

    // Fetch admin details
    const meResponse = await fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
    });
    const adminData = await meResponse.json();
    setAdmin(adminData);

    router.push("/dashboard");
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
    }

    const data = await response.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setToken(data.access_token);

    // Fetch admin details
    const meResponse = await fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
    });
    const adminData = await meResponse.json();
    setAdmin(adminData);

    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAdmin(null);
    setToken(null);
    router.push("/login");
  };

  const updateProfile = async (data: { email?: string; name?: string }) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_URL}/auth/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to update profile");
    }

    const updatedAdmin = await response.json();
    setAdmin(updatedAdmin);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to change password");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        token,
        isLoading,
        isAuthenticated: !!admin,
        login,
        register,
        logout,
        checkSetupStatus,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper to get token for API calls
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Helper to make authenticated API calls
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
