"use client";

import Navbar from "@/components/Navbar";
import { CheckCircle2, ShieldAlert, MonitorUp, Send, FileSpreadsheet, Lock } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const features = [
  {
    name: "AI Proctoring & Secure Cloud Storage",
    description: "Real-time face tracking, posture analysis, and audio noise detection. Video evidence is automatically uploaded to encrypted cloud storage.",
    icon: ShieldAlert,
  },
  {
    name: "Instant Proctoring Alerts",
    description: "Recruiters and proctors receive instant mobile and desktop ping notifications the moment a fatal violation or exam completion occurs.",
    icon: Send,
  },
  {
    name: "Universal Upload Hub",
    description: "Ingest thousands of questions instantly via CSV mapping, raw JSON dump, or manual entry through the Question Bank Upload Hub.",
    icon: FileSpreadsheet,
  },
  {
    name: "AI Resume Smart Parsing",
    description: "Upload candidate resumes to instantly generate matched question banks and technical evaluations tailored to their exact skill set.",
    icon: MonitorUp,
  },
];

export default function Home() {
  return (
    <div className="bg-white min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100 via-white to-white opacity-70"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 mb-6">
              Evaluation <span className="text-indigo-600">Reimagined</span>
            </h1>
            <p className="mt-4 text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              The end-to-end autonomous hiring platform featuring AI proctoring, smart resume parsing, and instant mobile violation alerts.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Link
                href="/login"
                className="px-8 py-4 rounded-full bg-indigo-600 text-white text-lg font-semibold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Start Hiring
              </Link>
              <Link
                href="#features"
                className="px-8 py-4 rounded-full bg-white text-gray-700 text-lg font-semibold border border-gray-200 hover:bg-gray-50 transition shadow-sm hover:shadow-md"
              >
                Learn More
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-base font-semibold text-indigo-600 tracking-wide uppercase">Core Platform</h2>
            <p className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Engineered for integrity and scale
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
              We ditched generic tools for a custom-built, highly secure assessment pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100"
              >
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-100 text-indigo-600 mb-6">
                  <feature.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.name}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl mb-6">
                Bulletproof Security Architecture
              </h2>
              <p className="text-lg text-gray-500 mb-8 leading-relaxed">
                HireIt enforces strict viewport tracking and continuous sensory monitoring. All violations are logged backed by irrefutable video evidence uploaded securely to encrypted cloud storage.
              </p>
              <ul className="space-y-4">
                {[
                  "Browser lock & tab-switching detection",
                  "Continuous BlazeFace tracking to ensure presence",
                  "Head rotation tracking (looking away from screen)",
                  "Automatic violation video evidence clipping",
                  "Audio spike algorithms for background noise"
                ].map((item) => (
                  <li key={item} className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-indigo-500 mr-3 shrink-0" />
                    <span className="text-gray-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 lg:mt-0 relative">
              <div className="absolute inset-0 bg-indigo-200 rounded-3xl transform rotate-3 scale-105 opacity-20"></div>
              <div className="relative bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800">
                {/* Mock UI for Alert Notification */}
                <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Lock className="text-indigo-400 h-5 w-5" />
                    <span className="text-gray-200 font-semibold tracking-wide">Live Proctoring Alerts</span>
                  </div>
                  <div className="text-gray-500 text-xs font-mono border border-gray-800 px-2 py-1 rounded">LIVE</div>
                </div>
                <div className="space-y-4 font-mono text-sm">
                  <div className="flex gap-4">
                    <span className="text-gray-500">[14:32:01]</span>
                    <span className="text-red-400">ALERT: Multiple faces detected</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-gray-500">[14:32:02]</span>
                    <span className="text-gray-300">Candidate: John Doe (Assessment: P1 QA)</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-gray-500">[14:32:05]</span>
                    <span className="text-indigo-400">Evidence generated & uploaded to cloud storage.</span>
                  </div>
                  <div className="flex gap-4 mt-6 p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                    <span className="text-emerald-400">View Evidence Video → url.hireit.com/vid_x9a</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <span className="font-bold text-xl text-gray-900">HireIt</span>
            <p className="text-gray-500 text-sm mt-1">© 2026 HireIt Inc. All rights reserved.</p>
          </div>
          <div className="flex space-x-6">
            <span className="text-gray-400 text-sm">Engineered for integrity.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
