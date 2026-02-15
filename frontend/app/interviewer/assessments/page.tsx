"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Plus, Edit, Trash2, Users, Search, Clock, FileText, Share2 } from "lucide-react";

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: any[];
    created_at: string;
    phase?: number;
    next_phase_id?: string;
    total_marks?: number;
}

export default function InterviewerAssessmentsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && user?.role === "interviewer") {
            fetchAssessments();
        }
    }, [isAuthenticated, isLoading, user, router]);

    const fetchAssessments = async () => {
        try {
            const data = await apiRequest("/api/assessments/my", "GET");
            setAssessments(data || []);
        } catch (err) {
            console.error("Failed to fetch assessments", err);
            setAssessments([]);
            showToast("Failed to fetch assessments", "error");
        } finally {
            setLoading(false);
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
            setAssessments((assessments || []).filter(a => a.id !== selectedAssessmentId));
            showToast("Assessment deleted successfully", "success");
        } catch (err) {
            console.error("Failed to delete assessment", err);
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

    const filteredAssessments = (assessments || [])
        .filter(a => a.phase === 1 || !a.phase) // Show only Phase 1 or legacy assessments
        .filter(a =>
            a.title.toLowerCase().includes(searchTerm.toLowerCase())
        );

    if (isLoading || loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">My Assessments</h1>
                        <p className="text-gray-500">Manage your technical assessments and view submissions.</p>
                    </div>
                    <button
                        onClick={() => router.push("/interviewer/assessments/create")}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
                    >
                        <Plus size={20} /> Create New
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="p-4 border-b border-gray-200 flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Search assessments..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="p-4">Title</th>
                                    <th className="p-4">Questions</th>
                                    <th className="p-4">Duration</th>
                                    <th className="p-4">Created At</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredAssessments.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-500">
                                            No assessments found. Create your first one!
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAssessments.map((assessment) => (
                                        <tr key={assessment.id} className="hover:bg-gray-50 transition">
                                            <td className="p-4 font-medium text-gray-900">
                                                {assessment.title}
                                                {assessment.next_phase_id && (
                                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                                        Multi-Phase
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-gray-600">{assessment.questions?.length || 0} questions</td>
                                            <td className="p-4 text-gray-600 flex items-center gap-1">
                                                <Clock size={16} /> {assessment.duration} mins
                                            </td>
                                            <td className="p-4 text-gray-600">
                                                {new Date(assessment.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleShare(assessment.id)}
                                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg tooltip"
                                                        title="Share Public Link"
                                                    >
                                                        <Share2 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => router.push(`/interviewer/assessments/${assessment.id}/submissions`)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg tooltip"
                                                        title="View Submissions"
                                                    >
                                                        <Users size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => router.push(`/interviewer/assessments/${assessment.id}/edit`)}
                                                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                                        title="Edit"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => confirmDelete(assessment.id)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
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
                    <br />
                    This action cannot be undone.
                </p>
            </Modal>
        </div>
    );
}
