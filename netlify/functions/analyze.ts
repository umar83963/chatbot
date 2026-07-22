import { Handler } from "@netlify/functions";
import Tesseract from "tesseract.js";
import { Type } from "@google/genai";
import { getGeminiClient, callGeminiWithRetry, handleApiError, CORS_HEADERS } from "./utils";

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const { fileData, fileType } = JSON.parse(event.body || "{}");
    if (!fileData) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Missing fileData (base64 string)." }),
      };
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
    parsedData.prescriptionDetails.rawText = ocrText;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(parsedData),
    };
  } catch (error: any) {
    return handleApiError(error);
  }
};
