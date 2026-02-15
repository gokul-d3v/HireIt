"use client";

import { useRouter } from "next/navigation";
import { FileText, Clock, CheckCircle, Users } from "lucide-react";

export default function CandidateSidebar() {
    const router = useRouter();

    return (
        <aside className="w-64 bg-white border-r border-gray-200 hidden md:block relative flex-shrink-0">
            <div className="p-6">
                <h1 className="text-2xl font-bold text-indigo-600">BroAssess</h1>
            </div>
            <nav className="mt-6 px-4 space-y-2">
                <button
                    onClick={() => router.push("/candidate/dashboard")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 rounded-lg focus:bg-indigo-50 focus:text-indigo-600"
                >
                    <FileText size={20} />
                    Dashboard
                </button>
                <button
                    onClick={() => router.push("/candidate/assessments")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 rounded-lg focus:bg-indigo-50 focus:text-indigo-600"
                >
                    <CheckCircle size={20} />
                    Assessments
                </button>
                <button
                    onClick={() => router.push("/candidate/interviews")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 rounded-lg focus:bg-indigo-50 focus:text-indigo-600"
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg"
                >
                    <Clock size={20} className="rotate-180" />
                    Logout
                </button>
            </div>
        </aside>
    );
}
