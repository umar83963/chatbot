/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, UploadCloud, RefreshCw, AlertCircle, FileText, X, Sparkles, Image as ImageIcon } from "lucide-react";
import { PrescriptionDetails, MedicineAnalysis } from "../types";

interface PrescriptionScannerProps {
  onAnalysisSuccess: (prescription: PrescriptionDetails, analysis: MedicineAnalysis, fileData: string, fileType: string) => void;
  onError: (errorMsg: string) => void;
  globalLanguage?: string;
  t?: (key: any) => string;
}

export default function PrescriptionScanner({
  onAnalysisSuccess,
  onError,
  globalLanguage = "English",
  t = (k) => k,
}: PrescriptionScannerProps) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: string; type: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCapturedImage(null);
    setFileMeta(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Camera access failed:", err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes("dismissed") ||
        errMsg.includes("denied") ||
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        err?.name === "SecurityError"
      ) {
        setCameraError("Camera permission was dismissed or denied. Since this application is running in an iframe inside the Google AI Studio preview, you can click the 'Open in New Tab' icon in the top right of the preview to run the application in a standalone tab where camera permissions can be granted, or you can simply upload/drag-and-drop a prescription image or document instead.");
      } else {
        setCameraError(`Camera access failed: ${errMsg}. Please ensure no other application is currently using your camera, open the app in a new tab, or upload a file directly.`);
      }
      onError("Camera access permission denied.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64Data = canvas.toDataURL("image/jpeg");
        setCapturedImage(base64Data);
        setFileMeta({
          name: `Camera_Capture_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.jpg`,
          size: `${Math.round((base64Data.length * 3) / 4 / 1024)} KB`,
          type: "image/jpeg",
        });
        stopCamera();
      }
    }
  };

  const handleFile = (file: File) => {
    if (!file) return;

    // Detect file extension and map to content category
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));
    
    // Support virtually any image, pdf, or text/doc document
    const isSupportedImage = file.type.startsWith("image/") || 
      [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".heif"].some(ext => fileName.endsWith(ext));
      
    const isSupportedDoc = file.type === "application/pdf" || file.type.startsWith("text/") || file.type.includes("document") || file.type.includes("msword") ||
      [".pdf", ".txt", ".csv", ".doc", ".docx", ".rtf"].some(ext => fileName.endsWith(ext));

    if (!isSupportedImage && !isSupportedDoc) {
      onError("Unsupported file format. Please upload an image, PDF, or document file.");
      return;
    }

    // Assign a proper MIME type if it's empty
    let detectedType = file.type;
    if (!detectedType) {
      if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"].some(ext => fileName.endsWith(ext))) {
        detectedType = `image/${fileExtension.slice(1)}`;
      } else if (fileName.endsWith(".pdf")) {
        detectedType = "application/pdf";
      } else if (fileName.endsWith(".txt")) {
        detectedType = "text/plain";
      } else if (fileName.endsWith(".docx")) {
        detectedType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileName.endsWith(".doc")) {
        detectedType = "application/msword";
      } else {
        detectedType = "application/octet-stream";
      }
    }

    setCapturedImage(null);
    setFileMeta({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: detectedType,
    });

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCapturedImage(result); // For visual preview
    };
    reader.onerror = () => {
      onError("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const processPrescription = async () => {
    if (!capturedImage || !fileMeta) return;

    setIsProcessing(true);
    setProcessingStep(t("Reading file pixels..."));
    
    try {
      const base64Clean = capturedImage.split(",")[1];
      
      // Step logging for immersive UX
      setTimeout(() => setProcessingStep(t("Performing Tesseract OCR Pre-scanning...")), 1000);
      setTimeout(() => setProcessingStep(t("Injecting multimodal medical context...")), 2500);
      setTimeout(() => setProcessingStep(t("Consulting Gemini AI Pharmacist models...")), 4000);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: base64Clean,
          fileType: fileMeta.type,
        }),
      });

      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        let friendlyErr = `Server returned non-JSON response (Status ${response.status}).`;
        if (textResponse.includes("503") || textResponse.includes("Unavailable") || textResponse.toLowerCase().includes("overloaded")) {
          friendlyErr = "The Gemini AI model is currently overloaded. Please try again in a few seconds.";
        } else if (textResponse.includes("System action required") || textResponse.includes("ಸಿಸ್ಟಮ್ ಕ್ರಮದ") || textResponse.toLowerCase().includes("action required") || textResponse.includes("quota")) {
          friendlyErr = "Gemini API daily quota limit exceeded. Please configure a Paid API key in Settings or wait for the quota to reset.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html>") || textResponse.includes("<head>")) {
          friendlyErr = "The server is currently starting up or compiling. Please wait 5-10 seconds and try again.";
        }
        throw new Error(friendlyErr);
      }

      if (!response.ok || data.error) {
        throw new Error(data.message || `Server responded with status ${response.status}`);
      }

      onAnalysisSuccess(
        data.prescriptionDetails,
        data.medicineAnalysis,
        capturedImage,
        fileMeta.type
      );
    } catch (err: any) {
      console.error("Analysis processing failed:", err);
      onError(err.message || "Failed to process prescription. Please verify the Gemini API server is running.");
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  return (
    <div id="prescription-scanner" className="w-full max-w-4xl mx-auto">
      <div className="glass-card rounded-3xl p-8 shadow-xl shadow-slate-100 dark:shadow-none overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
        
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
            <Camera className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t("Import Prescription Document")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            {t("Scan via live camera, drag & drop a document, or upload files directly for real-time OCR extraction and translations.")}
          </p>
        </div>

        {/* Core Media Interface Container */}
        <div className="relative min-h-[340px] bg-slate-50 dark:bg-slate-900/60 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 transition-all duration-300">
          
          <AnimatePresence mode="wait">
            {/* 1. Camera Active View */}
            {isCameraActive && (
              <motion.div
                key="camera-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center"
              >
                <div className="relative w-full max-w-lg rounded-xl overflow-hidden aspect-video bg-black shadow-lg">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Focus reticle */}
                  <div className="absolute inset-0 border-2 border-blue-500/30 m-8 rounded-lg pointer-events-none flex items-center justify-center">
                    <div className="w-8 h-8 border-t-2 border-l-2 border-blue-500 absolute top-0 left-0" />
                    <div className="w-8 h-8 border-t-2 border-r-2 border-blue-500 absolute top-0 right-0" />
                    <div className="w-8 h-8 border-b-2 border-l-2 border-blue-500 absolute bottom-0 left-0" />
                    <div className="w-8 h-8 border-b-2 border-r-2 border-blue-500 absolute bottom-0 right-0" />
                    <span className="text-xs text-blue-400/80 bg-slate-950/60 px-2 py-1 rounded font-mono">{t("ALIGN PRESCRIPTION")}</span>
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={capturePhoto}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-full flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    <Camera className="w-5 h-5" />
                    {t("Capture Photo")}
                  </button>
                  <button
                    onClick={stopCamera}
                    className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-6 py-2.5 rounded-full active:scale-95 transition-all"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 2. Image/File Ready View */}
            {!isCameraActive && capturedImage && fileMeta && (
              <motion.div
                key="preview-view"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full flex flex-col items-center"
              >
                <div className="relative w-full max-w-sm rounded-xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col items-center">
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setFileMeta(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {!fileMeta.type.startsWith("image/") ? (
                    <div className="w-24 h-24 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                      <FileText className="w-12 h-12" />
                    </div>
                  ) : (
                    <img
                      src={capturedImage}
                      alt="Prescription preview"
                      className="w-full max-h-48 object-contain rounded-lg mb-4"
                    />
                  )}

                  <div className="text-center w-full px-2">
                    <p className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">
                      {fileMeta.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fileMeta.size} • {(fileMeta.type.includes("word") || fileMeta.type.includes("document") ? "DOCX" : fileMeta.type.split("/")[1]?.toUpperCase() || "DOC")}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={processPrescription}
                    disabled={isProcessing}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-full flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 disabled:scale-100 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5" />
                    {t("Analyze Prescription")}
                  </button>
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setFileMeta(null);
                    }}
                    disabled={isProcessing}
                    className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-6 py-3 rounded-full active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {t("Reset")}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 3. Dropzone Idle View */}
            {!isCameraActive && !capturedImage && (
              <motion.div
                key="idle-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex flex-col items-center"
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className={`w-full max-w-xl p-8 rounded-2xl flex flex-col items-center transition-all ${dragActive ? "bg-blue-50/50 dark:bg-blue-950/20 scale-[1.01]" : ""}`}>
                  <UploadCloud className="w-14 h-14 text-slate-400 dark:text-slate-600 mb-4 animate-bounce" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300 text-base mb-1">
                    {t("Drag and drop file here")}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs mb-6">
                    {t("Supports any image format, PDF, plain text, or Word documents up to 10MB")}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <button
                       onClick={() => fileInputRef.current?.click()}
                      className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 cursor-pointer"
                    >
                      <ImageIcon className="w-5 h-5 text-slate-500" />
                      {t("Upload Document")}
                    </button>

                    <button
                      onClick={startCamera}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 transition-all active:scale-98 cursor-pointer"
                    >
                      <Camera className="w-5 h-5" />
                      {t("Scan Prescription")}
                    </button>
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="hidden"
                  accept="image/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx,.txt"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4. Overlay Processing Animation Screen */}
          {isProcessing && (
            <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 rounded-2xl z-20 flex flex-col items-center justify-center p-6">
              <div className="relative flex items-center justify-center w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800" />
                <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 dark:border-t-blue-500 animate-spin" />
                <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" />
              </div>
              <h3 className="font-display text-lg font-bold text-slate-800 dark:text-white mb-2">
                {t("Extracting Prescription Data")}
              </h3>
              
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 px-4 py-1.5 rounded-full text-blue-600 dark:text-blue-400 text-xs font-mono font-medium shadow-inner">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {processingStep}
              </div>
            </div>
          )}
        </div>

        {/* Camera Native Errors */}
        {cameraError && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl flex items-start gap-3 text-amber-800 dark:text-amber-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Media Access Alert</p>
              <p className="text-xs mt-0.5">{cameraError}</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
