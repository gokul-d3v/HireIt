"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users, FilePlus, PlayCircle, BarChart3, Plus, Trash2, Layers, Share2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { useSearchParams } from "next/navigation";
import { SetPasswordModal } from "@/components/auth/SetPasswordModal";

interface Assessment {
    id: string;
    title: string;
    questions: any[];
    created_at: string;
    phase?: number;
    next_phase_id?: string;
}

interface DashboardStats {
    totalCandidates: number;
    activeTests: number;
    completedTests: number;
    pendingReview: number;
}

export default function InterviewerDashboard() {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [files, setFiles] = useState<Assessment[]>([]); // Flat list for deletion
    const [stats, setStats] = useState<DashboardStats>({
        totalCandidates: 0,
        activeTests: 0,
        completedTests: 0,
        pendingReview: 0
    });
    const [loadingAssessments, setLoadingAssessments] = useState(true);
    const [loadingStats, setLoadingStats] = useState(true);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    useEffect(() => {
        if (searchParams.get("setup_password") === "true") {
            setShowPasswordModal(true);
        }
    }, [searchParams]);

    // Protect the route
    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated) {
            router.push("/login");
        } else if (user?.role !== "interviewer") {
            // router.push("/candidate/dashboard");
        }
    }, [isAuthenticated, user, router, isLoading]);

    // Fetch Assessments and Stats
    useEffect(() => {
        if (user?.role === "interviewer") {
            fetchAssessments();
            fetchStats();
        }
    }, [user]);

    const fetchAssessments = async () => {
        try {
            const data = await apiRequest("/api/assessments/my", "GET");
            setFiles(data || []);

            // Group assessments: Only show Phase 1s or assessments with no phase
            const grouped = (data || []).filter((a: Assessment) => a.phase === 1 || !a.phase);
            setAssessments(grouped);
        } catch (error) {
            console.error("Failed to fetch assessments", error);
            setAssessments([]);
            showToast("Failed to fetch assessments", "error");
        } finally {
            setLoadingAssessments(false);
        }
    };

    const fetchStats = async () => {
        try {
            // Fetch real stats from backend
            // For now, calculate from available data
            const assessmentsData = await apiRequest("/api/assessments/my", "GET");

            // Calculate stats from assessments
            setStats({
                totalCandidates: 0, // Would need a separate endpoint
                activeTests: assessmentsData?.length || 0,
                completedTests: 0, // Would need submissions data
                pendingReview: 0 // Would need submissions data
            });
        } catch (error) {
            console.error("Failed to fetch stats", error);
        } finally {
            setLoadingStats(false);
        }
    };

    const confirmDelete = (id: string) => {
        setSelectedAssessmentId(id);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!selectedAssessmentId) return;

        try {
            await apiRequest(`/api/assessments/${selectedAssessmentId}`, "DELETE");
            setAssessments(assessments.filter(a => a.id !== selectedAssessmentId));
            setFiles(files.filter(a => a.id !== selectedAssessmentId));
            // Update stats
            setStats(prev => ({ ...prev, activeTests: prev.activeTests - 1 }));
            showToast("Assessment deleted successfully", "success");
        } catch (error) {
            console.error("Failed to delete assessment", error);
            showToast("Failed to delete assessment", "error");
        } finally {
            setDeleteModalOpen(false);
            setSelectedAssessmentId(null);
        }
    };

    const handleShare = (id: string) => {
        const shareUrl = `${window.location.origin}/public/assessments/${id}`;
        navigator.clipboard.writeText(shareUrl);
        showToast("Assessment link copied to clipboard!", "success");
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    if (!user) return null;

    return (
        <main className="flex-1 p-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
                    <p className="text-gray-500">Manage assessments and track candidate progress.</p>
                </div>
                <button
                    onClick={() => router.push("/interviewer/assessments/create")}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm"
                >
                    <Plus size={18} />
                    New Assessment
                </button>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Candidates</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loadingStats ? "..." : stats.totalCandidates}
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                            <PlayCircle size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Active Tests</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loadingStats ? "..." : stats.activeTests}
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Completed</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loadingStats ? "..." : stats.completedTests}
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                            <FilePlus size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Pending Review</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loadingStats ? "..." : stats.pendingReview}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* Assessments List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">Your Assessments (Grouped by Series)</h3>
                    <button
                        onClick={() => router.push("/interviewer/assessments")}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        View All
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-500">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                            <tr>
                                <th className="px-6 py-3">Title</th>
                                <th className="px-6 py-3">Questions</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Created Date</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loadingAssessments ? (
                                <tr><td colSpan={5} className="px-6 py-4 text-center">Loading assessments...</td></tr>
                            ) : assessments.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-4 text-center">No assessments found. Create one!</td></tr>
                            ) : (
                                assessments.slice(0, 5).map((assessment) => (
                                    <tr key={assessment.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{assessment.title}</td>
                                        <td className="px-6 py-4">{assessment.questions?.length || 0}</td>
                                        <td className="px-6 py-4">
                                            {assessment.next_phase_id ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                                    <Layers size={14} className="mr-1" /> Multi-Phase
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                    Single
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">{new Date(assessment.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 flex gap-2">
                                            <button
                                                onClick={() => handleShare(assessment.id)}
                                                className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50"
                                                title="Share Public Link"
                                            >
                                                <Share2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => confirmDelete(assessment.id)}
                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                                title="Delete Assessment"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete Assessment"
                footer={
                    <>
                        <button
                            onClick={() => setDeleteModalOpen(false)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 font-medium"
                        >
                            Delete
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    Are you sure you want to delete this assessment?
                </p>
                <p className="text-sm text-red-500 mt-2">
                    Warning: This will delete all connected phases and submissions!
                </p>
            </Modal>
            <SetPasswordModal
                isOpen={showPasswordModal}
                onClose={() => {
                    setShowPasswordModal(false);
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                }}
            />
        </main >
    );
}
