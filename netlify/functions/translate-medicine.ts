import { Handler } from "@netlify/functions";
import { Type } from "@google/genai";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

const medicineSearchSchema = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN },
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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { medicineInfo, targetLanguage } = JSON.parse(event.body || "{}");
    if (!medicineInfo || !targetLanguage) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing medicineInfo or targetLanguage." }),
      };
    }

    if (targetLanguage === "English") {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(medicineInfo),
      };
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
      1,
      500
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
    
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(translatedInfo),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
