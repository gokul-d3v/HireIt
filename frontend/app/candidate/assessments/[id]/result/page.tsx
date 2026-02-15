"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { CheckCircle, XCircle, Home, FileText, ArrowRight, Trophy, Lock } from "lucide-react";

interface Submission {
    id: string;
    score: number;
    status: string;
    answers: any[];
    submitted_at: string;
    total_marks?: number;
    passed?: boolean;
    next_phase_unlocked?: boolean;
    next_phase_id?: string;
}

export default function AssessmentResultPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [result, setResult] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "candidate")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchResult(params.id as string);
        }
    }, [isAuthenticated, isLoading, params.id, router, user]);

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

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    if (!result) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">No Result Found</h1>
                <p className="text-gray-500 mb-6">You haven't submitted this assessment yet.</p>
                <button
                    onClick={() => router.push("/candidate/assessments")}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    Go to Assessments
                </button>
            </div>
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

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Assessment Completed!</h1>
                <p className={`${isPassed ? 'text-green-600' : 'text-red-600'} font-semibold mb-8`}>
                    {isPassed ? '🎉 Congratulations! You Passed!' : '❌ Not Passed - Keep Trying!'}
                </p>

                <div className={`${isPassed ? 'bg-green-50' : 'bg-red-50'} rounded-xl p-6 mb-8`}>
                    <div className={`text-sm ${isPassed ? 'text-green-600' : 'text-red-600'} font-medium uppercase tracking-wide mb-1`}>Your Score</div>
                    <div className={`text-4xl font-extrabold ${isPassed ? 'text-green-900' : 'text-red-900'}`}>
                        {result.score} / {result.total_marks || result.score}
                    </div>
                    <div className={`text-xs ${isPassed ? 'text-green-400' : 'text-red-400'} mt-2`}>
                        {percentage}% - {isPassed ? 'Passed' : 'Failed'}
                    </div>
                </div>

                {result.next_phase_unlocked && result.next_phase_id && (
                    <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl">
                        <div className="flex items-center justify-center gap-2 text-indigo-700 font-semibold mb-2">
                            <Trophy size={20} />
                            <span>Next Phase Unlocked!</span>
                        </div>
                        <p className="text-sm text-indigo-600 mb-4">You've qualified for the next level!</p>
                        <button
                            onClick={() => router.push(`/candidate/assessments/${result.next_phase_id}/take`)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transition shadow-lg"
                        >
                            Proceed to Next Phase <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Status</div>
                        <div className="font-semibold text-gray-900 capitalize">{result.status}</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Submitted On</div>
                        <div className="font-semibold text-gray-900 text-sm">
                            {new Date(result.submitted_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => router.push("/candidate/dashboard")}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                    >
                        <Home size={18} /> Back to Dashboard
                    </button>
                    <button
                        onClick={() => router.push("/candidate/assessments")}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                    >
                        <FileText size={18} /> View All Assessments
                    </button>
                </div>
            </div>
        </div>
    );
}
