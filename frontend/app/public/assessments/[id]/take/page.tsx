"use client";

import { useParams, useRouter } from "next/navigation";
import AssessmentPlayer from "@/components/AssessmentPlayer";
import { useEffect, useState } from "react";

export default function PublicTakeAssessmentPage() {
    const params = useParams();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Basic check if token exists (set by previous page)
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace(`/public/assessments/${params.id}`);
        }
    }, [params.id, router]);

    if (!mounted) return null;

    return (
        <AssessmentPlayer
            assessmentId={params.id as string}
            onComplete={() => router.push(`/public/assessments/${params.id}/result`)}
        />
    );
}
