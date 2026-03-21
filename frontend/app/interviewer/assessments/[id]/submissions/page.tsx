"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { ArrowLeft, Download, CheckCircle, Clock, Share2 } from "lucide-react";

interface Submission {
    id: string;
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string;
    score: number;
    status: string;
    started_at: string;
    submitted_at: string;
    answers: any[];
    violations?: any[];
    face_snapshots?: {
        initial_image: string;
        middle_image: string;
        end_image: string;
        initial_vs_middle_distance: number | null;
        initial_vs_end_distance: number | null;
    };
}

import { Modal } from "@/components/ui/Modal";
import { Eye, X, Phone } from "lucide-react";

export default function SubmissionsPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [activeTab, setActiveTab] = useState<'answers' | 'summary' | 'monitoring'>('monitoring');

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchData(params.id as string);
        }
    }, [isAuthenticated, isLoading, params.id, router, user]);

    const fetchData = async (id: string) => {
        try {
            const [subData, assessData] = await Promise.all([
                apiRequest(`/api/assessments/${id}/submissions`, "GET"),
                apiRequest(`/api/assessments/${id}`, "GET")
            ]);
            setSubmissions(subData || []);
            setAssessment(assessData);
        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            setLoading(false);
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

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-gray-700 font-bold hover:text-gray-900 mb-6 transition-colors"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Assessments
                </button>

                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Assessment Submissions</h1>
                        <p className="text-gray-700 font-medium">View candidate performance and results.</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-800 font-bold border-b border-gray-200">
                                <tr>
                                    <th className="p-4">Candidate</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Score</th>
                                    <th className="p-4">Submitted At</th>
                                    <th className="p-4 text-right">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {submissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            No submissions yet.
                                        </td>
                                    </tr>
                                ) : (
                                    submissions.map((sub) => (
                                        <tr key={sub.id} className="hover:bg-gray-50 transition">
                                            <td className="p-4">
                                                <button
                                                    onClick={() => setSelectedSubmission(sub)}
                                                    className="text-left group/name"
                                                >
                                                    <div className="font-bold text-gray-900 group-hover/name:text-indigo-600 transition-colors">{sub.candidate_name || "Unknown"}</div>
                                                    <div className="text-sm text-gray-600 font-medium">{sub.candidate_email}</div>
                                                </button>
                                                {sub.candidate_phone && (
                                                    <div className="text-xs text-gray-500 font-bold flex items-center gap-1 mt-1">
                                                        <Phone size={12} /> {sub.candidate_phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${sub.status === 'submitted' || sub.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {sub.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-900 font-black">{sub.score}</td>
                                            <td className="p-4 text-gray-800 font-medium">
                                                {new Date(sub.submitted_at).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-gray-800 text-right font-bold">
                                                {formatDuration(sub.started_at, sub.submitted_at)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedSubmission && assessment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{selectedSubmission.candidate_name}'s Submission</h3>
                                <div className="flex gap-4 text-sm text-gray-500 mt-1">
                                    <span>{selectedSubmission.candidate_email}</span>
                                    {selectedSubmission.candidate_phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={14} /> {selectedSubmission.candidate_phone}
                                        </span>
                                    )}
                                    <span>Score: {selectedSubmission.score}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedSubmission(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-200 px-6">
                            <button
                                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'monitoring' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setActiveTab('monitoring')}
                            >
                                Proctoring Log (Timeline)
                            </button>
                            <button
                                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'answers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setActiveTab('answers')}
                            >
                                Quiz Answers
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
                            {activeTab === 'answers' && (
                                assessment?.questions?.map((q: any, idx: number) => {
                                    const answer = selectedSubmission.answers?.find((a: any) => a.question_id === q.id);
                                    const isCorrect = answer?.is_correct;
                                    const isMCQ = q.type === "MCQ";

                                    return (
                                        <div key={idx} className={`p-4 rounded-lg border bg-white shadow-sm ${isMCQ
                                            ? (isCorrect ? "border-green-200" : "border-red-200")
                                            : "border-gray-200"
                                            }`}>
                                            <div className="flex justify-between mb-2">
                                                <span className="font-semibold text-gray-700">Question {idx + 1}</span>
                                                <span className="text-sm text-gray-500">{q.points} Points</span>
                                            </div>
                                            <p className="text-gray-900 font-medium mb-3">{q.text}</p>

                                            <div className="text-sm">
                                                <p className="font-semibold text-gray-600">Candidate Answer:</p>
                                                <p className={`font-mono mt-1 p-2 rounded ${isMCQ
                                                    ? (isCorrect ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50")
                                                    : "text-gray-800 bg-gray-50 border border-gray-100"
                                                    }`}>
                                                    {answer?.value || "No Answer"}
                                                </p>
                                            </div>

                                            {isMCQ && !isCorrect && (
                                                <div className="mt-2 text-sm">
                                                    <p className="font-semibold text-gray-600">Correct Answer:</p>
                                                    <p className="text-green-700 font-mono">{q.correct_answer}</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {activeTab === 'monitoring' && (
                                <div className="space-y-6">
                                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                                        <h4 className="text-lg font-bold text-gray-900 mb-6 border-b pb-2">Monitoring Timeline</h4>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs whitespace-nowrap">
                                                <thead className="text-gray-500 border-b border-gray-200 font-semibold bg-gray-50 uppercase tracking-wider">
                                                    <tr>
                                                        <th className="py-4 px-4 align-top w-12">Sr.<br />No.</th>
                                                        <th className="py-4 pr-4 align-top"><span className="flex items-center gap-1 text-indigo-500">📷 Snapshot</span></th>
                                                        <th className="py-4 pr-4 align-top"><span className="flex items-center gap-1 text-green-500">📅 Date &<br />Time</span></th>
                                                        <th className="py-4 pr-4 align-top">Description</th>
                                                        <th className="py-4 px-2 align-top text-center"><span className="flex items-center gap-1 text-purple-600 justify-center">👁️ Faces</span></th>
                                                        <th className="py-4 px-2 align-top text-center"><span className="flex items-center gap-1 text-orange-500 justify-center">📦 Objects</span></th>
                                                        <th className="py-4 px-2 align-top text-center"><span className="flex items-center gap-1 text-teal-600 justify-center">👥 Persons</span></th>
                                                        <th className="py-4 px-2 align-top text-center">Head Position</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {selectedSubmission.face_snapshots?.initial_image && (
                                                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                                                            <td className="py-4 px-4 text-gray-500 font-medium">1</td>
                                                            <td className="py-4 pr-4">
                                                                <div className="relative group overflow-hidden rounded shadow-sm bg-black w-16 h-12">
                                                                    <img src={selectedSubmission.face_snapshots.initial_image} alt="Start" className="w-full h-full object-cover" />
                                                                </div>
                                                            </td>
                                                            <td className="py-4 pr-4 text-gray-700 font-medium">
                                                                {new Date(selectedSubmission.started_at).toLocaleDateString()}<br />
                                                                {new Date(selectedSubmission.started_at).toLocaleTimeString()}
                                                            </td>
                                                            <td className="py-4 pr-4 text-gray-800">Exam Started (Initial Face Verify). Candidate present on screen.</td>
                                                            <td className="py-4 px-2 text-center text-purple-600 font-bold">1</td>
                                                            <td className="py-4 px-2 text-center text-orange-500 font-bold">0</td>
                                                            <td className="py-4 px-2 text-center text-teal-600 font-bold">1</td>
                                                            <td className="py-4 px-2 text-center text-gray-600">Straight ahead</td>
                                                        </tr>
                                                    )}

                                                    {(selectedSubmission.violations || []).map((v, i) => (
                                                        <tr key={i} className={`hover:bg-gray-50 border-b border-gray-100 ${v.type !== 'info' ? 'bg-red-50/50' : ''}`}>
                                                            <td className="py-4 px-4 text-gray-500 font-medium">{i + 2}</td>
                                                            <td className="py-4 pr-4">
                                                                <div className={`relative group overflow-hidden rounded shadow-sm bg-black w-20 h-14 border ${v.type !== 'info' ? 'border-red-500' : 'border-gray-200'}`}>
                                                                    {v.evidence ? (
                                                                        v.evidence.startsWith('data:') ? (
                                                                            <img src={v.evidence} alt="Violation" className="w-full h-full object-cover" />
                                                                        ) : v.evidence.startsWith('https://youtu.be/') ? (
                                                                            <a
                                                                                href={v.evidence}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="w-full h-full flex flex-col items-center justify-center bg-gray-900 border border-indigo-500/30 text-[10px] text-indigo-400 hover:text-white transition-colors"
                                                                            >
                                                                                <Share2 size={16} className="mb-1" />
                                                                                YouTube
                                                                            </a>
                                                                        ) : (
                                                                            <>
                                                                                <video
                                                                                    src={v.evidence.startsWith('/') ? `${process.env.DEV_DEV_NEXT_PUBLIC_API_URL || "http://localhost:8080"}${v.evidence}` : v.evidence}
                                                                                    className="w-full h-full object-cover"
                                                                                    muted
                                                                                    playsInline
                                                                                    onMouseOver={(e) => e.currentTarget.play()}
                                                                                    onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                                                                />
                                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none">
                                                                                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30">
                                                                                        <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[7px] border-l-white border-b-[4px] border-b-transparent ml-0.5"></div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="absolute top-0 right-0 p-0.5 bg-indigo-600 text-[8px] text-white font-bold rounded-bl">VIDEO</div>
                                                                            </>
                                                                        )
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-red-500 bg-red-50">⚠</div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 pr-4 text-gray-700 font-medium">
                                                                {new Date(v.timestamp || selectedSubmission.started_at).toLocaleDateString()}<br />
                                                                {new Date(v.timestamp || selectedSubmission.started_at).toLocaleTimeString()}
                                                            </td>
                                                            <td className={`py-4 pr-4 ${v.type !== 'info' ? 'text-red-700 font-medium' : 'text-gray-800'}`}>
                                                                {v.reason || "Candidate present on screen."} {v.type !== 'info' && v.type !== 'tab_switch' ? "(Violation)" : ""}
                                                            </td>
                                                            <td className="py-4 px-2 text-center text-purple-600 font-bold">{v.type === 'multiple_people' ? '2+' : '1'}</td>
                                                            <td className="py-4 px-2 text-center text-orange-500 font-bold">{v.type === 'object_detected' ? '1' : '0'}</td>
                                                            <td className="py-4 px-2 text-center text-teal-600 font-bold">{v.type === 'multiple_people' ? '2+' : '1'}</td>
                                                            <td className="py-4 px-2 text-center text-gray-600">Straight ahead</td>
                                                        </tr>
                                                    ))}

                                                    {selectedSubmission.face_snapshots?.end_image && (
                                                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                                                            <td className="py-4 px-4 text-gray-500 font-medium">{(selectedSubmission.violations || []).length + 2}</td>
                                                            <td className="py-4 pr-4">
                                                                <div className="relative group overflow-hidden rounded shadow-sm bg-black w-16 h-12">
                                                                    <img src={selectedSubmission.face_snapshots.end_image} alt="End" className="w-full h-full object-cover" />
                                                                </div>
                                                            </td>
                                                            <td className="py-4 pr-4 text-gray-700 font-medium">
                                                                {new Date(selectedSubmission.submitted_at).toLocaleDateString()}<br />
                                                                {new Date(selectedSubmission.submitted_at).toLocaleTimeString()}
                                                            </td>
                                                            <td className="py-4 pr-4 text-gray-800">Exam Submitted. Candidate present on screen.</td>
                                                            <td className="py-4 px-2 text-center text-purple-600 font-bold">1</td>
                                                            <td className="py-4 px-2 text-center text-orange-500 font-bold">0</td>
                                                            <td className="py-4 px-2 text-center text-teal-600 font-bold">1</td>
                                                            <td className="py-4 px-2 text-center text-gray-600">Straight ahead</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                                            <h4 className="text-sm font-bold text-gray-900 mb-4 tracking-wide uppercase">Session Details</h4>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Clock size={16} /></div>
                                                <div>
                                                    <p className="text-gray-500 text-xs">Total Duration</p>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        {formatDuration(selectedSubmission.started_at, selectedSubmission.submitted_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                                            <h4 className="text-sm font-bold text-gray-900 mb-4 tracking-wide uppercase">Face Auth Status</h4>
                                            <div className="flex gap-4">
                                                <div className="w-16 h-16 rounded overflow-hidden shadow-sm bg-black">
                                                    <img src={selectedSubmission.face_snapshots?.initial_image} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-500">Middle Match:</span>
                                                        <span className={`font-bold ${selectedSubmission.face_snapshots?.initial_vs_middle_distance !== null && selectedSubmission.face_snapshots?.initial_vs_middle_distance! < 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {selectedSubmission.face_snapshots?.initial_vs_middle_distance !== null ? selectedSubmission.face_snapshots?.initial_vs_middle_distance!.toFixed(2) : "N/A"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-500">End Match:</span>
                                                        <span className={`font-bold ${selectedSubmission.face_snapshots?.initial_vs_end_distance !== null && selectedSubmission.face_snapshots?.initial_vs_end_distance! < 0.6 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {selectedSubmission.face_snapshots?.initial_vs_end_distance !== null ? selectedSubmission.face_snapshots?.initial_vs_end_distance!.toFixed(2) : "N/A"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
