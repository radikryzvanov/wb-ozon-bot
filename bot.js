import "dotenv/config";
import { Bot, session } from "grammy";
import OpenAI from "openai";
 
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
 
if (!BOT_TOKEN) throw new Error("BOT_TOKEN не задан в .env");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY не задан в .env");
 
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://t.me",
    "X-Title": "WB/Ozon Card Generator Bot",
  },
});
 
const bot = new Bot(BOT_TOKEN);
 
const FREE_LIMIT = 3;
const LIMITS_ENABLED = false;
const UNLOCK_CODE = process.env.UNLOCK_CODE || "";
 
const usage = new Map();
 
function getUserUsage(userId) {
  if (!usage.has(userId)) {
    usage.set(userId, { used: 0, unlocked: false });
  }
  return usage.get(userId);
}
 
function initialSession() {
  return { step: null, data: {}, lastDescription: null, wbFlow: null };
}
bot.use(session({ initial: initialSession }));
 
const QUESTIONS = [
  ["category", "1/4. Какая категория товара? (например: спортивный костюм, кроссовки, чехол для телефона)"],
  ["brand", "2/4. Бренд и материал/состав (если есть)? Если бренда нет — напиши \"без бренда\"."],
  ["features", "3/4. Главные особенности и преимущества товара? (цвет, размеры, для чего подходит, чем отличается от аналогов)"],
  ["keywords", "4/4. Для кого товар и какие ключевые слова важно включить для поиска на маркетплейсе?"],
];
 
function toTelegramHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/^---+$/gm, "");
}
 
async function updateWbCardDescription(wbToken, nmId, newDescription) {
  const listResponse = await fetch("https://content-api.wildberries.ru/content/v2/get/cards/list", {
    method: "POST",
    headers: {
      "Authorization": wbToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      settings: {
        filter: { textSearch: String(nmId), withPhoto: -1 },
        cursor: { limit: 1 },
      },
    }),
  });
 
  if (!listResponse.ok) {
    throw new Error(`Не удалось получить карточку (${listResponse.status}). Проверь токен и nmID.`);
  }
 
  const listData = await listResponse.json();
  const card = listData?.cards?.find((c) => String(c.nmID) === String(nmId));
  if (!card) {
    throw new Error("Карточка с таким nmID не найдена в этом магазине.");
  }
 
  card.description = newDescription;
 
  const updateResponse = await fetch("https://content-api.wildberries.ru/content/v2/cards/update", {
    method: "POST",
    headers: {
      "Authorization": wbToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([card]),
  });
 
  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error(`WB отклонил обновление (${updateResponse.status}): ${errText}`);
  }
 
  return true;
}
 
bot.command("start", async (ctx) => {
  const userUsage = getUserUsage(ctx.from.id);
 
  if (LIMITS_ENABLED && !userUsage.unlocked && userUsage.used >= FREE_LIMIT) {
    await ctx.reply(
      "🔒 Бесплатный лимит исчерпан (" + FREE_LIMIT + " описаний).\n\n" +
      "Чтобы продолжить пользоваться ботом без ограничений — напиши мне " +
      "[впиши сюда свой контакт для оплаты, например @твой_юзернейм], " +
      "переведи оплату и получи код разблокировки.\n\n" +
      "После оплаты введи команду:\n/unlock ТВОЙКОД"
    );
    return;
  }
 
  ctx.session = initialSession();
  ctx.session.step = 0;
  await ctx.reply(
    "👋 Привет! Я ИИ-генератор карточек для Wildberries и Ozon.\n\n" +
    "Отвечу подробнее, если ты подробнее расскажешь о товаре — сейчас задам несколько коротких вопросов по очереди.\n\n" +
    QUESTIONS[0][1]
  );
});
 
bot.command("cancel", async (ctx) => {
  ctx.session = initialSession();
  await ctx.reply("Хорошо, начнём заново, когда будешь готов — просто напиши /start.");
});
 
bot.command("unlock", async (ctx) => {
  const enteredCode = ctx.match?.trim();
  const userUsage = getUserUsage(ctx.from.id);
 
  if (!enteredCode) {
    await ctx.reply("Напиши код после команды, например:\n/unlock ТВОЙКОД");
    return;
  }
 
  if (!UNLOCK_CODE) {
    await ctx.reply("Разблокировка сейчас не настроена. Свяжись с администратором бота.");
    return;
  }
 
  if (enteredCode === UNLOCK_CODE) {
    userUsage.unlocked = true;
    await ctx.reply("✅ Готово! Лимит снят, можешь генерировать описания без ограничений.");
  } else {
    await ctx.reply("❌ Неверный код. Проверь код или свяжись с администратором бота.");
  }
});
 
bot.command("status", async (ctx) => {
  const userUsage = getUserUsage(ctx.from.id);
  if (userUsage.unlocked) {
    await ctx.reply("У тебя безлимитный доступ ✅");
  } else {
    const left = Math.max(0, FREE_LIMIT - userUsage.used);
    await ctx.reply(`Бесплатных описаний осталось: ${left} из ${FREE_LIMIT}`);
  }
});
 
bot.command("publish_wb", async (ctx) => {
  if (!ctx.session.lastDescription) {
    await ctx.reply("Сначала сгенерируй описание через /start, потом можно будет опубликовать его.");
    return;
  }
  ctx.session.wbFlow = { step: "token" };
  await ctx.reply(
    "Чтобы опубликовать описание прямо в карточку на Wildberries, мне нужен твой API-токен.\n\n" +
    "Как получить: зайди в личный кабинет WB → Настройки → Доступ к API → создай токен " +
    "с правами на категорию «Контент».\n\n" +
    "Пришли токен сюда следующим сообщением."
  );
});
 
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;
 
  if (ctx.session.wbFlow) {
    if (ctx.session.wbFlow.step === "token") {
      ctx.session.wbFlow.token = text.trim();
      ctx.session.wbFlow.step = "nmId";
      await ctx.reply("Принято. Теперь пришли nmID карточки товара (номер, видно в личном кабинете рядом с товаром).");
      return;
    }
 
    if (ctx.session.wbFlow.step === "nmId") {
      const nmId = text.trim();
      const { token } = ctx.session.wbFlow;
      ctx.session.wbFlow = null;
 
      await ctx.reply("⏳ Обновляю карточку на Wildberries...");
      try {
        await updateWbCardDescription(token, nmId, ctx.session.lastDescription);
        await ctx.reply("✅ Готово! Описание обновлено прямо в карточке на Wildberries.");
      } catch (err) {
        console.error("Ошибка публикации на WB:", err.message);
        await ctx.reply(`❌ Не получилось обновить карточку: ${err.message}`);
      }
      return;
    }
  }
 
  if (ctx.session.step === null) {
    await ctx.reply("Чтобы начать, напиши команду /start — я задам несколько вопросов о товаре.");
    return;
  }
 
  const [key] = QUESTIONS[ctx.session.step];
  ctx.session.data[key] = text;
 
  const nextStep = ctx.session.step + 1;
 
  if (nextStep < QUESTIONS.length) {
    ctx.session.step = nextStep;
    await ctx.reply(QUESTIONS[nextStep][1]);
    return;
  }
 
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
      model: "dots-studio/dots-3-note-preview:free",
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
      ctx.session.lastDescription = responseText;
      await ctx.reply(toTelegramHtml(responseText), { parse_mode: "HTML" });
 
      const userUsage = getUserUsage(ctx.from.id);
      if (LIMITS_ENABLED && !userUsage.unlocked) {
        userUsage.used += 1;
        const left = Math.max(0, FREE_LIMIT - userUsage.used);
        await ctx.reply(
          `Готово! Осталось бесплатных описаний: ${left}. ` +
          "Чтобы составить описание для следующего товара — напиши /start"
        );
      } else {
        await ctx.reply("Готово! Чтобы составить описание для следующего товара — напиши /start. Чтобы опубликовать его на Wildberries — напиши /publish_wb");
      }
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
 
async function main() {
  console.log("Запускаем ИИ-бота...");
  await bot.start();
}
 
main();