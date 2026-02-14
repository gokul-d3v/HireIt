"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { User, Briefcase, ChevronLeft, Lock, Mail, ArrowRight, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "candidate" | "interviewer";

export default function SignupPage() {
    const [role, setRole] = useState<Role>("candidate");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate signup delay
        setTimeout(() => setIsLoading(false), 2000);
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-gray-50">
            {/* Left Panel - Visual */}
            <div className="hidden lg:flex relative bg-indigo-600 overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=2084&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                <div className="relative z-10 p-12 text-white max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <h2 className="text-4xl font-bold mb-6">Join BroAssess Today</h2>
                        <p className="text-indigo-100 text-lg leading-relaxed">
                            Start your journey with the ultimate platform for technical assessments and hiring.
                        </p>
                        <div className="mt-8 space-y-4">
                            <div className="flex items-center gap-4 text-indigo-100/80">
                                <div className="p-2 bg-white/10 rounded-lg">
                                    <UserPlus size={20} />
                                </div>
                                <span>Create an account to get started</span>
                            </div>
                            <div className="flex items-center gap-4 text-indigo-100/80">
                                <div className="p-2 bg-white/10 rounded-lg">
                                    <Briefcase size={20} />
                                </div>
                                <span>Hire top talent or land your dream job</span>
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
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Create Account</h1>
                        <p className="mt-2 text-gray-500">
                            Sign up as a {role} to get started.
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

                    {/* Signup Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                                Full Name
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <User size={18} />
                                </div>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    autoComplete="name"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm bg-gray-50/50"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>

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
                            <label htmlFor="password" classNae="block text-sm font-medium text-gray-700 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
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
                                    Create Account
                                    <ArrowRight size={18} className="ml-2" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-10 text-center text-sm text-gray-500">
                        Already have an account?{" "}
                        <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
