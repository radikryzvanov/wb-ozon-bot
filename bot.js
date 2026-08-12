import "dotenv/config";
import { Bot } from "grammy";
import OpenAI from "openai";

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN не задан в .env");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY не задан в .env");

// 1. Инициализация OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://t.me", // OpenRouter требует указать источник запроса
    "X-Title": "WB/Ozon Card Generator Bot",
  },
});

// 2. Инициализация Telegram-бота
const bot = new Bot(BOT_TOKEN);

// Превращает **жирный** и # Заголовки из ответа модели в HTML, понятный Telegram
function toTelegramHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/^---+$/gm, "");
}

// Команда /start
bot.command("start", (ctx) => {
  return ctx.reply(
    "👋 Привет! Я ИИ-генератор карточек для Wildberries и Ozon.\n\n" +
    "Пришли мне название и свойства товара, и нейросеть составит уникальное продающее описание!"
  );
});

// Обработка текстовых сообщений
bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text;
  if (userText.startsWith("/")) return;

  await ctx.reply("⏳ Нейросеть генерирует уникальное описание карточки...");

  try {
    const completion = await openai.chat.completions.create({
      model: "google/gemma-4-26b-a4b-it:free",
      messages: [
        {
          role: "system",
          content: "Ты – профессиональный копирайтер для маркетплейсов Wildberries и Ozon."
        },
        {
          role: "user",
          content: `Составь продающее описание карточки товара на основе данных: "${userText}"\n\nСтруктура:\n1. Заголовок (яркий, с ключевыми словами)\n2. Преимущества (3-4 пункта с эмодзи)\n3. Продающий текст (2 коротких абзаца)\n4. Блок SEO-ключевых слов и хештегов`
        }
      ]
    });

    const responseText = completion.choices[0]?.message?.content;
    if (responseText) {
      await ctx.reply(toTelegramHtml(responseText), { parse_mode: "HTML" });
    } else {
      await ctx.reply("Не удалось получить текст от нейросети.");
    }

  } catch (error) {
    console.error("Ошибка обращения к OpenRouter:", error?.status, error?.message, error?.error);
    const status = error?.status;
    let hint = "Проверь консоль VS Code.";
    if (status === 401) hint = "Неверный или устаревший API-ключ OpenRouter — проверь .env.";
    else if (status === 429) hint = "Похоже, исчерпан лимит бесплатной модели на сегодня. Попробуй позже.";
    await ctx.reply(`❌ Ошибка обращения к ИИ (${status ?? "?"}). ${hint}`);
  }
});

// Запуск бота
async function main() {
  console.log("Запускаем ИИ-бота...");
  await bot.start();
}

main();