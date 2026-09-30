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

// =====================================
// ЛИМИТ: 10 сообщений в день
// =====================================

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

// =====================================
// БАЗОВАЯ ПРОВЕРКА БЕЗОПАСНОСТИ
// =====================================

function isUnsafeRequest(message) {
  const text = message.toLowerCase();

  const dangerousPatterns = [
    // Вредоносное ПО и взлом
    /как\s+(создать|написать|сделать).{0,50}(вирус|троян|вымогател|кейлоггер|ботнет)/i,
    /как\s+(взломать|вскрыть|обойти).{0,50}(аккаунт|пароль|защиту|систему)/i,

    // Оружие и взрывчатка
    /как\s+(сделать|изготовить|создать).{0,50}(бомб|взрывчат|оружие)/i,

    // Опасные вещества
    /как\s+(сделать|изготовить|получить).{0,50}(яд|токсин|отрав)/i,

    // Самоповреждение
    /как\s+(причинить|нанести).{0,50}(себе\s+вред|себе\s+повреждени)/i,

    // Сексуальный контент с несовершеннолетними
    /(несовершеннолетн|ребен|ребён).{0,80}(порно|сексуаль|эротич)/i
  ];

  return dangerousPatterns.some((pattern) => pattern.test(text));
}

// =====================================
// NOVA AI
// =====================================

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const browserId = getBrowserId(req, res);
    const today = getToday();

    let user = users.get(browserId);

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

    // Проверяем запрос до отправки модели
    if (message.trim() && isUnsafeRequest(message)) {
      return res.status(400).json({
        error: "Я не могу помочь с таким запросом."
      });
    }

    // Засчитываем только разрешённый запрос
    user.count++;

    const messages = [
      {
        role: "system",
        content:
          "Ты NOVA AI — полезный ИИ-ассистент. Отвечай на русском языке, понятно и дружелюбно. Не помогай с созданием оружия, взрывчатки, вредоносного ПО, обходом систем безопасности, причинением вреда людям или сексуальным контентом с несовершеннолетними. Если запрос опасный или запрещённый, кратко откажись и предложи безопасную альтернативу."
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

      // Если API не ответил, возвращаем сообщение в лимит
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
