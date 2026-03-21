"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
    Plus, Trash2, BookOpen, ChevronRight, ChevronDown,
    Upload, Music, X, RefreshCw, AlertTriangle,
    CheckCircle, Filter, Download, Search, LayoutList,
    FileSpreadsheet, Terminal, Info, Layout, Layers, Tag, Edit2, ShieldAlert,
    Play, AlertCircle
} from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/lib/redux/store";
import { Modal } from "@/components/ui/Modal";
import {
    CategoryNode,
    SubNode,
    ActiveSlot,
    setTree,
    setExpanded,
    setSubExpanded,
    setActiveSlot,
    removeDifficulty as removeDifficultyAction,
    removeCategory as removeCategoryAction,
    renameCategory as renameCategoryAction,
    toggleHasSub as toggleHasSubAction,
    addSubCategory as addSubCategoryAction,
    renameSubCategory as renameSubCategoryAction,
    removeSubCategory as removeSubCategoryAction,
    addDifficulty as addDifficultyAction,
    setAudio as setAudioAction,
    toggleAudioUpload as toggleAudioUploadAction
} from "@/lib/redux/slices/questionBankSlice";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/* ─── Data types ────────────────────────────────── */
interface Question {
    id: string; category: string; sub_category?: string;
    difficulty: string; type: string; text: string;
    options?: string[]; correct_answer?: string; audio_url?: string;
    passage_title?: string; passage_text?: string;
}

interface DiffNode { difficulty: string; count: number; }

interface ImportQuestion {
    text: string; type: string;
    options: string[]; correct_answer: string; audio_url?: string;
    passage_title?: string; passage_text?: string;
}

interface DifficultyDeleteTarget {
    catIdx: number;
    subIdx: number;
    diffIdx: number;
    category: string;
    sub_category: string;
    difficulty: string;
    questionCount: number;
}

function mergeUniqueQuestions(existing: Question[], incoming: Question[]): Question[] {
    const merged = new Map<string, Question>();

    for (const question of existing) {
        merged.set(question.id, question);
    }

    for (const question of incoming) {
        if (!merged.has(question.id)) {
            merged.set(question.id, question);
        }
    }

    return Array.from(merged.values());
}

function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
}

const optionLetters = ["A", "B", "C", "D"];

function ensureMinimumMcqOptionRows(options?: string[]): string[] {
    const normalized = [...(options || []).slice(0, optionLetters.length)];
    while (normalized.length < 2) {
        normalized.push("");
    }
    return normalized;
}

function trimTrailingEmptyOptions(options?: string[]): string[] {
    const trimmedOptions = [...(options || []).slice(0, optionLetters.length)].map(option => option.trim());
    let lastFilledIndex = trimmedOptions.length - 1;

    for (; lastFilledIndex >= 0; lastFilledIndex--) {
        if (trimmedOptions[lastFilledIndex] !== "") {
            break;
        }
    }

    return trimmedOptions.slice(0, lastFilledIndex + 1);
}

function getVisibleMcqOptions(options?: string[]): string[] {
    return trimTrailingEmptyOptions(options).filter(option => option !== "");
}

function createEditableMcqOptions(options?: string[]): string[] {
    return ensureMinimumMcqOptionRows(getVisibleMcqOptions(options));
}

function addMcqOptionRow(options?: string[]): string[] {
    const normalized = ensureMinimumMcqOptionRows(options);
    if (normalized.length >= optionLetters.length) {
        return normalized;
    }
    return [...normalized, ""];
}

function removeMcqOptionAt(options: string[] | undefined, correctAnswer: string | undefined, optionIndex: number): { options: string[]; correctAnswer: string } {
    const normalized = ensureMinimumMcqOptionRows(options);
    const currentAnswer = getMcqAnswerLetter(correctAnswer, normalized);

    if (normalized.length <= 2) {
        return {
            options: normalized,
            correctAnswer: currentAnswer,
        };
    }

    const nextOptions = normalized.filter((_, idx) => idx !== optionIndex);
    const currentAnswerIndex = optionLetters.indexOf(currentAnswer);
    let nextAnswer = currentAnswer;

    if (currentAnswerIndex === optionIndex) {
        nextAnswer = optionLetters[Math.min(optionIndex, nextOptions.length - 1)];
    } else if (currentAnswerIndex > optionIndex) {
        nextAnswer = optionLetters[currentAnswerIndex - 1];
    }

    return {
        options: ensureMinimumMcqOptionRows(nextOptions),
        correctAnswer: nextAnswer,
    };
}

function getMcqAnswerLetter(correctAnswer?: string, options?: string[]): string {
    const normalizedAnswer = (correctAnswer || "").trim();
    if (!normalizedAnswer) {
        return "A";
    }

    const upperAnswer = normalizedAnswer.toUpperCase();
    const directMatch = optionLetters.find(letter => letter === upperAnswer);
    if (directMatch) {
        return directMatch;
    }

    const optionIndex = (options || []).findIndex(option => option.trim() === normalizedAnswer);
    if (optionIndex >= 0 && optionIndex < optionLetters.length) {
        return optionLetters[optionIndex];
    }

    const numericIndex = Number.parseInt(normalizedAnswer, 10);
    if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < optionLetters.length) {
        return optionLetters[numericIndex];
    }

    return "A";
}

function resolveMcqAnswerText(correctAnswer?: string, options?: string[]): string {
    const normalizedAnswer = (correctAnswer || "").trim();
    if (!normalizedAnswer) {
        return "";
    }

    const upperAnswer = normalizedAnswer.toUpperCase();
    const letterIndex = optionLetters.indexOf(upperAnswer);
    if (letterIndex !== -1) {
        return options?.[letterIndex]?.trim() || "";
    }

    const numericIndex = Number.parseInt(normalizedAnswer, 10);
    if (!Number.isNaN(numericIndex)) {
        return options?.[numericIndex]?.trim() || "";
    }

    const matchingOption = (options || []).find(option => option.trim() === normalizedAnswer);
    return matchingOption?.trim() || normalizedAnswer;
}

function createEditableQuestion(question: Question): Question {
    if (question.type !== "MCQ") {
        return {
            ...question,
            correct_answer: question.correct_answer || "",
        };
    }

    const options = createEditableMcqOptions(question.options);

    return {
        ...question,
        options,
        correct_answer: getMcqAnswerLetter(question.correct_answer, options),
    };
}

/* ─── Page ───────────────────────────────────────── */
export default function ExamSheetPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const { showToast } = useToast();

    const dispatch = useDispatch();
    const tree = useSelector((state: RootState) => state.questionBank.tree);
    const active = useSelector((state: RootState) => state.questionBank.active);

    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    /* right panel */
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loadingQ, setLoadingQ] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [viewMode, setViewMode] = useState<"upload" | "list">("upload");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState("");

    /* UI state */
    const [addCatName, setAddCatName] = useState("");
    const workspaceRef = useRef<HTMLDivElement>(null);

    /* import panel */
    const [showImport, setShowImport] = useState(false);
    const [importMode, setImportMode] = useState<"form" | "json">("form");
    const [jsonText, setJsonText] = useState("");
    const [importing, setImporting] = useState(false);
    const [formQ, setFormQ] = useState<ImportQuestion>({ text: "", type: "MCQ", options: ["", ""], correct_answer: "A" });
    const [audioUploading, setAudioUploading] = useState(false);
    const csvInputRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [editingQ, setEditingQ] = useState<Question | null>(null);
    const [showDeleteQuestionModal, setShowDeleteQuestionModal] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
    const [difficultyToDelete, setDifficultyToDelete] = useState<DifficultyDeleteTarget | null>(null);
    const [deletingDifficulty, setDeletingDifficulty] = useState(false);

    const buildTree = useCallback((qs: Question[]): CategoryNode[] => {
        const map = new Map<string, Map<string, Map<string, number>>>();
        for (const q of qs) {
            const sub = q.sub_category || "";
            if (!map.has(q.category)) map.set(q.category, new Map());
            const sm = map.get(q.category)!;
            if (!sm.has(sub)) sm.set(sub, new Map());
            const dm = sm.get(sub)!;
            dm.set(q.difficulty, (dm.get(q.difficulty) || 0) + 1);
        }

        const nodes: CategoryNode[] = [];
        map.forEach((subMap, catName) => {
            const hasSub = [...subMap.keys()].some(k => k !== "");
            const subGroups: SubNode[] = [];
            subMap.forEach((diffMap, subName) => {
                const diffs: DiffNode[] = [];
                diffMap.forEach((count, diff) => diffs.push({ difficulty: diff, count }));
                diffs.sort((a, b) => a.difficulty.localeCompare(b.difficulty));
                subGroups.push({ name: subName, difficulties: diffs, expanded: true });
            });
            subGroups.sort((a, b) => a.name.localeCompare(b.name));
            nodes.push({ name: catName, hasSubCategories: hasSub, subGroups, difficulties: [], expanded: true });
        });
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        return nodes;
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [res, configRes] = await Promise.all([
                fetch(`${API_BASE}/api/admin/questions?limit=2000`, { headers: authHeaders() }),
                fetch(`${API_BASE}/api/admin/questions/config`, { headers: authHeaders() })
            ]);

            const data = await res.json();
            const configData = await configRes.json();
            const qs: Question[] = data.questions || [];

            const discoveryTree = buildTree(qs);

            if (configData.structure && configData.structure.categories?.length > 0) {
                const persistentTree: CategoryNode[] = configData.structure.categories.map((cat: any) => ({
                    name: cat.name,
                    hasSubCategories: cat.has_sub_categories,
                    difficulties: cat.difficulties || [],
                    subGroups: cat.has_sub_categories ? cat.sub_categories.map((sub: any) => ({
                        name: sub.name,
                        difficulties: (sub.difficulties || []).map((d: any) => ({
                            difficulty: typeof d === "string" ? d : d.difficulty,
                            count: 0,
                            audio_url: d.audio_url
                        })),
                        audio_url: sub.audio_url,
                        expanded: sub.expanded !== undefined ? sub.expanded : true
                    })) : [{
                        name: "",
                        difficulties: (cat.difficulties || []).map((d: any) => ({
                            difficulty: typeof d === "string" ? d : d.difficulty,
                            count: 0,
                            audio_url: d.audio_url
                        })),
                        audio_url: cat.audio_url,
                        expanded: true
                    }],
                    expanded: cat.expanded !== undefined ? cat.expanded : false,
                    audio_url: cat.audio_url
                }));

                const merged = persistentTree.map(p => {
                    const discovered = discoveryTree.find(d => d.name === p.name);
                    if (!discovered) return p;
                    return {
                        ...p,
                        subGroups: p.subGroups.map(pSub => {
                            const dSub = discovered.subGroups.find(ds => ds.name === pSub.name);
                            if (!dSub) return pSub;
                            return {
                                ...pSub,
                                difficulties: pSub.difficulties.map(pDiff => {
                                    const dDiff = dSub.difficulties.find(dd => dd.difficulty === pDiff.difficulty);
                                    return dDiff ? { ...pDiff, count: dDiff.count } : pDiff;
                                })
                            };
                        })
                    };
                });
                dispatch(setTree(merged));
            } else {
                dispatch(setTree(discoveryTree));
            }
            setHasLoaded(true);
        } catch { showToast("Failed to load bank", "error"); }
        finally { setLoading(false); }
    }, [showToast, buildTree, dispatch]);

    useEffect(() => { load(); }, [load]);

    async function refresh() {
        const res = await fetch(`${API_BASE}/api/admin/questions`, { headers: authHeaders() });
        const data = await res.json();
        const qs: Question[] = data.questions || [];
        const freshDiscovery = buildTree(qs);
        dispatch(setTree(tree.map(p => {
            const discovered = freshDiscovery.find(d => d.name === p.name);
            if (!discovered) return p;
            return {
                ...p,
                subGroups: p.subGroups.map(pSub => {
                    const dSub = discovered.subGroups.find(ds => ds.name === pSub.name);
                    if (!dSub) return pSub;
                    return {
                        ...pSub,
                        difficulties: pSub.difficulties.map(pDiff => {
                            const dDiff = dSub.difficulties.find(dd => dd.difficulty === pDiff.difficulty);
                            return dDiff ? dDiff : pDiff;
                        })
                    };
                })
            };
        })));
    }

    useEffect(() => {
        if (!hasLoaded) return;
        const saveTimer = setTimeout(async () => {
            const config = {
                categories: tree.map(cat => ({
                    name: cat.name,
                    has_sub_categories: cat.hasSubCategories,
                    sub_categories: cat.hasSubCategories ? cat.subGroups.map(s => ({
                        name: s.name,
                        difficulties: s.difficulties.map(d => ({
                            difficulty: d.difficulty,
                            audio_url: d.audio_url
                        })),
                        audio_url: s.audio_url,
                        expanded: s.expanded ?? true
                    })) : [],
                    difficulties: !cat.hasSubCategories ? cat.subGroups[0]?.difficulties.map(d => ({
                        difficulty: d.difficulty,
                        audio_url: d.audio_url
                    })) || [] : [],
                    audio_url: cat.audio_url,
                    expanded: cat.expanded
                }))
            };
            try {
                await fetch(`${API_BASE}/api/admin/questions/structure`, {
                    method: "POST",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify(config)
                });
            } catch (err) { console.error("Failed to auto-save structure", err); }
        }, 2000);
        return () => clearTimeout(saveTimer);
    }, [tree, hasLoaded]);

    function addCategory() {
        const name = addCatName.trim();
        if (!name) {
            showToast("Please enter a category name", "error");
            return;
        }
        if (tree.find(c => c.name.toLowerCase() === name.toLowerCase())) {
            showToast("Category already exists", "error"); return;
        }
        dispatch(setTree([...tree, {
            name,
            hasSubCategories: false,
            subGroups: [{ name: "", difficulties: [], expanded: true }],
            difficulties: [],
            expanded: true,
        }]));
        setAddCatName("");
    }

    /* select a leaf → load its questions */
    async function selectSlot(cat: string, sub: string, diff: string) {
        dispatch(setActiveSlot({ category: cat, sub_category: sub, difficulty: diff }));
        setLoadingQ(true);
        setShowImport(false);
        setSearch("");
        setPage(1);
        try {
            const p = new URLSearchParams({ category: cat, difficulty: diff, page: "1", limit: "20" });
            if (sub) p.set("sub_category", sub);
            const res = await fetch(`${API_BASE}/api/admin/questions?${p}`, { headers: authHeaders() });
            const d = await res.json();
            const firstPageQuestions = mergeUniqueQuestions([], d.questions || []);
            setQuestions(firstPageQuestions);
            setTotalCount(d.total || 0);
            setHasMore(firstPageQuestions.length < (d.total || 0));
        } catch { showToast("Failed to load questions", "error"); }
        finally { setLoadingQ(false); }
    }

    async function handleCSVUpload(file: File) {
        if (!active) return;
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const p = new URLSearchParams({ category: active.category, difficulty: active.difficulty });
            if (active.sub_category) p.set("sub_category", active.sub_category);

            const res = await fetch(`${API_BASE}/api/admin/questions/upload-csv?${p}`, {
                method: "POST",
                headers: authHeaders(),
                body: formData
            });

            const d = await res.json();
            if (d.imported_count > 0) {
                const skippedCount = Number(d.skipped_count || 0);
                if (skippedCount > 0) {
                    const warningSuffix = Array.isArray(d.warnings) && d.warnings.length > 0
                        ? ` ${d.warnings[0]}`
                        : "";
                    showToast(`Imported ${d.imported_count}, skipped ${skippedCount}.${warningSuffix}`, "info");
                } else {
                    showToast(`Success! Imported ${d.imported_count} questions.`, "success");
                }
                await load();
                await selectSlot(active.category, active.sub_category, active.difficulty);
                setViewMode("list");
            } else {
                const skippedCount = Number(d.skipped_count || 0);
                const skippedMessage = skippedCount > 0 ? ` ${skippedCount} row(s) were skipped.` : "";
                showToast(d.error || `No questions imported.${skippedMessage} Check CSV format.`, "error");
            }
        } catch { showToast("Failed to upload CSV", "error"); }
        finally { setImporting(false); setIsDragging(false); }
    }

    /* Drag & Drop handlers */
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type === "text/csv") {
            handleCSVUpload(file);
        } else {
            showToast("Please drop a valid CSV file", "error");
        }
    };

    const loadMore = useCallback(async () => {
        if (!active || loadingMore || !hasMore) return;

        setLoadingMore(true);
        const nextPage = page + 1;
        try {
            const p = new URLSearchParams({
                category: active.category,
                difficulty: active.difficulty,
                page: nextPage.toString(),
                limit: "20"
            });
            if (active.sub_category) p.set("sub_category", active.sub_category);

            const res = await fetch(`${API_BASE}/api/admin/questions?${p}`, { headers: authHeaders() });
            const d = await res.json();
            const newQs = d.questions || [];
            const mergedQuestions = mergeUniqueQuestions(questions, newQs);
            const appendedCount = mergedQuestions.length - questions.length;

            if (newQs.length > 0) {
                setQuestions(mergedQuestions);
                setPage(nextPage);
            }

            // Check if we have more based on total items
            setHasMore(appendedCount > 0 && mergedQuestions.length < (d.total || 0));

        } catch (err) {
            console.error("Load more failed:", err);
            showToast("Failed to load more questions", "error");
        } finally {
            setLoadingMore(false);
        }
    }, [active, hasMore, loadingMore, page, questions, showToast]);

    const maybeLoadMore = useCallback((container?: HTMLDivElement | null) => {
        if (!container || viewMode !== "list" || !hasMore || loadingMore || loadingQ) {
            return;
        }

        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom <= 240) {
            loadMore();
        }
    }, [hasMore, loadMore, loadingMore, loadingQ, viewMode]);

    const handleWorkspaceScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        maybeLoadMore(e.currentTarget);
    }, [maybeLoadMore]);

    useEffect(() => {
        const container = workspaceRef.current;
        if (!container) return;

        const timer = window.setTimeout(() => {
            maybeLoadMore(container);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [questions.length, hasMore, loadingQ, loadingMore, maybeLoadMore, viewMode]);

    async function confirmDeleteQuestion() {
        if (!questionToDelete) return;
        try {
            await fetch(`${API_BASE}/api/admin/questions/${questionToDelete}`, { method: "DELETE", headers: authHeaders() });
            setQuestions(p => p.filter(q => q.id !== questionToDelete));
            await refresh();
            showToast("Deleted", "success");
        } catch { showToast("Failed to delete", "error"); }
        finally {
            setShowDeleteQuestionModal(false);
            setQuestionToDelete(null);
        }
    }

    async function fetchAllQuestionsForSlot(category: string, subCategory: string, difficulty: string): Promise<Question[]> {
        const allQuestions: Question[] = [];
        let currentPage = 1;
        const limit = 200;

        while (true) {
            const params = new URLSearchParams({
                category,
                difficulty,
                page: currentPage.toString(),
                limit: limit.toString(),
            });
            if (subCategory) {
                params.set("sub_category", subCategory);
            }

            const res = await fetch(`${API_BASE}/api/admin/questions?${params}`, { headers: authHeaders() });
            if (!res.ok) {
                throw new Error("Failed to load questions for this level");
            }

            const data = await res.json();
            const batch: Question[] = data.questions || [];
            allQuestions.push(...batch);

            if (batch.length === 0 || allQuestions.length >= Number(data.total || 0)) {
                break;
            }

            currentPage += 1;
        }

        return allQuestions;
    }

    async function deleteQuestionsIndividually(questionsToDelete: Question[]): Promise<number> {
        let deletedCount = 0;

        for (const question of questionsToDelete) {
            const res = await fetch(`${API_BASE}/api/admin/questions/${question.id}`, {
                method: "DELETE",
                headers: authHeaders(),
            });

            if (!res.ok) {
                throw new Error("Failed to delete one or more questions");
            }

            deletedCount += 1;
        }

        return deletedCount;
    }

    async function confirmDeleteDifficulty() {
        if (!difficultyToDelete) return;

        const isDeletingActiveSlot =
            active?.category === difficultyToDelete.category &&
            active?.sub_category === difficultyToDelete.sub_category &&
            active?.difficulty === difficultyToDelete.difficulty;

        try {
            setDeletingDifficulty(true);

            const params = new URLSearchParams({
                category: difficultyToDelete.category,
                difficulty: difficultyToDelete.difficulty,
            });
            if (difficultyToDelete.sub_category) {
                params.set("sub_category", difficultyToDelete.sub_category);
            }

            let deletedCount = 0;

            try {
                const res = await fetch(`${API_BASE}/api/admin/questions?${params}`, {
                    method: "DELETE",
                    headers: authHeaders(),
                });

                if (!res.ok) {
                    throw new Error("Bulk delete unavailable");
                }

                const data = await res.json().catch(() => ({}));
                deletedCount = Number(data.deleted_count || 0);
            } catch {
                const questionsForSlot = await fetchAllQuestionsForSlot(
                    difficultyToDelete.category,
                    difficultyToDelete.sub_category,
                    difficultyToDelete.difficulty
                );
                deletedCount = await deleteQuestionsIndividually(questionsForSlot);
            }

            dispatch(removeDifficultyAction({
                catIdx: difficultyToDelete.catIdx,
                subIdx: difficultyToDelete.subIdx,
                diffIdx: difficultyToDelete.diffIdx,
            }));

            if (isDeletingActiveSlot) {
                setQuestions([]);
                setTotalCount(0);
                setHasMore(false);
                setPage(1);
                setSearch("");
                setShowImport(false);
            }

            showToast(
                deletedCount > 0
                    ? `Deleted ${deletedCount} question${deletedCount === 1 ? "" : "s"} from ${difficultyToDelete.difficulty}`
                    : `${difficultyToDelete.difficulty} removed. No stored questions were found.`,
                "success"
            );
        } catch {
            showToast("Failed to delete level questions", "error");
        } finally {
            setDeletingDifficulty(false);
            setDifficultyToDelete(null);
        }
    }

    async function handleEditSave() {
        if (!editingQ || !editingQ.text.trim()) return;

        const trimmedText = editingQ.text.trim();
        let payload: Question;

        if (editingQ.type === "MCQ") {
            const rawOptions = trimTrailingEmptyOptions(editingQ.options);

            if (rawOptions.length < 2) {
                showToast("Please provide at least two answer options", "error");
                return;
            }

            if (rawOptions.some(option => !option)) {
                showToast("Please remove empty gaps between answer options", "error");
                return;
            }

            const resolvedAnswer = resolveMcqAnswerText(editingQ.correct_answer, rawOptions);
            if (!resolvedAnswer) {
                showToast("Please choose the correct answer", "error");
                return;
            }

            if (!rawOptions.includes(resolvedAnswer)) {
                showToast("Correct answer must match one of the options", "error");
                return;
            }

            payload = {
                ...editingQ,
                text: trimmedText,
                passage_title: editingQ.passage_title?.trim() || "",
                passage_text: editingQ.passage_text?.trim() || "",
                options: rawOptions,
                correct_answer: resolvedAnswer,
            };
        } else {
            payload = {
                ...editingQ,
                text: trimmedText,
                passage_title: editingQ.passage_title?.trim() || "",
                passage_text: editingQ.passage_text?.trim() || "",
                options: [],
                correct_answer: (editingQ.correct_answer || "").trim(),
            };
        }

        try {
            setImporting(true);
            const res = await fetch(`${API_BASE}/api/admin/questions/${editingQ.id}`, {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Updated successfully", "success");
                setEditingQ(null);
                await selectSlot(active!.category, active!.sub_category, active!.difficulty);
            } else {
                showToast("Failed to update", "error");
            }
        } catch { showToast("Error updating question", "error"); }
        finally { setImporting(false); }
    }

    async function handleImportForm() {
        if (!active || !formQ.text.trim()) { showToast("Question text required", "error"); return; }
        setImporting(true);
        try {
            let nextOptions: string[] = [];
            let nextAnswer = "";

            if (formQ.type === "MCQ") {
                nextOptions = trimTrailingEmptyOptions(formQ.options);

                if (nextOptions.length < 2) {
                    showToast("Please provide at least two answer options", "error");
                    return;
                }

                if (nextOptions.some(option => !option)) {
                    showToast("Please remove empty gaps between answer options", "error");
                    return;
                }

                nextAnswer = resolveMcqAnswerText(formQ.correct_answer, nextOptions);
                if (!nextAnswer) {
                    showToast("Please choose the correct answer", "error");
                    return;
                }
            }

            const payload = {
                questions: [{
                    ...formQ,
                    category: active.category,
                    sub_category: active.sub_category,
                    difficulty: active.difficulty,
                    options: formQ.type === "MCQ" ? nextOptions : [],
                    correct_answer: formQ.type === "MCQ" ? nextAnswer : "",
                }]
            };
            const res = await fetch(`${API_BASE}/api/admin/questions/import`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await res.json();
            if (d.imported_count > 0) {
                showToast("Added!", "success");
                setFormQ({ text: "", type: "MCQ", options: ["", ""], correct_answer: "A" });
                await selectSlot(active.category, active.sub_category, active.difficulty);
                setViewMode("list");
            }
        } catch { showToast("Failed", "error"); }
        finally { setImporting(false); }
    }

    async function handleImportJSON() {
        if (!active) return;
        setImporting(true);
        try {
            let parsed: ImportQuestion[];
            try { parsed = JSON.parse(jsonText); } catch { showToast("Invalid JSON", "error"); return; }
            const payload = { questions: parsed.map(q => ({ ...q, category: active.category, sub_category: active.sub_category, difficulty: active.difficulty })) };
            const res = await fetch(`${API_BASE}/api/admin/questions/import`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await res.json();
            showToast(`Imported ${d.imported_count}!`, "success");
            setJsonText(""); setShowImport(false);
            await selectSlot(active.category, active.sub_category, active.difficulty);
            setViewMode("list");
        } catch { showToast("Import failed", "error"); }
        finally { setImporting(false); }
    }

    const filtered = mergeUniqueQuestions([], questions).filter(q => {
        if (!search) return true;

        const needle = search.toLowerCase();
        return (
            q.text.toLowerCase().includes(needle) ||
            (q.passage_title || "").toLowerCase().includes(needle) ||
            (q.passage_text || "").toLowerCase().includes(needle)
        );
    });
    const formMcqOptions = formQ.type === "MCQ" ? ensureMinimumMcqOptionRows(formQ.options) : [];
    const editableMcqOptions = editingQ?.type === "MCQ" ? ensureMinimumMcqOptionRows(editingQ.options) : [];

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
    if (!isAuthenticated || user?.role !== "interviewer") { router.push("/login"); return null; }

    return (
        <div className="h-screen bg-white text-slate-900 flex flex-col overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                        <BookOpen size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Exam Sheet</h1>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Master Repository</p>
                    </div>
                </div>
                <button onClick={() => { load(); }} className="flex items-center gap-2 text-sm text-indigo-400 font-bold hover:text-indigo-300 transition-colors">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* ───── LEFT: Selection Stack ───── */}
                <div className="w-80 border-r border-slate-200  bg-white  backdrop-blur-sm flex flex-col overflow-hidden relative z-10">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading && <div className="flex justify-center py-10"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-indigo-600" /></div>}

                        {tree.map((cat, ci) => (
                            <CategoryBlock key={ci} cat={cat} catIdx={ci}
                                active={active}
                                onToggle={() => dispatch(setExpanded({ catIdx: ci, expanded: !cat.expanded }))}
                                onToggleSub={(si, expanded) => dispatch(setSubExpanded({ catIdx: ci, subIdx: si, expanded }))}
                                onRemoveCat={() => dispatch(removeCategoryAction(ci))}
                                onRenameCat={(name) => dispatch(renameCategoryAction({ catIdx: ci, newName: name }))}
                                onHasSub={(has) => dispatch(toggleHasSubAction({ catIdx: ci, has }))}
                                onAddSub={(subName) => dispatch(addSubCategoryAction({ catIdx: ci, subName }))}
                                onRemoveSub={(si) => dispatch(removeSubCategoryAction({ catIdx: ci, subIdx: si }))}
                                onRenameSub={(si, newName) => dispatch(renameSubCategoryAction({ catIdx: ci, subIdx: si, newName }))}
                                onAddDiff={(si, diff) => dispatch(addDifficultyAction({ catIdx: ci, subIdx: si, diff }))}
                                onRemoveDiff={(si, di) => {
                                    const sub = cat.subGroups[si];
                                    const diff = sub?.difficulties[di];
                                    if (!sub || !diff) return;

                                    setDifficultyToDelete({
                                        catIdx: ci,
                                        subIdx: si,
                                        diffIdx: di,
                                        category: cat.name,
                                        sub_category: sub.name,
                                        difficulty: diff.difficulty,
                                        questionCount: diff.count,
                                    });
                                }}
                                onSelect={(s, d) => selectSlot(cat.name, s, d)}
                            />
                        ))}

                        <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-3xl relative">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-4">New Category</p>
                            <div className="relative flex items-center bg-white border border-slate-100 rounded-2xl p-1 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all overflow-hidden">
                                <input type="text" value={addCatName} onChange={e => setAddCatName(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addCategory()}
                                    className="flex-1 min-w-0 px-4 py-2.5 text-sm bg-transparent border-none placeholder:text-slate-300 font-bold text-slate-900 outline-none"
                                    placeholder="e.g. Programming" />
                                <button onClick={addCategory} className="shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center">
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ───── RIGHT: Workspace ───── */}
                <div ref={workspaceRef} onScroll={handleWorkspaceScroll} className="flex-1 overflow-y-auto bg-white">
                    {!active ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                            <div className="w-24 h-24 bg-white  rounded-[32px] border border-slate-200 flex items-center justify-center mb-8 shadow-sm">
                                <BookOpen size={48} className="text-slate-800" />
                            </div>
                            <h2 className="text-2xl font-bold text-foreground mb-3">Begin Your Collection</h2>
                            <p className="text-slate-600  font-medium">
                                Select a category or difficulty level from the sidebar to start adding and managing your assessment questions.
                            </p>
                        </div>
                    ) : (
                        <div className="min-h-full px-12 py-12">
                            {/* Workspace Header */}
                            <div className="flex items-center justify-between mb-16 px-2">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-black tracking-widest uppercase">
                                            {active.category}
                                        </div>
                                        {active.sub_category && (
                                            <>
                                                <ChevronRight size={14} className="text-slate-800" />
                                                <div className="px-3 py-1 bg-white  text-slate-500  border border-slate-200 rounded-full text-[10px] font-black tracking-widest uppercase">
                                                    {active.sub_category}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <h2 className="text-5xl font-black text-foreground tracking-tighter">
                                            {active.difficulty ? `${active.difficulty} Questions` : "General Bank"}
                                        </h2>
                                        {totalCount > 0 && (
                                            <div className="px-4 py-1.5 bg-white  text-slate-500  rounded-full text-xs font-black tracking-widest uppercase mt-2 border border-slate-200">
                                                {totalCount} Total
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex bg-white  p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                    <button
                                        onClick={() => setViewMode("upload")}
                                        className={`px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 ${viewMode === "upload" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"}`}
                                    >
                                        <Upload size={16} /> Upload Hub
                                    </button>
                                    <button
                                        onClick={() => setViewMode("list")}
                                        className={`px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-3 ${viewMode === "list" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"}`}
                                    >
                                        <LayoutList size={16} /> List View
                                    </button>
                                </div>
                            </div>

                            {viewMode === "upload" ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    {/* CSV Upload Card */}
                                    <div className="group bg-white  border border-slate-200 rounded-[40px] p-10 hover:border-indigo-500/50 transition-all hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer relative overflow-hidden" onClick={() => csvInputRef.current?.click()}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
                                        <div className="w-16 h-16 bg-white  rounded-2xl flex items-center justify-center text-indigo-400 mb-8 border border-slate-200  group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-foreground mb-4 tracking-tight">CSV Batch Upload</h3>
                                        <p className="text-slate-600  font-medium mb-8">
                                            Swiftly import hundreds of questions using our optimized CSV template.
                                        </p>
                                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
                                            Start Upload <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                    {/* JSON Upload Card */}
                                    <div className="group bg-white  border border-slate-200 rounded-[40px] p-10 hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/10 cursor-pointer relative overflow-hidden" onClick={() => { setImportMode("json"); setShowImport(true); }}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-purple-500/10 transition-colors" />
                                        <div className="w-16 h-16 bg-white  rounded-2xl flex items-center justify-center text-purple-400 mb-8 border border-slate-200  group-hover:scale-110 transition-transform">
                                            <Terminal size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-foreground mb-4 tracking-tight">JSON Structure</h3>
                                        <p className="text-slate-600  font-medium mb-8">
                                            Import complex question structures using high-fidelity JSON data.
                                        </p>
                                        <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-widest">
                                            Open Editor <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                    {/* Manual Form Card */}
                                    <div className="group bg-white  border border-slate-200 rounded-[40px] p-10 hover:border-emerald-500/50 transition-all hover:shadow-2xl hover:shadow-emerald-500/10 cursor-pointer relative overflow-hidden" onClick={() => { setImportMode("form"); setShowImport(true); }}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
                                        <div className="w-16 h-16 bg-white  rounded-2xl flex items-center justify-center text-emerald-400 mb-8 border border-slate-200  group-hover:scale-110 transition-transform">
                                            <Edit2 size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-foreground mb-4 tracking-tight">Manual Entry</h3>
                                        <p className="text-slate-600  font-medium mb-8">
                                            Craft individual questions with precision using our interactive form.
                                        </p>
                                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest">
                                            Create Now <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-12">
                                    <div className="relative group">
                                        <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="Explore questions in this bank..."
                                            className="w-full pl-16 pr-8 py-5 text-lg font-bold bg-white border border-slate-100 rounded-[32px] focus:outline-none focus:border-indigo-500/50 transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                        />
                                    </div>
                                    <div className="space-y-6">
                                        {/* Audio Config */}
                                        <AudioConfiguration
                                            cat={tree.find(c => c.name === active.category)}
                                            onSaveAudio={(url) => {
                                                const ci = tree.findIndex(c => c.name === active.category);
                                                const si = active.sub_category ? tree[ci].subGroups.findIndex(s => s.name === active.sub_category) : undefined;
                                                const sub = si !== undefined && si !== -1 ? tree[ci].subGroups[si] : (si === -1 ? undefined : tree[ci].subGroups[0]);
                                                const di = sub?.difficulties.findIndex(d => d.difficulty === active.difficulty);

                                                dispatch(setAudioAction({
                                                    catIdx: ci,
                                                    subIdx: si === -1 ? undefined : si,
                                                    diffIdx: di === -1 ? undefined : di,
                                                    url
                                                }));
                                            }}
                                        />

                                        {/* Question List Header */}
                                        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-900">
                                            <div className="flex items-center gap-3">
                                                <Filter size={16} className="text-slate-600" />
                                                <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Filter Results</span>
                                            </div>
                                            <button className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 transition-colors tracking-widest">
                                                Refresh Data
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {loadingQ ? (
                                                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                                                    <RefreshCw className="animate-spin w-8 h-8 mb-4 text-indigo-500" />
                                                    <p className="font-medium">Loading questions...</p>
                                                </div>
                                            ) : filtered.length === 0 ? (
                                                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                                                    <Search className="w-12 h-12 mb-4 text-slate-200" />
                                                    <p className="font-bold text-slate-500 text-lg">No questions found</p>
                                                    <p className="text-sm mt-1">Try answering a different category or clear your search.</p>
                                                </div>
                                            ) : (
                                                filtered.map((q, idx) => (
                                                    <div key={q.id} className="group bg-white  border border-slate-200 rounded-[32px] p-8 hover:border-indigo-500/30 transition-all shadow-sm">
                                                        <div className="flex justify-between items-start gap-10">
                                                            <div className="space-y-4 flex-1">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest leading-none">
                                                                        {q.type}
                                                                    </div>
                                                                    <span className="text-xs font-bold text-slate-600">ID: {q.id.slice(-8)}</span>
                                                                </div>
                                                                {q.passage_text && (
                                                                    <div className="p-5 rounded-[24px] border border-amber-500/15 bg-amber-500/5">
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">
                                                                            {q.passage_title || "Reading Passage"}
                                                                        </p>
                                                                        <p className="text-sm font-medium text-slate-600 whitespace-pre-wrap leading-relaxed">
                                                                            {q.passage_text}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                <p className="text-xl font-bold text-foreground leading-snug">{q.text}</p>
                                                                {(() => {
                                                                    const visibleOptions = getVisibleMcqOptions(q.options);
                                                                    const correctAnswerText = resolveMcqAnswerText(q.correct_answer, trimTrailingEmptyOptions(q.options));

                                                                    if (visibleOptions.length === 0) {
                                                                        return null;
                                                                    }

                                                                    return (
                                                                        <div className="grid grid-cols-2 gap-3 mt-4">
                                                                            {visibleOptions.map((opt, i) => {
                                                                                const isCorrect = opt === correctAnswerText;
                                                                                return (
                                                                                    <div key={i} className={`p-4 rounded-xl border text-sm font-bold flex items-center gap-3 ${isCorrect ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-white  border-slate-200  text-slate-500"}`}>
                                                                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${isCorrect ? "bg-emerald-500 text-white" : "bg-slate-50  text-slate-600"}`}>
                                                                                            {optionLetters[i]}
                                                                                        </div>
                                                                                        {opt}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {q.type !== "MCQ" && q.correct_answer && (
                                                                    <div className="mt-4 p-4 rounded-2xl border border-indigo-500/15 bg-indigo-500/5">
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Correct Answer</p>
                                                                        <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{q.correct_answer}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => setEditingQ(createEditableQuestion(q))} className="p-3 bg-white  text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-200  rounded-xl transition-all"><Edit2 size={16} /></button>
                                                                <button onClick={() => { setQuestionToDelete(q.id); setShowDeleteQuestionModal(true); }} className="p-3 bg-white  text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-200  rounded-xl transition-all"><Trash2 size={16} /></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            {hasMore && <div className="py-10 text-center"><RefreshCw className="animate-spin mx-auto text-indigo-600" /></div>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals for Import and Edit */}
            {showImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-md">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100">
                        <div className="flex items-center justify-between bg-white border-slate-100 shadow-sm p-8 border-b border-slate-100">
                            <h2 className="text-xl font-black text-slate-900">{importMode === "form" ? "Manual Question Entry" : "Bulk JSON Import"}</h2>
                            <button onClick={() => setShowImport(false)} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="p-10 max-h-[80vh] overflow-y-auto">
                            {importMode === "form" ? (
                                <div className="space-y-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Question Type</label>
                                        <select
                                            value={formQ.type}
                                            onChange={e => {
                                                const nextType = e.target.value;
                                                setFormQ(p => ({
                                                    ...p,
                                                    type: nextType,
                                                    options: nextType === "MCQ" ? createEditableMcqOptions(p.options) : p.options,
                                                    correct_answer: nextType === "MCQ" ? getMcqAnswerLetter(p.correct_answer, p.options) : p.correct_answer,
                                                }));
                                            }}
                                            className="w-full p-4 bg-white  border border-slate-200  rounded-2xl font-bold text-foreground focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none appearance-none"
                                        >
                                            <option value="MCQ">Multiple Choice (MCQ)</option>
                                            <option value="SUBJECTIVE">Subjective / Coding</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Question Content</label>
                                        <textarea value={formQ.text} onChange={e => setFormQ(p => ({ ...p, text: e.target.value }))} rows={4} className="w-full p-5 bg-white  border border-slate-200  rounded-3xl font-bold text-foreground placeholder:text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" placeholder="Enter the technical question here…" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Passage Title (Optional)</label>
                                        <input
                                            type="text"
                                            value={formQ.passage_title || ""}
                                            onChange={e => setFormQ(p => ({ ...p, passage_title: e.target.value }))}
                                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-foreground placeholder:text-slate-700 outline-none focus:border-indigo-500/30 transition-all"
                                            placeholder="e.g. Community Library Announcement"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Passage Text (Optional)</label>
                                        <textarea
                                            value={formQ.passage_text || ""}
                                            onChange={e => setFormQ(p => ({ ...p, passage_text: e.target.value }))}
                                            rows={5}
                                            className="w-full p-5 bg-white border border-slate-200 rounded-3xl font-medium text-foreground placeholder:text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                            placeholder="Paste the shared reading passage here if this question belongs to one."
                                        />
                                    </div>
                                    {formQ.type === "MCQ" && (
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Options & Answer</label>
                                            <div className="grid grid-cols-1 gap-3">
                                                {formMcqOptions.map((opt, oi) => (
                                                    <div key={oi} className="relative group">
                                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-50  rounded-lg flex items-center justify-center text-xs font-black text-slate-500 border border-slate-200  group-focus-within:border-indigo-500/50 group-focus-within:text-indigo-400 transition-all">
                                                            {optionLetters[oi]}
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={opt}
                                                            onChange={e => {
                                                                const o = [...formMcqOptions];
                                                                o[oi] = e.target.value;
                                                                setFormQ(p => ({ ...p, options: o }));
                                                            }}
                                                            className="w-full pl-16 pr-14 py-4 bg-white  border border-slate-200  rounded-2xl text-foreground font-bold placeholder:text-slate-700 outline-none focus:border-indigo-500/30 transition-all"
                                                            placeholder={`Alternative ${optionLetters[oi]}…`}
                                                        />
                                                        {formMcqOptions.length > 2 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const next = removeMcqOptionAt(formMcqOptions, formQ.correct_answer, oi);
                                                                    setFormQ(p => ({ ...p, options: next.options, correct_answer: next.correctAnswer }));
                                                                }}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {formMcqOptions.length < optionLetters.length && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormQ(p => ({ ...p, options: addMcqOptionRow(formMcqOptions) }))}
                                                    className="text-xs font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-400 transition-colors"
                                                >
                                                    + Add Option
                                                </button>
                                            )}
                                            <div className="flex justify-between items-center bg-white  p-2 rounded-2xl border border-slate-200 ">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Correct Key:</span>
                                                <div className="flex gap-2">
                                                    {formMcqOptions.map((_, idx) => {
                                                        const letter = optionLetters[idx];
                                                        return (
                                                            <button key={letter} onClick={() => setFormQ(p => ({ ...p, correct_answer: letter }))} className={`w-12 h-12 rounded-xl font-black transition-all ${formQ.correct_answer === letter ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:text-slate-400"}`}>{letter}</button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <p className="text-xs font-bold text-slate-500 px-1">
                                                Selected answer: {resolveMcqAnswerText(formQ.correct_answer, formMcqOptions) || "Choose an option"}
                                            </p>
                                        </div>
                                    )}
                                    <button onClick={handleImportForm} disabled={importing} className="w-full py-5 bg-indigo-600 text-white rounded-[32px] font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50 mt-4">
                                        {importing ? "Processing…" : "Add to Repository"}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                                        <p className="text-xs text-indigo-400 leading-relaxed font-medium">
                                            Paste a JSON array of question objects. Ensure each object follows the schema: <code>{"{ text, type, options?, correct_answer?, passage_title?, passage_text? }"}</code>
                                        </p>
                                    </div>
                                    <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={12} className="w-full p-6 bg-white  text-indigo-400 font-mono text-sm rounded-3xl border border-slate-200  focus:border-indigo-500/50 outline-none transition-all" placeholder="[ { 'text': '...' }, ... ]" />
                                    <button onClick={handleImportJSON} disabled={importing} className="w-full py-5 bg-indigo-600 text-white rounded-[32px] font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-500 transition-all">{importing ? "Importing…" : "Commit JSON Batch"}</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingQ && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-md">
                    <div className="bg-white rounded-[40px] shadow-sm w-full max-w-2xl overflow-hidden border border-slate-100">
                        <div className="flex items-center justify-between p-8 border-b border-slate-100 bg-white">
                            <h2 className="text-xl font-black text-slate-900">Refine Question</h2>
                            <button onClick={() => setEditingQ(null)} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="p-10 max-h-[80vh] overflow-y-auto space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Question Type</label>
                                <select
                                    value={editingQ.type}
                                    onChange={e => {
                                        const nextType = e.target.value;
                                        if (nextType === "MCQ") {
                                            const nextOptions = createEditableMcqOptions(editingQ.options);
                                            setEditingQ({
                                                ...editingQ,
                                                type: nextType,
                                                options: nextOptions,
                                                correct_answer: getMcqAnswerLetter(editingQ.correct_answer, nextOptions),
                                            });
                                            return;
                                        }

                                        setEditingQ({
                                            ...editingQ,
                                            type: nextType,
                                            options: undefined,
                                            correct_answer: editingQ.type === "MCQ"
                                                ? resolveMcqAnswerText(editingQ.correct_answer, editingQ.options)
                                                : (editingQ.correct_answer || ""),
                                        });
                                    }}
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-foreground focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none appearance-none"
                                >
                                    <option value="MCQ">Multiple Choice (MCQ)</option>
                                    <option value="SUBJECTIVE">Subjective</option>
                                    <option value="CODING">Coding</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Question content</label>
                                <textarea
                                    value={editingQ.text}
                                    onChange={e => setEditingQ({ ...editingQ, text: e.target.value })}
                                    rows={4}
                                    className="w-full p-6 bg-white border border-slate-200 rounded-3xl font-bold text-foreground placeholder:text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Passage Title (Optional)</label>
                                <input
                                    type="text"
                                    value={editingQ.passage_title || ""}
                                    onChange={e => setEditingQ({ ...editingQ, passage_title: e.target.value })}
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-foreground placeholder:text-slate-700 outline-none focus:border-indigo-500/30 transition-all"
                                    placeholder="e.g. Community Library Announcement"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Passage Text (Optional)</label>
                                <textarea
                                    value={editingQ.passage_text || ""}
                                    onChange={e => setEditingQ({ ...editingQ, passage_text: e.target.value })}
                                    rows={5}
                                    className="w-full p-5 bg-white border border-slate-200 rounded-3xl font-medium text-foreground placeholder:text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                    placeholder="Paste the shared reading passage here if this question belongs to one."
                                />
                            </div>

                            {editingQ.type === "MCQ" && (
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Options & Answer</label>
                                    <div className="grid grid-cols-1 gap-3">
                                        {editableMcqOptions.map((opt, oi) => (
                                            <div key={oi} className="relative group">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-xs font-black text-slate-500 border border-slate-200 group-focus-within:border-indigo-500/50 group-focus-within:text-indigo-400 transition-all">
                                                    {optionLetters[oi]}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={e => {
                                                        const o = [...editableMcqOptions];
                                                        o[oi] = e.target.value;
                                                        setEditingQ({ ...editingQ, options: o });
                                                    }}
                                                    className="w-full pl-16 pr-14 py-4 bg-white border border-slate-200 rounded-2xl text-foreground font-bold placeholder:text-slate-700 outline-none focus:border-indigo-500/30 transition-all"
                                                    placeholder={`Alternative ${optionLetters[oi]}…`}
                                                />
                                                {editableMcqOptions.length > 2 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const next = removeMcqOptionAt(editableMcqOptions, editingQ.correct_answer, oi);
                                                            setEditingQ({ ...editingQ, options: next.options, correct_answer: next.correctAnswer });
                                                        }}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {editableMcqOptions.length < optionLetters.length && (
                                        <button
                                            type="button"
                                            onClick={() => setEditingQ({ ...editingQ, options: addMcqOptionRow(editableMcqOptions) })}
                                            className="text-xs font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-400 transition-colors"
                                        >
                                            + Add Option
                                        </button>
                                    )}
                                    <div className="flex justify-between items-center bg-white p-2 rounded-2xl border border-slate-200">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">Correct Key:</span>
                                        <div className="flex gap-2">
                                            {editableMcqOptions.map((_, idx) => {
                                                const letter = optionLetters[idx];
                                                return (
                                                    <button
                                                        key={letter}
                                                        onClick={() => setEditingQ({ ...editingQ, correct_answer: letter })}
                                                        className={`w-12 h-12 rounded-xl font-black transition-all ${editingQ.correct_answer === letter ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:text-slate-400"}`}
                                                    >
                                                        {letter}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 px-1">
                                        Selected answer: {resolveMcqAnswerText(editingQ.correct_answer, editableMcqOptions) || "Choose an option"}
                                    </p>
                                </div>
                            )}

                            {editingQ.type !== "MCQ" && (
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Correct Option</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-xs font-black text-slate-500 border border-slate-200 group-focus-within:border-indigo-500/50 group-focus-within:text-indigo-400 transition-all">
                                            A
                                        </div>
                                        <input
                                            type="text"
                                            value={editingQ.correct_answer || ""}
                                            onChange={e => setEditingQ({ ...editingQ, correct_answer: e.target.value })}
                                            className="w-full pl-16 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-foreground font-bold placeholder:text-slate-700 outline-none focus:border-indigo-500/30 transition-all"
                                            placeholder="Enter the correct option..."
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 px-1">
                                        Selected option: {editingQ.correct_answer?.trim() || "Enter an option"}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button onClick={() => setEditingQ(null)} className="flex-1 py-5 bg-white text-slate-400 border border-slate-200 rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-colors">Abort Changes</button>
                                <button onClick={handleEditSave} disabled={importing} className="flex-1 py-5 bg-indigo-600 text-white rounded-[32px] font-black shadow-2xl shadow-indigo-600/30 hover:bg-indigo-500 transition-all active:scale-95">{importing ? "Syncing..." : "Apply Updates"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Remove Question Confirmation Modal */}
            <Modal
                isOpen={showDeleteQuestionModal}
                onClose={() => setShowDeleteQuestionModal(false)}
                title="Delete Question"
                footer={
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={() => setShowDeleteQuestionModal(false)}
                            className="flex-1 py-4 bg-white  text-slate-400 border border-slate-200  rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-colors"
                        >
                            Decline
                        </button>
                        <button
                            onClick={confirmDeleteQuestion}
                            className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
                        >
                            Confirm Deletion
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col items-center text-center gap-6 py-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center text-red-500 border border-red-500/20">
                        <Trash2 size={32} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-foreground font-bold text-lg">Destroy Question Record?</p>
                        <p className="text-slate-600  max-w-[280px]">
                            This will permanently purge the question from your technical repository. This sequence is irreversible.
                        </p>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={!!difficultyToDelete}
                onClose={() => !deletingDifficulty && setDifficultyToDelete(null)}
                title="Delete Level"
                footer={
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={() => setDifficultyToDelete(null)}
                            disabled={deletingDifficulty}
                            className="flex-1 py-4 bg-white text-slate-400 border border-slate-200 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            Keep Level
                        </button>
                        <button
                            onClick={confirmDeleteDifficulty}
                            disabled={deletingDifficulty}
                            className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors disabled:opacity-50"
                        >
                            {deletingDifficulty ? "Deleting..." : "Delete Level"}
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col items-center text-center gap-6 py-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center text-red-500 border border-red-500/20">
                        <AlertTriangle size={32} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-foreground font-bold text-lg">Remove {difficultyToDelete?.difficulty} and its questions?</p>
                        <p className="text-slate-600 max-w-[320px]">
                            This will permanently delete all questions stored under <strong>{difficultyToDelete?.category}{difficultyToDelete?.sub_category ? ` / ${difficultyToDelete.sub_category}` : ""} / {difficultyToDelete?.difficulty}</strong>.
                        </p>
                        <p className="text-xs font-bold uppercase tracking-widest text-red-500">
                            {difficultyToDelete?.questionCount || 0} question{difficultyToDelete?.questionCount === 1 ? "" : "s"} currently linked
                        </p>
                    </div>
                </div>
            </Modal>

            <input
                type="file"
                ref={csvInputRef}
                accept=".csv"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCSVUpload(file);
                    e.target.value = "";
                }}
                className="hidden"
            />
        </div>
    );
}

/* ── CategoryBlock component ── */
function CategoryBlock({ cat, catIdx, active, onToggle, onToggleSub, onRemoveCat, onRenameCat, onHasSub, onAddSub, onRemoveSub, onRenameSub, onAddDiff, onRemoveDiff, onSelect }: {
    cat: CategoryNode; catIdx: number; active: ActiveSlot | null;
    onToggle: () => void; onToggleSub: (subIdx: number, expanded: boolean) => void; onRemoveCat: () => void; onRenameCat: (name: string) => void;
    onHasSub: (v: boolean) => void;
    onAddSub: (n: string) => void; onRemoveSub: (subIdx: number) => void;
    onRenameSub: (subIdx: number, name: string) => void;
    onAddDiff: (subIdx: number, diff: string) => void;
    onRemoveDiff: (subIdx: number, diffIdx: number) => void;
    onSelect: (sub: string, diff: string) => void;
}) {
    const [newSub, setNewSub] = useState("");
    const [diffInputs, setDiffInputs] = useState<Record<number, string>>({});
    const { showToast } = useToast();

    const diffColor = (d: string) => {
        const l = d.toLowerCase();
        if (l === "easy") return "bg-green-100 text-green-700";
        if (l === "medium") return "bg-yellow-100 text-yellow-700";
        if (l === "hard") return "bg-red-100 text-red-700";
        return "bg-indigo-100 text-indigo-700";
    };

    function handleAddSub() {
        const trimmed = newSub.trim();
        if (!trimmed) {
            showToast("Please enter a subgroup name", "error");
            return;
        }
        onAddSub(trimmed);
        setNewSub("");
    }

    function handleAddDiff(subIdx: number) {
        const trimmed = (diffInputs[subIdx] || "").trim();
        if (!trimmed) {
            showToast("Please enter a level name", "error");
            return;
        }
        onAddDiff(subIdx, trimmed);
        setDiffInputs(p => ({ ...p, [subIdx]: "" }));
    }

    return (
        <div className="border border-slate-100 rounded-2xl bg-white shadow-sm">
            <div className={`px-5 py-4 cursor-pointer transition-all flex items-center justify-between rounded-t-2xl ${active?.category === cat.name && !active?.sub_category ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                onClick={() => { onSelect("", ""); if (!cat.expanded) onToggle(); }}>
                <div className="flex items-center gap-3 flex-1">
                    <ChevronRight size={16} className={`transition-transform duration-300 ${cat.expanded ? "rotate-90" : ""}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} />
                    <input
                        type="text"
                        value={cat.name}
                        onChange={e => onRenameCat(e.target.value)}
                        onBlur={e => onRenameCat(e.target.value.trim())}
                        onClick={e => e.stopPropagation()}
                        className="bg-transparent border-none font-bold text-sm w-full focus:ring-0 text-current placeholder:text-slate-600"
                    />
                </div>
                <button onClick={(e) => { e.stopPropagation(); onRemoveCat(); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
            </div>

            {cat.expanded && (
                <div className="p-5 bg-white  space-y-6">
                    <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Nested Subgroups?</span>
                        <div className="flex bg-slate-50 rounded-lg p-1">
                            <button onClick={() => onHasSub(false)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${!cat.hasSubCategories ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-400"}`}>No</button>
                            <button onClick={() => onHasSub(true)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${cat.hasSubCategories ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:text-slate-400"}`}>Yes</button>
                        </div>
                    </div>

                    {cat.hasSubCategories ? (
                        <div className="space-y-4">
                            {cat.subGroups.map((sg, si) => (
                                <div key={si} className="border border-slate-100 rounded-2xl p-5 bg-white shadow-sm hover:border-indigo-500/20 transition-all">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => onToggleSub(si, !(sg.expanded ?? true))}
                                                className="shrink-0 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                                            >
                                                <ChevronRight size={14} className={`transition-transform duration-300 ${(sg.expanded ?? true) ? "rotate-90" : ""}`} />
                                            </button>
                                            <Tag size={14} className="text-indigo-500" />
                                            <input
                                                type="text"
                                                value={sg.name}
                                                onChange={e => onRenameSub(si, e.target.value)}
                                                onBlur={e => onRenameSub(si, e.target.value.trim())}
                                                onClick={e => e.stopPropagation()}
                                                className="bg-transparent border-none text-sm font-bold focus:ring-0 w-full placeholder:text-slate-300 text-slate-900"
                                                placeholder="Sub-category…"
                                            />
                                        </div>
                                        <button onClick={() => onRemoveSub(si)} className="text-slate-400  hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                    {(sg.expanded ?? true) && (
                                        <>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {sg.difficulties.map((d, di) => (
                                                    <div key={di} className="relative group/diff">
                                                        <button onClick={() => onSelect(sg.name, d.difficulty)} className={`pl-3 pr-8 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active?.category === cat.name && active?.sub_category === sg.name && active?.difficulty === d.difficulty ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20" : "bg-slate-50  text-slate-400 border border-slate-200  hover:border-slate-700 hover:text-slate-300"}`}>
                                                            {d.difficulty} {d.count > 0 && <span className="opacity-50 ml-1">[{d.count}]</span>}
                                                        </button>
                                                        <button
                                                            onClick={() => onRemoveDiff(si, di)}
                                                            className={`absolute right-2 top-1/2 -translate-y-1/2 transition-colors ${active?.category === cat.name && active?.sub_category === sg.name && active?.difficulty === d.difficulty ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-red-400"}`}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <DifficultyAdder value={diffInputs[si] || ""} onChange={v => setDiffInputs(p => ({ ...p, [si]: v }))} onAdd={() => handleAddDiff(si)} />
                                        </>
                                    )}
                                </div>
                            ))}
                            <div className="relative flex items-center bg-slate-50/50 border border-slate-100 rounded-2xl p-1 transition-all focus-within:bg-white focus-within:shadow-sm overflow-hidden">
                                <input type="text" value={newSub} onChange={e => setNewSub(e.target.value)} className="flex-1 min-w-0 px-4 py-2.5 bg-transparent border-none font-bold text-slate-900 text-sm outline-none placeholder:text-slate-300" placeholder="New subgroup…" />
                                <button onClick={handleAddSub} className="shrink-0 w-9 h-9 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center shadow-sm"><Plus size={18} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="border border-slate-100 rounded-3xl p-6 bg-slate-50/30 shadow-inner">
                            <div className="flex flex-wrap gap-2 mb-4">
                                {cat.subGroups[0]?.difficulties.map((d, di) => (
                                    <div key={di} className="relative group/diff">
                                        <button onClick={() => onSelect("", d.difficulty)} className={`pl-3 pr-8 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active?.category === cat.name && !active?.sub_category && active?.difficulty === d.difficulty ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20" : "bg-slate-50  text-slate-400 border border-slate-200  hover:border-slate-700 hover:text-slate-300"}`}>
                                            {d.difficulty} {d.count > 0 && <span className="opacity-50 ml-1">[{d.count}]</span>}
                                        </button>
                                        <button
                                            onClick={() => onRemoveDiff(0, di)}
                                            className={`absolute right-2 top-1/2 -translate-y-1/2 transition-colors ${active?.category === cat.name && !active?.sub_category && active?.difficulty === d.difficulty ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-red-400"}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <DifficultyAdder value={diffInputs[0] || ""} onChange={v => setDiffInputs(p => ({ ...p, 0: v }))} onAdd={() => handleAddDiff(0)} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── AudioConfiguration component ── */
function AudioConfiguration({ cat, onSaveAudio }: {
    cat?: CategoryNode;
    onSaveAudio: (url: string) => void;
}) {
    const activeSlot = useSelector((state: RootState) => state.questionBank.active);
    const activeSub = activeSlot?.sub_category;
    const activeDiff = activeSlot?.difficulty;

    const subNode = activeSub ? cat?.subGroups.find(s => s.name === activeSub) : cat?.subGroups[0];
    const diffNode = activeDiff ? subNode?.difficulties.find(d => d.difficulty === activeDiff) : undefined;

    // Prioritize difficulty-level audio, then sub-category, then category
    const node = diffNode || subNode || cat;

    const [audioUrl, setAudioUrl] = useState(node?.audio_url || "");
    const [isEditing, setIsEditing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        setAudioUrl(node?.audio_url || "");
    }, [node]);

    if (!node) return null;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const fd = new FormData();
        fd.append("audio", file);
        try {
            const res = await fetch(`${API_BASE}/api/admin/audio-upload`, { method: "POST", headers: authHeaders(), body: fd });
            const data = await res.json();
            if (data.url) {
                onSaveAudio(data.url);
                showToast("Audio uploaded", "success");
            }
        } catch { showToast("Upload failed", "error"); }
        finally { setUploading(false); }
    };

    return (
        <div className="bg-white  rounded-[32px] p-8 border border-slate-200 shadow-sm relative overflow-hidden group/audio">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 group-hover/audio:bg-indigo-500/10 transition-colors" />

            <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white  border border-slate-200   rounded-2xl flex items-center justify-center text-indigo-500  shadow-inner group-hover/audio:scale-105 transition-transform"><Music size={28} /></div>
                    <div>
                        <h3 className="text-xl font-black text-foreground tracking-tight">Audio Asset Performance</h3>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mt-1">
                            Slot: {activeDiff ? `${activeDiff} ` : ""}{activeSub || cat?.name}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {node?.audio_url && (
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="w-12 h-12 flex items-center justify-center bg-white text-slate-500 rounded-xl hover:text-red-400 border border-slate-100 transition-all hover:bg-slate-50"
                            title="Purge Audio"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    <button onClick={() => setIsEditing(!isEditing)} className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isEditing ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-white text-slate-400 border border-slate-100 hover:border-slate-200 hover:text-slate-600"}`}>
                        {isEditing ? "Finalize" : "Config"}
                    </button>
                </div>
            </div>

            {isEditing ? (
                <div className="space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Universal Resource Locator (URL)</label>
                        <div className="flex gap-3">
                            <input type="text" value={audioUrl} onChange={e => { setAudioUrl(e.target.value); onSaveAudio(e.target.value); }} className="flex-1 p-4 bg-white  border border-slate-200   rounded-2xl placeholder:text-slate-300  font-bold text-foreground outline-none focus:border-indigo-500/50 transition-all" placeholder="https://storage.hireit.ai/..." />
                            <label className="cursor-pointer w-14 h-14 flex items-center justify-center bg-indigo-600 text-white rounded-2xl hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition-all active:scale-90 shrink-0">
                                <input type="file" className="hidden" accept="audio/*" onChange={handleUpload} disabled={uploading} />
                                {uploading ? <RefreshCw size={24} className="animate-spin" /> : <Upload size={24} />}
                            </label>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-6 bg-white/80   rounded-2xl border border-slate-200   flex items-center gap-6 relative z-10 backdrop-blur-sm group-hover/audio:border-indigo-500/20 transition-colors">
                    {node.audio_url ? (
                        <>
                            <div className="w-10 h-10 bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-600  border border-indigo-500/20"><Play size={16} /></div>
                            <audio src={node.audio_url.startsWith("http") ? node.audio_url : `${API_BASE}${node.audio_url}`} controls className="h-10 flex-1 opacity-70 hover:opacity-100 transition-opacity filter   invert-0" />
                        </>
                    ) : (
                        <div className="flex items-center gap-4 text-slate-600 py-2">
                            <AlertCircle size={20} />
                            <span className="text-xs font-black uppercase tracking-widest">No audio sequence defined for this level</span>
                        </div>
                    )}
                </div>
            )}

            {/* Remove Audio Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Purge Audio Sequence"
                footer={
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            className="flex-1 py-4 bg-white  text-slate-400 border border-slate-200  rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-colors"
                        >
                            Retain Asset
                        </button>
                        <button
                            onClick={() => {
                                onSaveAudio("");
                                setShowDeleteModal(false);
                                showToast("Audio configuration removed", "info");
                            }}
                            className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
                        >
                            Confirm Purge
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col items-center text-center gap-6 py-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center text-red-500 border border-red-500/20">
                        <Trash2 size={32} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-foreground font-bold text-lg">Remove Audio Sequence?</p>
                        <p className="text-slate-600  max-w-[280px]">
                            The audio configured for <strong>{activeDiff ? `${activeDiff} ` : ""}{activeSub || cat?.name}</strong> will be permanently detached.
                        </p>
                    </div>
                </div>
            </Modal>
        </div>
    );
}


function DifficultyAdder({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: () => void; }) {
    return (
        <div className="flex items-center bg-white border border-slate-100 rounded-xl p-1 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/5 transition-all mt-2 overflow-hidden">
            <input type="text" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} className="flex-1 min-w-0 px-3 py-2 text-xs bg-transparent border-none font-bold text-slate-900 outline-none placeholder:text-slate-300" placeholder="Level name..." />
            <button onClick={onAdd} className="shrink-0 w-8 h-8 bg-slate-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all border border-slate-100 flex items-center justify-center active:scale-95 shadow-sm shadow-indigo-600/5"><Plus size={14} /></button>
        </div>
    );
}
