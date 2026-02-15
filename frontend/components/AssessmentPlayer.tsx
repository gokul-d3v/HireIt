"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation"; // Note: used for navigation after submit
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Clock, CheckCircle, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface Question {
    id: string;
    text: string;
    type: "MCQ" | "SUBJECTIVE" | "CODING";
    options: string[];
    points: number;
}

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: Question[];
}

interface AssessmentPlayerProps {
    assessmentId: string;
    onComplete?: () => void;
}

export default function AssessmentPlayer({ assessmentId, onComplete }: AssessmentPlayerProps) {
    const router = useRouter();
    const { showToast } = useToast();
    const [showSubmitModal, setShowSubmitModal] = useState(false);

    // State for assessment data and progress
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (assessmentId) {
            fetchAssessment(assessmentId);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [assessmentId]);

    const fetchAssessment = async (id: string) => {
        try {
            // We assume the token is already in localStorage (managed by parent or login)
            const [assessmentData, submissionsData] = await Promise.all([
                apiRequest(`/api/assessments/${id}`, "GET"),
                apiRequest("/api/submissions/me", "GET")
            ]);

            // Check if already submitted
            const existingSubmission = submissionsData?.find((s: any) => s.assessment_id === id);
            if (existingSubmission) {
                showToast("You have already submitted this assessment.", "info");
                if (onComplete) {
                    onComplete();
                } else {
                    // Fallback redirect if no callback provided
                    router.replace(`/candidate/assessments/${id}/result`);
                }
                return;
            }

            setAssessment(assessmentData);
            // Initialize timer (duration in minutes * 60)
            setTimeLeft(assessmentData.duration * 60);
        } catch (err) {
            console.error("Failed to fetch assessment", err);
            showToast("Failed to load assessment. Please try again.", "error");
            // router.push("/candidate/assessments"); // Don't redirect globally, let parent handle or show error
        } finally {
            setLoading(false);
        }
    };

    // Timer Logic
    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev !== null && prev <= 1) {
                    clearInterval(timerRef.current!);
                    submitAssessment(true); // Auto-submit
                    return 0;
                }
                return prev !== null ? prev - 1 : 0;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const handleAnswerChange = (value: string) => {
        const questionId = assessment?.questions[currentQuestionIndex]?.id || "";
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const confirmSubmit = () => {
        setShowSubmitModal(true);
    };

    const submitAssessment = async (autoSubmit = false) => {
        if (!assessment) return;

        setSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setShowSubmitModal(false);

        try {
            const formattedAnswers = assessment.questions.map(q => ({
                question_id: q.id,
                value: answers[q.id] || ""
            }));

            await apiRequest(`/api/assessments/${assessment.id}/submit`, "POST", {
                answers: formattedAnswers
            });

            if (autoSubmit) {
                showToast("Time's up! Your assessment has been automatically submitted.", "info");
            } else {
                showToast("Assessment submitted successfully!", "success");
            }

            if (onComplete) {
                onComplete();
            } else {
                router.push(`/candidate/assessments/${assessment.id}/result`);
            }
        } catch (err: any) {
            console.error("Submission error", err);
            showToast(err.message || "Failed to submit assessment. Please try again.", "error");
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    if (!assessment) return <div className="p-8 text-center">Assessment not found or failed to load.</div>;

    const currentQuestion = assessment.questions[currentQuestionIndex];

    if (!currentQuestion) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="text-yellow-500 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Question Not Found</h2>
                <p className="text-gray-500 mb-6">Unable to load question {currentQuestionIndex + 1}.</p>
            </div>
        );
    }

    const isLastQuestion = currentQuestionIndex === assessment.questions.length - 1;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">{assessment.title}</h1>
                    <div className="text-sm text-gray-500">Question {currentQuestionIndex + 1} of {assessment.questions.length}</div>
                </div>

                <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg ${timeLeft !== null && timeLeft < 300 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700"
                    }`}>
                    <Clock size={20} />
                    {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[400px] flex flex-col">
                    <div className="flex-1">
                        <div className="mb-6">
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded mb-2">
                                {currentQuestion.type} &bull; {currentQuestion.points} Points
                            </span>
                            <h2 className="text-2xl font-medium text-gray-900">{currentQuestion.text}</h2>
                        </div>

                        <div className="space-y-4">
                            {currentQuestion.type === "MCQ" && currentQuestion.options.map((opt, idx) => (
                                <label key={idx} className={`flex items-center p-4 border rounded-lg cursor-pointer transition ${answers[currentQuestion.id] === opt
                                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                                    : "border-gray-200 hover:bg-gray-50"
                                    }`}>
                                    <input
                                        type="radio"
                                        name={`question-${currentQuestion.id}`}
                                        value={opt}
                                        checked={answers[currentQuestion.id] === opt}
                                        onChange={() => handleAnswerChange(opt)}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="ml-3 text-gray-700">{opt}</span>
                                </label>
                            ))}

                            {(currentQuestion.type === "SUBJECTIVE" || currentQuestion.type === "CODING") && (
                                <textarea
                                    value={answers[currentQuestion.id] || ""}
                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                    className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm leading-relaxed text-gray-900"
                                    placeholder="Type your answer here..."
                                />
                            )}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center">
                        <button
                            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentQuestionIndex === 0}
                            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={20} /> Previous
                        </button>

                        {isLastQuestion ? (
                            <button
                                onClick={confirmSubmit}
                                disabled={submitting}
                                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-70"
                            >
                                {submitting ? "Submitting..." : (
                                    <>
                                        Submit Assessment <CheckCircle size={18} />
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => setCurrentQuestionIndex(prev => Math.min(assessment.questions.length - 1, prev + 1))}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm"
                            >
                                Next <ChevronRight size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                title="Submit Assessment"
                footer={
                    <>
                        <button
                            onClick={() => setShowSubmitModal(false)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => submitAssessment(false)}
                            className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium"
                        >
                            Confirm Submit
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    Are you sure you want to submit your assessment?
                    <br />
                    You cannot change your answers after submission.
                </p>
            </Modal>
        </div>
    );
}
