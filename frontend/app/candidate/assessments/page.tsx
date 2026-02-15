"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { Clock, CheckCircle, ArrowRight, Lock, PlayCircle } from "lucide-react";

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: any[];
    created_at: string;
    phase?: number;
    next_phase_id?: string;
}

interface Submission {
    id: string;
    assessment_id: string;
    passed: boolean;
    next_phase_unlocked: boolean;
    submitted_at: string;
}

interface AssessmentCardData {
    id: string; // The ID to link to (could be Phase 1, 2, or 3)
    displayTitle: string; // Title to show (usually Phase 1 title or "Phase X")
    description: string;
    phase: number; // Current active phase number
    totalPhases?: number; // Optional: if we want to show "Phase 1 of 3"
    duration: number;
    questionCount: number;
    isLocked: boolean; // Should not happen for the active card, but good for safety
    status: 'Start' | 'Resume' | 'Completed';
}

export default function CandidateAssessmentsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [groupedAssessments, setGroupedAssessments] = useState<AssessmentCardData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "candidate")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && user?.role === "candidate") {
            fetchData();
        }
    }, [isAuthenticated, isLoading, user, router]);

    const fetchData = async () => {
        try {
            const [assessmentsData, submissionsData] = await Promise.all([
                apiRequest("/api/assessments", "GET"),
                apiRequest("/api/submissions/me", "GET")
            ]);

            setAssessments(assessmentsData);
            setSubmissions(submissionsData);
            processAssessments(assessmentsData, submissionsData);
        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            setLoading(false);
        }
    };

    const processAssessments = (allAssessments: Assessment[], allSubmissions: Submission[]) => {
        // 1. Identify Root Assessments (Phase 1 or No Phase)
        const rootAssessments = allAssessments.filter(a => a.phase === 1 || !a.phase);

        const processed: AssessmentCardData[] = rootAssessments.map(root => {
            let currentAssessment = root;
            let currentPhase = root.phase || 1;
            let status: 'Start' | 'Resume' | 'Completed' = 'Start';

            // Traverse the chain
            while (true) {
                // Check if this assessment has been passed
                const submission = allSubmissions.find(s => s.assessment_id === currentAssessment.id && s.passed);

                if (submission) {
                    // This phase is passed. 
                    // If there is a next phase, move to it.
                    if (currentAssessment.next_phase_id) {
                        const nextAssessment = allAssessments.find(a => a.id === currentAssessment.next_phase_id);
                        if (nextAssessment) {
                            currentAssessment = nextAssessment;
                            currentPhase = nextAssessment.phase || (currentPhase + 1);
                            status = 'Resume'; // We are resuming the series
                            continue; // Check if THIS next phase is also passed
                        }
                    } else {
                        // Phase passed, but no next phase. Series completed.
                        status = 'Completed';
                    }
                }
                break; // If not passed or no next phase, stop traversal
            }

            return {
                id: currentAssessment.id,
                displayTitle: root.title, // Keep the original title (e.g., "Full Stack Assessment")
                description: root.description,
                phase: currentPhase,
                duration: currentAssessment.duration,
                questionCount: currentAssessment.questions?.length || 0,
                isLocked: false, // The calculated 'current' is always unlocked by definition
                status: status
            };
        });

        setGroupedAssessments(processed);
    };

    if (isLoading || loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Available Assessments</h1>
                    <p className="text-gray-500 mt-2">Take assessments assigned to you. Multi-phase assessments will unlock sequentially.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedAssessments.map((item) => (
                        <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition relative">
                            {item.status === 'Completed' && (
                                <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg z-10">
                                    COMPLETED
                                </div>
                            )}

                            <div className="p-6">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-900">{item.displayTitle}</h3>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 shrink-0 ml-2">
                                        Phase {item.phase}
                                    </span>
                                </div>
                                <p className="text-gray-500 mb-4 line-clamp-2">{item.description}</p>

                                <div className="flex items-center gap-4 text-sm text-gray-600 mb-6">
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} />
                                        <span>{item.duration} mins</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <CheckCircle size={16} />
                                        <span>{item.questionCount} Questions</span>
                                    </div>
                                </div>

                                {item.status === 'Completed' ? (
                                    <button
                                        disabled
                                        className="w-full flex items-center justify-center gap-2 bg-green-50 text-green-700 border border-green-200 py-3 rounded-lg font-semibold cursor-default"
                                    >
                                        <CheckCircle size={18} /> All Phases Completed
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => router.push(`/candidate/assessments/${item.id}/take`)}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
                                    >
                                        {item.status === 'Start' ? 'Start Assessment' : 'Resume Next Phase'} <ArrowRight size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {groupedAssessments.length === 0 && (
                        <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                            No assessments currently available.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
