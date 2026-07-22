import { Handler } from "@netlify/functions";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { text, targetLanguage } = JSON.parse(event.body || "{}");
    if (!text || !targetLanguage) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing text or targetLanguage." }),
      };
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
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ translatedText: translatedResult.trim() }),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
