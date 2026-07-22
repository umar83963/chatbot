import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Stethoscope,
  Bot,
  Send,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Trash2,
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
  MessageSquareCode,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}

const STORAGE_KEY = "medlingo_chatbot_history";
const AUTO_SPEAK_KEY = "medlingo_chatbot_autospeak";

export default function HealthChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    // Default initial medical greeting
    return [
      {
        id: "welcome",
        sender: "ai",
        text: "**Welcome to MedLingo AI Health Assistant!** 🩺\n\nI can answer healthcare and medical questions, including:\n- **Medicine Uses & Dosage**\n- **Side Effects & Interactions**\n- **First Aid & Symptoms**\n- **General Health Tips**\n\n*How can I assist your health queries today?*",
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    const saved = localStorage.getItem(AUTO_SPEAK_KEY);
    return saved === null ? true : saved === "true";
  });

  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isOpen, isLoading]);

  // Persist chat history
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Persist autospeak settings
  useEffect(() => {
    localStorage.setItem(AUTO_SPEAK_KEY, String(autoSpeak));
  }, [autoSpeak]);

  // Stop speaking when chat is closed or unmounted
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText((prev) => (prev ? prev + " " + transcript : transcript));
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Text To Speech helper
  const handleSpeak = (text: string, msgId: string) => {
    if (!("speechSynthesis" in window)) return;

    if (isSpeakingId === msgId) {
      window.speechSynthesis.cancel();
      setIsSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel(); // Stop any active speaker

    // Strip markdown tags and disclaimer from spoken speech for clean audio experience
    const cleanText = text
      .replace(/\*\*|__/g, "")
      .replace(/-\s+/g, "")
      .replace(/Disclaimer:[\s\S]*$/gi, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith("en-") && (v.name.includes("Google") || v.name.includes("Natural")));
      if (engVoice) {
        utterance.voice = engVoice;
      } else {
        const fallbackEng = voices.find(v => v.lang.startsWith("en-"));
        if (fallbackEng) utterance.voice = fallbackEng;
      }
    }
    utterance.rate = 1.02; // Optimal rate for professional delivery
    utterance.onend = () => setIsSpeakingId(null);
    utterance.onerror = () => setIsSpeakingId(null);
    
    setIsSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Toggle Dictation Microphone
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice speech input is not supported in your browser. Please try Chrome or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  // Copy Message to Clipboard
  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Clear Chat history
  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear your chat history?")) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeakingId(null);
      const defaultGreeting: ChatMessage = {
        id: "welcome",
        sender: "ai",
        text: "**Welcome to MedLingo AI Health Assistant!** 🩺\n\nI can answer healthcare and medical questions, including:\n- **Medicine Uses & Dosage**\n- **Side Effects & Interactions**\n- **First Aid & Symptoms**\n- **General Health Tips**\n\n*How can I assist your health queries today?*",
        timestamp: new Date().toISOString(),
      };
      setMessages([defaultGreeting]);
    }
  };

  // Send Message to backend Gemini chatbot
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userQuery = inputText.trim();
    setInputText("");

    // Add user message to history
    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      sender: "user",
      text: userQuery,
      timestamp: new Date().toISOString(),
    };

    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory);
    setIsLoading(true);

    try {
      // Fetch response from Gemini chatbot API on server
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userQuery,
          history: currentHistory.slice(1, -1), // Send history minus first welcome message and new user message
        }),
      });

      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        let friendlyErr = `Chat server returned non-JSON response (Status ${response.status}).`;
        if (textResponse.includes("503") || textResponse.includes("Unavailable") || textResponse.toLowerCase().includes("overloaded")) {
          friendlyErr = "The chat service is currently overloaded. Please wait a moment and try again.";
        } else if (textResponse.includes("System action required") || textResponse.includes("ಸಿಸ್ಟಮ್ ಕ್ರಮದ") || textResponse.toLowerCase().includes("action required") || textResponse.includes("quota")) {
          friendlyErr = "Gemini API daily quota limit exceeded. Please configure a Paid API key in Settings or wait for the quota to reset.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html>") || textResponse.includes("<head>")) {
          friendlyErr = "The server is currently starting up or compiling. Please wait 5-10 seconds and try again.";
        }
        throw new Error(friendlyErr);
      }

      if (!response.ok || data.error) {
        throw new Error(data.message || "Failed to receive response from healthcare server.");
      }
      const aiReplyText = data.reply || "I'm designed to answer healthcare and medical questions only.";

      const aiMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        sender: "ai",
        text: aiReplyText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Handle Auto Speak if enabled
      if (autoSpeak) {
        setTimeout(() => handleSpeak(aiReplyText, aiMsg.id), 200);
      }
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        sender: "ai",
        text: "Sorry, I am having trouble connecting to the medical AI server right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Simple safe markdown paragraph and bullet-point formatter
  const renderFormattedText = (text: string) => {
    return text.split("\n").map((line, index) => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
      const isNumbered = /^\d+\.\s/.test(trimmed);

      let content = line;
      if (isBullet) {
        content = trimmed.substring(2);
      } else if (isNumbered) {
        content = trimmed.substring(trimmed.indexOf(" ") + 1);
      }

      // Process bold tags **boldText** safely
      const parts = content.split(/(\*\*.*?\*\*)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-bold text-slate-900 dark:text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (isBullet) {
        return (
          <li key={index} className="ml-4 list-disc my-1 text-sm text-slate-700 dark:text-slate-300">
            {renderedParts}
          </li>
        );
      }
      if (isNumbered) {
        return (
          <li key={index} className="ml-4 list-decimal my-1 text-sm text-slate-700 dark:text-slate-300">
            {renderedParts}
          </li>
        );
      }
      return (
        <p key={index} className="my-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words min-h-[0.5rem]">
          {renderedParts}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Stethoscope + Robot Action Launcher Button */}
      <button
        id="floating-ai-chatbot-button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white rounded-full shadow-lg hover:shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border border-white/20"
        title="Open MedLingo AI Health Assistant"
      >
        <div className="relative">
          <Stethoscope className="w-6 h-6 animate-pulse" />
          <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 text-blue-600 p-0.5 rounded-full border border-blue-500 shadow-sm">
            <Bot className="w-3.5 h-3.5" />
          </div>
        </div>
        {/* Subtle badge notification for visual hint */}
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
        </span>
      </button>

      {/* Beautiful Chat Panel Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="ai-chatbot-panel"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-8rem)] bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50"
          >
            {/* Header with gradient and details */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 text-white p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="relative p-2 bg-white/10 rounded-xl border border-white/15">
                  <Stethoscope className="w-5 h-5 text-cyan-200" />
                  <Bot className="w-3 h-3 absolute -bottom-0.5 -right-0.5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight tracking-wide">
                    MedLingo AI Health Assistant
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
                    <span className="text-[10px] text-cyan-100 font-medium tracking-wider uppercase">
                      Medical Questions Only
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Action controls */}
              <div className="flex items-center gap-1">
                {/* Auto-Speak Toggle */}
                <button
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer`}
                  title={autoSpeak ? "Auto-speak is ON (Click to Mute)" : "Auto-speak is OFF (Click to unmute)"}
                >
                  {autoSpeak ? (
                    <Volume2 className="w-4 h-4 text-cyan-200" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-white/60" />
                  )}
                </button>

                {/* Clear Chat Log */}
                <button
                  onClick={handleClearChat}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Clear Chat History"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Minimize button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Message Box */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40 dark:bg-slate-900/10">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`relative max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
                      msg.sender === "user"
                        ? "bg-blue-600 dark:bg-blue-700 text-white rounded-tr-none"
                        : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/50 dark:border-slate-800/60 rounded-tl-none"
                    }`}
                  >
                    {/* Render message body with formatting */}
                    <div className="space-y-1">
                      {msg.sender === "user" ? (
                        <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                      ) : (
                        renderFormattedText(msg.text)
                      )}
                    </div>

                    {/* Copy & TTS actions for assistant responses */}
                    {msg.sender === "ai" && msg.id !== "welcome" && (
                      <div className="flex items-center justify-end gap-1.5 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/50">
                        {/* Copy button */}
                        <button
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer"
                          title="Copy text"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {/* Audio Speak button */}
                        <button
                          onClick={() => handleSpeak(msg.text, msg.id)}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            isSpeakingId === msg.id
                              ? "text-blue-500 bg-blue-50 dark:bg-blue-950/40"
                              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                          }`}
                          title="Listen to response"
                        >
                          {isSpeakingId === msg.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Timestamp */}
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 px-1 tracking-wider uppercase">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}

              {/* Chat loader thinking bubble */}
              {isLoading && (
                <div className="flex flex-col items-start">
                  <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm max-w-[85%]">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        AI Assistant is thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Actions Area */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-2"
            >
              {/* Voice Speech Recognition button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`flex-shrink-0 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isListening
                    ? "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/20 dark:border-red-900/30 animate-pulse shadow-sm shadow-red-500/10"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200/65 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800/50 text-slate-600 dark:text-slate-300"
                }`}
                title={isListening ? "Listening... (Click to stop)" : "Dictate medical query"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Message text area */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about uses, dosages, side effects..."
                className="flex-1 bg-slate-50 focus:bg-white dark:bg-slate-900 dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1.5 focus:ring-blue-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                disabled={isLoading}
              />

              {/* Submit button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className={`flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md active:scale-95 transition-all cursor-pointer ${
                  !inputText.trim() || isLoading
                    ? "opacity-50 cursor-not-allowed shadow-none"
                    : "hover:shadow-lg hover:shadow-blue-500/10"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
