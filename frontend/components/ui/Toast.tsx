"use client";

import React, { createContext, useContext, useCallback } from "react";
import toast from "react-hot-toast";

type ToastType = "success" | "error" | "info";

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = message; // prevent duplicate identical toasts
        if (type === "success") toast.success(message, { id });
        else if (type === "error") toast.error(message, { id });
        else toast(message, { id });
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        // Fallback for components used outside the provider (or if provider is being swapped)
        return {
            showToast: (message: string, type: ToastType = "info") => {
                if (type === "success") toast.success(message);
                else if (type === "error") toast.error(message);
                else toast(message);
            }
        };
    }
    return context;
}
