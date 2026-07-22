/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  Calendar,
  User,
  Activity,
  UserCheck,
  AlertTriangle,
  Globe,
  Download,
  Volume2,
  VolumeX,
  Sparkles,
  Save,
  CheckCircle,
  FileDigit,
  Clock,
  HeartPulse,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { PrescriptionDetails, MedicineAnalysis } from "../types";

interface TranslationResultProps {
  prescription: PrescriptionDetails;
  analysis: MedicineAnalysis;
  fileData?: string;
  fileType?: string;
  voiceSpeed?: number;
  availableLanguages: string[];
  onSaveSuccess?: () => void;
  onError: (msg: string) => void;
  globalLanguage?: string;
  t?: (key: any) => string;
  onLanguageChange?: (lang: string) => void;
  initialTranslatedAnalysis?: MedicineAnalysis | null;
  initialTargetLanguage?: string | null;
}

export default function TranslationResult({
  prescription,
  analysis,
  voiceSpeed = 1.0,
  availableLanguages,
  onSaveSuccess,
  onError,
  globalLanguage = "English",
  t = (k) => k,
  onLanguageChange,
  initialTranslatedAnalysis = null,
  initialTargetLanguage = null,
}: TranslationResultProps) {
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLanguage || globalLanguage);
  const [translatedAnalysis, setTranslatedAnalysis] = useState<MedicineAnalysis | null>(initialTranslatedAnalysis || null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Update state when initial load changes (e.g., from history)
  useEffect(() => {
    if (initialTranslatedAnalysis) {
      setTranslatedAnalysis(initialTranslatedAnalysis);
      setIsSaved(true); // Since it's from history, it is already saved
    } else {
      setTranslatedAnalysis(null);
      setIsSaved(false);
    }
    if (initialTargetLanguage) {
      setTargetLanguage(initialTargetLanguage);
    } else {
      setTargetLanguage(globalLanguage);
    }
  }, [initialTranslatedAnalysis, initialTargetLanguage, analysis]);

  // Sync target language dropdown when global language changes
  useEffect(() => {
    if (globalLanguage) {
      setTargetLanguage(globalLanguage);
    }
  }, [globalLanguage]);

  // Reactive auto translate
  useEffect(() => {
    if (!globalLanguage) return;

    if (globalLanguage === "English") {
      setTranslatedAnalysis(null);
      return;
    }

    // If we have a cached translation matching the requested language, use it and skip API translation
    if (initialTranslatedAnalysis && initialTargetLanguage === globalLanguage) {
      setTranslatedAnalysis(initialTranslatedAnalysis);
      setTargetLanguage(initialTargetLanguage);
      return;
    }

    const triggerAutoTranslate = async () => {
      setIsTranslating(true);
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medicineAnalysis: analysis,
            targetLanguage: globalLanguage,
          }),
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
          throw new Error(data.message || "Failed to translate analysis.");
        }

        setTranslatedAnalysis(data);
        setIsSaved(false);
      } catch (err: any) {
        console.error("Auto translate failed:", err);
        onError(err.message || "Error occurred during translation.");
      } finally {
        setIsTranslating(false);
      }
    };

    triggerAutoTranslate();
  }, [globalLanguage, analysis]);

  // Translate analysis manually via the local select dropdown
  const handleTranslate = async () => {
    if (onLanguageChange) {
      onLanguageChange(targetLanguage);
    }
  };

  // Browser Text-To-Speech
  const speakText = (text: string) => {
    if (!window.speechSynthesis) {
      onError("Text-To-Speech is not supported in this browser.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set appropriate language locale if known
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
      Turkish: "tr-TR",
    };

    if (translatedAnalysis && langMap[targetLanguage]) {
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

  // Compile medical details to SQL history
  const handleSaveToHistory = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: prescription.patientName,
          doctor_name: prescription.doctorName,
          hospital_name: prescription.hospitalName,
          prescription_date: prescription.prescriptionDate,
          original_text: prescription.rawText,
          ocr_json: prescription,
          analysis_json: analysis,
          translated_text_json: translatedAnalysis,
          target_language: translatedAnalysis ? targetLanguage : null,
        }),
      });

      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        throw new Error(`Database save returned non-JSON response (Status ${response.status}): ${textResponse.substring(0, 100)}`);
      }

      if (!response.ok || data.error) {
        throw new Error(data.message || "Failed to persist log.");
      }

      setIsSaved(true);
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to save prescription logs.");
    } finally {
      setIsSaving(false);
    }
  };

  // jsPDF Professional PDF generator
  const downloadPDFReport = () => {
    try {
      const doc = new jsPDF();
      let y = 15;

      // Color Theme definitions
      const primaryColor = [15, 23, 42]; // deep charcoal slate
      const accentColor = [37, 99, 235]; // medical blue
      const secondaryColor = [71, 85, 105]; // Slate
      const alertColor = [220, 38, 38]; // emergency red

      // 1. Header Banner
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 32, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("MedLingo AI", 15, 18);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(200, 220, 255);
      doc.text("PROFESSIONAL CLINICAL INTERPRETATION REPORT", 15, 25);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 155, 25);

      y = 42;

      // 2. Patient & Clinician Details Card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, 180, 40, 3, 3, "F");
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(15, y, 180, 40, 3, 3, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("PRESCRIPTION AUDIT LOG & DEMOGRAPHICS", 20, y + 8);

      doc.setDrawColor(203, 213, 225);
      doc.line(20, y + 12, 190, y + 12);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Patient Name:", 20, y + 20);
      doc.text("Date Prescribed:", 20, y + 26);
      doc.text("Hospital/Clinic:", 20, y + 32);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(prescription.patientName || "Not Specified", 50, y + 20);
      doc.text(prescription.prescriptionDate || "Not Specified", 50, y + 26);
      doc.text(prescription.hospitalName || "Not Specified", 50, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("Doctor Name:", 110, y + 20);
      doc.text("Document Status:", 110, y + 26);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(prescription.doctorName || "Not Specified", 135, y + 20);
      doc.text("Verified OCR / Clinical Analysis", 135, y + 26);

      y += 50;

      // Helper to draw text with automatic word-wrapping
      const drawWrappedText = (title: string, content: string, startY: number, titleColor = primaryColor, bodyColor = secondaryColor) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text(title, 15, startY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
        const splitText = doc.splitTextToSize(content, 180);
        doc.text(splitText, 15, startY + 5);
        return startY + 5 + (splitText.length * 4.5);
      };

      // 3. AI Clinical Analysis Section (Original English)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text("CLINICAL INGREDIENT & PHARMACOLOGICAL OVERVIEW", 15, y);
      doc.line(15, y + 2, 195, y + 2);
      y += 8;

      y = drawWrappedText("Prescribed Brand:", analysis.medicineName, y);
      y = drawWrappedText("Scientific Generic Name:", analysis.genericName, y);
      
      const timingText = `Morning: ${analysis.timing.morning ? "YES" : "NO"} | Afternoon: ${analysis.timing.afternoon ? "YES" : "NO"} | Night: ${analysis.timing.night ? "YES" : "NO"} ${analysis.timing.additional ? `(${analysis.timing.additional})` : ""}`;
      y = drawWrappedText("Clinician Dosing & Timing:", `${analysis.dailyDose} — ${timingText}`, y);
      
      y = drawWrappedText("Therapeutic Uses:", analysis.uses, y);
      y = drawWrappedText("Short Mechanism Summary:", analysis.shortDescription, y);
      y = drawWrappedText("Common Side Effects:", analysis.sideEffects, y);

      // Warning block highlights with critical color accent
      y = drawWrappedText("CRITICAL MEDICAL WARNINGS / CONTRAINDICATIONS:", analysis.warnings, y, alertColor, alertColor);
      y = drawWrappedText("Consolidated Patient Instructions:", analysis.doctorInstructions, y);

      // Check if page overflow is imminent before adding translated text
      if (translatedAnalysis) {
        doc.addPage();
        y = 20;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.text(`PATIENT SUMMARY TRANSLATION (${targetLanguage.toUpperCase()})`, 15, y);
        doc.line(15, y + 2, 195, y + 2);
        y += 8;

        y = drawWrappedText("Medicine Name (Untranslated):", translatedAnalysis.medicineName, y);
        y = drawWrappedText("Scientific Name (Untranslated):", translatedAnalysis.genericName, y);
        y = drawWrappedText("Translated Timing Schedule:", translatedAnalysis.dailyDose, y);
        y = drawWrappedText("Therapeutic Uses (Translated):", translatedAnalysis.uses, y);
        y = drawWrappedText("Mechanism Summary (Translated):", translatedAnalysis.shortDescription, y);
        y = drawWrappedText("Common Side Effects (Translated):", translatedAnalysis.sideEffects, y);
        y = drawWrappedText("CRITICAL MEDICAL WARNINGS (Translated):", translatedAnalysis.warnings, y, alertColor, alertColor);
        y = drawWrappedText("Instructions (Translated):", translatedAnalysis.doctorInstructions, y);
      }

      // 4. Footer Disclaimer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(15, 280, 195, 280);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("DISCLAIMER: MedLingo AI translates clinical prescriptions to support patient understanding. This does not replace actual clinical counseling. Consult a medical professional.", 15, 285);
        doc.text(`Page ${i} of ${totalPages}`, 185, 285);
      }

      // Download file
      const filename = `MedLingo_Prescription_Report_${prescription.patientName.replace(/\s+/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      console.error(err);
      onError("Failed to compile PDF report. Please verify browser memory.");
    }
  };

  const getAudioSpeechPayload = (): string => {
    if (translatedAnalysis) {
      return `Translated patient summary. Medicine brand is: ${translatedAnalysis.medicineName}. Uses: ${translatedAnalysis.uses}. Critical medical warnings: ${translatedAnalysis.warnings}. Doctor instructions: ${translatedAnalysis.doctorInstructions}`;
    }
    return `Original English summary. Medicine brand is: ${analysis.medicineName}. Uses: ${analysis.uses}. Critical warnings: ${analysis.warnings}. Doctor instructions: ${analysis.doctorInstructions}`;
  };

  return (
    <div id="translation-result" className="w-full flex flex-col gap-8">
      
      {/* 1. Original Prescription OCR demographics card */}
      <div className="glass-card rounded-3xl p-6 shadow-md shadow-slate-100 dark:shadow-none border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <FileDigit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-800 dark:text-white">
                {t("Transcribed Prescription Demographics")}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                {t("Extracted via OCR Engine")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveToHistory}
              disabled={isSaving || isSaved}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                isSaved
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              {isSaved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isSaving ? t("Saving...") : isSaved ? t("Saved to History") : t("Save Entry")}
            </button>
            <button
              onClick={downloadPDFReport}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full text-xs font-semibold cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              {t("Download PDF")}
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("Patient Name")}</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {prescription.patientName || "Not Specified"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("Doctor Name")}</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {prescription.doctorName || "Not Specified"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("Hospital/Clinic")}</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {prescription.hospitalName || "Not Specified"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("Date Prescribed")}</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                {prescription.prescriptionDate || "Not Specified"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 md:col-span-2">
            <FileText className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("Instructions Summarized")}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {prescription.instructions || "Not Specified"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Side-By-Side: Original Analysis vs Translation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Side: Original Clinical Analysis */}
        <div className="glass-card rounded-3xl p-6 shadow-md border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-rose-500" />
                <h4 className="font-display font-bold text-slate-800 dark:text-white">
                  {t("Pharmacologist AI Analysis")}
                </h4>
              </div>
              <span className="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 text-[10px] font-mono px-2 py-0.5 rounded font-semibold tracking-wide uppercase">
                {t("Original ENGLISH")}
              </span>
            </div>

            {/* Analysis details list */}
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Brand Name")}</p>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5">{analysis.medicineName}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Chemical Generic Active Ingredient")}</p>
                <p className="text-sm font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5 bg-slate-50 dark:bg-slate-900/40 px-2 py-1 rounded inline-block">
                  {analysis.genericName}
                </p>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Dose Schedule")}</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{analysis.dailyDose}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Interval Schedule")}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${analysis.timing.morning ? "bg-amber-400 shadow-sm" : "bg-slate-200 dark:bg-slate-800"}`} title={t("Morning")} />
                    <span className={`w-2 h-2 rounded-full ${analysis.timing.afternoon ? "bg-orange-400 shadow-sm" : "bg-slate-200 dark:bg-slate-800"}`} title={t("Afternoon")} />
                    <span className={`w-2 h-2 rounded-full ${analysis.timing.night ? "bg-indigo-400 shadow-sm" : "bg-slate-200 dark:bg-slate-800"}`} title={t("Night")} />
                    <span className="text-xs text-slate-500 font-medium ml-1">
                      {analysis.timing.morning && t("Morning") + " "}
                      {analysis.timing.afternoon && t("Afternoon") + " "}
                      {analysis.timing.night && t("Night")}
                    </span>
                  </div>
                  {analysis.timing.additional && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                      ({analysis.timing.additional})
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Therapeutic Indications / Uses")}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{analysis.uses}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Description & Mechanism")}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{analysis.shortDescription}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Expected Side Effects")}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{analysis.sideEffects}</p>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl">
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  {t("Clinical Warnings & Contraindications")}
                </div>
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-semibold">
                  {analysis.warnings}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Patient Advisory Notes")}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{analysis.doctorInstructions}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-800">
              <Globe className="w-4 h-4 text-slate-400" />
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-300 outline-none pr-1"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang} className="text-slate-800 dark:text-slate-200">
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {isTranslating ? t("Translating...") : t("Translate Analysis")}
            </button>
          </div>
        </div>

        {/* Right Side: Translation Outcome Panel */}
        <div className="glass-card rounded-3xl p-6 shadow-md border border-slate-200 dark:border-slate-800 flex flex-col justify-between relative overflow-hidden">
          <AnimatePresence mode="wait">
            {translatedAnalysis ? (
              <motion.div
                key="translated-content"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col h-full justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-500" />
                      <h4 className="font-display font-bold text-slate-800 dark:text-white">
                        {t("MedLingo Translation")}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => speakText(getAudioSpeechPayload())}
                        className={`p-1.5 rounded-full transition-colors ${
                          isSpeaking
                            ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-slate-900"
                        }`}
                        title="Read Aloud"
                      >
                        {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded font-semibold tracking-wide uppercase">
                        {targetLanguage}
                      </span>
                    </div>
                  </div>

                  {/* Translated details */}
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Brand Name (Retained)")}</p>
                      <p className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                        {translatedAnalysis.medicineName}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Scientific Name (Retained)")}</p>
                      <p className="text-sm font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5 bg-slate-50 dark:bg-slate-900/40 px-2 py-1 rounded inline-block">
                        {translatedAnalysis.genericName}
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Timing Schedule")}</p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                          {translatedAnalysis.dailyDose}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Additional Timing Notes")}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                          {translatedAnalysis.timing.additional || "None"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Therapeutic Indications / Uses")}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {translatedAnalysis.uses}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Mechanism Summary")}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {translatedAnalysis.shortDescription}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Expected Side Effects")}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {translatedAnalysis.sideEffects}
                      </p>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl">
                      <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        {t("Warnings & Precautions (Translated)")}
                      </div>
                      <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-semibold">
                        {translatedAnalysis.warnings}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("Patient Instructions")}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {translatedAnalysis.doctorInstructions}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-400 dark:text-slate-500 font-medium">
                  {t("Translated securely by Google Gemini 3.5. Brand metrics and dosages are clinical constraints and left in standard scientific format for maximum safety.")}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="translation-placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center text-center h-full min-h-[350px] p-8"
              >
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 text-blue-500 rounded-full mb-4 animate-pulse">
                  <Globe className="w-10 h-10" />
                </div>
                <h4 className="font-display font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t("Language Translation Panel")}
                </h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  {t("Select a language from the dropdown menu and click \"Translate Analysis\" to translate patient instructions while safeguarding clinical brands.")}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loader Overlay */}
          {isTranslating && (
            <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-10 flex flex-col items-center justify-center p-6">
              <div className="relative flex items-center justify-center w-14 h-14 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800" />
                <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 dark:border-t-blue-500 animate-spin" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {t("Translating...")}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("Filtering clinical parameters...")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
