import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";

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
  res.json({
    ok: true,
    service: "nashyol-server",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    recognized: { type: Type.BOOLEAN },
    bestGuess: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        title: { type: Type.STRING },
        originalTitle: { type: Type.STRING },
        year: { type: Type.INTEGER, nullable: true },
        type: {
          type: Type.STRING,
          enum: ["movie", "series", "animation", "music_video", "unknown"],
        },
        confidence: { type: Type.NUMBER },
      },
      required: ["title", "originalTitle", "year", "type", "confidence"],
    },
    alternatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          year: { type: Type.INTEGER, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ["title", "year", "confidence"],
      },
    },
    visualClues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    note: { type: Type.STRING },
  },
  required: ["recognized", "bestGuess", "alternatives", "visualClues", "note"],
};

app.post("/api/frame/identify", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Send an image in multipart field 'image'",
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const imageB64 = req.file.buffer.toString("base64");

    const prompt = `Ты модуль приложения «НАШЁЛ».
Проанализируй присланный кадр и попробуй определить произведение: фильм, сериал,
мультфильм или музыкальный клип.

Используй визуальные признаки сцены, костюмов, декораций, известных экранных
персонажей и общий контекст кадра. Не идентифицируй частных людей.

Правила:
1. Не выдумывай точное совпадение.
2. confidence должен быть числом от 0 до 1.
3. Если уверенность недостаточна, recognized=false.
4. При recognized=false bestGuess может быть null.
5. Дай до 3 разумных альтернатив.
6. visualClues должны кратко объяснять, что в кадре помогло определить источник.
7. Отвечай на русском языке там, где это уместно.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: req.file.mimetype,
                data: imageB64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
      },
    });

    const raw = (response.text || "").trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned invalid JSON",
      });
    }

    if (result?.bestGuess?.confidence != null) {
      result.bestGuess.confidence = Math.max(
        0,
        Math.min(1, Number(result.bestGuess.confidence) || 0)
      );
    }

    if (
      result.recognized &&
      (!result.bestGuess || result.bestGuess.confidence < 0.45)
    ) {
      result.recognized = false;
      result.note =
        result.note ||
        "Недостаточная уверенность для надёжного распознавания.";
    }

    res.json({ ok: true, result });
  } catch (error) {
    console.error("Frame identify error:", error?.message || error);

    const status =
      error?.status === 429 ? 429 :
      error?.status === 401 || error?.status === 403 ? 502 :
      500;

    res.status(status).json({
      ok: false,
      error:
        status === 429
          ? "Gemini rate limit reached"
          : "Frame recognition failed",
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err?.message || err);

  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      ok: false,
      error: "Максимальный размер изображения — 10 МБ",
    });
  }

  res.status(400).json({
    ok: false,
    error: err?.message || "Bad request",
  });
});

app.listen(port, () => {
  console.log(`NASHYOL Server listening on ${port}`);
});
