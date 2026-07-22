/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart,
  LayoutDashboard,
  Camera,
  Type,
  History,
  Settings,
  AlertCircle,
  X,
  Sparkles,
  ArrowLeft,
  CloudLightning,
  Globe,
  Search,
  Sun,
  Moon,
} from "lucide-react";

import SplashScreen from "./components/SplashScreen";
import PrescriptionScanner from "./components/PrescriptionScanner";
import TranslationResult from "./components/TranslationResult";
import MedicineSearch from "./components/MedicineSearch";
import TranslationHistory from "./components/TranslationHistory";
import SettingsPanel from "./components/SettingsPanel";
import HealthChatbot from "./components/HealthChatbot";
import { PrescriptionDetails, MedicineAnalysis } from "./types";
import { AVAILABLE_LANGUAGES, LANGUAGE_NATIVE_NAMES, enUI, pretranslatedUI } from "./locales";

type Screen = "splash" | "dashboard" | "scan" | "result" | "manual" | "history" | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  
  // App state
  const [globalLanguage, setGlobalLanguage] = useState(() => {
    return localStorage.getItem("globalLanguage") || "English";
  });
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyRefreshCount, setHistoryRefreshCount] = useState(0);

  // Offline & PWA Installation states
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Theme state
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) return savedTheme;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return systemPrefersDark ? "dark" : "light";
  });

  // UI translation state
  const [translatedUI, setTranslatedUI] = useState<Record<string, string> | null>(null);
  const [isTranslatingUI, setIsTranslatingUI] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [searchLanguageQuery, setSearchLanguageQuery] = useState("");

  // Loaded analysis context
  const [activePrescription, setActivePrescription] = useState<PrescriptionDetails | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<MedicineAnalysis | null>(null);
  
  // Loaded translation cache from history
  const [initialTranslatedAnalysis, setInitialTranslatedAnalysis] = useState<MedicineAnalysis | null>(null);
  const [initialTargetLanguage, setInitialTargetLanguage] = useState<string | null>(null);

  // Sync Dark/Light theme on startup and changes
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [theme]);

  // Monitor network connectivity and PWA installation events
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      console.log("User accepted the MedLingo PWA installation.");
    } else {
      console.log("User dismissed the MedLingo PWA installation.");
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  // Fetch / Restore UI Translation on language change
  useEffect(() => {
    localStorage.setItem("globalLanguage", globalLanguage);

    if (globalLanguage === "English") {
      setTranslatedUI(null);
      return;
    }

    // Check if we have pre-translated static UI
    if (pretranslatedUI[globalLanguage]) {
      setTranslatedUI(pretranslatedUI[globalLanguage]);
      return;
    }

    const cached = localStorage.getItem(`ui_translation_${globalLanguage}`);
    if (cached) {
      try {
        setTranslatedUI(JSON.parse(cached));
        return;
      } catch (e) {
        console.error("Failed to parse cached translation", e);
      }
    }

    const fetchUITranslation = async (attempt = 1) => {
      setIsTranslatingUI(true);
      try {
        const response = await fetch("/api/translate-ui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dictionary: enUI,
            targetLanguage: globalLanguage,
          }),
        });

        const data = await response.json();
        if (response.ok && !data.error) {
          setTranslatedUI(data);
          localStorage.setItem(`ui_translation_${globalLanguage}`, JSON.stringify(data));
          setIsTranslatingUI(false);
          return;
        } else {
          throw new Error(data.message || "Failed to translate UI");
        }
      } catch (err: any) {
        if (attempt < 2) {
          console.warn(`UI Translation fetch attempt ${attempt} failed: ${err.message || err}. Retrying in 1.5s...`);
          setTimeout(() => {
            fetchUITranslation(attempt + 1);
          }, 1500);
        } else {
          console.warn(`UI Translation for ${globalLanguage} failed, falling back to English: ${err.message || err}`);
          setIsTranslatingUI(false);
        }
      }
    };

    fetchUITranslation();
  }, [globalLanguage]);

  // Translate helper function
  const t = (key: any): string => {
    if (globalLanguage === "English") {
      return (enUI as any)[key] || String(key);
    }
    return (translatedUI && translatedUI[key]) || (enUI as any)[key] || String(key);
  };

  const handleAnalysisSuccess = (
    prescription: PrescriptionDetails,
    analysis: MedicineAnalysis
  ) => {
    setActivePrescription(prescription);
    setActiveAnalysis(analysis);
    setInitialTranslatedAnalysis(null);
    setInitialTargetLanguage(null);
    setErrorMessage(null);
    setScreen("result");
    setHistoryRefreshCount((prev) => prev + 1); // Auto refresh logs
  };

  const handleLoadFromHistory = (
    prescription: PrescriptionDetails,
    analysis: MedicineAnalysis,
    translatedAnalysis: MedicineAnalysis | null = null,
    targetLang: string | null = null
  ) => {
    setActivePrescription(prescription);
    setActiveAnalysis(analysis);
    setInitialTranslatedAnalysis(translatedAnalysis);
    setInitialTargetLanguage(targetLang);
    if (targetLang) {
      setGlobalLanguage(targetLang);
    }
    setErrorMessage(null);
    setScreen("result");
  };

  const handleApiError = (msg: string) => {
    setErrorMessage(msg);
    // Auto scroll to error
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filter languages based on search query
  const filteredLanguages = AVAILABLE_LANGUAGES.filter((lang) => {
    const native = LANGUAGE_NATIVE_NAMES[lang] || "";
    return (
      lang.toLowerCase().includes(searchLanguageQuery.toLowerCase()) ||
      native.toLowerCase().includes(searchLanguageQuery.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
      
      {/* 1. Splash Screen Overlay */}
      <AnimatePresence>
        {screen === "splash" && (
          <SplashScreen onComplete={() => setScreen("dashboard")} />
        )}
      </AnimatePresence>

      {/* Main Workspace layout */}
      {screen !== "splash" && (
        <>
          {/* Offline Warning Banner */}
          <AnimatePresence>
            {isOffline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-amber-500 text-white text-xs font-semibold py-2 px-4 text-center flex items-center justify-center gap-2 z-50 relative border-b border-amber-600/20"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping" />
                <span>{t("You are currently offline. Running in secure local offline mode — some AI functions require internet connectivity.")}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header Bar */}
          <header className="sticky top-0 z-40 bg-white/70 dark:bg-slate-950/75 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              {/* Brand Logo & Global Language Switcher */}
              <div className="flex items-center gap-3">
                <div
                  onClick={() => setScreen("dashboard")}
                  className="flex items-center gap-2 cursor-pointer group select-none"
                >
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                    <Heart className="w-5 h-5 animate-heartbeat" />
                  </div>
                  <div>
                    <h1 className="font-display font-bold text-lg leading-none text-slate-900 dark:text-white">
                      MedLingo <span className="text-blue-600 dark:text-blue-400">AI</span>
                    </h1>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide mt-0.5">
                      {t("CLINICAL TRANSLATOR")}
                    </p>
                  </div>
                </div>

                {/* Global Language Switcher Button */}
                <button
                  id="global-language-switcher"
                  onClick={() => {
                    setSearchLanguageQuery("");
                    setIsLanguageModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/45 dark:border-slate-800/40 rounded-full text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer ml-2"
                >
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span>{LANGUAGE_NATIVE_NAMES[globalLanguage] || globalLanguage}</span>
                </button>

                {/* Dark Mode Toggle Button */}
                <button
                  id="theme-toggle-button"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex items-center justify-center p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/45 dark:border-slate-800/40 rounded-full shadow-sm active:scale-95 transition-all cursor-pointer ml-1.5"
                  title={theme === "dark" ? t("Switch to Light Mode") : t("Switch to Dark Mode")}
                >
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
                </button>
              </div>

              {/* Navigation Indicators */}
              <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/60 dark:bg-slate-900/60 p-1 rounded-full border border-slate-200/30 dark:border-slate-800/20">
                <button
                  onClick={() => setScreen("dashboard")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    screen === "dashboard"
                      ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  {t("Dashboard")}
                </button>
                <button
                  onClick={() => setScreen("scan")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    screen === "scan" || screen === "result"
                      ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  {t("Prescriptions")}
                </button>
                <button
                  onClick={() => setScreen("manual")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    screen === "manual"
                      ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  {t("Medicine Search")}
                </button>
                <button
                  onClick={() => setScreen("history")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    screen === "history"
                      ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  {t("History")}
                </button>
                <button
                  onClick={() => setScreen("settings")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    screen === "settings"
                      ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t("Settings")}
                </button>
              </nav>
            </div>
          </header>

          {/* Body Container */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
            
            {/* Elegant Error banner */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="mb-8 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl flex items-start justify-between gap-3 text-amber-800 dark:text-amber-400"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">{t("System Action Required")}</p>
                      <p className="text-xs mt-0.5 font-medium leading-relaxed">{errorMessage}</p>
                      <p className="text-[10px] text-amber-500 mt-1.5 font-mono">
                        {t("Automatic Retry Triggered Once (Resolved status error)")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="p-1.5 rounded-lg hover:bg-amber-100/40 text-amber-600 dark:hover:bg-amber-900/20 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Screen Router */}
            <AnimatePresence mode="wait">
              {screen === "dashboard" && (
                <motion.div
                  key="dashboard-screen"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-12"
                >
                  {/* Hero Intro Section */}
                  <div id="hero-section" className="text-center max-w-3xl mx-auto space-y-6 md:space-y-8 py-4 sm:py-6">
                    <div className="space-y-3">
                      <motion.h2
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="font-display text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl"
                      >
                        {t("AI-Powered Medical Prescription Translator")}
                      </motion.h2>
                      
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="font-display text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400"
                      >
                        {t("Scan, Analyze & Translate Prescriptions Instantly.")}
                      </motion.p>
                    </div>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                      className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto"
                    >
                      {t("Upload a handwritten prescription or medical document. MedLingo AI extracts medicine details using OCR, analyzes dosage, usage, side effects, and translates patient instructions into multiple languages while preserving medical accuracy.")}
                    </motion.p>
                  </div>

                  {/* Bento Layout Grid Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {/* Card 1: Scan Prescription */}
                    <div
                      onClick={() => setScreen("scan")}
                      className="glass-card rounded-3xl p-6 border border-slate-200/55 hover:border-blue-500/30 shadow-md hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-none transition-all duration-300 cursor-pointer group flex flex-col justify-between min-h-[190px]"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <Camera className="w-6 h-6" />
                        </div>
                        <h3 className="font-display font-bold text-slate-800 dark:text-white text-lg">
                          {t("Scan Prescription")}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs leading-relaxed">
                          {t("Scan via live camera feed, or drop high-res PDF and image files for real-time OCR parsing.")}
                        </p>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-4 flex items-center gap-1 group-hover:underline">
                        {t("Open Scanner →")}
                      </span>
                    </div>

                    {/* Card 2: AI Medicine Search */}
                    <div
                      onClick={() => setScreen("manual")}
                      className="glass-card rounded-3xl p-6 border border-slate-200/55 hover:border-indigo-500/30 shadow-md hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-none transition-all duration-300 cursor-pointer group flex flex-col justify-between min-h-[190px]"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <Search className="w-6 h-6" />
                        </div>
                        <h3 className="font-display font-bold text-slate-800 dark:text-white text-lg">
                          {t("Medicine Search")}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs leading-relaxed">
                          {t("Search any medicine name to instantly retrieve exhaustive AI-analyzed usage, dosing, safety details, and alternatives.")}
                        </p>
                      </div>
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-4 flex items-center gap-1 group-hover:underline">
                        {t("Search Medicine →")}
                      </span>
                    </div>

                    {/* Card 3: History Audit Logs */}
                    <div
                      onClick={() => setScreen("history")}
                      className="glass-card rounded-3xl p-6 border border-slate-200/55 hover:border-emerald-500/30 shadow-md hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-none transition-all duration-300 cursor-pointer group flex flex-col justify-between min-h-[190px]"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <History className="w-6 h-6" />
                        </div>
                        <h3 className="font-display font-bold text-slate-800 dark:text-white text-lg">
                          {t("Prescription Audit Logs")}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs leading-relaxed">
                          {t("Review history items, redownload reports, or fetch archived entries back to workspace panels.")}
                        </p>
                      </div>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-4 flex items-center gap-1 group-hover:underline">
                        {t("Open History Logs →")}
                      </span>
                    </div>

                    {/* Card 4: System Preferences */}
                    <div
                      onClick={() => setScreen("settings")}
                      className="glass-card rounded-3xl p-6 border border-slate-200/55 hover:border-amber-500/30 shadow-md hover:shadow-xl hover:shadow-slate-100/50 dark:hover:shadow-none transition-all duration-300 cursor-pointer group flex flex-col justify-between min-h-[190px] md:col-span-2 lg:col-span-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                            <Settings className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-display font-bold text-slate-800 dark:text-white text-lg">
                              {t("System Preferences")}
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-xs leading-relaxed max-w-xl">
                              {t("Tune default language filters (currently set to")} <strong>{LANGUAGE_NATIVE_NAMES[globalLanguage] || globalLanguage}</strong>), {t("voice speeds (currently")} <strong>{voiceSpeed}x</strong>), {t("and system eye-safe dark themes.")}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-bold shrink-0 flex items-center gap-1 group-hover:underline">
                          {t("Open Settings Preferences →")}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {screen === "scan" && (
                <motion.div
                  key="scan-screen"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button
                      onClick={() => setScreen("dashboard")}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-semibold text-slate-400">{t("Back to Dashboard")}</span>
                  </div>
                  <PrescriptionScanner
                    onAnalysisSuccess={handleAnalysisSuccess}
                    onError={handleApiError}
                    t={t}
                    globalLanguage={globalLanguage}
                  />
                </motion.div>
              )}

              {screen === "result" && activePrescription && activeAnalysis && (
                <motion.div
                  key="result-screen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setScreen("scan")}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <span className="text-sm font-semibold text-slate-400">{t("Back to Scanner")}</span>
                    </div>

                    <div className="text-xs font-mono font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-3 py-1 rounded-full animate-pulse">
                      {t("Workspace Loaded successfully")}
                    </div>
                  </div>
                  <TranslationResult
                    prescription={activePrescription}
                    analysis={activeAnalysis}
                    voiceSpeed={voiceSpeed}
                    availableLanguages={AVAILABLE_LANGUAGES}
                    onSaveSuccess={() => setHistoryRefreshCount((prev) => prev + 1)}
                    onError={handleApiError}
                    t={t}
                    globalLanguage={globalLanguage}
                    onLanguageChange={setGlobalLanguage}
                    initialTranslatedAnalysis={initialTranslatedAnalysis}
                    initialTargetLanguage={initialTargetLanguage}
                  />
                </motion.div>
              )}

              {screen === "manual" && (
                <motion.div
                  key="manual-screen"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button
                      onClick={() => setScreen("dashboard")}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-semibold text-slate-400">{t("Back to Dashboard")}</span>
                  </div>
                  <MedicineSearch
                    availableLanguages={AVAILABLE_LANGUAGES}
                    voiceSpeed={voiceSpeed}
                    onError={handleApiError}
                    t={t}
                    globalLanguage={globalLanguage}
                  />
                </motion.div>
              )}

              {screen === "history" && (
                <motion.div
                  key="history-screen"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button
                      onClick={() => setScreen("dashboard")}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-semibold text-slate-400">{t("Back to Dashboard")}</span>
                  </div>
                  <TranslationHistory
                    onLoadEntry={handleLoadFromHistory}
                    onError={handleApiError}
                    refreshTrigger={historyRefreshCount}
                    t={t}
                    globalLanguage={globalLanguage}
                  />
                </motion.div>
              )}

              {screen === "settings" && (
                <motion.div
                  key="settings-screen"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button
                      onClick={() => setScreen("dashboard")}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-semibold text-slate-400">{t("Back to Dashboard")}</span>
                  </div>
                  <SettingsPanel
                    currentLanguage={globalLanguage}
                    onLanguageChange={setGlobalLanguage}
                    voiceSpeed={voiceSpeed}
                    onVoiceSpeedChange={setVoiceSpeed}
                    availableLanguages={AVAILABLE_LANGUAGES}
                    t={t}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Footer Branding */}
          <footer className="mt-auto py-8 border-t border-slate-200/50 dark:border-slate-800/40 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 justify-center">
                <CloudLightning className="w-4 h-4 text-amber-500 animate-pulse" />
                <span>{t("MedLingo AI Workspace Framework v1.0 • Client-side sandbox verified")}</span>
              </div>
              <div>
                {t("© 2026 MedLingo AI Inc. All rights reserved. Designed for optimal clinician workflows.")}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Global Language Selection Dialog Modal */}
      <AnimatePresence>
        {isLanguageModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="glass-card rounded-3xl p-6 shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 relative flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-500" />
                  <h3 className="font-display font-bold text-slate-800 dark:text-white">
                    {t("Select Application Language")}
                  </h3>
                </div>
                <button
                  onClick={() => setIsLanguageModalOpen(false)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search languages input */}
              <div className="relative mb-4">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t("Search languages...")}
                  value={searchLanguageQuery}
                  onChange={(e) => setSearchLanguageQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 transition-colors"
                />
              </div>

              {/* Scrollable Language Grid */}
              <div className="overflow-y-auto flex-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  {filteredLanguages.map((lang) => {
                    const isSelected = globalLanguage === lang;
                    return (
                      <button
                        key={lang}
                        onClick={() => {
                          setGlobalLanguage(lang);
                          setIsLanguageModalOpen(false);
                        }}
                        className={`text-left px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                            : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800/60 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{lang}</span>
                        <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-400 dark:text-slate-500"}`}>
                          {LANGUAGE_NATIVE_NAMES[lang] || lang}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setIsLanguageModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {t("Cancel")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic full screen translating UI overlay spinner */}
      <AnimatePresence>
        {isTranslatingUI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6"
          >
            <div className="relative flex items-center justify-center w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100/10" />
              <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin" />
            </div>
            <p className="text-base font-bold text-white tracking-wide">
              {t("AI Translating Entire Interface to")} {LANGUAGE_NATIVE_NAMES[globalLanguage] || globalLanguage}...
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
              {t("This updates headings, buttons, and navigation instantly.")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Floating Installation Prompt */}
      <AnimatePresence>
        {showInstallPrompt && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 left-6 z-50 max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xl flex items-start gap-4"
          >
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl mt-0.5">
              <Heart className="w-6 h-6 animate-heartbeat" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white">{t("Install MedLingo AI")}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("Add to your home screen for instant access and lightweight offline tools.")}</p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleInstallApp}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                >
                  {t("Install")}
                </button>
                <button
                  onClick={() => setShowInstallPrompt(false)}
                  className="text-slate-500 dark:text-slate-400 text-xs px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {t("Dismiss")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating AI Health Assistant Chatbot */}
      <HealthChatbot />
    </div>
  );
}
