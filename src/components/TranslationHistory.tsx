/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History,
  Search,
  Trash2,
  Download,
  Calendar,
  FileText,
  User,
  Activity,
  ChevronDown,
  ChevronUp,
  Globe,
  PlusCircle,
  FileDigit,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { HistoryEntry, PrescriptionDetails, MedicineAnalysis } from "../types";

interface TranslationHistoryProps {
  onLoadEntry: (prescription: PrescriptionDetails, analysis: MedicineAnalysis, translatedAnalysis: MedicineAnalysis | null, targetLang: string | null) => void;
  onError: (msg: string) => void;
  refreshTrigger: number;
  globalLanguage?: string;
  t?: (key: any) => string;
}

export default function TranslationHistory({
  onLoadEntry,
  onError,
  refreshTrigger,
  globalLanguage = "English",
  t = (k) => k,
}: TranslationHistoryProps) {
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/history");
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.message || "Failed to load translation logs.");
      }

      setHistoryList(data);
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to sync history from SQLite database.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Prevent toggling accordion
    
    try {
      const response = await fetch(`/api/history/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.message || "Failed to delete history log.");
      }

      setHistoryList((prev) => prev.filter((item) => item.id !== id));
      if (selectedEntryId === id) setSelectedEntryId(null);
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to delete history item.");
    }
  };

  // Re-generate professional jsPDF report dynamically on the fly
  const handleDownloadPDF = (e: React.MouseEvent, entry: HistoryEntry) => {
    e.stopPropagation(); // Prevent toggling accordion
    
    try {
      const doc = new jsPDF();
      let y = 15;

      const primaryColor = [15, 23, 42]; 
      const accentColor = [37, 99, 235]; 
      const secondaryColor = [71, 85, 105]; 
      const alertColor = [220, 38, 38]; 

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
      doc.text("ARCHIVED CLINICAL PRESCRIPTION REPORT", 15, 25);
      doc.text(`Archived: ${new Date(entry.created_at).toLocaleDateString()}`, 155, 25);

      y = 42;

      // 2. Demographic Information Card
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
      doc.text(entry.patient_name || "Not Specified", 50, y + 20);
      doc.text(entry.prescription_date || "Not Specified", 50, y + 26);
      doc.text(entry.hospital_name || "Not Specified", 50, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("Doctor Name:", 110, y + 20);
      doc.text("DB Record ID:", 110, y + 26);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(entry.doctor_name || "Not Specified", 135, y + 20);
      doc.text(`#${entry.id}`, 135, y + 26);

      y += 50;

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

      // 3. Clinical analysis
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text("CLINICAL INGREDIENT & PHARMACOLOGICAL OVERVIEW", 15, y);
      doc.line(15, y + 2, 195, y + 2);
      y += 8;

      const analysis = entry.analysis_json;
      y = drawWrappedText("Prescribed Brand Name:", analysis.medicineName, y);
      y = drawWrappedText("Scientific Generic Name:", analysis.genericName, y);
      
      const timingText = `Morning: ${analysis.timing?.morning ? "YES" : "NO"} | Afternoon: ${analysis.timing?.afternoon ? "YES" : "NO"} | Night: ${analysis.timing?.night ? "YES" : "NO"} ${analysis.timing?.additional ? `(${analysis.timing.additional})` : ""}`;
      y = drawWrappedText("Clinician Dosing & Timing:", `${analysis.dailyDose} — ${timingText}`, y);
      
      y = drawWrappedText("Therapeutic Uses:", analysis.uses, y);
      y = drawWrappedText("Short Mechanism Summary:", analysis.shortDescription, y);
      y = drawWrappedText("Common Side Effects:", analysis.sideEffects, y);
      y = drawWrappedText("CRITICAL MEDICAL WARNINGS / CONTRAINDICATIONS:", analysis.warnings, y, alertColor, alertColor);
      y = drawWrappedText("Consolidated Patient Instructions:", analysis.doctorInstructions, y);

      // 4. Translated Summary if present in record
      if (entry.translated_text_json && entry.target_language) {
        doc.addPage();
        y = 20;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.text(`PATIENT SUMMARY TRANSLATION (${entry.target_language.toUpperCase()})`, 15, y);
        doc.line(15, y + 2, 195, y + 2);
        y += 8;

        const trans = entry.translated_text_json;
        y = drawWrappedText("Medicine Name (Untranslated):", trans.medicineName || "", y);
        y = drawWrappedText("Scientific Name (Untranslated):", trans.genericName || "", y);
        y = drawWrappedText("Translated Timing Schedule:", trans.dailyDose || "", y);
        y = drawWrappedText("Therapeutic Uses (Translated):", trans.uses || "", y);
        y = drawWrappedText("Mechanism Summary (Translated):", trans.shortDescription || "", y);
        y = drawWrappedText("Common Side Effects (Translated):", trans.sideEffects || "", y);
        y = drawWrappedText("CRITICAL MEDICAL WARNINGS (Translated):", trans.warnings || "", y, alertColor, alertColor);
        y = drawWrappedText("Instructions (Translated):", trans.doctorInstructions || "", y);
      }

      // Add Footer Disclaimer to all pages
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

      const filename = `MedLingo_Archived_Report_${entry.patient_name.replace(/\s+/g, "_")}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      console.error(err);
      onError("Failed to compile archived PDF. Please verify memory space.");
    }
  };

  const filteredHistory = historyList.filter((entry) => {
    const q = searchQuery.toLowerCase();
    return (
      entry.patient_name?.toLowerCase().includes(q) ||
      entry.doctor_name?.toLowerCase().includes(q) ||
      entry.hospital_name?.toLowerCase().includes(q) ||
      entry.analysis_json?.medicineName?.toLowerCase().includes(q)
    );
  });

  const toggleAccordion = (id: number) => {
    setSelectedEntryId(selectedEntryId === id ? null : id);
  };

  return (
    <div id="translation-history" className="w-full max-w-4xl mx-auto">
      <div className="glass-card rounded-3xl p-8 shadow-xl shadow-slate-100 dark:shadow-none overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
            <History className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t("Prescription Audit Logs")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            {t("Review and download previously parsed prescriptions and translations stored securely in local database tables.")}
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search logs by patient name, doctor, hospital, or medicine name...")}
            className="w-full pl-11 pr-4 py-3 bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 dark:focus:border-blue-500/80 transition-colors"
          />
        </div>

        {/* History Accordion List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-slate-100 dark:border-slate-800 border-t-blue-600 dark:border-t-blue-500 animate-spin rounded-full mb-3" />
              <p className="text-xs text-slate-400">{t("Syncing local SQLite tables...")}</p>
            </div>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((entry) => {
              const isOpen = selectedEntryId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`border border-slate-100 dark:border-slate-800/80 rounded-2xl overflow-hidden transition-all duration-300 ${
                    isOpen ? "bg-slate-50/50 dark:bg-slate-900/40 ring-1 ring-blue-500/10" : "bg-white dark:bg-slate-900/20"
                  }`}
                >
                  {/* Header Row */}
                  <div
                    onClick={() => toggleAccordion(entry.id)}
                    className="flex flex-wrap items-center justify-between p-5 gap-4 cursor-pointer hover:bg-slate-50/30 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-[200px] flex-1">
                      <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
                        <FileDigit className="w-5 h-5" />
                      </div>
                      <div className="truncate">
                        <h4 className="font-display font-bold text-sm text-slate-800 dark:text-white truncate">
                          {entry.patient_name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 truncate flex items-center gap-1.5">
                          <Activity className="w-3 h-3" /> {entry.analysis_json.medicineName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                      {entry.target_language && (
                        <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                          <Globe className="w-3 h-3" /> {entry.target_language}
                        </span>
                      )}

                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-end">
                          <Calendar className="w-3.5 h-3.5" />
                          {entry.prescription_date}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => handleDownloadPDF(e, entry)}
                          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Download PDF Log"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, entry.id)}
                          className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Delete Audit Entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="text-slate-400">
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Expansion Panel */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-slate-100 dark:border-slate-800/60"
                      >
                        <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div className="space-y-1.5">
                              <p className="font-semibold text-slate-400">{t("Hospital / Clinic Source")}</p>
                              <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                                {entry.hospital_name}
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <p className="font-semibold text-slate-400">{t("Prescribing Clinician")}</p>
                              <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                                {entry.doctor_name}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="font-semibold text-slate-400 uppercase tracking-wide">{t("Chemical Generic Name")}</p>
                            <p className="font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300 inline-block">
                              {entry.analysis_json.genericName}
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <p className="font-semibold text-slate-400 uppercase tracking-wide">{t("Therapeutic Indications / Uses")}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {entry.analysis_json.uses}
                            </p>
                          </div>

                          {entry.translated_text_json && (
                            <div className="p-4 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/40 rounded-xl space-y-1.5">
                              <p className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                                <Globe className="w-4 h-4" /> {t("Translated Safety Summary")} ({entry.target_language})
                              </p>
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                {entry.translated_text_json.uses}
                              </p>
                            </div>
                          )}

                          <div className="pt-4 flex justify-end gap-3">
                            <button
                              onClick={() =>
                                onLoadEntry(
                                  entry.ocr_json,
                                  entry.analysis_json,
                                  entry.translated_text_json || null,
                                  entry.target_language || null
                                )
                              }
                              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                            >
                              <PlusCircle className="w-4 h-4" /> {t("Load details to Workspace")}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <History className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="font-semibold text-slate-600 dark:text-slate-400 text-sm">
                {t("No archived prescriptions found")}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {t("Analyze prescriptions on the dashboard and click \"Save Entry\" to build up your offline-synced database logs.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
