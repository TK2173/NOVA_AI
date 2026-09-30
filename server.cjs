const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Сообщение пустое."
      });
    }

    
const response = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        ...(Array.isArray(history) ? history : []),
        {
          role: "user",
          content: message
        }
      ]
    })
  }
);

const data = await response.json();

if (!response.ok) {
  console.error("OpenRouter error:", data);
  return res.status(response.status).json({
    error: data?.error?.message || "Ошибка ИИ."
  });
}

res.json({
  answer: data.choices?.[0]?.message?.content
    || "ИИ не вернул текстовый ответ."
});

      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          ...(Array.isArray(history) ? history : []),
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Ошибка ИИ."
      });
    }

    res.json({
      answer: data.output_text || "ИИ не вернул текстовый ответ."
    });

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Ошибка сервера."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
