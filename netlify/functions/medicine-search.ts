import { Handler } from "@netlify/functions";
import { Type } from "@google/genai";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { medicineName } = JSON.parse(event.body || "{}");
    if (!medicineName || !medicineName.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing medicineName." }),
      };
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
      1,
      500
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
    
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(parsedData),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
