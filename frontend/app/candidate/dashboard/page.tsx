"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Clock, CheckCircle, Play, Users, ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/api";

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: any[];
    phase?: number;
    next_phase_id?: string;
}

interface Submission {
    id: string;
    assessment_id: string;
    passed: boolean;
    submitted_at: string;
}

interface AssessmentCardData {
    id: string; // The ID to link to (could be Phase 1, 2, or 3)
    displayTitle: string; // Title to show (usually Phase 1 title or "Phase X")
    description: string;
    phase: number; // Current active phase number
    duration: number;
    questionCount: number;
    status: 'Start' | 'Resume' | 'Completed' | 'Failed';
}

export default function CandidateDashboard() {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const [rawAssessments, setRawAssessments] = useState<Assessment[]>([]);
    const [groupedAssessments, setGroupedAssessments] = useState<AssessmentCardData[]>([]);
    const [completedCount, setCompletedCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Protect the route
    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated) {
            router.push("/login");
        }
    }, [isAuthenticated, router, isLoading]);

    // Fetch available assessments
    useEffect(() => {
        if (user?.role === "candidate") {
            fetchData();
        }
    }, [user, isAuthenticated]);

    const fetchData = async () => {
        try {
            const [assessmentsData, submissionsData] = await Promise.all([
                apiRequest("/api/assessments", "GET"),
                apiRequest("/api/submissions/me", "GET")
            ]);

            setRawAssessments(assessmentsData || []);

            // Calculate completed tests
            const uniqueCompleted = new Set(submissionsData.map((s: Submission) => s.assessment_id));
            setCompletedCount(uniqueCompleted.size);

            processAssessments(assessmentsData || [], submissionsData || []);
        } catch (error) {
            console.error("Failed to fetch dashboard data", error);
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
            let status: 'Start' | 'Resume' | 'Completed' | 'Failed' = 'Start';

            // Traverse the chain
            while (true) {
                // Check if this assessment has been submitted
                // const submission = allSubmissions.find(s => s.assessment_id === currentAssessment.id && s.passed);
                // Need to find *any* submission for this assessment, not just passed
                const submission = allSubmissions.find(s => s.assessment_id === currentAssessment.id);

                if (submission) {
                    if (submission.passed) {
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
                    } else {
                        // Submission exists but NOT passed -> Failed
                        status = 'Failed';
                    }
                }
                break; // If not passed or no next phase, stop traversal
            }

            return {
                id: currentAssessment.id,
                displayTitle: root.title,
                description: root.description,
                phase: currentPhase,
                duration: currentAssessment.duration,
                questionCount: currentAssessment.questions?.length || 0,
                status: status
            };
        });

        setGroupedAssessments(processed);
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (!user) return null;

    return (
        <main className="flex-1 p-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user.email}</h2>
                    <p className="text-gray-500">Here's an overview of your assessments.</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                    {user.email[0].toUpperCase()}
                </div>
            </header>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                            <Clock size={24} />
                        </div>
                        <span className="text-2xl font-bold text-gray-900">
                            {loading ? "..." : groupedAssessments.length}
                        </span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-500">Available Assessments</h3>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                            <CheckCircle size={24} />
                        </div>
                        <span className="text-2xl font-bold text-gray-900">
                            {loading ? "..." : completedCount}
                        </span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-500">Completed Tests</h3>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                            <FileText size={24} />
                        </div>
                        <span className="text-2xl font-bold text-gray-900">-</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-500">Average Score</h3>
                </motion.div>
            </div>

            {/* Recent Assessments List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Available Assessments</h3>
                </div>
                <div className="divide-y divide-gray-200">
                    {loading ? (
                        <div className="p-6 text-center text-gray-500">Loading assessments...</div>
                    ) : groupedAssessments.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">No assessments available at the moment.</div>
                    ) : (
                        groupedAssessments.slice(0, 5).map((item) => (
                            <div key={item.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium text-gray-900">{item.displayTitle}</h4>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                                Phase {item.phase}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {item.questionCount} questions • {item.duration} minutes
                                        </p>
                                    </div>
                                </div>
                                {item.status === 'Completed' ? (
                                    <button
                                        onClick={() => router.push(`/candidate/assessments/${item.id}/result`)}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
                                    >
                                        <CheckCircle size={16} />
                                        Completed
                                    </button>
                                ) : item.status === 'Failed' ? (
                                    <button
                                        onClick={() => router.push(`/candidate/assessments/${item.id}/result`)}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                                    >
                                        <CheckCircle size={16} />
                                        Failed
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => router.push(`/candidate/assessments/${item.id}/take`)}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        <Play size={16} />
                                        {item.status === 'Start' ? 'Start Test' : 'Resume'}
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
                {groupedAssessments.length > 5 && (
                    <div className="px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => router.push("/candidate/assessments")}
                            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            View All Assessments
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
