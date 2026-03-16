"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [current, setCurrent] = useState<Toast | null>(null);
    const queue = useRef<Toast[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showNext = useCallback(() => {
        const next = queue.current.shift();
        if (!next) {
            setCurrent(null);
            return;
        }
        setCurrent(next);
        timerRef.current = setTimeout(() => {
            setCurrent(null);
        }, 3000);
    }, []);

    // When current becomes null (dismissed or expired), pop the next one
    useEffect(() => {
        if (!current && queue.current.length > 0) {
            // Small gap so exit animation plays
            const t = setTimeout(showNext, 300);
            return () => clearTimeout(t);
        }
    }, [current, showNext]);

    const dismiss = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCurrent(null);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Date.now() + Math.random();
        const toast: Toast = { id, message, type };

        if (!current && queue.current.length === 0) {
            // Nothing showing — display immediately
            setCurrent(toast);
            timerRef.current = setTimeout(() => {
                setCurrent(null);
            }, 3000);
        } else {
            // Something showing — enqueue
            queue.current.push(toast);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                <AnimatePresence mode="wait">
                    {current && (
                        <motion.div
                            key={current.id}
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.9 }}
                            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[300px] ${
                                current.type === "success"
                                    ? "bg-white border-green-200 text-green-800"
                                    : current.type === "error"
                                        ? "bg-white border-red-200 text-red-800"
                                        : "bg-white border-blue-200 text-blue-800"
                            }`}
                        >
                            {current.type === "success" && <CheckCircle size={20} className="text-green-500 shrink-0" />}
                            {current.type === "error" && <AlertCircle size={20} className="text-red-500 shrink-0" />}
                            {current.type === "info" && <Info size={20} className="text-blue-500 shrink-0" />}

                            <span className="flex-1 text-sm font-medium">{current.message}</span>

                            {queue.current.length > 0 && (
                                <span className="text-xs font-bold bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 shrink-0">
                                    +{queue.current.length}
                                </span>
                            )}

                            <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 pointer-events-auto shrink-0">
                                <X size={16} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}
