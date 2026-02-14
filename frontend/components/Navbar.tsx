"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-indigo-600" />
                        <span className="font-bold text-xl text-gray-900 tracking-tight">
                            BroAssess
                        </span>
                    </div>

                    <div className="hidden md:flex items-center space-x-8">
                        <Link href="#features" className="text-gray-600 hover:text-indigo-600 transition-colors font-medium">
                            Features
                        </Link>
                        <Link href="#how-it-works" className="text-gray-600 hover:text-indigo-600 transition-colors font-medium">
                            How it Works
                        </Link>
                        <Link href="/login" className="px-5 py-2.5 rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition lg:ml-4 shadow-lg shadow-indigo-200">
                            Get Started
                        </Link>
                    </div>

                    <div className="md:hidden flex items-center">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="text-gray-600 hover:text-indigo-600 transition-colors"
                        >
                            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-white border-b border-gray-100"
                    >
                        <div className="px-4 pt-2 pb-6 space-y-2">
                            <Link
                                href="#features"
                                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-50"
                                onClick={() => setIsOpen(false)}
                            >
                                Features
                            </Link>
                            <Link
                                href="#how-it-works"
                                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-50"
                                onClick={() => setIsOpen(false)}
                            >
                                How it Works
                            </Link>
                            <div className="pt-4">
                                <Link
                                    href="/login"
                                    className="block w-full text-center px-5 py-3 rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-md"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Get Started
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
