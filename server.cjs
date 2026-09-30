const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
// ЛИМИТ: 10 сообщений в день
// ===============================

const DAILY_LIMIT = 10;
const users = new Map();

function getBrowserId(req, res) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/nova_browser_id=([^;]+)/);

  if (match) {
    return match[1];
  }

  const id = crypto.randomUUID();

  res.setHeader(
    "Set-Cookie",
    `nova_browser_id=${id}; Max-Age=31536000; Path=/; SameSite=Lax`
  );

  return id;
}

function getToday() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ===============================
// NOVA AI
// ===============================

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    // Получаем ID браузера
    const browserId = getBrowserId(req, res);
    const today = getToday();

    // Получаем статистику пользователя
    let user = users.get(browserId);

    // Если наступил новый день — сбрасываем счётчик
    if (!user || user.date !== today) {
      user = {
        date: today,
        count: 0
      };

      users.set(browserId, user);
    }

    // Проверяем лимит
    if (user.count >= DAILY_LIMIT) {
      return res.status(429).json({
        error: "Ты использовал все 10 сообщений на сегодня. Попробуй завтра."
      });
    }

    const message = req.body.message || "";
    let history = [];

    try {
      history = JSON.parse(req.body.history || "[]");
    } catch {
      history = [];
    }

    if (!message.trim() && !req.file) {
      return res.status(400).json({
        error: "Напиши сообщение."
      });
    }

    // Засчитываем сообщение
    user.count++;

    const messages = [
      {
        role: "system",
        content:
          "Ты NOVA AI — полезный ИИ-ассистент. Отвечай на русском языке, понятно и дружелюбно."
      },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      {
        role: "user",
        content: message || "Привет!"
      }
    ];

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      // Если запрос к ИИ не прошёл,
      // возвращаем сообщение обратно пользователю,
      // чтобы не тратить его лимит.
      user.count--;

      return res.status(response.status).json({
        error: data?.error?.message || "Ошибка OpenRouter."
      });
    }

    res.json({
      answer:
        data.choices?.[0]?.message?.content ||
        "ИИ не вернул текстовый ответ.",
      remaining: DAILY_LIMIT - user.count
    });

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Ошибка сервера. Проверь настройки API."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
