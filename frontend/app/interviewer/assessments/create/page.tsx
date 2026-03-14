"use client";

import { useState, useRef, useEffect } from "react";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { Plus, Trash2, Save, ArrowLeft, ArrowRight, Clock, Award, Target, RefreshCw, FileText, CheckCircle, Music, Upload, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";

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
    sub_groups: SubGroup[];
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
    const audioInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [bankConfig, setBankConfig] = useState<BankConfig>({ categories: [], sub_categories: {}, difficulties: [] });

    useEffect(() => {
        // Fetch dynamic config from question bank
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        fetch(`${base}/api/admin/questions/config`, { headers })
            .then(r => r.json())
            .then(d => setBankConfig(d))
            .catch(() => { /* non-fatal */ });
    }, []);

    // Wizard state
    const [step, setStep] = useState(1);
    
    // Assessment configuration state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [duration, setDuration] = useState<number | string>(60);
    const [totalMarks, setTotalMarks] = useState<number | string>(100);
    const [passingScore, setPassingScore] = useState<number | string>(50);
    const [ruleGroups, setRuleGroups] = useState<RuleGroup[]>([]);
    
    const [submitting, setSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // Preview questions state
    const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
    const [fetchingPreview, setFetchingPreview] = useState(false);
    // Bank count warnings per slot (key: "category|||sub|||difficulty")
    const [bankCounts, setBankCounts] = useState<Record<string, number>>({});
    const [fetchingCounts, setFetchingCounts] = useState(false);

    // Auth protection
    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">Loading...</div>;
    if (!isAuthenticated || user?.role !== "interviewer") {
        router.push("/login");
        return null;
    }

    const categoryOptions = Array.from(new Set([
        ...(bankConfig.structure?.categories?.map(c => c.name) || []),
        ...(bankConfig.categories || []),
        "Programming", "Communication", "Aptitude"
    ]));

    const addGroup = () => {
        const catName = categoryOptions[0] || "Programming";
        const catCfg = bankConfig.structure?.categories.find(c => c.name === catName);
        
        const defaultSub = catCfg?.has_sub_categories ? (catCfg.sub_categories[0]?.name || "") : "";
        const firstSubDiff = catCfg?.sub_categories[0]?.difficulties[0];
        const firstCatDiff = catCfg?.difficulties[0];
        
        const defaultDiff = catCfg?.has_sub_categories 
            ? (typeof firstSubDiff === "string" ? firstSubDiff : firstSubDiff?.difficulty || "Easy")
            : (typeof firstCatDiff === "string" ? firstCatDiff : firstCatDiff?.difficulty || "Easy");

        setRuleGroups([
            ...ruleGroups,
            {
                category: catName,
                sub_groups: [
                    {
                        sub_category: defaultSub,
                        difficulties: [{ difficulty: defaultDiff, count: 1, points_per_question: 10 }]
                    }
                ]
            }
        ]);
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

    const removeGroup = (gIndex: number) => {
        const newGroups = [...ruleGroups];
        newGroups.splice(gIndex, 1);
        setRuleGroups(newGroups);
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

    const uploadSubGroupAudio = async (gIndex: number, sIndex: number, file: File) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex].sub_groups[sIndex].audio_uploading = true;
        setRuleGroups([...newGroups]);

        try {
            const formData = new FormData();
            formData.append("audio", file);
            const token = localStorage.getItem("token");
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/admin/audio-upload`, {
                method: "POST",
                headers: token ? { "Authorization": `Bearer ${token}` } : {},
                body: formData,
            });
            if (!res.ok) throw new Error("Upload failed");
            const data = await res.json();
            newGroups[gIndex].sub_groups[sIndex].audio_url = data.url;
            showToast("Audio uploaded successfully!", "success");
        } catch {
            showToast("Failed to upload audio file", "error");
        } finally {
            newGroups[gIndex].sub_groups[sIndex].audio_uploading = false;
            setRuleGroups([...newGroups]);
        }
    };


    const toggleAudio = (gIdx: number, sIdx: number) => {
        const newGroups = [...ruleGroups];
        newGroups[gIdx].sub_groups[sIdx].show_audio_upload = !newGroups[gIdx].sub_groups[sIdx].show_audio_upload;
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
        let finalValue: any = value;
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
            setFetchingCounts(true);
            try {
                const token = localStorage.getItem("token");
                const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
                const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                const counts: Record<string, number> = {};
                await Promise.all(flattenedRules.map(async rule => {
                    const params = new URLSearchParams({ category: rule.category, difficulty: rule.difficulty });
                    if (rule.sub_category) params.set("sub_category", rule.sub_category);
                    const res = await fetch(`${apiBase}/api/admin/questions/count?${params}`, { headers });
                    const data = await res.json();
                    const key = `${rule.category}|||${rule.sub_category || ""}|||${rule.difficulty}`;
                    counts[key] = data.count || 0;
                }));
                setBankCounts(counts);
            } catch { /* non-fatal */ } finally {
                setFetchingCounts(false);
            }
            setStep(3);
            fetchPreview();
        }
    };

    const fetchPreview = async () => {
        setFetchingPreview(true);
        try {
            const res = await apiRequest("/api/assessments/preview", "POST", {
                question_rules: flattenedRules
            });
            setPreviewQuestions(res || []);
        } catch (err: any) {
            showToast("Failed to fetch question preview", "error");
        } finally {
            setFetchingPreview(false);
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
            const payload = {
                title: title,
                description: description,
                duration: Number(duration),
                passing_score: Number(passingScore),
                total_marks: Number(totalMarks),
                question_rules: flattenedRules
            };

            await apiRequest("/api/assessments", "POST", payload);

            showToast(`Successfully created assessment!`, "success");
            router.push("/interviewer/assessments");
        } catch (err: any) {
            showToast(err.message || "Failed to create assessment", "error");
        } finally {
            setSubmitting(false);
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
                            <p className="text-xs text-gray-600 font-medium">Step {step} of 3</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
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

            <main className="max-w-4xl mx-auto px-4 py-8">
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

                                                <div className="max-w-sm">
                                                    <label className="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">Category</label>
                                                    <select
                                                        value={group.category}
                                                        onChange={(e) => updateGroup(gIdx, 'category', e.target.value)}
                                                        className="w-full p-3 font-bold text-gray-900 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-50/50 appearance-none cursor-pointer"
                                                    >
                                                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
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
                                                            <div className="font-bold">{group.category}</div>
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
                                        
                                        <div className={`mt-10 p-6 rounded-2xl flex items-center justify-between border-4 border-dashed transition-all ${currentPointsTotal === Number(totalMarks) ? 'bg-green-50 border-green-200 text-green-900' : 'bg-orange-50 border-orange-200 text-orange-900 animate-pulse-subtle'}`}>
                                            <div className="flex items-center gap-6">
                                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm ${currentPointsTotal === Number(totalMarks) ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'}`}>
                                                    <Target size={32} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold opacity-60 uppercase tracking-widest mb-1">Configuration Status</div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-4xl font-black">{currentPointsTotal}</span>
                                                        <span className="text-xl font-bold opacity-40">/ {totalMarks} pts</span>
                                                    </div>
                                                    {currentPointsTotal !== Number(totalMarks) ? (
                                                        <p className="text-sm font-medium mt-1">Configure {Math.abs(Number(totalMarks) - currentPointsTotal)} more pts to proceed</p>
                                                    ) : (
                                                        <p className="text-sm font-bold mt-1 flex items-center gap-1"><CheckCircle size={14} /> Ready to Review</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right px-8 border-l border-gray-200/50">
                                                <div className="text-sm font-bold opacity-60 uppercase tracking-widest mb-1">Total Questions</div>
                                                <span className="text-4xl font-black">{totalQuestions}</span>
                                            </div>
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

                                <div>
                                    <div className="flex items-center justify-between mb-4 px-2">
                                        <h4 className="text-lg font-bold text-gray-900">Question Bank Samples</h4>
                                        <button 
                                            onClick={fetchPreview}
                                            disabled={fetchingPreview}
                                            className="flex items-center gap-2 text-sm text-indigo-600 font-bold hover:text-indigo-800 disabled:opacity-50"
                                        >
                                            <RefreshCw size={14} className={fetchingPreview ? "animate-spin" : ""} />
                                            {fetchingPreview ? "Generating..." : "Refresh Samples"}
                                        </button>
                                    </div>
                                    
                                    {fetchingPreview ? (
                                        <div className="py-20 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                            <p className="text-gray-500 font-medium">Sampling random questions...</p>
                                        </div>
                                    ) : previewQuestions.length > 0 ? (
                                        <div className="space-y-4">
                                            {previewQuestions.map((q, qIdx) => (
                                                <div key={qIdx} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:border-indigo-200 transition-colors">
                                                    <div className="flex items-start justify-between gap-4 mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="p-1.5 bg-gray-50 rounded text-gray-400">
                                                                <FileText size={14} />
                                                            </span>
                                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                                                {q.category} • {q.difficulty}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                                            MCQ
                                                        </div>
                                                    </div>
                                                    <h5 className="text-gray-900 font-bold mb-4 leading-relaxed whitespace-pre-wrap">
                                                        {q.text}
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {q.options?.map((opt: string, oIdx: number) => {
                                                            const letter = String.fromCharCode(65 + oIdx);
                                                            const isCorrect = letter === q.correct_answer;
                                                            return (
                                                                <div 
                                                                    key={oIdx} 
                                                                    className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${isCorrect ? 'bg-green-50 border-green-200 text-green-900 ring-1 ring-green-100' : 'bg-gray-50 border-gray-100 text-gray-600'}`}
                                                                >
                                                                    <span className={`flex-none w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${isCorrect ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-400'}`}>
                                                                        {letter}
                                                                    </span>
                                                                    <span className="flex-1">{opt}</span>
                                                                    {isCorrect && <CheckCircle size={14} className="text-green-600 flex-none" />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            <p className="text-center text-xs text-gray-400 py-4">
                                                Showing {previewQuestions.length} sample questions based on your rules.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                            <p className="text-gray-500">No questions found matching your criteria.</p>
                                        </div>
                                    )}
                                </div>
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
