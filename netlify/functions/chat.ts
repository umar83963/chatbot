import { Handler } from "@netlify/functions";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { message, history } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Message is required." }),
      };
    }

    const ai = getGeminiClient();

    const mappedContents = (history || []).map((msg: any) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

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
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply }),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
