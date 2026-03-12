"use client";

import { useParams, useRouter } from "next/navigation";
import AssessmentPlayer from "@/components/AssessmentPlayer";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

export default function TakeAssessmentPage() {
    const params = useParams();
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "candidate")) {
            router.push("/login");
        }
    }, [isAuthenticated, isLoading, router, user]);

    if (isLoading || !isAuthenticated || !params.id) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <AssessmentPlayer
            assessmentId={params.id as string}
            onComplete={() => router.push(`/candidate/assessments/${params.id}/result`)}
        />
    );
}
