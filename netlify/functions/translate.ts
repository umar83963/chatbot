import { Handler } from "@netlify/functions";
import { Type } from "@google/genai";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { medicineAnalysis, targetLanguage } = JSON.parse(event.body || "{}");
    if (!medicineAnalysis || !targetLanguage) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing medicineAnalysis data or targetLanguage." }),
      };
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
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(translatedAnalysis),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
