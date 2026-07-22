import { Handler } from "@netlify/functions";
import path from "path";
import fs from "fs";
import { CORS_HEADERS } from "./utils";

const dbPath = "/tmp/history.json";

function readHistoryFile(): any[] {
  try {
    if (!fs.existsSync(dbPath)) {
      const seedPath = path.join(process.cwd(), "history.json");
      if (fs.existsSync(seedPath)) {
        const seedData = fs.readFileSync(seedPath, "utf-8");
        fs.writeFileSync(dbPath, seedData);
        return JSON.parse(seedData || "[]");
      }
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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const method = event.httpMethod;

  if (method === "GET") {
    try {
      const rows = readHistoryFile();
      const sortedRows = [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      const parsedRows = sortedRows.map((row: any) => ({
        ...row,
        ocr_json: typeof row.ocr_json === "string" ? JSON.parse(row.ocr_json || "{}") : (row.ocr_json || {}),
        analysis_json: typeof row.analysis_json === "string" ? JSON.parse(row.analysis_json || "{}") : (row.analysis_json || {}),
        translated_text_json: typeof row.translated_text_json === "string"
          ? (row.translated_text_json ? JSON.parse(row.translated_text_json) : null)
          : (row.translated_text_json || null),
      }));
      
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(parsedRows),
      };
    } catch (err: any) {
      console.error("Database error:", err.message || err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Failed to fetch translation history from database." }),
      };
    }
  }

  if (method === "POST") {
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
      } = JSON.parse(event.body || "{}");

      const rows = readHistoryFile();
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
      
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, id: newId }),
      };
    } catch (err: any) {
      console.error("Database save failed:", err.message || err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Failed to write history record to local database." }),
      };
    }
  }

  if (method === "DELETE") {
    try {
      // Match ID from either queryStringParameters (redirects/history?id=123) or URL path
      let idStr = event.queryStringParameters?.id;
      if (!idStr) {
        const parts = event.path.split("/");
        idStr = parts[parts.length - 1];
      }
      
      const id = parseInt(idStr || "", 10);
      if (isNaN(id)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: true, message: "Invalid history ID specified for deletion." }),
        };
      }

      const rows = readHistoryFile();
      const initialLength = rows.length;
      const filteredRows = rows.filter((row: any) => row.id !== id);
      
      writeHistoryFile(filteredRows);
      
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, changes: initialLength - filteredRows.length }),
      };
    } catch (err: any) {
      console.error("Database delete failed:", err.message || err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: true, message: "Failed to delete history record from database." }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: true, message: "Method Not Allowed" }),
  };
};
