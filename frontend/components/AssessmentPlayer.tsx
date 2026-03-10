"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation"; // Note: used for navigation after submit
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Clock, CheckCircle, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert, Camera, Maximize2, Mic } from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";

interface Question {
    id: string;
    text: string;
    type: "MCQ" | "SUBJECTIVE" | "CODING";
    options: string[];
    points: number;
}

interface Assessment {
    id: string;
    title: string;
    description: string;
    duration: number;
    questions: Question[];
}

interface AssessmentPlayerProps {
    assessmentId: string;
    onComplete?: () => void;
}

export default function AssessmentPlayer({ assessmentId, onComplete }: AssessmentPlayerProps) {
    const router = useRouter();
    const { showToast } = useToast();
    const [showSubmitModal, setShowSubmitModal] = useState(false);

    // State for assessment data and progress
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Anti-Cheat State
    const [examStarted, setExamStarted] = useState(false);
    const [violations, setViolations] = useState(0);
    const [loggedViolations, setLoggedViolations] = useState<any[]>([]); // Non-fatal (faces, voice)
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [violationReason, setViolationReason] = useState("");
    const [violationEvidence, setViolationEvidence] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [calibrationStep, setCalibrationStep] = useState<'not_started' | 'calibrating' | 'completed'>('not_started');
    const [calibrationFeedback, setCalibrationFeedback] = useState("Position your face within the frame");
    const [isPostureCorrect, setIsPostureCorrect] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectionInterval = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isRecordingRef = useRef(false);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        const loadModels = async () => {
            try {
                await tf.ready();
                await blazeface.load();
                setModelsLoaded(true);
            } catch (err) {
                console.error("Failed to load TFJS models", err);
            }
        };
        loadModels();
    }, []);

    const handleViolation = (reason: string, evidenceBase64?: string) => {
        setViolations(prev => {
            const newCount = prev + 1;
            setViolationReason(reason);
            if (evidenceBase64) setViolationEvidence(evidenceBase64);
            setShowWarningModal(true);

            if (newCount >= 3) {
                submitAssessment(true); // Auto submit on 3rd violation
            }
            return newCount;
        });
    };

    useEffect(() => {
        if (!examStarted) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                handleViolation("Tab switching detected");
            }
        };

        const handleBlur = () => {
            handleViolation("Application lost focus");
        };

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                handleViolation("Exited Full-Screen mode");
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleBlur);
        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("blur", handleBlur);
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, [examStarted]);

    const captureEvidenceAndViolate = (reason: string, isFatal = true, type = "tab_switch") => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        let evidenceBase64 = "";
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            evidenceBase64 = canvas.toDataURL('image/jpeg');
        }

        if (isFatal) {
            handleViolation(reason, evidenceBase64);
        } else {
            // Non-fatal logging
            const violation = {
                timestamp: new Date().toISOString(),
                type: type,
                reason: reason,
                evidence: evidenceBase64
            };
            setLoggedViolations(prev => [...prev, violation]);
            console.warn(`[Non-Fatal Violation Logged]: ${reason}`);

            // Start 7-second Video Evidence Recording
            if (stream && !isRecordingRef.current) {
                isRecordingRef.current = true;
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                const chunks: BlobPart[] = [];

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    isRecordingRef.current = false;
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const formData = new FormData();
                    formData.append("video", blob, "evidence.webm");

                    try {
                        const token = localStorage.getItem("token");
                        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/assessments/${assessmentId}/upload-evidence`, {
                            method: "POST",
                            headers: token ? { "Authorization": `Bearer ${token}` } : {},
                            body: formData
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data.url) {
                                setLoggedViolations(prev => prev.map(v =>
                                    v.timestamp === violation.timestamp ? { ...v, evidence: data.url } : v
                                ));
                                console.log("Evidence uploaded securely to YouTube:", data.url);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to upload video evidence", err);
                    }
                };

                mediaRecorder.start();
                setTimeout(() => {
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }, 7000); // 7 seconds clip
            }
        }
    };

    const containerRef = useRef<HTMLDivElement>(null);

    const analyzePosture = async (model: blazeface.BlazeFaceModel) => {
        if (!videoRef.current || videoRef.current.readyState !== 4) return;

        const predictions = await model.estimateFaces(videoRef.current, false);

        if (predictions.length === 0) {
            setCalibrationFeedback("No face detected. Please face the camera.");
            setIsPostureCorrect(false);
            return;
        }

        if (predictions.length > 1) {
            setCalibrationFeedback("Multiple people detected. Only one person allowed.");
            setIsPostureCorrect(false);
            return;
        }

        const face = predictions[0] as any;
        const landmarks = face.landmarks;
        const rightEye = landmarks[0];
        const leftEye = landmarks[1];
        const nose = landmarks[2];

        // 1. Centering (Horizontal)
        const videoWidth = videoRef.current.videoWidth;
        const faceCenterX = nose[0];
        const centerOffset = Math.abs(faceCenterX - videoWidth / 2);
        const maxOffset = videoWidth * 0.15; // 15% tolerance

        // 2. Alignment (Tilt/Level)
        const eyeLevelDiff = Math.abs(rightEye[1] - leftEye[1]);
        const maxTilt = 20; // Tolerance in pixels

        // 3. Distance (Eye Gap)
        const eyeGap = Math.sqrt(Math.pow(rightEye[0] - leftEye[0], 2) + Math.pow(rightEye[1] - leftEye[1], 2));
        const minGap = videoWidth * 0.15;
        const maxGap = videoWidth * 0.4;

        let feedback = "";
        let correct = true;

        if (centerOffset > maxOffset) {
            feedback = "Please sit in the center of the frame.";
            correct = false;
        } else if (eyeLevelDiff > maxTilt) {
            feedback = "Please level your head (don't tilt).";
            correct = false;
        } else if (eyeGap < minGap) {
            feedback = "You are too far from the camera.";
            correct = false;
        } else if (eyeGap > maxGap) {
            feedback = "You are too close to the camera.";
            correct = false;
        } else {
            feedback = "Posture is perfect. You may proceed.";
            correct = true;
        }

        setCalibrationFeedback(feedback);
        setIsPostureCorrect(correct);
    };

    const startCalibration = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(s);
            setCalibrationStep('calibrating');

            const model = await blazeface.load();
            const interval = setInterval(() => {
                analyzePosture(model);
            }, 200);

            detectionInterval.current = interval;
        } catch (err) {
            console.error("Calibration failed", err);
            showToast("Failed to access camera", "error");
        }
    };

    const startExamMode = async () => {
        if (!isPostureCorrect) return;

        try {
            if (detectionInterval.current) clearInterval(detectionInterval.current);
            setCalibrationStep('completed');

            if (containerRef.current) {
                await containerRef.current.requestFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }

            setExamStarted(true);

            const model = await blazeface.load();
            detectionInterval.current = setInterval(async () => {
                if (videoRef.current && videoRef.current.readyState === 4) {
                    const predictions = await model.estimateFaces(videoRef.current, false);
                    if (predictions.length > 1) {
                        captureEvidenceAndViolate("Multiple people detected in frame", false, "multiple_people");
                    }
                }
            }, 3000);

            // Start Audio Analysis (Voice Detection)
            if (stream && stream.getAudioTracks().length > 0) {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioCtx;
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                let consecutiveNoiseCount = 0;

                audioIntervalRef.current = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const averageVolume = sum / dataArray.length;

                    // Threshold for speech/noise. Needs tuning, usually > 30-40 indicates clear sound
                    if (averageVolume > 40) {
                        consecutiveNoiseCount++;
                        // If noisy for ~3 seconds (6 * 500ms)
                        if (consecutiveNoiseCount > 6) {
                            captureEvidenceAndViolate("Continuous speaking or background noise detected", false, "audio_anomaly");
                            consecutiveNoiseCount = 0; // Reset after logging
                        }
                    } else {
                        consecutiveNoiseCount = 0;
                    }
                }, 500);
            }

        } catch (err) {
            console.error("Failed to start exam mode", err);
            alert("Please ensure Full-Screen is enabled to begin.");
        }
    };

    useEffect(() => {
        if ((examStarted || calibrationStep === 'calibrating') && videoRef.current && stream) {
            if (videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
            }
        }
    }, [examStarted, calibrationStep, stream]);

    useEffect(() => {
        return () => {
            if (detectionInterval.current) clearInterval(detectionInterval.current);
            if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
            if (audioContextRef.current) audioContextRef.current.close().catch(console.error);
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    useEffect(() => {
        if (assessmentId) {
            fetchAssessment(assessmentId);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [assessmentId]);

    const fetchAssessment = async (id: string) => {
        try {
            // We assume the token is already in localStorage (managed by parent or login)
            const [responseData, submissionsData] = await Promise.all([
                apiRequest(`/api/assessments/${id}`, "GET"),
                apiRequest("/api/assessments/submissions/my", "GET")
            ]);

            // Handle new response structure { assessment, saved_answers }
            // or fallback to old structure if API hasn't deployed fully or something
            const assessmentData = responseData.assessment || responseData;
            const savedAnswers = responseData.saved_answers || {};

            // Check if already submitted (completed)
            const existingSubmission = submissionsData?.find((s: any) => s.assessment_id === id && s.status !== "in_progress");
            if (existingSubmission) {
                showToast("You have already submitted this assessment.", "info");
                if (onComplete) {
                    onComplete();
                } else {
                    router.replace(`/candidate/assessments/${id}/result`);
                }
                return;
            }

            setAssessment(assessmentData);

            // Map saved answers back to indices if MCQ
            const restoredAnswers: Record<string, string> = {};
            Object.entries(savedAnswers as Record<string, string>).forEach(([qid, val]) => {
                const q = assessmentData.questions.find((q: any) => q.id === qid);
                if (q && q.type === "MCQ") {
                    const idx = q.options.indexOf(val);
                    restoredAnswers[qid] = idx !== -1 ? idx.toString() : val;
                } else {
                    restoredAnswers[qid] = val;
                }
            });
            setAnswers(restoredAnswers);

            // Initialize timer (duration in minutes * 60)
            // Ideally we should adjust time based on started_at if resuming
            setTimeLeft(assessmentData.duration * 60);

        } catch (err: any) {
            console.error("Failed to fetch assessment", err);
            // Handle access denied (e.g. Phase protection)
            if (err.status === 403 || err.message?.includes("pass the previous phase")) {
                showToast(err.message || "Access denied.", "error");
                router.push("/candidate/dashboard"); // Or wherever appropriate
            } else {
                showToast("Failed to load assessment. Please try again.", "error");
            }
        } finally {
            setLoading(false);
        }
    };

    // Auto-save logic
    useEffect(() => {
        if (!assessment || Object.keys(answers).length === 0) return;

        const timer = setTimeout(() => {
            saveProgress();
        }, 2000); // Auto-save every 2s after last change

        return () => clearTimeout(timer);
    }, [answers, assessment]);

    const saveProgress = async () => {
        if (!assessment) return;
        try {
            const formattedAnswers = assessment.questions.map(q => {
                let value = answers[q.id] || "";
                // If MCQ, mapping index back to text
                if (q.type === "MCQ" && value !== "") {
                    const idx = parseInt(value);
                    if (!isNaN(idx) && q.options[idx]) {
                        value = q.options[idx];
                    }
                }
                return {
                    question_id: q.id,
                    value: value
                };
            }).filter(a => a.value !== ""); // Only save what we have

            if (formattedAnswers.length === 0) return;

            await apiRequest(`/api/assessments/${assessment.id}/progress`, "POST", {
                answers: formattedAnswers,
                violations: loggedViolations
            });
            // Quietly save, no toast needed for background save
        } catch (err) {
            console.error("Failed to auto-save progress", err);
        }
    };

    // Timer Logic
    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev !== null && prev <= 1) {
                    clearInterval(timerRef.current!);
                    submitAssessment(true); // Auto-submit
                    return 0;
                }
                return prev !== null ? prev - 1 : 0;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const handleAnswerChange = (value: string) => {
        const questionId = assessment?.questions[currentQuestionIndex]?.id || "";
        setAnswers(prev => ({
            ...prev,
            [questionId]: value
        }));
    };

    const confirmSubmit = () => {
        setShowSubmitModal(true);
    };

    const submitAssessment = async (autoSubmit = false) => {
        if (!assessment) return;

        setSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setShowSubmitModal(false);

        try {
            const formattedAnswers = assessment.questions.map(q => {
                let value = answers[q.id] || "";
                // If MCQ, mapping index back to text
                if (q.type === "MCQ" && value !== "") {
                    const idx = parseInt(value);
                    if (!isNaN(idx) && q.options[idx]) {
                        value = q.options[idx];
                    }
                }
                return {
                    question_id: q.id,
                    value: value
                };
            });

            await apiRequest(`/api/assessments/${assessment.id}/submit`, "POST", {
                answers: formattedAnswers,
                violations: loggedViolations
            });

            if (autoSubmit) {
                showToast("Time's up! Your assessment has been automatically submitted.", "info");
            } else {
                showToast("Assessment submitted successfully!", "success");
            }

            if (onComplete) {
                onComplete();
            } else {
                router.push(`/candidate/assessments/${assessment.id}/result`);
            }
        } catch (err: any) {
            console.error("Submission error", err);
            showToast(err.message || "Failed to submit assessment. Please try again.", "error");
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

    if (!assessment) return <div className="p-8 text-center">Assessment not found or failed to load.</div>;

    const currentQuestion = assessment.questions ? assessment.questions[currentQuestionIndex] : null;

    if (!currentQuestion) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="text-yellow-500 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Question Not Found</h2>
                <p className="text-gray-500 mb-6">Unable to load question {currentQuestionIndex + 1}.</p>
            </div>
        );
    }

    const isLastQuestion = assessment.questions ? currentQuestionIndex === assessment.questions.length - 1 : true;

    if (!examStarted) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-lg w-full text-center">
                    <ShieldAlert className="text-indigo-600 mx-auto mb-6" size={56} />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{assessment.title}</h1>
                    <p className="text-gray-600 mb-6 text-sm">
                        This is a secure assessment. Once started, you must remain in <strong>Full-Screen Mode</strong>.
                        Do not exit full-screen, switch tabs, or open other applications.
                    </p>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 text-left text-sm text-orange-800">
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Violation 1 & 2:</strong> You will receive a strict warning.</li>
                            <li><strong>Violation 3:</strong> Your exam will be immediately aborted and submitted as-is.</li>
                        </ul>
                    </div>

                    {calibrationStep === 'calibrating' && (
                        <div className="mb-6">
                            <div className="relative inline-block overflow-hidden rounded-lg border-2 border-indigo-200 bg-black">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="h-48 w-64 object-cover scale-x-[-1]"
                                />
                                <div className={`absolute bottom-0 left-0 right-0 p-2 text-xs font-bold ${isPostureCorrect ? "bg-green-500" : "bg-red-500"} text-white`}>
                                    {calibrationFeedback}
                                </div>
                            </div>
                        </div>
                    )}

                    {!modelsLoaded && (
                        <div className="mb-4 text-sm font-medium text-amber-600 flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
                            Loading AI secure environment...
                        </div>
                    )}

                    {calibrationStep === 'not_started' ? (
                        <button
                            onClick={startCalibration}
                            disabled={!modelsLoaded || !assessment.questions || assessment.questions.length === 0}
                            className="w-full flex justify-center items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-medium transition-colors"
                        >
                            <Camera size={18} />
                            {(!assessment.questions || assessment.questions.length === 0) ? "No Questions Available" : "Enable Camera & Verify Posture"}
                        </button>
                    ) : (
                        <button
                            onClick={startExamMode}
                            disabled={!isPostureCorrect}
                            className={`w-full flex justify-center items-center gap-2 px-6 py-3 rounded-lg shadow-sm font-medium transition-colors ${isPostureCorrect
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                }`}
                        >
                            <CheckCircle size={18} />
                            Acknowledge & Start Exam
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`min-h-screen bg-gray-50 flex flex-col ${examStarted ? "z-[9999] fixed inset-0 !top-0 !left-0 !right-0 !bottom-0 !m-0 !w-screen !h-screen" : ""}`}>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{assessment.title}</h1>
                        <div className="text-sm text-gray-500">
                            Question {currentQuestionIndex + 1} of {assessment.questions ? assessment.questions.length : 0}
                        </div>
                    </div>
                    {/* Mirrored video feed for monitoring */}
                    <div className="relative">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-16 w-24 object-cover rounded border border-gray-200 bg-black scale-x-[-1]"
                        />
                        <div className="absolute top-1 left-1 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 rounded text-[9px] font-bold text-white tracking-wider">
                            <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                LIVE
                            </div>
                            <div className="w-px h-2.5 bg-white/30 mx-0.5"></div>
                            <Mic size={10} className="text-white" />
                        </div>
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg ${timeLeft !== null && timeLeft < 300 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700"
                    }`}>
                    <Clock size={20} />
                    {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[400px] flex flex-col">
                    <div className="flex-1">
                        <div className="mb-6">
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded mb-2">
                                {currentQuestion.type} &bull; {currentQuestion.points} Points
                            </span>
                            <h2 className="text-2xl font-medium text-gray-900">{currentQuestion.text}</h2>
                        </div>

                        <div className="space-y-4">
                            {currentQuestion.type === "MCQ" && currentQuestion.options.map((opt, idx) => (
                                <label key={idx} className={`flex items-center p-4 border rounded-lg cursor-pointer transition ${answers[currentQuestion.id] === idx.toString()
                                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                                    : "border-gray-200 hover:bg-gray-50"
                                    }`}>
                                    <input
                                        type="radio"
                                        name={`question-${currentQuestion.id}`}
                                        value={idx.toString()}
                                        checked={answers[currentQuestion.id] === idx.toString()}
                                        onChange={() => handleAnswerChange(idx.toString())}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="ml-3 text-gray-700">{opt}</span>
                                </label>
                            ))}

                            {(currentQuestion.type === "SUBJECTIVE" || currentQuestion.type === "CODING") && (
                                <textarea
                                    value={answers[currentQuestion.id] || ""}
                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                    className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm leading-relaxed text-gray-900"
                                    placeholder="Type your answer here..."
                                />
                            )}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center">
                        <button
                            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentQuestionIndex === 0}
                            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={20} /> Previous
                        </button>

                        {isLastQuestion ? (
                            <button
                                onClick={confirmSubmit}
                                disabled={submitting}
                                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-70"
                            >
                                {submitting ? "Submitting..." : (
                                    <>
                                        Submit Assessment <CheckCircle size={18} />
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => setCurrentQuestionIndex(prev => Math.min(assessment.questions.length - 1, prev + 1))}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm"
                            >
                                Next <ChevronRight size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                title="Submit Assessment"
                footer={
                    <>
                        <button
                            onClick={() => setShowSubmitModal(false)}
                            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => submitAssessment(false)}
                            className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium"
                        >
                            Confirm Submit
                        </button>
                    </>
                }
            >
                <p className="text-gray-600">
                    Are you sure you want to submit your assessment?
                    <br />
                    You cannot change your answers after submission.
                </p>
            </Modal>

            {/* Anti Cheat Warning Modal */}
            <Modal
                isOpen={showWarningModal}
                onClose={() => { }} // Disable closing via background click or Esc
                title="SECURE EXAM VIOLATION"
            >
                <div className="text-center">
                    <AlertTriangle className="text-red-600 mx-auto mb-4" size={48} />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Warning {violations} of 3</h3>
                    <p className="text-gray-600 mb-4">{violationReason}</p>

                    {violationEvidence && (
                        <div className="mb-6 rounded-lg overflow-hidden border border-gray-200">
                            <div className="bg-red-50 px-3 py-2 border-b border-red-100 text-sm font-medium text-red-800">
                                EVIDENCE CAPTURE
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={violationEvidence} alt="Violation Evidence" className="w-full h-auto" />
                        </div>
                    )}

                    {violations >= 3 ? (
                        <p className="text-red-600 font-bold">Your assessment is being submitted automatically.</p>
                    ) : (
                        <button
                            onClick={async () => {
                                setShowWarningModal(false);
                                setViolationEvidence(null);
                                try {
                                    await document.documentElement.requestFullscreen();
                                } catch (e) { }
                            }}
                            className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                        >
                            Acknowledge & Resume
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
}
