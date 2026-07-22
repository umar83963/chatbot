import { Handler } from "@netlify/functions";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { dictionary, targetLanguage } = JSON.parse(event.body || "{}");
    if (!dictionary || !targetLanguage) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing dictionary or targetLanguage." }),
      };
    }

    if (targetLanguage === "English") {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(dictionary),
      };
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
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(translatedUI),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
