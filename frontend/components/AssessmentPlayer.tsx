"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation"; // Note: used for navigation after submit
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Clock, CheckCircle, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert, Camera, Maximize2, Mic } from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import * as faceapi from "@vladmandic/face-api";
import AssessmentSidebar from "./assessment/AssessmentSidebar";


interface Question {
    id: string;
    text: string;
    type: "MCQ" | "SUBJECTIVE" | "CODING";
    options: string[];
    points: number;
    audio_url?: string; // For Listening questions
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

    const isDemoUser = useRef(false);

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                isDemoUser.current = !!user.is_demo;
            } catch (e) {}
        }
    }, []);

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
    const violationQueue = useRef<Array<{ reason: string; evidence?: string }>>([]);
    const isModalOpenRef = useRef(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [calibrationStep, setCalibrationStep] = useState<'not_started' | 'calibrating' | 'completed'>('not_started');
    const [calibrationFeedback, setCalibrationFeedback] = useState("Position your face within the frame");
    const [isPostureCorrect, setIsPostureCorrect] = useState(false);
    const [headerWarning, setHeaderWarning] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectionInterval = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isRecordingRef = useRef(false);
    const lastViolationTimeRef = useRef<Record<string, number>>({});
    const [stream, setStream] = useState<MediaStream | null>(null);
    const questionAudioRef = useRef<HTMLAudioElement | null>(null);

    // Snapshot State
    const [snapshots, setSnapshots] = useState<{
        initial?: { image: string, descriptor?: Float32Array };
        middle?: { image: string, descriptor?: Float32Array };
        end?: { image: string, descriptor?: Float32Array };
    }>({});
    const snapshotsRef = useRef<{
        initial?: { image: string, descriptor?: Float32Array };
        middle?: { image: string, descriptor?: Float32Array };
        end?: { image: string, descriptor?: Float32Array };
    }>({});
    const [middleSnapshotTaken, setMiddleSnapshotTaken] = useState(false);

    useEffect(() => {
        const loadModels = async () => {
            try {
                await tf.ready();
                await blazeface.load();
                await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
                await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                setModelsLoaded(true);
            } catch (err) {
                console.error("Failed to load TFJS models", err);
            }
        };
        loadModels();
    }, []);

    const captureSnapshot = async (type: 'initial' | 'middle' | 'end', retries = 5) => {
        if (isDemoUser.current) {
            return { image: "", descriptor: undefined };
        }

        const video = videoRef.current;
        if (!video) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 500));
                return captureSnapshot(type, retries - 1);
            }
            return null;
        }

        // Wait for video to be ready
        if (video.readyState !== 4) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 500));
                return captureSnapshot(type, retries - 1);
            }
            return null;
        }

        const canvas = canvasRef.current;
        if (!canvas) return null;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

            let descriptor: Float32Array | undefined = undefined;
            try {
                // Use a slightly larger detector for better accuracy on snapshots
                const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                if (detection) {
                    descriptor = detection.descriptor;
                }
            } catch (e) {
                console.error(`Failed to extract face descriptor for ${type}`, e);
            }

            const snapshotData = { image: imageBase64, descriptor };
            
            // Update ref to avoid stale closures in submit function
            snapshotsRef.current[type] = snapshotData;

            setSnapshots(prev => ({
                ...prev,
                [type]: snapshotData
            }));
            return snapshotData;
        }
        return null;
    };

    const showHeaderWarning = (msg: string) => {
        setHeaderWarning(msg);
        // Auto-clear after 5 seconds
        setTimeout(() => setHeaderWarning(prev => prev === msg ? null : prev), 5000);
    };

    const showNextViolationModal = () => {
        const next = violationQueue.current.shift();
        if (!next) {
            isModalOpenRef.current = false;
            return;
        }
        isModalOpenRef.current = true;
        setViolationReason(next.reason);
        setViolationEvidence(next.evidence ?? null);
        setShowWarningModal(true);
    };

    const handleViolation = (reason: string, evidenceBase64?: string) => {
        setViolations(prev => {
            const newCount = prev + 1;

            if (newCount >= 3) {
                // Fatal — queue it then auto-submit after
                violationQueue.current.push({ reason, evidence: evidenceBase64 });
                if (!isModalOpenRef.current) showNextViolationModal();
                submitAssessment(true);
            } else {
                violationQueue.current.push({ reason, evidence: evidenceBase64 });
                if (!isModalOpenRef.current) showNextViolationModal();
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
        // Bypass image capture if demo user
        if (ctx && !isDemoUser.current) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            evidenceBase64 = canvas.toDataURL('image/jpeg');
        }

        if (isFatal) {
            handleViolation(reason, evidenceBase64);
        } else {
            showHeaderWarning(reason);
            
            const now = Date.now();
            const lastTime = lastViolationTimeRef.current[type] || 0;
            
            // Apply a 60-second cooldown per non-fatal violation type for BACKEND logging only
            if (now - lastTime < 60000) {
                return;
            }
            lastViolationTimeRef.current[type] = now;

            // Non-fatal logging (backend only)
            const violation = {
                timestamp: new Date().toISOString(),
                type: type,
                reason: reason,
                evidence: evidenceBase64
            };
            setLoggedViolations(prev => [...prev, violation]);
            console.warn(`[Non-Fatal Violation Logged]: ${reason}`);

            // Trigger immediate progress save so backend has the record for video linking
            saveProgress([...loggedViolations, violation]);
            // Start 7-second Video Evidence Recording
            if (stream && !isRecordingRef.current) {
                isRecordingRef.current = true;
                
                // Determine supported mime type
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') 
                    ? 'video/webm;codecs=vp8' 
                    : MediaRecorder.isTypeSupported('video/webm') 
                        ? 'video/webm' 
                        : 'video/mp4';

                const mediaRecorder = new MediaRecorder(stream, { mimeType });
                const chunks: BlobPart[] = [];

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    isRecordingRef.current = false;
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const formData = new FormData();
                    formData.append("video", blob, "evidence.webm");
                    formData.append("timestamp", violation.timestamp);

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
            
            // Notify backend that exam has started to initialize started_at
            apiRequest(`/api/assessments/${assessmentId}/progress`, "POST", {
                answers: [],
                violations: []
            }).catch(err => console.error("Failed to initialize exam start time", err));

            setTimeout(() => captureSnapshot('initial'), 1000);

            const model = await blazeface.load();
            let missingFaceCount = 0;
            detectionInterval.current = setInterval(async () => {
                if (videoRef.current && videoRef.current.readyState === 4) {
                    const predictions = await model.estimateFaces(videoRef.current, false);
                    
                    if (predictions.length === 0) {
                        captureEvidenceAndViolate("Camera blocked or no face detected", false, "camera_blockage");
                    } else {
                        if (predictions.length > 1) {
                            captureEvidenceAndViolate("Multiple people detected in frame", false, "multiple_people");
                        } else {
                            // Head Rotation Detection (Looking away)
                            const face = predictions[0] as any;
                            const landmarks = face.landmarks;
                            const rightEye = landmarks[0];
                            const leftEye = landmarks[1];
                            const nose = landmarks[2];

                            const eyesCenterX = (rightEye[0] + leftEye[0]) / 2;
                            const eyeGap = Math.abs(rightEye[0] - leftEye[0]);
                            const noseOffset = Math.abs(nose[0] - eyesCenterX);

                            // If nose is offset by more than 35% of the eye gap, user is looking sideways
                            if (noseOffset > eyeGap * 0.35) {
                                captureEvidenceAndViolate("Candidate looking away from screen", false, "looking_away");
                            }
                        }
                    }
                }
            }, 400);

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
                        captureEvidenceAndViolate("Continuous speaking or background noise detected", false, "audio_anomaly");
                    }
                }, 300);
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
    }, [answers, assessment, loggedViolations]);

    // Pause audio clip when navigating to a different question
    useEffect(() => {
        if (questionAudioRef.current) {
            questionAudioRef.current.pause();
            questionAudioRef.current.currentTime = 0;
        }
    }, [currentQuestionIndex]);

    const saveProgress = async (overrideViolations?: any[]) => {
        if (!assessment) return;
        const violationsToSave = overrideViolations || loggedViolations;

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
                 violations: violationsToSave
             });
            // Quietly save, no toast needed for background save
        } catch (err) {
            console.error("Failed to auto-save progress", err);
        }
    };

    // Timer Logic - FIXED
    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0 || !assessment || !examStarted) return;

        const halfDuration = Math.floor((assessment.duration * 60) / 2);

        // Clear existing interval if any (though useRef should prevent duplicates)
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev === null) return null;
                
                const next = prev - 1;

                if (next === halfDuration && !middleSnapshotTaken) {
                    setMiddleSnapshotTaken(true);
                    captureSnapshot('middle');
                }

                if (next <= 0) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    submitAssessment(true); // Auto-submit
                    return 0;
                }
                return next;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [assessment?.id, examStarted]); // Only restart on assessment change or exam start


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
            // Capture end snapshot exactly at submission
            const endSnapshot = await captureSnapshot('end');

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

            // Calculate Face Verification Distances (lower is better, <0.6 is generally a match for ResNet)
            let initialVsMiddleDistance = null;
            let initialVsEndDistance = null;

            const currentSnapshots = snapshotsRef.current;

            if (currentSnapshots.initial?.descriptor) {
                if (currentSnapshots.middle?.descriptor) {
                    initialVsMiddleDistance = faceapi.euclideanDistance(currentSnapshots.initial.descriptor, currentSnapshots.middle.descriptor);
                }
                if (endSnapshot?.descriptor) {
                    initialVsEndDistance = faceapi.euclideanDistance(currentSnapshots.initial.descriptor, endSnapshot.descriptor);
                }
            }

            console.log("DEBUG: Submitting Assessment", { 
                assessment_id: assessment.id,
                answers_count: formattedAnswers.length,
                answers: formattedAnswers 
            });

            await apiRequest(`/api/assessments/${assessment.id}/submit`, "POST", {
                answers: formattedAnswers,
                violations: loggedViolations,
                face_snapshots: {
                    initial_image: currentSnapshots.initial?.image || "",
                    middle_image: currentSnapshots.middle?.image || "",
                    end_image: endSnapshot?.image || "",
                    initial_vs_middle_distance: initialVsMiddleDistance,
                    initial_vs_end_distance: initialVsEndDistance
                }
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
                <p className="text-gray-600 mb-6 font-medium">Unable to load question {currentQuestionIndex + 1}.</p>
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
                    <p className="text-gray-700 mb-6 text-sm font-medium leading-relaxed">
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
            <div className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-10 shadow-sm flex justify-between items-center h-20">
                <div className="flex items-center gap-4 flex-1">
                    <div>
                        <h1 className="text-xl font-black text-gray-900 tracking-tight">{assessment.title}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 uppercase tracking-widest">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                Secure Session
                            </span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Assessment in Progress</span>
                        </div>
                    </div>
                </div>

                {headerWarning && (
                    <div className="flex-1 max-w-md mx-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
                            <ShieldAlert className="text-red-600 shrink-0" size={18} />
                            <div className="text-sm font-bold text-red-900 leading-tight">
                                {headerWarning}
                                <p className="text-[10px] font-medium text-red-600 mt-0.5 uppercase tracking-tighter">Immediate Attention Required</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">Violations</p>
                        <p className={`text-lg font-black leading-none ${violations > 0 ? 'text-red-600' : 'text-gray-900'}`}>{violations}/3</p>
                    </div>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="flex-1 p-8 max-w-[1400px] mx-auto w-full flex gap-8">
                {/* Left Column: Question Area */}
                <div className="flex-1">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[400px] flex flex-col">
                    <div className="flex-1">
                        <div className="mb-6">
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded mb-2">
                                {currentQuestion.type} &bull; {currentQuestion.points} Points
                            </span>

                            {/* Audio Player for Listening questions */}
                            {currentQuestion.audio_url && (
                                <div className="mb-5 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Mic size={15} className="text-indigo-500" />
                                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Listening Passage — Play before answering</span>
                                    </div>
                                    <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center gap-3">
                                        {currentQuestion.audio_url ? <audio src={currentQuestion.audio_url.startsWith("http") ? currentQuestion.audio_url : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}${currentQuestion.audio_url}`} controls className="h-8 flex-1" /> : <span className="text-xs text-gray-600 font-medium">No Audio Configured for this Level</span>}
                                    </div>
                                </div>
                            )}

                            <h2 className="text-2xl font-medium text-gray-900">
                                {currentQuestionIndex + 1}. {currentQuestion.text.replace(/^\d+\.\s*/, '')}
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {currentQuestion.type === "MCQ" && currentQuestion.options.map((opt, idx) => (
                                <button
                                    type="button"
                                    key={idx}
                                    onClick={() => handleAnswerChange(idx.toString())}
                                    className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition text-left ${answers[currentQuestion.id] === idx.toString()
                                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                                        : "border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                                        }`}
                                >
                                    <span className={`flex-none w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${answers[currentQuestion.id] === idx.toString()
                                        ? "bg-indigo-600 text-white"
                                        : "bg-gray-100 text-gray-500"
                                        }`}>
                                        {idx + 1}
                                    </span>
                                    <span className="text-gray-800 font-medium">{opt}</span>
                                </button>
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
                            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
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

                {/* Right Column: Sidebar */}
                <AssessmentSidebar
                    timeLeft={timeLeft}
                    formatTime={formatTime}
                    questions={assessment.questions}
                    currentQuestionIndex={currentQuestionIndex}
                    answers={answers}
                    onSelectQuestion={(idx) => setCurrentQuestionIndex(idx)}
                    videoRef={videoRef}
                    canvasRef={canvasRef}
                />
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
                                // Show next queued violation if any, else restore fullscreen
                                if (violationQueue.current.length > 0) {
                                    setTimeout(showNextViolationModal, 300);
                                } else {
                                    isModalOpenRef.current = false;
                                    try {
                                        await document.documentElement.requestFullscreen();
                                    } catch (e) { }
                                }
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
