/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Volume2,
  VolumeX,
  Globe,
  Activity,
  Clock,
  AlertCircle,
  Info,
  HelpCircle
} from "lucide-react";
import { MedicineSearchInfo } from "../types";

interface MedicineSearchProps {
  availableLanguages: string[];
  voiceSpeed?: number;
  onError: (msg: string) => void;
  globalLanguage?: string;
  t?: (key: any) => string;
}

const EXAMPLE_MEDICINES = [
  "Paracetamol",
  "Dolo 650",
  "Amoxicillin",
  "Azithromycin",
  "Metformin",
  "Crocin",
  "Cetirizine",
  "Ibuprofen"
];

export default function MedicineSearch({
  availableLanguages,
  voiceSpeed = 1.0,
  onError,
  globalLanguage = "English",
  t = (k) => k
}: MedicineSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [medicineData, setMedicineData] = useState<MedicineSearchInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Translation and speech states
  const [targetLanguage, setTargetLanguage] = useState(globalLanguage);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Sync translation target language with global language
  useEffect(() => {
    if (globalLanguage) {
      setTargetLanguage(globalLanguage);
    }
  }, [globalLanguage]);

  // Handle Search with 10-second timeout & auto-retry once
  const handleSearch = async (queryToSearch?: string) => {
    const term = (queryToSearch || searchQuery).trim();
    if (!term) return;

    setIsLoading(true);
    setNotFound(false);
    setSearchError(null);
    setMedicineData(null);
    if (isSpeaking) {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    }

    const maxAttempts = 2; // Try once + retry once on failure
    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`Medicine Search Attempt ${attempt} for query: "${term}"`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 35000); // Strict 35-second timeout to allow Gemini full generation

      try {
        const response = await fetch("/api/medicine-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medicineName: term }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorData: any = {};
          try {
            errorData = await response.json();
          } catch {
            // Not JSON
          }
          throw new Error(errorData.message || `Server responded with status ${response.status}`);
        }

        let data: any;
        try {
          data = await response.json();
        } catch (jsonErr) {
          throw new Error("Invalid response format received from server.");
        }

        if (data.error) {
          throw new Error(data.message || "Failed to retrieve medicine information.");
        }

        // Success!
        if (data.found === false) {
          setNotFound(true);
        } else {
          setMedicineData(data);
        }

        clearTimeout(timeoutId);
        setIsLoading(false);
        return; // Exit search successfully

      } catch (err: any) {
        console.error(`Attempt ${attempt} failed:`, err);
        lastError = err;
      } finally {
        clearTimeout(timeoutId);
      }

      // Wait 500ms before retrying the next attempt
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Both attempts failed or timed out
    setIsLoading(false);
    const errorMessage = lastError?.name === "AbortError"
      ? "Unable to retrieve medicine information. Please try again."
      : (lastError?.message || "Unable to retrieve medicine information. Please try again.");

    setSearchError(errorMessage);
    onError(errorMessage);
  };

  // Handle TTS Speak
  const toggleSpeak = () => {
    if (!window.speechSynthesis) {
      onError("Text-to-Speech is not supported in this browser.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!medicineData) return;

    // Formulate a clean structured report from the 8-field monograph
    const textToSpeak = `
      Medicine Information Report for ${medicineData.medicineName}. 
      Generic Active Chemical: ${medicineData.genericName}. 
      Therapeutic Indications and Uses: ${medicineData.uses}. 
      Standard dosage instructions: ${medicineData.dosage}. 
      Critical warning alerts: ${medicineData.warnings}. 
      Common side effects: ${medicineData.sideEffects}.
      Storage requirements: ${medicineData.storage}.
      Potential drug drug interactions: ${medicineData.drugInteractions}.
    `;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    // Map languages for speech synthesis
    const langMap: { [key: string]: string } = {
      Spanish: "es-ES",
      French: "fr-FR",
      German: "de-DE",
      Italian: "it-IT",
      Portuguese: "pt-PT",
      Arabic: "ar-SA",
      Hindi: "hi-IN",
      Chinese: "zh-CN",
      Japanese: "ja-JP",
      Korean: "ko-KR",
      Russian: "ru-RU",
      Turkish: "tr-TR"
    };

    if (langMap[targetLanguage]) {
      utterance.lang = langMap[targetLanguage];
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = voiceSpeed;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Clean speech synthesis on component unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Handle Translate
  const handleTranslate = async (lang: string) => {
    if (!medicineData) return;
    setTargetLanguage(lang);
    setIsTranslating(true);

    try {
      const response = await fetch("/api/translate-medicine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineInfo: medicineData,
          targetLanguage: lang
        })
      });

      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        let friendlyErr = `Translation server returned non-JSON response (Status ${response.status}).`;
        if (textResponse.includes("503") || textResponse.includes("Unavailable") || textResponse.toLowerCase().includes("overloaded")) {
          friendlyErr = "The translation service is currently overloaded. Please wait a moment and try again.";
        } else if (textResponse.includes("System action required") || textResponse.includes("ಸಿಸ್ಟಮ್ ಕ್ರಮದ") || textResponse.toLowerCase().includes("action required") || textResponse.includes("quota")) {
          friendlyErr = "Gemini API daily quota limit exceeded. Please configure a Paid API key in Settings or wait for the quota to reset.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html>") || textResponse.includes("<head>")) {
          friendlyErr = "The server is currently starting up or compiling. Please wait 5-10 seconds and try again.";
        }
        throw new Error(friendlyErr);
      }

      if (!response.ok || data.error) {
        throw new Error(data.message || "Failed to translate medicine information.");
      }

      setMedicineData(data);
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to translate medicine information.");
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div id="medicine-search-panel" className="w-full max-w-5xl mx-auto space-y-8">
      {/* Search Bar Container Card */}
      <div id="search-box-card" className="glass-card rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-100 dark:shadow-none relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
        
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t("AI Medicine Search")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            {t("Search any prescription or over-the-counter medicine to get verified generic active ingredient analysis, safe dosing, and clinical warnings.")}
          </p>
        </div>

        {/* Large Input box */}
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder={t("Search medicine name...")}
              className="w-full pl-5 pr-32 py-4 text-base bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
            <button
              onClick={() => handleSearch()}
              disabled={isLoading || !searchQuery.trim()}
              className="absolute right-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold text-sm rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95"
            >
              {isLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {t("Search")}
            </button>
          </div>

          {/* Quick Examples Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium mr-1">{t("Examples:")}</span>
            {EXAMPLE_MEDICINES.map((med) => (
              <button
                key={med}
                onClick={() => {
                  setSearchQuery(med);
                  handleSearch(med);
                }}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-full text-xs font-semibold border border-slate-200/40 dark:border-slate-800/40 cursor-pointer transition-all active:scale-95"
              >
                {med}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state for search */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4"
          >
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-blue-600 dark:border-t-blue-500 animate-spin" />
            <div className="space-y-1">
              <p className="text-base font-bold text-slate-800 dark:text-white">{t("Consulting Clinical Knowledge Base...")}</p>
              <p className="text-xs text-slate-400 max-w-sm">{t("Gemini is assembling brand profiles, active ingredient uses, patient warnings, and storage guidelines.")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline Search Error Message */}
      <AnimatePresence>
        {searchError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="glass-card rounded-3xl p-6 border border-rose-200/45 dark:border-rose-900/40 bg-rose-500/5 text-center flex flex-col items-center justify-center space-y-3 max-w-md mx-auto"
          >
            <div className="p-2.5 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-full">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">{t(searchError)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Not Found Error State */}
      <AnimatePresence>
        {notFound && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="glass-card rounded-3xl p-8 border border-amber-200/45 dark:border-amber-900/40 bg-amber-500/5 text-center flex flex-col items-center justify-center space-y-4 max-w-md mx-auto"
          >
            <div className="p-3 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white">{t("No medicine information found.")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                {t("We were unable to recognize this chemical name or trademark brand. Please verify the spelling or search using standard clinical terms (e.g., Paracetamol, Amoxicillin).")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Medicine Report Display */}
      <AnimatePresence>
        {medicineData && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="space-y-8 relative"
          >
            {/* Top Toolbar: Translate & Speak */}
            <div id="report-toolbar" className="flex flex-wrap items-center justify-between gap-4 bg-white/40 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/40 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t("Interactive Medicine Monograph")}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Speech synthesis controller */}
                <button
                  onClick={toggleSpeak}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSpeaking
                      ? "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40 animate-pulse"
                      : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {isSpeaking ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      {t("Stop Speaking")}
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      {t("Speak Report")}
                    </>
                  )}
                </button>

                {/* Translate Report Option */}
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl px-3 py-2 border border-slate-200/40 dark:border-slate-800/40">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <select
                    value={targetLanguage}
                    onChange={(e) => handleTranslate(e.target.value)}
                    disabled={isTranslating}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none pr-1 disabled:opacity-55 cursor-pointer"
                  >
                    {availableLanguages.map((lang) => (
                      <option key={lang} value={lang} className="text-slate-800 dark:text-slate-200">
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Translation loading screen */}
            {isTranslating && (
              <div className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 rounded-3xl z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-blue-600 dark:border-t-blue-500 animate-spin mb-3" />
                <p className="text-sm font-bold text-slate-800 dark:text-white">{t("Translating Complete Monograph...")}</p>
                <p className="text-xs text-slate-400 mt-1">{t("Abiding by clinical safety rules: preserving metric values and active brand names.")}</p>
              </div>
            )}

            {/* Grid Layout of the Monograph */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Clinical Profile & Dosage */}
              <div className="space-y-6">
                {/* 1. Core Profile Card */}
                <div id="core-profile-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
                  
                  <div className="space-y-4">
                    <span className="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider inline-block">
                      {t("Clinical Monograph")}
                    </span>
                    <div>
                      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                        {medicineData.medicineName}
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                        {t("Generic Active Ingredient:")} <span className="text-blue-600 dark:text-blue-400 font-bold">{medicineData.genericName}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Uses Card */}
                <div id="uses-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    {t("Therapeutic Indications (Uses)")}
                  </h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {medicineData.uses}
                  </p>
                </div>

                {/* 3. Dosage Card */}
                <div id="dosage-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    {t("Standard Dosage Guidelines")}
                  </h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {medicineData.dosage}
                  </p>
                </div>

                {/* 4. Storage Card */}
                <div id="storage-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-500" />
                    {t("Storage Guidelines")}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {medicineData.storage}
                  </p>
                </div>
              </div>

              {/* Right Column: Safety & Warnings */}
              <div className="space-y-6">
                {/* 1. Safety Alert Card with Red Left Border */}
                <div id="safety-warnings-card" className="glass-card rounded-3xl p-6 border-l-4 border-rose-500 bg-rose-500/5 space-y-4">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-5 h-5" />
                    <h4 className="font-display font-bold text-base">{t("Critical Safety Alerts & Warnings")}</h4>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {medicineData.warnings}
                  </p>
                </div>

                {/* 2. Side Effects Card */}
                <div id="side-effects-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    {t("Reported Side Effects")}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {medicineData.sideEffects}
                  </p>
                </div>

                {/* 3. Drug Interactions Card */}
                <div id="drug-interactions-card" className="glass-card rounded-3xl p-6 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-purple-500" />
                    {t("Potential Drug-Drug Interactions")}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                    {medicineData.drugInteractions}
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
