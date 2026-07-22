/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PrescriptionDetails {
  medicineName: string;
  doctorName: string;
  hospitalName: string;
  patientName: string;
  prescriptionDate: string;
  instructions: string;
  rawText: string;
}

export interface MedicineAnalysis {
  medicineName: string;
  genericName: string;
  uses: string;
  dailyDose: string;
  timing: {
    morning: boolean;
    afternoon: boolean;
    night: boolean;
    additional?: string;
  };
  shortDescription: string;
  sideEffects: string;
  warnings: string;
  doctorInstructions: string;
}

export interface HistoryEntry {
  id: number;
  patient_name: string;
  doctor_name: string;
  hospital_name: string;
  prescription_date: string;
  original_text: string;
  ocr_json: PrescriptionDetails;
  analysis_json: MedicineAnalysis;
  translated_text_json?: MedicineAnalysis | null;
  target_language?: string | null;
  created_at: string;
}

export interface TranslationRequest {
  textToTranslate: {
    uses: string;
    warnings: string;
    description: string;
    doctorInstructions: string;
    timing: string;
  };
  targetLanguage: string;
}

export interface ManualTranslationRequest {
  text: string;
  targetLanguage: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface MedicineSearchInfo {
  found: boolean;
  medicineName: string;
  genericName: string;
  uses: string;
  dosage: string;
  sideEffects: string;
  warnings: string;
  storage: string;
  drugInteractions: string;
}
