import "dotenv/config";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { moderateInput, moderateOutput, NOVA_SAFETY_POLICY } from "./moderation.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const maxImageMb = Math.max(1, Math.min(10, Number(process.env.MAX_IMAGE_MB || 5)));
const maxOutputTokens = Math.max(100, Math.min(2000, Number(process.env.MAX_OUTPUT_TOKENS || 800)));

app.disable("x-powered-by");
app.use(helmet({
  // The app uses inline styles/scripts in its single static page.
  contentSecurityPolicy: false
}));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Поддерживаются JPG, PNG, WEBP и GIF."));
    cb(null, true);
  }
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много запросов за короткое время. Попробуй немного позже." }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "NOVA AI", imageUpload: true });
});

app.post("/api/chat", chatLimiter, upload.single("image"), async (req, res) => {
  try {
    const text = String(req.body.message || "").trim();
    let history = [];
    try {
      history = JSON.parse(req.body.history || "[]");
      if (!Array.isArray(history)) history = [];
    } catch {
      return res.status(400).json({ error: "История чата имеет неверный формат." });
    }

    if (!text && !req.file) {
      return res.status(400).json({ error: "Напиши вопрос или прикрепи изображение." });
    }
    if (text.length > 8000) {
      return res.status(400).json({ error: "Сообщение слишком длинное (максимум 8000 символов)." });
    }

    // Basic deterministic guardrails: only blocks clear high-risk requests, not neutral education/news.
    const inputCheck = moderateInput(text);
    if (!inputCheck.allowed) {
      return res.status(400).json({
        error: "Я не могу помогать с призывами к терроризму или экстремизму, вербовкой, оправданием насилия либо практическими инструкциями для причинения вреда. Могу помочь с безопасной справкой, историческим контекстом или профилактикой."
      });
    }

    // Keep only recent, text-only history supplied by the client.
    const safeHistory = history.slice(-12).map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || "").slice(0, 4000)
    })).filter((m) => m.content);

    const userContent = [];
    if (text) userContent.push({ type: "text", text });
    if (req.file) {
      const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      userContent.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
    }

    const baseUrl = process.env.AI_BASE_URL || "http://127.0.0.1:11434/v1/chat/completions";
    const model = process.env.AI_MODEL || "qwen2.5vl:3b";
    const apiKey = process.env.AI_API_KEY || "";

    const upstreamMessages = [
      {
        role: "system",
        content: `Ты NOVA AI — дружелюбный ИИ-ассистент. Отвечай на языке пользователя, по умолчанию на русском. Объясняй понятно и честно; если не уверен, скажи об этом. Если пользователь прислал изображение, внимательно анализируй видимое содержимое и не выдумывай детали.\n\nПРАВИЛА БЕЗОПАСНОСТИ: ${NOVA_SAFETY_POLICY}`
      },
      ...safeHistory,
      { role: "user", content: userContent.length === 1 && userContent[0].type === "text" ? text : userContent }
    ];

    const upstream = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        messages: upstreamMessages,
        max_tokens: maxOutputTokens,
        temperature: 0.7,
        stream: false
      }),
      signal: AbortSignal.timeout(120000)
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("AI provider error:", upstream.status, JSON.stringify(data).slice(0, 1000));
      return res.status(502).json({
        error: "ИИ-провайдер не ответил. Проверь модель, адрес API и настройки сервера."
      });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return res.status(502).json({ error: "ИИ вернул пустой ответ или неподдерживаемый формат." });
    }

    const safeAnswer = moderateOutput(answer);
    if (!safeAnswer.allowed) {
      return res.json({
        answer: "Я не могу предоставить этот ответ в таком виде. Могу помочь безопасной информацией, например объяснить исторический контекст, признаки радикализации, профилактику терроризма или способы обратиться за помощью.",
        model,
        safetyFiltered: true
      });
    }
    res.json({ answer: answer.trim(), model });
  } catch (err) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Изображение слишком большое. Максимум ${maxImageMb} МБ.` });
    }
    if (err?.message?.includes("Поддерживаются")) {
      return res.status(415).json({ error: err.message });
    }
    console.error("Chat route error:", err?.message || err);
    res.status(500).json({ error: "Не удалось обработать запрос. Проверь, запущен ли сервер ИИ." });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Изображение слишком большое. Максимум ${maxImageMb} МБ.` });
  }
  if (err?.message?.includes("Поддерживаются")) {
    return res.status(415).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(port, () => {
  console.log(`NOVA AI is running at http://localhost:${port}`);
  console.log(`AI endpoint: ${process.env.AI_BASE_URL || "http://127.0.0.1:11434/v1/chat/completions"}`);
});
