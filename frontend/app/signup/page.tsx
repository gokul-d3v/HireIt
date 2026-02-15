
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { User, Briefcase, ChevronLeft, Lock, Mail, ArrowRight, UserPlus, AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type Role = "candidate" | "interviewer";

export default function SignupPage() {
  const [role, setRole] = useState<Role>("candidate");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && user) {
      if (user.role === "candidate") router.push("/candidate/dashboard");
      else router.push("/interviewer/dashboard");
    }
  }, [isAuthLoading, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      // 1. Signup
      await apiRequest("/signup", "POST", {
        name,
        email,
        password,
        role,
      });

      // 2. Auto-Login
      const loginData = await apiRequest("/login", "POST", {
        email,
        password,
      });

      login(loginData.token, loginData.role);

      if (role === "candidate") {
        router.push("/candidate/dashboard");
      } else {
        router.push("/interviewer/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
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
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm bg-gray-50/50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all sm:text-sm bg-gray-50/50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or sign up with</span>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <a
                href={`http://localhost:8080/auth/google/login?role=${role}`}
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path d="M12.545,10.539H24c0.125,0.852,0.208,1.758,0.208,2.724c0,2.71-0.732,5.132-1.956,7.129 c-1.637,2.693-4.484,4.607-8.254,4.607C6.271,25,0,18.729,0,12.5C0,6.271,6.271,0,14,0c3.781,0,6.965,1.402,9.394,3.692l-3.328,3.208 C18.769,5.772,16.579,4.688,14,4.688c-4.309,0-7.813,3.496-7.813,7.813s3.504,7.813,7.813,7.813c3.676,0,6.902-2.289,8.082-5.772 h-9.537V10.539z" fill="#4285F4" />
                </svg>
                Google
              </a>
            </div>
          </div>

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

