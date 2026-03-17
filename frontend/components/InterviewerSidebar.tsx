"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BarChart3, FilePlus, Users, Menu, X, FileText, BookOpen, LogOut } from "lucide-react";

export default function InterviewerSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    const navItems = [
        { label: "Dashboard", icon: BarChart3, path: "/interviewer/dashboard" },
        { label: "Assessments", icon: FilePlus, path: "/interviewer/assessments" },
        { label: "Exam Results", icon: FileText, path: "/interviewer/exam-results" },
        { label: "Exam Sheet", icon: BookOpen, path: "/interviewer/exam-sheet" },
        { label: "Interviews", icon: Users, path: "/interviewer/interviews" },
    ];

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-slate-900">HireIt</span>
                </div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="ml-auto p-2 text-slate-400 hover:bg-slate-50 rounded-lg"
                >
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-white text-slate-900 transform transition-transform duration-300 ease-in-out
                    md:sticky md:top-0 md:h-screen md:translate-x-0 md:block border-r border-slate-100
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}
                `}
            >
                <div className="p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-2xl font-bold leading-none tracking-tight text-slate-900">HireIt</h1>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Interviewer</span>
                        </div>
                    </div>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.path}
                                onClick={() => {
                                    router.push(item.path);
                                    setIsOpen(false);
                                }}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all group
                                    ${isActive 
                                        ? "bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100/50" 
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}
                                `}
                            >
                                <Icon 
                                    size={20} 
                                    className={`transition-transform ${isActive ? "scale-110" : "group-hover:scale-110"}`} 
                                />
                                {item.label}
                                {isActive && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                                )}
                            </button>
                        );
                    })}
                </nav>
                <div className="absolute bottom-0 w-64 p-4">
                    <button
                        onClick={() => {
                            localStorage.removeItem("token");
                            localStorage.removeItem("role");
                            window.location.href = "/login";
                        }}
                        className="w-full flex items-center gap-3 px-4 py-4 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>
            </aside>
        </>
    );
}

