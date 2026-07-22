import { GoogleGenAI } from "@google/genai";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
};

let aiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
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

export async function callGeminiWithRetry<T>(
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
          console.warn(`Gemini model ${model} hit quota limit. Falling back to the next model. Error:`, msg);
          break;
        } else if (isTransient && currentRetries > 0) {
          console.warn(`Gemini call for model ${model} failed. Retrying in ${currentDelay}ms...`, msg);
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
          currentRetries--;
          currentDelay *= 1.5;
        } else {
          console.warn(`Gemini model ${model} failed. Falling back. Error:`, msg);
          break;
        }
      }
    }
  }
  throw lastError || new Error("All Gemini models failed.");
}

export function handleApiError(error: any) {
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
  
  return {
    statusCode: status,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      error: true,
      statusCode: status,
      message: friendlyMessage,
      details: message,
    }),
  };
}
