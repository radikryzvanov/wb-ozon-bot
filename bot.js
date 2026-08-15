import "dotenv/config";
import { Bot, session } from "grammy";
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
    "HTTP-Referer": "https://t.me",
    "X-Title": "WB/Ozon Card Generator Bot",
  },
});

// 2. Инициализация Telegram-бота
const bot = new Bot(BOT_TOKEN);

// Хранит, на каком вопросе сейчас находится каждый пользователь,
// и что он уже успел рассказать о товаре
function initialSession() {
  return { step: null, data: {} };
}
bot.use(session({ initial: initialSession }));

// Список вопросов по порядку: [ключ в data, текст вопроса]
const QUESTIONS = [
  ["category", "1/4. Какая категория товара? (например: спортивный костюм, кроссовки, чехол для телефона)"],
  ["brand", "2/4. Бренд и материал/состав (если есть)? Если бренда нет — напиши \"без бренда\"."],
  ["features", "3/4. Главные особенности и преимущества товара? (цвет, размеры, для чего подходит, чем отличается от аналогов)"],
  ["keywords", "4/4. Для кого товар и какие ключевые слова важно включить для поиска на маркетплейсе?"],
];

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

// Команда /start — сбрасывает диалог и задаёт первый вопрос
bot.command("start", async (ctx) => {
  ctx.session = initialSession();
  ctx.session.step = 0;
  await ctx.reply(
    "👋 Привет! Я ИИ-генератор карточек для Wildberries и Ozon.\n\n" +
    "Отвечу подробнее, если ты подробнее расскажешь о товаре — сейчас задам несколько коротких вопросов по очереди.\n\n" +
    QUESTIONS[0][1]
  );
});

// Команда /cancel — прервать диалог, если передумал
bot.command("cancel", async (ctx) => {
  ctx.session = initialSession();
  await ctx.reply("Хорошо, начнём заново, когда будешь готов — просто напиши /start.");
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  // Если диалог ещё не начат — просим начать с /start
  if (ctx.session.step === null) {
    await ctx.reply("Чтобы начать, напиши команду /start — я задам несколько вопросов о товаре.");
    return;
  }

  // Сохраняем ответ на текущий вопрос
  const [key] = QUESTIONS[ctx.session.step];
  ctx.session.data[key] = text;

  const nextStep = ctx.session.step + 1;

  // Если остались ещё вопросы — задаём следующий
  if (nextStep < QUESTIONS.length) {
    ctx.session.step = nextStep;
    await ctx.reply(QUESTIONS[nextStep][1]);
    return;
  }

  // Все вопросы собраны — генерируем описание
  ctx.session.step = null;
  await ctx.reply("⏳ Нейросеть генерирует уникальное описание карточки...");

  const { category, brand, features, keywords } = ctx.session.data;
  const productSummary =
    `Категория: ${category}\n` +
    `Бренд/материал: ${brand}\n` +
    `Особенности и преимущества: ${features}\n` +
    `Для кого и ключевые слова: ${keywords}`;

  try {
    const completion = await openai.chat.completions.create({
      // Если бот перестанет отвечать с ошибкой 404 "No endpoints found" —
      // значит эта бесплатная модель пропала с OpenRouter (список бесплатных
      // моделей периодически меняется). Зайди на openrouter.ai/models,
      // поставь фильтр цены "Free" и вставь сюда название другой модели
      // (в формате "автор/название:free").
      model: "google/gemma-4-26b-a4b-it:free",
      messages: [
        {
          role: "system",
          content: "Ты – профессиональный копирайтер для маркетплейсов Wildberries и Ozon. " +
            "Строго соблюдай правила:\n" +
            "1. Не используй эзотерические и псевдонаучные формулировки: " +
            "\"сила природы\", \"магия растений\", \"энергия\", \"целебная сила\" и подобные штампы. " +
            "Пиши конкретно и по фактам.\n" +
            "2. Латинские названия видов и сортов растений/продуктов всегда пиши на латинице " +
            "(например: Nigella sativa), не транслитерируй их на русский.\n" +
            "3. Способы применения товара должны соответствовать его реальным свойствам. " +
            "Например, горькие лечебные масла — для приёма курсом или наружного применения, " +
            "а не для добавления в кулинарные блюда как обычное растительное масло. " +
            "Не выдумывай способы использования, которые не подходят продукту."
        },
        {
          role: "user",
          content: `Составь продающее описание карточки товара на основе данных:\n${productSummary}\n\nСтруктура:\n1. Заголовок (яркий, с ключевыми словами)\n2. Преимущества (3-4 пункта с эмодзи)\n3. Продающий текст (2 коротких абзаца)\n4. Блок SEO-ключевых слов и хештегов`
        }
      ]
    });

    const responseText = completion.choices[0]?.message?.content;
    if (responseText) {
      await ctx.reply(toTelegramHtml(responseText), { parse_mode: "HTML" });
      await ctx.reply("Готово! Чтобы составить описание для следующего товара — напиши /start");
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