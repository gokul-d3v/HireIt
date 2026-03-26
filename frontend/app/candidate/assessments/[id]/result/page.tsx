"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { CheckCircle, XCircle, Home, FileText, ArrowRight, Trophy, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

interface Answer {
    question_id: string;
    value: string;
    is_correct: boolean;
    points: number;
}

interface Question {
    id: string;
    text: string;
    type: string;
    options?: string[];
    correct_answer?: string;
    points: number;
}

interface Submission {
    id: string;
    score: number;
    status: string;
    answers: Answer[];
    submitted_at: string;
    total_marks?: number;
    passed?: boolean;
    next_phase_unlocked?: boolean;
    next_phase_id?: string;
    generated_questions?: Question[];
    shuffled_options?: Record<string, string[]>;
}

const QUIZ_PAGE_SIZE = 10;

export default function AssessmentResultPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const [result, setResult] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [quizPage, setQuizPage] = useState(0);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "candidate")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchResult(params.id as string);
        }
    }, [isAuthenticated, isLoading, params.id, router, user]);

    const fetchResult = async (id: string) => {
        try {
            const data = await apiRequest(`/api/assessments/${id}/result`, "GET");
            setResult(data);
        } catch (err) {
            console.error("Failed to fetch result", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    if (!result) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">No Result Found</h1>
                <p className="text-gray-500 mb-6">You haven&apos;t submitted this assessment yet.</p>
                <button
                    onClick={() => router.push("/candidate/assessments")}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    Go to Assessments
                </button>
            </div>
        </div>
    );

    const percentage = result.total_marks ? Math.round((result.score / result.total_marks) * 100) : 0;
    const isPassed = result.passed !== undefined ? result.passed : false;

    const questions = result.generated_questions || [];
    const totalPages = Math.ceil(questions.length / QUIZ_PAGE_SIZE);
    const pageQs = questions.slice(quizPage * QUIZ_PAGE_SIZE, (quizPage + 1) * QUIZ_PAGE_SIZE);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Score Card */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
                    <div className={`w-16 h-16 ${isPassed ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                        {isPassed ? (
                            <Trophy className="text-green-600" size={32} />
                        ) : (
                            <XCircle className="text-red-600" size={32} />
                        )}
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Assessment Completed!</h1>
                    <p className={`text-lg font-bold mb-6 ${isPassed ? 'text-green-600' : 'text-red-600'}`}>
                        {isPassed ? '🎉 Congratulations! You Passed!' : '❌ Not Passed - Keep Trying!'}
                    </p>


                    <div className={`${isPassed ? 'bg-green-50' : 'bg-red-50'} rounded-xl p-6 mb-8`}>
                        <div className={`text-sm ${isPassed ? 'text-green-600' : 'text-red-600'} font-medium uppercase tracking-wide mb-1`}>Your Score</div>
                        <div className={`text-4xl font-extrabold ${isPassed ? 'text-green-900' : 'text-red-900'}`}>
                            {result.score} / {result.total_marks || result.score}
                        </div>
                        <div className={`text-xs ${isPassed ? 'text-green-400' : 'text-red-400'} mt-2`}>
                            {percentage}% - {isPassed ? 'Passed' : 'Failed'}
                        </div>
                    </div>

                    {/* Quick stats */}
                    {result.answers && result.answers.length > 0 && (() => {
                        const correct = result.answers.filter(a => a.is_correct).length;
                        const wrong = result.answers.length - correct;
                        const skipped = Math.max(0, questions.length - result.answers.length);
                        return (
                            <div className="grid grid-cols-3 gap-3 mb-8">
                                <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                                    <p className="text-2xl font-black text-green-600">{correct}</p>
                                    <p className="text-xs font-bold text-green-400 uppercase tracking-widest mt-0.5">Correct</p>
                                </div>
                                <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                                    <p className="text-2xl font-black text-red-500">{wrong}</p>
                                    <p className="text-xs font-bold text-red-400 uppercase tracking-widest mt-0.5">Wrong</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-2xl font-black text-gray-400">{skipped}</p>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Skipped</p>
                                </div>
                            </div>
                        );
                    })()}
                    {isPassed && result.next_phase_unlocked && result.next_phase_id && (
                        <div className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl">
                            <div className="flex items-center justify-center gap-2 text-indigo-700 font-semibold mb-2">
                                <Trophy size={20} />
                                <span className="uppercase tracking-wider text-xs font-black">Qualified</span>
                            </div>
                            <p className="text-sm text-indigo-600 mb-4 font-medium text-center">You have successfully qualified. Click below to continue.</p>
                            <button
                                onClick={() => router.push(`/candidate/assessments/${result.next_phase_id}/take`)}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold hover:from-indigo-700 hover:to-purple-700 transition shadow-lg"
                            >
                                Continue <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        <button
                            onClick={() => router.push("/candidate/dashboard")}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                        >
                            <Home size={18} /> Back to Dashboard
                        </button>
                        <button
                            onClick={() => router.push("/candidate/assessments")}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                        >
                            <FileText size={18} /> View All Assessments
                        </button>
                    </div>
                </div>

                {/* Per-Question Breakdown */}
                {questions.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Answer Review</h2>
                                <p className="text-sm text-gray-500">See your answers and the correct ones below.</p>
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{questions.length} Questions</span>
                        </div>

                        <div className="p-6 space-y-4 bg-gray-50">
                            {pageQs.map((q, pageIdx) => {
                                const idx = quizPage * QUIZ_PAGE_SIZE + pageIdx;
                                const qid = typeof q.id === 'string' ? q.id : (q as any).id;
                                const answer = (result.answers || []).find(a => {
                                    const aid = typeof a.question_id === 'string' ? a.question_id : (a.question_id as any)?.toString();
                                    return aid === qid;
                                });
                                const isCorrect = answer?.is_correct;
                                const isAnswered = !!answer?.value;
                                const isMCQ = q.type === "MCQ" || q.type === "multiple_choice";
                                const opts = result.shuffled_options?.[qid] || q.options || [];

                                return (
                                    <div key={idx} className={`bg-white rounded-xl border p-5 shadow-sm ${!isAnswered ? 'border-gray-200' : isCorrect ? 'border-green-200' : 'border-red-200'}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded mb-2 inline-block">
                                                    Q{idx + 1} &bull; {q.type}
                                                </span>
                                                <p className="text-sm font-semibold text-gray-900 leading-snug">{q.text}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                                                <span className="text-xs font-bold text-gray-400">{q.points} pts</span>
                                                {!isAnswered ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-500 uppercase">Skipped</span>
                                                ) : isCorrect ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-700 uppercase flex items-center gap-1"><CheckCircle size={10} /> Correct</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 uppercase flex items-center gap-1"><XCircle size={10} /> Wrong</span>
                                                )}
                                            </div>
                                        </div>

                                        {isMCQ && opts.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                                                {opts.map((opt: string, oi: number) => {
                                                    const isSelected = answer?.value === opt;
                                                    const isRightAnswer = q.correct_answer === opt;
                                                    let cls = 'border border-gray-100 bg-gray-50 text-gray-600';
                                                    if (isSelected && isCorrect) cls = 'border-green-300 bg-green-50 text-green-800 font-bold';
                                                    else if (isSelected && !isCorrect) cls = 'border-red-300 bg-red-50 text-red-800 font-bold';
                                                    else if (!isSelected && isRightAnswer) cls = 'border-green-200 bg-green-50 text-green-700 font-semibold';
                                                    return (
                                                        <div key={oi} className={`p-3 rounded-lg text-sm flex items-center gap-2 ${cls}`}>
                                                            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-black shrink-0" style={{ borderColor: 'currentColor' }}>
                                                                {String.fromCharCode(65 + oi)}
                                                            </span>
                                                            <span>{opt}</span>
                                                            {isSelected && <span className="ml-auto text-xs">{isCorrect ? '✓' : '✗'}</span>}
                                                            {!isSelected && isRightAnswer && <span className="ml-auto text-xs text-green-600 font-bold">✓ Correct</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {!isMCQ && (
                                            <div className="mt-3 space-y-2">
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Your Answer</p>
                                                    <div className={`p-3 rounded-lg font-mono text-sm ${isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                                        {answer?.value || <span className="italic opacity-50">No answer</span>}
                                                    </div>
                                                </div>
                                                {q.correct_answer && !isCorrect && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Correct Answer</p>
                                                        <div className="p-3 rounded-lg font-mono text-sm bg-green-50 text-green-700 border border-green-200">
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
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                                <p className="text-xs font-bold text-gray-500">
                                    Q{quizPage * QUIZ_PAGE_SIZE + 1}–{Math.min((quizPage + 1) * QUIZ_PAGE_SIZE, questions.length)} of {questions.length}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setQuizPage(p => Math.max(0, p - 1))}
                                        disabled={quizPage === 0}
                                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setQuizPage(i)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold border ${i === quizPage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setQuizPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={quizPage === totalPages - 1}
                                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}