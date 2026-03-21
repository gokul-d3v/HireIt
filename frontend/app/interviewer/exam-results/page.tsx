"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import {
    Eye,
    ShieldAlert,
    AlertTriangle,
    Clock,
    User,
    Mail,
    FileText,
    CheckCircle2,
    XCircle,
    ChevronRight,
    ChevronLeft,
    Search,
    Filter,
    ArrowLeft,
    CameraOff,
    CheckCircle,
    Phone,
    Play,
    ExternalLink
} from "lucide-react";

interface Submission {
    id: string;
    assessment_id: string;
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string;
    score: number;
    status: string;
    started_at: string;
    submitted_at: string;
    answers?: any[];
    violations?: any[];
    generated_questions?: any[]; // Questions actually served to this candidate
    shuffled_options?: Record<string, string[]>;
    face_snapshots?: {
        initial_image: string;
        middle_image: string;
        end_image: string;
        initial_vs_middle_distance: number | null;
        initial_vs_end_distance: number | null;
    };
}

const calculateMalpracticeRisk = (sub: Submission) => {
    let score = 0;
    const reasons: string[] = [];

    // Base violations
    if (sub.violations && sub.violations.length > 0) {
        const violationCount = sub.violations.length;
        score += violationCount * 15;
        reasons.push(`${violationCount} total proctoring violations detected`);

        // Critical types
        const criticals = sub.violations.filter(v => v.type === 'multiple_people' || v.type === 'object_detected');
        if (criticals.length > 0) {
            score += criticals.length * 10;
            reasons.push(`Critical violations: ${criticals.map(c => c.type).join(', ')}`);
        }

        const tabSwitches = sub.violations.filter(v => v.type === 'tab_switch');
        if (tabSwitches.length > 0) {
            score += tabSwitches.length * 5;
            reasons.push(`${tabSwitches.length} tab switch events`);
        }
    }

    // Identity Integrity
    if (sub.face_snapshots) {
        if (sub.face_snapshots.initial_vs_middle_distance !== null && sub.face_snapshots.initial_vs_middle_distance > 0.6) {
            score += 30;
            reasons.push("High face mismatch distance in mid-exam capture");
        }
        if (sub.face_snapshots.initial_vs_end_distance !== null && sub.face_snapshots.initial_vs_end_distance > 0.6) {
            score += 30;
            reasons.push("High face mismatch distance at final submission");
        }
    }

    let level: 'Trustworthy' | 'Found Anomalies' | 'Integrity Concerns' | 'Integrity Compromised' = 'Trustworthy';
    let color = 'text-green-600 bg-green-50 border-green-100';

    if (score >= 70) { level = 'Integrity Compromised'; color = 'text-red-700 bg-red-100 border-red-200'; }
    else if (score >= 40) { level = 'Integrity Concerns'; color = 'text-red-600 bg-red-50 border-red-100'; }
    else if (score >= 15) { level = 'Found Anomalies'; color = 'text-orange-600 bg-orange-50 border-orange-100'; }

    return { score, level, color, reasons };
};

interface Assessment {
    id: string;
    title: string;
    total_marks?: number;
}

export default function ExamResultsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [assessmentsMap, setAssessmentsMap] = useState<Record<string, Assessment>>({});
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    // Quiz Answers Pagination
    const QUIZ_PAGE_SIZE = 5;
    const [quizPage, setQuizPage] = useState(0);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        assessmentId: "all",
        status: "all",
        riskLevel: "all",
        minScore: "",
        maxScore: ""
    });

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated) {
            fetchData();
        }
    }, [isAuthenticated, isLoading, router, user]);

    const fetchData = async () => {
        try {
            const [logsData, assessData] = await Promise.all([
                apiRequest(`/api/assessments/interviewer/logs`, "GET"),
                apiRequest(`/api/assessments/my`, "GET")
            ]);

            const aMap: Record<string, Assessment> = {};
            if (assessData) {
                assessData.forEach((a: Assessment) => {
                    aMap[a.id] = a;
                });
            }

            setSubmissions(logsData || []);
            setAssessmentsMap(aMap);
        } catch (err) {
            console.error("Failed to fetch results data", err);
        } finally {
            setLoading(false);
        }
    };

    const getImageUrl = (path: string | undefined) => {
        if (!path) return "";
        if (path.startsWith('data:')) return path;
        if (path.startsWith('/api/telegram')) return `${process.env.DEV_NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${path}`;
        return path;
    };

    const fetchDetailedReport = async (sub: Submission) => {
        setReportLoading(true);
        setSelectedSubmission(sub);
        setQuizPage(0); // Reset to first page on new submission
        try {
            const assessData = await apiRequest(`/api/assessments/${sub.assessment_id}`, "GET");
            setSelectedAssessment(assessData);
        } catch (err) {
            console.error("Failed to fetch assessment details", err);
        } finally {
            setReportLoading(false);
        }
    };

    const formatDuration = (start: string, end: string) => {
        if (!start || !end) return "-";
        const diffMs = new Date(end).getTime() - new Date(start).getTime();
        if (diffMs < 0) return "0s";

        const totalSeconds = Math.floor(diffMs / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;

        if (mins === 0) return `${secs}s`;
        return `${mins}m ${secs}s`;
    };

    const filteredSubmissions = submissions.filter(sub => {
        // 1. Text Search (Name or Email)
        const matchesSearch =
            sub.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sub.candidate_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (assessmentsMap[sub.assessment_id]?.title || "").toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        // 2. Assessment Filter
        if (filters.assessmentId !== "all" && sub.assessment_id !== filters.assessmentId) return false;

        // 3. Status Filter
        if (filters.status !== "all" && sub.status !== filters.status) return false;

        // 4. Score Filter
        const score = sub.score;
        if (filters.minScore !== "" && score < parseInt(filters.minScore)) return false;
        if (filters.maxScore !== "" && score > parseInt(filters.maxScore)) return false;

        // 5. Risk Level Filter
        if (filters.riskLevel !== "all") {
            const risk = calculateMalpracticeRisk(sub);
            if (risk.level !== filters.riskLevel) return false;
        }

        return true;
    });

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    if (selectedSubmission) {
        const risk = calculateMalpracticeRisk(selectedSubmission);
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                {/* Back Button */}
                <div className="max-w-6xl mx-auto mb-6">
                    <button
                        onClick={() => {
                            setSelectedSubmission(null);
                            setSelectedAssessment(null);
                        }}
                        className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-bold transition-all px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm"
                    >
                        <ArrowLeft size={18} />
                        Back to Global Results
                    </button>
                </div>

                {reportLoading ? (
                    <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>
                ) : (
                    <>
                        {/* Image Preview Modal */}
                        {previewImage && (
                            <div
                                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 transition-all animate-in fade-in duration-200"
                                onClick={() => setPreviewImage(null)}
                            >
                                <button
                                    className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-full hover:bg-white/20"
                                    onClick={() => setPreviewImage(null)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                                <img
                                    src={previewImage}
                                    alt="Snapshot Preview"
                                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        )}

                        <div className="max-w-6xl mx-auto space-y-6">
                            {/* Header Info is now below the Snapshots or in the side */}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Left Column: Hero Snapshot */}
                                <div className="md:col-span-2 space-y-6">
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                                <Eye size={20} className="text-indigo-600" />
                                                Primary verification Snapshot
                                            </h2>
                                            <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded-full">Initial Capture</span>
                                        </div>
                                        <div className="aspect-video bg-black relative group cursor-zoom-in overflow-hidden">
                                            {(selectedSubmission.face_snapshots?.initial_image || selectedSubmission.face_snapshots?.middle_image || selectedSubmission.face_snapshots?.end_image) ? (
                                                <>
                                                    <img
                                                        src={getImageUrl(selectedSubmission.face_snapshots.initial_image || selectedSubmission.face_snapshots.middle_image || selectedSubmission.face_snapshots.end_image)}
                                                        alt="Candidate Hero"
                                                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                                        onClick={() => setPreviewImage(getImageUrl(selectedSubmission.face_snapshots?.initial_image || selectedSubmission.face_snapshots?.middle_image || selectedSubmission.face_snapshots?.end_image))}
                                                    />
                                                    <div
                                                        className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                        onClick={() => setPreviewImage(getImageUrl(selectedSubmission.face_snapshots?.initial_image || selectedSubmission.face_snapshots?.middle_image || selectedSubmission.face_snapshots?.end_image))}
                                                    >
                                                        <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30 text-white font-bold text-xs uppercase tracking-widest pointer-events-none">Click to Enlarge</div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-500 flex-col gap-2">
                                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <CameraOff size={24} />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-widest">No verification snapshots available</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 bg-indigo-50 border-t border-indigo-100">
                                            <p className="text-sm text-indigo-700 font-medium">
                                                {!selectedSubmission.face_snapshots?.initial_image && (selectedSubmission.face_snapshots?.middle_image || selectedSubmission.face_snapshots?.end_image)
                                                    ? "Showing fallback capture as the initial snapshot failed to load."
                                                    : "This snapshot was captured during the initial face calibration to establish the candidate's identity."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* All Snapshots Grid */}
                                    {(selectedSubmission.face_snapshots?.initial_image || selectedSubmission.face_snapshots?.middle_image || selectedSubmission.face_snapshots?.end_image) && (
                                        <div className="grid grid-cols-3 gap-4">
                                            {['initial_image', 'middle_image', 'end_image'].map((type) => {
                                                const img = (selectedSubmission.face_snapshots as any)?.[type];
                                                const label = type.split('_')[0].charAt(0).toUpperCase() + type.split('_')[0].slice(1);
                                                return (
                                                    <div key={type} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                                        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">
                                                            {label} Snapshot
                                                        </div>
                                                        <div className="aspect-video bg-black relative group cursor-pointer" onClick={() => img && setPreviewImage(getImageUrl(img))}>
                                                            {img ? (
                                                                <img src={getImageUrl(img)} className="w-full h-full object-cover" alt={label} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-500 font-bold uppercase tracking-tighter">Not Captured</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Malpractice Prediction Analysis */}
                                    <div className={`border rounded-2xl p-6 shadow-sm ${risk.level === 'Integrity Compromised' || risk.level === 'Integrity Concerns' ? 'bg-red-50 border-red-100' : 'bg-white border-gray-200'}`}>
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h4 className="text-lg font-bold text-gray-900">Integrity & Malpractice Analysis</h4>
                                                <p className="text-sm text-gray-500 font-medium">Automated trust assessment based on proctoring signals.</p>
                                            </div>
                                            <div className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest shadow-sm ${risk.color}`}>
                                                {risk.level}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="bg-white/50 p-4 rounded-xl border border-black/5">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Integrity Score</p>
                                                <p className="text-2xl font-black text-gray-900">{100 - risk.score}<span className="text-xs text-gray-400 font-medium ml-1">/100</span></p>
                                            </div>
                                            <div className="md:col-span-3 bg-white/50 p-4 rounded-xl border border-black/5">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Detection Signals</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {risk.reasons.length > 0 ? risk.reasons.map((r, i) => (
                                                        <span key={i} className="text-[11px] font-semibold bg-white px-2 py-1 rounded border border-gray-100 text-gray-700">
                                                            • {r}
                                                        </span>
                                                    )) : (
                                                        <span className="text-[11px] font-semibold text-green-600 uppercase tracking-tight">Verified Candidate Authenticity</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Candidate Stats */}
                                <div className="space-y-6">
                                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                                        <h3 className="text-xl font-bold text-gray-900 mb-4">{selectedSubmission.candidate_name}</h3>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-gray-600">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Clock size={16} /></div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Score</p>
                                                    <p className="text-2xl font-black text-indigo-600">
                                                        {selectedSubmission.score}
                                                        <span className="text-sm text-gray-400 ml-1 font-bold">/ {selectedAssessment?.total_marks || '--'}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-gray-600">
                                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Clock size={16} /></div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Total Duration</p>
                                                    <p className="text-lg font-black text-gray-900">{formatDuration(selectedSubmission.started_at, selectedSubmission.submitted_at)}</p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-gray-100 space-y-3">
                                                <div>
                                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Assessment</p>
                                                    <p className="text-sm font-semibold text-gray-900">{assessmentsMap[selectedSubmission.assessment_id]?.title || "Unknown Exam"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Email</p>
                                                    <p className="text-sm text-gray-700">{selectedSubmission.candidate_email}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Status</p>
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${selectedSubmission.status === 'submitted' || selectedSubmission.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {selectedSubmission.status.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                                        <h4 className="text-sm font-bold text-gray-900 mb-4 tracking-wide uppercase">Face Auth Integrity</h4>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                <span className="text-sm text-gray-600">Middle Match Score</span>
                                                <span className={`text-lg font-black ${selectedSubmission.face_snapshots?.initial_vs_middle_distance !== null && selectedSubmission.face_snapshots?.initial_vs_middle_distance! < 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {selectedSubmission.face_snapshots?.initial_vs_middle_distance !== null ? selectedSubmission.face_snapshots?.initial_vs_middle_distance!.toFixed(2) : "N/A"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                <span className="text-sm text-gray-600">End Match Score</span>
                                                <span className={`text-lg font-black ${selectedSubmission.face_snapshots?.initial_vs_end_distance !== null && selectedSubmission.face_snapshots?.initial_vs_end_distance! < 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {selectedSubmission.face_snapshots?.initial_vs_end_distance !== null ? selectedSubmission.face_snapshots?.initial_vs_end_distance!.toFixed(2) : "N/A"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline Table - First Section */}
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mt-8">
                                <div className="p-6 border-b border-gray-100 bg-white">
                                    <h4 className="text-xl font-bold text-gray-900">Proctoring Activity Timeline</h4>
                                    <p className="text-sm text-gray-500">Detailed logs of candidate presence and violations throughout the assessment duration.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="text-gray-500 border-b border-gray-100 font-bold bg-gray-50/50 uppercase tracking-widest text-[10px]">
                                            <tr>
                                                <th className="py-4 px-6 align-top w-12 text-center">No.</th>
                                                <th className="py-4 pr-6 align-top"><span className="flex items-center gap-1.5 text-indigo-500">📷 Snapshot</span></th>
                                                <th className="py-4 pr-6 align-top"><span className="flex items-center gap-1.5 text-green-500">📅 Timestamp</span></th>
                                                <th className="py-4 pr-6 align-top">Activity Description</th>
                                                <th className="py-4 px-3 align-top text-center"><span className="flex items-center gap-1.5 text-purple-600 justify-center">👁️ Faces</span></th>
                                                <th className="py-4 px-3 align-top text-center"><span className="flex items-center gap-1.5 text-orange-500 justify-center">📦 Objects</span></th>
                                                <th className="py-4 px-3 align-top text-center"><span className="flex items-center gap-1.5 text-teal-600 justify-center">👥 Persons</span></th>
                                                <th className="py-4 px-6 align-top text-center">Head Position</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedSubmission.face_snapshots?.initial_image && (
                                                <tr className="hover:bg-gray-50 transition-colors">
                                                    <td className="py-5 px-6 text-gray-400 font-bold text-center">01</td>
                                                    <td className="py-5 pr-6">
                                                        <button
                                                            onClick={() => setPreviewImage(getImageUrl(selectedSubmission.face_snapshots?.initial_image))}
                                                            className="relative group overflow-hidden rounded-lg shadow-sm bg-black w-20 h-14 border border-gray-200 block cursor-zoom-in"
                                                        >
                                                            <img src={getImageUrl(selectedSubmission.face_snapshots.initial_image)} alt="Start" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <Eye size={16} className="text-white" />
                                                            </div>
                                                        </button>
                                                    </td>
                                                    <td className="py-5 pr-6 text-gray-700 font-bold leading-tight">
                                                        {new Date(selectedSubmission.started_at).toLocaleDateString()}<br />
                                                        <span className="text-xs text-gray-400">{new Date(selectedSubmission.started_at).toLocaleTimeString()}</span>
                                                    </td>
                                                    <td className="py-5 pr-6">
                                                        <span className="font-semibold text-gray-900">Assessment Started</span>
                                                        <p className="text-xs text-gray-500 font-medium">Initial face verification successful.</p>
                                                    </td>
                                                    <td className="py-5 px-3 text-center text-purple-600 font-black">1</td>
                                                    <td className="py-5 px-3 text-center text-orange-500 font-black">0</td>
                                                    <td className="py-5 px-3 text-center text-teal-600 font-black">1</td>
                                                    <td className="py-5 px-3 text-center text-gray-500 font-medium">Straight ahead</td>
                                                </tr>
                                            )}

                                            {(selectedSubmission.violations || []).map((v, i) => (
                                                <tr key={i} className={`hover:bg-gray-50 transition-colors ${v.type !== 'info' ? 'bg-red-50/30' : ''}`}>
                                                    <td className="py-5 px-6 text-gray-400 font-bold text-center">{(i + 2).toString().padStart(2, '0')}</td>
                                                    <td className="py-5 pr-6">
                                                        <button
                                                            onClick={() => {
                                                                if (v.evidence) {
                                                                    if (v.evidence.includes("youtu.be") || v.evidence.includes("youtube.com") || v.evidence.includes("/api/telegram")) {
                                                                        window.open(getImageUrl(v.evidence), "_blank");
                                                                    } else {
                                                                        setPreviewImage(getImageUrl(v.evidence));
                                                                    }
                                                                }
                                                            }}
                                                            className={`relative group overflow-hidden rounded-lg shadow-sm bg-black w-20 h-14 border block ${v.evidence ? 'cursor-zoom-in' : 'cursor-default'} ${v.type !== 'info' ? 'border-red-400' : 'border-gray-200'}`}
                                                        >
                                                            {v.evidence ? (
                                                                <>
                                                                    {(v.evidence.includes("youtu.be") || v.evidence.includes("youtube.com") || v.evidence.includes("/api/telegram")) ? (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                                                            <Play size={24} className="text-red-600 fill-red-600" />
                                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <ExternalLink size={16} className="text-white" />
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <img src={getImageUrl(v.evidence)} alt="Violation" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                                <Eye size={16} className="text-white" />
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-red-500 bg-red-50 text-xl">⚠️</div>
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="py-5 pr-6 text-gray-700 font-bold leading-tight">
                                                        {new Date(v.timestamp || selectedSubmission.started_at).toLocaleDateString()}<br />
                                                        <span className="text-xs text-gray-400">{new Date(v.timestamp || selectedSubmission.started_at).toLocaleTimeString()}</span>
                                                    </td>
                                                    <td className="py-5 pr-6">
                                                        <span className={`font-bold ${v.type !== 'info' ? 'text-red-700' : 'text-gray-900'}`}>{v.reason || "Candidate present on screen."}</span>
                                                        <p className="text-xs text-gray-500 font-medium">{v.type !== 'info' && v.type !== 'tab_switch' ? "Violation detected by proctoring engine." : "Standard verification point."}</p>
                                                    </td>
                                                    <td className="py-5 px-3 text-center text-purple-600 font-black">{v.type === 'multiple_people' ? '2+' : '1'}</td>
                                                    <td className="py-5 px-3 text-center text-orange-500 font-black">{v.type === 'object_detected' ? '1' : '0'}</td>
                                                    <td className="py-5 px-3 text-center text-teal-600 font-black">{v.type === 'multiple_people' ? '2+' : '1'}</td>
                                                    <td className="py-5 px-3 text-center text-gray-500 font-medium">Straight ahead</td>
                                                </tr>
                                            ))}

                                            {selectedSubmission.face_snapshots?.end_image && (
                                                <tr className="hover:bg-gray-50 transition-colors">
                                                    <td className="py-5 px-6 text-gray-400 font-bold text-center">{((selectedSubmission.violations || []).length + 2).toString().padStart(2, '0')}</td>
                                                    <td className="py-5 pr-6">
                                                        <button
                                                            onClick={() => setPreviewImage(getImageUrl(selectedSubmission.face_snapshots?.end_image))}
                                                            className="relative group overflow-hidden rounded-lg shadow-sm bg-black w-20 h-14 border border-gray-200 block cursor-zoom-in"
                                                        >
                                                            <img src={getImageUrl(selectedSubmission.face_snapshots.end_image)} alt="End" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <Eye size={16} className="text-white" />
                                                            </div>
                                                        </button>
                                                    </td>
                                                    <td className="py-5 pr-6 text-gray-700 font-bold leading-tight">
                                                        {new Date(selectedSubmission.submitted_at).toLocaleDateString()}<br />
                                                        <span className="text-xs text-gray-400">{new Date(selectedSubmission.submitted_at).toLocaleTimeString()}</span>
                                                    </td>
                                                    <td className="py-5 pr-6">
                                                        <span className="font-semibold text-gray-900">Assessment Submitted</span>
                                                        <p className="text-xs text-gray-500 font-medium">Final verification point on submission.</p>
                                                    </td>
                                                    <td className="py-5 px-3 text-center text-purple-600 font-black">1</td>
                                                    <td className="py-5 px-3 text-center text-orange-500 font-black">0</td>
                                                    <td className="py-5 px-3 text-center text-teal-600 font-black">1</td>
                                                    <td className="py-5 px-3 text-center text-gray-500 font-medium">Straight ahead</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Questions Answered Summary Card */}
                            {selectedSubmission.answers && selectedSubmission.answers.length > 0 && (() => {
                                const total = (selectedSubmission.generated_questions || []).length || selectedSubmission.answers.length;
                                const answered = selectedSubmission.answers.length;
                                const correct = selectedSubmission.answers.filter((a: any) => a.is_correct).length;
                                const wrong = answered - correct;
                                const skipped = Math.max(0, total - answered);
                                return (
                                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-6">
                                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Questions Summary</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-100">
                                                <p className="text-3xl font-black text-indigo-600">{answered}</p>
                                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-1">Answered</p>
                                            </div>
                                            <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                                                <p className="text-3xl font-black text-green-600">{correct}</p>
                                                <p className="text-xs font-bold text-green-400 uppercase tracking-widest mt-1">Correct</p>
                                            </div>
                                            <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
                                                <p className="text-3xl font-black text-red-500">{wrong}</p>
                                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mt-1">Wrong</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                                                <p className="text-3xl font-black text-gray-400">{skipped}</p>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Skipped</p>
                                            </div>
                                        </div>
                                        {/* Accuracy bar */}
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                                                <span>Accuracy</span>
                                                <span>{answered > 0 ? Math.round((correct / answered) * 100) : 0}%</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                                                    style={{ width: `${answered > 0 ? Math.round((correct / answered) * 100) : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Candidate Quiz Answers - paginated, uses generated_questions or fallback */}
                            {(() => {
                                const genQs = selectedSubmission.generated_questions;
                                const fallbackQs = selectedAssessment?.questions;
                                const sourceQs: any[] = (genQs && genQs.length > 0) ? genQs : (fallbackQs || []);
                                if (sourceQs.length === 0) return null;
                                const totalPages = Math.ceil(sourceQs.length / QUIZ_PAGE_SIZE);
                                const pageQs = sourceQs.slice(quizPage * QUIZ_PAGE_SIZE, (quizPage + 1) * QUIZ_PAGE_SIZE);
                                return (
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mt-8">
                                        <div className="p-6 border-b border-gray-100 bg-white flex items-center justify-between">
                                            <div>
                                                <h4 className="text-xl font-bold text-gray-900 tracking-tight">Candidate Quiz Answers</h4>
                                                <p className="text-sm text-gray-500">Detailed review of individual question responses and scoring.</p>
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{sourceQs.length} Questions</span>
                                        </div>
                                        <div className="p-6 bg-gray-50/50 space-y-6">
                                            {pageQs.map((q: any, pageIdx: number) => {
                                                const idx = quizPage * QUIZ_PAGE_SIZE + pageIdx;
                                                const qid = typeof q.id === 'string' ? q.id : (q.id?.$oid || q._id?.$oid || q._id?.toString() || '');
                                                const answer = (selectedSubmission.answers || []).find((a: any) => {
                                                    const aid = typeof a.question_id === 'string' ? a.question_id : (a.question_id?.$oid || a.question_id?.toString());
                                                    return aid === qid;
                                                });
                                                const isCorrect = answer?.is_correct;
                                                const isAnswered = !!answer?.value;
                                                const isMCQ = q.type === "MCQ" || q.type === "multiple_choice";
                                                const opts = selectedSubmission.shuffled_options?.[qid] || q.options || [];
                                                return (
                                                    <div key={idx} className={`bg-white rounded-xl border p-6 shadow-sm ${!isAnswered ? 'border-gray-200' :
                                                            isCorrect ? 'border-green-200' : 'border-red-200'
                                                        }`}>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className="flex-1">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded mb-2 inline-block">
                                                                    Q{idx + 1} &bull; {q.category || q.type}
                                                                    {q.difficulty && <span className="ml-1 opacity-60">• {q.difficulty}</span>}
                                                                </span>
                                                                <p className="text-base font-bold text-gray-900 leading-snug">{q.text || q.question}</p>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                                                                <span className="text-xs font-bold text-gray-400 uppercase">{q.points || 0} pts</span>
                                                                {!isAnswered ? (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-500 uppercase tracking-wide">Skipped</span>
                                                                ) : isCorrect ? (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-700 uppercase tracking-wide">✓ Correct</span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 uppercase tracking-wide">✗ Wrong</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {isMCQ && opts.length > 0 && (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                                                                {opts.map((opt: string, oi: number) => {
                                                                    const isSelected = answer?.value === opt;
                                                                    const isRightAnswer = q.correct_answer === opt;
                                                                    let cls = 'border border-gray-100 bg-gray-50 text-gray-700';
                                                                    if (isSelected && isCorrect) cls = 'border-green-300 bg-green-50 text-green-800 font-bold';
                                                                    else if (isSelected && !isCorrect) cls = 'border-red-300 bg-red-50 text-red-800 font-bold';
                                                                    else if (!isSelected && isRightAnswer) cls = 'border-green-200 bg-green-50 text-green-700 font-semibold';
                                                                    return (
                                                                        <div key={oi} className={`p-3 rounded-lg text-sm flex items-center gap-2 ${cls}`}>
                                                                            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-black shrink-0"
                                                                                style={{ borderColor: 'currentColor' }}>
                                                                                {String.fromCharCode(65 + oi)}
                                                                            </span>
                                                                            <span>{opt}</span>
                                                                            {isSelected && <span className="ml-auto text-xs">{isCorrect ? '✓' : '✗'}</span>}
                                                                            {!isSelected && isRightAnswer && <span className="ml-auto text-xs text-green-600">✓ Correct</span>}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {!isMCQ && (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Candidate's Answer</p>
                                                                    <div className="p-3 rounded-xl font-mono text-sm bg-gray-50 border border-gray-100 text-gray-700">
                                                                        {answer?.value || <span className="italic opacity-40">No response</span>}
                                                                    </div>
                                                                </div>
                                                                {q.correct_answer && (
                                                                    <div>
                                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Correct Answer</p>
                                                                        <div className="p-3 rounded-xl font-mono text-sm bg-green-50 border border-green-100 text-green-700">
                                                                            {q.correct_answer}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {totalPages > 1 && (
                                            <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between">
                                                <p className="text-xs font-bold text-gray-500">
                                                    Showing Q{quizPage * QUIZ_PAGE_SIZE + 1}–{Math.min((quizPage + 1) * QUIZ_PAGE_SIZE, sourceQs.length)} of {sourceQs.length}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setQuizPage(p => Math.max(0, p - 1))}
                                                        disabled={quizPage === 0}
                                                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                    >
                                                        <ChevronLeft size={16} />
                                                    </button>
                                                    {Array.from({ length: totalPages }, (_, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setQuizPage(i)}
                                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border ${i === quizPage
                                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                                    : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                                                                }`}
                                                        >
                                                            {i + 1}
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => setQuizPage(p => Math.min(totalPages - 1, p + 1))}
                                                        disabled={quizPage === totalPages - 1}
                                                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                    >
                                                        <ChevronRight size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Exam Results</h1>
                        <p className="text-gray-500 font-medium mt-1">Review all global candidate scores and proctoring histories.</p>
                    </div>
                </div>

                {/* Search & Advanced Filters */}
                <div className="mb-8 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                            <input
                                type="text"
                                placeholder="Search candidate name or email..."
                                className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-gray-900 placeholder:text-gray-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-8 py-3.5 rounded-full border font-bold transition-all shadow-sm ${showFilters ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-600 hover:text-indigo-600'}`}
                        >
                            <Filter size={20} />
                            {showFilters ? 'Hide Filters' : 'Advanced Filters'}
                        </button>
                    </div>

                    {showFilters && (
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm animate-in slide-in-from-top-4 duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Assessment</label>
                                    <select
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900"
                                        value={filters.assessmentId}
                                        onChange={(e) => setFilters({ ...filters, assessmentId: e.target.value })}
                                    >
                                        <option value="all">All Assessments</option>
                                        {Object.entries(assessmentsMap).map(([id, a]) => (
                                            <option key={id} value={id}>{a.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Integrity Risk</label>
                                    <select
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900"
                                        value={filters.riskLevel}
                                        onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
                                    >
                                        <option value="all">All Risk Levels</option>
                                        <option value="Trustworthy">Trustworthy</option>
                                        <option value="Found Anomalies">Found Anomalies</option>
                                        <option value="Integrity Concerns">Integrity Concerns</option>
                                        <option value="Integrity Compromised">Integrity Compromised</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Status</label>
                                    <select
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900"
                                        value={filters.status}
                                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="completed">Completed</option>
                                        <option value="in_progress">In Progress</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Min %</label>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900"
                                            value={filters.minScore}
                                            onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Max %</label>
                                        <input
                                            type="number"
                                            placeholder="100"
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900"
                                            value={filters.maxScore}
                                            onChange={(e) => setFilters({ ...filters, maxScore: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 pt-6 border-t border-gray-50 flex justify-between items-center text-sm">
                                <p className="text-gray-500 font-medium">
                                    Showing <span className="text-indigo-600 font-bold">{filteredSubmissions.length}</span> of {submissions.length} results
                                </p>
                                <button
                                    onClick={() => {
                                        setSearchTerm("");
                                        setFilters({
                                            assessmentId: "all",
                                            status: "all",
                                            riskLevel: "all",
                                            minScore: "",
                                            maxScore: ""
                                        });
                                    }}
                                    className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors flex items-center gap-1"
                                >
                                    Reset All
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-wider text-[11px] border-b border-gray-100">
                                <tr>
                                    <th className="p-6">Candidate</th>
                                    <th className="p-6">Assessment</th>
                                    <th className="p-6">Status</th>
                                    <th className="p-6">Score</th>
                                    <th className="p-6 text-center">Integrity Status</th>
                                    <th className="p-6">Submitted At</th>
                                    <th className="p-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredSubmissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                                                    <Search size={32} />
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900">No results found</h3>
                                                <p className="text-gray-500 max-w-xs mx-auto">Try adjusting your search terms or filters to find what you're looking for.</p>
                                                <button
                                                    onClick={() => {
                                                        setSearchTerm("");
                                                        setFilters({
                                                            assessmentId: "all",
                                                            status: "all",
                                                            riskLevel: "all",
                                                            minScore: "",
                                                            maxScore: ""
                                                        });
                                                    }}
                                                    className="mt-2 text-indigo-600 font-bold hover:underline"
                                                >
                                                    Clear all filters
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSubmissions.map((sub) => {
                                        const risk = calculateMalpracticeRisk(sub);
                                        return (
                                            <tr key={sub.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="p-6">
                                                    <button
                                                        onClick={() => fetchDetailedReport(sub)}
                                                        className="flex items-center gap-3 text-left group/name"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                            <User size={18} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-gray-900 leading-tight group-hover/name:text-indigo-600 transition-colors">{sub.candidate_name}</p>
                                                            <p className="text-xs text-gray-500 font-medium">{sub.candidate_email}</p>
                                                        </div>
                                                    </button>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} className="text-gray-300" />
                                                        <p className="text-sm font-semibold text-gray-700">{assessmentsMap[sub.assessment_id]?.title || "Unknown"}</p>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${sub.status === 'submitted' || sub.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {sub.status}
                                                    </span>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-lg font-black text-gray-900 leading-tight">
                                                            {sub.score}
                                                            <span className="text-[10px] text-gray-400 ml-0.5">/ {assessmentsMap[sub.assessment_id]?.total_marks || '--'}</span>
                                                        </span>
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Overall Marks</span>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex justify-center">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${risk.color}`}>
                                                            {risk.level}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <Clock size={14} />
                                                        <p className="text-sm font-semibold">{new Date(sub.submitted_at || sub.started_at).toLocaleDateString()}</p>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-right">
                                                    <button
                                                        onClick={() => fetchDetailedReport(sub)}
                                                        className="inline-flex items-center gap-2 bg-white text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-100 shadow-sm hover:bg-indigo-600 hover:text-white transition-all group-hover:scale-105"
                                                    >
                                                        Report
                                                        <Eye size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
