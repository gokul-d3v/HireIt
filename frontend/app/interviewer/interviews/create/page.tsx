"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, Save, Calendar, Clock, FileText, Tag } from "lucide-react";

export default function CreateInterviewSlotPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState("Technical");
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledTime, setScheduledTime] = useState("");
    const [duration, setDuration] = useState(60);
    const [meetingLink, setMeetingLink] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">Loading...</div>;
    if (!isAuthenticated || user?.role !== "interviewer") {
        router.push("/login");
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title || !scheduledDate || !scheduledTime) {
            showToast("Please fill in all required fields", "error");
            return;
        }

        // Combine date and time into ISO string
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

        setSubmitting(true);
        try {
            await apiRequest("/api/interviews/slots", "POST", {
                title,
                description,
                type,
                scheduled_at: scheduledAt,
                duration,
                meeting_link: meetingLink,
            });

            showToast("Interview slot created successfully!", "success");
            router.push("/interviewer/interviews");
        } catch (err: any) {
            showToast(err.message || "Failed to create interview slot", "error");
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-4 mb-8 shadow-sm">
                    <div className="flex items-center justify-between max-w-4xl mx-auto">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            <ArrowLeft size={20} />
                            Back
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-70 transition-colors"
                        >
                            <Save size={18} />
                            {submitting ? "Creating..." : "Create Slot"}
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Interview Slot</h1>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Title */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <FileText size={16} />
                                Title *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                placeholder="e.g., Technical Interview - React Developer"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <FileText size={16} />
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow resize-none"
                                rows={3}
                                placeholder="Provide details about the interview..."
                            />
                        </div>

                        {/* Interview Type */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Tag size={16} />
                                Interview Type *
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                required
                            >
                                <option value="Technical">Technical</option>
                                <option value="HR">HR</option>
                                <option value="Behavioral">Behavioral</option>
                                <option value="System Design">System Design</option>
                                <option value="Coding">Coding</option>
                                <option value="Cultural Fit">Cultural Fit</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        {/* Date and Time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                    <Calendar size={16} />
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={scheduledDate}
                                    onChange={(e) => setScheduledDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                    required
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                    <Clock size={16} />
                                    Time *
                                </label>
                                <input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                    required
                                />
                            </div>
                        </div>

                        {/* Duration */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock size={16} />
                                Duration (minutes) *
                            </label>
                            <select
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                required
                            >
                                <option value={15}>15 minutes</option>
                                <option value={30}>30 minutes</option>
                                <option value={45}>45 minutes</option>
                                <option value={60}>60 minutes</option>
                                <option value={90}>90 minutes</option>
                                <option value={120}>120 minutes</option>
                            </select>
                        </div>

                        {/* Meeting Link */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <FileText size={16} />
                                Meeting Link (Optional)
                            </label>
                            <input
                                type="url"
                                value={meetingLink}
                                onChange={(e) => setMeetingLink(e.target.value)}
                                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                placeholder="https://meet.google.com/... or https://zoom.us/..."
                            />
                            <p className="text-sm text-gray-500 mt-1">Add a Google Meet, Zoom, or other video call link</p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
