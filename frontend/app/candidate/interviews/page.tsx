"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Calendar, Clock, Tag, Users, CheckCircle, XCircle } from "lucide-react";

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
}

export default function CandidateInterviewsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();

    const { showToast } = useToast();
    const [availableSlots, setAvailableSlots] = useState<Interview[]>([]);
    const [myInterviews, setMyInterviews] = useState<Interview[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"available" | "my">("available");

    // Modal state
    const [modalAction, setModalAction] = useState<"book" | "cancel" | null>(null);
    const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "candidate")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated) {
            fetchData();
        }
    }, [isAuthenticated, isLoading, router, user]);

    const fetchData = async () => {
        try {
            const [available, my] = await Promise.all([
                apiRequest("/api/interviews/available", "GET"),
                apiRequest("/api/interviews/my", "GET"),
            ]);
            setAvailableSlots(available || []);
            setMyInterviews(my || []);
        } catch (err) {
            console.error("Failed to fetch interviews", err);
            showToast("Failed to fetch interviews", "error");
        } finally {
            setLoading(false);
        }
    };

    const confirmAction = (action: "book" | "cancel", id: string) => {
        setModalAction(action);
        setSelectedInterviewId(id);
    };

    const handleConfirm = async () => {
        if (!selectedInterviewId || !modalAction) return;

        try {
            if (modalAction === "book") {
                await apiRequest(`/api/interviews/${selectedInterviewId}/book`, "POST", {});
                showToast("Interview booked successfully!", "success");
            } else {
                await apiRequest(`/api/interviews/${selectedInterviewId}`, "DELETE");
                showToast("Interview cancelled successfully", "success");
            }
            fetchData();
        } catch (err: any) {
            showToast(err.message || `Failed to ${modalAction} interview`, "error");
        } finally {
            setModalAction(null);
            setSelectedInterviewId(null);
        }
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

    const isUpcoming = (dateString: string) => {
        return new Date(dateString) > new Date();
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            scheduled: "bg-green-50 text-green-700 border-green-200",
            confirmed: "bg-purple-50 text-purple-700 border-purple-200",
            completed: "bg-gray-50 text-gray-700 border-gray-200",
            cancelled: "bg-red-50 text-red-700 border-red-200",
        };
        return styles[status as keyof typeof styles] || "bg-gray-50 text-gray-700";
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Interviews</h1>
                    <p className="text-gray-600 mt-1">Browse available slots and manage your interviews</p>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab("available")}
                            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === "available"
                                ? "text-indigo-600 border-b-2 border-indigo-600"
                                : "text-gray-600 hover:text-gray-900"
                                }`}
                        >
                            Available Slots ({availableSlots.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("my")}
                            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === "my"
                                ? "text-indigo-600 border-b-2 border-indigo-600"
                                : "text-gray-600 hover:text-gray-900"
                                }`}
                        >
                            My Interviews ({myInterviews.length})
                        </button>
                    </div>
                </div>

                {/* Available Slots Tab */}
                {activeTab === "available" && (
                    <div className="space-y-4">
                        {availableSlots.length === 0 ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No available slots</h3>
                                <p className="text-gray-600">Check back later for new interview opportunities</p>
                            </div>
                        ) : (
                            availableSlots.map((slot) => (
                                <div key={slot.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">{slot.title}</h3>
                                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                                    {slot.type}
                                                </span>
                                            </div>
                                            {slot.description && (
                                                <p className="text-gray-600 text-sm mb-3">{slot.description}</p>
                                            )}
                                            <div className="flex items-center gap-6 text-sm text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={16} />
                                                    {formatDateTime(slot.scheduled_at)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={16} />
                                                    {slot.duration} minutes
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => confirmAction("book", slot.id)}
                                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
                                        >
                                            Book Interview
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* My Interviews Tab */}
                {activeTab === "my" && (
                    <div className="space-y-4">
                        {myInterviews.length === 0 ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <Users size={48} className="mx-auto text-gray-400 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews booked</h3>
                                <p className="text-gray-600 mb-6">Book an interview from the available slots</p>
                                <button
                                    onClick={() => setActiveTab("available")}
                                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                >
                                    Browse Available Slots
                                </button>
                            </div>
                        ) : (
                            myInterviews.map((interview) => (
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
                                            <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={16} />
                                                    {formatDateTime(interview.scheduled_at)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={16} />
                                                    {interview.duration} minutes
                                                </div>
                                            </div>
                                            {interview.meeting_link && isUpcoming(interview.scheduled_at) && (
                                                <a
                                                    href={interview.meeting_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition-colors"
                                                >
                                                    Join Meeting →
                                                </a>
                                            )}
                                        </div>

                                        {interview.status === "scheduled" && isUpcoming(interview.scheduled_at) && (
                                            <button
                                                onClick={() => confirmAction("cancel", interview.id)}
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
                )}
            </div>

            <Modal
                isOpen={!!modalAction}
                onClose={() => setModalAction(null)}
                title={modalAction === "book" ? "Confirm Booking" : "Confirm Cancellation"}
                footer={
                    <>
                        <button
                            onClick={() => setModalAction(null)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`px-4 py-2 text-white rounded-lg font-medium ${modalAction === "book"
                                ? "bg-indigo-600 hover:bg-indigo-700"
                                : "bg-red-600 hover:bg-red-700"
                                }`}
                        >
                            {modalAction === "book" ? "Confirm Booking" : "Confirm Cancel"}
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    {modalAction === "book"
                        ? "Are you sure you want to book this interview slot?"
                        : "Are you sure you want to cancel this interview?"
                    }
                </p>
            </Modal>
        </div>
    );
}
