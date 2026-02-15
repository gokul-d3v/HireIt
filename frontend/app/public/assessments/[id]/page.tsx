"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { User, Mail, ArrowRight, BookOpen, Clock, Phone } from "lucide-react";

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: any[];
}

export default function PublicAssessmentLanding() {
    const router = useRouter();
    const params = useParams();
    const { showToast } = useToast();

    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (params.id) {
            checkExistingSession(params.id as string);
        }
    }, [params.id]);

    const checkExistingSession = (id: string) => {
        const token = localStorage.getItem("token");
        const storedUser = localStorage.getItem("user");

        if (token && storedUser) {
            // User already identifying themselves, skip to take
            router.replace(`/public/assessments/${id}/take`);
            return;
        }
        setLoading(false);
    };

    const handleStart = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const data = await apiRequest("/api/public/start", "POST", {
                name,
                email,
                phone,
                assessment_id: params.id
            });

            if (data.token) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));

                showToast("Welcome! Starting your assessment...", "success");
                router.push(`/public/assessments/${params.id}/take`);
            } else {
                throw new Error("No token received");
            }
        } catch (err: any) {
            console.error("Start error", err);
            showToast(err.message || "Failed to start assessment", "error");
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                    <BookOpen size={32} />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Start Assessment</h1>
                <p className="text-gray-500">Please enter your details to begin.</p>
            </div>

            <form onSubmit={handleStart} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 text-gray-400" size={20} />
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                            placeholder="John Doe"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                            placeholder="john@example.com"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-3 text-gray-400" size={20} />
                        <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                            placeholder="+1 234 567 8900"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-70"
                >
                    {submitting ? "Starting..." : (
                        <>
                            Start Assessment <ArrowRight size={20} />
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
