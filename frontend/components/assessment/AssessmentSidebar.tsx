"use client";

import { Clock, CheckCircle, HelpCircle, Mic } from "lucide-react";

interface AssessmentSidebarProps {
    timeLeft: number | null;
    formatTime: (seconds: number) => string;
    questions: any[];
    currentQuestionIndex: number;
    answers: Record<string, string>;
    onSelectQuestion: (index: number) => void;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export default function AssessmentSidebar({
    timeLeft,
    formatTime,
    questions,
    currentQuestionIndex,
    answers,
    onSelectQuestion,
    videoRef,
    canvasRef
}: AssessmentSidebarProps) {
    const answeredCount = Object.keys(answers).length;
    const unansweredCount = (questions?.length || 0) - answeredCount;

    return (
        <aside className="w-80 flex flex-col gap-6 sticky top-24 h-[calc(100vh-8rem)]">
            {/* Live Proctoring Monitor */}
            {videoRef && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                            Live Proctoring
                        </span>
                        <Mic size={12} className="text-gray-500" />
                    </div>
                    <div className="relative aspect-square bg-black">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover scale-x-[-1]"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                </div>
            )}

            {/* Timer Section */}
            <div className={`flex flex-col items-center justify-center p-6 rounded-xl shadow-lg border-b-4 transition-colors ${
                timeLeft !== null && timeLeft < 300 
                ? "bg-red-600 border-red-800 text-white animate-pulse" 
                : "bg-slate-900 border-slate-700 text-emerald-400"
            }`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-1 opacity-80">
                    <Clock size={14} /> Time Remaining
                </div>
                <div className="text-4xl font-black font-mono tracking-tighter">
                    {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
                </div>
            </div>

            {/* Question Palette */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col overflow-hidden max-h-[500px]">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    Question Palette
                </h3>
                <div className="grid grid-cols-5 gap-3 overflow-y-auto p-2">
                    {questions?.map((q, idx) => {
                        const isCurrent = idx === currentQuestionIndex;
                        const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "";
                        
                        return (
                            <button
                                key={q.id}
                                onClick={() => onSelectQuestion(idx)}
                                className={`h-10 w-10 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-sm ${
                                    isCurrent 
                                    ? "bg-red-600 text-white ring-4 ring-red-100 scale-110 z-10" 
                                    : isAnswered 
                                    ? "bg-green-500 text-white hover:bg-green-600" 
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 font-bold"
                                }`}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Overall Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    Overall Summary
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                        <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                            <CheckCircle size={16} /> Attempted
                        </div>
                        <span className="bg-green-600 text-white px-3 py-0.5 rounded-full text-xs font-black">
                            {answeredCount}
                        </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                            <HelpCircle size={16} /> Not Attempted
                        </div>
                        <span className="bg-gray-600 text-white px-3 py-0.5 rounded-full text-xs font-black">
                            {unansweredCount}
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
