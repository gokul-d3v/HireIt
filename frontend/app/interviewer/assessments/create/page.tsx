"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { Plus, Trash2, Save, ArrowLeft, ArrowRight, CheckCircle, FileText, Code, AlignLeft, Clock, Award, Target } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";

type QuestionType = "MCQ" | "SUBJECTIVE" | "CODING";

interface Question {
    text: string;
    type: QuestionType;
    options: string[];
    correct_answer: string;
    points: number | string;
}

interface PhaseConfig {
    name: string;
    duration: number | string;
    total_marks: number | string;
    passing_score: number | string;
    questions: Question[];
}

export default function CreateAssessmentPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();

    // Wizard state
    const [step, setStep] = useState(1);
    const [assessmentTitle, setAssessmentTitle] = useState("");
    const [assessmentDescription, setAssessmentDescription] = useState("");
    const [phaseCount, setPhaseCount] = useState(1);
    const [phases, setPhases] = useState<PhaseConfig[]>([]);
    const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // Modal state
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    // Auth protection
    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">Loading...</div>;
    if (!isAuthenticated || user?.role !== "interviewer") {
        router.push("/login");
        return null;
    }

    // Initialize phases when phase count changes
    useEffect(() => {
        if (step === 2 && phases.length === 0) {
            const defaultPhases: PhaseConfig[] = [];
            const phaseNames = ["Foundation", "Pre-Intermediate", "Intermediate"];
            for (let i = 0; i < phaseCount; i++) {
                defaultPhases.push({
                    name: phaseNames[i] || `Phase ${i + 1}`,
                    duration: 0,
                    total_marks: 0,
                    passing_score: 0,
                    questions: [],
                });
            }
            setPhases(defaultPhases);
        }
    }, [step, phaseCount, phases.length]);

    const updatePhaseConfig = (index: number, field: keyof PhaseConfig, value: any) => {
        if (field === 'duration' || field === 'total_marks' || field === 'passing_score') {
            if (!/^\d*$/.test(value)) return;
        }
        const newPhases = [...phases];
        newPhases[index] = { ...newPhases[index], [field]: value };
        setPhases(newPhases);
    };

    const addQuestion = (type: QuestionType) => {
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions.push({
            text: "",
            type,
            options: type === "MCQ" ? ["", ""] : [],
            correct_answer: "",
            points: 10,
        });
        setPhases(newPhases);
    };

    const updateQuestion = (qIndex: number, field: keyof Question, value: any) => {
        if (field === 'points') {
            if (!/^\d*$/.test(value)) return;
        }
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions[qIndex] = {
            ...newPhases[currentPhaseIndex].questions[qIndex],
            [field]: value,
        };
        setPhases(newPhases);
    };

    const updateOption = (qIndex: number, oIndex: number, value: string) => {
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions[qIndex].options[oIndex] = value;
        setPhases(newPhases);
    };

    const addOption = (qIndex: number) => {
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions[qIndex].options.push("");
        setPhases(newPhases);
    };

    const removeOption = (qIndex: number, oIndex: number) => {
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions[qIndex].options.splice(oIndex, 1);
        setPhases(newPhases);
    };

    const removeQuestion = (qIndex: number) => {
        const newPhases = [...phases];
        newPhases[currentPhaseIndex].questions.splice(qIndex, 1);
        setPhases(newPhases);
    };

    const handleNext = () => {
        if (step === 1) {
            if (!assessmentTitle) {
                showToast("Please enter an assessment title", "error");
                return;
            }
            setStep(2);
        } else if (step === 2) {
            // Validate that configured total marks matches passing score logic if needed, 
            // but strictly we just need to ensure fields are filled if required. 
            // For now just proceed.
            setStep(3);
            setCurrentPhaseIndex(0);
        } else if (step === 3) {
            // Validate current phase marks
            const currentPhase = phases[currentPhaseIndex];
            const currentTotal = currentPhase.questions.reduce((sum, q) => sum + Number(q.points || 0), 0);

            if (currentTotal !== Number(currentPhase.total_marks || 0)) {
                showToast(`Phase ${currentPhaseIndex + 1} Question Points (${currentTotal}) must match Total Marks (${currentPhase.total_marks})`, "error");
                return;
            }

            if (currentPhaseIndex < phaseCount - 1) {
                setCurrentPhaseIndex(currentPhaseIndex + 1);
            } else {
                setStep(4); // Review step
            }
        }
    };

    const handlePrevious = () => {
        if (step === 3 && currentPhaseIndex > 0) {
            setCurrentPhaseIndex(currentPhaseIndex - 1);
        } else if (step > 1) {
            setStep(step - 1);
        }
    };

    const confirmSubmit = () => {
        setIsConfirmModalOpen(true);
    };

    const handleConfirmSubmit = async () => {
        setIsConfirmModalOpen(false);
        handleSubmit();
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            // Create assessments in reverse order (Phase 3 -> 2 -> 1) to get IDs for linking
            const createdIds: string[] = [];

            for (let i = phases.length - 1; i >= 0; i--) {
                const phase = phases[i];

                // Calculate total marks from question points
                // const calculatedTotalMarks = phase.questions.reduce((sum, q) => sum + Number(q.points), 0);

                const payload: any = {
                    title: `${assessmentTitle} - ${phase.name}`,
                    description: i === 0 ? assessmentDescription : `${assessmentDescription} (${phase.name})`,
                    duration: Number(phase.duration),
                    questions: phase.questions.map(q => ({ ...q, points: Number(q.points) })),
                    phase: i + 1,
                    passing_score: Number(phase.passing_score),
                    total_marks: Number(phase.total_marks), // Use configured value (validated in step 3)
                };

                // Link to next phase if exists
                if (createdIds.length > 0) {
                    payload.next_phase_id = createdIds[createdIds.length - 1];
                }

                const response = await apiRequest("/api/assessments", "POST", payload);
                createdIds.push(response.id);
            }

            showToast(`Successfully created ${phaseCount} phase(s)!`, "success");
            router.push("/interviewer/assessments");
        } catch (err: any) {
            showToast(err.message || "Failed to create assessments", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const getQuestionIcon = (type: QuestionType) => {
        switch (type) {
            case "MCQ": return <CheckCircle size={18} className="text-blue-500" />;
            case "SUBJECTIVE": return <AlignLeft size={18} className="text-orange-500" />;
            case "CODING": return <Code size={18} className="text-purple-500" />;
        }
    };

    const totalQuestions = phases.reduce((sum, phase) => sum + phase.questions.length, 0);

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Create Multi-Phase Assessment</h1>
                            <p className="text-xs text-gray-500">Step {step} of 4</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        {["Basic Info", "Configure Phases", "Add Questions", "Review"].map((label, idx) => (
                            <div key={idx} className="flex items-center flex-1">
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step > idx + 1 ? 'bg-green-500' : step === idx + 1 ? 'bg-indigo-600' : 'bg-gray-300'} text-white font-semibold text-sm`}>
                                    {step > idx + 1 ? '✓' : idx + 1}
                                </div>
                                <div className="ml-2 text-sm font-medium text-gray-700">{label}</div>
                                {idx < 3 && <div className={`flex-1 h-1 mx-4 ${step > idx + 1 ? 'bg-green-500' : 'bg-gray-300'}`} />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Step 1: Basic Info */}
                {step === 1 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Basic Information</h2>
                            <p className="text-gray-600">Start by entering the basic details of your assessment</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Assessment Title *</label>
                            <input
                                type="text"
                                value={assessmentTitle}
                                onChange={(e) => setAssessmentTitle(e.target.value)}
                                className="w-full text-xl font-bold text-gray-900 p-3 border-2 border-gray-200 rounded-lg focus:border-indigo-600 focus:ring-0 focus:outline-none"
                                placeholder="e.g., Complete Programming Assessment"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                            <textarea
                                value={assessmentDescription}
                                onChange={(e) => setAssessmentDescription(e.target.value)}
                                className="w-full p-3 text-gray-900 border-2 border-gray-200 rounded-lg focus:border-indigo-600 focus:outline-none resize-none"
                                rows={4}
                                placeholder="Add instructions or context for candidates..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Phases *</label>
                            <div className="grid grid-cols-3 gap-4">
                                {[1, 2, 3].map((count) => (
                                    <button
                                        key={count}
                                        onClick={() => setPhaseCount(count)}
                                        className={`p-4 border-2 rounded-lg font-semibold transition ${phaseCount === count
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {count} Phase{count > 1 ? 's' : ''}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                onClick={handleNext}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                            >
                                Next: Configure Phases <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Configure Phases */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Each Phase</h2>
                            <p className="text-gray-600 mb-6">Set the duration, marks, and passing criteria for each phase</p>

                            {phases.map((phase, idx) => (
                                <div key={idx} className="mb-6 pb-6 border-b border-gray-200 last:border-0">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <span className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">
                                            {idx + 1}
                                        </span>
                                        Phase {idx + 1}
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Phase Name</label>
                                            <input
                                                type="text"
                                                value={phase.name}
                                                onChange={(e) => updatePhaseConfig(idx, 'name', e.target.value)}
                                                className="w-full p-3 text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                <Clock size={14} className="inline mr-1" /> Duration (minutes)
                                            </label>
                                            <input
                                                type="text"
                                                value={phase.duration}
                                                onChange={(e) => updatePhaseConfig(idx, 'duration', e.target.value)}
                                                className="w-full p-3 text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                <Award size={14} className="inline mr-1" /> Total Marks
                                            </label>
                                            <input
                                                type="text"
                                                value={phase.total_marks}
                                                onChange={(e) => updatePhaseConfig(idx, 'total_marks', e.target.value)}
                                                className="w-full p-3 text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none"
                                                placeholder="e.g. 100"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                <Target size={14} className="inline mr-1" /> Passing Score
                                            </label>
                                            <input
                                                type="text"
                                                value={phase.passing_score}
                                                onChange={(e) => updatePhaseConfig(idx, 'passing_score', e.target.value)}
                                                className="w-full p-3 text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={handlePrevious}
                                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                            >
                                <ArrowLeft size={18} /> Previous
                            </button>
                            <button
                                onClick={handleNext}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                            >
                                Next: Add Questions <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Add Questions */}
                {step === 3 && (
                    <div className="space-y-6">
                        {/* Phase Tabs */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex gap-2 overflow-x-auto">
                                {phases.map((phase, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPhaseIndex(idx)}
                                        className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition ${currentPhaseIndex === idx
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        Phase {idx + 1}: {phase.name} ({phase.questions.length} Q)
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Current Phase Questions */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">
                                        Phase {currentPhaseIndex + 1}: {phases[currentPhaseIndex].name}
                                    </h2>
                                    <p className="text-sm text-gray-500">Add questions for this stage</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => addQuestion("MCQ")}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium"
                                    >
                                        <CheckCircle size={16} className="text-blue-500" /> MCQ
                                    </button>
                                    <button
                                        onClick={() => addQuestion("subjective" as any)} // Cast for compatibility if needed
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium"
                                    >
                                        <AlignLeft size={16} className="text-orange-500" /> Subjective
                                    </button>
                                    <button
                                        onClick={() => addQuestion("CODING")}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium"
                                    >
                                        <Code size={16} className="text-purple-500" /> Coding
                                    </button>
                                </div>
                            </div>

                            {/* Questions List */}
                            <div className="space-y-4">
                                {phases[currentPhaseIndex].questions.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                            <Plus size={32} />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No questions yet</h3>
                                        <p className="text-gray-500 max-w-sm mx-auto mb-6">Start building your assessment by adding questions from the buttons above.</p>
                                    </div>
                                ) : (
                                    phases[currentPhaseIndex].questions.map((question, qIdx) => (
                                        <div key={qIdx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group hover:border-indigo-300 transition-all">
                                            {/* Question Header */}
                                            <div className="bg-gray-50 p-4 border-b border-gray-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="cursor-move text-gray-400 hover:text-gray-600">
                                                        <Target size={18} />
                                                    </div>
                                                    <span className="font-semibold text-gray-700 flex items-center gap-2">
                                                        {getQuestionIcon(question.type)}
                                                        Question {qIdx + 1}
                                                    </span>
                                                    <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full font-medium">
                                                        {question.type}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-2 mr-4">
                                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</label>
                                                        <input
                                                            type="text"
                                                            value={question.points}
                                                            onChange={(e) => updateQuestion(qIdx, 'points', e.target.value)}
                                                            className="w-16 p-1 text-center text-sm font-bold text-gray-900 border border-gray-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => removeQuestion(qIdx)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Remove Question"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Question Body */}
                                            <div className="p-6 space-y-6">
                                                <div>
                                                    <textarea
                                                        value={question.text}
                                                        onChange={(e) => updateQuestion(qIdx, 'text', e.target.value)}
                                                        className="w-full text-lg font-medium text-gray-900 border-0 border-b-2 border-gray-100 focus:border-indigo-500 focus:ring-0 focus:outline-none placeholder-gray-300 resize-none transition-colors bg-transparent pb-2"
                                                        rows={1}
                                                        placeholder="Type your question here..."
                                                        style={{ minHeight: '3rem' }}
                                                    />
                                                </div>

                                                {/* MCQ Options */}
                                                {question.type === "MCQ" && (
                                                    <div className="ml-4 space-y-3 border-l-2 border-gray-100 pl-4">
                                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Answer Options <span className="font-normal text-gray-400 normal-case ml-2">(Select the radio button to mark correct answer)</span></label>
                                                        {question.options.map((option, oIdx) => (
                                                            <div key={oIdx} className="flex items-center gap-3 group/option">
                                                                <div className="flex items-center justify-center">
                                                                    <input
                                                                        type="radio"
                                                                        name={`correct-answer-${qIdx}`}
                                                                        checked={question.correct_answer === option && option !== ""}
                                                                        onChange={() => updateQuestion(qIdx, 'correct_answer', option)}
                                                                        className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                                    />
                                                                </div>
                                                                <div className="flex-1 flex items-center gap-3">
                                                                    <div className="w-6 h-6 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 text-xs font-semibold">
                                                                        {String.fromCharCode(65 + oIdx)}
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={option}
                                                                        onChange={(e) => {
                                                                            updateOption(qIdx, oIdx, e.target.value);
                                                                            // If this was the correct answer, update it too
                                                                            if (question.correct_answer === option) {
                                                                                updateQuestion(qIdx, 'correct_answer', e.target.value);
                                                                            }
                                                                        }}
                                                                        className={`flex-1 p-2 text-gray-900 border rounded-lg transition-all text-sm outline-none ${question.correct_answer === option && option !== ""
                                                                            ? "bg-green-50 border-green-200 ring-1 ring-green-200"
                                                                            : "bg-gray-50 border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                                                            }`}
                                                                        placeholder={`Option ${oIdx + 1}`}
                                                                    />
                                                                </div>
                                                                {question.options.length > 2 && (
                                                                    <button
                                                                        onClick={() => removeOption(qIdx, oIdx)}
                                                                        className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover/option:opacity-100 transition-all font-bold"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button
                                                            onClick={() => addOption(qIdx)}
                                                            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-2 px-2 py-1 rounded hover:bg-indigo-50 w-fit transition-colors"
                                                        >
                                                            <Plus size={14} /> Add Option
                                                        </button>
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* Add Question Buttons (Bottom) */}
                                {phases[currentPhaseIndex].questions.length > 0 && (
                                    <div className="pt-6 mt-6 border-t border-gray-100">
                                        <p className="text-sm font-semibold text-gray-500 mb-4 text-center uppercase tracking-wider">Add Another Question</p>
                                        <div className="flex justify-center gap-3">
                                            <button
                                                onClick={() => addQuestion("MCQ")}
                                                className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition shadow-sm font-semibold"
                                            >
                                                <CheckCircle size={18} /> Add MCQ
                                            </button>
                                            <button
                                                onClick={() => addQuestion("SUBJECTIVE")}
                                                className="flex items-center gap-2 px-6 py-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 hover:border-orange-300 transition shadow-sm font-semibold"
                                            >
                                                <AlignLeft size={18} /> Add Subjective
                                            </button>
                                            <button
                                                onClick={() => addQuestion("CODING")}
                                                className="flex items-center gap-2 px-6 py-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition shadow-sm font-semibold"
                                            >
                                                <Code size={18} /> Add Coding
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between pt-6">
                            <button
                                onClick={handlePrevious}
                                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                            >
                                <ArrowLeft size={18} /> Previous
                            </button>
                            <button
                                onClick={handleNext}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                            >
                                {currentPhaseIndex < phaseCount - 1 ? `Next: Phase ${currentPhaseIndex + 2}` : 'Review & Submit'} <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Review */}
                {step === 4 && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Your Assessment</h2>
                            <p className="text-gray-600 mb-6">Review all phases before submitting</p>

                            <div className="space-y-6">

                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h3 className="font-bold text-gray-900 mb-2">{assessmentTitle}</h3>
                                    <p className="text-sm text-gray-800">{assessmentDescription}</p>
                                    <div className="mt-4 flex gap-4 text-sm">
                                        <span className="text-gray-900"><strong>{phaseCount}</strong> Phases</span>
                                        <span className="text-gray-900"><strong>{totalQuestions}</strong> Total Questions</span>
                                    </div>
                                </div>

                                {phases.map((phase, idx) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-gray-900">
                                                Phase {idx + 1}: {phase.name}
                                            </h3>
                                            <span className="px-3 py-1 bg-indigo-100 text-indigo-900 rounded-full text-sm font-bold">
                                                {phase.questions.length} Questions
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-700 font-medium">Duration:</span>
                                                <span className="ml-2 font-bold text-gray-900">{phase.duration} min</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-700 font-medium">Total Marks:</span>
                                                <span className="ml-2 font-bold text-gray-900">{phase.total_marks}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-700 font-medium">Passing Score:</span>
                                                <span className="ml-2 font-bold text-gray-900">{phase.passing_score}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={handlePrevious}
                                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                            >
                                <ArrowLeft size={18} /> Previous
                            </button>
                            <button
                                onClick={confirmSubmit}
                                disabled={submitting}
                                className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
                            >
                                {submitting ? 'Creating...' : (
                                    <>
                                        <Save size={18} /> Create All Assessments
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </main>

            <Modal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                title="Confirm Creation"
                footer={
                    <>
                        <button
                            onClick={() => setIsConfirmModalOpen(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmSubmit}
                            className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium"
                        >
                            Create Assessments
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    Are you sure you want to create this multi-phase assessment?
                    This will create <strong>{phaseCount}</strong> linked assessments.
                </p>
            </Modal>
        </div>
    );
}
