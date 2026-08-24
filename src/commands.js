import { InputFile } from "grammy";
import { FREE_LIMIT, LIMITS_ENABLED, UNLOCK_CODE, QUESTIONS, BOT_TOKEN } from "./config.js";
import { getUserUsage } from "./usage.js";
import { toTelegramHtml } from "./format.js";
import { generateDescription } from "./ai.js";
import { updateWbCardDescription } from "./wb.js";
import { updateOzonProductDescription } from "./ozon.js";
import { buildInfographic } from "./infographic.js";

export function initialSession() {
  return { step: null, data: {}, lastDescription: null, wbFlow: null, infoFlow: null, ozonFlow: null };
}

// Регистрирует все команды и обработчики сообщений на переданном экземпляре бота
export function registerHandlers(bot) {
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

  bot.command("publish_ozon", async (ctx) => {
    if (!ctx.session.lastDescription) {
      await ctx.reply("Сначала сгенерируй описание через /start, потом можно будет опубликовать его.");
      return;
    }
    ctx.session.ozonFlow = { step: "clientId" };
    await ctx.reply(
      "Чтобы опубликовать описание прямо в карточку на Ozon, мне нужны твои данные API.\n\n" +
      "Как получить: зайди в личный кабинет Ozon → Настройки → Seller API → создай ключ.\n\n" +
      "Пришли сначала Client-Id следующим сообщением."
    );
  });

  bot.command("infographic", async (ctx) => {
    ctx.session.infoFlow = { step: "photo" };
    await ctx.reply(
      "🖼 Сделаю инфографику для карточки товара.\n\n" +
      "Пришли фото товара следующим сообщением (как фото, не как файл)."
    );
  });

  bot.on("message:photo", async (ctx) => {
    if (!ctx.session.infoFlow || ctx.session.infoFlow.step !== "photo") return;

    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();

      ctx.session.infoFlow.photoBuffer = Buffer.from(arrayBuffer);
      ctx.session.infoFlow.step = "title";
      await ctx.reply("Принято! Теперь пришли заголовок для картинки (например: название товара).");
    } catch (err) {
      console.error("Ошибка загрузки фото:", err.message);
      await ctx.reply("Не получилось загрузить фото, попробуй прислать ещё раз.");
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    // Диалог создания инфографики (команда /infographic)
    if (ctx.session.infoFlow) {
      const flow = ctx.session.infoFlow;

      if (flow.step === "photo") {
        await ctx.reply("Жду именно фото — пришли изображение товара.");
        return;
      }
      if (flow.step === "title") {
        flow.title = text.trim();
        flow.step = "bullets";
        await ctx.reply(
          "Теперь пришли 2-3 преимущества через запятую (например: " +
          "100% хлопок, для тренировок, 5 размеров)."
        );
        return;
      }
      if (flow.step === "bullets") {
        const bullets = text.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
        await ctx.reply("⏳ Собираю картинку...");
        try {
          const imageBuffer = await buildInfographic(flow.photoBuffer, flow.title, bullets);
          await ctx.replyWithPhoto(new InputFile(imageBuffer, "infographic.png"));
          await ctx.reply("✅ Готово! Чтобы сделать ещё одну — напиши /infographic");
        } catch (err) {
          console.error("Ошибка сборки инфографики:", err.message);
          await ctx.reply("❌ Не получилось собрать картинку: " + err.message);
        }
        ctx.session.infoFlow = null;
        return;
      }
    }

    // Диалог публикации на Ozon (команда /publish_ozon)
    if (ctx.session.ozonFlow) {
      const flow = ctx.session.ozonFlow;

      if (flow.step === "clientId") {
        flow.clientId = text.trim();
        flow.step = "apiKey";
        await ctx.reply("Принято. Теперь пришли Api-Key.");
        return;
      }
      if (flow.step === "apiKey") {
        flow.apiKey = text.trim();
        flow.step = "productId";
        await ctx.reply("Принято. Теперь пришли product_id товара (виден в личном кабинете рядом с товаром).");
        return;
      }
      if (flow.step === "productId") {
        const productId = text.trim();
        const { clientId, apiKey } = flow;
        ctx.session.ozonFlow = null;

        await ctx.reply("⏳ Обновляю карточку на Ozon...");
        try {
          await updateOzonProductDescription(clientId, apiKey, productId, ctx.session.lastDescription);
          await ctx.reply("✅ Готово! Описание обновлено прямо в карточке на Ozon.");
        } catch (err) {
          console.error("Ошибка публикации на Ozon:", err.message);
          await ctx.reply(`❌ Не получилось обновить карточку: ${err.message}`);
        }
        return;
      }
    }

    // Диалог публикации на Wildberries (команда /publish_wb)
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

    // Основная анкета из 4 вопросов (после /start)
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

    try {
      const responseText = await generateDescription(ctx.session.data);
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
          await ctx.reply(
            "Готово! Чтобы составить описание для следующего товара — напиши /start. " +
            "Чтобы опубликовать его на Wildberries — напиши /publish_wb, на Ozon — /publish_ozon"
          );
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
}
