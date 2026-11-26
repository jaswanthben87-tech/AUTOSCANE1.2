import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Tesseract from "tesseract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

const app = express();
const isVercel = Boolean(process.env.VERCEL);
const port = Number(process.env.PORT || 3037);
let currentApiKey = (process.env.GEMINI_API_KEY || "").trim();
let currentModelName = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();

if ((!currentApiKey || currentApiKey.includes("PASTE_YOUR")) && !isVercel) {
  console.error("Missing GEMINI_API_KEY. Copy .env.example to .env and add your key.");
  process.exit(1);
}

app.use(cors({
  origin(origin, callback) {
    // Chrome extension pages send a chrome-extension:// origin. Local requests
    // without an Origin header are allowed for local testing.
    if (!origin || origin.startsWith("chrome-extension://")) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "10mb" }));

let genAI = currentApiKey && !currentApiKey.includes("PASTE_YOUR") ? new GoogleGenerativeAI(currentApiKey) : null;

async function runLocalOcr(imageBuffer) {
  const { data } = await Tesseract.recognize(imageBuffer, "eng", { cachePath: __dirname });
  return (data.text || "").trim();
}
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-flash-latest"
];
const MODEL_TIMEOUT_MS = 8000;
const FAST_RACE_COUNT = 3;

function isRetryableModelError(error) {
  const msg = String(error?.message || "");
  return /503|service unavailable|high demand|404|not found|no longer available|429|quota|resource exhausted|rate.?limit|timeout|timed out|abort|econnreset|etimedout|fetch failed/i.test(msg);
}

function getCandidateModels() {
  return [currentModelName, ...DEFAULT_FALLBACK_MODELS]
    .filter((name, index, arr) => name && arr.indexOf(name) === index);
}

function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function persistEnvUpdates(updates) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = content ? content.split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const prefix = `${key}=`;
    const idx = lines.findIndex(line => line.startsWith(prefix));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  }
  const normalized = lines.filter((line, idx, arr) => !(idx === arr.length - 1 && line === "")).join("\n") + "\n";
  fs.writeFileSync(envPath, normalized, "utf8");
}

async function raceModels(candidates, request) {
  const controller = new AbortController();
  try {
    return await Promise.any(
      candidates.map(async (candidate) => {
        try {
          const candidateModel = genAI.getGenerativeModel({ model: candidate });
          return await candidateModel.generateContent(request, {
            timeout: MODEL_TIMEOUT_MS,
            signal: controller.signal
          });
        } catch (error) {
          if (!controller.signal.aborted) {
            console.warn(`Model ${candidate} failed (${String(error?.message || "").split("\n")[0]})`);
          }
          throw error;
        }
      })
    );
  } catch (aggregateError) {
    const errors = Array.isArray(aggregateError?.errors) ? aggregateError.errors : [aggregateError];
    const fatalError = errors.find(err => !isRetryableModelError(err));
    if (fatalError) throw fatalError;
    throw errors[0] || aggregateError;
  } finally {
    controller.abort();
  }
}

async function generateWithFallback(request) {
  if (!genAI) {
    throw new Error("Missing GEMINI_API_KEY in server environment variables.");
  }
  const candidates = getCandidateModels();
  const wave1 = candidates.slice(0, FAST_RACE_COUNT);
  const wave2 = candidates.slice(FAST_RACE_COUNT);

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (wave1.length > 0) {
      try {
        return await raceModels(wave1, request);
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) throw error;
      }
    }
    if (wave2.length > 0 && attempt === 0) {
      try {
        return await raceModels(wave2, request);
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) throw error;
      }
    }
  }
  throw lastError;
}

app.get("/", (_req, res) => res.json({
  ok: true,
  service: "ask-gemini-scan-server",
  model: currentModelName,
  hasApiKey: Boolean(currentApiKey),
  health: "/health"
}));

app.get("/health", (_req, res) => res.json({
  ok: Boolean(currentApiKey),
  model: currentModelName,
  hasApiKey: Boolean(currentApiKey),
  supportsSettingsApi: !isVercel
}));

app.get("/api/settings", (_req, res) => {
  res.json({
    ok: true,
    model: currentModelName,
    hasApiKey: Boolean(currentApiKey),
    apiKeyPreview: maskApiKey(currentApiKey),
    availableModels: getCandidateModels(),
    supportsSettingsApi: !isVercel
  });
});

app.post("/api/settings", (req, res) => {
  if (isVercel) {
    return res.status(403).json({ error: "Settings are managed via Vercel Environment Variables on cloud deployments." });
  }
  try {
    const nextModel = typeof req.body?.model === "string" ? req.body.model.trim() : "";
    const nextApiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

    if (!nextModel && !nextApiKey) {
      return res.status(400).json({ error: "Provide a model name or API key to update." });
    }
    if (nextModel && !/^[a-zA-Z0-9._-]{2,80}$/.test(nextModel)) {
      return res.status(400).json({ error: "Invalid model name format." });
    }
    if (nextApiKey && (nextApiKey.length < 10 || nextApiKey.includes("PASTE_YOUR") || /[\r\n]/.test(nextApiKey))) {
      return res.status(400).json({ error: "Invalid Gemini API key." });
    }

    const envUpdates = {};
    if (nextModel) {
      currentModelName = nextModel;
      envUpdates.GEMINI_MODEL = nextModel;
    }
    if (nextApiKey) {
      currentApiKey = nextApiKey;
      genAI = new GoogleGenerativeAI(currentApiKey);
      envUpdates.GEMINI_API_KEY = nextApiKey;
    }
    persistEnvUpdates(envUpdates);

    return res.json({
      ok: true,
      model: currentModelName,
      hasApiKey: Boolean(currentApiKey),
      apiKeyPreview: maskApiKey(currentApiKey),
      availableModels: getCandidateModels()
    });
  } catch (error) {
    console.error("Failed to update settings:", error?.message || error);
    return res.status(500).json({ error: "Failed to save server settings." });
  }
});

app.post("/api/scan", async (req, res) => {
  try {
    const imageData = req.body?.image;
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
      return res.status(400).json({ error: "A PNG/JPEG image data URL is required." });
    }
    const match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: "Unsupported or malformed image." });

    const mimeType = match[1] === "jpg" ? "image/jpeg" : `image/${match[1]}`;
    const imageBuffer = Buffer.from(match[2], "base64");
    if (imageBuffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "Selected region is too large. Select a smaller area." });
    }

    if (!isVercel) {
      // OCR runs locally on this computer using Tesseract.js (English language data).
      const extractedText = await runLocalOcr(imageBuffer);
      if (!extractedText) {
        return res.status(422).json({
          error: "OCR could not read text in this region. Try selecting a larger, sharper area."
        });
      }

      const prompt = [
        "You are Ask Gemini, a helpful study assistant.",
        "Answer the question extracted from a screenshot.",
        "If it is a multiple-choice question, identify the correct option and explain briefly.",
        "If OCR contains obvious recognition errors, infer cautiously from context.",
        "If the question is incomplete or unreadable, say what is missing instead of inventing details.",
        "Give a clear, direct answer followed by a short explanation when useful.",
        "",
        "OCR-extracted question:",
        extractedText
      ].join("\n");

      const result = await generateWithFallback(prompt);
      const answer = result.response.text();
      return res.json({ extractedText, answer });
    }

    const cloudPrompt = [
      "You are Ask Gemini, a helpful study assistant.",
      "Read and answer the question shown in this screenshot.",
      "If it is a multiple-choice question, identify the correct option and explain briefly.",
      "If the question is incomplete or unreadable, say what is missing instead of inventing details.",
      "Give a clear, direct answer followed by a short explanation when useful."
    ].join("\n");
    const result = await generateWithFallback({
      contents: [{
        role: "user",
        parts: [
          { text: cloudPrompt },
          { inlineData: { mimeType, data: match[2] } }
        ]
      }]
    });
    return res.json({ extractedText: "", answer: result.response.text() });
  } catch (error) {
    console.error("Scan request failed:", error?.message || error);
    return res.status(500).json({
      error: "Scan failed. Check the API key, model name, network connection, and Gemini API quota."
    });
  }
});


app.post("/api/autoscan", async (req, res) => {
  try {
    const imageData = req.body?.image;
    if (typeof imageData !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) {
      return res.status(400).json({ error: "A valid PNG/JPEG screenshot is required. Press Ctrl+Shift+Q and retry." });
    }
    const match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    const mimeType = match[1] === "jpg" ? "image/jpeg" : `image/${match[1]}`;
    const imageBuffer = Buffer.from(match[2], "base64");
    if (imageBuffer.length > 6 * 1024 * 1024) return res.status(413).json({ error: "Screenshot is too large. Zoom out or reduce the browser window size, then retry." });

    const domText = typeof req.body?.domText === "string" ? req.body.domText.slice(0, 12000).trim() : "";
    const ocrText = !isVercel ? (await runLocalOcr(imageBuffer)).slice(0, 14000) : "";
    if (!isVercel && !ocrText && !domText) return res.status(422).json({ error: "No readable text found. Make the question larger and clearer, then scan again." });

    const parseQuestions = (result) => {
      let parsed;
      const raw = result.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try {
        parsed = JSON.parse(raw);
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            parsed = JSON.parse(raw.slice(start, end + 1));
          } catch {
            parsed = null;
          }
        }
      }
      if (!parsed || !Array.isArray(parsed.questions)) {
        const err = new Error("Gemini returned an unreadable answer. Press Retry to try again.");
        err.statusCode = 502;
        throw err;
      }
      return parsed.questions.slice(0, req.body?.firstOnly ? 1 : 20).map(q => ({
        question: String(q?.question || "Question not clearly detected").slice(0, 3000),
        options: Array.isArray(q?.options) ? q.options.slice(0, 12).map(o => String(o).slice(0, 500)) : [],
        answer: String(q?.answer || "No reliable answer returned.").slice(0, 4000),
        explanation: String(q?.explanation || "").slice(0, 4000)
      }));
    };

    const generateParsedQuestions = async (request) => {
      try {
        return parseQuestions(await generateWithFallback(request));
      } catch (err) {
        if (err?.statusCode === 502) {
          return parseQuestions(await generateWithFallback(request));
        }
        throw err;
      }
    };

    const baseRules = [
      "You are Ask Gemini AutoScan, a careful study assistant.",
      "Use only visible questions, answer options, ordering steps, and any visible code editors or reference panes on screen (plus `VISIBLE_OR_DOM_CODE`, or `PREVIOUS_QUIZ_CODE` ONLY when a question asks about 'the provided implementation/code' and none is currently visible); ignore navigation, ads, unrelated paragraphs, browser UI, and page boilerplate.",
      "Preserve the original question order. If firstOnly is true, return only the first question.",
      "Do not guess missing or unreadable text; say when something is unclear.",
      "In `explanation`, trace operations, arithmetic, code execution, or math step-by-step carefully BEFORE writing `answer`, and double-check counts and signs.",
      "Question-type formatting rules for `answer`:",
      "- Single-choice MCQ: give the correct option letter/number and its text.",
      "- Multi-select ('Select all that apply' / checkboxes): list ALL correct options clearly (one per line).",
      "- Ordering / Arrange / Drag-and-Drop steps: return the COMPLETE ordered sequence from step 1 to the last step (numbered 1, 2, 3...) with the exact step text.",
      "- Short answer / fill-in-the-blank: give the exact concise answer.",
      "For each question provide `question`, `options` (array of strings), `explanation` (brief step-by-step verification), and `answer` (string).",
      'Return valid JSON only, matching this exact schema: {"questions":[{"question":"...","options":["..."],"explanation":"...","answer":"..."}]}. If no question is detected, return {"questions":[]}.'
    ].join(" ");

    let questions = [];
    if (isVercel) {
      const cloudPrompt = `${baseRules}\nRead the visible questions, options, ordering steps, and any diagrams, trees, charts, code panes, or figures from the screenshot and accessible webpage text.\nfirstOnly: ${Boolean(req.body?.firstOnly)}\nACCESSIBLE_DOM_TEXT (supporting text; use the screenshot for diagrams, figures, and visual layout):\n${domText}`;
      questions = await generateParsedQuestions({
        contents: [{
          role: "user",
          parts: [
            { text: cloudPrompt },
            { inlineData: { mimeType, data: match[2] } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      });
    } else if (ocrText || domText) {
      const textPrompt = `${baseRules}\nExtract the visible questions from the supplied OCR and optional accessible webpage text.\nfirstOnly: ${Boolean(req.body?.firstOnly)}\nOCR_TEXT:\n${ocrText}\nACCESSIBLE_DOM_TEXT (secondary evidence; prefer visible question context):\n${domText}`;
      questions = await generateParsedQuestions({
        contents: [{ role: "user", parts: [{ text: textPrompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      });
    }

    if (!questions.length) return res.status(422).json({ error: "Text was detected, but no question could be identified. Scroll the question fully into view and retry." });
    return res.json({ questions, ocrText });
  } catch (error) {
    if (error?.statusCode === 502) return res.status(502).json({ error: error.message });
    const message = String(error?.message || "");
    console.error("AutoScan request failed:", message);
    if (/503|service unavailable|high demand/i.test(message)) return res.status(503).json({ error: "Gemini is temporarily experiencing high demand. Press Retry in a moment." });
    if (/timeout|timed out|abort/i.test(message)) return res.status(504).json({ error: "Gemini took too long to respond. Press Retry in a moment." });
    if (/quota|resource exhausted|429/i.test(message)) return res.status(429).json({ error: "Gemini quota is exhausted or rate-limited. Wait a little, check your Gemini usage, and retry." });
    if (/api key|unauthenticated|permission denied|401|403/i.test(message)) return res.status(502).json({ error: "Gemini rejected the API key. Check GEMINI_API_KEY in server/.env and restart the server." });
    return res.status(500).json({ error: "AutoScan failed. Check the local server terminal, internet connection, model configuration, and Gemini quota." });
  }
});

if (!isVercel) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Ask Gemini local server listening at http://127.0.0.1:${port}`);
    console.log("OCR is processed locally; only extracted text and nearby accessible question text are sent to Gemini.");
  });
}

export default app;
