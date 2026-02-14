"use client";

import Navbar from "@/components/Navbar";
import { CheckCircle2, Lock, Monitor, Users, Video } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const features = [
  {
    name: "AI Proctoring",
    description: "Advanced browser-locking technology to ensure test integrity. Detects tab switching and background apps.",
    icon: Lock,
  },
  {
    name: "Meeting Integration",
    description: "Seamless Google Meet integration for scheduling and conducting live interviews.",
    icon: Video,
  },
  {
    name: "Coding Environment",
    description: "Built-in code editor for technical assessments.",
    icon: Monitor,
  },
  {
    name: "Role Management",
    description: "Distinct portals for Candidates, Interviewers, and Admins.",
    icon: Users,
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
              The all-in-one platform for secure assessments, live coding interviews, and automated scheduling.
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
            <h2 className="text-base font-semibold text-indigo-600 tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Everything you need to hire the best
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
              A comprehensive suite of tools designed to streamline your hiring process.
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
                Connect with Google Meet
              </h2>
              <p className="text-lg text-gray-500 mb-8 leading-relaxed">
                Schedule interviews effortlessly. Our platform integrates directly with Google Calendar and Meet to generate unique meeting links for every session automatically.
              </p>
              <ul className="space-y-4">
                {[
                  "Automatic link generation",
                  "Calendar sync",
                  "Secure meeting rooms",
                  "In-browser video experience"
                ].map((item) => (
                  <li key={item} className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3" />
                    <span className="text-gray-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 lg:mt-0 relative">
              <div className="absolute inset-0 bg-indigo-200 rounded-3xl transform rotate-3 scale-105 opacity-20"></div>
              <div className="relative bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800">
                {/* Mock UI for Meeting Scheduler */}
                <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <div className="text-gray-400 text-sm font-mono">meeting-scheduler.exe</div>
                </div>
                <div className="space-y-4">
                  <div className="h-8 bg-gray-800 rounded w-3/4"></div>
                  <div className="h-8 bg-gray-800 rounded w-1/2"></div>
                  <div className="h-32 bg-gray-800 rounded w-full mt-4"></div>
                  <div className="flex justify-end mt-4">
                    <div className="h-10 bg-indigo-600 rounded w-32"></div>
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
            <span className="font-bold text-xl text-gray-900">BroAssess</span>
            <p className="text-gray-500 text-sm mt-1">© 2026 BroAssess Inc. All rights reserved.</p>
          </div>
          <div className="flex space-x-6">
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Twitter</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">GitHub</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
