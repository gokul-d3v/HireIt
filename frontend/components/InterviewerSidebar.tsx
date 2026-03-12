"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, FilePlus, Users, Menu, X, FileText } from "lucide-react";

export default function InterviewerSidebar() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden bg-indigo-900 border-b border-indigo-800 p-4 flex items-center justify-between sticky top-0 z-30">
                <span className="text-xl font-bold text-white">HireIt</span>
                <span className="text-xs text-indigo-300 uppercase tracking-wider ml-2">Interviewer</span>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="ml-auto p-2 text-indigo-200 hover:bg-white/10 rounded-lg"
                >
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-indigo-900 text-white transform transition-transform duration-300 ease-in-out
                    md:relative md:translate-x-0 md:block
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                `}
            >
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">HireIt</h1>
                        <span className="text-xs text-indigo-300 uppercase tracking-wider">Interviewer</span>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="md:hidden p-1 text-indigo-300 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    <button
                        onClick={() => {
                            router.push("/interviewer/dashboard");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                    >
                        <BarChart3 size={20} />
                        Dashboard
                    </button>
                    <button
                        onClick={() => {
                            router.push("/interviewer/assessments");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                    >
                        <FilePlus size={20} />
                        Assessments
                    </button>
                    <button
                        onClick={() => {
                            router.push("/interviewer/exam-results");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                    >
                        <FileText size={20} />
                        Exam Results
                    </button>
                    <button
                        onClick={() => {
                            router.push("/interviewer/interviews");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                    >
                        <Users size={20} />
                        Interviews
                    </button>
                </nav>
                <div className="absolute bottom-0 w-64 p-4">
                    <button
                        onClick={() => {
                            localStorage.removeItem("token");
                            localStorage.removeItem("role");
                            window.location.href = "/login";
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-300 hover:bg-white/5 hover:text-red-200 rounded-lg"
                    >
                        <Users size={20} className="rotate-180" />
                        Logout
                    </button>
                </div>
            </aside>
        </>
    );
}
