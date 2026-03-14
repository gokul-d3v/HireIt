"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
    Plus, Trash2, BookOpen, ChevronRight, ChevronDown,
    Upload, Music, X, RefreshCw, AlertTriangle,
    CheckCircle, Filter, Download, Search, LayoutList,
    FileSpreadsheet, Terminal, Info, Layout, Layers, Tag, Edit2, ShieldAlert
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
}

interface DiffNode { difficulty: string; count: number; }

interface ImportQuestion {
    text: string; type: string;
    options: string[]; correct_answer: string; audio_url?: string;
}

function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
}

const optionLetters = ["A", "B", "C", "D"];

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
    const observerTarget = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);

    /* import panel */
    const [showImport, setShowImport] = useState(false);
    const [importMode, setImportMode] = useState<"form" | "json">("form");
    const [jsonText, setJsonText] = useState("");
    const [importing, setImporting] = useState(false);
    const [formQ, setFormQ] = useState<ImportQuestion>({ text: "", type: "MCQ", options: ["", "", "", ""], correct_answer: "A" });
    const [audioUploading, setAudioUploading] = useState(false);
    const audioRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [editingQ, setEditingQ] = useState<Question | null>(null);
    const [showDeleteQuestionModal, setShowDeleteQuestionModal] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);

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
                subGroups.push({ name: subName, difficulties: diffs });
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
                fetch(`${API_BASE}/api/admin/questions`, { headers: authHeaders() }),
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
                        audio_url: sub.audio_url
                    })) : [{ 
                        name: "", 
                        difficulties: (cat.difficulties || []).map((d: any) => ({ 
                            difficulty: typeof d === "string" ? d : d.difficulty, 
                            count: 0,
                            audio_url: d.audio_url 
                        })),
                        audio_url: cat.audio_url
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
                        audio_url: s.audio_url
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
        if (!name) return;
        if (tree.find(c => c.name.toLowerCase() === name.toLowerCase())) {
            showToast("Category already exists", "error"); return;
        }
        dispatch(setTree([...tree, {
            name,
            hasSubCategories: false,
            subGroups: [{ name: "", difficulties: [] }],
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
            setQuestions(d.questions || []);
            setTotalCount(d.total || 0);
            setHasMore((d.questions?.length || 0) < (d.total || 0));
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
                showToast(`Success! Imported ${d.imported_count} questions.`, "success");
                await selectSlot(active.category, active.sub_category, active.difficulty);
                setViewMode("list");
            } else {
                showToast(d.error || "No questions imported. Check CSV format.", "error");
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
            
            if (newQs.length > 0) {
                setQuestions((prev: Question[]) => {
                    const existingIds = new Set(prev.map((q: Question) => q.id));
                    const uniqueNew = newQs.filter((q: Question) => !existingIds.has(q.id));
                    const combined = [...prev, ...uniqueNew];
                    setHasMore(combined.length < (d.total || 0));
                    return combined;
                });
                setPage(nextPage);
            } else {
                setHasMore(false);
            }
        } catch { showToast("Failed to load more", "error"); }
        finally { setLoadingMore(false); }
    }, [active, hasMore, loadingMore, page, showToast]);

    useEffect(() => {
        if (!workspaceRef.current) return;
        const obs = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingQ) {
                    loadMore();
                }
            },
            { 
                root: workspaceRef.current, 
                threshold: 0.1,
                rootMargin: "150px" 
            }
        );
        if (observerTarget.current) obs.observe(observerTarget.current);
        return () => obs.disconnect();
    }, [hasMore, loadingMore, loadingQ, loadMore]);

    async function deleteQuestion(id: string) {
        setQuestionToDelete(id);
        setShowDeleteQuestionModal(true);
    }

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

    async function handleEditSave() {
        if (!editingQ || !editingQ.text.trim()) return;
        try {
            setImporting(true);
            const res = await fetch(`${API_BASE}/api/admin/questions/${editingQ.id}`, {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify(editingQ)
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
            const payload = { questions: [{ ...formQ, category: active.category, sub_category: active.sub_category, difficulty: active.difficulty, options: formQ.type === "MCQ" ? formQ.options : [], correct_answer: formQ.type === "MCQ" ? formQ.correct_answer : "" }] };
            const res = await fetch(`${API_BASE}/api/admin/questions/import`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await res.json();
            if (d.imported_count > 0) {
                showToast("Added!", "success");
                setFormQ({ text: "", type: "MCQ", options: ["", "", "", ""], correct_answer: "A" });
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

    const filtered = questions.filter(q => !search || q.text.toLowerCase().includes(search.toLowerCase()));

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
    if (!isAuthenticated || user?.role !== "interviewer") { router.push("/login"); return null; }

    return (
        <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center"><BookOpen size={20} className="text-white" /></div>
                    <div>
                        <h1 className="text-xl font-black text-gray-900">Exam Sheet</h1>
                        <p className="text-xs text-gray-500">Build your question bank — category → sub-category → difficulty</p>
                    </div>
                </div>
                <button onClick={() => { load(); }} className="flex items-center gap-2 text-sm text-indigo-600 font-semibold hover:text-indigo-800">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* ───── LEFT: Tree ───── */}
                <div className="w-80 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading && <div className="flex justify-center py-10"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-indigo-600" /></div>}

                        {tree.map((cat, ci) => (
                            <CategoryBlock key={ci} cat={cat} catIdx={ci}
                                active={active}
                                onToggle={() => dispatch(setExpanded({ catIdx: ci, expanded: !cat.expanded }))}
                                onRemoveCat={() => dispatch(removeCategoryAction(ci))}
                                onRenameCat={(name) => dispatch(renameCategoryAction({ catIdx: ci, newName: name }))}
                                onHasSub={(has) => dispatch(toggleHasSubAction({ catIdx: ci, has }))}
                                onAddSub={(subName) => dispatch(addSubCategoryAction({ catIdx: ci, subName }))}
                                onRemoveSub={(si) => dispatch(removeSubCategoryAction({ catIdx: ci, subIdx: si }))}
                                onRenameSub={(si, newName) => dispatch(renameSubCategoryAction({ catIdx: ci, subIdx: si, newName }))}
                                onAddDiff={(si, diff) => dispatch(addDifficultyAction({ catIdx: ci, subIdx: si, diff }))}
                                onRemoveDiff={(si, di) => dispatch(removeDifficultyAction({ catIdx: ci, subIdx: si, diffIdx: di }))}
                                onSelect={(s, d) => selectSlot(cat.name, s, d)}
                            />
                        ))}

                        <div className="mt-4 p-4 bg-indigo-50 border border-dashed border-indigo-200 rounded-xl">
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Add Category</p>
                            <div className="flex gap-2">
                                <input type="text" value={addCatName} onChange={e => setAddCatName(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addCategory()}
                                    className="flex-1 p-2 text-sm text-gray-900 border border-indigo-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                                    placeholder="e.g. Programming" />
                                <button onClick={addCategory} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ───── RIGHT: Workspace ───── */}
                <div ref={workspaceRef} className="flex-1 overflow-y-auto bg-gray-50/50">
                    {!active ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4"><BookOpen size={36} className="text-indigo-300" /></div>
                            <h2 className="text-xl font-bold text-gray-700 mb-2">Build Your Bank</h2>
                            <p className="text-gray-400 max-w-xs">Select a category on the left to start uploading data or viewing questions.</p>
                        </div>
                    ) : (
                        <div className="p-8 max-w-5xl mx-auto space-y-8">
                            <div className="flex items-center justify-between flex-wrap gap-4">
                                <div>
                                    <nav className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{active.category}</span>
                                        {active.sub_category && <><ChevronRight size={14} className="text-gray-300" /><span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{active.sub_category}</span></>}
                                    </nav>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{active.difficulty} Questions</h1>
                                        <span className="px-3 py-1 text-xs font-black rounded-full bg-indigo-100 text-indigo-700 uppercase">{totalCount} Total</span>
                                    </div>
                                </div>

                                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                                    <button onClick={() => setViewMode("upload")}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${viewMode === "upload" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-700"}`}>
                                        <Upload size={16} /> Upload Hub
                                    </button>
                                    <button onClick={() => setViewMode("list")}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${viewMode === "list" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 hover:text-gray-700"}`}>
                                        <LayoutList size={16} /> List View
                                    </button>
                                </div>
                            </div>

                            {viewMode === "upload" ? (
                                <div className="space-y-6">
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

                                    <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 flex items-start gap-4">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                                            <ShieldAlert size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-indigo-900 mb-1">Question Inheritance Active</h4>
                                            <p className="text-xs text-indigo-700/70 leading-relaxed font-medium">
                                                Any questions uploaded or added below will automatically inherit the audio configured for 
                                                <span className="text-indigo-900 font-black px-1.5 py-0.5 bg-indigo-100/50 rounded ml-1">
                                                    {active.category} {active.sub_category ? `→ ${active.sub_category}` : ""} → {active.difficulty}
                                                </span>.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* CSV Card */}
                                        <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                            className={`bg-white rounded-3xl p-8 border ${isDragging ? "border-indigo-400 bg-indigo-50 scale-[1.02]" : "border-gray-100"} shadow-sm hover:shadow-xl transition-all`}>
                                            <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
                                                <FileSpreadsheet size={28} />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">CSV Upload</h3>
                                            <p className="text-sm text-gray-500 mb-8 leading-relaxed">Import questions instantly. Columns: category, type, text, optionA-D, correctanswer.</p>
                                            <label className="cursor-pointer">
                                                <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleCSVUpload(e.target.files[0])} disabled={importing} />
                                                <div className="w-full py-4 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-2xl text-center text-sm font-black text-indigo-600 uppercase">
                                                    {importing ? "Processing…" : "Choose CSV File"}
                                                </div>
                                            </label>
                                        </div>

                                        {/* JSON Card */}
                                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all">
                                            <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
                                                <Terminal size={28} />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">JSON Import</h3>
                                            <p className="text-sm text-gray-500 mb-8 leading-relaxed">Paste raw question objects here for lightning-fast bulk data ingestion.</p>
                                            <button onClick={() => { setImportMode("json"); setShowImport(true); }}
                                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase shadow-md hover:bg-indigo-700">
                                                Open JSON Editor
                                            </button>
                                        </div>

                                        {/* Form Card */}
                                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all">
                                            <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
                                                <Plus size={28} />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">Add Manually</h3>
                                            <p className="text-sm text-gray-500 mb-8 leading-relaxed">Quickly add a single question via form with options and correct answer.</p>
                                            <button onClick={() => { setImportMode("form"); setShowImport(true); }}
                                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase shadow-md hover:bg-indigo-700">
                                                Fill Out Form
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="relative">
                                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions..."
                                            className="w-full pl-12 pr-4 py-3 text-sm font-bold border border-gray-300 rounded-2xl focus:outline-none focus:border-indigo-500 text-gray-900 placeholder:text-gray-400" />
                                    </div>
                                    <div className="space-y-4">
                                        {filtered.map((q, i) => (
                                            <div key={q.id} className="bg-white border rounded-3xl p-6 group hover:border-indigo-200 transition-all shadow-sm">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">{i + 1}</div>
                                                    <div className="flex-1">
                                                        <div className="flex gap-2 mb-2">
                                                            <span className="text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">{q.type}</span>
                                                        </div>
                                                        <p className="text-base font-semibold text-gray-900 whitespace-pre-wrap">{q.text}</p>
                                                        {q.options && (
                                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {q.options.map((opt, oi) => (
                                                                    <div key={oi} className={`px-4 py-2.5 rounded-xl text-sm border ${String.fromCharCode(64 + oi + 1) === q.correct_answer ? "bg-emerald-50 border-emerald-100 text-emerald-900 font-bold" : "bg-gray-50 border-gray-100 text-gray-600"}`}>
                                                                        {opt}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => setEditingQ(q)} className="p-2 text-gray-400 hover:text-indigo-600"><Edit2 size={18} /></button>
                                                        <button onClick={() => deleteQuestion(q.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {hasMore && <div ref={observerTarget} className="py-10 text-center"><RefreshCw className="animate-spin mx-auto text-indigo-600" /></div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals for Import and Edit */}
            {showImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border">
                         <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-lg font-black">{importMode === "form" ? "Manual Entry" : "Bulk JSON Import"}</h2>
                            <button onClick={() => setShowImport(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="p-8 max-h-[80vh] overflow-y-auto">
                            {importMode === "form" ? (
                                <div className="space-y-6">
                                    <select value={formQ.type} onChange={e => setFormQ(p => ({ ...p, type: e.target.value }))} className="w-full p-3 border rounded-xl font-bold text-gray-900">
                                        <option value="MCQ">MCQ</option>
                                        <option value="SUBJECTIVE">Subjective</option>
                                    </select>
                                    <textarea value={formQ.text} onChange={e => setFormQ(p => ({ ...p, text: e.target.value }))} rows={4} className="w-full p-4 border rounded-2xl font-bold text-gray-900 placeholder:text-gray-400" placeholder="Type question text here…" />
                                    {formQ.type === "MCQ" && (
                                        <div className="space-y-3">
                                            {formQ.options.map((opt, oi) => (
                                                <input key={oi} type="text" value={opt} onChange={e => { const o = [...formQ.options]; o[oi] = e.target.value; setFormQ(p => ({ ...p, options: o })); }} className="w-full p-3 border rounded-xl text-gray-900 font-bold placeholder:text-gray-400" placeholder={`Option ${optionLetters[oi]}`} />
                                            ))}
                                            <div className="flex gap-2">
                                                {optionLetters.map(l => (
                                                    <button key={l} onClick={() => setFormQ(p => ({ ...p, correct_answer: l }))} className={`w-10 h-10 rounded-xl font-black ${formQ.correct_answer === l ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-400"}`}>{l}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button onClick={handleImportForm} disabled={importing} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">
                                        {importing ? "Adding…" : "Add to Bank"}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={12} className="w-full p-4 bg-gray-900 text-indigo-300 font-mono rounded-2xl" placeholder="JSON Array…" />
                                    <button onClick={handleImportJSON} disabled={importing} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black">{importing ? "Importing…" : "Import JSON"}</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingQ && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] w-full max-w-2xl p-8 border">
                        <h2 className="text-2xl font-black mb-6">Edit Question</h2>
                        <textarea value={editingQ.text} onChange={e => setEditingQ({ ...editingQ, text: e.target.value })} rows={4} className="w-full p-4 border rounded-2xl font-bold mb-6 text-gray-900" />
                        <div className="flex gap-4">
                            <button onClick={() => setEditingQ(null)} className="flex-1 py-4 bg-gray-50 text-gray-500 rounded-2xl font-black">Cancel</button>
                            <button onClick={handleEditSave} disabled={importing} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black">{importing ? "Saving…" : "Save"}</button>
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
                    <>
                        <button
                            onClick={() => setShowDeleteQuestionModal(false)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDeleteQuestion}
                            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 font-medium"
                        >
                            Confirm Delete
                        </button>
                    </>
                }
            >
                <div className="flex items-center gap-4 text-gray-600">
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-600 shrink-0">
                        <AlertTriangle size={24} />
                    </div>
                    <p>
                        Are you sure you want to delete this question permanently? 
                        This action will remove it from the question bank and cannot be undone.
                    </p>
                </div>
            </Modal>
        </div>
    );
}

/* ── CategoryBlock component ── */
function CategoryBlock({ cat, catIdx, active, onToggle, onRemoveCat, onRenameCat, onHasSub, onAddSub, onRemoveSub, onRenameSub, onAddDiff, onRemoveDiff, onSelect }: {
    cat: CategoryNode; catIdx: number; active: ActiveSlot | null;
    onToggle: () => void; onRemoveCat: () => void; onRenameCat: (name: string) => void;
    onHasSub: (v: boolean) => void;
    onAddSub: (n: string) => void; onRemoveSub: (subIdx: number) => void;
    onRenameSub: (subIdx: number, name: string) => void;
    onAddDiff: (subIdx: number, diff: string) => void;
    onRemoveDiff: (subIdx: number, diffIdx: number) => void;
    onSelect: (sub: string, diff: string) => void;
}) {
    const [newSub, setNewSub] = useState("");
    const [diffInputs, setDiffInputs] = useState<Record<number, string>>({});

    const diffColor = (d: string) => {
        const l = d.toLowerCase();
        if (l === "easy") return "bg-green-100 text-green-700";
        if (l === "medium") return "bg-yellow-100 text-yellow-700";
        if (l === "hard") return "bg-red-100 text-red-700";
        return "bg-indigo-100 text-indigo-700";
    };

    return (
        <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <div className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between ${active?.category === cat.name && !active?.sub_category ? "bg-indigo-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-800"}`}
                onClick={() => { onSelect("", ""); if (!cat.expanded) onToggle(); }}>
                <div className="flex items-center gap-2 flex-1">
                    <ChevronRight size={14} className={`transition ${cat.expanded ? "rotate-90" : ""}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} />
                    <input type="text" value={cat.name} onChange={e => onRenameCat(e.target.value)} onClick={e => e.stopPropagation()} className="bg-transparent border-none font-bold text-sm w-full focus:ring-0 text-white placeholder:text-gray-400" />
                </div>
                <button onClick={(e) => { e.stopPropagation(); onRemoveCat(); }} className="p-1 hover:text-red-500 text-gray-400"><Trash2 size={13} /></button>
            </div>

            {cat.expanded && (
                <div className="p-4 bg-white space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-gray-500">Sub-categories?</span>
                        <div className="flex border rounded-lg overflow-hidden">
                            <button onClick={() => onHasSub(false)} className={`px-3 py-1 text-xs font-bold ${!cat.hasSubCategories ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>No</button>
                            <button onClick={() => onHasSub(true)} className={`px-3 py-1 text-xs font-bold ${cat.hasSubCategories ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>Yes</button>
                        </div>
                    </div>

                    {cat.hasSubCategories ? (
                        <div className="space-y-3">
                            {cat.subGroups.map((sg, si) => (
                                <div key={si} className="border rounded-xl p-3 bg-gray-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 flex-1">
                                            <Tag size={12} className="text-indigo-500" />
                                            <input type="text" value={sg.name} onChange={e => onRenameSub(si, e.target.value)} className="bg-transparent border-none text-xs font-bold focus:ring-0 w-full placeholder:text-gray-400 text-gray-900" placeholder="Sub-category…" />
                                        </div>
                                        <button onClick={() => onRemoveSub(si)} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {sg.difficulties.map((d, di) => (
                                            <div key={di} className="flex items-center gap-1">
                                                <button onClick={() => onSelect(sg.name, d.difficulty)} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${diffColor(d.difficulty)} ${active?.category === cat.name && active?.sub_category === sg.name && active?.difficulty === d.difficulty ? "ring-2 ring-indigo-500" : ""}`}>
                                                    {d.difficulty} {d.count > 0 && <span>({d.count})</span>}
                                                </button>
                                                <button onClick={() => onRemoveDiff(si, di)} className="text-gray-400 hover:text-red-500"><X size={10} /></button>
                                            </div>
                                        ))}
                                    </div>
                                    <DifficultyAdder value={diffInputs[si] || ""} onChange={v => setDiffInputs(p => ({ ...p, [si]: v }))} onAdd={() => { onAddDiff(si, diffInputs[si]); setDiffInputs(p => ({ ...p, [si]: "" })); }} />
                                </div>
                            ))}
                             <div className="flex gap-2">
                                <input type="text" value={newSub} onChange={e => setNewSub(e.target.value)} className="flex-1 p-2 text-xs border rounded-lg placeholder:text-gray-400 font-bold text-gray-900" placeholder="New sub-category…" />
                                <button onClick={() => { onAddSub(newSub); setNewSub(""); }} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"><Plus size={14} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="border rounded-xl p-3 bg-gray-50">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {cat.subGroups[0]?.difficulties.map((d, di) => (
                                    <div key={di} className="flex items-center gap-1">
                                        <button onClick={() => onSelect("", d.difficulty)} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${diffColor(d.difficulty)} ${active?.category === cat.name && !active?.sub_category && active?.difficulty === d.difficulty ? "ring-2 ring-indigo-500" : ""}`}>
                                            {d.difficulty} {d.count > 0 && <span>({d.count})</span>}
                                        </button>
                                        <button onClick={() => onRemoveDiff(0, di)} className="text-gray-400 hover:text-red-500"><X size={10} /></button>
                                    </div>
                                ))}
                            </div>
                            <DifficultyAdder value={diffInputs[0] || ""} onChange={v => setDiffInputs(p => ({ ...p, 0: v }))} onAdd={() => { onAddDiff(0, diffInputs[0]); setDiffInputs(p => ({ ...p, 0: "" })); }} />
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
        <div className="bg-white rounded-3xl p-6 border border-indigo-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Music size={20} /></div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Audio Configuration</h3>
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                            For {activeDiff ? `${activeDiff} ` : ""}{activeSub || cat?.name}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {node?.audio_url && (
                        <button 
                            onClick={() => setShowDeleteModal(true)}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                            title="Remove Audio"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button onClick={() => setIsEditing(!isEditing)} className={`px-4 py-2 rounded-xl text-xs font-bold ${isEditing ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                        {isEditing ? "Done" : "Manage"}
                    </button>
                </div>
            </div>

            {isEditing ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Audio URL</label>
                        <div className="flex gap-2">
                            <input type="text" value={audioUrl} onChange={e => { setAudioUrl(e.target.value); onSaveAudio(e.target.value); }} className="flex-1 p-3 text-sm bg-gray-50 border rounded-xl placeholder:text-gray-500 font-medium" placeholder="URL…" />
                            <label className="cursor-pointer p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors">
                                <input type="file" className="hidden" accept="audio/*" onChange={handleUpload} disabled={uploading} />
                                {uploading ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
                            </label>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center gap-3">
                    {node.audio_url ? <audio src={node.audio_url.startsWith("http") ? node.audio_url : `${API_BASE}${node.audio_url}`} controls className="h-8 flex-1" /> : <span className="text-xs text-gray-500 font-medium">No Audio Configured for this Level</span>}
                </div>
            )}

            {/* Remove Audio Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Remove Audio Configuration"
                footer={
                    <>
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onSaveAudio("");
                                setShowDeleteModal(false);
                                showToast("Audio configuration removed", "info");
                            }}
                            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 font-medium"
                        >
                            Confirm Remove
                        </button>
                    </>
                }
            >
                <div className="flex items-center gap-4 text-gray-600">
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-600 shrink-0">
                        <AlertTriangle size={24} />
                    </div>
                    <p>
                        Are you sure you want to remove the audio configuration for 
                        <strong> {activeDiff ? `${activeDiff} ` : ""}{activeSub || cat?.name}</strong>?
                        This action cannot be undone.
                    </p>
                </div>
            </Modal>
        </div>
    );
}


function DifficultyAdder({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: () => void; }) {
    return (
        <div className="flex gap-1.5 items-center">
            <input type="text" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} className="flex-1 p-1.5 text-xs border rounded-lg placeholder:text-gray-500 font-medium" placeholder="Difficulty…" />
            <button onClick={onAdd} className="p-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"><Plus size={12} /></button>
        </div>
    );
}
