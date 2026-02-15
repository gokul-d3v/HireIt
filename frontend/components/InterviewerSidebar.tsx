"use client";

import { useRouter } from "next/navigation";
import { BarChart3, FilePlus, Users } from "lucide-react";

export default function InterviewerSidebar() {
    const router = useRouter();

    return (
        <aside className="w-64 bg-indigo-900 text-white hidden md:block relative flex-shrink-0">
            <div className="p-6">
                <h1 className="text-2xl font-bold">BroAssess</h1>
                <span className="text-xs text-indigo-300 uppercase tracking-wider">Interviewer</span>
            </div>
            <nav className="mt-6 px-4 space-y-2">
                <button
                    onClick={() => router.push("/interviewer/dashboard")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                >
                    <BarChart3 size={20} />
                    Dashboard
                </button>
                <button
                    onClick={() => router.push("/interviewer/assessments")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-indigo-200 hover:bg-white/10 hover:text-white rounded-lg focus:bg-white/10 focus:text-white"
                >
                    <FilePlus size={20} />
                    Assessments
                </button>
                <button
                    onClick={() => router.push("/interviewer/interviews")}
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
    );
}
