"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";

interface DifficultyRule {
    difficulty: string;
    count: number | string;
    points_per_question: number | string;
}

interface RuleGroup {
    category: string;
    display_order: number;
    sub_category?: string;
    difficulties: DifficultyRule[];
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
        .map(({ group }) => group);
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

export default function EditAssessmentPage() {
    const router = useRouter();
    const params = useParams();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [duration, setDuration] = useState<number | string>(60);
    const [totalMarks, setTotalMarks] = useState<number | string>(100);
    const [passingScore, setPassingScore] = useState<number | string>(50);
    const [isMock, setIsMock] = useState(false);
    const [ruleGroups, setRuleGroups] = useState<RuleGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [bankConfig, setBankConfig] = useState<BankConfig>({ categories: [], sub_categories: {}, difficulties: [] });

    useEffect(() => {
        // Fetch dynamic bank config
        apiRequest("/api/admin/questions/config", "GET")
            .then(d => setBankConfig(d))
            .catch(() => { /* non-fatal */ });
    }, []);

    const fetchAssessment = useCallback(async (id: string) => {
        try {
            const data = await apiRequest(`/api/assessments/${id}`, "GET");
            setTitle(data.title);
            setDescription(data.description);
            setDuration(data.duration);
            setTotalMarks(data.total_marks || 100);
            setPassingScore(data.passing_score || 50);
            setIsMock(data.is_mock || false);

            // Group the flat rules back into RuleGroups
            const flatRules: Array<{
                category: string;
                sub_category?: string;
                difficulty: string;
                count: number;
                points_per_question: number;
                display_order?: number;
            }> = data.question_rules || [];
            const groups: RuleGroup[] = [];

            flatRules.forEach((rule, index) => {
                const displayOrder = sanitizeDisplayOrder(rule.display_order, index + 1);
                let group = groups.find(
                    (existingGroup) =>
                        existingGroup.category === rule.category &&
                        existingGroup.sub_category === rule.sub_category &&
                        existingGroup.display_order === displayOrder
                );
                if (!group) {
                    group = {
                        category: rule.category,
                        display_order: displayOrder,
                        sub_category: rule.sub_category,
                        difficulties: []
                    };
                    groups.push(group);
                }
                group.difficulties.push({
                    difficulty: rule.difficulty,
                    count: rule.count,
                    points_per_question: rule.points_per_question
                });
            });

            setRuleGroups(normalizeRuleGroups(groups));
        } catch (err) {
            console.error("Failed to fetch assessment", err);
            showToast("Failed to load assessment details", "error");
            router.push("/interviewer/assessments");
        } finally {
            setLoading(false);
        }
    }, [router, showToast]);

    useEffect(() => {
        if (!isLoading && (!isAuthenticated || user?.role !== "interviewer")) {
            router.push("/login");
            return;
        }

        if (isAuthenticated && params.id) {
            fetchAssessment(params.id as string);
        }
    }, [fetchAssessment, isAuthenticated, isLoading, params.id, router, user]);

    // Derive category options from bankConfig
    const categoryOptions = Array.from(new Set([
        ...(bankConfig.structure?.categories?.map(c => c.name) || []),
        ...(bankConfig.categories || []),
    ]));

    // Get config for a given category
    const getCatCfg = (catName: string) =>
        bankConfig.structure?.categories.find(c => c.name === catName);

    // Get difficulty options for a given category + sub_category
    const getDifficultyOptions = (catName: string, subCatName: string): string[] => {
        const catCfg = getCatCfg(catName);
        if (!catCfg) return ["Easy", "Medium", "Hard"];
        if (catCfg.has_sub_categories) {
            const subCfg = catCfg.sub_categories.find(s => s.name === subCatName);
            return (subCfg?.difficulties || []).map(d => typeof d === "string" ? d : d.difficulty);
        }
        return catCfg.difficulties.map(d => typeof d === "string" ? d : d.difficulty);
    };

    const addGroup = () => {
        const catName = categoryOptions[0] || "Programming";
        const catCfg = getCatCfg(catName);
        const defaultSub = catCfg?.has_sub_categories ? (catCfg.sub_categories[0]?.name || "") : undefined;
        const diffs = getDifficultyOptions(catName, defaultSub || "");
        const nextDisplayOrder = ruleGroups.length > 0 ? Math.max(...ruleGroups.map(group => group.display_order || 0)) + 1 : 1;
        setRuleGroups(normalizeRuleGroups([
            ...ruleGroups,
            {
                category: catName,
                display_order: nextDisplayOrder,
                sub_category: defaultSub,
                difficulties: [{ difficulty: diffs[0] || "Easy", count: 1, points_per_question: 10 }]
            }
        ]));
    };

    const updateGroup = (gIndex: number, field: keyof RuleGroup, value: string) => {
        const newGroups = [...ruleGroups];
        if (field === 'category') {
            const catCfg = getCatCfg(value);
            const defaultSub = catCfg?.has_sub_categories ? (catCfg.sub_categories[0]?.name || "") : undefined;
            const diffs = getDifficultyOptions(value, defaultSub || "");
            newGroups[gIndex] = {
                ...newGroups[gIndex],
                category: value,
                sub_category: defaultSub,
                difficulties: [{ difficulty: diffs[0] || "Easy", count: 1, points_per_question: 10 }]
            };
        } else {
            newGroups[gIndex] = { ...newGroups[gIndex], [field]: value };
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

    const addDifficulty = (gIndex: number) => {
        const group = ruleGroups[gIndex];
        const diffs = getDifficultyOptions(group.category, group.sub_category || "");
        const newGroups = [...ruleGroups];
        newGroups[gIndex].difficulties.push({ difficulty: diffs[0] || "Medium", count: 1, points_per_question: 10 });
        setRuleGroups(newGroups);
    };

    const updateDifficulty = (gIndex: number, dIndex: number, field: keyof DifficultyRule, value: string) => {
        const newGroups = [...ruleGroups];
        let finalValue: string | number = value;
        if (field === 'count' || field === 'points_per_question') {
            if (!/^\d*$/.test(value)) return;
            finalValue = parseInt(value) || 0;
        }

        newGroups[gIndex].difficulties[dIndex] = { ...newGroups[gIndex].difficulties[dIndex], [field]: finalValue };
        setRuleGroups(newGroups);
    };

    const removeDifficulty = (gIndex: number, dIndex: number) => {
        const newGroups = [...ruleGroups];
        newGroups[gIndex].difficulties.splice(dIndex, 1);
        if (newGroups[gIndex].difficulties.length === 0) {
            newGroups.splice(gIndex, 1);
        }
        setRuleGroups(newGroups);
    };

    const flattenedRules = ruleGroups.flatMap(g =>
        g.difficulties.map(d => ({
            category: g.category,
            sub_category: g.sub_category,
            difficulty: d.difficulty,
            count: Number(d.count),
            points_per_question: Number(d.points_per_question),
            display_order: g.display_order,
        }))
    );

    const handleSubmit = async () => {
        if (!title) {
            showToast("Please enter a title", "error");
            return;
        }

        const currentPointsTotal = flattenedRules.reduce((sum, r) => sum + (r.count * r.points_per_question), 0);
        if (currentPointsTotal !== Number(totalMarks)) {
            showToast(`Configured Question Points (${currentPointsTotal}) must exactly match Total Marks (${totalMarks})`, "error");
            return;
        }

        setSubmitting(true);
        try {
            await apiRequest(`/api/assessments/${params.id}`, "PUT", {
                title,
                description,
                duration: Number(duration),
                total_marks: Number(totalMarks),
                passing_score: Number(passingScore),
                is_mock: isMock,
                question_rules: flattenedRules,
            });
            showToast("Assessment updated successfully!", "success");
            router.push("/interviewer/assessments");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update assessment";
            showToast(message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    const totalQuestions = flattenedRules.reduce((sum, r) => sum + r.count, 0);
    const currentPointsTotal = flattenedRules.reduce((sum, r) => sum + (r.count * r.points_per_question), 0);

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-gray-700 font-bold hover:text-gray-900 mb-6 transition-colors"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Assessments
                </button>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                    <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Edit Assessment</h1>
                            <p className="text-gray-700 font-medium">Update configuration and question sampling rules.</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">Status</div>
                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold tracking-wide">DRAFT</span>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Assessment Title *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full text-xl font-bold text-gray-900 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full p-3 text-gray-900 font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none transition-all resize-none placeholder:text-gray-400"
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4 border-t border-gray-100">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Duration (min) *</label>
                                <input
                                    type="text"
                                    value={duration}
                                    onChange={(e) => {
                                        if (/^\d*$/.test(e.target.value)) setDuration(e.target.value)
                                    }}
                                    className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Total Marks *</label>
                                <input
                                    type="text"
                                    value={totalMarks}
                                    onChange={(e) => {
                                        if (/^\d*$/.test(e.target.value)) setTotalMarks(e.target.value)
                                    }}
                                    className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Passing Score *</label>
                                <input
                                    type="text"
                                    value={passingScore}
                                    onChange={(e) => {
                                        if (/^\d*$/.test(e.target.value)) setPassingScore(e.target.value)
                                    }}
                                    className="w-full p-3 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 focus:outline-none transition-all"
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
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Question Sampling Rules</h2>
                            <p className="text-gray-700 font-medium">Define how questions are picked for each candidate.</p>
                        </div>
                        <button
                            onClick={addGroup}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm text-sm font-medium"
                        >
                            <Plus size={16} /> Add Rule Group
                        </button>
                    </div>

                    <div className="space-y-6">
                        {ruleGroups.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <Plus size={32} className="mx-auto text-gray-400 mb-2" />
                                <p className="text-gray-700 font-bold">No sampling rules defined yet.</p>
                            </div>
                        ) : (
                            ruleGroups.map((group, gIdx) => {
                                const catCfg = getCatCfg(group.category);
                                const hasSubCats = catCfg?.has_sub_categories ?? false;
                                const subCatOptions = catCfg?.sub_categories || [];
                                const diffOptions = getDifficultyOptions(group.category, group.sub_category || "");

                                return (
                                    <div key={gIdx} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4 relative group hover:border-indigo-300 transition-all">
                                        <button
                                            onClick={() => removeGroup(gIdx)}
                                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Remove Rule Group"
                                        >
                                            <Trash2 size={18} />
                                        </button>

                                        <div className="flex flex-wrap gap-4 items-end pr-10">
                                            {/* Category */}
                                            <div className="flex-1 min-w-[200px]">
                                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Category</label>
                                                <select
                                                    value={group.category}
                                                    onChange={(e) => updateGroup(gIdx, 'category', e.target.value)}
                                                    className="w-full p-2.5 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                >
                                                    {categoryOptions.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="w-28">
                                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Show Order</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={group.display_order}
                                                    onChange={(e) => updateGroupDisplayOrder(gIdx, e.target.value)}
                                                    className="w-full p-2.5 text-center font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                />
                                            </div>

                                            {/* Sub-category — only shown if category has sub-categories */}
                                            {hasSubCats && (
                                                <div className="flex-1 min-w-[150px]">
                                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Sub Category</label>
                                                    <select
                                                        value={group.sub_category || ""}
                                                        onChange={(e) => updateGroup(gIdx, 'sub_category', e.target.value)}
                                                        className="w-full p-2.5 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                    >
                                                        {subCatOptions.map(s => (
                                                            <option key={s.name} value={s.name}>{s.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-2 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-sm font-semibold text-gray-700">Difficulties &amp; Questions</h4>
                                            </div>
                                            <div className="space-y-3">
                                                {group.difficulties.map((diff, dIdx) => (
                                                    <div key={dIdx} className="flex flex-wrap gap-4 items-end">
                                                        <div className="w-36">
                                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Difficulty</label>
                                                            <select
                                                                value={diff.difficulty}
                                                                onChange={(e) => updateDifficulty(gIdx, dIdx, 'difficulty', e.target.value)}
                                                                className="w-full p-2.5 font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                            >
                                                                {diffOptions.length > 0 ? (
                                                                    diffOptions.map(d => (
                                                                        <option key={d} value={d}>{d}</option>
                                                                    ))
                                                                ) : (
                                                                    <>
                                                                        <option value="Easy">Easy</option>
                                                                        <option value="Medium">Medium</option>
                                                                        <option value="Hard">Hard</option>
                                                                    </>
                                                                )}
                                                            </select>
                                                        </div>

                                                        <div className="w-24">
                                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Count</label>
                                                            <input
                                                                type="text"
                                                                value={diff.count}
                                                                onChange={(e) => updateDifficulty(gIdx, dIdx, 'count', e.target.value)}
                                                                className="w-full p-2.5 text-center font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                            />
                                                        </div>

                                                        <div className="w-32">
                                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Pts / Q</label>
                                                            <input
                                                                type="text"
                                                                value={diff.points_per_question}
                                                                onChange={(e) => updateDifficulty(gIdx, dIdx, 'points_per_question', e.target.value)}
                                                                className="w-full p-2.5 text-center font-bold text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 focus:outline-none bg-white transition-all"
                                                            />
                                                        </div>

                                                        <button
                                                            onClick={() => removeDifficulty(gIdx, dIdx)}
                                                            className="p-2.5 text-red-400 hover:text-red-600 hover:bg-white rounded-lg transition-all mb-[1px]"
                                                            title="Remove Difficulty"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={() => addDifficulty(gIdx)}
                                                className="mt-4 flex items-center gap-2 text-sm text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
                                            >
                                                <Plus size={16} /> Add Difficulty Level
                                            </button>
                                        </div>

                                        <div className="flex-none w-full bg-indigo-50 rounded-lg p-3 border border-indigo-100 text-sm text-indigo-900 flex justify-between items-center mt-2">
                                            <span>#{group.display_order} Total for {group.category} {group.sub_category ? ` → ${group.sub_category}` : ''}</span>
                                            <span className="font-bold text-indigo-700">
                                                Pts: {group.difficulties.reduce((sum, d) => sum + (Number(d.count) * Number(d.points_per_question)), 0)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div className={`mt-6 p-6 rounded-xl flex items-center justify-between border-2 border-dashed ${currentPointsTotal === Number(totalMarks) ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'} transition-all`}>
                            <div>
                                <div className="font-bold text-lg mb-1">Configured Points: {currentPointsTotal}</div>
                                <div className="text-sm opacity-80 gap-2 flex items-center">
                                    <span>Target Total Marks: <strong>{totalMarks}</strong></span>
                                    {currentPointsTotal !== Number(totalMarks) && (
                                        <span className="flex items-center gap-1 font-semibold text-orange-600 bg-white px-2 py-0.5 rounded shadow-sm">(Mismatch)</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-bold opacity-80 block mb-1 uppercase tracking-wider">Total Questions</span>
                                <span className="text-3xl font-black">{totalQuestions}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end items-center mb-20">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70"
                    >
                        {submitting ? "Saving..." : (
                            <>
                                <Save size={20} /> Update Assessment
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
