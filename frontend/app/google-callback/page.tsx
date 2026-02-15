"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function GoogleCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login } = useAuth();

    useEffect(() => {
        const token = searchParams.get("token");
        const role = searchParams.get("role");

        if (token && role) {
            // Login via AuthContext
            login(token, role as any);

            // Redirect based on role
            if (role === "candidate") {
                router.push("/candidate/dashboard");
            } else if (role === "interviewer") {
                router.push("/interviewer/dashboard");
            } else {
                router.push("/login");
            }
        } else {
            // Handle error or missing params
            router.push("/login?error=google_auth_failed");
        }
    }, [searchParams, login, router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Logging you in...</h2>
                <p className="text-gray-500">Please wait while we verify your Google account.</p>
            </div>
        </div>
    );
}

export default function GoogleCallbackPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <GoogleCallbackContent />
        </Suspense>
    );
}
