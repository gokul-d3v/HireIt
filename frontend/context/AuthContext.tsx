"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    email: string;
    role: "candidate" | "interviewer" | "admin";
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, role: User["role"]) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Check for token on mount
        const storedToken = localStorage.getItem("token");
        const storedRole = localStorage.getItem("role") as User["role"];

        if (storedToken && storedRole) {
            setToken(storedToken);
            setUser({ id: "stored-id", email: "user@example.com", role: storedRole }); // Placeholder user data for now
        }
        setIsLoading(false);
    }, []);

    const login = useCallback((newToken: string, newRole: User["role"]) => {
        localStorage.setItem("token", newToken);
        localStorage.setItem("role", newRole);
        setToken(newToken);
        setUser({ id: "new-id", email: "user@example.com", role: newRole });
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        setToken(null);
        setUser(null);
        router.push("/login");
    }, [router]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
