"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";

type QuestionType = "MCQ" | "SUBJECTIVE" | "CODING";

interface Question {
    text: string;
    type: QuestionType;
    options: string[];
    correct_answer: string;
    points: number;
}

export default function EditAssessmentPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [duration, setDuration] = useState(60);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchAssessment(params.id as string);
        }
    }, [isAuthenticated, isLoading, params.id, router, user]);

    const fetchAssessment = async (id: string) => {
        try {
            const data = await apiRequest(`/api/assessments/${id}`, "GET");
            setTitle(data.title);
            setDescription(data.description);
            setDuration(data.duration);
            setQuestions(data.questions || []);
        } catch (err) {
            console.error("Failed to fetch assessment", err);
            showToast("Failed to load assessment details", "error");
            router.push("/interviewer/assessments");
        } finally {
            setLoading(false);
        }
    };

    const addQuestion = (type: QuestionType) => {
        setQuestions([
            ...questions,
            {
                text: "",
                type,
                options: type === "MCQ" ? ["", ""] : [],
                correct_answer: "",
                points: 10,
            },
        ]);
    };

    const updateQuestion = (index: number, field: keyof Question, value: any) => {
        const newQuestions = [...questions];
        newQuestions[index] = { ...newQuestions[index], [field]: value };
        setQuestions(newQuestions);
    };

    const updateOption = (qIndex: number, oIndex: number, value: string) => {
        const newQuestions = [...questions];
        newQuestions[qIndex].options[oIndex] = value;
        setQuestions(newQuestions);
    };

    const addOption = (qIndex: number) => {
        const newQuestions = [...questions];
        newQuestions[qIndex].options.push("");
        setQuestions(newQuestions);
    };

    const removeQuestion = (index: number) => {
        const newQuestions = [...questions];
        newQuestions.splice(index, 1);
        setQuestions(newQuestions);
    };

    const handleSubmit = async () => {
        if (!title) {
            showToast("Please enter a title", "error");
            return;
        }
        setSubmitting(true);
        try {
            await apiRequest(`/api/assessments/${params.id}`, "PUT", {
                title,
                description,
                duration: Number(duration),
                questions,
            });
            showToast("Assessment updated successfully!", "success");
            router.push("/interviewer/assessments");
        } catch (err: any) {
            showToast(err.message || "Failed to update assessment", "error");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-gray-500 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Assessments
                </button>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="p-6 border-b border-gray-200 bg-gray-50">
                        <h1 className="text-2xl font-bold text-gray-900">Edit Assessment</h1>
                        <p className="text-gray-500">Update validation rules and questions.</p>
                    </div>

                    <div className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                rows={3}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-6 mb-8">
                    {questions.map((q, qIndex) => (
                        <div key={qIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative">
                            <button
                                onClick={() => removeQuestion(qIndex)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                            >
                                <Trash2 size={20} />
                            </button>

                            <div className="mb-4">
                                <span className="inline-block px-2 py-1 text-xs font-semibold bg-gray-100 rounded text-gray-600 mb-2">
                                    {q.type}
                                </span>
                                <input
                                    type="text"
                                    value={q.text}
                                    onChange={(e) => updateQuestion(qIndex, "text", e.target.value)}
                                    className="w-full p-2 text-lg font-medium border-b border-gray-200 focus:border-indigo-500 focus:outline-none"
                                    placeholder="Question text goes here..."
                                />
                            </div>

                            {q.type === "MCQ" && (
                                <div className="space-y-3 ml-4">
                                    {q.options.map((opt, oIndex) => (
                                        <div key={oIndex} className="flex items-center gap-3">
                                            <div
                                                className={`w-4 h-4 rounded-full border cursor-pointer border-gray-300 ${q.correct_answer === opt && opt !== "" ? "bg-green-500 border-green-500" : ""}`}
                                                onClick={() => updateQuestion(qIndex, "correct_answer", opt)}
                                            />
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                                className="flex-1 p-2 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500"
                                                placeholder={`Option ${oIndex + 1}`}
                                            />
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => addOption(qIndex)}
                                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium pl-2"
                                    >
                                        + Add Option
                                    </button>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end items-center gap-2">
                                <span className="text-sm text-gray-500">Points:</span>
                                <input
                                    type="number"
                                    value={q.points}
                                    onChange={(e) => updateQuestion(qIndex, "points", Number(e.target.value))}
                                    className="w-20 p-1 border border-gray-200 rounded text-center"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-between items-center mb-12">
                    <div className="flex gap-4">
                        <button
                            onClick={() => addQuestion("MCQ")}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm"
                        >
                            <Plus size={18} /> Add MCQ
                        </button>
                        <button
                            onClick={() => addQuestion("SUBJECTIVE")}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm"
                        >
                            <Plus size={18} /> Add Subjective
                        </button>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-70"
                    >
                        {submitting ? "Saving..." : (
                            <>
                                <Save size={18} /> Update Assessment
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
