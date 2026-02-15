"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { ArrowLeft, Download, CheckCircle, Clock } from "lucide-react";

interface Submission {
    id: string;
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string;
    score: number;
    status: string;
    started_at: string;
    submitted_at: string;
    answers: any[];
}

import { Modal } from "@/components/ui/Modal";
import { Eye, X, Phone } from "lucide-react";

export default function SubmissionsPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchData(params.id as string);
        }
    }, [isAuthenticated, isLoading, params.id, router, user]);

    const fetchData = async (id: string) => {
        try {
            const [subData, assessData] = await Promise.all([
                apiRequest(`/api/assessments/${id}/submissions`, "GET"),
                apiRequest(`/api/assessments/${id}`, "GET")
            ]);
            setSubmissions(subData || []);
            setAssessment(assessData);
        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-gray-500 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Assessments
                </button>

                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Assessment Submissions</h1>
                        <p className="text-gray-500">View candidate performance and results.</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="p-4">Candidate</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Score</th>
                                    <th className="p-4">Submitted At</th>
                                    <th className="p-4">Duration</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {submissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            No submissions yet.
                                        </td>
                                    </tr>
                                ) : (
                                    submissions.map((sub) => (
                                        <tr key={sub.id} className="hover:bg-gray-50 transition">
                                            <td className="p-4">
                                                <div className="font-medium text-gray-900">{sub.candidate_name || "Unknown"}</div>
                                                <div className="text-sm text-gray-500">{sub.candidate_email}</div>
                                                {sub.candidate_phone && (
                                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Phone size={12} /> {sub.candidate_phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sub.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {sub.status}
                                                </span>
                                            </td>
                                            <td className="p-4 font-bold text-gray-900">{sub.score}</td>
                                            <td className="p-4 text-gray-600">
                                                {new Date(sub.submitted_at).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-gray-600">
                                                {sub.submitted_at && sub.started_at ?
                                                    Math.round((new Date(sub.submitted_at).getTime() - new Date(sub.started_at).getTime()) / 60000) + " mins"
                                                    : "-"}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => setSelectedSubmission(sub)}
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg tooltip"
                                                    title="View Answers"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedSubmission && assessment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{selectedSubmission.candidate_name}'s Submission</h3>
                                <div className="flex gap-4 text-sm text-gray-500 mt-1">
                                    <span>{selectedSubmission.candidate_email}</span>
                                    {selectedSubmission.candidate_phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={14} /> {selectedSubmission.candidate_phone}
                                        </span>
                                    )}
                                    <span>Score: {selectedSubmission.score}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedSubmission(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {assessment.questions.map((q: any, idx: number) => {
                                const answer = selectedSubmission.answers?.find((a: any) => a.question_id === q.id);
                                const isCorrect = answer?.is_correct;
                                const isMCQ = q.type === "MCQ";

                                return (
                                    <div key={idx} className={`p-4 rounded-lg border ${isMCQ
                                        ? (isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")
                                        : "border-gray-200 bg-gray-50"
                                        }`}>
                                        <div className="flex justify-between mb-2">
                                            <span className="font-semibold text-gray-700">Question {idx + 1}</span>
                                            <span className="text-sm text-gray-500">{q.points} Points</span>
                                        </div>
                                        <p className="text-gray-900 font-medium mb-3">{q.text}</p>

                                        <div className="text-sm">
                                            <p className="font-semibold text-gray-600">Candidate Answer:</p>
                                            <p className={`font-mono mt-1 p-2 rounded ${isMCQ
                                                ? (isCorrect ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100")
                                                : "text-gray-800 bg-white border border-gray-200"
                                                }`}>
                                                {answer?.value || "No Answer"}
                                            </p>
                                        </div>

                                        {isMCQ && !isCorrect && (
                                            <div className="mt-2 text-sm">
                                                <p className="font-semibold text-gray-600">Correct Answer:</p>
                                                <p className="text-green-700 font-mono">{q.correct_answer}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
