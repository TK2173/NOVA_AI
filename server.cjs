
const express = require("express");
const path = require("path");
const multer = require("multer");

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

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
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

    const messages = [
      {
        role: "system",
        content: "Ты NOVA AI — полезный ИИ-ассистент. Отвечай на русском языке, понятно и дружелюбно."
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
          model: "openai/gpt-oss-20b:free",
          messages
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Ошибка OpenRouter."
      });
    }

    res.json({
      answer:
        data.choices?.[0]?.message?.content ||
        "ИИ не вернул текстовый ответ."
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
