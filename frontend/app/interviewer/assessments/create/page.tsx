"use client";

import { useState, useEffect } from "react";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { Plus, Trash2, Save, ArrowLeft, ArrowRight, Clock, Award, Target, FileText, CheckCircle, AlertTriangle, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { copyToClipboard } from "@/lib/clipboard";

interface DifficultyRule {
    difficulty: string;
    count: number | string;
    points_per_question: number | string;
}

interface SubGroup {
    sub_category: string;
    difficulties: DifficultyRule[];
    audio_url?: string;
    audio_uploading?: boolean;
    show_audio_upload?: boolean; // New UI state
}

interface RuleGroup {
    category: string;
    display_order: number;
    sub_groups: SubGroup[];
}

function sanitizeDisplayOrder(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallback;
    }

    return Math.floor(parsed);
}

function normalizeRuleGroups(groups: RuleGroup[]) {
    return groups
        .map((group, index) => ({
            group: {
                ...group,
                display_order: sanitizeDisplayOrder(group.display_order, index + 1),
            },
            index,
        }))
        .sort((left, right) => {
            if (left.group.display_order === right.group.display_order) {
                return left.index - right.index;
            }

            return left.group.display_order - right.group.display_order;
        })
        .map(({ group }, index) => ({
            ...group,
            display_order: index + 1,
        }));
}

interface QuestionBankConfig {
    categories: {
        name: string;
        has_sub_categories: boolean;
        sub_categories: { name: string; difficulties: { difficulty: string; audio_url?: string }[] }[];
        difficulties: { difficulty: string; audio_url?: string }[];
    }[];
}

interface BankConfig {
    categories: string[];
    sub_categories: Record<string, string[]>;
    difficulties: string[];
    structure?: QuestionBankConfig;
}

export default function CreateAssessmentPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();
    const [bankConfig, setBankConfig] = useState<BankConfig>({ categories: [], sub_categories: {}, difficulties: [] });

    useEffect(() => {
        // Fetch dynamic bank config
        apiRequest("/api/admin/questions/config", "GET")
            .then(d => setBankConfig(d))
            .catch(() => { /* non-fatal */ });

        // Load draft from localStorage if available
        const draft = localStorage.getItem("assessmentDraft");
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                if (parsed.step) setStep(parsed.step);
                if (parsed.title) setTitle(parsed.title);
                if (parsed.description !== undefined) setDescription(parsed.description);
                if (parsed.duration) setDuration(parsed.duration);
                if (parsed.totalMarks) setTotalMarks(parsed.totalMarks);
                if (parsed.passingScore) setPassingScore(parsed.passingScore);
                if (parsed.isMock !== undefined) setIsMock(parsed.isMock);
                if (parsed.passwordExpiry) setPasswordExpiry(parsed.passwordExpiry);
                if (parsed.ruleGroups) setRuleGroups(normalizeRuleGroups(parsed.ruleGroups));
            } catch (e) {
                console.error("Failed to parse assessment draft", e);
            }
        }
    }, []);

    // Wizard state
    const [step, setStep] = useState(1);

    // Assessment configuration state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [duration, setDuration] = useState<number | string>("");
    const [totalMarks, setTotalMarks] = useState<number | string>("");
    const [passingScore, setPassingScore] = useState<number | string>("");
    const [isMock, setIsMock] = useState(false);
    const [passwordExpiry, setPasswordExpiry] = useState("");
    const [ruleGroups, setRuleGroups] = useState<RuleGroup[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [livePIN, setLivePIN] = useState<{ pin: string; rotates_at: string } | null>(null);
    const [pinLoading, setPinLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Preview questions state
    // Bank count warnings per slot (key: "category|||sub|||difficulty")
    const [bankCounts, setBankCounts] = useState<Record<string, number>>({});

    // Save draft to localStorage whenever fields change
    useEffect(() => {
        const draft = {
            step,
            title,
            description,
            duration,
            totalMarks,
            passingScore,
            isMock,
            ruleGroups
        };
        localStorage.setItem("assessmentDraft", JSON.stringify(draft));
    }, [step, title, description, duration, totalMarks, passingScore, isMock, ruleGroups]);

    // Auth protection
    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">Loading...</div>;
    if (!isAuthenticated || user?.role !== "interviewer") {
        router.push("/login");
        return null;
    }

    // Derive categories only from the actual question bank data
    const categoryOptions = Array.from(new Set([
        ...(bankConfig.structure?.categories?.map(c => c.name) || []),
        ...(bankConfig.categories || [])
    ]));

    const addGroup = () => {
        if (categoryOptions.length === 0) {
            showToast("No question categories available in the bank. Please upload questions first.", "error");
            return;
        }

        const catName = categoryOptions[0];
        const catCfg = bankConfig.structure?.categories.find(c => c.name === catName);

        const defaultSub = catCfg?.has_sub_categories ? (catCfg.sub_categories[0]?.name || "") : "";
        const firstSubDiff = catCfg?.sub_categories[0]?.difficulties[0];
        const firstCatDiff = catCfg?.difficulties[0];

        const defaultDiff = catCfg?.has_sub_categories
            ? (typeof firstSubDiff === "string" ? firstSubDiff : firstSubDiff?.difficulty || "Easy")
            : (typeof firstCatDiff === "string" ? firstCatDiff : firstCatDiff?.difficulty || "Easy");

        setRuleGroups(normalizeRuleGroups([
            ...ruleGroups,
            {
                category: catName,
                display_order: ruleGroups.length + 1,
                sub_groups: [
                    {
                        sub_category: defaultSub,
                        difficulties: [{ difficulty: defaultDiff, count: 1, points_per_question: 10 }]
                    }
                ]
            }
        ]));
    };

    const updateGroup = (gIndex: number, field: keyof RuleGroup, value: string) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex] = { ...newGroups[gIndex], [field]: value };

        // If category changed, check if it has sub-categories
        if (field === 'category') {
            const catCfg = bankConfig.structure?.categories.find(c => c.name === value);
            if (catCfg && !catCfg.has_sub_categories) {
                // Force sub_category to empty string for all sub_groups if non-sub-category selected
                newGroups[gIndex].sub_groups = newGroups[gIndex].sub_groups.map(sg => ({
                    ...sg,
                    sub_category: ""
                }));
            }
        }
        setRuleGroups(newGroups);
    };

    const updateGroupDisplayOrder = (gIndex: number, value: string) => {
        if (!/^\d*$/.test(value)) return;

        const newGroups = [...ruleGroups];
        newGroups[gIndex] = {
            ...newGroups[gIndex],
            display_order: sanitizeDisplayOrder(value, newGroups[gIndex].display_order),
        };
        setRuleGroups(normalizeRuleGroups(newGroups));
    };

    const removeGroup = (gIndex: number) => {
        const newGroups = [...ruleGroups];
        newGroups.splice(gIndex, 1);
        setRuleGroups(normalizeRuleGroups(newGroups));
    };

    const addSubGroup = (gIndex: number) => {
        const catName = ruleGroups[gIndex].category;
        const catCfg = bankConfig.structure?.categories.find(c => c.name === catName);
        const defaultSub = catCfg?.sub_categories[0]?.name || "";
        const firstSubDiff = catCfg?.sub_categories[0]?.difficulties[0];
        const firstCatDiff = catCfg?.difficulties[0];

        const defaultDiff = catCfg?.has_sub_categories
            ? (typeof firstSubDiff === "string" ? firstSubDiff : firstSubDiff?.difficulty || "Easy")
            : (typeof firstCatDiff === "string" ? firstCatDiff : firstCatDiff?.difficulty || "Easy");

        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups.push({
            sub_category: defaultSub,
            difficulties: [{ difficulty: defaultDiff, count: 1, points_per_question: 10 }]
        });
        setRuleGroups(newGroups);
    };

    const updateSubGroup = (gIndex: number, sIndex: number, value: string) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups[sIndex].sub_category = value;
        setRuleGroups(newGroups);
    };

    const removeSubGroup = (gIndex: number, sIndex: number) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups.splice(sIndex, 1);
        if (newGroups[gIndex].sub_groups.length === 0) {
            newGroups.splice(gIndex, 1);
        }
        setRuleGroups(newGroups);
    };

    const addDifficulty = (gIndex: number, sIndex: number) => {
        const catName = ruleGroups[gIndex].category;
        const subName = ruleGroups[gIndex].sub_groups[sIndex].sub_category;
        const catCfg = bankConfig.structure?.categories.find(c => c.name === catName);
        let defaultDiff = "Medium";

        if (catCfg) {
            if (catCfg.has_sub_categories) {
                const subCfg = catCfg.sub_categories.find(s => s.name === subName);
                const firstDiff = subCfg?.difficulties[0];
                defaultDiff = typeof firstDiff === "string" ? firstDiff : firstDiff?.difficulty || "Medium";
            } else {
                const firstDiff = catCfg.difficulties[0];
                defaultDiff = typeof firstDiff === "string" ? firstDiff : firstDiff?.difficulty || "Medium";
            }
        }

        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups[sIndex].difficulties.push({ difficulty: defaultDiff, count: 1, points_per_question: 10 });
        setRuleGroups(newGroups);
    };

    const updateDifficulty = (gIndex: number, sIndex: number, dIndex: number, field: keyof DifficultyRule, value: string) => {
        const newGroups = [...ruleGroups];
        let finalValue: string | number = value;
        if (field === 'count' || field === 'points_per_question') {
            if (!/^\d*$/.test(value)) return;
            finalValue = parseInt(value) || 0;
        }

        newGroups[gIndex].sub_groups[sIndex].difficulties[dIndex] = {
            ...newGroups[gIndex].sub_groups[sIndex].difficulties[dIndex],
            [field]: finalValue
        };
        setRuleGroups(newGroups);
    };

    const removeDifficulty = (gIndex: number, sIndex: number, dIndex: number) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups[sIndex].difficulties.splice(dIndex, 1);
        if (newGroups[gIndex].sub_groups[sIndex].difficulties.length === 0) {
            newGroups[gIndex].sub_groups.splice(sIndex, 1);
        }
        if (newGroups[gIndex].sub_groups.length === 0) {
            newGroups.splice(gIndex, 1);
        }
        setRuleGroups(newGroups);
    };

    const flattenedRules = ruleGroups.flatMap(g =>
        g.sub_groups.flatMap(sg =>
            sg.difficulties.map(d => ({
                category: g.category,
                sub_category: sg.sub_category,
                difficulty: d.difficulty,
                count: Number(d.count),
                points_per_question: Number(d.points_per_question),
                display_order: g.display_order,
                audio_url: sg.audio_url
            }))
        )
    );

    const totalQuestions = flattenedRules.reduce((sum: number, r) => sum + r.count, 0);
    const currentPointsTotal = flattenedRules.reduce((sum: number, r) => sum + (r.count * r.points_per_question), 0);


    const handleNext = async () => {
        if (step === 1) {
            if (!title) {
                showToast("Please enter an assessment title", "error");
                return;
            }
            if (!duration || !totalMarks || !passingScore) {
                showToast("Please fill out duration, total marks, and passing score", "error");
                return;
            }
            if (Number(passingScore) > Number(totalMarks)) {
                showToast("Passing score cannot exceed Total Marks", "error");
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (ruleGroups.length === 0) {
                showToast("Please add at least one rule group", "error");
                return;
            }
            if (currentPointsTotal !== Number(totalMarks || 0)) {
                showToast(`Configured points (${currentPointsTotal}) must exactly match Total Marks (${totalMarks})`, "error");
                return;
            }
            // Fetch bank counts for warnings before moving to review
            try {
                const counts: Record<string, number> = {};
                await Promise.all(flattenedRules.map(async rule => {
                    const params = new URLSearchParams({ category: rule.category, difficulty: rule.difficulty });
                    if (rule.sub_category) params.set("sub_category", rule.sub_category);
                    
                    const data = await apiRequest(`/api/admin/questions/count?${params.toString()}`, "GET");
                    const key = `${rule.category}|||${rule.sub_category || ""}|||${rule.difficulty}`;
                    counts[key] = data.count || 0;
                }));
                setBankCounts(counts);
            } catch { /* non-fatal */ }
            setStep(3);
            fetchPreview();
        }
    };

    const fetchPreview = async () => {
        try {
            await apiRequest("/api/assessments/preview", "POST", {
                question_rules: flattenedRules
            });
        } catch {
            showToast("Failed to fetch question preview", "error");
        }
    };

    const handlePrevious = () => {
        if (step > 1) {
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
            const payload: Record<string, unknown> = {
                title: title,
                description: description,
                duration: Number(duration),
                passing_score: Number(passingScore),
                total_marks: Number(totalMarks),
                is_mock: isMock,
                question_rules: flattenedRules
            };

            const data = await apiRequest("/api/assessments", "POST", payload);
            localStorage.removeItem("assessmentDraft");
            showToast(`Successfully created assessment!`, "success");
            setCreatedId(data.id);
            setStep(4);
            // Fetch initial PIN for non-mock exams
            if (!isMock) fetchPIN(data.id);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create assessment";
            showToast(message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    const fetchPIN = async (id: string) => {
        setPinLoading(true);
        try {
            const data = await apiRequest(`/api/assessments/${id}/pin`, "GET");
            setLivePIN({ pin: data.pin, rotates_at: data.rotates_at });
        } catch {
            showToast("Failed to fetch PIN", "error");
        } finally {
            setPinLoading(false);
        }
    };

    const handleRegenerateSecret = async () => {
        if (!createdId) return;
        setPinLoading(true);
        try {
            const data = await apiRequest(`/api/assessments/${createdId}/regenerate-password`, "POST", {});
            setLivePIN({ pin: data.pin, rotates_at: data.rotates_at });
            showToast("New PIN secret generated!", "success");
        } catch {
            showToast("Failed to regenerate PIN", "error");
        } finally {
            setPinLoading(false);
        }
    };

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
                            <h1 className="text-xl font-bold text-gray-900">Create Assessment</h1>
                            <p className="text-xs text-gray-600 font-medium">
                                {step === 4 ? "Success" : `Step ${step} of 3`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {step < 4 && (
                <div className="bg-white border-b border-gray-200">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center justify-between">
                            {["Configuration", "Questions Format", "Review"].map((label, idx) => (
                                <div key={idx} className="flex items-center flex-1">
                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step > idx + 1 ? 'bg-green-500' : step === idx + 1 ? 'bg-indigo-600' : 'bg-gray-300'} text-white font-semibold text-sm`}>
                                        {step > idx + 1 ? '✓' : idx + 1}
                                    </div>
                                    <div className="ml-2 text-sm font-medium text-gray-700">{label}</div>
                                    {idx < 2 && <div className={`flex-1 h-1 mx-4 ${step > idx + 1 ? 'bg-green-500' : 'bg-gray-300'}`} />}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <main className={`max-w-6xl mx-auto px-4 py-8 ${step > 1 && step < 4 ? 'flex flex-col lg:flex-row gap-8' : ''}`}>
                <div className={step > 1 && step < 4 ? 'flex-1' : 'max-w-4xl mx-auto w-full'}>
                    {/* Step 1: Basic Info & Configuration */}
                    {step === 1 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Information</h2>
                                <p className="text-gray-600">Enter the basic details and configuration for this assessment.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Assessment Title *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full text-xl font-bold text-gray-900 p-3 border-2 border-gray-200 rounded-lg focus:border-indigo-600 focus:ring-0 focus:outline-none placeholder:text-gray-500"
                                    placeholder="e.g., Senior Frontend Developer Test"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full p-3 text-gray-900 border-2 border-gray-200 rounded-lg focus:border-indigo-600 focus:outline-none resize-none placeholder:text-gray-500 font-medium"
                                    rows={4}
                                    placeholder="Add instructions, context, or notes for candidates..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        <Clock size={16} className="inline mr-1 text-gray-400" /> Duration (min) *
                                    </label>
                                    <input
                                        type="number"
                                        value={duration}
                                        onChange={(e) => setDuration(e.target.value)}
                                        className="w-full p-3 font-medium text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none"
                                        placeholder="e.g. 60"
                                        min={1}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        <Award size={16} className="inline mr-1 text-gray-400" /> Total Marks *
                                    </label>
                                    <input
                                        type="number"
                                        value={totalMarks}
                                        onChange={(e) => setTotalMarks(e.target.value)}
                                        className="w-full p-3 font-medium text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none"
                                        placeholder="e.g. 100"
                                        min={1}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        <Target size={16} className="inline mr-1 text-gray-500" /> Passing Score *
                                    </label>
                                    <input
                                        type="number"
                                        value={passingScore}
                                        onChange={(e) => setPassingScore(e.target.value)}
                                        className="w-full p-3 font-medium text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none placeholder:text-gray-500"
                                        placeholder="e.g. 50"
                                        min={1}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={isMock}
                                            onChange={(e) => setIsMock(e.target.checked)}
                                        />
                                        <div className={`block w-14 h-8 rounded-full transition-colors ${isMock ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isMock ? 'transform translate-x-6' : ''}`}></div>
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">Public Mock Exam</div>
                                        <div className="text-xs text-gray-500">Enable this to allow anyone to take the exam without OTP verification.</div>
                                    </div>
                                </label>
                            </div>


                            <div className="flex justify-end pt-6 border-t border-gray-100">
                                <button
                                    onClick={handleNext}
                                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                                >
                                    Next: Format Questions <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Add Questions */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Define Question Bank Rules</h2>
                                        <p className="text-gray-600">Select which categories and difficulties to include in this assessment.</p>
                                    </div>
                                    <button
                                        onClick={addGroup}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm text-sm font-medium"
                                    >
                                        <Plus size={16} /> Add Rule Group
                                    </button>
                                </div>

                                {/* Rules List */}
                                <div className="space-y-6">
                                    {ruleGroups.length === 0 ? (
                                        <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                            <div className="w-16 h-16 bg-white rounded-full border border-gray-100 flex items-center justify-center mx-auto mb-4 text-gray-400 shadow-sm">
                                                <Plus size={32} />
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">No rules yet</h3>
                                            <p className="text-gray-600 max-w-sm mx-auto mb-6 font-medium">Start building your assessment by defining what questions to fetch.</p>
                                            <button
                                                onClick={addGroup}
                                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition"
                                            >
                                                Add First Rule Group
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            {ruleGroups.map((group, gIdx) => (
                                                <div key={gIdx} className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 p-8 flex flex-col gap-6 relative group hover:border-indigo-200 transition-all">
                                                    <button
                                                        onClick={() => removeGroup(gIdx)}
                                                        className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Remove Category"
                                                    >
                                                        <Trash2 size={20} />
                                                    </button>

                                                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                                        <div className="max-w-sm flex-1">
                                                            <label className="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">Category</label>
                                                            <select
                                                                value={group.category}
                                                                onChange={(e) => updateGroup(gIdx, 'category', e.target.value)}
                                                                className="w-full p-3 font-bold text-gray-900 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-50/50 appearance-none cursor-pointer"
                                                            >
                                                                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        </div>

                                                        <div className="w-full md:w-36">
                                                            <label className="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">Show Order</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={group.display_order}
                                                                onChange={(e) => updateGroupDisplayOrder(gIdx, e.target.value)}
                                                                className="w-full p-3 text-center font-bold text-gray-900 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-white"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        {group.sub_groups.map((sub, sIdx) => (
                                                            <div key={sIdx} className="bg-gray-50/50 rounded-2xl p-6 border border-gray-200 relative group/sub">
                                                                <button
                                                                    onClick={() => removeSubGroup(gIdx, sIdx)}
                                                                    className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>

                                                                {(() => {
                                                                    const catCfg = bankConfig.structure?.categories.find(c => c.name === group.category);
                                                                    if (catCfg?.has_sub_categories) {
                                                                        return (
                                                                            <div className="flex items-center gap-4 mb-4">
                                                                                <div className="flex-1 max-w-[200px]">
                                                                                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Sub Category</label>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <input
                                                                                            type="text"
                                                                                            list={`sub-list-${gIdx}-${sIdx}`}
                                                                                            value={sub.sub_category}
                                                                                            onChange={(e) => updateSubGroup(gIdx, sIdx, e.target.value)}
                                                                                            className="w-full p-2 text-sm font-semibold text-gray-900 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none bg-white"
                                                                                            placeholder="Select sub-category…"
                                                                                        />
                                                                                    </div>
                                                                                    <datalist id={`sub-list-${gIdx}-${sIdx}`}>
                                                                                        {catCfg.sub_categories.map(s => <option key={s.name} value={s.name} />)}
                                                                                    </datalist>
                                                                                </div>
                                                                                <div className="h-px bg-gray-200 flex-1 mt-5"></div>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}

                                                                <div className="space-y-3">
                                                                    {sub.difficulties.map((diff, dIdx) => (
                                                                        <div key={dIdx} className="flex flex-wrap gap-4 items-end">
                                                                            <div className="w-32">
                                                                                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Difficulty</label>
                                                                                <select
                                                                                    value={diff.difficulty}
                                                                                    onChange={(e) => updateDifficulty(gIdx, sIdx, dIdx, 'difficulty', e.target.value)}
                                                                                    className="w-full p-2.5 text-sm font-medium text-gray-900 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none bg-white"
                                                                                >
                                                                                    {(() => {
                                                                                        const catCfg = bankConfig.structure?.categories.find(c => c.name === group.category);
                                                                                        if (!catCfg) return [
                                                                                            <option key="Easy" value="Easy">Easy</option>,
                                                                                            <option key="Medium" value="Medium">Medium</option>,
                                                                                            <option key="Hard" value="Hard">Hard</option>
                                                                                        ];
                                                                                        if (catCfg.has_sub_categories) {
                                                                                            const subCfg = catCfg.sub_categories.find(s => s.name === sub.sub_category);
                                                                                            return (subCfg?.difficulties || []).map(d => {
                                                                                                const val = typeof d === "string" ? d : d.difficulty;
                                                                                                return <option key={val} value={val}>{val}</option>;
                                                                                            });
                                                                                        }
                                                                                        return catCfg.difficulties.map(d => {
                                                                                            const val = typeof d === "string" ? d : d.difficulty;
                                                                                            return <option key={val} value={val}>{val}</option>;
                                                                                        });
                                                                                    })()}
                                                                                </select>
                                                                            </div>

                                                                            <div className="w-24">
                                                                                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Count</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={diff.count}
                                                                                    onChange={(e) => updateDifficulty(gIdx, sIdx, dIdx, 'count', e.target.value)}
                                                                                    className="w-full p-2.5 text-center font-bold text-gray-900 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none bg-white"
                                                                                />
                                                                            </div>

                                                                            <div className="w-24">
                                                                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Pts / Q</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={diff.points_per_question}
                                                                                    onChange={(e) => updateDifficulty(gIdx, sIdx, dIdx, 'points_per_question', e.target.value)}
                                                                                    className="w-full p-2.5 text-center font-bold text-gray-900 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none bg-white"
                                                                                />
                                                                            </div>

                                                                            <button
                                                                                onClick={() => removeDifficulty(gIdx, sIdx, dIdx)}
                                                                                className="p-2.5 text-gray-400 hover:text-red-500 transition-colors mb-[2px]"
                                                                                title="Remove Rule"
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    ))}

                                                                    <button
                                                                        onClick={() => addDifficulty(gIdx, sIdx)}
                                                                        className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold hover:text-indigo-800 transition-colors py-1"
                                                                    >
                                                                        <Plus size={14} /> Add Difficulty Level
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {(() => {
                                                            const catCfg = bankConfig.structure?.categories.find(c => c.name === group.category);
                                                            if (catCfg?.has_sub_categories) {
                                                                return (
                                                                    <button
                                                                        onClick={() => addSubGroup(gIdx)}
                                                                        className="mt-2 flex items-center gap-2 text-sm text-gray-500 font-bold hover:text-gray-900 transition-colors bg-white border-2 border-dashed border-gray-200 rounded-xl p-4 w-full justify-center hover:border-gray-300"
                                                                    >
                                                                        <Plus size={18} /> Add Another Sub-Category inside {group.category}
                                                                    </button>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>

                                                    <div className="bg-indigo-600 rounded-xl p-4 text-white flex justify-between items-center shadow-lg shadow-indigo-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-indigo-500 rounded-lg">
                                                                <FileText size={18} />
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">Category Summary</div>
                                                                <div className="font-bold">{group.display_order}. {group.category}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-2xl font-black">
                                                                {group.sub_groups.reduce((sum, sg) => sum + sg.difficulties.reduce((s, d) => s + (Number(d.count) * Number(d.points_per_question)), 0), 0)}
                                                                <span className="text-xs ml-1 opacity-70">pts</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

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
                                    Review & Submit <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Your Assessment</h2>
                                <p className="text-gray-600 mb-6">Review all settings before creating the assessment.</p>

                                <div className="space-y-6">
                                    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                                        <h3 className="text-xl font-black text-gray-900 mb-2 relative z-10">{title}</h3>
                                        <p className="text-gray-700 mb-6 relative z-10">{description || "No description provided."}</p>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Questions</span>
                                                <span className="text-xl font-black text-gray-900">{totalQuestions}</span>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Duration</span>
                                                <span className="text-xl font-black text-gray-900">{duration}m</span>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Total Marks</span>
                                                <span className="text-xl font-black text-indigo-700">{totalMarks}</span>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                <span className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Passing</span>
                                                <span className="text-xl font-black text-green-600">{passingScore}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Category Display Order</h4>
                                            <span className="text-xs font-medium text-gray-500">Candidates will see categories in this sequence</span>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {ruleGroups.map((group) => (
                                                <div
                                                    key={`${group.display_order}-${group.category}`}
                                                    className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3"
                                                >
                                                    <span className="text-sm font-semibold text-gray-900">{group.category}</span>
                                                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm">
                                                        #{group.display_order}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bank count warnings */}
                                    {Object.keys(bankCounts).length > 0 && (() => {
                                        const warnings = flattenedRules.filter(r => {
                                            const key = `${r.category}|||${r.sub_category || ""}|||${r.difficulty}`;
                                            return (bankCounts[key] ?? Infinity) < r.count;
                                        });
                                        if (warnings.length === 0) return null;
                                        return (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <AlertTriangle size={16} className="text-amber-600" />
                                                    <span className="text-sm font-bold text-amber-800">Question Bank Shortage Warning</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {warnings.map((r, i) => {
                                                        const key = `${r.category}|||${r.sub_category || ""}|||${r.difficulty}`;
                                                        const available = bankCounts[key] ?? 0;
                                                        return (
                                                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100 text-sm">
                                                                <span className="font-medium text-gray-800">
                                                                    {r.category}{r.sub_category ? ` / ${r.sub_category}` : ""} — {r.difficulty}
                                                                </span>
                                                                <span className="text-amber-700 font-bold">
                                                                    {available} available / {r.count} needed
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-xs text-amber-600 mt-3">
                                                    Go to <button onClick={() => router.push("/interviewer/exam-sheet")} className="underline font-bold">Exam Sheet</button> to add more questions.
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="flex justify-between pt-6 border-t border-gray-100">
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
                                            <Save size={18} /> Create Final Assessment
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Success */}
                    {step === 4 && (
                        createdId ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center max-w-2xl mx-auto space-y-6">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2 text-green-600">
                                    <Check size={40} />
                                </div>
                                <h2 className="text-3xl font-black text-gray-900">Assessment Created!</h2>
                                <p className="text-gray-600 font-medium pb-2">
                                    Your assessment has been successfully created.
                                    {!isMock && " Share the rotating 4-digit PIN below with candidates — it refreshes every 30 minutes."}
                                </p>
    
                                {!isMock && (
                                    <div className="bg-indigo-50 border-2 border-indigo-100 rounded-2xl p-6 max-w-sm mx-auto space-y-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Live Access PIN</div>
    
                                        {pinLoading ? (
                                            <div className="flex items-center justify-center py-4">
                                                <RefreshCw size={24} className="animate-spin text-indigo-400" />
                                            </div>
                                        ) : livePIN ? (
                                            <>
                                                <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                                                    <code className="text-4xl font-mono font-black text-indigo-900 tracking-[0.3em]">
                                                        {livePIN.pin}
                                                    </code>
                                                    <button
                                                        onClick={async () => {
                                                            const ok = await copyToClipboard(livePIN.pin);
                                                            if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
                                                        }}
                                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        title="Copy PIN"
                                                    >
                                                        {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                                                    </button>
                                                </div>
                                                <div className="text-xs font-semibold text-indigo-400 flex items-center justify-center gap-1">
                                                    <Clock size={12} />
                                                    Rotates at {new Date(livePIN.rotates_at).toLocaleTimeString()}
                                                </div>
                                            </>
                                        ) : null}
    
                                        <button
                                            onClick={handleRegenerateSecret}
                                            disabled={pinLoading}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-indigo-200 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition disabled:opacity-50 text-sm"
                                        >
                                            <RefreshCw size={15} /> Regenerate PIN Secret
                                        </button>
                                        <p className="text-[11px] text-indigo-400">Regenerating creates a new secret — all current PINs for this exam are immediately invalidated.</p>
                                    </div>
                                )}
    
                                <div className="pt-4">
                                    <button
                                        onClick={() => router.push("/interviewer/assessments")}
                                        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                    >
                                        Return to Dashboard
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-gray-200 max-w-2xl mx-auto">
                                <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                                <p className="text-gray-600 font-medium">Finalizing assessment...</p>
                            </div>
                        )
                    )}
                </div>

                {/* Sticky Sidebar for Steps 2 & 3 */}
                {step > 1 && step < 4 && (
                    <aside className="w-full lg:w-80 space-y-6">
                        <div className="lg:sticky lg:top-24 space-y-6">
                            <div className={`p-6 rounded-2xl border-4 border-dashed transition-all ${currentPointsTotal === Number(totalMarks) ? 'bg-green-50 border-green-200 text-green-900' : 'bg-orange-50 border-orange-200 text-orange-900'}`}>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${currentPointsTotal === Number(totalMarks) ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'}`}>
                                            <Target size={24} />
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest leading-none mb-1">Status</div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl font-black">{currentPointsTotal}</span>
                                                <span className="text-sm font-bold opacity-40">/ {totalMarks}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-200/50 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Total Questions</div>
                                            <span className="text-xl font-black">{totalQuestions}</span>
                                        </div>

                                        {currentPointsTotal !== Number(totalMarks) ? (
                                            <div className="text-xs font-bold py-2 px-3 bg-orange-100 text-orange-700 rounded-lg animate-pulse">
                                                Needs {Math.abs(Number(totalMarks) - currentPointsTotal)} more pts
                                            </div>
                                        ) : (
                                            <div className="text-xs font-bold py-2 px-3 bg-green-100 text-green-700 rounded-lg flex items-center gap-1.5">
                                                <CheckCircle size={14} /> Ready to proceed
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {step === 2 && ruleGroups.length > 0 && (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700">
                                    <h4 className="font-bold mb-2 uppercase tracking-tighter flex items-center gap-1">
                                        <FileText size={14} /> Structure Tips
                                    </h4>
                                    <p>Rules will dynamically sample questions for each candidate session.</p>
                                </div>
                            )}
                        </div>
                    </aside>
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
                            Create Assessment
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    Are you sure you want to create this assessment? Candidates will receive dynamically sampled questions based on your defined rules.
                </p>
            </Modal>
        </div>
    );
}
