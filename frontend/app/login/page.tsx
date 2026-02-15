"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { User, Briefcase, ChevronLeft, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

type Role = "candidate" | "interviewer";

function LoginContent() {
    const [role, setRole] = useState<Role>("candidate");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { login, isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!isAuthLoading && isAuthenticated && user) {
            if (user.role === "candidate") router.push("/candidate/dashboard");
            else router.push("/interviewer/dashboard");
        }

        // Check for error params from OAuth redirect
        const errorParam = searchParams.get("error");
        const messageParam = searchParams.get("message");
        if (errorParam === "role_mismatch" && messageParam) {
            setError(decodeURIComponent(messageParam));
        }
    }, [isAuthLoading, isAuthenticated, user, router, searchParams]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            const data = await apiRequest("/login", "POST", {
                email,
                password,
                role, // Pass the selected role to the API
            });

            login(data.token, data.role);
            // Optionally redirect based on role or to a default dashboard
            if (data.role === "candidate") {
                router.push("/candidate/dashboard");
            } else if (data.role === "interviewer") {
                router.push("/interviewer/dashboard");
            }
        } catch (err: any) {
            setError(err.message || "Invalid credentials");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-gray-50">
            {/* Left Panel - Visual */}
            <div className="hidden lg:flex relative bg-indigo-600 overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                <div className="relative z-10 p-12 text-white max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <h2 className="text-4xl font-bold mb-6">Welcome Back to BroAssess</h2>
                        <p className="text-indigo-100 text-lg leading-relaxed">
                            The professional platform for conducting seamless technical interviews and secure assessments.
                        </p>
                        <div className="mt-8 space-y-4">
                            <div className="flex items-center gap-4 text-indigo-100/80">
                                <div className="p-2 bg-white/10 rounded-lg">
                                    <User size={20} />
                                </div>
                                <span>Candidate Portal for taking tests</span>
                            </div>
                            <div className="flex items-center gap-4 text-indigo-100/80">
                                <div className="p-2 bg-white/10 rounded-lg">
                                    <Briefcase size={20} />
                                </div>
                                <span>Interviewer Dashboard for management</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Panel - Form */}
            <div className="flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24 py-12 bg-white">
                <div className="w-full max-w-md mx-auto">
                    <Link
                        href="/"
                        className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors mb-8 group"
                    >
                        <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-1 transition-transform" />
                        Back to Home
                    </Link>

                    <div className="mb-10">
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Sign in</h1>
                        <p className="mt-2 text-gray-500">
                            Access your dashboard to continue.
                        </p>
                    </div>

                    {/* Role Toggle */}
                    <div className="bg-gray-100 p-1 rounded-xl flex mb-8">
                        <button
                            onClick={() => setRole("candidate")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
                                role === "candidate"
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            <User size={18} />
                            Candidate
                        </button>
                        <button
                            onClick={() => setRole("interviewer")}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
                                role === "interviewer"
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            <Briefcase size={18} />
                            Interviewer
                        </button>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                                Email address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Mail size={18} />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm bg-gray-50/50"
                                    placeholder="name@company.com"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Password
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm bg-gray-50/50"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-indigo-500/30"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Sign in as {role === "candidate" ? "Candidate" : "Interviewer"}
                                    <ArrowRight size={18} className="ml-2" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">Or continue with</span>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <a
                                href={`http://localhost:8080/auth/google/login?role=${role}`}
                                className="w-full inline-flex justify-center py-3 px-4 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                    <path d="M12.545,10.539H24c0.125,0.852,0.208,1.758,0.208,2.724c0,2.71-0.732,5.132-1.956,7.129 c-1.637,2.693-4.484,4.607-8.254,4.607C6.271,25,0,18.729,0,12.5C0,6.271,6.271,0,14,0c3.781,0,6.965,1.402,9.394,3.692l-3.328,3.208 C18.769,5.772,16.579,4.688,14,4.688c-4.309,0-7.813,3.496-7.813,7.813s3.504,7.813,7.813,7.813c3.676,0,6.902-2.289,8.082-5.772 h-9.537V10.539z" fill="#4285F4" />
                                </svg>
                                Google
                            </a>
                            <button
                                type="button"
                                className="w-full inline-flex justify-center py-3 px-4 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                GitHub
                            </button>
                        </div>
                    </div>
                </div>

                <p className="mt-10 text-center text-sm text-gray-500">
                    Don't have an account?{" "}
                    <Link href="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">
                        Create an account
                    </Link>
                </p>
            </div>
        </div>
    );

}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <LoginContent />
        </Suspense>
    );
}
