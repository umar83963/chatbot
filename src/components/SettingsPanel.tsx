/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Settings, Sun, Moon, Volume2, Globe, ShieldCheck } from "lucide-react";

interface SettingsPanelProps {
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
  voiceSpeed: number;
  onVoiceSpeedChange: (speed: number) => void;
  availableLanguages: string[];
  t?: (key: any) => string;
}

export default function SettingsPanel({
  currentLanguage,
  onLanguageChange,
  voiceSpeed,
  onVoiceSpeedChange,
  availableLanguages,
  t = (k) => k,
}: SettingsPanelProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Sync dark mode setting on mount and class modifications
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setIsDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
      setIsDarkMode(false);
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
      localStorage.setItem("theme", "dark");
    }
  };

  return (
    <div id="settings-panel" className="w-full max-w-4xl mx-auto">
      <div className="glass-card rounded-3xl p-8 shadow-xl shadow-slate-100 dark:shadow-none overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
            <Settings className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t("System Preferences")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            {t("Customize translation parameters, speech voice synthesis rate, and system dark modes for comfortable eye care.")}
          </p>
        </div>

        {/* Configuration cards layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Translation Settings */}
          <div className="p-6 bg-slate-50/60 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-blue-500" />
                <h3 className="font-display font-bold text-sm text-slate-800 dark:text-white">
                  {t("Global Target Language")}
                </h3>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
                {t("Choose the default target translation language for structured medical prescription analysis.")}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl flex items-center shadow-sm">
              <select
                value={currentLanguage}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang} className="text-slate-800 dark:text-slate-200">
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Text-To-Speech Velocity Settings */}
          <div className="p-6 bg-slate-50/60 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Volume2 className="w-5 h-5 text-indigo-500" />
                <h3 className="font-display font-bold text-sm text-slate-800 dark:text-white">
                  {t("Voice Synthesis Speed")}
                </h3>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
                {t("Tune the rate of vocal narration synthesis to support clear, comfortable listening.")}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 font-mono font-bold">0.5x</span>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={voiceSpeed}
                onChange={(e) => onVoiceSpeedChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-mono font-bold">
                {voiceSpeed.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* 3. Dark Mode Toggle */}
          <div className="p-6 bg-slate-50/60 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between col-span-1 md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-500 rounded-xl">
                {isDarkMode ? <Moon className="w-5 h-5 animate-pulse" /> : <Sun className="w-5 h-5 animate-spin" style={{ animationDuration: "12s" }} />}
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-slate-800 dark:text-white">
                  {t("Aesthetic Theme Mode")}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 max-w-sm sm:max-w-md">
                  {t("Toggle between deep galactic dark mode and polished hospital slate white layouts.")}
                </p>
              </div>
            </div>

            <button
              onClick={toggleDarkMode}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-500" />
                  {t("Light Mode")}
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-500" />
                  {t("Dark Mode")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audit footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          {t("MedLingo AI enforces client-side preferences and keeps HIPAA telemetry secure.")}
        </div>
      </div>
    </div>
  );
}
