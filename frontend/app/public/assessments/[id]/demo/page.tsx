"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

export default function PublicDemoAssessmentPage() {
    const router = useRouter();
    const params = useParams();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (params.id) {
            startDemoSession(params.id as string);
        }
    }, [params.id]);

    const startDemoSession = async (id: string) => {
        // Clear old sessions just in case
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        try {
            const data = await apiRequest("/api/public/demo", "POST", {});

            if (data.token && data.user) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));

                showToast("Starting Demo Assessment...", "success");
                // Redirect straight to the take page, bypassing the normal registration
                router.replace(`/public/assessments/${id}/take`);
            } else {
                throw new Error("Invalid response from demo API");
            }
        } catch (err: any) {
            console.error("Demo Start Error", err);
            showToast(err.message || "Failed to start demo assessment", "error");
            setLoading(false); // only stop loading on error so we can show error message
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            {loading ? (
                <>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-gray-600 font-medium">Preparing Demo Environment...</p>
                </>
            ) : (
                <div className="text-center">
                    <p className="text-red-500 font-medium mb-4">Failed to load demo assessment.</p>
                    <button 
                        onClick={() => startDemoSession(params.id as string)}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Retry
                    </button>
                </div>
            )}
        </div>
    );
}
