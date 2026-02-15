"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { CheckCircle, XCircle, ArrowRight, Trophy, Home } from "lucide-react";

interface Submission {
    id: string;
    score: number;
    status: string;
    submitted_at: string;
    total_marks?: number;
    passed?: boolean;
    next_phase_unlocked?: boolean;
    next_phase_id?: string;
}

export default function PublicResultPage() {
    const router = useRouter();
    const params = useParams();
    const [result, setResult] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (params.id) {
            fetchResult(params.id as string);
        }
    }, [params.id]);

    const fetchResult = async (id: string) => {
        try {
            const data = await apiRequest(`/api/assessments/${id}/result`, "GET");
            setResult(data);
        } catch (err) {
            console.error("Failed to fetch result", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
    );

    if (!result) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">No Result Found</h1>
            <p className="text-gray-500 mb-6">We couldn't find your submission for this assessment.</p>
        </div>
    );

    const percentage = result.total_marks ? Math.round((result.score / result.total_marks) * 100) : 0;
    const isPassed = result.passed !== undefined ? result.passed : false;

    return (
        <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center justify-center">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
                <div className={`w-16 h-16 ${isPassed ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                    {isPassed ? (
                        <Trophy className="text-green-600" size={32} />
                    ) : (
                        <XCircle className="text-red-600" size={32} />
                    )}
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-2 font-outfit">Assessment Completed!</h1>
                <p className={`${isPassed ? 'text-green-600' : 'text-red-600'} font-semibold mb-8`}>
                    {isPassed ? '🎉 Congratulations! You Passed!' : '❌ Not Passed - Try again later.'}
                </p>

                <div className={`${isPassed ? 'bg-green-50' : 'bg-red-50'} rounded-xl p-6 mb-8 border ${isPassed ? 'border-green-100' : 'border-red-100'}`}>
                    <div className={`text-sm ${isPassed ? 'text-green-600' : 'text-red-600'} font-medium uppercase tracking-wide mb-1`}>Your Score</div>
                    <div className={`text-4xl font-extrabold ${isPassed ? 'text-green-900' : 'text-red-900'}`}>
                        {result.score} / {result.total_marks || result.score}
                    </div>
                    <div className={`text-xs ${isPassed ? 'text-green-400' : 'text-red-400'} mt-2`}>
                        {percentage}% Score
                    </div>
                </div>

                {isPassed && result.next_phase_unlocked && result.next_phase_id && (
                    <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl animate-pulse-slow">
                        <div className="flex items-center justify-center gap-2 text-indigo-700 font-semibold mb-2">
                            <Trophy size={20} />
                            <span>Level Up! Phase 2 Unlocked</span>
                        </div>
                        <p className="text-sm text-indigo-600 mb-4">You've qualified for the next phase of the assessment.</p>
                        <button
                            onClick={() => router.push(`/public/assessments/${result.next_phase_id}`)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transition shadow-lg transform hover:scale-[1.02]"
                        >
                            Proceed to Next Phase <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {!isPassed && (
                    <p className="text-gray-500 text-sm mb-8 italic">
                        "Success is not final, failure is not fatal: it is the courage to continue that counts."
                    </p>
                )}

                <div className="text-sm text-gray-400">
                    Thank you for participating.
                </div>
            </div>
        </div>
    );
}
