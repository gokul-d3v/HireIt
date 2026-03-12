"use client";

import { useParams, useRouter } from "next/navigation";
import AssessmentPlayer from "@/components/AssessmentPlayer";
import { useEffect, useState } from "react";

export default function PublicTakeAssessmentPage() {
    const params = useParams();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace(`/public/assessments/${params.id}`);
            setIsAuthorized(false);
        } else {
            setIsAuthorized(true);
        }
    }, [params.id, router]);

    if (isAuthorized === null || isAuthorized === false) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <AssessmentPlayer
            assessmentId={params.id as string}
            onComplete={() => router.push(`/public/assessments/${params.id}/result`)}
        />
    );
}
