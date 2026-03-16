"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Clock, CheckCircle, Users, Menu, X } from "lucide-react";

export default function CandidateSidebar() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-30">
                <span className="text-xl font-bold text-indigo-600">HireIt</span>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
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
                    fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
                    md:sticky md:top-0 md:h-screen md:translate-x-0 md:block
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                `}
            >
                <div className="p-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-indigo-600">HireIt</h1>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="md:hidden p-1 text-gray-500 hover:text-gray-700"
                    >
                        <X size={20} />
                    </button>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    <button
                        onClick={() => {
                            router.push("/candidate/dashboard");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 rounded-lg focus:bg-indigo-50 focus:text-indigo-600"
                    >
                        <FileText size={20} />
                        Dashboard
                    </button>
                    <button
                        onClick={() => {
                            router.push("/candidate/assessments");
                            setIsOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 rounded-lg focus:bg-indigo-50 focus:text-indigo-600"
                    >
                        <CheckCircle size={20} />
                        Assessments
                    </button>
                    <button
                        onClick={() => {
                            router.push("/candidate/interviews");
                            setIsOpen(false);
                        }}
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
        </>
    );
}
