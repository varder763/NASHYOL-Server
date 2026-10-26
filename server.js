import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Поддерживаются JPG, PNG и WEBP"), ok);
  },
});

app.get("/", (_req, res) => {
  res.json({ service: "NASHYOL Server", status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nashyol-server", geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post("/api/frame/identify", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ ok: false, error: "GEMINI_API_KEY is not configured" });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Send an image in multipart field 'image'" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const imageB64 = req.file.buffer.toString("base64");

    const prompt = `Ты модуль приложения «НАШЁЛ». Проанализируй кадр и попробуй определить фильм, сериал, мультфильм или клип.
Верни ТОЛЬКО JSON без markdown в формате:
{
  "recognized": true,
  "bestGuess": {"title": "", "originalTitle": "", "year": null, "type": "movie|series|animation|music_video|unknown", "confidence": 0},
  "alternatives": [{"title": "", "year": null, "confidence": 0}],
  "visualClues": [""],
  "note": ""
}
confidence — число от 0 до 1. Не выдумывай точное совпадение: если уверенность низкая, поставь recognized=false и объясни неопределённость в note. Не идентифицируй частных людей на фото.`;

    const interaction = await ai.interactions.create({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      input: [
        { type: "text", text: prompt },
        { type: "image", data: imageB64, mime_type: req.file.mimetype },
      ],
    });

    const raw = (interaction.output_text || "").trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let result;
    try { result = JSON.parse(cleaned); }
    catch { result = { recognized: false, bestGuess: null, alternatives: [], visualClues: [], note: "Model returned non-JSON output", raw: cleaned.slice(0, 2000) }; }

    res.json({ ok: true, result });
  } catch (error) {
    console.error("Frame identify error:", error?.message || error);
    res.status(500).json({ ok: false, error: "Frame recognition failed" });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err?.message || err);
  res.status(400).json({ ok: false, error: err?.message || "Bad request" });
});

app.listen(port, () => console.log(`NASHYOL Server listening on ${port}`));
