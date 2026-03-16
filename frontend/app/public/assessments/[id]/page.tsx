"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Phone, ShieldCheck, ArrowRight, BookOpen, Loader2, CheckCircle } from "lucide-react";

export default function PublicAssessmentLanding() {
    const router = useRouter();
    const params = useParams();
    const { showToast } = useToast();

    const [loading, setLoading] = useState(true);
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState(["", "", "", ""]);
    const [step, setStep] = useState<"phone" | "otp">("phone");
    const [submitting, setSubmitting] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);

    const otpRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];

    useEffect(() => {
        if (params.id) {
            const token = localStorage.getItem("token");
            const storedUser = localStorage.getItem("user");
            if (token && storedUser) {
                router.replace(`/public/assessments/${params.id}/take`);
                return;
            }
        }
        setLoading(false);
    }, [params.id]);

    // Auto-verify when all 4 OTP digits are entered
    useEffect(() => {
        if (step === "otp" && otp.every(d => d !== "") && !submitting) {
            autoVerify(otp.join(""));
        }
    }, [otp, step]);

    const autoVerify = async (otpStr: string) => {
        setSubmitting(true);
        try {
            const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
            const res = await fetch(`${base}/api/public/start-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: phone.trim(), otp: otpStr }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Verification failed");

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            showToast(`Welcome, ${data.user.name}! Starting your assessment...`, "success");
            router.push(`/public/assessments/${params.id}/take`);
        } catch (err: any) {
            showToast(err.message || "Failed to verify", "error");
            setOtp(["", "", "", ""]);
            setTimeout(() => otpRefs[0].current?.focus(), 100);
            setSubmitting(false);
        }
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = phone.trim().replace(/[\s\-()]/g, "");
        if (!cleaned) {
            showToast("Please enter your phone number", "error");
            return;
        }
        // Allow: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX (10 digits)
        const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
        if (!phoneRegex.test(cleaned)) {
            showToast("Please enter a valid 10-digit phone number", "error");
            return;
        }
        setSendingOtp(true);
        // Simulate a short delay as if sending OTP
        await new Promise(res => setTimeout(res, 800));
        setSendingOtp(false);
        setStep("otp");
        showToast("OTP sent to your phone!", "success");
        setTimeout(() => otpRefs[0].current?.focus(), 100);
    };

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d?$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        if (value && index < 3) {
            otpRefs[index + 1].current?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            otpRefs[index - 1].current?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
        const newOtp = [...otp];
        for (let i = 0; i < 4; i++) newOtp[i] = text[i] || "";
        setOtp(newOtp);
        otpRefs[Math.min(text.length, 3)].current?.focus();
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        const otpStr = otp.join("");
        if (otpStr.length !== 4) {
            showToast("Please enter the complete 4-digit OTP", "error");
            return;
        }

        setSubmitting(true);
        try {
            const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
            const res = await fetch(`${base}/api/public/start-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: phone.trim(), otp: otpStr }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Verification failed");

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            showToast(`Welcome, ${data.user.name}! Starting your assessment...`, "success");
            router.push(`/public/assessments/${params.id}/take`);
        } catch (err: any) {
            showToast(err.message || "Failed to verify", "error");
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                            <BookOpen size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-1">
                            {step === "phone" ? "Verify Your Identity" : "Enter OTP"}
                        </h1>
                        <p className="text-gray-500 text-sm">
                            {step === "phone"
                                ? "Enter your registered phone number to receive an OTP."
                                : <>OTP sent to <span className="font-semibold text-gray-700">{phone}</span>. Enter it below.</>
                            }
                        </p>
                    </div>

                    {/* Step indicators */}
                    <div className="flex items-center gap-2 mb-8">
                        <div className={`flex-1 h-1.5 rounded-full transition-all ${step === "phone" ? "bg-indigo-300" : "bg-indigo-600"}`} />
                        <div className={`flex-1 h-1.5 rounded-full transition-all ${step === "otp" ? "bg-indigo-600" : "bg-gray-200"}`} />
                    </div>

                    {/* Step 1: Phone */}
                    {step === "phone" && (
                        <form onSubmit={handleSendOtp} className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="tel"
                                        required
                                        autoFocus
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-indigo-500 focus:outline-none text-gray-900 font-medium transition"
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={sendingOtp}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-70"
                            >
                                {sendingOtp ? (
                                    <><Loader2 size={20} className="animate-spin" /> Sending OTP...</>
                                ) : (
                                    <>Send OTP <ArrowRight size={20} /></>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Step 2: OTP */}
                    {step === "otp" && (
                        <form onSubmit={handleVerify} className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-4 text-center">
                                    <ShieldCheck size={14} className="inline mr-1 text-indigo-500" />
                                    4-Digit OTP
                                </label>
                                <div className="flex gap-3 justify-center" onPaste={handleOtpPaste}>
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={otpRefs[i]}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            className="w-16 h-16 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none text-gray-900 transition bg-gray-50 focus:bg-white"
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-70"
                            >
                                {submitting ? (
                                    <><Loader2 size={20} className="animate-spin" /> Verifying...</>
                                ) : (
                                    <><CheckCircle size={20} /> Verify & Start</>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setStep("phone"); setOtp(["", "", "", ""]); }}
                                className="w-full text-sm text-gray-400 hover:text-gray-700 transition text-center"
                            >
                                ← Change phone number
                            </button>
                        </form>
                    )}
                </div>
                <p className="text-center text-xs text-gray-400 mt-4">
                    Having trouble? Contact your recruiter for assistance.
                </p>
            </div>
        </div>
    );
}
