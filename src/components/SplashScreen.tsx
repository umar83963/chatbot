/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity, ShieldCheck, Heart } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const calculatedProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(calculatedProgress);

      if (elapsed >= duration) {
        clearInterval(interval);
        onComplete();
      }
    }, 30);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div id="splash-screen" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-500 overflow-hidden">
      {/* Background elegant ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/10 dark:bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/10 dark:bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-75" />

      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center">
        {/* Animated Icon Container */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative flex items-center justify-center w-24 h-24 mb-6 rounded-3xl bg-blue-600 shadow-xl shadow-blue-500/20 text-white"
        >
          <div className="absolute inset-0 bg-blue-500 rounded-3xl blur-md opacity-40 animate-pulse" />
          <Heart className="w-12 h-12 text-white animate-heartbeat relative z-10" />
          <Activity className="absolute bottom-3 right-3 w-5 h-5 text-blue-200" />
        </motion.div>

        {/* Brand Typography */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-2"
        >
          MedLingo <span className="text-blue-600 dark:text-blue-400">AI</span>
        </motion.h1>

        <motion.p
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-slate-500 dark:text-slate-400 text-sm font-medium tracking-wide mb-12"
        >
          AI-Powered Clinical Prescription Translator
        </motion.p>

        {/* Progress Bar Container */}
        <div className="w-64 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-4 shadow-inner">
          <motion.div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ ease: "easeInOut" }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Secure HIPAA-Compliant Clinical Processing
        </motion.div>
      </div>
    </div>
  );
}
