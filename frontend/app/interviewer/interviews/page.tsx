"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Calendar, Clock, Plus, Trash2, CheckCircle, XCircle, Users } from "lucide-react";

interface Interview {
    id: string;
    interviewer_id: string;
    candidate_id?: string;
    title: string;
    description: string;
    type: string;
    scheduled_at: string;
    duration: number;
    status: string;
    meeting_link?: string;
    notes?: string;
}

export default function InterviewerInterviewsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();

    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [completeModalOpen, setCompleteModalOpen] = useState(false);
    const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null);
    const [completionNotes, setCompletionNotes] = useState("");
    const { showToast } = useToast();

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated) {
            fetchInterviews();
        }
    }, [isAuthenticated, isLoading, router, user]);

    const fetchInterviews = async () => {
        try {
            const data = await apiRequest("/api/interviews/my", "GET");
            setInterviews(data || []);
        } catch (err) {
            console.error("Failed to fetch interviews", err);
            showToast("Failed to fetch interviews", "error");
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (id: string) => {
        setSelectedInterviewId(id);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!selectedInterviewId) return;

        try {
            await apiRequest(`/api/interviews/${selectedInterviewId}`, "DELETE");
            setInterviews(interviews.filter(i => i.id !== selectedInterviewId));
            showToast("Interview cancelled successfully", "success");
        } catch (err) {
            showToast("Failed to cancel interview", "error");
        } finally {
            setDeleteModalOpen(false);
            setSelectedInterviewId(null);
        }
    };

    const openCompleteModal = (id: string) => {
        setSelectedInterviewId(id);
        setCompletionNotes("");
        setCompleteModalOpen(true);
    };

    const handleComplete = async () => {
        if (!selectedInterviewId) return;

        try {
            await apiRequest(`/api/interviews/${selectedInterviewId}/complete`, "POST", { notes: completionNotes });
            fetchInterviews(); // Refresh list
            showToast("Interview marked as completed", "success");
        } catch (err) {
            showToast("Failed to complete interview", "error");
        } finally {
            setCompleteModalOpen(false);
            setSelectedInterviewId(null);
        }
    };

    const filteredInterviews = interviews.filter(interview => {
        if (filter === "all") return true;
        return interview.status === filter;
    });

    const stats = {
        total: interviews.length,
        available: interviews.filter(i => i.status === "available").length,
        scheduled: interviews.filter(i => i.status === "scheduled").length,
        completed: interviews.filter(i => i.status === "completed").length,
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            available: "bg-blue-50 text-blue-700 border-blue-200",
            scheduled: "bg-green-50 text-green-700 border-green-200",
            confirmed: "bg-purple-50 text-purple-700 border-purple-200",
            completed: "bg-gray-50 text-gray-700 border-gray-200",
            cancelled: "bg-red-50 text-red-700 border-red-200",
        };
        return styles[status as keyof typeof styles] || "bg-gray-50 text-gray-700";
    };

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Interview Management</h1>
                        <p className="text-gray-600 mt-1">Manage your interview slots and schedules</p>
                    </div>
                    <button
                        onClick={() => router.push("/interviewer/interviews/create")}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                        <Plus size={20} /> Create Interview Slot
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Interviews</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
                            </div>
                            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                                <Calendar className="text-indigo-600" size={24} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Available Slots</p>
                                <p className="text-3xl font-bold text-blue-600 mt-2">{stats.available}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                                <Clock className="text-blue-600" size={24} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Scheduled</p>
                                <p className="text-3xl font-bold text-green-600 mt-2">{stats.scheduled}</p>
                            </div>
                            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                                <Users className="text-green-600" size={24} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Completed</p>
                                <p className="text-3xl font-bold text-gray-600 mt-2">{stats.completed}</p>
                            </div>
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <CheckCircle className="text-gray-600" size={24} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex gap-2">
                        {["all", "available", "scheduled", "completed", "cancelled"].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilter(status)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status
                                    ? "bg-indigo-600 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                    }`}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Interviews List */}
                <div className="space-y-4">
                    {filteredInterviews.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                            <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews found</h3>
                            <p className="text-gray-600 mb-6">
                                {filter === "all"
                                    ? "Create your first interview slot to get started"
                                    : `No ${filter} interviews at the moment`
                                }
                            </p>
                            {filter === "all" && (
                                <button
                                    onClick={() => router.push("/interviewer/interviews/create")}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    <Plus size={20} /> Create Interview Slot
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredInterviews.map((interview) => (
                            <div key={interview.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900">{interview.title}</h3>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(interview.status)}`}>
                                                {interview.status}
                                            </span>
                                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                                {interview.type}
                                            </span>
                                        </div>
                                        {interview.description && (
                                            <p className="text-gray-600 text-sm mb-3">{interview.description}</p>
                                        )}
                                        <div className="flex items-center gap-6 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} />
                                                {formatDateTime(interview.scheduled_at)}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock size={16} />
                                                {interview.duration} minutes
                                            </div>
                                            {interview.candidate_id && (
                                                <div className="flex items-center gap-2">
                                                    <Users size={16} />
                                                    Candidate Booked
                                                </div>
                                            )}
                                        </div>
                                        {interview.meeting_link && (
                                            <a
                                                href={interview.meeting_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 hover:text-indigo-800 text-sm mt-2 inline-block"
                                            >
                                                Join Meeting →
                                            </a>
                                        )}
                                    </div>

                                    {/* Delete Confirmation Modal */}
                                    <Modal
                                        isOpen={deleteModalOpen}
                                        onClose={() => setDeleteModalOpen(false)}
                                        title="Cancel Interview"
                                        footer={
                                            <>
                                                <button
                                                    onClick={() => setDeleteModalOpen(false)}
                                                    className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                                                >
                                                    No, Keep It
                                                </button>
                                                <button
                                                    onClick={handleDelete}
                                                    className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 font-medium"
                                                >
                                                    Yes, Cancel Interview
                                                </button>
                                            </>
                                        }
                                    >
                                        <p className="text-gray-600">
                                            Are you sure you want to cancel this interview?
                                            <br />
                                            This action cannot be undone.
                                        </p>
                                    </Modal>

                                    {/* Complete Interview Modal */}
                                    <Modal
                                        isOpen={completeModalOpen}
                                        onClose={() => setCompleteModalOpen(false)}
                                        title="Complete Interview"
                                        footer={
                                            <>
                                                <button
                                                    onClick={() => setCompleteModalOpen(false)}
                                                    className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleComplete}
                                                    className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium"
                                                >
                                                    Complete Interview
                                                </button>
                                            </>
                                        }
                                    >
                                        <div>
                                            <p className="text-gray-600 mb-4">
                                                Mark this interview as completed? You can add optional notes below.
                                            </p>
                                            <textarea
                                                value={completionNotes}
                                                onChange={(e) => setCompletionNotes(e.target.value)}
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter interview notes or feedback..."
                                                rows={4}
                                            />
                                        </div>
                                    </Modal>
                                </div>

                                <div className="flex gap-2">
                                    {interview.status === "scheduled" && (
                                        <button
                                            onClick={() => openCompleteModal(interview.id)}
                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                            title="Mark as Completed"
                                        >
                                            <CheckCircle size={20} />
                                        </button>
                                    )}
                                    {interview.status !== "completed" && interview.status !== "cancelled" && (
                                        <button
                                            onClick={() => confirmDelete(interview.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Cancel Interview"
                                        >
                                            <XCircle size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>

                        ))
                    )}
                </div>
            </div>
        </div >
    );
}
