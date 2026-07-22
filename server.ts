/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import Tesseract from "tesseract.js";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Increase request size limits for scanning high-resolution camera images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize local JSON database
const dbPath = path.join(process.cwd(), "history.json");

function readHistoryFile(): any[] {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(dbPath, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Failed to read history JSON file:", err);
    return [];
  }
}

function writeHistoryFile(data: any[]) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to write history JSON file:", err);
  }
}

// Self-verify database file
readHistoryFile();
console.log("Local JSON history database verified successfully at:", dbPath);

// Lazy-load Gemini AI Client with User-Agent telemetry
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please set it in Settings > Secrets.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Retry mechanism for API robustness with automatic model fallbacks (optimized for fast failover)
async function callGeminiWithRetry<T>(
  fn: (model: string) => Promise<T>,
  retries = 1,
  delay = 200,
  models = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash-8b",
    "gemini-flash-latest"
  ]
): Promise<T> {
  let lastError: any = null;
  for (const model of models) {
    let currentRetries = retries;
    let currentDelay = delay;
    while (currentRetries >= 0) {
      try {
        return await fn(model);
      } catch (error: any) {
        lastError = error;
        const msg = error.message || String(error);
        const isQuotaExceeded = msg.includes("429") || msg.includes("Resource has been exhausted") || msg.includes("quota") || msg.includes("Quota exceeded");
        const isTransient = msg.includes("503") || msg.includes("service unavailable") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
        
        if (isQuotaExceeded) {
          console.warn(`Gemini model ${model} hit quota limit. Falling back to the next model immediately. Error:`, msg);
          break; // Try the next fallback model immediately without waiting/retrying on this model
        } else if (isTransient && currentRetries > 0) {
          console.warn(`Gemini call for model ${model} failed with transient network error. Retrying in ${currentDelay}ms... (Remaining retries: ${currentRetries}). Error:`, msg);
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
          currentRetries--;
          currentDelay *= 1.5;
        } else {
          console.warn(`Gemini model ${model} failed. Falling back if another model is available. Error:`, msg);
          break; // Try the next fallback model immediately
        }
      }
    }
  }
  throw lastError || new Error("All Gemini models failed.");
}

// Friendly error mapper for clinical app safety
function handleApiError(error: any, res: express.Response) {
  console.error("Detailed server/API error:", error);
  const message = error.message || String(error);
  
  let status = 500;
  let friendlyMessage = "An unexpected error occurred. Please ensure the file is clear and try again.";
  
  if (message.includes("401") || message.includes("API key not valid") || message.includes("invalid key") || message.includes("missing") || message.includes("API_KEY")) {
    status = 401;
    friendlyMessage = "API Authentication failed. Please verify that your Google Gemini API Key is configured in the Secrets panel.";
  } else if (message.includes("403") || message.includes("permission") || message.includes("denied")) {
    status = 403;
    friendlyMessage = "Access forbidden. The provided API key does not have permissions to use the medical translation models.";
  } else if (message.includes("429") || message.includes("quota") || message.includes("exhausted") || message.includes("Rate limit")) {
    status = 429;
    friendlyMessage = "API limits exceeded. The Gemini translation quota is currently busy. Retried once but failed. Please wait a moment.";
  } else if (message.includes("503") || message.includes("service unavailable") || message.includes("overloaded")) {
    status = 503;
    friendlyMessage = "The Gemini AI service is temporarily unavailable. We attempted to automatically retry once, but it is still down. Please try again.";
  } else if (message.includes("500") || message.includes("internal")) {
    status = 500;
    friendlyMessage = "A system error occurred while processing the prescription. Please check image legibility.";
  }
  
  res.status(status).json({
    error: true,
    statusCode: status,
    message: friendlyMessage,
    details: message,
  });
}

// Structured schema for Joint OCR Extraction and AI Analysis
const prescriptionAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    prescriptionDetails: {
      type: Type.OBJECT,
      properties: {
        medicineName: { type: Type.STRING, description: "Highly prominent brand name or label of the prescribed medicine" },
        doctorName: { type: Type.STRING, description: "Name of the physician/doctor" },
        hospitalName: { type: Type.STRING, description: "Name of the hospital, clinic, or medical center" },
        patientName: { type: Type.STRING, description: "Patient's full name" },
        prescriptionDate: { type: Type.STRING, description: "Date of prescribing or date written, formatted as YYYY-MM-DD or standard display format" },
        instructions: { type: Type.STRING, description: "Core administration instructions directly as written by the clinician" },
      },
      required: ["medicineName", "doctorName", "hospitalName", "patientName", "prescriptionDate", "instructions"],
    },
    medicineAnalysis: {
      type: Type.OBJECT,
      properties: {
        medicineName: { type: Type.STRING, description: "Prescribed drug brand/trade name" },
        genericName: { type: Type.STRING, description: "Scientific or chemical active ingredient name, e.g. Acetaminophen, Amoxicillin" },
        uses: { type: Type.STRING, description: "Clear, understandable description of what disease, condition, or symptoms this medicine treats" },
        dailyDose: { type: Type.STRING, description: "Exact dose size to be taken per day (e.g. 1 tablet, 5ml, 500mg)" },
        timing: {
          type: Type.OBJECT,
          properties: {
            morning: { type: Type.BOOLEAN, description: "True if dosage falls in the morning" },
            afternoon: { type: Type.BOOLEAN, description: "True if dosage falls in the afternoon" },
            night: { type: Type.BOOLEAN, description: "True if dosage falls at night" },
            additional: { type: Type.STRING, description: "Critical timing details, food associations (e.g. 'Take after meals', 'Take empty stomach')" },
          },
          required: ["morning", "afternoon", "night"],
        },
        shortDescription: { type: Type.STRING, description: "An elegant, human-readable summary explaining what the drug does" },
        sideEffects: { type: Type.STRING, description: "Common clinical side effects patients might experience, written clearly" },
        warnings: { type: Type.STRING, description: "Critical warnings, contraindications, or items to avoid while taking (e.g. alcohol, pregnancy)" },
        doctorInstructions: { type: Type.STRING, description: "Consolidated instructions for the patient regarding storage, followups, or alerts" },
      },
      required: [
        "medicineName",
        "genericName",
        "uses",
        "dailyDose",
        "timing",
        "shortDescription",
        "sideEffects",
        "warnings",
        "doctorInstructions",
      ],
    },
  },
  required: ["prescriptionDetails", "medicineAnalysis"],
};

// Structured schema for AI Medicine Search
const medicineSearchSchema = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN, description: "True if the search query is a real, valid medicine or pharmaceutical product name (brand or generic). False if it is not a medicine, is gibberish, is completely empty, or cannot be found." },
    medicineName: { type: Type.STRING },
    genericName: { type: Type.STRING },
    uses: { type: Type.STRING },
    dosage: { type: Type.STRING },
    sideEffects: { type: Type.STRING },
    warnings: { type: Type.STRING },
    storage: { type: Type.STRING },
    drugInteractions: { type: Type.STRING }
  },
  required: [
    "found", "medicineName", "genericName", "uses", "dosage", "sideEffects", "warnings", "storage", "drugInteractions"
  ]
};

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. OCR + Prescription AI Analysis
app.post("/api/analyze", async (req, res) => {
  try {
    const { fileData, fileType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: true, message: "Missing fileData (base64 string)." });
    }

    const isPdf = fileType === "application/pdf" || fileType?.endsWith("pdf");
    const isText = fileType?.startsWith("text/") || fileType === "text/plain" || fileType?.endsWith("txt") || fileType?.endsWith("csv");
    const isDoc = fileType?.includes("word") || fileType?.includes("msword") || fileType?.endsWith("doc") || fileType?.endsWith("docx");
    
    let ocrText = "";
    let contents: any;

    if (isText) {
      try {
        ocrText = Buffer.from(fileData, "base64").toString("utf-8");
        console.log("Decoded text file successfully, length:", ocrText.length);
      } catch (err: any) {
        console.error("Failed to decode text file:", err.message);
        ocrText = "[Failed to decode text file]";
      }
      contents = {
        parts: [
          {
            text: `You are an expert clinical medical transcriber and pharmacologist. Analyze this medical prescription or clinical text document:
            ---
            ${ocrText}
            ---
            Extract the clinical details with perfect accuracy and map them exactly into the required JSON schema.`,
          }
        ]
      };
    } else if (isPdf) {
      ocrText = "[PDF Document uploaded - processed directly by multimodal interpreter]";
      contents = {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: fileData,
            },
          },
          {
            text: "You are an expert clinical medical transcriber and pharmacologist. Analyze this medical prescription PDF. Perform highly precise OCR to extract hospital, doctor, patient, date, medicine, and clinical instructions. Map them exactly into the required JSON schema structures.",
          },
        ]
      };
    } else if (isDoc) {
      ocrText = "[Word Document uploaded - processed via direct document analysis]";
      contents = {
        parts: [
          {
            inlineData: {
              mimeType: fileType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              data: fileData,
            },
          },
          {
            text: "You are an expert clinical medical transcriber and pharmacologist. Analyze this medical prescription document. Extract the hospital, doctor, patient, date, medicine, and clinical instructions. Map them exactly into the required JSON schema structures.",
          },
        ]
      };
    } else {
      // Image file
      try {
        console.log("Running Tesseract OCR on image buffer...");
        const imageBuffer = Buffer.from(fileData, "base64");
        const ocrResult = await Tesseract.recognize(imageBuffer, "eng");
        ocrText = ocrResult.data.text;
        console.log("Tesseract OCR completed successfully.");
      } catch (ocrErr: any) {
        console.error("Tesseract.js failed, falling back to multimodal OCR:", ocrErr.message);
        ocrText = "[OCR Pre-processing failed, using vision AI analysis]";
      }

      contents = {
        parts: [
          {
            inlineData: {
              mimeType: fileType || "image/jpeg",
              data: fileData,
            },
          },
          {
            text: `You are an expert clinical medical transcriber and pharmacologist. Analyze this medical prescription image.
            We also ran Tesseract OCR which returned this raw text context:
            ---
            ${ocrText}
            ---
            Use both the visual image and the OCR text context to extract the details with perfect accuracy. Map them exactly into the required JSON schema.`,
          },
        ]
      };
    }

    console.log("Calling Gemini for analysis and structured parsing...");
    const ai = getGeminiClient();
    const response = await callGeminiWithRetry((model) =>
      ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: prescriptionAnalysisSchema,
          systemInstruction: "You are a professional medical pharmacist AI. Extract structured data with maximum accuracy. For empty/unreadable fields, do not leave them blank; provide best-effort clinical extractions or write 'Not Specified'.",
        },
      })
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No output text received from Gemini.");
    }

    const parsedData = JSON.parse(jsonText.trim());
    
    // Inject rawText for front-end debug or audit compliance
    parsedData.prescriptionDetails.rawText = ocrText;

    res.json(parsedData);
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// 2. Medicine Translation API Route
app.post("/api/translate", async (req, res) => {
  try {
    const { medicineAnalysis, targetLanguage } = req.body;
    if (!medicineAnalysis || !targetLanguage) {
      return res.status(400).json({ error: true, message: "Missing medicineAnalysis data or targetLanguage." });
    }

    const ai = getGeminiClient();

    const translationPrompt = `
      Translate the clinical analysis content for a patient into the target language: "${targetLanguage}".
      
      CRITICAL PATIENT SAFETY RULES:
      1. You MUST translate: 'uses', 'shortDescription', 'sideEffects', 'warnings', 'doctorInstructions', and 'timing.additional'.
      2. You MUST NEVER translate:
         - Brand names, medicine names ('medicineName' / 'genericName')
         - Exact measurement metrics, chemical formula details, or dosages (keep mg, ml, g, capsules, tablets, pills exactly as written).
         - Boolean flags ('timing.morning', 'timing.afternoon', 'timing.night' must remain boolean).
      3. The translated fields must remain clear, natural, and highly compassionate for patients while preserving exact medical warnings.
      4. You MUST use the correct, native script of the target language. For example, use Kannada script (ಕನ್ನಡ) for Kannada, Telugu script (తెలుగు) for Telugu, Hindi script (Devanagari) for Hindi, Tamil script (தமிழ்) for Tamil, etc. NEVER use the script of one language to write words of another language.
      
      Original Data to translate:
      ${JSON.stringify(medicineAnalysis, null, 2)}
    `;

    console.log(`Translating medical prescription analysis into: ${targetLanguage}`);
    
    // Define schema for translation output (the same structure as medicineAnalysis)
    const translationSchema = {
      type: Type.OBJECT,
      properties: {
        medicineName: { type: Type.STRING },
        genericName: { type: Type.STRING },
        uses: { type: Type.STRING },
        dailyDose: { type: Type.STRING },
        timing: {
          type: Type.OBJECT,
          properties: {
            morning: { type: Type.BOOLEAN },
            afternoon: { type: Type.BOOLEAN },
            night: { type: Type.BOOLEAN },
            additional: { type: Type.STRING },
          },
          required: ["morning", "afternoon", "night"],
        },
        shortDescription: { type: Type.STRING },
        sideEffects: { type: Type.STRING },
        warnings: { type: Type.STRING },
        doctorInstructions: { type: Type.STRING },
      },
      required: [
        "medicineName",
        "genericName",
        "uses",
        "dailyDose",
        "timing",
        "shortDescription",
        "sideEffects",
        "warnings",
        "doctorInstructions",
      ],
    };

    const response = await callGeminiWithRetry((model) =>
      ai.models.generateContent({
        model,
        contents: { parts: [{ text: translationPrompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: translationSchema,
          systemInstruction: "You are a professional medical translator. Follow the patient safety rules strictly. Never translate active ingredient chemical formulas or metrics (mg, ml).",
        },
      })
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No output received from Gemini translation model.");
    }

    const translatedAnalysis = JSON.parse(jsonText.trim());
    res.json(translatedAnalysis);
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// 3. Manual Text Translation API Route
app.post("/api/manual-translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: true, message: "Missing text or targetLanguage." });
    }

    const ai = getGeminiClient();
    
    const prompt = `Translate the following text into ${targetLanguage}. Keep any drug names, dosages, and chemical equations exactly in their original Latin/English form. Do not add any conversational remarks, only return the exact translation.
    
    Text:
    ${text}`;

    console.log(`Translating manual input into ${targetLanguage}...`);
    const response = await callGeminiWithRetry((model) =>
       ai.models.generateContent({
         model,
         contents: { parts: [{ text: prompt }] },
         config: {
           systemInstruction: "You are a highly precise medical and scientific translator. Translate user messages accurately.",
         },
       })
     );

    const translatedResult = response.text || "";
    res.json({ translatedText: translatedResult.trim() });
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// AI Medicine Search API Route
app.post("/api/medicine-search", async (req, res) => {
  try {
    const { medicineName } = req.body;
    if (!medicineName || !medicineName.trim()) {
      return res.status(400).json({ error: true, message: "Missing medicineName." });
    }

    const ai = getGeminiClient();

    const searchPrompt = `
      You are an expert clinical pharmacologist and medical information specialist.
      Analyze the requested medicine name: "${medicineName}".
      
      Determine if this is a real, valid medicine or active pharmaceutical ingredient (or a common brand/generic drug).
      If it is real, populate the JSON schema fields with concise, highly accurate, professional clinical details for the medicine.
      If it is NOT a valid medicine (e.g. random text, gibberish, not a drug, or empty), set the field "found" to false, and set other fields to empty strings or simple placeholders.

      Fields to populate:
      - found: true if found, false otherwise
      - medicineName: Official Name of the medicine (Capitalized, e.g. "Paracetamol")
      - genericName: Generic chemical/active ingredient name (e.g. "Acetaminophen")
      - uses: Principal medical uses and conditions treated
      - dosage: Recommended standard dosage guidelines (e.g. "500mg to 1000mg every 4-6 hours as needed.")
      - sideEffects: Common or significant side effects that patients should watch out for
      - warnings: Serious warning signs, contraindications, or critical safety alerts
      - storage: Clear instructions on how to store the medicine safely
      - drugInteractions: Notable potential drug-drug interactions
    `;

    console.log(`Searching and analyzing medicine info for: ${medicineName}`);

    // Call Gemini with exactly 1 retry on failure to optimize performance and prevent timeout
    const response = await callGeminiWithRetry((model) =>
      ai.models.generateContent({
        model,
        contents: { parts: [{ text: searchPrompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: medicineSearchSchema,
          systemInstruction: "You are a professional medical pharmacist and clinical AI assistant. Always output structured JSON that perfectly maps to the required schema.",
        },
      }),
      1, // 1 retry
      500 // 500ms backoff delay
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No output received from Gemini medicine search model.");
    }

    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsedData = JSON.parse(cleaned);
    res.json(parsedData);
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// Medicine Search Results Translation API Route
app.post("/api/translate-medicine", async (req, res) => {
  try {
    const { medicineInfo, targetLanguage } = req.body;
    if (!medicineInfo || !targetLanguage) {
      return res.status(400).json({ error: true, message: "Missing medicineInfo or targetLanguage." });
    }

    if (targetLanguage === "English") {
      return res.json(medicineInfo);
    }

    const ai = getGeminiClient();

     const translationPrompt = `
      You are an expert clinical medical translator. Translate the medicine information into the target language: "${targetLanguage}".
      
      CRITICAL PATIENT SAFETY RULES:
      1. Translate the uses, dosage, warnings, side effects, storage, and other details into clear, natural, and compassionate language for patients.
      2. You MUST NOT translate:
         - Brand names, generic names, or official medicine names ('medicineName', 'genericName'). Leave them exactly as they are in English/Latin.
         - Exact measurement metrics, dosages, or scientific units (keep 'mg', 'ml', 'g', 'capsules', 'tablets', 'pills', etc. exactly as written).
         - Common clinical abbreviations.
      3. The 'found' status flag must remain a boolean equal to ${medicineInfo.found}.
      4. You MUST use the correct, native script of the target language. For example, use Kannada script (ಕನ್ನಡ) for Kannada, Telugu script (తెలుగు) for Telugu, Hindi script (Devanagari) for Hindi, Tamil script (தமிழ்) for Tamil, etc. NEVER use the script of one language to write words of another language.

      Original Medicine Information to translate:
      ${JSON.stringify(medicineInfo, null, 2)}
    `;

    console.log(`Translating medicine search results into: ${targetLanguage}`);

    // Call Gemini with exactly 1 retry to optimize performance
    const response = await callGeminiWithRetry((model) =>
      ai.models.generateContent({
        model,
        contents: { parts: [{ text: translationPrompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: medicineSearchSchema,
          systemInstruction: "You are a professional medical translator. Follow the patient safety rules strictly. Never translate active ingredient chemical formulas or metrics (mg, ml).",
        },
      }),
      1, // 1 retry
      500 // 500ms delay
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No output received from Gemini translation model.");
    }

    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const translatedInfo = JSON.parse(cleaned);
    res.json(translatedInfo);
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// Translate UI Dictionary Route
app.post("/api/translate-ui", async (req, res) => {
  try {
    const { dictionary, targetLanguage } = req.body;
    if (!dictionary || !targetLanguage) {
      return res.status(400).json({ error: true, message: "Missing dictionary or targetLanguage." });
    }

    if (targetLanguage === "English") {
      return res.json(dictionary);
    }

    const ai = getGeminiClient();

    const translationPrompt = `
      Translate the values of the following JSON dictionary into the target language: "${targetLanguage}".
      
      CRITICAL RULES:
      1. Keep the JSON keys EXACTLY the same. Do not translate the keys.
      2. Translate only the values.
      3. The translated UI text must be natural, professional, and clear for a medical application context.
      4. Return ONLY a valid JSON object.
      5. You MUST use the correct, native script of the target language. For example, use Kannada script (ಕನ್ನಡ) for Kannada, Telugu script (తెలుగు) for Telugu, Hindi script (Devanagari) for Hindi, Tamil script (தமிழ்) for Tamil, etc. NEVER use the script of one language to write words of another language.
      
      JSON to translate:
      ${JSON.stringify(dictionary, null, 2)}
    `;

    console.log(`Translating UI dictionary into: ${targetLanguage}`);

    const response = await callGeminiWithRetry((model) =>
      ai.models.generateContent({
        model,
        contents: { parts: [{ text: translationPrompt }] },
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are a professional medical and scientific translator. Translate UI text values accurately, preserving JSON keys.",
        },
      })
    );

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No output received from Gemini translation model.");
    }

    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    }

    const translatedUI = JSON.parse(cleaned);
    res.json(translatedUI);
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// 3.5 POST Medical Chatbot Assistant
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: true, message: "Message is required." });
    }

    const ai = getGeminiClient();

    // Map history to Google GenAI Content structure
    const mappedContents = (history || []).map((msg: any) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    // Append current user message
    mappedContents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const systemInstruction = `You are "MedLingo AI Health Assistant", a professional, accurate, and safe medical chatbot.
Your primary role is to answer healthcare, medical, wellness, and first aid questions for users in a clear, supportive, and informative manner.

CRITICAL DIRECTIVES:
1. You must ONLY answer healthcare-related questions. This includes, but is not limited to: medicine uses, drug dosages, side effects, drug interactions, first aid, symptoms, general health tips, prescription explanations, medical terminology, and disease/condition information.
2. If the user's message is NOT healthcare or medical related, or is a greeting/casual query that asks you to do something unrelated to health (e.g. general programming, math, sports, recipes, travel, politics, science other than biology/medicine, writing code, storytelling unrelated to medical, etc.), you MUST reply EXACTLY with this sentence and absolutely nothing else:
"I'm designed to answer healthcare and medical questions only."
3. Do not attempt to explain, apologize, or offer to help with anything else. If they ask "Hi" or "Hello", you can greet them warmly and ask how you can help with their health questions, but any off-topic question MUST immediately trigger the off-topic response.
4. When answering medical questions:
   - Provide safe, general educational information.
   - Include a concise, humble medical disclaimer at the end of every helpful medical response (e.g., "Disclaimer: I am an AI Health Assistant, not a doctor. Please consult a qualified healthcare provider for personal medical advice.").
   - Keep responses professional, highly scannable, and clean using clear markdown formatting (bullet points, bold text).`;

    const response = await callGeminiWithRetry(
      (model) =>
        ai.models.generateContent({
          model,
          contents: mappedContents,
          config: {
            systemInstruction,
          },
        }),
      1,
      500
    );

    const reply = response.text || "I'm designed to answer healthcare and medical questions only.";
    res.json({ reply });
  } catch (error: any) {
    handleApiError(error, res);
  }
});

// 4. GET History from Local JSON file
app.get("/api/history", (req, res) => {
  try {
    const rows = readHistoryFile();
    // Sort by created_at descending (newest first)
    const sortedRows = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    // Ensure nested fields are actual objects for frontend consumption
    const parsedRows = sortedRows.map((row: any) => ({
      ...row,
      ocr_json: typeof row.ocr_json === "string" ? JSON.parse(row.ocr_json || "{}") : (row.ocr_json || {}),
      analysis_json: typeof row.analysis_json === "string" ? JSON.parse(row.analysis_json || "{}") : (row.analysis_json || {}),
      translated_text_json: typeof row.translated_text_json === "string"
        ? (row.translated_text_json ? JSON.parse(row.translated_text_json) : null)
        : (row.translated_text_json || null),
    }));
    
    res.json(parsedRows);
  } catch (err: any) {
    console.error("Database error:", err.message || err);
    res.status(500).json({ error: true, message: "Failed to fetch translation history from database." });
  }
});

// 5. POST Save Entry in History
app.post("/api/history", (req, res) => {
  try {
    const {
      patient_name,
      doctor_name,
      hospital_name,
      prescription_date,
      original_text,
      ocr_json,
      analysis_json,
      translated_text_json,
      target_language,
    } = req.body;

    const rows = readHistoryFile();
    
    // Generate new unique ID
    const newId = rows.length > 0 ? Math.max(...rows.map((r: any) => r.id)) + 1 : 1;
    
    const newRecord = {
      id: newId,
      patient_name: patient_name || "Not Specified",
      doctor_name: doctor_name || "Not Specified",
      hospital_name: hospital_name || "Not Specified",
      prescription_date: prescription_date || "Not Specified",
      original_text: original_text || "",
      ocr_json: ocr_json || {},
      analysis_json: analysis_json || {},
      translated_text_json: translated_text_json || null,
      target_language: target_language || null,
      created_at: new Date().toISOString(),
    };

    rows.push(newRecord);
    writeHistoryFile(rows);
    
    res.json({ success: true, id: newId });
  } catch (err: any) {
    console.error("Database save failed:", err.message || err);
    res.status(500).json({ error: true, message: "Failed to write history record to local database." });
  }
});

// 6. DELETE History Entry
app.delete("/api/history/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = readHistoryFile();
    const initialLength = rows.length;
    const filteredRows = rows.filter((row: any) => row.id !== id);
    
    writeHistoryFile(filteredRows);
    
    res.json({ success: true, changes: initialLength - filteredRows.length });
  } catch (err: any) {
    console.error("Database delete failed:", err.message || err);
    res.status(500).json({ error: true, message: "Failed to delete history record from database." });
  }
});

// ==========================================
// STATIC ASSET AND DEV SERVER CONFIG
// ==========================================

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    console.log("Configuring development environment using Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Configuring production environment...");
    const distPath = path.join(process.cwd(), "dist");
    console.log("Serving static files from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MedLingo AI server running on port ${PORT} [${isProduction ? "production" : "development"}]`);
  });
}

startServer();
